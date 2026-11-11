import { enDictionary } from "@/lib/i18n/dictionaries/en";
import { idDictionary } from "@/lib/i18n/dictionaries/id";
import type { Locale } from "@/lib/i18n/types";

export const SYSTEM_CATEGORIES = [
  { systemKey: "food_drink", type: "expense" },
  { systemKey: "transport", type: "expense" },
  { systemKey: "shopping", type: "expense" },
  { systemKey: "bills", type: "expense" },
  { systemKey: "entertainment", type: "expense" },
  { systemKey: "health", type: "expense" },
  { systemKey: "education", type: "expense" },
  { systemKey: "other_expense", type: "expense" },
  { systemKey: "salary", type: "income" },
  { systemKey: "bonus", type: "income" },
  { systemKey: "refund", type: "income" },
  { systemKey: "other_income", type: "income" },
] as const;

export type SystemCategoryKey = (typeof SYSTEM_CATEGORIES)[number]["systemKey"];
export type SystemCategoryType = (typeof SYSTEM_CATEGORIES)[number]["type"];

/**
 * Builds the 12 localized default system category rows seeded upon user registration (F4, DATA-4).
 */
export function buildDefaultCategoriesForUser(userId: string, locale: Locale) {
  const labels =
    locale === "en" ? enDictionary.categories : idDictionary.categories;

  return SYSTEM_CATEGORIES.map((item) => ({
    userId,
    name: labels[item.systemKey],
    type: item.type,
    isSystem: true,
    systemKey: item.systemKey,
  }));
}

