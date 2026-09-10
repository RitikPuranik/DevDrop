jest.mock('../../../../src/services/genie/client');
const genieClient = require('../../../../src/services/genie/client');
const genieService = require('../../../../src/services/genie/service');

describe('genie/service', () => {
  afterEach(() => jest.clearAllMocks());

  describe('buildPortfolioPrompt', () => {
    it('includes name, role, bio, skills, projects, social links and preferences', () => {
      const prompt = genieService.buildPortfolioPrompt({
        userData: {
          name: 'Ritik',
          role: 'Full-stack developer',
          bio: 'I build things.',
          skills: ['React', 'Node.js'],
          projects: [{ title: 'DevDrop', description: 'A marketplace', link: 'https://example.com' }],
          socialLinks: { github: 'https://github.com/ritik', linkedin: null },
        },
        preferences: { style: 'modern', theme: 'dark', animations: true },
      });

      expect(prompt).toContain('Ritik');
      expect(prompt).toContain('Full-stack developer');
      expect(prompt).toContain('I build things.');
      expect(prompt).toContain('React, Node.js');
      expect(prompt).toContain('DevDrop');
      expect(prompt).toContain('https://github.com/ritik');
      expect(prompt).toContain('modern design style');
      expect(prompt).toContain('dark theme');
      expect(prompt).toContain('subtle animations');
    });

    it('degrades gracefully with minimal input', () => {
      const prompt = genieService.buildPortfolioPrompt({});
      expect(prompt).toContain('personal portfolio website');
    });
  });

  describe('startPortfolioGeneration', () => {
    it('sends the built prompt and image URLs to genieClient.createGeneration', async () => {
      genieClient.createGeneration.mockResolvedValue({
        data: { id: 'gen-1', status: 'pending', message: 'Generation started.' },
      });

      const result = await genieService.startPortfolioGeneration(
        {
          userData: { name: 'Ritik', role: 'Developer' },
          preferences: {},
          assets: [{ type: 'profile-image', url: 'https://cdn.example.com/a.jpg' }],
        },
        { ownerId: 'user-1' }
      );

      expect(genieClient.createGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Ritik'),
          targetLanguage: 'typescript',
          complexity: 'moderate',
          imageUrls: ['https://cdn.example.com/a.jpg'],
        }),
        { ownerId: 'user-1' }
      );
      expect(result).toEqual({ genieGenerationId: 'gen-1', status: 'pending', prompt: expect.any(String) });
    });
  });

  describe('getGenerationStatus', () => {
    it('maps Genie response fields to DevDrop field names', async () => {
      genieClient.getGeneration.mockResolvedValue({
        data: {
          status: 'completed',
          files: [{ path: 'App.tsx', content: '...' }],
          error: null,
          previewUrl: 'https://preview.example.com',
          deploymentStatus: null,
          fileCount: 1,
        },
      });

      const result = await genieService.getGenerationStatus('gen-1', { ownerId: 'user-1', full: true });

      expect(genieClient.getGeneration).toHaveBeenCalledWith('gen-1', { ownerId: 'user-1', full: true });
      expect(result.status).toBe('completed');
      expect(result.files).toHaveLength(1);
      expect(result.previewUrl).toBe('https://preview.example.com');
    });
  });

  describe('isGenerationTerminal', () => {
    it('treats completed and failed as terminal', () => {
      expect(genieService.isGenerationTerminal('completed')).toBe(true);
      expect(genieService.isGenerationTerminal('failed')).toBe(true);
      expect(genieService.isGenerationTerminal('pending')).toBe(false);
      expect(genieService.isGenerationTerminal('processing')).toBe(false);
    });
  });
});
