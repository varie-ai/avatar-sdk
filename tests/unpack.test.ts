/**
 * Tests for .varie bundle unpacking
 */

import { describe, it, expect } from 'vitest';
import { unpackBundle, extractModelFiles, isVarieBundle, unpackModel } from '../src/unpack';
import { SDKError, SDKErrorCode } from '../src/types';

/**
 * Create a mock .varie bundle for testing
 */
function createMockBundle(files: Record<string, string | Uint8Array>): ArrayBuffer {
  const encoder = new TextEncoder();
  const fileEntries = Object.entries(files);

  // Calculate total size
  let totalSize = 4 + 4 + 4; // magic + version + file count
  for (const [path, content] of fileEntries) {
    const pathBytes = encoder.encode(path);
    const contentBytes = typeof content === 'string' ? encoder.encode(content) : content;
    totalSize += 4 + pathBytes.length + 4 + contentBytes.length;
  }

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  // Write magic header "VARI"
  bytes.set([0x56, 0x41, 0x52, 0x49], offset); // VARI
  offset += 4;

  // Write version (1)
  view.setUint32(offset, 1, true);
  offset += 4;

  // Write file count
  view.setUint32(offset, fileEntries.length, true);
  offset += 4;

  // Write files
  for (const [path, content] of fileEntries) {
    const pathBytes = encoder.encode(path);
    const contentBytes = typeof content === 'string' ? encoder.encode(content) : content;

    // Path length
    view.setUint32(offset, pathBytes.length, true);
    offset += 4;

    // Path
    bytes.set(pathBytes, offset);
    offset += pathBytes.length;

    // Content length
    view.setUint32(offset, contentBytes.length, true);
    offset += 4;

    // Content
    bytes.set(contentBytes, offset);
    offset += contentBytes.length;
  }

  return buffer;
}

describe('isVarieBundle', () => {
  it('returns true for valid VARI header', () => {
    const bundle = createMockBundle({ 'test.txt': 'hello' });
    expect(isVarieBundle(bundle)).toBe(true);
  });

  it('returns false for invalid header', () => {
    const buffer = new ArrayBuffer(10);
    const bytes = new Uint8Array(buffer);
    bytes.set([0x50, 0x4B, 0x03, 0x04]); // ZIP header
    expect(isVarieBundle(buffer)).toBe(false);
  });

  it('returns false for empty buffer', () => {
    const buffer = new ArrayBuffer(0);
    expect(isVarieBundle(buffer)).toBe(false);
  });

  it('returns false for buffer smaller than 4 bytes', () => {
    const buffer = new ArrayBuffer(3);
    expect(isVarieBundle(buffer)).toBe(false);
  });
});

describe('unpackBundle', () => {
  it('unpacks a valid bundle with single file', () => {
    const bundle = createMockBundle({
      'test.txt': 'Hello, World!',
    });

    const files = unpackBundle(bundle);
    expect(files.size).toBe(1);
    expect(files.has('test.txt')).toBe(true);

    const content = new TextDecoder().decode(files.get('test.txt')!);
    expect(content).toBe('Hello, World!');
  });

  it('unpacks a bundle with multiple files', () => {
    const bundle = createMockBundle({
      'skeleton.json': '{"bones":[]}',
      'character.atlas': 'atlas content',
      'character.png': new Uint8Array([0x89, 0x50, 0x4E, 0x47]), // PNG header
    });

    const files = unpackBundle(bundle);
    expect(files.size).toBe(3);
    expect(files.has('skeleton.json')).toBe(true);
    expect(files.has('character.atlas')).toBe(true);
    expect(files.has('character.png')).toBe(true);
  });

  it('throws SDKError for invalid magic header', () => {
    const buffer = new ArrayBuffer(100);
    const bytes = new Uint8Array(buffer);
    bytes.set([0x50, 0x4B, 0x03, 0x04]); // ZIP header instead of VARI

    expect(() => unpackBundle(buffer)).toThrow(SDKError);
    try {
      unpackBundle(buffer);
    } catch (e) {
      expect(e).toBeInstanceOf(SDKError);
      expect((e as SDKError).code).toBe(SDKErrorCode.INVALID_BUNDLE);
    }
  });

  it('throws SDKError for empty file count', () => {
    const buffer = new ArrayBuffer(12);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Magic
    bytes.set([0x56, 0x41, 0x52, 0x49], 0);
    // Version
    view.setUint32(4, 1, true);
    // File count = 0
    view.setUint32(8, 0, true);

    expect(() => unpackBundle(buffer)).toThrow(SDKError);
    try {
      unpackBundle(buffer);
    } catch (e) {
      expect((e as SDKError).code).toBe(SDKErrorCode.INVALID_BUNDLE);
      expect((e as SDKError).message).toContain('no files');
    }
  });

  it('throws SDKError for unreasonable file count', () => {
    const buffer = new ArrayBuffer(12);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    bytes.set([0x56, 0x41, 0x52, 0x49], 0);
    view.setUint32(4, 1, true);
    view.setUint32(8, 200, true); // 200 files - exceeds limit

    expect(() => unpackBundle(buffer)).toThrow(SDKError);
    try {
      unpackBundle(buffer);
    } catch (e) {
      expect((e as SDKError).code).toBe(SDKErrorCode.INVALID_BUNDLE);
      expect((e as SDKError).message).toContain('exceeds');
    }
  });
});

