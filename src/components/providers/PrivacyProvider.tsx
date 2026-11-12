"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export const PRIVACY_BLUR_STORAGE_KEY = "noka_privacy_blur";
const PRIVACY_BLUR_COOKIE_NAME = "noka_privacy_blur";
const COOKIE_MAX_AGE_SECONDS = 31_536_000;

export interface PrivacyContextValue {
  isBlurred: boolean;
  setBlurred: (next: boolean) => void;
  toggleBlur: () => void;
}

const DEFAULT_PRIVACY_CONTEXT: PrivacyContextValue = {
  isBlurred: false,
  setBlurred: () => {},
  toggleBlur: () => {},
};

export const PrivacyContext = createContext<PrivacyContextValue>(
  DEFAULT_PRIVACY_CONTEXT,
);

function syncDocumentPrivacyAttr(blurred: boolean): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.dataset.privacyBlur = blurred ? "true" : "false";
}

function writePrivacyPersistence(blurred: boolean): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        PRIVACY_BLUR_STORAGE_KEY,
        blurred ? "true" : "false",
      );
    } catch {
      // Ignore restricted private browsing storage errors.
    }
  }

  if (typeof document !== "undefined") {
    document.cookie = `${PRIVACY_BLUR_COOKIE_NAME}=${blurred ? "1" : "0"}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  }
}

export interface PrivacyProviderProps {
  initialCookieBlurred?: boolean | null;
  children: ReactNode;
}

function readStoredPrivacyBlur(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(PRIVACY_BLUR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribePrivacyStorage(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
  };
}

/**
 * Provides persistent global Privacy Blur state across `/app/*` without SSR flash (`F17`, `UI-4`).
 */
export function PrivacyProvider({
  initialCookieBlurred = null,
  children,
}: PrivacyProviderProps) {
  const [explicitBlurred, setExplicitBlurred] = useState<boolean | null>(
    initialCookieBlurred,
  );
  const storedBlurred = useSyncExternalStore(
    subscribePrivacyStorage,
    readStoredPrivacyBlur,
    () => false,
  );
  const isBlurred = explicitBlurred ?? storedBlurred;
  const blurredRef = useRef<boolean>(isBlurred);

  useEffect(() => {
    blurredRef.current = isBlurred;
    syncDocumentPrivacyAttr(isBlurred);
    if (explicitBlurred === null && storedBlurred) {
      writePrivacyPersistence(true);
    }
  }, [explicitBlurred, isBlurred, storedBlurred]);

  const setBlurred = useCallback((next: boolean) => {
    blurredRef.current = next;
    setExplicitBlurred(next);
    syncDocumentPrivacyAttr(next);
    writePrivacyPersistence(next);
  }, []);

  const toggleBlur = useCallback(() => {
    setBlurred(!blurredRef.current);
  }, [setBlurred]);

  const value = useMemo<PrivacyContextValue>(
    () => ({
      isBlurred,
      setBlurred,
      toggleBlur,
    }),
    [isBlurred, setBlurred, toggleBlur],
  );

  return (
    <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>
  );
}

/**
 * Reads global Privacy Blur state safely inside client components.
 */
export function usePrivacy(): PrivacyContextValue {
  return useContext(PrivacyContext);
}
