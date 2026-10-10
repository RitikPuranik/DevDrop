// Reusable chainable-thenable stand-in for a Mongoose Query object.
// Supports the chain methods DevDrop's controllers actually call
// (populate/sort/skip/limit/lean/select) and resolves like a real
// query when awaited or .then()'d.
function createQueryMock(resolvedValue) {
  const query = {
    populate: jest.fn(() => query),
    sort: jest.fn(() => query),
    skip: jest.fn(() => query),
    limit: jest.fn(() => query),
    lean: jest.fn(() => query),
    select: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(resolvedValue).then(resolve, reject),
    catch: (reject) => Promise.resolve(resolvedValue).catch(reject),
  };
  return query;
}

// Builds a fake Express req object with sane defaults.
function mockReq(overrides = {}) {
  return {
    params: {},
    query: {},
    body: {},
    userId: 'user-1',
    ...overrides,
  };
}

// Builds a fake Express res object with jest.fn() spies, status()
// chainable back to res so `res.status(x).json(y)` works.
function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

module.exports = { createQueryMock, mockReq, mockRes };
