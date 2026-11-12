import type { SystemCategoryKey } from "@/features/auth/default-categories";
import {
  INCOME_KEYWORDS,
  NON_INCOME_COURTESY_PHRASES,
  SYSTEM_CATEGORY_SYNONYMS,
} from "@/features/quick-capture/keywords";
import type {
  QuickCaptureCategorySummary,
  QuickCaptureContext,
  QuickCaptureParseResult,
  QuickCaptureWalletSummary,
} from "@/features/quick-capture/types";

const MAX_DESCRIPTION_LENGTH = 300;
const MAX_NOTE_TITLE_LENGTH = 120;

const DATE_ISO_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;
const DATE_SLASH_PATTERN = /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g;
const YEAR_CONTEXT_PATTERN = /\b(?:tahun|thn|year)\s+\d{4}\b/gi;
const CLOCK_TIME_PATTERN =
  /(?<!\b(?:rp\.?|idr)\s*)\b\d{1,2}[:.]\d{2}\b(?!\s*(?:rb|ribu|k|jt|juta)\b)/gi;
const CONTEXT_NUMBER_PATTERN =
  /\b(?:tgl|tanggal|date|bab|chapter|hal|halaman|page|jam|pukul|no|nomor|part|sesi|minggu|hari|ke)\s+\d{1,2}(?!\d|[.,]\d)(?!\s*(?:rb|ribu|k|jt|juta)\b)/gi;

const MONETARY_TOKEN_PATTERN =
  /(?:^|\s)([+-])?\s*(rp\.?|idr)?\s*(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*(jt|juta|rb|ribu|k)?(?=\s|$|[,.!?;:)])/gi;

const DOT_THOUSANDS_PATTERN = /^\d{1,3}(?:\.\d{3})+$/;
const PLAIN_INTEGER_PATTERN = /^\d+$/;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildWholeWordPattern(phrase: string, global = false): RegExp {
  const escaped = escapeRegex(phrase.trim());
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,
    global ? "giu" : "iu",
  );
}

const PRECOMPILED_COURTESY_PATTERNS = NON_INCOME_COURTESY_PHRASES.map(
  (phrase) => buildWholeWordPattern(phrase, true),
);

const PRECOMPILED_INCOME_PATTERNS = INCOME_KEYWORDS.map((kw) =>
  buildWholeWordPattern(kw),
);

const PRECOMPILED_SYSTEM_SYNONYMS: ReadonlyArray<
  readonly [SystemCategoryKey, ReadonlyArray<{ kw: string; pattern: RegExp }>]
> = (
  Object.entries(SYSTEM_CATEGORY_SYNONYMS) as Array<
    [SystemCategoryKey, readonly string[]]
  >
).map(([key, words]) => [
  key,
  words.map((kw) => ({ kw, pattern: buildWholeWordPattern(kw) })),
]);

const SYSTEM_SYNONYM_MAP = new Map(PRECOMPILED_SYSTEM_SYNONYMS);

function maskMatches(input: string, pattern: RegExp): string {
  return input.replace(pattern, (match) => " ".repeat(match.length));
}

function maskNonMonetaryTokens(input: string): string {
  let masked = input;
  masked = maskMatches(masked, DATE_ISO_PATTERN);
  masked = maskMatches(masked, DATE_SLASH_PATTERN);
  masked = maskMatches(masked, YEAR_CONTEXT_PATTERN);
  masked = maskMatches(masked, CLOCK_TIME_PATTERN);
  masked = maskMatches(masked, CONTEXT_NUMBER_PATTERN);
  return masked;
}

function resolveUnitMultiplier(unitRaw: string | undefined): number {
  if (!unitRaw) {
    return 1;
  }
  const unit = unitRaw.toLowerCase();
  if (unit === "jt" || unit === "juta") {
    return 1_000_000;
  }
  if (unit === "rb" || unit === "ribu" || unit === "k") {
    return 1_000;
  }
  return 1;
}

