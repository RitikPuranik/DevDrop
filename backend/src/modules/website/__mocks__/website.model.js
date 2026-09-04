let store = [];
let idCounter = 1;

class QueryMock {
  constructor(result) { this.result = result; }
  then(resolve, reject) { return Promise.resolve(this.result).then(resolve, reject); }
}

class FakeWebsite {
  constructor(fields = {}) {
    this._id = fields._id || `website-${idCounter++}`;
    Object.assign(this, {
      name: 'Untitled',
      status: 'approved',
      isDeleted: false,
      wishlistCount: 0,
      ...fields,
    });
  }
}

FakeWebsite.findById = (id) => {
  const result = store.find((w) => String(w._id) === String(id)) || null;
  return new QueryMock(result);
};

FakeWebsite.findByIdAndUpdate = async (id, update = {}) => {
  const website = store.find((w) => String(w._id) === String(id));
  if (!website) return null;
  if (update.$inc) {
    Object.entries(update.$inc).forEach(([key, delta]) => {
      website[key] = (website[key] || 0) + delta;
    });
  }
  if (update.$set) Object.assign(website, update.$set);
  return website;
};

FakeWebsite.__reset = () => { store = []; idCounter = 1; };
FakeWebsite.__seed = (fields) => {
  const w = new FakeWebsite(fields);
  store.push(w);
  return w;
};
FakeWebsite.__all = () => store;

module.exports = FakeWebsite;
