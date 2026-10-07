jest.mock('../src/services/llm.service', () => ({ callGemini: jest.fn() }));

const { callGemini } = require('../src/services/llm.service');
const { run } = require('../src/agents/codeGeneration.agent');

const fileContract = { path: '/package.json', type: 'config' };
const baseArgs = { fileContract, relatedContracts: [], requirements: {}, design: {}, userData: {} };

beforeEach(() => {
  callGemini.mockReset();
});

it('stringifies a JSON object returned in place of a code string', async () => {
  callGemini.mockResolvedValue({
    value: { path: '/package.json', code: { name: 'app', dependencies: {} } },
    model: 'test',
    attempt: 1,
  });

  const result = await run(baseArgs);

  expect(typeof result.value.code).toBe('string');
  expect(JSON.parse(result.value.code)).toEqual({ name: 'app', dependencies: {} });
});

it('repairs a path missing its leading slash', async () => {
  callGemini.mockResolvedValue({ value: { path: 'package.json', code: '{}' }, model: 'test', attempt: 1 });

  const result = await run(baseArgs);

  expect(result.value.path).toBe('/package.json');
});

it('passes through an already-valid response unchanged', async () => {
  callGemini.mockResolvedValue({ value: { path: '/package.json', code: '{"name":"app"}' }, model: 'test', attempt: 1 });

  const result = await run(baseArgs);

  expect(result.value).toEqual({ path: '/package.json', code: '{"name":"app"}' });
});

it('forces the architecture contract path even when the model returns a different path', async () => {
  callGemini.mockResolvedValue({ value: { path: '/wrong-file.js', code: 'x' }, model: 'test', attempt: 1 });

  const result = await run(baseArgs);

  expect(result.value.path).toBe('/package.json');
});


it('strips an accidental markdown code fence around source code', async () => {
  callGemini.mockResolvedValue({
    value: { path: '/package.json', code: '```json\n{"name":"app"}\n```' }, model: 'test', attempt: 1,
  });

  const result = await run(baseArgs);

  expect(result.value.code).toBe('{"name":"app"}');
});
