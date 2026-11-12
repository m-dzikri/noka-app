import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { PrivacyBlurToggle } from "@/components/finance/PrivacyBlurToggle";
import { WorkspaceChrome } from "@/components/layout/WorkspaceChrome";
import { PrivacyProvider } from "@/components/providers/PrivacyProvider";
import { getDb } from "@/db";
import { getSessionUser } from "@/features/auth/session";
import { listCategories } from "@/features/finance/categories-service";
import { getServerPrivacyBlur } from "@/features/finance/privacy-server";
import { loadWalletsWithBalances } from "@/features/finance/wallets-service";

export const dynamic = "force-dynamic";

export default async function AppWorkspaceLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const [initialCookieBlurred, initialWallets, initialCategories] =
    await Promise.all([
      getServerPrivacyBlur(),
      loadWalletsWithBalances(getDb(), user.id),
      listCategories(user.id),
    ]);

  return (
    <PrivacyProvider initialCookieBlurred={initialCookieBlurred}>
      <WorkspaceChrome
        user={{ id: user.id, name: user.name, email: user.email }}
        initialWallets={initialWallets}
        initialCategories={initialCategories}
        privacyBlurSlot={<PrivacyBlurToggle />}
        logoutSlot={<LogoutButton />}
      >
        {children}
      </WorkspaceChrome>
    </PrivacyProvider>
  );
}

