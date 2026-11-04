// Minimal in-memory stand-in for the Mongoose operations used by the
// deployment-management services. It emulates the behaviours those services
// RELY ON for correctness: unique / partial-unique index violations (E11000),
// conditional findOneAndUpdate (atomic claim), $set/$unset/$inc/$push+$slice.
// It is a database-boundary fake (like tests/mocks/models/*), not a Mongo reimplementation.

let counter = 1;
const newId = () => (counter++).toString(16).padStart(24, '0');

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const setPath = (obj, path, value) => {
  const keys = path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
  o[keys[keys.length - 1]] = value;
};
const unsetPath = (obj, path) => {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) { if (o == null) return; o = o[k]; }
  if (o) delete o[keys[keys.length - 1]];
};
const norm = (v) => (v && typeof v === 'object' && v.constructor && v.constructor.name === 'ObjectId' ? String(v) : v);

const matchValue = (actual, cond) => {
  if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
    return Object.entries(cond).every(([op, v]) => {
      switch (op) {
        case '$ne': return String(actual) !== String(v) || (actual == null && v != null);
        case '$in': return v.map(String).includes(String(actual));
        case '$lt': return actual != null && actual < v;
        case '$exists': return v ? actual !== undefined : actual === undefined;
        case '$type': return typeof actual === 'string';
        default: return false;
      }
    });
  }
  if (cond === null) return actual == null;
  if (cond instanceof Date) return actual instanceof Date && actual.getTime() === cond.getTime();
  return String(norm(actual)) === String(norm(cond));
};

const matches = (doc, filter = {}) =>
  Object.entries(filter).every(([k, cond]) => {
    if (k === '$or') return cond.some((f) => matches(doc, f));
    return matchValue(getPath(doc, k), cond);
  });

const applyUpdate = (doc, update) => {
  const u = update.$set || update.$unset || update.$push || update.$inc ? update : { $set: update };
  Object.entries(u.$set || {}).forEach(([k, v]) => setPath(doc, k, v));
  Object.keys(u.$unset || {}).forEach((k) => unsetPath(doc, k));
  Object.entries(u.$inc || {}).forEach(([k, v]) => setPath(doc, k, (getPath(doc, k) || 0) + v));
  Object.entries(u.$push || {}).forEach(([k, v]) => {
    const arr = getPath(doc, k) || [];
    const items = v && v.$each ? v.$each : [v];
    arr.push(...items);
    setPath(doc, k, v && v.$slice ? arr.slice(v.$slice) : arr);
  });
};

class Query {
  constructor(fn, single = false) { this.fn = fn; this.single = single; this._sort = null; this._limit = null; }
  select() { return this; }
  sort(s) { this._sort = s; return this; }
  limit(n) { this._limit = n; return this; }
  exec() { return this._run(); }
  async _run() {
    let rows = await this.fn();
    if (!Array.isArray(rows)) return rows;
    const finish = (r) => (this.single ? r[0] || null : r);
    if (this._sort) {
      const entries = Object.entries(this._sort);
      rows = [...rows].sort((a, b) => {
        for (const [k, dir] of entries) {
          const av = getPath(a, k); const bv = getPath(b, k);
          if (av < bv) return -dir; if (av > bv) return dir;
        }
        return 0;
      });
    }
    return finish(this._limit ? rows.slice(0, this._limit) : rows);
  }
  then(res, rej) { return this._run().then(res, rej); }
  catch(rej) { return this._run().catch(rej); }
}

/**
 * @param {Array<{fields:string[], unique:boolean, partial?:function}>} uniques unique-index emulation
 */
const createFakeModel = ({ uniques = [], defaults = () => ({}) } = {}) => {
  const store = [];
  const violates = (doc, ignore) =>
    uniques.find((u) => {
      if (u.partial && !u.partial(doc)) return false;
      return store.some((o) => o !== ignore && (!u.partial || u.partial(o)) && u.fields.every((f) => getPath(o, f) != null && String(getPath(o, f)) === String(getPath(doc, f))));
    });
  const dupError = (u) => Object.assign(new Error(`E11000 duplicate key ${u.fields.join(',')}`), { code: 11000 });
  const insert = (data) => {
    const doc = { _id: newId(), createdAt: new Date(), updatedAt: new Date(), ...defaults(), ...data };
    const u = violates(doc);
    if (u) throw dupError(u);
    store.push(doc);
    return doc;
  };
  const touch = (d) => { d.updatedAt = new Date(); return d; };

  const Model = {
    __store: store,
    __reset: () => { store.length = 0; },
    create: async (data) => insert(data),
    insertMany: async (docs) => {
      const errors = [];
      docs.forEach((d) => { try { insert(d); } catch (e) { errors.push({ code: e.code }); } });
      if (errors.length) throw Object.assign(new Error('E11000 bulk'), { writeErrors: errors });
    },
    findOne: (filter) => new Query(async () => store.filter((d) => matches(d, filter)), true),
    findById: (id) => new Query(async () => store.find((d) => String(d._id) === String(id)) || null),
    find: (filter) => new Query(async () => store.filter((d) => matches(d, filter))),
    exists: async (filter) => (store.find((d) => matches(d, filter)) ? { _id: 1 } : null),
    countDocuments: async (filter) => store.filter((d) => matches(d, filter)).length,
    findOneAndUpdate: (filter, update, opts = {}) => new Query(async () => {
      const doc = store.find((d) => matches(d, filter));
      if (!doc) return null;
      const before = JSON.parse(JSON.stringify(doc));
      applyUpdate(doc, update); touch(doc);
      const u = violates(doc, doc);
      if (u) { Object.keys(doc).forEach((k) => delete doc[k]); Object.assign(doc, before); throw dupError(u); }
      return opts.new ? doc : before;
    }),
    updateOne: async (filter, update) => {
      const doc = store.find((d) => matches(d, filter));
      if (!doc) return { modifiedCount: 0 };
      const before = JSON.parse(JSON.stringify(doc));
      applyUpdate(doc, update); touch(doc);
      const u = violates(doc, doc);
      if (u) { Object.keys(doc).forEach((k) => delete doc[k]); Object.assign(doc, before); throw dupError(u); }
      return { modifiedCount: 1 };
    },
    updateMany: async (filter, update) => {
      const docs = store.filter((d) => matches(d, filter));
      docs.forEach((d) => { applyUpdate(d, update); touch(d); });
      return { modifiedCount: docs.length };
    },
    deleteOne: async (filter) => { const i = store.findIndex((d) => matches(d, filter)); if (i >= 0) store.splice(i, 1); },
    bulkWrite: async (ops) => { for (const op of ops) if (op.updateOne) await Model.updateOne(op.updateOne.filter, op.updateOne.update); },
  };
  return Model;
};

module.exports = { createFakeModel, matches };
