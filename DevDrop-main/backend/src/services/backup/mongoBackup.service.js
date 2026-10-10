const { MongoClient } = require('mongodb');

/**
 * Schema-agnostic MongoDB backup/restore engine.
 *
 * Works directly with the native driver (not Mongoose models) so that
 * EVERY collection in the database is captured, including any that
 * don't have a corresponding Mongoose model loaded in this process.
 *
 * Used for both directions:
 *   - main  -> backup  (regular backup)
 *   - backup -> main   (restore)
 */

const BATCH_SIZE = 500;

/**
 * Open a short-lived MongoClient connection. Independent from the
 * app's main Mongoose connection so backup/restore operations never
 * interfere with live request traffic.
 */
const openClient = async (uri, label) => {
  if (!uri) {
    throw new Error(`${label} MongoDB URI is not configured`);
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 8000,
  });

  await client.connect();
  return client;
};

/**
 * Dump every collection from the source URI into an in-memory snapshot:
 *   { collectionName: [doc, doc, ...], ... }
 *
 * Kept in memory (not streamed to disk) because DevDrop's data size is
 * small enough for this to be safe, and it keeps Render's ephemeral
 * filesystem out of the equation entirely.
 */
const dumpDatabase = async (uri, { label = 'source' } = {}) => {
  const client = await openClient(uri, label);

  try {
    const db = client.db();
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();

    const snapshot = {
      dumpedAt: new Date().toISOString(),
      dbName: db.databaseName,
      collections: {},
    };

    for (const { name } of collections) {
      // Skip system collections (e.g. system.views)
      if (name.startsWith('system.')) continue;

      const docs = await db.collection(name).find({}).toArray();
      snapshot.collections[name] = docs;
    }

    return snapshot;
  } finally {
    await client.close();
  }
};

/**
 * Restore a snapshot (produced by dumpDatabase) into the target URI.
 *
 * mode:
 *  - 'replace' (default): drops each collection being restored first,
 *    then inserts the snapshot's documents. Cleanest, guarantees the
 *    target exactly matches the snapshot for those collections.
 *  - 'merge': upserts documents by _id without dropping anything first.
 */
const restoreDatabase = async (uri, snapshot, { label = 'target', mode = 'replace' } = {}) => {
  if (!snapshot || !snapshot.collections) {
    throw new Error('Invalid backup snapshot');
  }

  const client = await openClient(uri, label);
  const result = { collections: {}, mode };

  try {
    const db = client.db();

    for (const [collectionName, docs] of Object.entries(snapshot.collections)) {
      const collection = db.collection(collectionName);

      if (mode === 'replace') {
        await collection.deleteMany({});
      }

      let written = 0;

      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);
        if (batch.length === 0) continue;

        if (mode === 'replace') {
          await collection.insertMany(batch, { ordered: false });
        } else {
          const ops = batch.map((doc) => ({
            replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
          }));
          await collection.bulkWrite(ops, { ordered: false });
        }

        written += batch.length;
      }

      result.collections[collectionName] = written;
    }

    return result;
  } finally {
    await client.close();
  }
};

/**
 * Convenience helper: copy data straight from one URI to another
 * without the caller having to hold the snapshot in between.
 */
const copyDatabase = async (sourceUri, targetUri, { sourceLabel = 'source', targetLabel = 'target', mode = 'replace' } = {}) => {
  const snapshot = await dumpDatabase(sourceUri, { label: sourceLabel });
  const result = await restoreDatabase(targetUri, snapshot, { label: targetLabel, mode });
  return { snapshotMeta: { dbName: snapshot.dbName, dumpedAt: snapshot.dumpedAt }, ...result };
};

/** Quick reachability check used by the admin "test connection" endpoint. */
const testConnection = async (uri, label = 'database') => {
  const client = await openClient(uri, label);
  try {
    const db = client.db();
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    return { ok: true, dbName: db.databaseName, collectionCount: collections.length };
  } finally {
    await client.close();
  }
};

module.exports = { dumpDatabase, restoreDatabase, copyDatabase, testConnection };
