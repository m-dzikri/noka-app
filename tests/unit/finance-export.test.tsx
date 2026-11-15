import zlib from "node:zlib";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExportDataModal } from "@/components/finance/ExportDataModal";
import { FinanceReportClientView } from "@/components/finance/FinanceReportClientView";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { buildCsvExport, escapeCsvCell } from "@/features/finance/export/csv-builder";
import {
  buildXlsxExport,
  escapeXml,
  sanitizeSpreadsheetFormula,
} from "@/features/finance/export/excel-builder";
import { buildPdfExport, escapePdfString } from "@/features/finance/export/pdf-builder";
import { MAX_EXPORT_RANGE_DAYS } from "@/features/finance/export/export-query";
import {
  reportWebQuerySchema,
  serializeExportDataset,
  type ExportDataset,
} from "@/features/finance/export/types";

function createMockDataset(rowCount = 2): ExportDataset {
  const rows = [];
  for (let i = 1; i <= rowCount; i++) {
    rows.push({
      id: `tx-uuid-${i}`,
      occurredAt: new Date(`2026-11-1${i}T10:00:00.000Z`),
      occurredAtFormatted: `2026-11-1${i} 17:00`,
      type: (i % 2 === 0 ? "expense" : "income") as "income" | "expense",
      typeLabel: i % 2 === 0 ? "Pengeluaran (Expense)" : "Pemasukan (Income)",
      walletName: `Dompet Utama ${i}`,
      categoryName: i % 2 === 0 ? "Makanan & Minuman" : "Gaji",
      amount: i * 50_000,
      notes: i === 1 ? 'Catatan "biasa", dengan koma' : '=SUM(A1:B2) formula injection test',
    });
  }

  return {
    userId: "user-uuid-123",
    generatedAt: new Date("2026-11-15T12:00:00.000Z"),
    generatedAtFormatted: "2026-11-15 19:00",
    startDate: new Date("2026-11-01T00:00:00.000Z"),
    endDate: new Date("2026-11-30T23:59:59.999Z"),
    startDateFormatted: "2026-11-01",
    endDateFormatted: "2026-11-30",
    totalIncome: 50_000,
    totalExpense: 100_000,
    netCashflow: -50_000,
    wallets: [
      { id: "w1", name: "Dompet Tunai", currentBalance: 250_000 },
      { id: "w2", name: "BCA", currentBalance: 5_000_000 },
    ],
    categories: [
      { id: "c1", name: "Gaji", type: "income", total: 50_000 },
      { id: "c2", name: "Makanan & Minuman", type: "expense", total: 100_000 },
    ],
    rows,
  };
}

