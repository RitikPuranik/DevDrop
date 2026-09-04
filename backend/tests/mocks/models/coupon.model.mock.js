let store = [];
let idCounter = 1;

class QueryMock {
  constructor(result) { this.result = result; }
  sort() { return this; }
  lean() { return Promise.resolve(this.result); }
  then(resolve, reject) { return Promise.resolve(this.result).then(resolve, reject); }
}

class FakeCoupon {
  constructor(fields = {}) {
    this._id = `coupon-${idCounter++}`;
    Object.assign(this, {
      code: fields.code,
      usageMode: fields.usageMode,
      discountType: fields.discountType,
      discountValue: fields.discountValue,
      active: fields.active !== undefined ? fields.active : true,
      usageCount: fields.usageCount || 0,
      consumedAt: fields.consumedAt || null,
      consumedByPaymentId: fields.consumedByPaymentId || null,
      consumedByPurchaseId: fields.consumedByPurchaseId || null,
      reservedByPaymentId: fields.reservedByPaymentId || null,
      reservedByUserId: fields.reservedByUserId || null,
      reservationExpiresAt: fields.reservationExpiresAt || null,
      createdAt: new Date(),
    });
  }

  toObject() {
    const { toObject, save, ...rest } = this;
    return { ...rest };
  }

  async save() {
    if (!store.find((c) => c._id === this._id)) store.push(this);
    return this;
  }
}

FakeCoupon.create = async (fields) => {
  const c = new FakeCoupon(fields);
  await c.save();
  return c;
};

FakeCoupon.findOne = (query = {}) => {
  const result = store.find((c) => Object.entries(query).every(([k, v]) => c[k] === v)) || null;
  return new QueryMock(result);
};

FakeCoupon.findById = (id) => {
  const result = store.find((c) => c._id === id) || null;
  return new QueryMock(result);
};

FakeCoupon.find = () => {
  const sorted = [...store].sort((a, b) => b.createdAt - a.createdAt);
  return new QueryMock(sorted);
};

FakeCoupon.__reset = () => { store = []; idCounter = 1; };
FakeCoupon.__all = () => store;

module.exports = FakeCoupon;
