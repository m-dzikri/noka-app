import { redirect } from "next/navigation";
import { DebtsWorkspace } from "@/components/finance/debts/DebtsWorkspace";
import { getDb } from "@/db";
import { getSessionUser } from "@/features/auth/session";
import { listContactNames, listDebts } from "@/features/finance/debt-service";
import { loadWalletsWithBalances } from "@/features/finance/wallets-service";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const [debtsResult, contacts, wallets] = await Promise.all([
    listDebts(user.id),
    listContactNames(user.id),
    loadWalletsWithBalances(getDb(), user.id, { includeArchived: false }),
  ]);

  return (
    <DebtsWorkspace
      initialSummary={debtsResult.summary}
      initialItems={debtsResult.items}
      initialContacts={contacts}
      wallets={wallets}
    />
  );
}
