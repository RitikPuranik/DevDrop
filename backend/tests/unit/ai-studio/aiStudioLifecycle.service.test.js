jest.mock('../../../src/modules/ai-studio/aiStudioProject.model', () => require('../../mocks/models/aiStudioProject.model.mock'));
jest.mock('../../../src/modules/ai-studio/aiStudioAsset.model', () => require('../../mocks/models/aiStudioAsset.model.mock'));
jest.mock('../../../src/services/ai-studio/aiStudioStorage.service', () => require('../../mocks/services/aiStudioStorage.service.mock'));
jest.mock('../../../src/services/ai-studio/aiStudioZip.service', () => ({
  buildProjectZip: jest.fn(() => Buffer.from('zip-bytes')),
}));

const AIStudioProject = require('../../../src/modules/ai-studio/aiStudioProject.model');
const AIStudioAsset = require('../../../src/modules/ai-studio/aiStudioAsset.model');
const storage = require('../../../src/services/ai-studio/aiStudioStorage.service');

const { AI_STUDIO_PROJECT_STATUS } = AIStudioProject;

const THRESHOLD_MS = 20 * 60 * 1000;
process.env.AI_STUDIO_INACTIVITY_THRESHOLD_MS = String(THRESHOLD_MS);

// eslint-disable-next-line global-require
const lifecycle = require('../../../src/services/ai-studio/aiStudioLifecycle.service');

const USER_A = 'user-a';
const USER_B = 'user-b';

const minutesAgo = (mins) => new Date(Date.now() - mins * 60 * 1000);

beforeEach(() => {
  AIStudioProject.__reset();
  AIStudioAsset.__reset();
  jest.clearAllMocks();
});

describe('AI Studio project creation', () => {
  test('opening a session with no existing projectId creates a new project with a storage prefix', async () => {
    const project = await lifecycle.openSession({ userId: USER_A, sessionId: 'sess-1', websiteType: 'portfolio' });
    expect(project._id).toBeDefined();
    expect(project.status).toBe(AI_STUDIO_PROJECT_STATUS.ACTIVE);
    expect(project.storagePrefix).toBe(`ai-studio/${project._id}`);
    expect(project.sessions).toHaveLength(1);
    expect(project.sessions[0].sessionId).toBe('sess-1');
  });

  test('resuming with an existing owned projectId registers a new session instead of creating a second project', async () => {
    const created = await lifecycle.openSession({ userId: USER_A, sessionId: 'sess-1' });
    const resumed = await lifecycle.openSession({ userId: USER_A, sessionId: 'sess-2', projectId: created._id });
    expect(resumed._id).toBe(created._id);
    expect(AIStudioProject.__all()).toHaveLength(1);
    expect(resumed.sessions.map((s) => s.sessionId).sort()).toEqual(['sess-1', 'sess-2']);
  });
});

describe('ZIP persistence + updates', () => {
  test('syncing generated files uploads a zip and records the returned path', async () => {
    const project = await lifecycle.openSession({ userId: USER_A, sessionId: 'sess-1' });
    const updated = await lifecycle.syncGeneratedFiles({
      projectId: project._id,
      userId: USER_A,
      files: { 'App.jsx': 'export default () => null;' },
      dependencies: { react: '^18.0.0' },
      title: 'My Site',
    });
    expect(storage.uploadProjectZip).toHaveBeenCalledTimes(1);
    expect(updated.zipPath).toBe(`ai-studio/${project._id}/project.zip`);
    expect(updated.title).toBe('My Site');
  });

  test('a later sync with fewer files replaces the stored file map (deleted files do not persist)', async () => {
    const project = await lifecycle.openSession({ userId: USER_A, sessionId: 'sess-1' });
    await lifecycle.syncGeneratedFiles({
      projectId: project._id,
      userId: USER_A,
      files: { 'App.jsx': 'a', 'Hero.jsx': 'h' },
    });
    const second = await lifecycle.syncGeneratedFiles({
      projectId: project._id,
      userId: USER_A,
      files: { 'App.jsx': 'a', 'Footer.jsx': 'f' },
    });
    expect(second.files).toEqual({ 'App.jsx': 'a', 'Footer.jsx': 'f' });
    expect(second.files.Hero).toBeUndefined();
  });
});

describe('Activity + heartbeat', () => {
  test('a meaningful action updates lastActivityAt', async () => {
    const project = await lifecycle.openSession({ userId: USER_A, sessionId: 'sess-1' });
    project.lastActivityAt = minutesAgo(50);
    await project.save();
    const updated = await lifecycle.recordActivity({ projectId: project._id, userId: USER_A });
    expect(Date.now() - updated.lastActivityAt.getTime()).toBeLessThan(5000);
  });

  test('heartbeat updates the matching session and project timestamps', async () => {
    const project = await lifecycle.openSession({ userId: USER_A, sessionId: 'sess-1' });
    project.lastHeartbeatAt = minutesAgo(50);
    await project.save();
    const updated = await lifecycle.heartbeat({ projectId: project._id, userId: USER_A, sessionId: 'sess-1' });
    expect(Date.now() - updated.lastHeartbeatAt.getTime()).toBeLessThan(5000);
  });
});

