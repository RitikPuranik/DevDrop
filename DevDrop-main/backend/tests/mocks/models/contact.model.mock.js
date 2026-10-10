let store = [];
let idCounter = 1;

class QueryMock {
  constructor(result) { this.result = result; }
  sort() { return this; }
  skip() { return this; }
  limit() { return this; }
  lean() { return this; }
  then(resolve, reject) { return Promise.resolve(this.result).then(resolve, reject); }
}

class FakeContact {
  constructor(fields = {}) {
    this._id = `contact-${idCounter++}`;
    this.name = fields.name;
    this.email = fields.email;
    this.phone = fields.phone;
    this.message = fields.message || '';
    this.status = fields.status || 'new';
    // Offset by the id counter so submissions created within the same
    // millisecond (common in fast test runs) still sort deterministically.
    this.createdAt = fields.createdAt || new Date(Date.now() + idCounter);
  }
}

FakeContact.create = async (fields) => {
  const c = new FakeContact(fields);
  store.push(c);
  return c;
};

FakeContact.find = () => {
  const sorted = [...store].sort((a, b) => b.createdAt - a.createdAt);
  return new QueryMock(sorted);
};

FakeContact.countDocuments = async () => store.length;

FakeContact.__reset = () => { store = []; idCounter = 1; };
FakeContact.__all = () => store;
FakeContact.__seed = (fields) => {
  const c = new FakeContact(fields);
  store.push(c);
  return c;
};

module.exports = FakeContact;
