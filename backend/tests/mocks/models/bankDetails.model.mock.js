let store = [];

class QueryMock {
  constructor(result) { this.result = result; }
  then(resolve, reject) { return Promise.resolve(this.result).then(resolve, reject); }
  catch(reject) { return Promise.resolve(this.result).catch(reject); }
}

const FakeBankDetails = {};

FakeBankDetails.findOne = (query = {}) => {
  const result = store.find((b) => String(b.userId) === String(query.userId)) || null;
  return new QueryMock(result);
};

FakeBankDetails.__reset = () => { store = []; };
FakeBankDetails.__seed = (fields) => { store.push(fields); return fields; };

module.exports = FakeBankDetails;
