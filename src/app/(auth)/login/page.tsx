import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getSessionUser } from "@/features/auth/session";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/app");
  }

  return <LoginForm />;
}

