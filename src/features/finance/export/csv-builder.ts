import type { ExportDataset } from "./types";

/**
 * Escapes a single CSV cell according to RFC 4180 with spreadsheet formula injection protection.
 * If the string starts with =, +, -, or @, it is prepended with a single quote (').
 * If the cell contains commas, quotes, or newlines, it is enclosed in double quotes with internal quotes doubled.
 */
export function escapeCsvCell(value: string | number): string {
  if (typeof value === "number") {
    return String(Math.trunc(value));
  }
  let str = String(value ?? "");

  // Formula injection mitigation: if text starts with formula triggers (=, +, -, @), escape with '
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }

  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an RFC 4180 compliant CSV string with UTF-8 BOM prefix (\uFEFF) for Microsoft Excel compatibility.
 */
export function buildCsvExport(dataset: ExportDataset): string {
  const BOM = "\uFEFF";
  const CRLF = "\r\n";

  const headers = [
    "Tanggal (Date)",
    "Tipe (Type)",
    "Dompet (Wallet)",
    "Kategori (Category)",
    "Nominal IDR (Amount)",
    "Catatan (Notes)",
  ];

  const lines: string[] = [];
  lines.push(headers.map((h) => escapeCsvCell(h)).join(","));

  for (const row of dataset.rows) {
    const fields = [
      escapeCsvCell(row.occurredAtFormatted),
      escapeCsvCell(row.typeLabel),
      escapeCsvCell(row.walletName),
      escapeCsvCell(row.categoryName),
      escapeCsvCell(row.amount),
      escapeCsvCell(row.notes),
    ];
    lines.push(fields.join(","));
  }

  return BOM + lines.join(CRLF) + CRLF;
}
