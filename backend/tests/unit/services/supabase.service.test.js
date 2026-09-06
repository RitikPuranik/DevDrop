jest.mock('../../../src/shared/config/supabase', () => ({
  storage: { from: jest.fn() },
}));

const supabase = require('../../../src/shared/config/supabase');
const supabaseService = require('../../../src/services/supabase.service');

describe('supabase.service', () => {
  let bucket;

  beforeEach(() => {
    bucket = {
      upload: jest.fn(),
      getPublicUrl: jest.fn(),
      createSignedUrl: jest.fn(),
      createSignedUrls: jest.fn(),
      remove: jest.fn(),
    };
    supabase.storage.from.mockReturnValue(bucket);
  });

  describe('uploadFile', () => {
    const file = { originalname: 'photo.png', mimetype: 'image/png', buffer: Buffer.from('x'), size: 123 };

    it('uploads and returns the storage path/metadata', async () => {
      bucket.upload.mockResolvedValue({ data: { path: 'avatars/photo-123.png' }, error: null });

      const result = await supabaseService.uploadFile(file, 'avatars');

      expect(result.path).toBe('avatars/photo-123.png');
      expect(result.size).toBe(123);
      expect(result.uploadedAt).toBeInstanceOf(Date);
    });

    it('uses a custom file name when given', async () => {
      bucket.upload.mockResolvedValue({ data: { path: 'avatars/custom.png' }, error: null });

      const result = await supabaseService.uploadFile(file, 'avatars', 'custom.png');

      expect(result.fileName).toBe('custom.png');
    });

    it('throws and logs when Supabase returns an error', async () => {
      bucket.upload.mockResolvedValue({ data: null, error: { message: 'bucket not found' } });

      await expect(supabaseService.uploadFile(file, 'avatars')).rejects.toThrow('Supabase upload error: bucket not found');
    });
  });

  describe('getPublicUrl', () => {
    it('returns the public URL for a path', () => {
      bucket.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn/x.png' } });

      expect(supabaseService.getPublicUrl('avatars/x.png')).toBe('https://cdn/x.png');
    });
  });

  describe('createSignedUrl / createSignedUrls', () => {
    it('returns a single signed URL', async () => {
      bucket.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/x' }, error: null });

      const url = await supabaseService.createSignedUrl('avatars/x.png');

      expect(url).toBe('https://signed/x');
    });

    it('throws when signing a single URL fails', async () => {
      bucket.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'not found' } });

      await expect(supabaseService.createSignedUrl('missing.png')).rejects.toThrow('Signed URL error: not found');
    });

    it('returns multiple signed URLs', async () => {
      bucket.createSignedUrls.mockResolvedValue({ data: [{ signedUrl: 'a' }, { signedUrl: 'b' }], error: null });

      const urls = await supabaseService.createSignedUrls(['a.png', 'b.png']);

      expect(urls).toEqual([{ signedUrl: 'a' }, { signedUrl: 'b' }]);
    });

    it('throws when signing multiple URLs fails', async () => {
      bucket.createSignedUrls.mockResolvedValue({ data: null, error: { message: 'bad batch' } });

      await expect(supabaseService.createSignedUrls(['a.png'])).rejects.toThrow('Signed URLs error: bad batch');
    });
  });

  describe('deleteFile / deleteFiles', () => {
    it('deletes a single file', async () => {
      bucket.remove.mockResolvedValue({ error: null });

      await expect(supabaseService.deleteFile('a.png')).resolves.toBe(true);
      expect(bucket.remove).toHaveBeenCalledWith(['a.png']);
    });

    it('throws when deleting a single file fails', async () => {
      bucket.remove.mockResolvedValue({ error: { message: 'permission denied' } });

      await expect(supabaseService.deleteFile('a.png')).rejects.toThrow('Delete file error: permission denied');
    });

    it('deletes multiple files', async () => {
      bucket.remove.mockResolvedValue({ error: null });

      await expect(supabaseService.deleteFiles(['a.png', 'b.png'])).resolves.toBe(true);
      expect(bucket.remove).toHaveBeenCalledWith(['a.png', 'b.png']);
    });

    it('throws when deleting multiple files fails', async () => {
      bucket.remove.mockResolvedValue({ error: { message: 'oops' } });

      await expect(supabaseService.deleteFiles(['a.png'])).rejects.toThrow('Delete files error: oops');
    });
  });

  describe('uploadPreviewVideo', () => {
    it('uploads and attaches a public URL', async () => {
      bucket.upload.mockResolvedValue({ data: { path: 'preview-videos/v.mp4' }, error: null });
      bucket.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn/v.mp4' } });

      const result = await supabaseService.uploadPreviewVideo({ originalname: 'v.mp4', mimetype: 'video/mp4', buffer: Buffer.from('x'), size: 10 });

      expect(result.publicUrl).toBe('https://cdn/v.mp4');
    });
  });

  describe('uploadAvatar', () => {
    it('uploads and attaches a signed URL', async () => {
      bucket.upload.mockResolvedValue({ data: { path: 'avatars/a.png' }, error: null });
      bucket.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/a.png' }, error: null });

      const result = await supabaseService.uploadAvatar({ originalname: 'a.png', mimetype: 'image/png', buffer: Buffer.from('x'), size: 5 });

      expect(result.publicUrl).toBe('https://signed/a.png');
    });
  });

  describe('deleteAvatar', () => {
    it('does nothing and returns false for an empty avatar', async () => {
      expect(await supabaseService.deleteAvatar(undefined)).toBe(false);
      expect(bucket.remove).not.toHaveBeenCalled();
    });

    it('skips deleting an external (http) avatar URL, like a Google profile picture', async () => {
      expect(await supabaseService.deleteAvatar('https://lh3.googleusercontent.com/a')).toBe(false);
      expect(bucket.remove).not.toHaveBeenCalled();
    });

    it('deletes a Supabase storage path avatar', async () => {
      bucket.remove.mockResolvedValue({ error: null });

      expect(await supabaseService.deleteAvatar('avatars/a.png')).toBe(true);
      expect(bucket.remove).toHaveBeenCalledWith(['avatars/a.png']);
    });

    it('swallows delete errors and returns false instead of throwing', async () => {
      bucket.remove.mockResolvedValue({ error: { message: 'gone' } });

      await expect(supabaseService.deleteAvatar('avatars/a.png')).resolves.toBe(false);
    });
  });

  describe('deleteWebsiteFiles', () => {
    it('deletes every non-empty file field on the website', async () => {
      bucket.remove.mockResolvedValue({ error: null });
      const website = { sourceCodeUrl: 's.zip', docsUrl: null, videoUrl: 'v.mp4', previewVideoUrl: undefined };

      await supabaseService.deleteWebsiteFiles(website);

      expect(bucket.remove).toHaveBeenCalledWith(['s.zip', 'v.mp4']);
    });

    it('is a no-op success when the website has no files at all', async () => {
      const website = {};

      await expect(supabaseService.deleteWebsiteFiles(website)).resolves.toBe(true);
      expect(bucket.remove).not.toHaveBeenCalled();
    });
  });
});
