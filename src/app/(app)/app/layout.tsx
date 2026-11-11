import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

export default function AppWorkspaceLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <AppShell>{children}</AppShell>;
}

