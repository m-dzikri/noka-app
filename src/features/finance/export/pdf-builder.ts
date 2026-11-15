import { formatIdr } from "@/features/finance/format";
import type { ExportDataset } from "./types";

/**
 * Escapes characters for PDF literal text strings and normalizes non-ASCII characters to ASCII.
 */
export function escapePdfString(text: string | null | undefined): string {
  if (!text) return "";
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, " ")
    .trim();
}

/**
 * Truncates a string to fit within a table column.
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Builds a valid, multi-page PDF 1.4 binary Buffer containing the financial report.
 * Zero external libraries, standard Helvetica font, A4 format.
 */
export function buildPdfExport(dataset: ExportDataset): Buffer {
  const PAGE_WIDTH = 595;
  const PAGE_HEIGHT = 842;
  const MARGIN_LEFT = 40;
  const MARGIN_RIGHT = 40;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT; // 515 pt

  interface PageContent {
    stream: string;
  }

  const pages: PageContent[] = [];
  let currentCommands: string[] = [];
  let currentY = 0;

  function startNewPage(isFirstPage = false) {
    if (!isFirstPage) {
      pages.push({ stream: currentCommands.join("\n") });
      currentCommands = [];
    }

    currentY = PAGE_HEIGHT - 45; // Start near top

    if (isFirstPage) {
      // Header Banner
      currentCommands.push(
        "BT",
        "/F2 16 Tf", // Bold 16pt
        `${MARGIN_LEFT} ${currentY} Td`,
        "(NOKA - LAPORAN KEUANGAN) Tj",
        "ET",
      );
      currentY -= 16;

      currentCommands.push(
        "BT",
        "/F1 9 Tf", // Regular 9pt
        `${MARGIN_LEFT} ${currentY} Td`,
        "(Seringan Notepad, Serapi Buku Kas) Tj",
        "ET",
      );
      currentY -= 14;

      // Horizontal separator rule
      currentCommands.push(
        "0.75 w",
        "0.2 0.2 0.2 RG",
        `${MARGIN_LEFT} ${currentY} m ${PAGE_WIDTH - MARGIN_RIGHT} ${currentY} l S`,
      );
      currentY -= 18;

      // Executive Summary Block
      const periodText = escapePdfString(
        `Periode: ${dataset.startDateFormatted} s.d. ${dataset.endDateFormatted}`,
      );
      const generatedText = escapePdfString(
        `Waktu Cetak: ${dataset.generatedAtFormatted}`,
      );

      currentCommands.push(
        "BT",
        "/F1 9 Tf",
        `${MARGIN_LEFT} ${currentY} Td`,
        `(${periodText}) Tj`,
        "280 0 Td",
        `(${generatedText}) Tj`,
        "ET",
      );
      currentY -= 14;

      const incText = escapePdfString(`Total Pemasukan: ${formatIdr(dataset.totalIncome)}`);
      const expText = escapePdfString(`Total Pengeluaran: ${formatIdr(dataset.totalExpense)}`);
      const netText = escapePdfString(`Arus Kas Bersih: ${formatIdr(dataset.netCashflow)}`);

      currentCommands.push(
        "BT",
        "/F2 9 Tf",
        `${MARGIN_LEFT} ${currentY} Td`,
        `(${incText}) Tj`,
        "180 0 Td",
        `(${expText}) Tj`,
        "180 0 Td",
        `(${netText}) Tj`,
        "ET",
      );
      currentY -= 18;

      // Horizontal rule before table
      currentCommands.push(
        "0.5 w",
        "0.7 0.7 0.7 RG",
        `${MARGIN_LEFT} ${currentY} m ${PAGE_WIDTH - MARGIN_RIGHT} ${currentY} l S`,
      );
      currentY -= 16;
    } else {
      // Continuation Header
      currentCommands.push(
        "BT",
        "/F1 8 Tf",
        `${MARGIN_LEFT} ${currentY} Td`,
        "(Noka - Laporan Keuangan (Lanjutan)) Tj",
        "ET",
      );
      currentY -= 14;
    }

    // Render Table Header
    // Column widths: Date: 75, Type: 65, Wallet: 85, Cat: 80, Amount: 80, Notes: 130
    currentCommands.push(
      // Table Header Background bar
      "0.92 0.92 0.92 rg",
      `${MARGIN_LEFT} ${currentY - 4} ${CONTENT_WIDTH} 16 re f`,
      "0 g", // Reset to black text
      "BT",
      "/F2 8 Tf",
      `${MARGIN_LEFT + 4} ${currentY} Td (WAKTU) Tj`,
      `${MARGIN_LEFT + 80} ${currentY} Td (TIPE) Tj`,
      `${MARGIN_LEFT + 145} ${currentY} Td (DOMPET) Tj`,
      `${MARGIN_LEFT + 230} ${currentY} Td (KATEGORI) Tj`,
      `${MARGIN_LEFT + 310} ${currentY} Td (NOMINAL) Tj`,
      `${MARGIN_LEFT + 390} ${currentY} Td (CATATAN) Tj`,
      "ET",
    );
    currentY -= 18;
  }

  startNewPage(true);

  if (dataset.rows.length === 0) {
    currentCommands.push(
      "BT",
      "/F1 9 Tf",
      `${MARGIN_LEFT + 4} ${currentY} Td`,
      "(Tidak ada transaksi pada periode ini.) Tj",
      "ET",
    );
    currentY -= 16;
  } else {
    for (const row of dataset.rows) {
      if (currentY < 55) {
        startNewPage(false);
      }

      const dateStr = escapePdfString(truncateText(row.occurredAtFormatted, 16));
      const typeStr = escapePdfString(
        row.type === "income" ? "Pemasukan" : row.type === "expense" ? "Pengeluaran" : "Transfer",
      );
      const walletStr = escapePdfString(truncateText(row.walletName, 18));
      const catStr = escapePdfString(truncateText(row.categoryName, 16));
      const amtStr = escapePdfString(truncateText(formatIdr(row.amount), 15));
      const noteStr = escapePdfString(truncateText(row.notes, 28));

      // Draw light horizontal separator line
      currentCommands.push(
        "0.25 w",
        "0.88 0.88 0.88 RG",
        `${MARGIN_LEFT} ${currentY - 3} m ${PAGE_WIDTH - MARGIN_RIGHT} ${currentY - 3} l S`,
      );

      currentCommands.push(
        "0 g",
        "BT",
        "/F1 8 Tf",
        `${MARGIN_LEFT + 4} ${currentY} Td (${dateStr}) Tj`,
        `${MARGIN_LEFT + 80} ${currentY} Td (${typeStr}) Tj`,
        `${MARGIN_LEFT + 145} ${currentY} Td (${walletStr}) Tj`,
        `${MARGIN_LEFT + 230} ${currentY} Td (${catStr}) Tj`,
        `${MARGIN_LEFT + 310} ${currentY} Td (${amtStr}) Tj`,
        `${MARGIN_LEFT + 390} ${currentY} Td (${noteStr}) Tj`,
        "ET",
      );

      currentY -= 15;
    }
  }

  // Final page flush
  pages.push({ stream: currentCommands.join("\n") });

  // Add footer to each page
  const totalPages = pages.length;
  for (let i = 0; i < totalPages; i++) {
    const pageNumText = escapePdfString(`Halaman ${i + 1} dari ${totalPages}`);
    const footerText = escapePdfString("Dicetak dari Noka — Seringan Notepad, Serapi Buku Kas");
    pages[i].stream += `\nBT /F1 7 Tf ${MARGIN_LEFT} 25 Td (${footerText}) Tj ET\nBT /F1 7 Tf ${PAGE_WIDTH - MARGIN_RIGHT - 75} 25 Td (${pageNumText}) Tj ET`;
  }

  // Compile PDF Object tree
  // Obj 1: Catalog
  // Obj 2: Pages
  // Obj 3: Font Helvetica (F1)
  // Obj 4: Font Helvetica-Bold (F2)
  // For each page:
  // Page obj: 5 + 2*i
  // Content stream obj: 6 + 2*i
  const objects: string[] = [];
  const pageObjIds: number[] = [];

  const fontF1Id = 3;
  const fontF2Id = 4;

  let nextId = 5;
  for (let i = 0; i < pages.length; i++) {
    pageObjIds.push(nextId);
    nextId += 2;
  }

  // 1: Catalog
  objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`;

  // 2: Pages
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj`;

  // 3: Font F1
  objects[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`;

  // 4: Font F2
  objects[4] = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj`;

  // Build page and content objects
  for (let i = 0; i < pages.length; i++) {
    const pageId = pageObjIds[i];
    const contentId = pageId + 1;
    const streamBuffer = Buffer.from(pages[i].stream, "utf8");

    objects[pageId] = `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontF1Id} 0 R /F2 ${fontF2Id} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj`;

    objects[contentId] = `${contentId} 0 obj\n<< /Length ${streamBuffer.length} >>\nstream\n${pages[i].stream}\nendstream\nendobj`;
  }

  // Assemble full PDF with xref table
  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const xrefOffsets: number[] = [0];

  for (let id = 1; id < objects.length; id++) {
    xrefOffsets[id] = Buffer.byteLength(pdf, "utf8");
    pdf += objects[id] + "\n";
  }

  const startxref = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";

  for (let id = 1; id < objects.length; id++) {
    pdf += `${String(xrefOffsets[id]).padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;

  return Buffer.from(pdf, "utf8");
}
