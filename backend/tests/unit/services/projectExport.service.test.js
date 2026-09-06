const AdmZip = require('adm-zip');

jest.mock('../../../src/modules/website/website.model');
jest.mock('../../../src/modules/payment/purchase.model');
jest.mock('../../../src/modules/github/projectExport.model');
jest.mock('../../../src/modules/github/githubConnection.model');
jest.mock('../../../src/services/supabase.service');
jest.mock('../../../src/services/github.service');
jest.mock('axios');
jest.mock('../../../src/shared/utils/crypto', () => ({
  decrypt: jest.fn((v) => v.replace(/^enc\(/, '').replace(/\)$/, '')),
}));

const axios = require('axios');
const Website = require('../../../src/modules/website/website.model');
const Purchase = require('../../../src/modules/payment/purchase.model');
const ProjectExport = require('../../../src/modules/github/projectExport.model');
const GithubConnection = require('../../../src/modules/github/githubConnection.model');
const supabaseService = require('../../../src/services/supabase.service');
const githubService = require('../../../src/services/github.service');
const projectExportService = require('../../../src/services/projectExport.service');

const buildZip = (files) => {
  const zip = new AdmZip();
  files.forEach(({ name, content, isDir }) => {
    if (isDir) {
      zip.addFile(name.endsWith('/') ? name : `${name}/`, Buffer.alloc(0));
    } else {
      zip.addFile(name, Buffer.from(content ?? 'x'));
    }
  });
  return zip.toBuffer();
};

