const Deployment = require('../deployment/deployment.model');
const DeploymentProviderConnection = require('../deployment/deploymentProviderConnection.model');
const GithubConnection = require('../github/githubConnection.model');
const KashiFixRun = require('./kashiFixRun.model');
const githubService = require('../../services/github.service');
const vercel = require('../../services/deployment/providers/vercel.provider');
const cryptoUtil = require('../../shared/utils/crypto');
const aiClient = require('./kashiAiClient');
const { DEPLOYMENT_STATUS, DEPLOYMENT_ACTIVE_STATUSES, DEPLOYMENT_PROVIDERS } = require('../../shared/utils/constants');
const { dispatchTask } = require('../../services/worker.client');

/**
 * Kashi's deployment doctor.
 *
 *   loop (up to KASHI_FIX_MAX_ROUNDS):
 *     wait for the Vercel deployment to finish
 *       READY  -> done
 *       ERROR  -> read build log -> pick the files it names -> Kashi (Groq
 *                 edit model) proposes a MINIMAL fix -> commit to the repo ->
 *                 trigger/find the new Vercel deployment -> loop
 *
 * Kashi only ever changes what the build error requires: the ai-service
 * enforces exact find/replace edits with a small diff cap (see
 * ai-service/src/kashi/kashi.fix.js), and this service only hands it files
 * the log actually points at.
 */

