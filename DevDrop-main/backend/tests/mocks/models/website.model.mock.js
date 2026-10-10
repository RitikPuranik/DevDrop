let store = [];
let idCounter = 1;

// Minimal query-condition matcher covering the operators actually used by
// DevDrop's website queries ($in, $ne, $gte, $lte, $or, plain equality).
// This is intentionally not a full Mongo query engine — just enough to
// drive the real controller logic against an in-memory array.
const matchesCondition = (value, condition) => {
  if (condition && typeof condition === 'object' && !Array.isArray(condition)) {
    return Object.entries(condition).every(([op, opVal]) => {
      switch (op) {
        case '$in': return opVal.some((v) => String(v) === String(value));
        case '$ne': return String(value) !== String(opVal);
        case '$gte': return value >= opVal;
        case '$lte': return value <= opVal;
        case '$eq': return String(value) === String(opVal);
        default: return true;
      }
    });
  }
  return String(value) === String(condition);
};

const matchesQuery = (doc, query = {}) => Object.entries(query).every(([key, condition]) => {
  if (key === '$or') return condition.some((sub) => matchesQuery(doc, sub));
  if (key === '$text') return true; // full-text search isn't modeled; searchWebsites tests seed pre-filtered data
  return matchesCondition(doc[key], condition);
});

class FindQueryMock {
  constructor(initial) {
    this._result = initial;
  }
  select() { return this; }
  populate() { return this; }
  lean() { return this; }
  sort(sortObj) {
    if (sortObj) {
      const [key, dir] = Object.entries(sortObj)[0] || [];
      if (key && key !== 'score') {
        this._result = [...this._result].sort((a, b) => {
          const cmp = a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0;
          return dir === -1 ? -cmp : cmp;
        });
      }
    }
    return this;
  }
  skip(n) { this._result = this._result.slice(n || 0); return this; }
  limit(n) { if (n !== undefined) this._result = this._result.slice(0, n); return this; }
  then(resolve, reject) { return Promise.resolve(this._result).then(resolve, reject); }
  catch(reject) { return Promise.resolve(this._result).catch(reject); }
}

// findById/findOne/findByIdAndUpdate must support both `await Model.x(...)`
// and the real-mongoose `Model.x(...).exec().catch(...)` fire-and-forget
// pattern used in website.controller.js — a plain async function only
// supports the former (native Promises have no `.exec()`).
class SingleQueryMock {
  constructor(compute) { this._compute = compute; }
  select() { return this; }
  populate() { return this; }
  exec() { return Promise.resolve().then(this._compute); }
  then(resolve, reject) { return Promise.resolve().then(this._compute).then(resolve, reject); }
  catch(reject) { return Promise.resolve().then(this._compute).catch(reject); }
}

class FakeWebsite {
  constructor(fields = {}) {
    this._id = fields._id || `website-${idCounter++}`;
    Object.assign(this, {
      name: 'Untitled',
      category: 'free',
      status: 'approved',
      isDeleted: false,
      wishlistCount: 0,
      viewCount: 0,
      ...fields,
    });
  }
  toObject() {
    const { toObject, ...rest } = this;
    return { ...rest };
  }
}

FakeWebsite.findById = (id) => new SingleQueryMock(() => store.find((w) => String(w._id) === String(id)) || null);

FakeWebsite.findOne = (query = {}) => new SingleQueryMock(() => store.find((w) => matchesQuery(w, query)) || null);

FakeWebsite.find = (query = {}) => new FindQueryMock(store.filter((w) => matchesQuery(w, query)));

FakeWebsite.countDocuments = async (query = {}) => store.filter((w) => matchesQuery(w, query)).length;

FakeWebsite.findByIdAndUpdate = (id, update = {}) => new SingleQueryMock(() => {
  const website = store.find((w) => String(w._id) === String(id));
  if (!website) return null;
  if (update.$inc) {
    Object.entries(update.$inc).forEach(([key, delta]) => {
      website[key] = (website[key] || 0) + delta;
    });
  }
  if (update.$set) Object.assign(website, update.$set);
  return website;
});

FakeWebsite.__reset = () => { store = []; idCounter = 1; };
FakeWebsite.__seed = (fields) => {
  const w = new FakeWebsite(fields);
  store.push(w);
  return w;
};
FakeWebsite.__all = () => store;

module.exports = FakeWebsite;
