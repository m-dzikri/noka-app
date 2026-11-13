import { redirect } from "next/navigation";
import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { getSessionUser } from "@/features/auth/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return <SettingsWorkspace initialUser={user} />;
}

