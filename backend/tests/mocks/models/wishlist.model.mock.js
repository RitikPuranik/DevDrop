let store = [];
let idCounter = 1;

class DuplicateKeyError extends Error {
  constructor() {
    super('E11000 duplicate key error');
    this.code = 11000;
  }
}

class QueryMock {
  constructor(result) { this.result = result; }
  then(resolve, reject) { return Promise.resolve(this.result).then(resolve, reject); }
}

class FakeWishlist {
  constructor(fields = {}) {
    this._id = `wishlist-${idCounter++}`;
    this.userId = fields.userId;
    this.websiteId = fields.websiteId;
    this.addedAt = new Date();
  }

  async save() {
    const dup = store.find((w) => String(w.userId) === String(this.userId) && String(w.websiteId) === String(this.websiteId));
    if (dup) throw new DuplicateKeyError();
    store.push(this);
    return this;
  }
}

const matchesSimpleQuery = (doc, query = {}) => Object.entries(query).every(([k, v]) => {
  if (v && typeof v === 'object' && Array.isArray(v.$in)) return v.$in.some((item) => String(item) === String(doc[k]));
  return String(doc[k]) === String(v);
});

FakeWishlist.findOne = (query = {}) => {
  const result = store.find((w) => matchesSimpleQuery(w, query)) || null;
  return new QueryMock(result);
};

FakeWishlist.find = (query = {}) => new QueryMock(store.filter((w) => matchesSimpleQuery(w, query)));

FakeWishlist.findOneAndDelete = async (query = {}) => {
  const idx = store.findIndex((w) => Object.entries(query).every(([k, v]) => String(w[k]) === String(v)));
  if (idx === -1) return null;
  const [removed] = store.splice(idx, 1);
  return removed;
};

FakeWishlist.countDocuments = async (query = {}) => {
  return store.filter((w) => matchesSimpleQuery(w, query)).length;
};

FakeWishlist.__reset = () => { store = []; idCounter = 1; };
FakeWishlist.__all = () => store;
FakeWishlist.__seed = (fields) => {
  const w = new FakeWishlist(fields);
  store.push(w);
  return w;
};

module.exports = FakeWishlist;