describe("TS-011-01: Financial Export Generators (CSV, XLSX, PDF) & Formula Sanitization", () => {
  describe("CSV Builder (RFC 4180 & Excel BOM)", () => {
    it("prefixes CSV with UTF-8 BOM (\\uFEFF) and outputs RFC 4180 compliant headers", () => {
      const dataset = createMockDataset(1);
      const csv = buildCsvExport(dataset);

      // Must start with UTF-8 Byte Order Mark \uFEFF
      expect(csv.startsWith("\uFEFF")).toBe(true);

      // Must contain standard RFC 4180 headers
      expect(csv).toContain(
        "Tanggal (Date),Tipe (Type),Dompet (Wallet),Kategori (Category),Nominal IDR (Amount),Catatan (Notes)",
      );
    });

    it("escapes quotes, commas, and newlines according to RFC 4180 and presents amounts as pure integers", () => {
      const dataset = createMockDataset(1);
      dataset.rows[0].notes = 'Makan siang, "Spesial"\nLanjut es teh';
      dataset.rows[0].amount = 150000;

      const csv = buildCsvExport(dataset);

      // Amount should be pure integer 150000 without commas or quotes
      expect(csv).toContain("150000");
      expect(csv).not.toContain("150,000");

      // Quotes should be escaped by doubling ("") and wrapped in quotes
      expect(csv).toContain('"Makan siang, ""Spesial""\nLanjut es teh"');
    });

    it("sanitizes spreadsheet formula injection (=, +, -, @) by prepending a single quote", () => {
      expect(escapeCsvCell("=1+1")).toBe("'=1+1");
      expect(escapeCsvCell("+628123456789")).toBe("'+628123456789");
      expect(escapeCsvCell("-25+50")).toBe("'-25+50");
      expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");

      // Safe cells remain unaltered
      expect(escapeCsvCell("Pengeluaran")).toBe("Pengeluaran");
      expect(escapeCsvCell(50000)).toBe("50000");

      const dataset = createMockDataset(2);
      const csv = buildCsvExport(dataset);
      // Row 2 note starts with =SUM, must be escaped
      expect(csv).toContain("'=SUM(A1:B2) formula injection test");
    });

    it("generates valid CSV on empty dataset without throwing", () => {
      const emptyDataset = createMockDataset(0);
      const csv = buildCsvExport(emptyDataset);

      expect(csv.startsWith("\uFEFF")).toBe(true);
      const lines = csv.trim().split("\r\n");
      expect(lines.length).toBe(1); // Header row only
    });
  });

  describe("Excel (XLSX) Builder (Multi-Sheet & Zero-Dependency)", () => {
    it("generates a valid PKZIP OpenXML XLSX archive with Sheet 1 (Summary) and Sheet 2 (Ledger)", () => {
      const dataset = createMockDataset(3);
      const buffer = buildXlsxExport(dataset);

      // Must start with PK\x03\x04
      expect(buffer.subarray(0, 4).toString("hex")).toBe("504b0304");

      // Decompress and verify expected internal OpenXML files
      const contentTypesBuf = extractFileFromZip(buffer, "[Content_Types].xml");
      expect(contentTypesBuf).toBeTruthy();
      const contentTypesStr = contentTypesBuf!.toString("utf8");
      expect(contentTypesStr).toContain("/xl/worksheets/sheet1.xml");
      expect(contentTypesStr).toContain("/xl/worksheets/sheet2.xml");

      // Verify workbook sheets
      const workbookBuf = extractFileFromZip(buffer, "xl/workbook.xml");
      expect(workbookBuf).toBeTruthy();
      const workbookStr = workbookBuf!.toString("utf8");
      expect(workbookStr).toContain('name="Ringkasan"');
      expect(workbookStr).toContain('name="Buku Transaksi"');

      // Verify Sheet 1 (Summary) contents
      const sheet1Buf = extractFileFromZip(buffer, "xl/worksheets/sheet1.xml");
      expect(sheet1Buf).toBeTruthy();
      const sheet1Str = sheet1Buf!.toString("utf8");
      expect(sheet1Str).toContain("Laporan Keuangan Noka");
      expect(sheet1Str).toContain("<v>50000</v>"); // Total Income as numeric cell
      expect(sheet1Str).toContain("<v>100000</v>"); // Total Expense as numeric cell

      // Verify Sheet 2 (Ledger) contents
      const sheet2Buf = extractFileFromZip(buffer, "xl/worksheets/sheet2.xml");
      expect(sheet2Buf).toBeTruthy();
      const sheet2Str = sheet2Buf!.toString("utf8");
      expect(sheet2Str).toContain("<c r=\"A1\" t=\"inlineStr\"><is><t>ID</t></is></c>");
      expect(sheet2Str).toContain("<c r=\"F1\" t=\"inlineStr\"><is><t>Nominal (IDR)</t></is></c>");
      expect(sheet2Str).toContain("<v>50000</v>"); // Row 1 amount
    });

    it("sanitizes formula characters and escapes XML special characters in spreadsheet text cells", () => {
      expect(sanitizeSpreadsheetFormula("=CMD('calc')")).toBe("'=CMD('calc')");
      expect(sanitizeSpreadsheetFormula("@external")).toBe("'@external");
      expect(escapeXml('Tag <bold> & "special"')).toBe("Tag &lt;bold&gt; &amp; &quot;special&quot;");
    });
  });

  describe("PDF Builder (PDF 1.4 Binary & Multi-Page Pagination)", () => {
    it("generates a valid binary PDF 1.4 document with correct magic bytes and trailer", () => {
      const dataset = createMockDataset(2);
      const pdf = buildPdfExport(dataset);

      // Must start with %PDF-1.4
      expect(pdf.subarray(0, 8).toString("utf8")).toBe("%PDF-1.4");

      // Must contain trailer and %%EOF
      const pdfString = pdf.toString("utf8");
      expect(pdfString).toContain("/Type /Catalog");
      expect(pdfString).toContain("/Type /Pages");
      expect(pdfString).toContain("%%EOF");
      expect(pdfString).toContain("NOKA - LAPORAN KEUANGAN");
    });

    it("paginates cleanly to multiple pages when row count exceeds single page capacity", () => {
      // 60 rows will easily overflow single page (height 842 pt)
      const largeDataset = createMockDataset(60);
      const pdf = buildPdfExport(largeDataset);

      const pdfString = pdf.toString("utf8");
      // Count of pages in /Type /Pages must be >= 2
      expect(pdfString).toMatch(/\/Count\s+[2-9]/);
      expect(pdfString).toContain("Noka - Laporan Keuangan (Lanjutan)");
    });

    it("escapes special characters for PDF literal strings", () => {
      expect(escapePdfString("Notes with (parentheses) and \\backslashes\\")).toBe(
        "Notes with \\(parentheses\\) and \\\\backslashes\\\\",
      );
      expect(escapePdfString("Special • bullet \u00a0 space")).toBe("Special   bullet   space");
    });
  });

  describe("UI Components: ExportDataModal and FinanceReportClientView", () => {
    it("renders ExportDataModal with formats, period presets, and calls onClose on cancel", () => {
      const handleClose = vi.fn();
      render(
        <PreferencesProvider initialLocale="id" initialTheme="light">
          <ExportDataModal
            isOpen={true}
            onClose={handleClose}
            wallets={[{ id: "w1", name: "Dompet Utama" }]}
            categories={[{ id: "c1", name: "Makanan" }]}
            cycle={{ startDate: "2026-11-01", endDate: "2026-11-30" }}
          />
        </PreferencesProvider>,
      );

      // Title & Format Radios
      expect(screen.getByText("Ekspor Data Keuangan")).toBeDefined();
      expect(screen.getByText("CSV (.csv)")).toBeDefined();
      expect(screen.getByText("Excel (.xlsx)")).toBeDefined();
      expect(screen.getByText("Cetak / PDF")).toBeDefined();

      // Period buttons
      expect(screen.getByText("Siklus Aktif Ini")).toBeDefined();
      expect(screen.getByText("Bulan Lalu")).toBeDefined();
      const customBtn = screen.getByText("Kustom Tanggal");
      expect(customBtn).toBeDefined();

      // Clicking Kustom Tanggal shows date inputs
      fireEvent.click(customBtn);
      expect(screen.getByText("Tanggal Mulai")).toBeDefined();
      expect(screen.getByText("Tanggal Akhir")).toBeDefined();

      // Cancel button calls handleClose
      const cancelBtn = screen.getByText("Batal");
      fireEvent.click(cancelBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it("renders FinanceReportClientView with executive summary, transactions table, and triggers print", () => {
      const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
      const dataset = createMockDataset(2);
      const serialized = serializeExportDataset(dataset);

      render(
        <PreferencesProvider initialLocale="id" initialTheme="light">
          <FinanceReportClientView dataset={serialized} />
        </PreferencesProvider>,
      );

      // Header & Summary
      expect(screen.getByText("Laporan Keuangan Noka")).toBeDefined();
      expect(screen.getByText("Total Pemasukan")).toBeDefined();
      expect(screen.getByText("Total Pengeluaran")).toBeDefined();
      expect(screen.getByText("Arus Kas Bersih")).toBeDefined();

      // Generation timestamp label displays actual generatedAtFormatted
      expect(screen.getByText(/2026-11-15 19:00/)).toBeDefined();

      // Table rows
      expect(screen.getByText("Rincian Transaksi & Transfer (2)")).toBeDefined();

      // Print button
      const printBtn = screen.getByRole("button", { name: /Cetak \/ Simpan PDF/i });
      fireEvent.click(printBtn);
      expect(printSpy).toHaveBeenCalledTimes(1);

      printSpy.mockRestore();
    });

    it("validates report web query schema and enforces maximum export date range constant", () => {
      expect(MAX_EXPORT_RANGE_DAYS).toBe(731);

      // Valid report params
      const valid = reportWebQuerySchema.safeParse({
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        walletId: "11111111-1111-4111-8111-111111111111",
        tzOffset: "420",
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.tzOffset).toBe(420);
      }

      // Invalid wallet UUID
      const invalidWallet = reportWebQuerySchema.safeParse({
        walletId: "not-a-uuid",
      });
      expect(invalidWallet.success).toBe(false);

      // Non-finite tzOffset
      const invalidTz = reportWebQuerySchema.safeParse({
        tzOffset: "Infinity",
      });
      expect(invalidTz.success).toBe(false);
    });
  });
});

/**
 * Minimal ZIP extractor utility for test assertions without third-party dependencies.
 */
function extractFileFromZip(zipBuffer: Buffer, targetFilename: string): Buffer | null {
  let offset = 0;
  while (offset < zipBuffer.length - 30) {
    const signature = zipBuffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      break; // End of local file headers
    }

    const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
    const compressedSize = zipBuffer.readUInt32LE(offset + 18);
    const fileNameLength = zipBuffer.readUInt16LE(offset + 26);
    const extraFieldLength = zipBuffer.readUInt16LE(offset + 28);

    const fileName = zipBuffer.toString("utf8", offset + 30, offset + 30 + fileNameLength);
    const dataOffset = offset + 30 + fileNameLength + extraFieldLength;
    const compressedData = zipBuffer.subarray(dataOffset, dataOffset + compressedSize);

    if (fileName === targetFilename) {
      if (compressionMethod === 8) {
        return zlib.inflateRawSync(compressedData);
      }
      return Buffer.from(compressedData);
    }

    offset = dataOffset + compressedSize;
  }

  return null;
}