describe('extractModelFiles', () => {
  it('extracts skeleton, atlas, and texture from file map', () => {
    const skeletonJson = { bones: [{ name: 'root' }], slots: [] };
    const atlasText = 'character.png\nsize: 1024,1024\nformat: RGBA8888';
    const pngData = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    const files = new Map<string, ArrayBuffer>();
    files.set('skeleton.json', new TextEncoder().encode(JSON.stringify(skeletonJson)).buffer);
    files.set('character.atlas', new TextEncoder().encode(atlasText).buffer);
    files.set('character.png', pngData.buffer);

    const modelFiles = extractModelFiles(files);

    expect(modelFiles.skeleton).toEqual(skeletonJson);
    expect(modelFiles.atlas).toBe(atlasText);
    expect(modelFiles.texture).toBeInstanceOf(Blob);
    expect(modelFiles.texture.type).toBe('image/png');
    expect(modelFiles.raw).toBe(files);
  });

  it('throws SDKError if no .json file', () => {
    const files = new Map<string, ArrayBuffer>();
    files.set('character.atlas', new TextEncoder().encode('atlas').buffer);
    files.set('character.png', new Uint8Array([0x89, 0x50]).buffer);

    expect(() => extractModelFiles(files)).toThrow(SDKError);
    try {
      extractModelFiles(files);
    } catch (e) {
      expect((e as SDKError).code).toBe(SDKErrorCode.INVALID_BUNDLE);
      expect((e as SDKError).message).toContain('.json');
    }
  });

  it('throws SDKError if no .atlas file', () => {
    const files = new Map<string, ArrayBuffer>();
    files.set('skeleton.json', new TextEncoder().encode('{}').buffer);
    files.set('character.png', new Uint8Array([0x89, 0x50]).buffer);

    expect(() => extractModelFiles(files)).toThrow(SDKError);
    try {
      extractModelFiles(files);
    } catch (e) {
      expect((e as SDKError).code).toBe(SDKErrorCode.INVALID_BUNDLE);
      expect((e as SDKError).message).toContain('.atlas');
    }
  });

  it('throws SDKError if no .png file', () => {
    const files = new Map<string, ArrayBuffer>();
    files.set('skeleton.json', new TextEncoder().encode('{}').buffer);
    files.set('character.atlas', new TextEncoder().encode('atlas').buffer);

    expect(() => extractModelFiles(files)).toThrow(SDKError);
    try {
      extractModelFiles(files);
    } catch (e) {
      expect((e as SDKError).code).toBe(SDKErrorCode.INVALID_BUNDLE);
      expect((e as SDKError).message).toContain('.png');
    }
  });

  it('throws SDKError for invalid JSON', () => {
    const files = new Map<string, ArrayBuffer>();
    files.set('skeleton.json', new TextEncoder().encode('not valid json').buffer);
    files.set('character.atlas', new TextEncoder().encode('atlas').buffer);
    files.set('character.png', new Uint8Array([0x89, 0x50]).buffer);

    expect(() => extractModelFiles(files)).toThrow(SDKError);
    try {
      extractModelFiles(files);
    } catch (e) {
      expect((e as SDKError).code).toBe(SDKErrorCode.INVALID_BUNDLE);
      expect((e as SDKError).message).toContain('JSON');
    }
  });
});

describe('unpackModel', () => {
  it('unpacks bundle and returns UnpackedModel', () => {
    const skeletonJson = { bones: [{ name: 'root' }] };
    const bundle = createMockBundle({
      'skeleton.json': JSON.stringify(skeletonJson),
      'character.atlas': 'atlas content',
      'character.png': new Uint8Array([0x89, 0x50, 0x4E, 0x47]),
    });

    const model = unpackModel(bundle, 'test_char_123', 'full');

    expect(model.characterId).toBe('test_char_123');
    expect(model.type).toBe('full');
    expect(model.files.skeleton).toEqual(skeletonJson);
    expect(model.files.atlas).toBe('atlas content');
    expect(model.size).toBe(bundle.byteLength);
    expect(model.cachedAt).toBeGreaterThan(0);
  });
});
