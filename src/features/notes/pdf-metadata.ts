/**
 * PDF Metadata Inspection Utility (Isomorphic: works in Node.js & browser).
 * Extracts document page counts and metadata without external native dependencies.
 */

/**
 * Safely extracts PDF page count from PDF binary header/body dictionaries.
 * Checks root `/Type /Pages ... /Count N` first, then falls back to `/Type /Page` object count.
 */
export function extractPdfPageCount(
  data: Uint8Array | ArrayBuffer | Buffer,
): number | null {
  if (!data) return null;

  const bytes =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : (data as Uint8Array);

  if (bytes.length < 4) return null;

  // Verify PDF magic bytes "%PDF-" (0x25 0x50 0x44 0x46)
  if (
    bytes[0] !== 0x25 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x44 ||
    bytes[3] !== 0x46
  ) {
    return null;
  }

  // Convert binary to latin1 string for fast regex scanning
  const text =
    typeof Buffer !== "undefined" && Buffer.isBuffer(bytes)
      ? bytes.toString("latin1")
      : new TextDecoder("latin1").decode(bytes);

  // Strategy 1: Find << ... /Type /Pages ... /Count N ... >>
  const dictMatches = text.match(/<<[\s\S]*?>>/g) || [];
  let maxPagesCount = 0;
  for (const dict of dictMatches) {
    if (/\/Type\s*\/Pages\b/.test(dict)) {
      const countMatch = dict.match(/\/Count\s+(\d+)\b/);
      if (countMatch && countMatch[1]) {
        const val = Number.parseInt(countMatch[1], 10);
        if (Number.isFinite(val) && val > maxPagesCount) {
          maxPagesCount = val;
        }
      }
    }
  }
  if (maxPagesCount > 0) {
    return maxPagesCount;
  }

  // Strategy 2: Count /Type /Page occurrences (singular leaf pages)
  const pageMatches = text.match(/\/Type\s*\/Page\b(?!\s*s)/g);
  if (pageMatches && pageMatches.length > 0) {
    return pageMatches.length;
  }

  return null;
}
