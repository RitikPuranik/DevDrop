// In-memory stand-in for the DownloadLog mongoose model, scoped to what
// asset.controller.js actually does with it: DownloadLog.insertMany(...)
// (getAssetUrls) and DownloadLog.find(...).populate().sort().skip().limit()
// + countDocuments (getDownloadHistory).

let store = [];
let idCounter = 1;

class FindQueryMock {
  constructor(initial) { this._result = initial; }
  populate() { return this; } // websiteId population isn't exercised by the covered scenarios
  sort(sortObj) {
    if (sortObj) {
      const [key, dir] = Object.entries(sortObj)[0] || [];
      this._result = [...this._result].sort((a, b) => {
        const cmp = a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0;
        return dir === -1 ? -cmp : cmp;
      });
    }
    return this;
  }
  skip(n) { this._result = this._result.slice(n || 0); return this; }
  limit(n) { if (n !== undefined) this._result = this._result.slice(0, n); return this; }
  then(resolve, reject) { return Promise.resolve(this._result).then(resolve, reject); }
  catch(reject) { return Promise.resolve(this._result).catch(reject); }
}

const matches = (doc, query = {}) => Object.entries(query).every(([key, condition]) => String(doc[key]) === String(condition));

const FakeDownloadLog = {
  insertMany: async (docs) => {
    const inserted = docs.map((d) => ({ _id: `downloadlog-${idCounter++}`, isSuspicious: false, downloadedAt: new Date(), ...d }));
    store.push(...inserted);
    return inserted;
  },
  find: (query = {}) => new FindQueryMock(store.filter((d) => matches(d, query))),
  countDocuments: async (query = {}) => store.filter((d) => matches(d, query)).length,
  __reset: () => { store = []; idCounter = 1; },
  __all: () => store,
};

module.exports = FakeDownloadLog;
