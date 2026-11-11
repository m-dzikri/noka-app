import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getSessionUser } from "@/features/auth/session";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/app/notes");
  }

  return <RegisterForm />;
}

