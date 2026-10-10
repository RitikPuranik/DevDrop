// Real supabaseBackup service logic under test; the only external
// boundary mocked out is the Supabase JS SDK (storage client). No real
// Supabase project is ever contacted, no real files are transferred.
jest.mock('@supabase/supabase-js');

const { createClient } = require('@supabase/supabase-js');
const {
  mirrorBucket,
  listAllFiles,
  testConnection,
} = require('../../../src/services/backup/supabaseBackup.service');

// Builds a fake Supabase client whose storage.from(bucket) exposes the
// list/download/upload/remove methods the service actually calls.
// `filesByFolder` maps a folder prefix ('' for root) to the raw entries
// Supabase's `list` would return for that folder.
const makeFakeStorageClient = ({ filesByFolder = { '': [] }, listError = null } = {}) => {
  const calls = { list: [], download: [], upload: [], remove: [] };

  const from = jest.fn((bucket) => ({
    list: jest.fn((prefix = '', opts) => {
      calls.list.push({ bucket, prefix, opts });
      if (listError) return Promise.resolve({ data: null, error: listError });
      return Promise.resolve({ data: filesByFolder[prefix] ?? [], error: null });
    }),
    download: jest.fn((path) => {
      calls.download.push({ bucket, path });
      return Promise.resolve({
        data: { arrayBuffer: async () => Buffer.from('content-' + path), type: 'application/octet-stream' },
        error: null,
      });
    }),
    upload: jest.fn((path, buffer, opts) => {
      calls.upload.push({ bucket, path, buffer, opts });
      return Promise.resolve({ error: null });
    }),
    remove: jest.fn((paths) => {
      calls.remove.push({ bucket, paths });
      return Promise.resolve({ error: null });
    }),
  }));

  return { client: { storage: { from } }, calls };
};

const fileEntry = (name, size) => ({ id: 'id-' + name, name, metadata: { size } });
const folderEntry = (name) => ({ id: null, name, metadata: null });

