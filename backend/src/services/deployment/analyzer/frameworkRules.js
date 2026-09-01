const { DEPLOYMENT_PROVIDERS } = require('../../../shared/utils/constants');

const hasDep = (deps, name) => Boolean(deps && Object.prototype.hasOwnProperty.call(deps, name));

/**
 * Each rule inspects one candidate root's merged dependencies (+devDependencies)
 * and the set of file paths found directly under that root. The first rule
 * (in array order) that matches wins for that root — order matters, e.g.
 * NestJS must be checked before plain Express since Nest apps also depend
 * on express/fastify under the hood.
 *
 * To support a new framework, add a rule here — nothing in analyzer/index.js,
 * the orchestrator, or the provider layer needs to change as long as the
 * rule's `kind` maps to an existing provider ('vercel' handles frontend,
 * 'render' handles backend).
 */
const FRAMEWORK_RULES = [
  {
    id: 'nextjs',
    kind: 'frontend',
    provider: DEPLOYMENT_PROVIDERS.VERCEL,
    framework: 'Next.js',
    match: ({ deps, filesAtRoot }) =>
      hasDep(deps, 'next') || filesAtRoot.some((f) => /^next\.config\.(js|mjs|ts)$/.test(f)),
    resolve: ({ scripts }) => ({
      buildTool: 'Next.js',
      buildCommand: scripts.build ? 'npm run build' : 'next build',
      // Vercel builds Next.js natively — no static output directory to point at.
      outputDirectory: null,
      installCommand: 'npm install',
    }),
  },
  {
    id: 'react-vite',
    kind: 'frontend',
    provider: DEPLOYMENT_PROVIDERS.VERCEL,
    framework: 'React',
    match: ({ deps, filesAtRoot }) =>
      hasDep(deps, 'vite') && (hasDep(deps, 'react') || filesAtRoot.some((f) => /^vite\.config\.(js|ts|mjs)$/.test(f))),
    resolve: ({ scripts, viteConfigContent }) => {
      const outDirMatch = viteConfigContent && viteConfigContent.match(/outDir\s*:\s*['"]([^'"]+)['"]/);
      return {
        buildTool: 'Vite',
        buildCommand: scripts.build ? 'npm run build' : 'vite build',
        outputDirectory: outDirMatch ? outDirMatch[1] : 'dist',
        installCommand: 'npm install',
      };
    },
  },
  {
    id: 'vue-vite',
    kind: 'frontend',
    provider: DEPLOYMENT_PROVIDERS.VERCEL,
    framework: 'Vue',
    match: ({ deps, filesAtRoot }) =>
      hasDep(deps, 'vite') && hasDep(deps, 'vue') && !filesAtRoot.some((f) => /^next\.config\.(js|mjs|ts)$/.test(f)),
    resolve: ({ scripts, viteConfigContent }) => {
      const outDirMatch = viteConfigContent && viteConfigContent.match(/outDir\s*:\s*['"]([^'"]+)['"]/);
      return {
        buildTool: 'Vite',
        buildCommand: scripts.build ? 'npm run build' : 'vite build',
        outputDirectory: outDirMatch ? outDirMatch[1] : 'dist',
        installCommand: 'npm install',
      };
    },
  },
  {
    id: 'nestjs',
    kind: 'backend',
    provider: DEPLOYMENT_PROVIDERS.RENDER,
    framework: 'NestJS',
    match: ({ deps }) => hasDep(deps, '@nestjs/core'),
    resolve: ({ scripts }) => ({
      runtime: 'Node.js',
      buildCommand: scripts.build ? 'npm run build' : 'npm run build',
      startCommand: scripts['start:prod'] ? 'npm run start:prod' : scripts.start ? 'npm start' : 'node dist/main.js',
      installCommand: 'npm install',
    }),
  },
  {
    id: 'express',
    kind: 'backend',
    provider: DEPLOYMENT_PROVIDERS.RENDER,
    framework: 'Express',
    match: ({ deps }) => hasDep(deps, 'express'),
    resolve: ({ scripts, pkg, filesAtRoot }) => {
      const entry =
        scripts.start && scripts.start.trim()
          ? null // real npm start script — startCommand below just runs it
          : pkg.main || ['server.js', 'index.js', 'src/index.js', 'src/server.js'].find((f) => filesAtRoot.includes(f)) || 'server.js';
      return {
        runtime: 'Node.js',
        // Section 10's own example uses "npm install" as the backend build
        // command for a plain Express API with no compile step.
        buildCommand: scripts.build ? 'npm install && npm run build' : 'npm install',
        startCommand: scripts.start ? 'npm start' : `node ${entry}`,
        installCommand: 'npm install',
      };
    },
  },
];

/** Fallback for a root with no package.json at all but a static index.html —
 * common for plain HTML/CSS/JS marketplace templates. Kept separate from
 * FRAMEWORK_RULES since it doesn't key off package.json dependencies. */
const STATIC_SITE_RULE = {
  id: 'static-html',
  kind: 'frontend',
  provider: DEPLOYMENT_PROVIDERS.VERCEL,
  framework: 'Static HTML',
  resolve: () => ({
    buildTool: null,
    buildCommand: null,
    outputDirectory: '.',
    installCommand: null,
  }),
};

module.exports = { FRAMEWORK_RULES, STATIC_SITE_RULE };
