// Real backup/restore logic under test; the only external boundary
// mocked out is the MongoDB driver itself (no real database connections).
jest.mock('mongodb');

const { MongoClient } = require('mongodb');
const {
  dumpDatabase,
  restoreDatabase,
  copyDatabase,
  testConnection,
} = require('../../../src/services/backup/mongoBackup.service');

// Builds a fake MongoClient instance wired to a fake in-memory db.
const makeFakeClient = ({ dbName = 'testdb', collectionNames = [], docsByCollection = {} } = {}) => {
  const collectionCalls = {};

  const fakeDb = {
    databaseName: dbName,
    listCollections: jest.fn(() => ({
      toArray: jest.fn().mockResolvedValue(collectionNames.map((name) => ({ name }))),
    })),
    collection: jest.fn((name) => {
      collectionCalls[name] = collectionCalls[name] || { deleteMany: jest.fn().mockResolvedValue({}), insertMany: jest.fn().mockResolvedValue({}), bulkWrite: jest.fn().mockResolvedValue({}) };
      return {
        find: jest.fn(() => ({
          toArray: jest.fn().mockResolvedValue(docsByCollection[name] || []),
        })),
        deleteMany: collectionCalls[name].deleteMany,
        insertMany: collectionCalls[name].insertMany,
        bulkWrite: collectionCalls[name].bulkWrite,
      };
    }),
  };

  const client = {
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    db: jest.fn(() => fakeDb),
  };

  return { client, fakeDb, collectionCalls };
};

