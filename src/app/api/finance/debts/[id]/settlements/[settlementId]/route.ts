import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import { deleteSettlement } from "@/features/finance/debt-service";
import { apiOk, handleApiError } from "@/lib/api-response";
import { parseUuidRouteParam } from "@/lib/route-helpers";

interface RouteContext {
  params: Promise<{ id: string; settlementId: string }>;
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);
    const { id, settlementId: rawSettlementId } = await params;
    const debtId = parseUuidRouteParam(id);
    const settlementId = parseUuidRouteParam(rawSettlementId);

    const result = await deleteSettlement(user.id, debtId, settlementId);
    return apiOk({
      deleted: true,
      settlementId: result.settlementId,
      debt: result.debt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
