module.exports = {
  storagePrefixFor: jest.fn((projectId) => `ai-studio/${projectId}`),
  zipPathFor: jest.fn((projectId) => `ai-studio/${projectId}/project.zip`),
  assetPathFor: jest.fn((projectId, fileName) => `ai-studio/${projectId}/assets/${fileName}`),
  uploadProjectZip: jest.fn(async (projectId) => `ai-studio/${projectId}/project.zip`),
  downloadProjectZip: jest.fn(async () => Buffer.from('')),
  createSignedZipUrl: jest.fn(async (path) => `https://signed.example.com/${path}`),
  uploadAsset: jest.fn(async (projectId, fileName) => `ai-studio/${projectId}/assets/${fileName}`),
  listAllObjects: jest.fn(async () => []),
  deleteProjectStorage: jest.fn(async () => ({ deleted: 0 })),
  deleteAsset: jest.fn(async () => true),
};
