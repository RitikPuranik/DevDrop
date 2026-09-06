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

// Minimal condition matcher for the atomic reserve/consume/release queries
// issued by the payment checkout flow. Only supports the operators those
// queries actually use ($or, $ne, $lte against dates, plain equality/null).
const matchesCondition = (actual, condition) => {
  if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
    if ('$ne' in condition) return String(actual) !== String(condition.$ne);
    if ('$lte' in condition) {
      if (actual === null || actual === undefined) return false;
      return new Date(actual).getTime() <= new Date(condition.$lte).getTime();
    }
  }
  if (condition === null) return actual === null || actual === undefined;
  return String(actual) === String(condition);
};

const matchesQuery = (doc, query = {}) => Object.entries(query).every(([key, condition]) => {
  if (key === '$or') return condition.some((clause) => matchesQuery(doc, clause));
  return matchesCondition(doc[key], condition);
});

// Real Mongoose findOneAndUpdate is atomic per-document: the match and the
// write happen as one indivisible operation from the caller's point of view.
// This fake reproduces that by finding + mutating synchronously (no `await`
// inside), so two "concurrent" callers racing via Promise.all can never both
// see the pre-update state — exactly the guarantee the coupon reservation
// logic depends on.
FakeCoupon.findOneAndUpdate = async (query = {}, update = {}, options = {}) => {
  const doc = store.find((c) => matchesQuery(c, query));
  if (!doc) return null;
  if (update.$set) Object.assign(doc, update.$set);
  if (update.$inc) {
    Object.entries(update.$inc).forEach(([k, delta]) => { doc[k] = (doc[k] || 0) + delta; });
  }
  return doc;
};

FakeCoupon.__reset = () => { store = []; idCounter = 1; };
FakeCoupon.__all = () => store;

module.exports = FakeCoupon;
