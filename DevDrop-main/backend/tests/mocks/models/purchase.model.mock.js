let store = [];
let idCounter = 1;

class QueryMock {
  constructor(result) { this.result = result; }
  then(resolve, reject) { return Promise.resolve(this.result).then(resolve, reject); }
  catch(reject) { return Promise.resolve(this.result).catch(reject); }
}

class DuplicateKeyError extends Error {
  constructor(keyPattern) {
    super('E11000 duplicate key error');
    this.code = 11000;
    this.keyPattern = keyPattern;
  }
}

const matches = (doc, query = {}) => Object.entries(query).every(([key, condition]) => {
  return String(doc[key]) === String(condition);
});

class FakePurchase {
  constructor(fields = {}) {
    this._id = fields._id || `purchase-${idCounter++}`;
    Object.assign(this, {
      couponId: null,
      couponCode: null,
      discountType: undefined,
      discountValue: 0,
      downloadCount: 0,
      purchaseDate: new Date(),
      ...fields,
    });
  }

  // Mirrors the real unique index on { websiteId, buyerId } so the
  // controller's 11000-catch race-recovery path is genuinely exercised.
  async save() {
    const clash = store.find(
      (p) => p !== this
        && String(p.websiteId) === String(this.websiteId)
        && String(p.buyerId) === String(this.buyerId)
    );
    if (clash) throw new DuplicateKeyError({ websiteId: 1, buyerId: 1 });

    if (!store.find((p) => p._id === this._id)) store.push(this);
    return this;
  }

  toObject() {
    const { save, toObject, ...rest } = this;
    return { ...rest };
  }
}

FakePurchase.findOne = (query = {}) => new QueryMock(store.find((p) => matches(p, query)) || null);
FakePurchase.findById = (id) => new QueryMock(store.find((p) => String(p._id) === String(id)) || null);

FakePurchase.__reset = () => { store = []; idCounter = 1; };
FakePurchase.__all = () => store;
FakePurchase.__seed = (fields) => {
  const p = new FakePurchase(fields);
  store.push(p);
  return p;
};

module.exports = FakePurchase;
