let store = [];
let idCounter = 1;

const AI_STUDIO_PROJECT_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  CLEANING: 'CLEANING',
  DELETED: 'DELETED',
};

class QueryMock {
  constructor(result) { this.result = result; }
  then(resolve, reject) { return Promise.resolve(this.result).then(resolve, reject); }
}

const matches = (doc, query) => {
  return Object.entries(query).every(([key, value]) => {
    if (value && typeof value === 'object' && '$in' in value) {
      return value.$in.includes(doc[key]);
    }
    return String(doc[key]) === String(value);
  });
};

class FakeAIStudioProject {
  constructor(fields = {}) {
    this._id = fields._id || `project-${idCounter++}`;
    this.userId = fields.userId;
    this.sessionId = fields.sessionId;
    this.sessions = fields.sessions || [];
    this.title = fields.title || null;
    this.websiteType = fields.websiteType || 'portfolio';
    this.storagePrefix = fields.storagePrefix;
    this.zipPath = fields.zipPath || null;
    this.files = fields.files || {};
    this.dependencies = fields.dependencies || {};
    this.status = fields.status || AI_STUDIO_PROJECT_STATUS.ACTIVE;
    this.lastActivityAt = fields.lastActivityAt || new Date();
    this.lastHeartbeatAt = fields.lastHeartbeatAt || new Date();
    this.lastVisibleAt = fields.lastVisibleAt || new Date();
    this.cleanupAttempts = fields.cleanupAttempts || 0;
    this.lastCleanupError = fields.lastCleanupError || null;
    this.createdAt = fields.createdAt || new Date();
  }

  touchActivity(at = new Date()) {
    this.lastActivityAt = at;
    this.lastHeartbeatAt = at;
    if (this.status === AI_STUDIO_PROJECT_STATUS.INACTIVE) this.status = AI_STUDIO_PROJECT_STATUS.ACTIVE;
  }

  async save() {
    if (!store.find((p) => p._id === this._id)) store.push(this);
    return this;
  }

  async deleteOne() {
    store = store.filter((p) => p._id !== this._id);
    return { deletedCount: 1 };
  }
}

FakeAIStudioProject.findOne = (query = {}) => new QueryMock(store.find((p) => matches(p, query)) || null);
FakeAIStudioProject.findById = (id) => new QueryMock(store.find((p) => String(p._id) === String(id)) || null);
FakeAIStudioProject.find = (query = {}) => new QueryMock(store.filter((p) => matches(p, query)));
FakeAIStudioProject.deleteOne = async (query = {}) => {
  const before = store.length;
  store = store.filter((p) => !matches(p, query));
  return { deletedCount: before - store.length };
};
FakeAIStudioProject.deleteMany = async (query = {}) => {
  const before = store.length;
  store = store.filter((p) => !matches(p, query));
  return { deletedCount: before - store.length };
};
FakeAIStudioProject.create = async (fields) => {
  const p = new FakeAIStudioProject(fields);
  await p.save();
  return p;
};

FakeAIStudioProject.__reset = () => { store = []; idCounter = 1; };
FakeAIStudioProject.__all = () => store;
FakeAIStudioProject.AI_STUDIO_PROJECT_STATUS = AI_STUDIO_PROJECT_STATUS;

module.exports = FakeAIStudioProject;
