let store = [];
let idCounter = 1;

class Query {
  constructor(rows) { this.rows = rows; }
  sort(spec) {
    const [[k, dir]] = Object.entries(spec);
    this.rows = [...this.rows].sort((a, b) => (a[k] - b[k]) * dir);
    return this;
  }
  skip(n) { this.rows = this.rows.slice(n); return this; }
  select() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.rows).then(resolve, reject); }
}
class One extends Query {
  then(resolve, reject) { return Promise.resolve(this.rows[0] || null).then(resolve, reject); }
}

const matches = (doc, query) => Object.entries(query).every(([k, v]) => {
  if (v && typeof v === 'object' && Array.isArray(v.$in)) return v.$in.map(String).includes(String(doc[k]));
  return String(doc[k]) === String(v);
});

const Fake = {
  create: async (fields) => { const d = { _id: `ver-${idCounter++}`, createdAt: new Date(), ...fields }; store.push(d); return d; },
  find: (q = {}) => new Query(store.filter((d) => matches(d, q))),
  findOne: (q = {}) => new One(store.filter((d) => matches(d, q))),
  deleteMany: async (q = {}) => { const n = store.length; store = store.filter((d) => !matches(d, q)); return { deletedCount: n - store.length }; },
  __reset: () => { store = []; idCounter = 1; },
  __all: () => store,
};
module.exports = Fake;
