jest.mock('../src/agents/edit.agent');
jest.mock('../src/agents/debug.agent');
jest.mock('../src/validators/build.validator', () => ({ run: jest.fn() }));

const editAgent = require('../src/agents/edit.agent');
const debugAgent = require('../src/agents/debug.agent');
const buildValidator = require('../src/validators/build.validator');
const { editWebsite } = require('../src/orchestrator/websiteEditing.orchestrator');

const EXISTING_FILES = {
  '/App.js': { code: 'import Navbar from "./components/Navbar.js";\nexport default function App(){ return <div><Navbar/></div>; }' },
  '/components/Navbar.js': { code: 'export default function Navbar(){ return <nav className="p-2">Nav</nav>; }' },
  '/components/Footer.js': { code: 'export default function Footer(){ return <footer>Footer</footer>; }' },
  '/package.json': { code: '{"name":"site","dependencies":{"react":"^19.0.0"}}' },
};

beforeEach(() => {
  editAgent.run.mockReset();
  debugAgent.run.mockReset();
  buildValidator.run.mockReset();
  buildValidator.run.mockResolvedValue({ success: true, errors: [] });
});

it('only touches the relevant file for a targeted edit and never calls the full generation agents', async () => {
  editAgent.run.mockImplementation(async ({ relevantFiles }) => {
    expect(Object.keys(relevantFiles)).toContain('/components/Navbar.js');
    expect(Object.keys(relevantFiles)).not.toContain('/components/Footer.js');
    return {
      value: {
        assistantMessage: 'Increased navbar padding.',
        changes: [{ path: '/components/Navbar.js', code: 'export default function Navbar(){ return <nav className="p-6">Nav</nav>; }' }],
      },
      model: 'test',
      attempt: 1,
    };
  });

  const stages = [];
  const result = await editWebsite(
    {
      messages: [{ role: 'user', content: 'Fix the navbar spacing' }],
      existingFiles: EXISTING_FILES,
      existingDependencies: { react: '^19.0.0' },
    },
    { onStage: (name, status) => { if (status === 'started') stages.push(name); } }
  );

  expect(stages).toEqual(['relevant-files', 'edit', 'build-validator']);
  expect(editAgent.run).toHaveBeenCalledTimes(1);
  expect(debugAgent.run).not.toHaveBeenCalled();
  expect(result.files['/components/Navbar.js'].code).toContain('p-6');
  expect(result.files['/components/Footer.js']).toEqual(EXISTING_FILES['/components/Footer.js']);
  expect(result.files['/App.js']).toEqual(EXISTING_FILES['/App.js']);
  expect(result.generationMeta.changedFiles).toEqual(['/components/Navbar.js']);
});

it('repairs an invalid edit with a scoped debug pass instead of failing outright', async () => {
  editAgent.run.mockResolvedValue({
    value: {
      assistantMessage: 'Updated navbar.',
      changes: [{ path: '/components/Navbar.js', code: 'export default function Navbar(){ return <Missing/>; }' }],
    },
    model: 'test',
    attempt: 1,
  });
  debugAgent.run.mockImplementation(async ({ affectedFiles }) => {
    expect(affectedFiles).toEqual(['/components/Navbar.js']);
    return { value: { changes: [{ path: '/components/Navbar.js', code: 'export default function Navbar(){ return <nav>Nav</nav>; }' }] }, model: 'test', attempt: 1 };
  });

  const result = await editWebsite(
    { messages: [{ role: 'user', content: 'Fix the navbar' }], existingFiles: EXISTING_FILES },
    {}
  );

  expect(debugAgent.run).toHaveBeenCalledTimes(1);
  expect(result.files['/components/Navbar.js'].code).toContain('<nav>Nav</nav>');
});

it('returns the unchanged project when the edit agent decides nothing needs to change', async () => {
  editAgent.run.mockResolvedValue({ value: { assistantMessage: 'That already matches the current design.', changes: [] }, model: 'test', attempt: 1 });

  const result = await editWebsite(
    { messages: [{ role: 'user', content: 'Make the navbar spacing better' }], existingFiles: EXISTING_FILES },
    {}
  );

  expect(result.files).toEqual(EXISTING_FILES);
  expect(result.generationMeta.changedFiles).toEqual([]);
});

it('throws a clear error when called with no existing project', async () => {
  await expect(editWebsite({ messages: [{ role: 'user', content: 'fix it' }], existingFiles: {} }, {})).rejects.toThrow();
});

it('runs the build, feeds a build failure to the debug agent, and rebuilds', async () => {
  editAgent.run.mockResolvedValue({
    value: { assistantMessage: 'Updated navbar.', changes: [{ path: '/components/Navbar.js', code: 'export default function Navbar(){ return <nav>A</nav>; }' }] },
    model: 'test',
    attempt: 1,
  });
  buildValidator.run
    .mockResolvedValueOnce({ success: false, errors: ['vite build failed'] })
    .mockResolvedValueOnce({ success: true, errors: [] });
  debugAgent.run.mockImplementation(async ({ buildOutput }) => {
    expect(buildOutput).toEqual(['vite build failed']);
    return { value: { changes: [{ path: '/components/Navbar.js', code: 'export default function Navbar(){ return <nav>B</nav>; }' }] }, model: 'test', attempt: 1 };
  });

  const result = await editWebsite({ messages: [{ role: 'user', content: 'Fix the navbar' }], existingFiles: EXISTING_FILES }, {});

  expect(buildValidator.run).toHaveBeenCalledTimes(2);
  expect(debugAgent.run).toHaveBeenCalledTimes(1);
  expect(result.files['/components/Navbar.js'].code).toContain('<nav>B</nav>');
});

it('fails with a user message when the build still fails after the repair retries', async () => {
  editAgent.run.mockResolvedValue({
    value: { assistantMessage: 'Updated navbar.', changes: [{ path: '/components/Navbar.js', code: 'export default function Navbar(){ return <nav>A</nav>; }' }] },
    model: 'test',
    attempt: 1,
  });
  buildValidator.run.mockResolvedValue({ success: false, errors: ['still broken'] });
  debugAgent.run.mockResolvedValue({ value: { changes: [] }, model: 'test', attempt: 1 });

  await expect(
    editWebsite({ messages: [{ role: 'user', content: 'Fix the navbar' }], existingFiles: EXISTING_FILES }, {})
  ).rejects.toMatchObject({ userMessage: expect.stringContaining('still broken') });
});