import zlib from "node:zlib";
import type { ExportDataset } from "./types";

interface ZipFileEntry {
  name: string;
  content: string | Buffer;
}

/**
 * Escapes characters for XML attribute and text content.
 */
export function escapeXml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Escapes formula characters (=, +, -, @) to prevent spreadsheet injection.
 */
export function sanitizeSpreadsheetFormula(text: string): string {
  if (/^[=+\-@]/.test(text)) {
    return `'${text}`;
  }
  return text;
}

/**
 * Creates a standard PKZIP archive from the provided file records using Node's native zlib.
 */
export function createZipArchive(files: ZipFileEntry[]): Buffer {
  interface FileRecord {
    nameBuf: Buffer;
    crc: number;
    compressedSize: number;
    uncompressedSize: number;
    offset: number;
  }

  const fileRecords: FileRecord[] = [];
  const localChunks: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const contentBuf = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content, "utf8");

    const crc = zlib.crc32(contentBuf);
    const compressed = zlib.deflateRawSync(contentBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0, 6); // General purpose bit flag
    localHeader.writeUInt16LE(8, 8); // Compression method 8 (Deflate)
    localHeader.writeUInt16LE(0, 10); // File last mod time
    localHeader.writeUInt16LE(0, 12); // File last mod date
    localHeader.writeUInt32LE(crc, 14); // CRC-32
    localHeader.writeUInt32LE(compressed.length, 18); // Compressed size
    localHeader.writeUInt32LE(contentBuf.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // File name length
    localHeader.writeUInt16LE(0, 28); // Extra field length

    fileRecords.push({
      nameBuf,
      crc,
      compressedSize: compressed.length,
      uncompressedSize: contentBuf.length,
      offset,
    });

    localChunks.push(localHeader, nameBuf, compressed);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralChunks: Buffer[] = [];
  let centralDirectorySize = 0;

  for (const record of fileRecords) {
    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0); // Central directory header signature
    cdHeader.writeUInt16LE(20, 4); // Version made by (2.0)
    cdHeader.writeUInt16LE(20, 6); // Version needed to extract (2.0)
    cdHeader.writeUInt16LE(0, 8); // General purpose bit flag
    cdHeader.writeUInt16LE(8, 10); // Compression method 8 (Deflate)
    cdHeader.writeUInt16LE(0, 12); // File last mod time
    cdHeader.writeUInt16LE(0, 14); // File last mod date
    cdHeader.writeUInt32LE(record.crc, 16); // CRC-32
    cdHeader.writeUInt32LE(record.compressedSize, 20); // Compressed size
    cdHeader.writeUInt32LE(record.uncompressedSize, 24); // Uncompressed size
    cdHeader.writeUInt16LE(record.nameBuf.length, 28); // File name length
    cdHeader.writeUInt16LE(0, 30); // Extra field length
    cdHeader.writeUInt16LE(0, 32); // File comment length
    cdHeader.writeUInt16LE(0, 34); // Disk number start
    cdHeader.writeUInt16LE(0, 36); // Internal file attributes
    cdHeader.writeUInt32LE(0, 38); // External file attributes
    cdHeader.writeUInt32LE(record.offset, 42); // Relative offset of local header

    centralChunks.push(cdHeader, record.nameBuf);
    centralDirectorySize += cdHeader.length + record.nameBuf.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // End of central dir signature
  eocd.writeUInt16LE(0, 4); // Number of this disk
  eocd.writeUInt16LE(0, 6); // Number of the disk with the start of the central directory
  eocd.writeUInt16LE(fileRecords.length, 8); // Total number of entries in the central dir on this disk
  eocd.writeUInt16LE(fileRecords.length, 10); // Total number of entries in the central dir
  eocd.writeUInt32LE(centralDirectorySize, 12); // Size of the central directory
  eocd.writeUInt32LE(offset, 16); // Offset of start of central directory with respect to starting disk number
  eocd.writeUInt16LE(0, 20); // ZIP file comment length

  return Buffer.concat([...localChunks, ...centralChunks, eocd]);
}

/**
 * Builds the XML content for Sheet 1 (Ringkasan Keuangan).
 */
