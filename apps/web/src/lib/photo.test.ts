import { describe, expect, it } from 'vitest';
import { checkPhotoFile } from './photo';

describe('checkPhotoFile', () => {
  it('accepts JPEG, PNG and WebP up to 5 MB', () => {
    expect(checkPhotoFile({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(checkPhotoFile({ type: 'image/png', size: 5 * 1024 * 1024 })).toBeNull();
    expect(checkPhotoFile({ type: 'image/webp', size: 10 })).toBeNull();
  });

  it('refuses other types, empty and oversized files', () => {
    expect(checkPhotoFile({ type: 'image/svg+xml', size: 10 })).toMatch(/JPEG, PNG or WebP/);
    expect(checkPhotoFile({ type: 'image/gif', size: 10 })).toMatch(/JPEG, PNG or WebP/);
    expect(checkPhotoFile({ type: '', size: 10 })).toMatch(/JPEG, PNG or WebP/);
    expect(checkPhotoFile({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toMatch(/5 MB/);
    expect(checkPhotoFile({ type: 'image/png', size: 0 })).toMatch(/empty/);
  });
});