describe('projectExport.service', () => {
  describe('sanitizeRepoName', () => {
    it('lowercases, replaces invalid characters with hyphens, and collapses repeats', () => {
      expect(projectExportService.sanitizeRepoName('My Cool App!!')).toBe('my-cool-app');
    });

    it('strips leading/trailing dashes and dots', () => {
      expect(projectExportService.sanitizeRepoName('--.my-app.--')).toBe('my-app');
    });

    it('falls back to a default name for empty/garbage input', () => {
      expect(projectExportService.sanitizeRepoName('   ')).toBe('devdrop-project');
      expect(projectExportService.sanitizeRepoName(undefined)).toBe('devdrop-project');
    });

    it('truncates to 100 characters', () => {
      const long = 'a'.repeat(150);
      expect(projectExportService.sanitizeRepoName(long)).toHaveLength(100);
    });
  });

  describe('isValidRepoName', () => {
    it('accepts a normal repo name', () => {
      expect(projectExportService.isValidRepoName('my-app_2')).toBe(true);
    });

    it('rejects non-string input', () => {
      expect(projectExportService.isValidRepoName(123)).toBe(false);
      expect(projectExportService.isValidRepoName(null)).toBe(false);
    });

    it('rejects names with disallowed characters', () => {
      expect(projectExportService.isValidRepoName('my app!')).toBe(false);
    });

    it('rejects "." and ".." explicitly', () => {
      expect(projectExportService.isValidRepoName('.')).toBe(false);
      expect(projectExportService.isValidRepoName('..')).toBe(false);
    });

    it('rejects a name over 100 characters', () => {
      expect(projectExportService.isValidRepoName('a'.repeat(101))).toBe(false);
    });
  });

  describe('generateReadmeContent', () => {
    it('includes the project name and setup instructions', () => {
      const readme = projectExportService.generateReadmeContent('Cool App');
      expect(readme).toContain('# Cool App');
      expect(readme).toContain('npm install');
    });
  });

  describe('extractExportableFiles', () => {
    it('extracts ordinary files and detects a root README', () => {
      const zip = buildZip([
        { name: 'index.js', content: 'console.log(1)' },
        { name: 'README.md', content: '# hi' },
      ]);

      const { files, skipped, hasReadme } = projectExportService.extractExportableFiles(zip);

      expect(files.map((f) => f.relativePath).sort()).toEqual(['README.md', 'index.js']);
      expect(hasReadme).toBe(true);
      expect(skipped).toEqual([]);
    });

    it('excludes node_modules and other hard-coded directories regardless of depth', () => {
      const zip = buildZip([
        { name: 'src/index.js', content: 'x' },
        { name: 'node_modules/pkg/index.js', content: 'x' },
        { name: 'frontend/dist/bundle.js', content: 'x' },
        { name: '.git/HEAD', content: 'x' },
      ]);

      const { files } = projectExportService.extractExportableFiles(zip);

      const paths = files.map((f) => f.relativePath);
      expect(paths).toEqual(['src/index.js']);
    });

    it('excludes .DS_Store/Thumbs.db and blocks raw .env files while allowing .env.example', () => {
      const zip = buildZip([
        { name: '.DS_Store', content: 'x' },
        { name: '.env', content: 'SECRET=1' },
        { name: '.env.production', content: 'SECRET=2' },
        { name: '.env.example', content: 'SECRET=' },
        { name: 'app.js', content: 'x' },
      ]);

      const { files } = projectExportService.extractExportableFiles(zip);

      const paths = files.map((f) => f.relativePath).sort();
      expect(paths).toEqual(['.env.example', 'app.js']);
    });

    it("respects the project's own .gitignore on top of the hard-coded rules", () => {
      const zip = buildZip([
        { name: '.gitignore', content: 'secret.txt\nlogs/\n' },
        { name: 'secret.txt', content: 'shh' },
        { name: 'logs/app.log', content: 'log line' },
        { name: 'app.js', content: 'x' },
      ]);

      const { files } = projectExportService.extractExportableFiles(zip);

      const paths = files.map((f) => f.relativePath).sort();
      expect(paths).toEqual(['.gitignore', 'app.js']);
    });

    it('does not let a malformed .gitignore block the whole export', () => {
      const zip = buildZip([
        { name: '.gitignore', content: '[' },
        { name: 'app.js', content: 'x' },
      ]);

      expect(() => projectExportService.extractExportableFiles(zip)).not.toThrow();
    });

    it('flags an oversized file as skipped rather than including it', () => {
      const bigBuffer = Buffer.alloc(46 * 1024 * 1024, 'a');
      const zip = new AdmZip();
      zip.addFile('huge.bin', bigBuffer);

      const { files, skipped } = projectExportService.extractExportableFiles(zip.toBuffer());

      expect(files).toHaveLength(0);
      expect(skipped[0]).toMatch(/huge\.bin \(too large/);
    });

    it('drops a zip-slip / path-traversal entry as unsafe rather than extracting it', () => {
      const zip = new AdmZip();
      zip.addFile('safe.js', Buffer.from('x'));
      const entries = zip.getEntries();
      entries[0].entryName = '../../etc/passwd';

      const { files, skipped } = projectExportService.extractExportableFiles(zip.toBuffer());

      expect(files).toHaveLength(0);
      expect(skipped[0]).toMatch(/unsafe path/);
    });

    it('does not treat a nested README as the "root README" for hasReadme', () => {
      const zip = buildZip([{ name: 'docs/README.md', content: '# nested' }]);

      const { hasReadme } = projectExportService.extractExportableFiles(zip);

      expect(hasReadme).toBe(false);
    });
  });

  describe('runExport (orchestration)', () => {
    const buildSimpleZip = () => buildZip([{ name: 'index.js', content: 'x' }]);

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('does nothing when the export record no longer exists', async () => {
      ProjectExport.findById.mockResolvedValue(null);
      await projectExportService.runExport('missing-id');
      expect(Purchase.findOne).not.toHaveBeenCalled();
    });

    it('marks the export failed with a friendly message when ownership can no longer be verified', async () => {
      const exportDoc = { save: jest.fn().mockResolvedValue(true), userId: 'u1', websiteId: 'w1', purchaseId: 'p1' };
      ProjectExport.findById.mockResolvedValue(exportDoc);
      Purchase.findOne.mockResolvedValue(null);
      Website.findById.mockResolvedValue({ sourceCodeUrl: 's.zip' });
      GithubConnection.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ accessTokenEncrypted: 'enc(tok)' }) });

      await projectExportService.runExport('export-1');

      expect(exportDoc.status).toBe('failed');
      expect(exportDoc.errorMessage).toBe('We could no longer verify your purchase of this project.');
      expect(exportDoc.save).toHaveBeenCalled();
    });

    it('fails with a friendly message when the website has no source files', async () => {
      const exportDoc = { save: jest.fn().mockResolvedValue(true) };
      ProjectExport.findById.mockResolvedValue(exportDoc);
      Purchase.findOne.mockResolvedValue({ _id: 'p1' });
      Website.findById.mockResolvedValue({ sourceCodeUrl: null });
      GithubConnection.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ accessTokenEncrypted: 'enc(tok)' }) });

      await projectExportService.runExport('export-1');

      expect(exportDoc.errorMessage).toBe("This project's source files are not available right now.");
    });

    it('fails when there is no GitHub connection', async () => {
      const exportDoc = { save: jest.fn().mockResolvedValue(true) };
      ProjectExport.findById.mockResolvedValue(exportDoc);
      Purchase.findOne.mockResolvedValue({ _id: 'p1' });
      Website.findById.mockResolvedValue({ sourceCodeUrl: 's.zip' });
      GithubConnection.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

      await projectExportService.runExport('export-1');

      expect(exportDoc.errorMessage).toBe('Your GitHub connection is missing. Please reconnect and try again.');
    });

    it('fails with NAME_TAKEN friendly message when GitHub reports a duplicate repo', async () => {
      const exportDoc = {
        save: jest.fn().mockResolvedValue(true),
        repositoryName: 'app', description: '', visibility: 'private',
      };
      ProjectExport.findById.mockResolvedValue(exportDoc);
      Purchase.findOne.mockResolvedValue({ _id: 'p1' });
      Website.findById.mockResolvedValue({ sourceCodeUrl: 'https://cdn/s.zip', name: 'App' });
      GithubConnection.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ accessTokenEncrypted: 'enc(tok)' }) });
      axios.get.mockResolvedValue({ data: buildSimpleZip() });

      githubService.createRepository.mockRejectedValue(new Error('taken'));
      githubService.isRepoNameTakenError.mockReturnValue(true);
      githubService.isAuthError.mockReturnValue(false);

      await projectExportService.runExport('export-1');

      expect(exportDoc.errorMessage).toMatch(/already exists in your GitHub account/);
    });

    it('fails with AUTH_EXPIRED friendly message when the token is stale', async () => {
      const exportDoc = { save: jest.fn().mockResolvedValue(true), repositoryName: 'app', visibility: 'public' };
      ProjectExport.findById.mockResolvedValue(exportDoc);
      Purchase.findOne.mockResolvedValue({ _id: 'p1' });
      Website.findById.mockResolvedValue({ sourceCodeUrl: 'https://cdn/s.zip', name: 'App' });
      GithubConnection.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ accessTokenEncrypted: 'enc(tok)' }) });
      axios.get.mockResolvedValue({ data: buildSimpleZip() });

      githubService.createRepository.mockRejectedValue(new Error('unauthorized'));
      githubService.isRepoNameTakenError.mockReturnValue(false);
      githubService.isAuthError.mockReturnValue(true);

      await projectExportService.runExport('export-1');

      expect(exportDoc.errorMessage).toMatch(/authorization has expired/);
    });

    it('fails with NO_FILES when the zip has nothing exportable after filtering', async () => {
      const exportDoc = { save: jest.fn().mockResolvedValue(true) };
      ProjectExport.findById.mockResolvedValue(exportDoc);
      Purchase.findOne.mockResolvedValue({ _id: 'p1' });
      Website.findById.mockResolvedValue({ sourceCodeUrl: 'https://cdn/s.zip', name: 'App' });
      GithubConnection.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ accessTokenEncrypted: 'enc(tok)' }) });
      axios.get.mockResolvedValue({ data: buildZip([{ name: 'node_modules/pkg/index.js', content: 'x' }]) });

      await projectExportService.runExport('export-1');

      expect(exportDoc.errorMessage).toMatch(/No exportable files were found/);
    });

    it('completes the full pipeline successfully and records the resulting repository', async () => {
      jest.useFakeTimers();
      const exportDoc = {
        save: jest.fn().mockResolvedValue(true),
        repositoryName: 'app',
        description: 'desc',
        visibility: 'private',
      };
      ProjectExport.findById.mockResolvedValue(exportDoc);
      Purchase.findOne.mockResolvedValue({ _id: 'p1' });
      Website.findById.mockResolvedValue({ sourceCodeUrl: 'websites/s.zip', name: 'App' });
      GithubConnection.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ accessTokenEncrypted: 'enc(tok)' }) });
      supabaseService.createSignedUrl.mockResolvedValue('https://signed/s.zip');
      axios.get.mockResolvedValue({ data: buildZip([{ name: 'index.js', content: 'x' }, { name: 'README.md', content: '# hi' }]) });

      githubService.createRepository.mockResolvedValue({ owner: 'me', name: 'app', htmlUrl: 'https://github.com/me/app', defaultBranch: 'main' });
      githubService.createBlob.mockResolvedValue('blob-sha');
      githubService.createTree.mockResolvedValue('tree-sha');
      githubService.createCommit.mockResolvedValue('commit-sha');
      githubService.updateRef.mockResolvedValue(undefined);

      const runPromise = projectExportService.runExport('export-1');
      await jest.runAllTimersAsync();
      await runPromise;
      jest.useRealTimers();

      expect(supabaseService.createSignedUrl).toHaveBeenCalledWith('websites/s.zip', 300);
      expect(githubService.createRepository).toHaveBeenCalledWith('tok', { name: 'app', description: 'desc', isPrivate: true });
      expect(githubService.updateRef).toHaveBeenCalledWith('tok', 'me', 'app', 'main', 'commit-sha');
      expect(exportDoc.status).toBe('success');
      expect(exportDoc.repositoryUrl).toBe('https://github.com/me/app');
      expect(exportDoc.fileCount).toBe(2);
    });

    it('fetches the zip directly (no signed URL) when the source is already a public URL', async () => {
      jest.useFakeTimers();
      const exportDoc = { save: jest.fn().mockResolvedValue(true), repositoryName: 'app', visibility: 'public' };
      ProjectExport.findById.mockResolvedValue(exportDoc);
      Purchase.findOne.mockResolvedValue({ _id: 'p1' });
      Website.findById.mockResolvedValue({ sourceCodeUrl: 'https://public-cdn.example.com/s.zip', name: 'App' });
      GithubConnection.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue({ accessTokenEncrypted: 'enc(tok)' }) });
      axios.get.mockResolvedValue({ data: buildZip([{ name: 'index.js', content: 'x' }]) });

      githubService.createRepository.mockResolvedValue({ owner: 'me', name: 'app', htmlUrl: 'u', defaultBranch: 'main' });
      githubService.createBlob.mockResolvedValue('sha');
      githubService.createTree.mockResolvedValue('tree');
      githubService.createCommit.mockResolvedValue('commit');
      githubService.updateRef.mockResolvedValue(undefined);

      const runPromise = projectExportService.runExport('export-1');
      await jest.runAllTimersAsync();
      await runPromise;
      jest.useRealTimers();

      expect(supabaseService.createSignedUrl).not.toHaveBeenCalled();
      expect(axios.get).toHaveBeenCalledWith('https://public-cdn.example.com/s.zip', expect.objectContaining({ responseType: 'arraybuffer' }));
    });
  });
});
