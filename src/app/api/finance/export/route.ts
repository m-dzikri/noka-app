import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/features/auth/session";
import { buildCsvExport } from "@/features/finance/export/csv-builder";
import { buildXlsxExport } from "@/features/finance/export/excel-builder";
import {
  formatExportDateOnly,
  loadFinanceExportDataset,
} from "@/features/finance/export/export-query";
import { buildPdfExport } from "@/features/finance/export/pdf-builder";
import { exportQuerySchema } from "@/features/finance/export/types";
import { ApiError, handleApiError } from "@/lib/api-response";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit";
import { validateZodSchema } from "@/lib/route-helpers";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);

    // Rate limiting: 10 requests / 60 seconds per user
    const ip = extractClientIp(req);
    const rateLimit = checkRateLimit("export:finance", `${user.id}:${ip}`, 10, 60_000);
    if (!rateLimit.allowed) {
      throw new ApiError(
        429,
        "RATE_LIMIT_EXCEEDED",
        "Rate limit exceeded for data export. Please try again later.",
        undefined,
        { "Retry-After": String(rateLimit.retryAfterSeconds) },
      );
    }

    const sp = req.nextUrl.searchParams;
    const query = validateZodSchema(exportQuerySchema, {
      format: sp.get("format") ?? undefined,
      startDate: sp.get("startDate") ?? undefined,
      endDate: sp.get("endDate") ?? undefined,
      walletId: sp.get("walletId") ?? undefined,
      categoryId: sp.get("categoryId") ?? undefined,
      tzOffset: sp.get("tzOffset") ?? undefined,
    });

    const dataset = await loadFinanceExportDataset(user.id, query, {
      cycleStartDay: user.cycleStartDay,
    });

    const yyyymmdd = formatExportDateOnly(dataset.generatedAt, query.tzOffset).replace(/-/g, "");

    if (query.format === "csv") {
      const csvContent = buildCsvExport(dataset);
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="noka-transaksi-${yyyymmdd}.csv"`,
          "Cache-Control": "private, no-cache",
        },
      });
    }

    if (query.format === "xlsx") {
      const xlsxBuffer = buildXlsxExport(dataset);
      return new NextResponse(new Uint8Array(xlsxBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="noka-laporan-keuangan-${yyyymmdd}.xlsx"`,
          "Cache-Control": "private, no-cache",
        },
      });
    }

    if (query.format === "pdf") {
      const pdfBuffer = buildPdfExport(dataset);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="noka-laporan-keuangan-${yyyymmdd}.pdf"`,
          "Cache-Control": "private, no-cache",
        },
      });
    }

    throw new ApiError(422, "VALIDATION_ERROR", "Unsupported export format");
  } catch (error) {
    return handleApiError(error);
  }
}
