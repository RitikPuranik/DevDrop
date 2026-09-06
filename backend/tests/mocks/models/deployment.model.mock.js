// In-memory stand-in for the Deployment mongoose model, scoped to exactly
// what src/services/deployment/orchestrator.js does with it:
//   Deployment.findById(id).select('+pendingSecretsEncrypted')
// followed by direct field mutation + deployment.save() + markModified().
//
// Returns the SAME object reference that lives in `store`, so mutations the
// orchestrator makes (deployment.status = ..., deployment.render.url = ...)
// are visible to the test via Deployment.__get(id) without needing a real
// persistence round-trip — this is a database-boundary mock (Option D),
// not a disguised re-implementation of orchestrator logic.

let store = [];
let idCounter = 1;

class SingleQueryMock {
  constructor(doc) { this._doc = doc; }
  select() { return this; } // pendingSecretsEncrypted is always present on the in-memory doc
  then(resolve, reject) { return Promise.resolve(this._doc).then(resolve, reject); }
  catch(reject) { return Promise.resolve(this._doc).catch(reject); }
}

class FakeDeployment {
  constructor(fields = {}) {
    this._id = fields._id || `deployment-${idCounter++}`;
    Object.assign(
      this,
      {
        userId: null,
        websiteId: null,
        purchaseId: null,
        source: 'marketplace',
        repository: {},
        architecture: 'UNKNOWN',
        analysis: null,
        envPlan: [],
        pendingSecretsEncrypted: null,
        frontendProvider: null,
        backendProvider: null,
        vercel: {},
        render: {},
        status: 'ANALYZING',
        errorMessage: undefined,
        errorStep: undefined,
        lastDeployedAt: undefined,
      },
      fields
    );
    this._saveCount = 0;
  }
  // orchestrator calls this after every status/field change — real mongoose
  // would persist; here there's nothing to flush since findById returns the
  // live object, but tracking the call count lets tests assert on how many
  // save points a flow went through without over-specifying exact values.
  save() {
    this._saveCount += 1;
    return Promise.resolve(this);
  }
  markModified() {
    // No-op: plain JS array mutation is already visible on this object,
    // unlike real Mongoose which needs this hint for Mixed/array paths.
  }
}

FakeDeployment.findById = (id) => new SingleQueryMock(store.find((d) => String(d._id) === String(id)) || null);

FakeDeployment.__reset = () => { store = []; idCounter = 1; };
FakeDeployment.__seed = (fields) => {
  const d = new FakeDeployment(fields);
  store.push(d);
  return d;
};
FakeDeployment.__get = (id) => store.find((d) => String(d._id) === String(id)) || null;

module.exports = FakeDeployment;
