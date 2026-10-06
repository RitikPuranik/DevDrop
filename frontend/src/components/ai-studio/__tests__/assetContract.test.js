import { describe, expect, it } from 'vitest';
import { buildAssetContract } from '../assetContract';

describe('buildAssetContract', () => {
  it('builds the canonical shape from upload responses', () => {
    const c = buildAssetContract({
      resume: { _id: 'r1', fileName: 'resume.pdf', mimeType: 'application/pdf' },
      images: [{ assetId: 'i1', fileName: 'profile.jpg', mimeType: 'image/jpeg' }],
      videos: [{ _id: 'v1', originalName: 'demo.mp4', mimeType: 'video/mp4' }],
    });
    expect(Object.keys(c).sort()).toEqual(['images', 'other', 'resume', 'videos']);
    expect(c.resume.assetId).toBe('r1');
    expect(c.images[0].assetId).toBe('i1');
    expect(c.videos[0].fileName).toBe('demo.mp4');
  });
  it('handles no assets', () => {
    expect(buildAssetContract()).toEqual({ resume: null, images: [], videos: [], other: [] });
  });
  it('drops entries without an id instead of sending junk', () => {
    expect(buildAssetContract({ images: [{ fileName: 'x.png' }, null] }).images).toEqual([]);
  });
});
