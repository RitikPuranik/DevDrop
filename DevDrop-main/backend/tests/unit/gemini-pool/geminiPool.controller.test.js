const crypto = require('crypto');

process.env.AI_GEMINI_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

jest.mock('../../../src/modules/gemini-pool/geminiPoolServiceClient', () => ({
  testKey: jest.fn(),
  getLiveStatus: jest.fn(),
  reloadPool: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../src/modules/gemini-pool/geminiApiKey.model', () => ({
  getModel: jest.fn(),
}));

const poolClient = require('../../../src/modules/gemini-pool/geminiPoolServiceClient');
const { getModel } = require('../../../src/modules/gemini-pool/geminiApiKey.model');
const controller = require('../../../src/modules/gemini-pool/geminiPool.controller');
const { decrypt } = require('../../../src/modules/gemini-pool/geminiCrypto');

function mockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

function makeDoc(id, fields = {}) {
  const doc = {
    _id: id,
    label: 'Primary',
    enabled: true,
    priority: 100,
    status: 'healthy',
    keyPrefix: 'AIza',
    keySuffix: '3456',
    failureCount: 0,
    consecutiveFailures: 0,
    totalRequests: 0,
    totalSuccesses: 0,
    totalFailures: 0,
    cooldownUntil: null,
    lastUsedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    encryptedKey: null,
    ...fields,
  };
  doc.toObject = () => ({ ...doc });
  return doc;
}

let docs;
let Model;

beforeEach(() => {
  docs = new Map();
  Model = {
    find: jest.fn(() => ({
      sort: jest.fn(async () => Array.from(docs.values())),
    })),
    findOne: jest.fn(async ({ keyFingerprint }) => Array.from(docs.values()).find((d) => d.keyFingerprint === keyFingerprint) || null),
    findById: jest.fn((id) => ({
      select: jest.fn(async () => docs.get(id) || null),
    })),
    findByIdAndUpdate: jest.fn(async (id, update) => {
      const old = docs.get(id);
      if (!old) return null;
      const next = makeDoc(id, { ...old, ...update });
      docs.set(id, next);
      return next;
    }),
    findByIdAndDelete: jest.fn(async (id) => {
      const old = docs.get(id) || null;
      docs.delete(id);
      return old;
    }),
    create: jest.fn(async (fields) => {
      const id = `id-${docs.size + 1}`;
      const doc = makeDoc(id, fields);
      docs.set(id, doc);
      return doc;
    }),
  };
  getModel.mockResolvedValue(Model);
  poolClient.testKey.mockResolvedValue({ valid: true, message: 'Key is valid and reachable.' });
  poolClient.getLiveStatus.mockResolvedValue(null);
  poolClient.reloadPool.mockResolvedValue(true);
  jest.clearAllMocks();
});

describe('Gemini pool backend encryption boundary', () => {
  test('backend encrypts the submitted Gemini key before persistence', async () => {
    const res = mockRes();
    await controller.addKey({ body: { label: 'Primary', apiKey: 'AIzaPlaintextValue123456' } }, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const stored = docs.values().next().value;
    expect(stored.encryptedKey).toBeTruthy();
    expect(stored.encryptedKey).not.toContain('AIzaPlaintextValue123456');
    expect(decrypt(stored.encryptedKey)).toBe('AIzaPlaintextValue123456');
    expect(res.json.mock.calls[0][0].data.key.maskedKey).toBe('AIza...3456');
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('AIzaPlaintextValue123456');
  });

  test('backend rejects a duplicate Gemini API key using a fingerprint', async () => {
    const res1 = mockRes();
    await controller.addKey({ body: { label: 'Primary', apiKey: 'AIzaDuplicateKey123456' } }, res1);
    const res2 = mockRes();
    await controller.addKey({ body: { label: 'Again', apiKey: 'AIzaDuplicateKey123456' } }, res2);
    expect(res2.status).toHaveBeenCalledWith(409);
  });

  test('rotation re-encrypts the new key and resets health', async () => {
    const createRes = mockRes();
    await controller.addKey({ body: { label: 'Primary', apiKey: 'AIzaOldKeyValue1234' } }, createRes);
    const id = createRes.json.mock.calls[0][0].data.key.id;
    docs.get(id).status = 'degraded';
    docs.get(id).consecutiveFailures = 3;

    const updateRes = mockRes();
    await controller.updateKey({ params: { id }, body: { apiKey: 'AIzaNewKeyValue9999' } }, updateRes);
    const stored = docs.get(id);
    expect(decrypt(stored.encryptedKey)).toBe('AIzaNewKeyValue9999');
    expect(stored.status).toBe('healthy');
    expect(stored.consecutiveFailures).toBe(0);
  });

  test('metadata update does not change encrypted credential', async () => {
    const createRes = mockRes();
    await controller.addKey({ body: { label: 'Primary', apiKey: 'AIzaMetadataKey12345' } }, createRes);
    const id = createRes.json.mock.calls[0][0].data.key.id;
    const before = docs.get(id).encryptedKey;
    const res = mockRes();
    await controller.updateKey({ params: { id }, body: { label: 'Renamed', enabled: false, priority: 5 } }, res);
    expect(docs.get(id).encryptedKey).toBe(before);
    expect(docs.get(id).status).toBe('disabled');
  });

  test('admin mutations request an immediate ai-service reload', async () => {
    const res = mockRes();
    await controller.addKey({ body: { label: 'Primary', apiKey: 'AIzaReloadKey123456' } }, res);
    expect(poolClient.reloadPool).toHaveBeenCalled();
  });
});
