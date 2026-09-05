// In-memory stand-in for DeploymentProviderConnection, scoped to exactly
// what orchestrator.js's loadConnection() does:
//   DeploymentProviderConnection.findOne({ userId, provider }).select('+credentialEncrypted')

let store = [];

class SingleQueryMock {
  constructor(doc) { this._doc = doc; }
  select() { return this; } // credentialEncrypted is always present on the in-memory doc
  then(resolve, reject) { return Promise.resolve(this._doc).then(resolve, reject); }
  catch(reject) { return Promise.resolve(this._doc).catch(reject); }
}

const FakeDeploymentProviderConnection = {
  findOne: ({ userId, provider } = {}) =>
    new SingleQueryMock(
      store.find((c) => String(c.userId) === String(userId) && c.provider === provider) || null
    ),
  __reset: () => { store = []; },
  __seed: (fields) => {
    const c = { metadata: {}, ...fields };
    store.push(c);
    return c;
  },
};

module.exports = FakeDeploymentProviderConnection;
