import type { NextRequest } from "next/server";
import { requireAuth } from "@/features/auth/session";
import { financeSummaryQuerySchema } from "@/features/finance/schemas";
import { getFinanceSummary } from "@/features/finance/summary-service";
import { apiOk, handleApiError } from "@/lib/api-response";
import { validateZodSchema } from "@/lib/route-helpers";

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuth(req);
    const sp = req.nextUrl.searchParams;

    const query = validateZodSchema(financeSummaryQuerySchema, {
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      walletId: sp.get("walletId") ?? undefined,
      type: sp.get("type") ?? undefined,
      categoryId: sp.get("categoryId") ?? undefined,
      includeArchived: sp.get("includeArchived") ?? undefined,
      tzOffset: sp.get("tzOffset") ?? undefined,
      limit: sp.get("limit") ?? undefined,
      cursor: sp.get("cursor") ?? undefined,
    });

    const result = await getFinanceSummary(user.id, query, {
      cycleStartDay: user.cycleStartDay,
    });
    return apiOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
