let store = [];
let idCounter = 1;

class QueryMock {
  constructor(result) { this.result = result; }
  then(resolve, reject) { return Promise.resolve(this.result).then(resolve, reject); }
}

const matches = (doc, query) => Object.entries(query).every(([k, v]) => String(doc[k]) === String(v));

class FakeAIStudioAsset {
  constructor(fields = {}) {
    this._id = fields._id || `asset-${idCounter++}`;
    this.projectId = fields.projectId;
    this.userId = fields.userId;
    this.storagePath = fields.storagePath;
    this.fileName = fields.fileName;
    this.mimeType = fields.mimeType || 'application/octet-stream';
    this.size = fields.size || 0;
    this.createdAt = new Date();
  }

  async save() {
    if (!store.find((a) => a._id === this._id)) store.push(this);
    return this;
  }

  async deleteOne() {
    store = store.filter((a) => a._id !== this._id);
    return { deletedCount: 1 };
  }
}

FakeAIStudioAsset.create = async (fields) => {
  const a = new FakeAIStudioAsset(fields);
  await a.save();
  return a;
};
FakeAIStudioAsset.findOne = (query = {}) => new QueryMock(store.find((a) => matches(a, query)) || null);
FakeAIStudioAsset.find = (query = {}) => new QueryMock(store.filter((a) => matches(a, query)));
FakeAIStudioAsset.deleteMany = async (query = {}) => {
  const before = store.length;
  store = store.filter((a) => !matches(a, query));
  return { deletedCount: before - store.length };
};

FakeAIStudioAsset.__reset = () => { store = []; idCounter = 1; };
FakeAIStudioAsset.__all = () => store;

module.exports = FakeAIStudioAsset;