describe('Active project protection', () => {
  test('a project with recent activity is not cleaned up', async () => {
    const project = await lifecycle.openSession({ userId: USER_A, sessionId: 'sess-1' });
    // Recent activity + recent heartbeat -> definitely not abandoned.
    const result = await lifecycle.cleanupProject(project._id);
    expect(result.skipped).toBe(true);
    expect(storage.deleteProjectStorage).not.toHaveBeenCalled();
    const stillThere = await AIStudioProject.findById(project._id);
    expect(stillThere).not.toBeNull();
  });

  test('a project re-checked immediately before deletion is spared if activity resumed', async () => {
    const project = await lifecycle.openSession({ userId: USER_A, sessionId: 'sess-1' });
    project.lastActivityAt = minutesAgo(60);
    project.lastHeartbeatAt = minutesAgo(60);
    project.sessions = [{ sessionId: 'sess-1', lastHeartbeatAt: minutesAgo(60) }];
    project.status = AI_STUDIO_PROJECT_STATUS.INACTIVE;
    await project.save();

    // User comes back and generates something right before the cleanup runs.
    await lifecycle.recordActivity({ projectId: project._id, userId: USER_A });

    const result = await lifecycle.cleanupProject(project._id);
    expect(result.skipped).toBe(true);
    expect(storage.deleteProjectStorage).not.toHaveBeenCalled();
  });
});

describe('Inactive project cleanup', () => {
  test('an abandoned project has its zip, assets and records deleted', async () => {
    const project = await lifecycle.openSession({ userId: USER_A, sessionId: 'sess-1' });
    project.lastActivityAt = minutesAgo(60);
    project.lastHeartbeatAt = minutesAgo(60);
    project.sessions = [{ sessionId: 'sess-1', lastHeartbeatAt: minutesAgo(60) }];
    await project.save();
    await AIStudioAsset.create({ projectId: project._id, userId: USER_A, storagePath: 'x', fileName: 'x.png' });

    const result = await lifecycle.cleanupProject(project._id);

    expect(result.deleted).toBe(true);
    expect(storage.deleteProjectStorage).toHaveBeenCalledWith(project._id);
    expect(AIStudioAsset.__all().filter((a) => String(a.projectId) === String(project._id))).toHaveLength(0);
    expect(await AIStudioProject.findById(project._id)).toBeNull();
  });

  test('createdAt being old does not matter — only lastActivityAt controls cleanup', async () => {
    const project = await lifecycle.openSession({ userId: USER_A, sessionId: 'sess-1' });
    project.createdAt = minutesAgo(500); // created hours ago
    project.lastActivityAt = new Date(); // but active right now
    project.lastHeartbeatAt = new Date();
    await project.save();

    expect(lifecycle.isAbandoned(project)).toBe(false);
  });
});

describe('Supabase deletion failure handling', () => {
  test('a failed storage deletion keeps the project recoverable for retry', async () => {
    storage.deleteProjectStorage.mockRejectedValueOnce(new Error('Supabase is down'));
    const project = await lifecycle.openSession({ userId: USER_A, sessionId: 'sess-1' });
    project.lastActivityAt = minutesAgo(60);
    project.lastHeartbeatAt = minutesAgo(60);
    project.sessions = [{ sessionId: 'sess-1', lastHeartbeatAt: minutesAgo(60) }];
    await project.save();

    const firstAttempt = await lifecycle.cleanupProject(project._id);
    expect(firstAttempt.deleted).toBe(false);
    expect(firstAttempt.error).toMatch(/Supabase is down/);

    const stillThere = await AIStudioProject.findById(project._id);
    expect(stillThere).not.toBeNull();
    expect(stillThere.status).toBe(AI_STUDIO_PROJECT_STATUS.CLEANING);
    expect(stillThere.storagePrefix).toBe(`ai-studio/${project._id}`); // not lost

    // Retry succeeds now that Supabase is back (default mock resolves).
    const secondAttempt = await lifecycle.cleanupProject(project._id);
    expect(secondAttempt.deleted).toBe(true);
    expect(await AIStudioProject.findById(project._id)).toBeNull();
  });
});

describe('Authorization', () => {
  test("user A cannot access user B's project", async () => {
    const projectA = await lifecycle.openSession({ userId: USER_A, sessionId: 'sess-1' });
    const asUserB = await lifecycle.getOwnedProject(projectA._id, USER_B);
    expect(asUserB).toBeNull();

    const heartbeatAsB = await lifecycle.heartbeat({ projectId: projectA._id, userId: USER_B, sessionId: 'sess-1' });
    expect(heartbeatAsB).toBeNull();
  });
});

describe('Multiple tabs', () => {
  test('one tab closing does not kill the project while another tab is still heartbeating', async () => {
    const project = await lifecycle.openSession({ userId: USER_A, sessionId: 'tab-a' });
    await lifecycle.openSession({ userId: USER_A, sessionId: 'tab-b', projectId: project._id });

    // tab-a goes stale/closes, tab-b is still alive.
    const stored = await AIStudioProject.findById(project._id);
    stored.sessions = stored.sessions.map((s) => (s.sessionId === 'tab-a' ? { ...s, lastHeartbeatAt: minutesAgo(60) } : s));
    stored.lastActivityAt = minutesAgo(60); // no recent project-level activity either
    await stored.save();
    await lifecycle.heartbeat({ projectId: project._id, userId: USER_A, sessionId: 'tab-b' });

    expect(lifecycle.isAbandoned(await AIStudioProject.findById(project._id))).toBe(false);
  });
});
