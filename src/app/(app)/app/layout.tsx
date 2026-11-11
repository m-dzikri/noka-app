import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AppShell } from "@/components/layout/AppShell";
import { getSessionUser } from "@/features/auth/session";

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

  return (
    <AppShell
      user={{ id: user.id, name: user.name, email: user.email }}
      logoutSlot={<LogoutButton />}
    >
      {children}
    </AppShell>
  );
}

