jest.mock('../src/geminiPool.service', () => ({
  executeModels: jest.fn(async (models, fn) => ({ result: await fn('key', models[0]), model: models[0] })),
}));
jest.mock('axios', () => ({ post: jest.fn() }));

const axios = require('axios');
const { callGemini } = require('../src/services/llm.service');

beforeEach(() => {
  axios.post.mockReset();
  axios.post.mockResolvedValue({ data: { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] } });
});

test('inline media is sent as labeled multimodal parts, not inside the JSON text', async () => {
  await callGemini({
    system: 's',
    input: { websiteType: 'portfolio', media: [{ assetId: 'i1', fileName: 'profile.jpg', mimeType: 'image/jpeg', data: 'BASE64DATA' }] },
  });
  const parts = axios.post.mock.calls[0][1].contents[0].parts;
  expect(parts[0].text).not.toContain('BASE64DATA');
  expect(parts[1].text).toContain('assetId=i1');
  expect(parts[1].text).toContain('profile.jpg');
  expect(parts[2]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'BASE64DATA' } });
});

test('requests without media are unchanged (single text part)', async () => {
  await callGemini({ system: 's', input: { websiteType: 'portfolio' } });
  expect(axios.post.mock.calls[0][1].contents[0].parts).toHaveLength(1);
});
