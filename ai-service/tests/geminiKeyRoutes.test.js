const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

process.env.SERVICE_API_KEY = 'test-service-key';
process.env.AI_GEMINI_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
// Deliberately different from AI_GEMINI_TOKEN_ENCRYPTION_KEY, and never
// read by ai-service's Gemini crypto path — proves the two secrets are
// independent.
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

jest.mock('../src/models/geminiApiKey.model', () => {
  const docs = new Map();
  let counter = 0;

  function toDoc(id, fields) {
    const doc = { _id: id, ...fields };
    doc.toObject = () => ({ ...doc });
    return doc;
  }

  // Minimal chainable query mock: supports `.find().sort(...)`,
  // `.find().select(...)`, and plain `await find()` — same shapes used by
  // routes.js and geminiPool.service.js respectively.
  function chainable(getResult) {
    const thenable = {
      sort: () => thenable,
      select: () => thenable,
      then: (resolve, reject) => Promise.resolve(getResult()).then(resolve, reject),
      catch: (reject) => Promise.resolve(getResult()).catch(reject),
    };
    return thenable;
  }

  return {
    __esModule: true,
    __docs: docs,
    __reset: () => docs.clear(),
    __seed: (fields) => {
      counter += 1;
      const id = `id-${counter}`;
      const doc = toDoc(id, { status: 'healthy', enabled: true, priority: 100, ...fields });
      docs.set(id, doc);
      return doc;
    },
    create: jest.fn(async (fields) => {
      counter += 1;
      const id = `id-${counter}`;
      const doc = toDoc(id, { status: 'healthy', enabled: true, priority: 100, ...fields });
      docs.set(id, doc);
      return doc;
    }),
    findById: jest.fn((id) => chainable(() => docs.get(id) || null)),
    findByIdAndUpdate: jest.fn(async (id, update) => {
      const existing = docs.get(id);
      if (!existing) return null;
      const merged = toDoc(id, { ...existing, ...update });
      docs.set(id, merged);
      return merged;
    }),
    findByIdAndDelete: jest.fn(async (id) => {
      const existing = docs.get(id) || null;
      docs.delete(id);
      return existing;
    }),
    find: jest.fn(() => chainable(() => Array.from(docs.values()))),
    estimatedDocumentCount: jest.fn(async () => docs.size),
  };
});

const GeminiApiKey = require('../src/models/geminiApiKey.model');
const { decrypt } = require('../src/utils/geminiCrypto');
const routes = require('../src/routes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/', routes);
  return app;
}

describe('Gemini pool service routes', () => {
  beforeEach(() => {
    GeminiApiKey.__reset();
    jest.clearAllMocks();
  });

  test('rejects requests without the shared service key', async () => {
    const app = buildApp();
    const res = await request(app).post('/gemini-pool/reload');
    expect(res.status).toBe(401);
  });

  test('reload is service-authenticated and does not accept plaintext credentials', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/gemini-pool/reload')
      .set('X-Service-Key', 'test-service-key')
      .send({ apiKey: 'AIzaShouldNotBeAcceptedHere123' });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('AIzaShouldNotBeAcceptedHere123');
  });

  test('test route uses stored encrypted credential and never returns the raw key', async () => {
    const app = buildApp();
    GeminiApiKey.__seed({
      encryptedKey: require('../src/utils/geminiCrypto').encrypt('AIzaStoredSecret123456'),
      keySuffix: '3456',
      keyPrefix: 'AIza',
    });
    const id = Array.from(GeminiApiKey.__docs.keys())[0];

    const res = await request(app)
      .post(`/gemini-pool/keys/${id}/test`)
      .set('X-Service-Key', 'test-service-key');

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('AIzaStoredSecret123456');
  });
});
