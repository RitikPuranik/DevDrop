let store = [];
let idCounter = 1;

class QueryMock {
  constructor(result) { this.result = result; }
  then(resolve, reject) { return Promise.resolve(this.result).then(resolve, reject); }
  catch(reject) { return Promise.resolve(this.result).catch(reject); }
}

const matches = (doc, query = {}) => Object.entries(query).every(([key, condition]) => {
  return String(doc[key]) === String(condition);
});

class FakePayout {
  constructor(fields = {}) {
    this._id = fields._id || `payout-${idCounter++}`;
    Object.assign(this, {
      status: 'pending',
      isAutomatic: false,
      failureReason: null,
      createdAt: new Date(),
      ...fields,
    });
  }

  async save() {
    if (!store.find((p) => p._id === this._id)) store.push(this);
    return this;
  }

  toObject() {
    const { save, toObject, ...rest } = this;
    return { ...rest };
  }
}

FakePayout.findOne = (query = {}) => {
  const result = store.find((p) => matches(p, query)) || null;
  const q = new QueryMock(result);
  q.lean = () => Promise.resolve(result);
  return q;
};

FakePayout.__reset = () => { store = []; idCounter = 1; };
FakePayout.__all = () => store;

module.exports = FakePayout;