describe('supabaseBackup.service', () => {
  beforeEach(() => {
    createClient.mockReset();
  });

  describe('mirrorBucket credential validation', () => {
    it('throws without ever listing when source credentials are missing', async () => {
      await expect(
        mirrorBucket({ sourceUrl: undefined, sourceKey: undefined, sourceBucket: 'b', targetUrl: 'u', targetKey: 'k', targetBucket: 'b' })
      ).rejects.toThrow(/Source Supabase credentials are not configured/);
      expect(createClient).not.toHaveBeenCalled();
    });

    it('throws when target credentials are missing', async () => {
      await expect(
        mirrorBucket({ sourceUrl: 'u', sourceKey: 'k', sourceBucket: 'b', targetUrl: undefined, targetKey: undefined, targetBucket: 'b' })
      ).rejects.toThrow(/Target Supabase credentials are not configured/);
    });
  });

  describe('listAllFiles', () => {
    it('lists flat files at the root with their sizes', async () => {
      const { client } = makeFakeStorageClient({
        filesByFolder: { '': [fileEntry('a.zip', 100), fileEntry('b.png', 200)] },
      });

      const files = await listAllFiles(client, 'bucket');

      expect(files).toEqual([
        { path: 'a.zip', size: 100 },
        { path: 'b.png', size: 200 },
      ]);
    });

    it('recurses into folders and flattens nested paths', async () => {
      const { client } = makeFakeStorageClient({
        filesByFolder: {
          '': [folderEntry('source-code'), fileEntry('root.txt', 10)],
          'source-code': [fileEntry('app.zip', 500)],
        },
      });

      const files = await listAllFiles(client, 'bucket');

      expect(files).toEqual(
        expect.arrayContaining([
          { path: 'root.txt', size: 10 },
          { path: 'source-code/app.zip', size: 500 },
        ])
      );
      expect(files).toHaveLength(2);
    });

    it('wraps and throws a listing error with the prefix', async () => {
      const { client } = makeFakeStorageClient({ listError: { message: 'permission denied' } });

      await expect(listAllFiles(client, 'bucket')).rejects.toThrow(/Supabase list error \(\/\): permission denied/);
    });
  });

  describe('mirrorBucket copy/skip behavior', () => {
    it('skips files whose size is unchanged and copies new/changed ones', async () => {
      const sourceStore = makeFakeStorageClient({
        filesByFolder: { '': [fileEntry('unchanged.zip', 100), fileEntry('changed.zip', 50), fileEntry('new.zip', 30)] },
      });
      const targetStore = makeFakeStorageClient({
        filesByFolder: { '': [fileEntry('unchanged.zip', 100), fileEntry('changed.zip', 999)] },
      });

      createClient.mockImplementationOnce(() => sourceStore.client).mockImplementationOnce(() => targetStore.client);

      const onProgress = jest.fn();
      const result = await mirrorBucket({
        sourceUrl: 's', sourceKey: 'sk', sourceBucket: 'src',
        targetUrl: 't', targetKey: 'tk', targetBucket: 'dst',
        onProgress,
      });

      expect(result.skipped).toBe(1);
      expect(result.copied).toBe(2);
      expect(result.failed).toEqual([]);
      expect(sourceStore.calls.download.map((d) => d.path).sort()).toEqual(['changed.zip', 'new.zip']);
      expect(targetStore.calls.upload.map((u) => u.path).sort()).toEqual(['changed.zip', 'new.zip']);
      expect(onProgress).toHaveBeenCalled();
    });

    it('deletes stale target files not present on source in mirror mode', async () => {
      const sourceStore = makeFakeStorageClient({ filesByFolder: { '': [fileEntry('keep.zip', 10)] } });
      const targetStore = makeFakeStorageClient({
        filesByFolder: { '': [fileEntry('keep.zip', 10), fileEntry('stale.zip', 20)] },
      });
      createClient.mockImplementationOnce(() => sourceStore.client).mockImplementationOnce(() => targetStore.client);

      const result = await mirrorBucket({
        sourceUrl: 's', sourceKey: 'sk', sourceBucket: 'src',
        targetUrl: 't', targetKey: 'tk', targetBucket: 'dst',
      });

      expect(result.deleted).toBe(1);
      expect(targetStore.calls.remove).toEqual([{ bucket: 'dst', paths: ['stale.zip'] }]);
    });

    it('does not delete stale target files in add-only mode', async () => {
      const sourceStore = makeFakeStorageClient({ filesByFolder: { '': [fileEntry('keep.zip', 10)] } });
      const targetStore = makeFakeStorageClient({
        filesByFolder: { '': [fileEntry('keep.zip', 10), fileEntry('stale.zip', 20)] },
      });
      createClient.mockImplementationOnce(() => sourceStore.client).mockImplementationOnce(() => targetStore.client);

      const result = await mirrorBucket({
        sourceUrl: 's', sourceKey: 'sk', sourceBucket: 'src',
        targetUrl: 't', targetKey: 'tk', targetBucket: 'dst',
        mode: 'add-only',
      });

      expect(result.deleted).toBe(0);
      expect(targetStore.calls.remove).toHaveLength(0);
    });

    it('batches stale deletions in groups of 100', async () => {
      const staleFiles = Array.from({ length: 150 }, (_, i) => fileEntry(`stale-${i}.zip`, i));
      const sourceStore = makeFakeStorageClient({ filesByFolder: { '': [] } });
      const targetStore = makeFakeStorageClient({ filesByFolder: { '': staleFiles } });
      createClient.mockImplementationOnce(() => sourceStore.client).mockImplementationOnce(() => targetStore.client);

      const result = await mirrorBucket({
        sourceUrl: 's', sourceKey: 'sk', sourceBucket: 'src',
        targetUrl: 't', targetKey: 'tk', targetBucket: 'dst',
      });

      expect(targetStore.calls.remove).toHaveLength(2); // 100 + 50
      expect(targetStore.calls.remove[0].paths).toHaveLength(100);
      expect(targetStore.calls.remove[1].paths).toHaveLength(50);
      expect(result.deleted).toBe(150);
    });
  });

  describe('mirrorBucket failure handling', () => {
    it('records a failed entry (without aborting the run) when download fails', async () => {
      const sourceStore = makeFakeStorageClient({ filesByFolder: { '': [fileEntry('bad.zip', 10), fileEntry('good.zip', 20)] } });
      sourceStore.client.storage.from = jest.fn((bucket) => ({
        list: jest.fn(() => Promise.resolve({ data: [fileEntry('bad.zip', 10), fileEntry('good.zip', 20)], error: null })),
        download: jest.fn((path) => {
          if (path === 'bad.zip') return Promise.resolve({ data: null, error: { message: 'download failed' } });
          return Promise.resolve({ data: { arrayBuffer: async () => Buffer.from('ok'), type: 'application/octet-stream' }, error: null });
        }),
        upload: jest.fn(() => Promise.resolve({ error: null })),
        remove: jest.fn(() => Promise.resolve({ error: null })),
      }));
      const targetStore = makeFakeStorageClient({ filesByFolder: { '': [] } });
      createClient.mockImplementationOnce(() => sourceStore.client).mockImplementationOnce(() => targetStore.client);

      const result = await mirrorBucket({
        sourceUrl: 's', sourceKey: 'sk', sourceBucket: 'src',
        targetUrl: 't', targetKey: 'tk', targetBucket: 'dst',
      });

      expect(result.copied).toBe(1);
      expect(result.failed).toEqual([{ path: 'bad.zip', error: 'download failed' }]);
    });

    it('records a failed entry when upload fails', async () => {
      const sourceStore = makeFakeStorageClient({ filesByFolder: { '': [fileEntry('a.zip', 10)] } });
      const targetStore = makeFakeStorageClient({ filesByFolder: { '': [] } });
      targetStore.client.storage.from = jest.fn((bucket) => ({
        list: jest.fn(() => Promise.resolve({ data: [], error: null })),
        upload: jest.fn(() => Promise.resolve({ error: { message: 'upload failed' } })),
        remove: jest.fn(() => Promise.resolve({ error: null })),
      }));
      createClient.mockImplementationOnce(() => sourceStore.client).mockImplementationOnce(() => targetStore.client);

      const result = await mirrorBucket({
        sourceUrl: 's', sourceKey: 'sk', sourceBucket: 'src',
        targetUrl: 't', targetKey: 'tk', targetBucket: 'dst',
      });

      expect(result.copied).toBe(0);
      expect(result.failed).toEqual([{ path: 'a.zip', error: 'upload failed' }]);
    });

    it('propagates a source listing failure and never reaches target listing', async () => {
      const sourceStore = makeFakeStorageClient({ listError: { message: 'source list broke' } });
      const targetStore = makeFakeStorageClient({ filesByFolder: { '': [] } });
      createClient.mockImplementationOnce(() => sourceStore.client).mockImplementationOnce(() => targetStore.client);

      await expect(
        mirrorBucket({ sourceUrl: 's', sourceKey: 'sk', sourceBucket: 'src', targetUrl: 't', targetKey: 'tk', targetBucket: 'dst' })
      ).rejects.toThrow(/source list broke/);
    });

    it('propagates a destination listing failure', async () => {
      const sourceStore = makeFakeStorageClient({ filesByFolder: { '': [fileEntry('a.zip', 10)] } });
      const targetStore = makeFakeStorageClient({ listError: { message: 'dest list broke' } });
      createClient.mockImplementationOnce(() => sourceStore.client).mockImplementationOnce(() => targetStore.client);

      await expect(
        mirrorBucket({ sourceUrl: 's', sourceKey: 'sk', sourceBucket: 'src', targetUrl: 't', targetKey: 'tk', targetBucket: 'dst' })
      ).rejects.toThrow(/dest list broke/);
    });

    it('reports a per-batch cleanup failure without losing the successfully deleted count', async () => {
      const sourceStore = makeFakeStorageClient({ filesByFolder: { '': [] } });
      const targetStore = makeFakeStorageClient({ filesByFolder: { '': [fileEntry('stale.zip', 5)] } });
      targetStore.client.storage.from = jest.fn((bucket) => ({
        list: jest.fn(() => Promise.resolve({ data: [fileEntry('stale.zip', 5)], error: null })),
        remove: jest.fn(() => Promise.resolve({ error: { message: 'cleanup broke' } })),
      }));
      createClient.mockImplementationOnce(() => sourceStore.client).mockImplementationOnce(() => targetStore.client);

      const result = await mirrorBucket({
        sourceUrl: 's', sourceKey: 'sk', sourceBucket: 'src', targetUrl: 't', targetKey: 'tk', targetBucket: 'dst',
      });

      expect(result.deleted).toBe(0);
      expect(result.failed).toEqual([{ path: 'stale.zip', error: 'Cleanup failed: cleanup broke' }]);
    });
  });

  describe('testConnection', () => {
    it('returns ok with the sample entry count on success', async () => {
      const { client } = makeFakeStorageClient({ filesByFolder: { '': [fileEntry('a.zip', 1)] } });
      createClient.mockImplementationOnce(() => client);

      const result = await testConnection('url', 'key', 'bucket');

      expect(result).toEqual({ ok: true, bucket: 'bucket', sampleEntryCount: 1 });
    });

    it('returns a zero sample count when the bucket is empty', async () => {
      const { client } = makeFakeStorageClient({ filesByFolder: { '': [] } });
      createClient.mockImplementationOnce(() => client);

      const result = await testConnection('url', 'key', 'bucket');

      expect(result.sampleEntryCount).toBe(0);
    });

    it('throws a wrapped error on authentication/API failure', async () => {
      const { client } = makeFakeStorageClient({ listError: { message: 'invalid API key' } });
      createClient.mockImplementationOnce(() => client);

      await expect(testConnection('url', 'badkey', 'bucket')).rejects.toThrow(/Supabase connection failed: invalid API key/);
    });

    it('throws when credentials are missing, without calling the SDK', async () => {
      await expect(testConnection(undefined, undefined, 'bucket')).rejects.toThrow(/Supabase credentials are not configured/);
      expect(createClient).not.toHaveBeenCalled();
    });
  });
});
