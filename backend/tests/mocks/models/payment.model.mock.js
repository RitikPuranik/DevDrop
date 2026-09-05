let store = [];
let idCounter = 1;

class QueryMock {
  constructor(result) { this.result = result; }
  then(resolve, reject) { return Promise.resolve(this.result).then(resolve, reject); }
  catch(reject) { return Promise.resolve(this.result).catch(reject); }
}

const matches = (doc, query = {}) => Object.entries(query).every(([key, condition]) => {
  const actual = doc[key];
  if (condition === null) return actual === null || actual === undefined;
  return String(actual) === String(condition);
});

class FakePayment {
  constructor(fields = {}) {
    this._id = fields._id || `payment-${idCounter++}`;
    Object.assign(this, {
      purchaseId: null,
      couponId: null,
      couponCode: null,
      discountType: undefined,
      discountValue: 0,
      reservationExpiresAt: null,
      razorpayOrderId: undefined,
      razorpayPaymentId: undefined,
      razorpaySignature: undefined,
      status: 'created',
      currency: 'INR',
      gatewayResponse: undefined,
      failureReason: undefined,
      failureCode: undefined,
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

FakePayment.findOne = (query = {}) => new QueryMock(store.find((p) => matches(p, query)) || null);
FakePayment.findById = (id) => new QueryMock(store.find((p) => String(p._id) === String(id)) || null);

FakePayment.updateOne = async (query = {}, update = {}) => {
  const doc = store.find((p) => matches(p, query));
  if (!doc) return { matchedCount: 0 };
  if (update.$set) Object.assign(doc, update.$set);
  return { matchedCount: 1 };
};

FakePayment.findOneAndUpdate = async (query = {}, update = {}, options = {}) => {
  const doc = store.find((p) => matches(p, query));
  if (!doc) return null;
  if (update.$set) Object.assign(doc, update.$set);
  return doc;
};

FakePayment.__reset = () => { store = []; idCounter = 1; };
FakePayment.__all = () => store;

module.exports = FakePayment;