function parseMonetaryCandidate(
  prefixRaw: string | undefined,
  numberRaw: string,
  unitRaw: string | undefined,
): number | null {
  const hasPrefix = Boolean(prefixRaw);
  const hasUnit = Boolean(unitRaw);
  const isDotGrouped = DOT_THOUSANDS_PATTERN.test(numberRaw);
  const isPlainInt = PLAIN_INTEGER_PATTERN.test(numberRaw);

  let numericValue: number;
  if (isDotGrouped) {
    numericValue = Number(numberRaw.replace(/\./g, ""));
  } else {
    numericValue = Number(numberRaw.replace(",", "."));
  }

  if (!Number.isFinite(numericValue)) {
    return null;
  }

  if (
    !hasPrefix &&
    !hasUnit &&
    !isDotGrouped &&
    !(isPlainInt && numericValue >= 1000)
  ) {
    return null;
  }

  const amount = Math.floor(numericValue * resolveUnitMultiplier(unitRaw));
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return null;
  }

  return amount;
}

interface MatchedMoneySpan {
  amount: number;
  start: number;
  end: number;
  hasLeadingPlus: boolean;
}

function findFirstMonetaryToken(maskedInput: string): MatchedMoneySpan | null {
  const scanner = new RegExp(MONETARY_TOKEN_PATTERN.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = scanner.exec(maskedInput)) !== null) {
    const fullMatch = match[0];
    const signRaw = match[1];
    const prefixRaw = match[2];
    const numberRaw = match[3];
    const unitRaw = match[4];

    if (!numberRaw) {
      continue;
    }

    const amount = parseMonetaryCandidate(prefixRaw, numberRaw, unitRaw);
    if (amount === null) {
      continue;
    }

    const leadingWhitespace = fullMatch.length - fullMatch.trimStart().length;
    return {
      amount,
      start: match.index + leadingWhitespace,
      end: match.index + fullMatch.length,
      hasLeadingPlus: signRaw === "+",
    };
  }

  return null;
}

function resolveEntryType(
  rawInput: string,
  hasLeadingPlusOnAmount: boolean,
): "income" | "expense" {
  if (hasLeadingPlusOnAmount || /(?:^|\s)\+(?=\S)/.test(rawInput)) {
    return "income";
  }

  let normalized = rawInput.toLowerCase();
  for (const pattern of PRECOMPILED_COURTESY_PATTERNS) {
    normalized = normalized.replace(pattern, " ");
  }

  for (const pattern of PRECOMPILED_INCOME_PATTERNS) {
    if (pattern.test(normalized)) {
      return "income";
    }
  }

  return "expense";
}

interface MatchedWallet {
  walletId: string | null;
  matchedName: string | null;
}

function resolveWallet(
  input: string,
  wallets: QuickCaptureWalletSummary[],
  defaultWalletId: string | null,
): MatchedWallet {
  const activeWallets = wallets.filter((wallet) => wallet.archivedAt === null);
  if (activeWallets.length === 0) {
    return { walletId: null, matchedName: null };
  }

  const lowerInput = input.toLowerCase();
  const sortedByLength = [...activeWallets].sort(
    (a, b) => b.name.trim().length - a.name.trim().length,
  );

  let firstSubstringMatch: MatchedWallet | null = null;
  for (const wallet of sortedByLength) {
    const trimmedName = wallet.name.trim();
    if (!trimmedName) continue;
    if (!lowerInput.includes(trimmedName.toLowerCase())) {
      continue;
    }
    if (!firstSubstringMatch) {
      firstSubstringMatch = { walletId: wallet.id, matchedName: trimmedName };
    }
    if (buildWholeWordPattern(trimmedName).test(input)) {
      return { walletId: wallet.id, matchedName: trimmedName };
    }
  }

  if (firstSubstringMatch) {
    return firstSubstringMatch;
  }

  if (
    defaultWalletId &&
    activeWallets.some((wallet) => wallet.id === defaultWalletId)
  ) {
    return { walletId: defaultWalletId, matchedName: null };
  }

  const defaultFlagWallet = activeWallets.find((wallet) => wallet.isDefault);
  if (defaultFlagWallet) {
    return { walletId: defaultFlagWallet.id, matchedName: null };
  }

  return { walletId: activeWallets[0]!.id, matchedName: null };
}

