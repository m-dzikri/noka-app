import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { PrivacyBlurToggle } from "@/components/finance/PrivacyBlurToggle";
import { AppShell } from "@/components/layout/AppShell";
import { PrivacyProvider } from "@/components/providers/PrivacyProvider";
import { getSessionUser } from "@/features/auth/session";
import { getServerPrivacyBlur } from "@/features/finance/privacy-server";

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
  const initialCookieBlurred = await getServerPrivacyBlur();

  return (
    <PrivacyProvider initialCookieBlurred={initialCookieBlurred}>
      <AppShell
        user={{ id: user.id, name: user.name, email: user.email }}
        privacyBlurSlot={<PrivacyBlurToggle />}
        logoutSlot={<LogoutButton />}
      >
        {children}
      </AppShell>
    </PrivacyProvider>
  );
}