const num = (key, fallback) => {
  const v = Number.parseInt(process.env[key], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const MAX_ROUNDS = () => num('KASHI_FIX_MAX_ROUNDS', 6);
const POLL_MS = () => num('KASHI_BUILD_POLL_MS', 5000);
const BUILD_TIMEOUT_MS = () => num('KASHI_BUILD_TIMEOUT_MS', 15 * 60 * 1000);
const AUTO_DEPLOY_WAIT_MS = () => num('KASHI_AUTO_DEPLOY_WAIT_MS', 25000);
const STALE_RUN_MS = 45 * 60 * 1000;
const MAX_FILE_BYTES = 200 * 1024;
const MAX_CONTEXT_FILES = 8;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FILE_EXT = '(?:jsx?|tsx?|mjs|cjs|css|scss|sass|less|json|vue|svelte|html|astro|mdx?)';
const PATH_RE = new RegExp(`((?:[\\w@.\\-]+/)*[\\w@.\\-]+\\.${FILE_EXT})(?::\\d+(?::\\d+)?)?`, 'g');
// Bare-package failures (not relative './x' imports, which are source-file problems).
const DEPENDENCY_ERROR_RE = /(?:Cannot find module|Can't resolve|Could not resolve|Failed to resolve import|Rollup failed to resolve import)\s+['"`](?!\.{1,2}\/|\/|@\/|~\/)|ERESOLVE|npm ERR!|ERR_PNPM|Cannot find package|is not exported by|does not provide an export/i;
const SKIP_PATH_RE = /(^|\/)(node_modules|\.git|dist|build|\.next|\.vercel)\//;

class RunCancelled extends Error {}

// ---------------------------------------------------------------- run log

async function addStep(runId, step, onProgress = null) {
  const record = { at: new Date(), ...step };
  await KashiFixRun.updateOne({ _id: runId }, { $push: { steps: { $each: [record], $slice: -120 } } });
  if (typeof onProgress === 'function') {
    await onProgress({ type: 'step', runId: String(runId), step: record });
  }
}

async function finish(runId, status, resultMessage, extra = {}, onProgress = null) {
  const finishedAt = new Date();
  await KashiFixRun.updateOne({ _id: runId }, { status, resultMessage, finishedAt, ...extra });
  await addStep(runId, { kind: status === 'succeeded' ? 'success' : 'error', message: resultMessage }, onProgress);
  if (typeof onProgress === 'function') {
    await onProgress({
      type: 'status',
      runId: String(runId),
      status,
      resultMessage,
      finalUrl: extra.finalUrl || null,
      needsRedeploy: Boolean(extra.needsRedeploy),
      finishedAt,
    });
  }
}

async function assertNotCancelled(runId) {
  const run = await KashiFixRun.findById(runId).select('status');
  if (!run || run.status === 'cancelled') throw new RunCancelled();
}

// ------------------------------------------------------- file selection

/** Pure helper (exported for tests): files in the repo tree that the build log mentions. */
function pickFilesFromLog(log, treePaths, { max = MAX_CONTEXT_FILES } = {}) {
  const paths = treePaths.filter((p) => !SKIP_PATH_RE.test(p));
  const byLength = [...paths].sort((a, b) => a.length - b.length);
  const picked = [];
  const add = (p) => {
    if (p && !picked.includes(p) && picked.length < max) picked.push(p);
  };

  const seen = new Set();
  for (const match of String(log || '').matchAll(PATH_RE)) {
    let token = match[1].replace(/^\.\//, '').replace(/^\/?vercel\/path\d+\//, '').replace(/^\/+/, '');
    if (!token || seen.has(token)) continue;
    seen.add(token);
    // exact, or the repo path ends with the token (log is relative to Vercel's root directory)
    const hit = byLength.find((p) => p === token || p.endsWith(`/${token}`));
    add(hit);
  }

  if (DEPENDENCY_ERROR_RE.test(log || '') || picked.length === 0) {
    // closest package.json files (shallowest first) — usually the frontend root
    byLength.filter((p) => /(^|\/)package\.json$/.test(p)).slice(0, 2).forEach(add);
  }
  return picked;
}

async function loadFiles(ctx, paths, ref) {
  const out = [];
  for (const path of paths) {
    const meta = ctx.tree.find((t) => t.path === path);
    if (meta?.size && meta.size > MAX_FILE_BYTES) continue;
    const content = await githubService.getFileContent(ctx.githubToken, ctx.owner, ctx.repo, path, ref);
    if (typeof content === 'string') out.push({ path, content });
  }
  return out;
}

// -------------------------------------------------------------- context

async function buildContext(deployment) {
  const vercelConn = await DeploymentProviderConnection.findOne({ userId: deployment.userId, provider: DEPLOYMENT_PROVIDERS.VERCEL }).select('+credentialEncrypted');
  if (!vercelConn) throw Object.assign(new Error('Connect your Vercel account first.'), { userMessage: 'Connect your Vercel account first.', statusCode: 400 });
  const ghConn = await GithubConnection.findOne({ userId: deployment.userId }).select('+accessTokenEncrypted');
  if (!ghConn) throw Object.assign(new Error('Connect your GitHub account first.'), { userMessage: 'Connect your GitHub account first.', statusCode: 400 });

  return {
    vercelToken: cryptoUtil.decrypt(vercelConn.credentialEncrypted),
    vercelMeta: vercelConn.metadata || {},
    githubToken: cryptoUtil.decrypt(ghConn.accessTokenEncrypted),
    owner: deployment.repository.owner,
    repo: deployment.repository.name,
    branch: deployment.repository.defaultBranch || 'main',
    projectId: deployment.vercel.projectId,
    tree: [],
  };
}

async function waitForTerminal(ctx, deployId, runId) {
  const deadline = Date.now() + BUILD_TIMEOUT_MS();
  while (Date.now() < deadline) {
    await assertNotCancelled(runId);
    let status;
    try {
      status = await vercel.getDeploymentStatus(ctx.vercelToken, ctx.vercelMeta, deployId);
    } catch (error) {
      // transient Vercel API hiccup — keep polling until the deadline
      await sleep(POLL_MS());
      continue;
    }
    if (status.isTerminal) return status;
    await sleep(POLL_MS());
  }
  throw new Error('Timed out waiting for the Vercel build to finish.');
}

/** Latest production deployment for the project (so a SUCCESS record whose newer push failed still works). */
async function resolveStartingDeployment(ctx, deployment) {
  try {
    const list = await vercel.listProjectDeployments(ctx.vercelToken, ctx.vercelMeta, ctx.projectId, 10);
    const latest = list.find((d) => d.target === 'production') || list[0];
    if (latest?.id) return latest.id;
  } catch {
    /* fall back to the stored id */
  }
  return deployment.vercel.deploymentId;
}

/** After pushing a commit: adopt Vercel's own git-triggered deployment if it appears, otherwise trigger one. */
async function nextDeploymentAfterPush(ctx, sha, pushedAt, runId) {
  const deadline = Date.now() + AUTO_DEPLOY_WAIT_MS();
  while (Date.now() < deadline) {
    await assertNotCancelled(runId);
    try {
      const list = await vercel.listProjectDeployments(ctx.vercelToken, ctx.vercelMeta, ctx.projectId, 10);
      const hit = list.find((d) => (d.commitSha && d.commitSha === sha) || (d.createdAt && d.createdAt >= pushedAt - 2000 && d.target === 'production'));
      if (hit) return hit.id;
    } catch {
      /* ignore and retry */
    }
    await sleep(Math.min(4000, POLL_MS()));
  }
  const { repoId, projectName } = await vercel.getProjectRepoId(ctx.vercelToken, ctx.vercelMeta, ctx.projectId);
  const triggered = await vercel.deploy(ctx.vercelToken, ctx.vercelMeta, { projectId: ctx.projectId, projectName, repoId }, { branch: ctx.branch });
  return triggered.deployId;
}

// ------------------------------------------------- runtime verification

const ENTRY_CANDIDATES = [
  'src/main.jsx', 'src/main.tsx', 'src/main.js', 'src/main.ts', 'src/index.jsx', 'src/index.tsx', 'src/index.js',
  'main.jsx', 'main.js', 'index.js', 'src/App.jsx', 'src/App.tsx', 'src/App.js', 'App.js', 'index.html',
];

/**
 * Pure helper (exported for tests): which repo files to show Kashi for a
 * RUNTIME failure. Browser errors from a minified bundle rarely name source
 * files, so we use: files the report names, components/identifiers it
 * mentions, then the app entry points, then package.json.
 */
function pickFilesForRuntime(report, treePaths, { max = MAX_CONTEXT_FILES } = {}) {
  const paths = treePaths.filter((p) => !SKIP_PATH_RE.test(p));
  const picked = [];
  const add = (p) => { if (p && !picked.includes(p) && picked.length < max) picked.push(p); };

  for (const p of pickFilesFromLog(report, paths, { max: 4 })) if (!/package\.json$/.test(p)) add(p);

  const idents = new Set();
  for (const m of String(report || '').matchAll(/<([A-Z][A-Za-z0-9]+)>|\bat ([A-Z][A-Za-z0-9]+)\b|\b([A-Z][A-Za-z0-9]+) is not (?:defined|a function|a constructor)\b|\b(use[A-Z][A-Za-z0-9]+)\b/g)) {
    const id = m[1] || m[2] || m[3] || m[4];
    if (id) idents.add(id);
  }
  for (const id of idents) {
    const hit = paths.find((p) => new RegExp(`(^|/)${id}\\.(jsx?|tsx?)$`).test(p));
    add(hit);
  }

  for (const candidate of ENTRY_CANDIDATES) add(paths.find((p) => p === candidate));
  add(paths.filter((p) => /(^|\/)package\.json$/.test(p)).sort((a, b) => a.length - b.length)[0]);
  return picked;
}

/** Chooses a URL that is publicly reachable: a production alias beats the (possibly protected) unique deployment URL. */
function pickCheckUrl(status) {
  const alias = (status.aliases || []).find((a) => /\.vercel\.app$/i.test(a)) || (status.aliases || [])[0];
  return alias ? `https://${alias}` : status.url;
}

/** Opens the deployed site in a real browser. Never blocks the run if the checker itself is unavailable. */
async function verifyRuntime(status, runId, onProgress = null) {
  if (String(process.env.KASHI_RUNTIME_CHECK || 'on').toLowerCase() === 'off') return { ok: true, skipped: true, reason: 'disabled' };
  const url = pickCheckUrl(status);
  if (!url) return { ok: true, skipped: true, reason: 'no URL' };
  await addStep(runId, { kind: 'info', message: 'Build is READY. Opening the live site in a browser to make sure it actually renders…' }, onProgress);
  const settleMs = Number.parseInt(process.env.KASHI_RUNTIME_SETTLE_MS ?? '3000', 10);
  if (settleMs > 0) await sleep(settleMs); // let the new deployment's alias/CDN settle
  try {
    return await aiClient.runtimeCheck(url);
  } catch (error) {
    return { ok: true, skipped: true, reason: error?.userMessage || error?.message || 'checker unavailable' };
  }
}

const formatRuntimeReport = (rt) => `BROWSER REPORT (the live site was opened in a headless browser after a successful Vercel build):\n- ${(rt.errors || []).join('\n- ')}`;

// ----------------------------------------------------------- main loop

async function runLoop(runId, { onProgress = null } = {}) {
  const run = await KashiFixRun.findById(runId);
  if (!run) return;
  const deployment = await Deployment.findById(run.deploymentId);
  try {
    if (!deployment) throw new Error('Deployment not found.');
    run.status = 'running';
    await run.save();

    const ctx = await buildContext(deployment);
    let deployId = await resolveStartingDeployment(ctx, deployment);
    if (!deployId) throw new Error('No Vercel deployment was found for this project.');
    const attempts = [];

    for (let round = 1; round <= run.maxRounds; round += 1) {
      await KashiFixRun.updateOne({ _id: runId }, { round });
      await addStep(runId, { round, kind: 'info', message: round === 1 ? 'Checking the Vercel build…' : `Rebuilding after fix #${round - 1}…` }, onProgress);

      const status = await waitForTerminal(ctx, deployId, runId);

      let log = '';
      let mode = 'build';
      let verified = false;

      if (status.isSuccess) {
        // READY only means the bundle compiled. Load the page: a black screen with console errors is still a failure.
        const rt = await verifyRuntime(status, runId, onProgress);
        if (rt.ok) {
          if (rt.skipped) await addStep(runId, { round, kind: 'info', message: `Could not verify the page in a browser (${rt.reason || 'skipped'}).` }, onProgress);
          await onSuccess(run, deployment, deployId, status.url, attempts.length, { verified: !rt.skipped, onProgress });
          return;
        }
        if (rt.kind === 'env') {
          await finish(runId, 'cannot_fix', rt.hint || 'The site crashes in the browser because an environment variable is missing.', {}, onProgress);
          return;
        }
        mode = 'runtime';
        log = formatRuntimeReport(rt);
        await addStep(runId, { round, kind: 'info', message: `The build is READY but the page is broken in the browser: ${(rt.errors || [])[0] || 'unknown error'}` }, onProgress);
      } else if (status.state === 'CANCELED') {
        await finish(runId, 'failed', 'The Vercel deployment was cancelled, so there is nothing to fix.', {}, onProgress);
        return;
      } else {
        // ERROR -> diagnose
        try {
          log = await vercel.getBuildLogs(ctx.vercelToken, ctx.vercelMeta, deployId);
        } catch {
          /* fall through to errorMessage */
        }
        if (!log.trim()) {
          try {
            const info = await vercel.getDeploymentError(ctx.vercelToken, ctx.vercelMeta, deployId);
            log = [info.errorCode, info.errorMessage].filter(Boolean).join(': ');
          } catch {
            /* leave empty -> reported below */
          }
        }
        if (!log.trim()) {
          await finish(runId, 'failed', 'Vercel did not return a build log for the failed deployment.', {}, onProgress);
          return;
        }
        await addStep(runId, { round, kind: 'info', message: 'Build failed. Reading the error and the files it points to…' }, onProgress);
      }

      ctx.tree = await githubService.getRepoTree(ctx.githubToken, ctx.owner, ctx.repo, ctx.branch);
      const repoPaths = ctx.tree.filter((t) => t.type === 'blob' && !SKIP_PATH_RE.test(t.path)).map((t) => t.path);
      let files = await loadFiles(ctx, mode === 'runtime' ? pickFilesForRuntime(log, repoPaths) : pickFilesFromLog(log, repoPaths), ctx.branch);

      let result = null;
      for (let ask = 0; ask < 3; ask += 1) {
        await assertNotCancelled(runId);
        result = await aiClient.proposeFix({ errorLog: log, files, repoPaths, previousAttempts: [...attempts], mode });
        if (result?.status !== 'need_files') break;
        const more = await loadFiles(ctx, result.paths, ctx.branch);
        if (!more.length) break;
        files = [...files, ...more.filter((f) => !files.some((x) => x.path === f.path))];
      }

      if (!result || result.status === 'need_files' || result.status === 'invalid') {
        await finish(runId, 'failed', `Kashi could not produce a safe, minimal fix: ${result?.reason || 'no usable answer'}.`, {}, onProgress);
        return;
      }
      if (result.status === 'cannot_fix') {
        await finish(runId, 'cannot_fix', `This one isn't fixable by changing code: ${result.reason}`, {}, onProgress);
        return;
      }

      const changed = result.files.map((f) => f.path);
      await addStep(runId, { round, kind: 'fix', message: `Fix: ${result.summary} (${result.changedLines} line${result.changedLines === 1 ? '' : 's'} in ${changed.join(', ')})`, files: changed }, onProgress);

      const pushedAt = Date.now();
      let sha;
      try {
        sha = await githubService.commitFilesToBranch(ctx.githubToken, ctx.owner, ctx.repo, ctx.branch, {
          message: `fix(${mode === 'runtime' ? 'runtime' : 'build'}): ${result.summary}\n\nAutomated minimal fix by Kashi for a ${mode === 'runtime' ? 'site that built but rendered a blank page' : 'failing Vercel build'}.`,
          files: result.files.map((f) => ({ path: f.path, content: f.content })),
        });
      } catch (error) {
        const reason = error?.response?.status === 422 ? 'the branch changed while Kashi was working' : error?.response?.data?.message || error.message;
        await finish(runId, 'failed', `Could not push the fix to GitHub: ${reason}.`, {}, onProgress);
        return;
      }
      await KashiFixRun.updateOne({ _id: runId }, { $push: { commits: sha } });
      await addStep(runId, { round, kind: 'fix', message: `Pushed commit ${sha.slice(0, 7)} to ${ctx.branch}. Waiting for Vercel…`, commitSha: sha }, onProgress);
      attempts.push({ summary: result.summary, paths: changed });

      deployId = await nextDeploymentAfterPush(ctx, sha, pushedAt, runId);
    }

    // Out of rounds: the last pushed fix may still have worked, so check once more.
    const last = await waitForTerminal(ctx, deployId, runId);
    if (last.isSuccess) {
      const rt = await verifyRuntime(last, runId, onProgress);
      if (rt.ok) {
        await onSuccess(run, deployment, deployId, last.url, attempts.length, { verified: !rt.skipped, onProgress });
        return;
      }
      await finish(runId, 'failed', `The build is READY but the page still errors in the browser after ${run.maxRounds} fix attempts: ${(rt.errors || [])[0] || 'unknown error'}`, {}, onProgress);
      return;
    }
    await finish(runId, 'failed', `Still failing after ${run.maxRounds} fix attempts. The commits Kashi pushed are in your repository history; check the latest build log.`, {}, onProgress);
  } catch (error) {
    if (error instanceof RunCancelled) {
      await KashiFixRun.updateOne({ _id: runId }, { status: 'cancelled', finishedAt: new Date() });
      await addStep(runId, { kind: 'info', message: 'Stopped.' }, onProgress);
      if (typeof onProgress === 'function') await onProgress({ type: 'status', runId: String(runId), status: 'cancelled', resultMessage: 'Stopped.', finishedAt: new Date() });
      return;
    }
    console.error(`[Kashi] fix run ${runId} crashed:`, error?.message);
    await finish(runId, 'failed', error?.userMessage || error?.message || 'Kashi hit an unexpected error.', {}, onProgress).catch(() => {});
  }
}

async function onSuccess(run, deployment, deployId, url, fixCount, { verified = false, onProgress = null } = {}) {
  const frontendOnly = !deployment.backendProvider;
  const update = { 'vercel.deploymentId': deployId, lastDeployedAt: new Date() };
  if (url) update['vercel.url'] = url;
  if (frontendOnly) Object.assign(update, { status: DEPLOYMENT_STATUS.SUCCESS, $unset: { errorMessage: 1, errorStep: 1 } });
  await Deployment.updateOne({ _id: deployment._id }, update);

  const check = verified ? ' It was opened in a browser and renders without errors.' : '';
  const msg = fixCount === 0 ? `The latest Vercel build is READY — nothing to fix.${check}` : `Fixed in ${fixCount} attempt${fixCount === 1 ? '' : 's'}. Your site is live.${check}`;
  await finish(run._id, 'succeeded', msg, { finalUrl: url || undefined, needsRedeploy: !frontendOnly && deployment.status !== DEPLOYMENT_STATUS.SUCCESS }, onProgress);
}

// ------------------------------------------------------------ public API

async function startFixRun({ userId, deploymentId }) {
  const deployment = await Deployment.findOne({ _id: deploymentId, userId });
  if (!deployment) throw Object.assign(new Error('not found'), { userMessage: 'Deployment not found.', statusCode: 404 });
  if (DEPLOYMENT_ACTIVE_STATUSES.includes(deployment.status)) {
    throw Object.assign(new Error('active'), { userMessage: 'This deployment is still in progress. Let it finish first.', statusCode: 409 });
  }
  if (!deployment.vercel?.projectId || !deployment.repository?.owner || !deployment.repository?.name) {
    throw Object.assign(new Error('no vercel'), { userMessage: 'Kashi can only fix deployments that were created on Vercel from a GitHub repository.', statusCode: 400 });
  }

  const active = await KashiFixRun.findOne({ deploymentId, status: { $in: ['queued', 'running'] }, updatedAt: { $gt: new Date(Date.now() - STALE_RUN_MS) } });
  if (active) return { run: active, alreadyRunning: true };

  const run = await KashiFixRun.create({ userId, deploymentId, maxRounds: MAX_ROUNDS(), steps: [{ kind: 'info', message: 'Kashi is on it.' }] });
  const workerEnabled = String(process.env.KASHI_USE_WORKER ?? 'true').toLowerCase() !== 'false';
  const workerConfigured = Boolean(process.env.WORKER_URL && process.env.INTERNAL_WEBHOOK_SECRET);

  if (workerEnabled && workerConfigured) {
    try {
      await dispatchTask('KASHI_FIX', { runId: String(run._id) });
    } catch (error) {
      await finish(run._id, 'failed', `Could not start the Kashi Worker: ${error.message}`).catch(() => {});
      throw Object.assign(new Error('Kashi Worker unavailable.'), { userMessage: 'Kashi Worker is unavailable. Start the Worker and try again.', statusCode: 503 });
    }
  } else {
    // Development fallback when no Worker is configured. Production should use the Worker.
    setImmediate(() => runLoop(run._id).catch((e) => console.error('[Kashi] unhandled:', e)));
  }
  return { run, alreadyRunning: false };
}

async function cancelRun({ userId, runId }) {
  const run = await KashiFixRun.findOneAndUpdate({ _id: runId, userId, status: { $in: ['queued', 'running'] } }, { status: 'cancelled', finishedAt: new Date() }, { new: true });
  return run;
}

const serializeRun = (run) => ({
  id: String(run._id),
  deploymentId: String(run.deploymentId),
  status: run.status,
  round: run.round,
  maxRounds: run.maxRounds,
  steps: run.steps,
  commits: run.commits,
  finalUrl: run.finalUrl || null,
  resultMessage: run.resultMessage || null,
  needsRedeploy: Boolean(run.needsRedeploy),
  createdAt: run.createdAt,
  finishedAt: run.finishedAt || null,
});

module.exports = { startFixRun, cancelRun, serializeRun, pickFilesFromLog, pickFilesForRuntime, pickCheckUrl, runLoop };