function resolveCategoryId(
  input: string,
  entryType: "income" | "expense",
  categories: QuickCaptureCategorySummary[],
): string | null {
  const candidates = categories.filter((cat) => cat.type === entryType);
  if (candidates.length === 0) {
    return null;
  }

  const lowerInput = input.toLowerCase();
  const customCandidates = [...candidates]
    .filter((cat) => cat.systemKey === null)
    .sort((a, b) => b.name.trim().length - a.name.trim().length);

  // 1. Custom category whole-word match, falling back to longest substring match
  let firstCustomSubstringId: string | null = null;
  for (const cat of customCandidates) {
    const name = cat.name.trim();
    if (!name || !lowerInput.includes(name.toLowerCase())) {
      continue;
    }
    if (!firstCustomSubstringId) {
      firstCustomSubstringId = cat.id;
    }
    if (buildWholeWordPattern(name).test(input)) {
      return cat.id;
    }
  }
  if (firstCustomSubstringId) {
    return firstCustomSubstringId;
  }

  // 2. Direct localized system category name whole-word match
  const systemCandidates = [...candidates]
    .filter((cat) => cat.systemKey !== null)
    .sort((a, b) => b.name.trim().length - a.name.trim().length);
  for (const cat of systemCandidates) {
    const name = cat.name.trim();
    if (
      name &&
      lowerInput.includes(name.toLowerCase()) &&
      buildWholeWordPattern(name).test(input)
    ) {
      return cat.id;
    }
  }

  // 3. Bilingual systemKey synonym dictionary (longest keyword match wins)
  let bestMatch: { id: string; score: number } | null = null;
  for (const cat of candidates) {
    if (!cat.systemKey) continue;
    const synonymEntries = SYSTEM_SYNONYM_MAP.get(
      cat.systemKey as SystemCategoryKey,
    );
    if (!synonymEntries) continue;

    for (const entry of synonymEntries) {
      if (
        (!bestMatch || entry.kw.length > bestMatch.score) &&
        lowerInput.includes(entry.kw) &&
        entry.pattern.test(input)
      ) {
        bestMatch = { id: cat.id, score: entry.kw.length };
      }
    }
  }
  if (bestMatch) {
    return bestMatch.id;
  }

  // 4. Fallback to seeded other_expense / other_income
  const fallbackKey: SystemCategoryKey =
    entryType === "income" ? "other_income" : "other_expense";
  const fallbackCat = candidates.find((cat) => cat.systemKey === fallbackKey);
  return fallbackCat?.id ?? candidates[0]!.id;
}

function buildTransactionDescription(
  rawTrimmed: string,
  span: MatchedMoneySpan,
  matchedWalletName: string | null,
): string {
  let cleaned =
    rawTrimmed.slice(0, span.start) + " " + rawTrimmed.slice(span.end);

  if (matchedWalletName) {
    const walletWordPattern = new RegExp(
      `(?:^|\\s)${escapeRegex(matchedWalletName)}(?=$|\\s|[,.!?;:)])`,
      "gi",
    );
    cleaned = cleaned.replace(walletWordPattern, " ");
  }

  cleaned = cleaned.replace(/(^|\s)\+(?=\S)/g, "$1");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    cleaned = rawTrimmed.replace(/(^|\s)\+(?=\S)/g, "$1").replace(/\s+/g, " ").trim();
  }

  return cleaned.slice(0, MAX_DESCRIPTION_LENGTH);
}

/**
 * Pure conservative rule-based dual-intent parser (`<= 50 ms`, offline, zero AI/LLM)
 * classifying Note vs Transaction (`F14`, `DEC-4`, `DEC-15`, `MED-1`).
 */
export function parseQuickCapture(
  input: string,
  context: QuickCaptureContext,
): QuickCaptureParseResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      intent: "note",
      title: "",
      content: "",
    };
  }

  const masked = maskNonMonetaryTokens(trimmed);
  const moneySpan = findFirstMonetaryToken(masked);
  if (!moneySpan) {
    const firstLine = trimmed.split(/\r?\n/, 1)[0]?.trim() ?? "";
    return {
      intent: "note",
      title: firstLine.slice(0, MAX_NOTE_TITLE_LENGTH),
      content: trimmed,
    };
  }

  const type = resolveEntryType(trimmed, moneySpan.hasLeadingPlus);
  const { walletId, matchedName } = resolveWallet(
    trimmed,
    context.wallets,
    context.defaultWalletId,
  );
  const categoryId = resolveCategoryId(trimmed, type, context.categories);
  const description = buildTransactionDescription(
    trimmed,
    moneySpan,
    matchedName,
  );

  return {
    intent: "transaction",
    type,
    amount: moneySpan.amount,
    walletId,
    categoryId,
    description,
  };
}
