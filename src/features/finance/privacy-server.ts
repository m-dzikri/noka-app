import { cookies } from "next/headers";

export const PRIVACY_BLUR_COOKIE_NAME = "noka_privacy_blur";

/**
 * Reads the persisted Privacy Blur state from request cookies for flash-free SSR rendering (`UI-4`, `F17`).
 */
export async function getServerPrivacyBlur(): Promise<boolean | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(PRIVACY_BLUR_COOKIE_NAME)?.value;
  if (raw === "1") {
    return true;
  }
  if (raw === "0") {
    return false;
  }
  return null;
}

