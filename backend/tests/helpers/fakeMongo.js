'use strict';

// Minimal in-memory stand-in for the Mongoose collections the billing code uses. Each operation runs
// synchronously inside one call (like a single-document atomic Mongo op); `await`s between operations let
// concurrent requests interleave, which is exactly what the concurrency tests need.
let seq = 0;
const isObj = (v) => v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v);
const val = (v) => (v instanceof Date ? v.getTime() : v);
const eq = (a, b) => {
  if (b === null || b === undefined) return a === null || a === undefined;
  if (Array.isArray(a)) return a.map(String).includes(String(b));
  return String(val(a)) === String(val(b));
};
const hasOp = (v) => isObj(v) && Object.keys(v).some((k) => k.startsWith('$'));

function matches(doc, filter) {
  return Object.entries(filter || {}).every(([k, cond]) => {
    const v = doc[k];
    if (!hasOp(cond)) return eq(v, cond);
    return Object.entries(cond).every(([op, x]) => {
      switch (op) {
        case '$in': return x.some((y) => eq(v, y));
        case '$nin': return !x.some((y) => eq(v, y));
        case '$ne': return !eq(v, x);
        case '$lt': return v !== undefined && v !== null && val(v) < val(x);
        case '$lte': return v !== undefined && v !== null && val(v) <= val(x);
        case '$gt': return v !== undefined && v !== null && val(v) > val(x);
        case '$gte': return v !== undefined && v !== null && val(v) >= val(x);
        case '$exists': return (v !== undefined) === x;
        default: throw new Error(`fakeMongo: unsupported operator ${op}`);
      }
    });
  });
}

function applyUpdate(doc, update) {
  const u = update || {};
  const direct = Object.keys(u).filter((k) => !k.startsWith('$'));
  direct.forEach((k) => { doc[k] = u[k]; });
  Object.entries(u.$set || {}).forEach(([k, v]) => { if (v === undefined) delete doc[k]; else doc[k] = v; });
  Object.keys(u.$unset || {}).forEach((k) => delete doc[k]);
  Object.entries(u.$inc || {}).forEach(([k, n]) => { doc[k] = (doc[k] || 0) + n; });
  Object.entries(u.$addToSet || {}).forEach(([k, v]) => { doc[k] = doc[k] || []; if (!doc[k].map(String).includes(String(v))) doc[k].push(v); });
  doc.updatedAt = new Date();
  return doc;
}

function makeCollection({ defaults = {}, unique = [], sparse = [] } = {}) {
  const rows = [];
  const withSave = (d) => { if (d && !d.save) Object.defineProperty(d, 'save', { value: async () => d, enumerable: false, configurable: true, writable: true }); return d; };
  const chain = (result) => {
    let data = result;
    const p = { then: (res, rej) => Promise.resolve(data).then(res, rej), catch: (rej) => Promise.resolve(data).catch(rej) };
    p.sort = (spec) => { if (Array.isArray(data) && spec) { const [[k, dir]] = Object.entries(spec); data = [...data].sort((a, b) => (val(a[k]) > val(b[k]) ? 1 : -1) * dir); } return p; };
    p.limit = (n) => { if (Array.isArray(data)) data = data.slice(0, n); return p; };
    p.select = () => p; p.lean = () => p;
    return p;
  };
  const dupe = (doc, ignore) => unique.some((fields) => {
    const keys = Array.isArray(fields) ? fields : [fields];
    if (sparse.includes(keys[0]) && (doc[keys[0]] === undefined || doc[keys[0]] === null)) return false;
    return rows.some((r) => r !== ignore && keys.every((k) => r[k] !== undefined && String(r[k]) === String(doc[k])));
  });
  const conflict = () => Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
  const insert = (data) => {
    const d = { _id: `id${++seq}`, createdAt: new Date(), updatedAt: new Date(), ...JSON.parse(JSON.stringify(defaults), (k, v) => v), ...data };
    Object.keys(d).forEach((k) => { if (d[k] === undefined) delete d[k]; });
    if (dupe(d)) throw conflict();
    rows.push(withSave(d));
    return d;
  };
  const upsertDoc = (filter, update) => {
    const base = {};
    Object.entries(filter).forEach(([k, v]) => { if (!hasOp(v)) base[k] = v; });
    const d = insert({ ...base, ...(update.$setOnInsert || {}) });
    applyUpdate(d, { ...update, $setOnInsert: undefined });
    if (dupe(d, d)) { rows.splice(rows.indexOf(d), 1); throw conflict(); }
    return d;
  };
  const col = {
    __rows: rows,
    __reset: () => { rows.length = 0; },
    create: jest.fn(async (data) => insert(data)),
    findOne: jest.fn((f) => chain(withSave(rows.find((r) => matches(r, f)) || null))),
    findById: jest.fn((id) => chain(withSave(rows.find((r) => String(r._id) === String(id)) || null))),
    find: jest.fn((f) => chain(rows.filter((r) => matches(r, f)).map(withSave))),
    exists: jest.fn(async (f) => (rows.some((r) => matches(r, f)) ? { _id: 1 } : null)),
    countDocuments: jest.fn(async (f) => rows.filter((r) => matches(r, f)).length),
    updateOne: jest.fn(async (f, update, opts = {}) => {
      const d = rows.find((r) => matches(r, f));
      if (d) { const next = { ...d }; applyUpdate(next, update); if (dupe(next, d)) throw conflict(); applyUpdate(d, update); return { matchedCount: 1, modifiedCount: 1 }; }
      if (opts.upsert) { upsertDoc(f, update); return { upsertedCount: 1 }; }
      return { matchedCount: 0, modifiedCount: 0 };
    }),
    findOneAndUpdate: jest.fn((f, update, opts = {}) => {
      let d = rows.find((r) => matches(r, f));
      let out = null;
      if (d) { const before = { ...d }; applyUpdate(d, update); out = opts.new ? d : Object.assign(before, {}); }
      else if (opts.upsert) { d = upsertDoc(f, update); out = d; }
      return chain(out ? withSave(out) : null);
    }),
    deleteOne: jest.fn(async (f) => { const i = rows.findIndex((r) => matches(r, f)); if (i >= 0) rows.splice(i, 1); }),
  };
  return col;
}

module.exports = { makeCollection };