describe('mongoBackup.service', () => {
  beforeEach(() => {
    MongoClient.mockReset();
  });

  describe('dumpDatabase', () => {
    it('throws when no URI is configured, without ever opening a connection', async () => {
      await expect(dumpDatabase(undefined)).rejects.toThrow(/MongoDB URI is not configured/);
      expect(MongoClient).not.toHaveBeenCalled();
    });

    it('dumps every non-system collection into a snapshot', async () => {
      const { client } = makeFakeClient({
        dbName: 'devdrop',
        collectionNames: ['users', 'websites', 'system.views'],
        docsByCollection: { users: [{ _id: 1 }], websites: [{ _id: 2 }, { _id: 3 }] },
      });
      MongoClient.mockImplementation(() => client);

      const snapshot = await dumpDatabase('mongodb://source', { label: 'source' });

      expect(snapshot.dbName).toBe('devdrop');
      expect(Object.keys(snapshot.collections)).toEqual(['users', 'websites']);
      expect(snapshot.collections.websites).toHaveLength(2);
      expect(snapshot.dumpedAt).toEqual(expect.any(String));
    });

    it('always closes the connection, even when listing collections fails', async () => {
      const { client, fakeDb } = makeFakeClient();
      fakeDb.listCollections.mockImplementation(() => { throw new Error('list failed'); });
      MongoClient.mockImplementation(() => client);

      await expect(dumpDatabase('mongodb://source')).rejects.toThrow('list failed');
      expect(client.close).toHaveBeenCalled();
    });
  });

  describe('restoreDatabase', () => {
    it('rejects an invalid snapshot', async () => {
      await expect(restoreDatabase('mongodb://target', null)).rejects.toThrow(/Invalid backup snapshot/);
      await expect(restoreDatabase('mongodb://target', {})).rejects.toThrow(/Invalid backup snapshot/);
      expect(MongoClient).not.toHaveBeenCalled();
    });

    it('drops each collection first and inserts documents in "replace" mode', async () => {
      const { client, collectionCalls } = makeFakeClient();
      MongoClient.mockImplementation(() => client);

      const snapshot = { collections: { users: [{ _id: 1 }, { _id: 2 }] } };
      const result = await restoreDatabase('mongodb://target', snapshot, { mode: 'replace' });

      expect(collectionCalls.users.deleteMany).toHaveBeenCalledWith({});
      expect(collectionCalls.users.insertMany).toHaveBeenCalledWith([{ _id: 1 }, { _id: 2 }], { ordered: false });
      expect(result.collections.users).toBe(2);
      expect(result.mode).toBe('replace');
    });

    it('upserts by _id without dropping anything in "merge" mode', async () => {
      const { client, collectionCalls } = makeFakeClient();
      MongoClient.mockImplementation(() => client);

      const snapshot = { collections: { users: [{ _id: 'a' }] } };
      await restoreDatabase('mongodb://target', snapshot, { mode: 'merge' });

      expect(collectionCalls.users.deleteMany).not.toHaveBeenCalled();
      expect(collectionCalls.users.bulkWrite).toHaveBeenCalledWith(
        [{ replaceOne: { filter: { _id: 'a' }, replacement: { _id: 'a' }, upsert: true } }],
        { ordered: false }
      );
    });

    it('batches large collections in chunks of 500', async () => {
      const { client, collectionCalls } = makeFakeClient();
      MongoClient.mockImplementation(() => client);

      const docs = Array.from({ length: 1200 }, (_, i) => ({ _id: i }));
      const result = await restoreDatabase('mongodb://target', { collections: { big: docs } }, { mode: 'replace' });

      expect(collectionCalls.big.insertMany).toHaveBeenCalledTimes(3); // 500 + 500 + 200
      expect(result.collections.big).toBe(1200);
    });

    it('skips empty collections without writing', async () => {
      const { client, collectionCalls } = makeFakeClient();
      MongoClient.mockImplementation(() => client);

      const result = await restoreDatabase('mongodb://target', { collections: { empty: [] } }, { mode: 'replace' });

      expect(collectionCalls.empty.insertMany).not.toHaveBeenCalled();
      expect(result.collections.empty).toBe(0);
    });

    it('closes the connection even when a write fails partway through', async () => {
      const { client, collectionCalls } = makeFakeClient();
      collectionCalls.users = { deleteMany: jest.fn().mockResolvedValue({}), insertMany: jest.fn().mockRejectedValue(new Error('write failed')), bulkWrite: jest.fn() };
      client.db = jest.fn(() => ({
        collection: jest.fn(() => ({
          deleteMany: collectionCalls.users.deleteMany,
          insertMany: collectionCalls.users.insertMany,
        })),
      }));
      MongoClient.mockImplementation(() => client);

      await expect(restoreDatabase('mongodb://target', { collections: { users: [{ _id: 1 }] } })).rejects.toThrow('write failed');
      expect(client.close).toHaveBeenCalled();
    });
  });

  describe('copyDatabase', () => {
    it('dumps the source and restores it into the target, returning snapshot metadata', async () => {
      const { client } = makeFakeClient({
        dbName: 'devdrop',
        collectionNames: ['users'],
        docsByCollection: { users: [{ _id: 1 }] },
      });
      MongoClient.mockImplementation(() => client);

      const result = await copyDatabase('mongodb://source', 'mongodb://target', { sourceLabel: 'main', targetLabel: 'backup' });

      expect(result.snapshotMeta.dbName).toBe('devdrop');
      expect(result.collections.users).toBe(1);
      // Two independent client lifecycles: one for the dump, one for the restore.
      expect(client.connect).toHaveBeenCalledTimes(2);
      expect(client.close).toHaveBeenCalledTimes(2);
    });

    it('propagates a dump failure without attempting the restore', async () => {
      const { client, fakeDb } = makeFakeClient();
      fakeDb.listCollections.mockImplementation(() => { throw new Error('source unreachable'); });
      MongoClient.mockImplementation(() => client);

      await expect(copyDatabase('mongodb://source', 'mongodb://target')).rejects.toThrow('source unreachable');
    });
  });

  describe('testConnection', () => {
    it('returns db name and collection count on success', async () => {
      const { client } = makeFakeClient({ dbName: 'devdrop', collectionNames: ['users', 'websites'] });
      MongoClient.mockImplementation(() => client);

      const result = await testConnection('mongodb://main', 'main');

      expect(result).toEqual({ ok: true, dbName: 'devdrop', collectionCount: 2 });
      expect(client.close).toHaveBeenCalled();
    });

    it('throws when the URI is missing', async () => {
      await expect(testConnection(undefined, 'main')).rejects.toThrow(/main MongoDB URI is not configured/);
    });

    it('closes the connection even when listing collections fails', async () => {
      const { client, fakeDb } = makeFakeClient();
      fakeDb.listCollections.mockImplementation(() => { throw new Error('down'); });
      MongoClient.mockImplementation(() => client);

      await expect(testConnection('mongodb://main', 'main')).rejects.toThrow('down');
      expect(client.close).toHaveBeenCalled();
    });
  });
});
