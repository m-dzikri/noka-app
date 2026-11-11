import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const dynamic = "force-dynamic";

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;
  const rawToken = params.token;
  const token = typeof rawToken === "string" ? rawToken : undefined;

  return <ResetPasswordForm initialToken={token} />;
}

