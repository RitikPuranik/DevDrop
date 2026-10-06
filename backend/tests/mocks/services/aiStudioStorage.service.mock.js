module.exports = {
  storagePrefixFor: jest.fn((projectId) => `ai-studio/${projectId}`),
  zipPathFor: jest.fn((projectId) => `ai-studio/${projectId}/project.zip`),
  assetPathFor: jest.fn((projectId, assetId, fileName) => `ai-studio/${projectId}/assets/${assetId}/${fileName}`),
  uploadProjectZip: jest.fn(async (projectId) => `ai-studio/${projectId}/project.zip`),
  downloadProjectZip: jest.fn(async () => Buffer.from('')),
  createSignedZipUrl: jest.fn(async (path) => `https://signed.example.com/${path}`),
  uploadAsset: jest.fn(async (projectId, assetId, fileName) => `ai-studio/${projectId}/assets/${assetId}/${fileName}`),
  createSignedAssetUrl: jest.fn(async (path, expiresIn, opts) => `https://signed.example.com/${path}${opts && opts.download ? '?download=1' : ''}`),
  downloadAsset: jest.fn(async () => Buffer.from('bytes')),
  listAllObjects: jest.fn(async () => []),
  deleteProjectStorage: jest.fn(async () => ({ deleted: 0 })),
  deleteAsset: jest.fn(async () => true),
};
