/**
 * .varie Bundle Unpacker
 *
 * Unpacks plain (unencrypted) .varie bundles containing Spine model files.
 *
 * Bundle format:
 * [VARI magic (4 bytes)]
 * [version (4 bytes)]
 * [file count (4 bytes)]
 * [file entries...]
 *   - path length (4 bytes, little-endian)
 *   - path (UTF-8 string)
 *   - data length (4 bytes, little-endian)
 *   - data (raw bytes)
 */

import { SDKError, SDKErrorCode, type ModelFiles, type UnpackedModel, type ModelType } from './types';

/** Magic header for .varie bundles */
const VARIE_MAGIC = 'VARI';

/**
 * Check if data is a valid .varie bundle
 */
export function isVarieBundle(data: ArrayBuffer): boolean {
  if (data.byteLength < 4) return false;
  const magic = String.fromCharCode(...new Uint8Array(data.slice(0, 4)));
  return magic === VARIE_MAGIC;
}

/**
 * Unpack a .varie bundle into individual files
 *
 * @param data - Raw bundle data
 * @returns Map of filename to file data
 * @throws SDKError if bundle is invalid
 */
export function unpackBundle(data: ArrayBuffer): Map<string, ArrayBuffer> {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);
  let offset = 0;

  // Verify magic header
  const magic = String.fromCharCode(...bytes.slice(0, 4));
  if (magic !== VARIE_MAGIC) {
    throw new SDKError(
      SDKErrorCode.INVALID_BUNDLE,
      `Invalid bundle format: expected '${VARIE_MAGIC}' header, got '${magic}'`
    );
  }
  offset += 4;

  // Read version (skip for now, reserved for future use)
  // const version = view.getUint32(offset, true);
  offset += 4;

  // Read file count
  const fileCount = view.getUint32(offset, true);
  offset += 4;

  if (fileCount === 0) {
    throw new SDKError(SDKErrorCode.INVALID_BUNDLE, 'Bundle contains no files');
  }

  if (fileCount > 100) {
    throw new SDKError(
      SDKErrorCode.INVALID_BUNDLE,
      `Bundle claims ${fileCount} files, which exceeds reasonable limit`
    );
  }

  const files = new Map<string, ArrayBuffer>();

  for (let i = 0; i < fileCount; i++) {
    // Bounds check
    if (offset + 4 > data.byteLength) {
      throw new SDKError(
        SDKErrorCode.INVALID_BUNDLE,
        `Unexpected end of bundle at file ${i + 1}/${fileCount}`
      );
    }

    // Read path length
    const pathLength = view.getUint32(offset, true);
    offset += 4;

    if (pathLength > 1000) {
      throw new SDKError(
        SDKErrorCode.INVALID_BUNDLE,
        `File path length ${pathLength} exceeds reasonable limit`
      );
    }

    if (offset + pathLength > data.byteLength) {
      throw new SDKError(SDKErrorCode.INVALID_BUNDLE, 'Unexpected end of bundle reading path');
    }

    // Read path
    const pathBytes = bytes.slice(offset, offset + pathLength);
    const path = new TextDecoder().decode(pathBytes);
    offset += pathLength;

    if (offset + 4 > data.byteLength) {
      throw new SDKError(SDKErrorCode.INVALID_BUNDLE, 'Unexpected end of bundle reading data length');
    }

    // Read data length
    const dataLength = view.getUint32(offset, true);
    offset += 4;

    if (offset + dataLength > data.byteLength) {
      throw new SDKError(
        SDKErrorCode.INVALID_BUNDLE,
        `File '${path}' claims ${dataLength} bytes but only ${data.byteLength - offset} remain`
      );
    }

    // Read data
    const fileData = data.slice(offset, offset + dataLength);
    offset += dataLength;

    files.set(path, fileData);
  }

  return files;
}

/**
 * Extract Spine model files from unpacked bundle
 *
 * @param files - Map of filename to file data from unpackBundle()
 * @returns ModelFiles with skeleton, atlas, texture, and raw files
 * @throws SDKError if required files are missing
 */
export function extractModelFiles(files: Map<string, ArrayBuffer>): ModelFiles {
  const fileList = Array.from(files.keys());

  // Find required files
  const jsonFile = fileList.find((f) => f.endsWith('.json'));
  const atlasFile = fileList.find((f) => f.endsWith('.atlas'));
  const pngFile = fileList.find((f) => f.endsWith('.png'));

  if (!jsonFile) {
    throw new SDKError(
      SDKErrorCode.INVALID_BUNDLE,
      `No .json file found in bundle. Files: ${fileList.join(', ')}`
    );
  }

  if (!atlasFile) {
    throw new SDKError(
      SDKErrorCode.INVALID_BUNDLE,
      `No .atlas file found in bundle. Files: ${fileList.join(', ')}`
    );
  }

  if (!pngFile) {
    throw new SDKError(
      SDKErrorCode.INVALID_BUNDLE,
      `No .png file found in bundle. Files: ${fileList.join(', ')}`
    );
  }

  const jsonData = files.get(jsonFile)!;
  const atlasData = files.get(atlasFile)!;
  const pngData = files.get(pngFile)!;

  // Parse skeleton JSON
  const jsonText = new TextDecoder().decode(jsonData);
  let skeleton: unknown;
  try {
    skeleton = JSON.parse(jsonText);
  } catch (e) {
    throw new SDKError(
      SDKErrorCode.INVALID_BUNDLE,
      'Failed to parse skeleton JSON',
      e
    );
  }

  // Decode atlas text
  const atlas = new TextDecoder().decode(atlasData);

  // Create texture blob
  const texture = new Blob([pngData], { type: 'image/png' });

  return {
    skeleton,
    atlas,
    texture,
    raw: files,
  };
}

/**
 * Unpack a .varie bundle and extract model files in one step
 *
 * @param data - Raw bundle data
 * @param characterId - Character ID for the unpacked model
 * @param type - Model type (full or base)
 * @returns UnpackedModel ready for use
 */
export function unpackModel(
  data: ArrayBuffer,
  characterId: string,
  type: ModelType
): UnpackedModel {
  const files = unpackBundle(data);
  const modelFiles = extractModelFiles(files);

  return {
    characterId,
    type,
    files: modelFiles,
    size: data.byteLength,
    cachedAt: Date.now(),
  };
}