function buildSummarySheetXml(dataset: ExportDataset): string {
  let row = 1;
  const sheetRows: string[] = [];

  // Title
  sheetRows.push(
    `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>Laporan Keuangan Noka</t></is></c></row>`,
  );
  row++;

  // Period
  sheetRows.push(
    `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>Periode: ${escapeXml(dataset.startDateFormatted)} s.d. ${escapeXml(dataset.endDateFormatted)}</t></is></c></row>`,
  );
  row++;
  row++; // Blank row

  // Cashflow summary cards
  sheetRows.push(
    `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>Total Pemasukan</t></is></c><c r="B${row}"><v>${dataset.totalIncome}</v></c></row>`,
  );
  row++;
  sheetRows.push(
    `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>Total Pengeluaran</t></is></c><c r="B${row}"><v>${dataset.totalExpense}</v></c></row>`,
  );
  row++;
  sheetRows.push(
    `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>Arus Kas Bersih (Net)</t></is></c><c r="B${row}"><v>${dataset.netCashflow}</v></c></row>`,
  );
  row++;
  row++; // Blank row

  // Wallets section
  sheetRows.push(
    `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>Saldo Dompet</t></is></c></row>`,
  );
  row++;
  sheetRows.push(
    `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>Nama Dompet</t></is></c><c r="B${row}" t="inlineStr"><is><t>Saldo Saat Ini (IDR)</t></is></c></row>`,
  );
  row++;

  for (const wallet of dataset.wallets) {
    sheetRows.push(
      `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>${escapeXml(sanitizeSpreadsheetFormula(wallet.name))}</t></is></c><c r="B${row}"><v>${wallet.currentBalance}</v></c></row>`,
    );
    row++;
  }

  row++; // Blank row

  // Categories section
  sheetRows.push(
    `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>Rincian per Kategori</t></is></c></row>`,
  );
  row++;
  sheetRows.push(
    `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>Kategori</t></is></c><c r="B${row}" t="inlineStr"><is><t>Tipe</t></is></c><c r="C${row}" t="inlineStr"><is><t>Total (IDR)</t></is></c></row>`,
  );
  row++;

  for (const cat of dataset.categories) {
    const typeLabel = cat.type === "income" ? "Pemasukan" : "Pengeluaran";
    sheetRows.push(
      `<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>${escapeXml(sanitizeSpreadsheetFormula(cat.name))}</t></is></c><c r="B${row}" t="inlineStr"><is><t>${typeLabel}</t></is></c><c r="C${row}"><v>${cat.total}</v></c></row>`,
    );
    row++;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${sheetRows.join("\n    ")}
  </sheetData>
</worksheet>`;
}

/**
 * Builds the XML content for Sheet 2 (Buku Transaksi / Ledger).
 */
function buildLedgerSheetXml(dataset: ExportDataset): string {
  const sheetRows: string[] = [];

  // Table Headers
  sheetRows.push(
    `<row r="1">` +
      `<c r="A1" t="inlineStr"><is><t>ID</t></is></c>` +
      `<c r="B1" t="inlineStr"><is><t>Waktu</t></is></c>` +
      `<c r="C1" t="inlineStr"><is><t>Dompet</t></is></c>` +
      `<c r="D1" t="inlineStr"><is><t>Kategori</t></is></c>` +
      `<c r="E1" t="inlineStr"><is><t>Tipe</t></is></c>` +
      `<c r="F1" t="inlineStr"><is><t>Nominal (IDR)</t></is></c>` +
      `<c r="G1" t="inlineStr"><is><t>Catatan</t></is></c>` +
      `</row>`,
  );

  let rowIdx = 2;
  for (const row of dataset.rows) {
    const escapedNotes = escapeXml(sanitizeSpreadsheetFormula(row.notes));
    const escapedWallet = escapeXml(sanitizeSpreadsheetFormula(row.walletName));
    const escapedCategory = escapeXml(sanitizeSpreadsheetFormula(row.categoryName));
    const escapedType = escapeXml(row.typeLabel);
    const escapedTime = escapeXml(row.occurredAtFormatted);

    sheetRows.push(
      `<row r="${rowIdx}">` +
        `<c r="A${rowIdx}" t="inlineStr"><is><t>${escapeXml(row.id)}</t></is></c>` +
        `<c r="B${rowIdx}" t="inlineStr"><is><t>${escapedTime}</t></is></c>` +
        `<c r="C${rowIdx}" t="inlineStr"><is><t>${escapedWallet}</t></is></c>` +
        `<c r="D${rowIdx}" t="inlineStr"><is><t>${escapedCategory}</t></is></c>` +
        `<c r="E${rowIdx}" t="inlineStr"><is><t>${escapedType}</t></is></c>` +
        `<c r="F${rowIdx}"><v>${row.amount}</v></c>` +
        `<c r="G${rowIdx}" t="inlineStr"><is><t>${escapedNotes}</t></is></c>` +
        `</row>`,
    );
    rowIdx++;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${sheetRows.join("\n    ")}
  </sheetData>
</worksheet>`;
}

/**
 * Builds a multi-sheet OpenXML XLSX spreadsheet Buffer (Summary & Ledger).
 * Zero runtime dependencies, powered by Node.js native zlib.
 */
export function buildXlsxExport(dataset: ExportDataset): Buffer {
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Ringkasan" sheetId="1" r:id="rId1"/>
    <sheet name="Buku Transaksi" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><name val="Calibri"/><sz val="11"/></font>
    <font><b/><name val="Calibri"/><sz val="11"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>`;

  const sheet1Xml = buildSummarySheetXml(dataset);
  const sheet2Xml = buildLedgerSheetXml(dataset);

  const files: ZipFileEntry[] = [
    { name: "[Content_Types].xml", content: contentTypesXml },
    { name: "_rels/.rels", content: rootRelsXml },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml },
    { name: "xl/workbook.xml", content: workbookXml },
    { name: "xl/styles.xml", content: stylesXml },
    { name: "xl/worksheets/sheet1.xml", content: sheet1Xml },
    { name: "xl/worksheets/sheet2.xml", content: sheet2Xml },
  ];

  return createZipArchive(files);
}
