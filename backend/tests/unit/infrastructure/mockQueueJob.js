// In-memory QueueJob stand-in (no MongoDB) shared by the infrastructure tests.
const docs = new Map();
const matches = (d, q) => Object.entries(q).every(([k, v]) => {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if ('$in' in v) return v.$in.includes(d[k]);
    if ('$nin' in v) return !v.$nin.includes(d[k]);
    if ('$ne' in v) return d[k] !== v.$ne;
    if ('$lte' in v) return d[k] <= v.$lte;
    if ('$gt' in v) return d[k] > v.$gt;
    if ('$exists' in v) return (d[k] !== undefined) === v.$exists;
  }
  return d[k] === v;
});
const apply = (d, update) => {
  Object.assign(d, update.$set || {});
  Object.keys(update.$unset || {}).forEach((k) => delete d[k]);
  Object.entries(update.$inc || {}).forEach(([k, n]) => { d[k] = (d[k] || 0) + n; });
  if (!update.$set && !update.$unset && !update.$inc && !update.$setOnInsert) Object.assign(d, update);
  return d;
};
const chain = (rows) => { const p = Promise.resolve(rows); p.select = () => p; p.sort = () => p; p.limit = () => p; return p; };

const QueueJob = {
  TERMINAL: ['completed', 'failed', 'cancelled'],
  STATUSES: ['queued', 'active', 'delayed', 'completed', 'failed', 'cancelled'],
  __docs: docs,
  __reset: () => docs.clear(),
  create: jest.fn(async (doc) => {
    if (docs.has(doc.jobKey)) throw Object.assign(new Error('dup'), { code: 11000 });
    const d = { createdAt: new Date(Date.now() - 60000), updatedAt: new Date(Date.now() - 60000), ...doc };
    docs.set(doc.jobKey, d); return d;
  }),
  findOne: jest.fn((q) => { const d = [...docs.values()].find((x) => matches(x, q)); return chain(d ? Object.assign(d, { save: async () => d }) : null); }),
  find: jest.fn((q) => chain([...docs.values()].filter((x) => matches(x, q)))),
  exists: jest.fn(async (q) => ([...docs.values()].some((x) => matches(x, q)) ? { _id: 1 } : null)),
  deleteOne: jest.fn(async (q) => { const d = [...docs.values()].find((x) => matches(x, q)); if (d) docs.delete(d.jobKey); }),
  updateOne: jest.fn(async (q, update, opts) => {
    let d = [...docs.values()].find((x) => matches(x, q.jobKey ? { jobKey: q.jobKey } : q));
    if (!d && opts?.upsert) { d = { ...(update.$setOnInsert || {}) }; docs.set(d.jobKey, d); }
    if (d) apply(d, update);
  }),
  findOneAndUpdate: jest.fn(async (q, update) => { const d = [...docs.values()].find((x) => matches(x, q)); if (!d) return null; return apply(d, update); }),
};
module.exports = QueueJob;
