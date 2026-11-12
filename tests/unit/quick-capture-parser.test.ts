import { describe, expect, it } from "vitest";
import { SYSTEM_CATEGORIES } from "@/features/auth/default-categories";
import { parseQuickCapture } from "@/features/quick-capture/parser";
import type {
  QuickCaptureCategorySummary,
  QuickCaptureContext,
  QuickCaptureWalletSummary,
} from "@/features/quick-capture/types";

const WALLETS: QuickCaptureWalletSummary[] = [
  {
    id: "w-cash",
    name: "Kas Tunai",
    isDefault: true,
    archivedAt: null,
  },
  {
    id: "w-gopay",
    name: "GoPay",
    isDefault: false,
    archivedAt: null,
  },
  {
    id: "w-bca",
    name: "BCA",
    isDefault: false,
    archivedAt: null,
  },
  {
    id: "w-archived",
    name: "Dompet Lama",
    isDefault: false,
    archivedAt: "2026-10-01T00:00:00.000Z",
  },
];

const CATEGORIES: QuickCaptureCategorySummary[] = [
  ...SYSTEM_CATEGORIES.map((item) => ({
    id: `cat-${item.systemKey}`,
    name: item.systemKey,
    type: item.type,
    systemKey: item.systemKey,
  })),
  {
    id: "cat-custom-coffee",
    name: "Kopi Spesial",
    type: "expense",
    systemKey: null,
  },
];

const BASE_CONTEXT: QuickCaptureContext = {
  wallets: WALLETS,
  categories: CATEGORIES,
  defaultWalletId: "w-cash",
};

describe("parseQuickCapture conservative local rule parser (TS-008-01)", () => {
  it("parses Indonesian/English expense and income amounts, units, decimals, and courtesy exclusions", () => {
    expect(parseQuickCapture("kopi kenangan 24rb gopay", BASE_CONTEXT)).toEqual({
      intent: "transaction",
      type: "expense",
      amount: 24_000,
      walletId: "w-gopay",
      categoryId: "cat-food_drink",
      description: "kopi kenangan",
    });

    expect(parseQuickCapture("+gaji 5jt bca", BASE_CONTEXT)).toEqual({
      intent: "transaction",
      type: "income",
      amount: 5_000_000,
      walletId: "w-bca",
      categoryId: "cat-salary",
      description: "gaji",
    });

    expect(parseQuickCapture("kopi 1.50 rb", BASE_CONTEXT)).toEqual({
      intent: "transaction",
      type: "expense",
      amount: 1_500,
      walletId: "w-cash",
      categoryId: "cat-food_drink",
      description: "kopi",
    });

    expect(parseQuickCapture("beli jam 25.000", BASE_CONTEXT)).toEqual({
      intent: "transaction",
      type: "expense",
      amount: 25_000,
      walletId: "w-cash",
      categoryId: "cat-shopping",
      description: "beli jam",
    });

    expect(parseQuickCapture("beli jam 50 rb", BASE_CONTEXT)).toEqual({
      intent: "transaction",
      type: "expense",
      amount: 50_000,
      walletId: "w-cash",
      categoryId: "cat-shopping",
      description: "beli jam",
    });

    expect(parseQuickCapture("+50rb", BASE_CONTEXT)).toEqual({
      intent: "transaction",
      type: "income",
      amount: 50_000,
      walletId: "w-cash",
      categoryId: "cat-other_income",
      description: "50rb",
    });

    expect(
      parseQuickCapture("terima kasih bayar parkir 5000", BASE_CONTEXT),
    ).toEqual({
      intent: "transaction",
      type: "expense",
      amount: 5_000,
      walletId: "w-cash",
      categoryId: "cat-transport",
      description: "terima kasih bayar parkir",
    });
  });

  it("conservatively keeps non-monetary numbers, dates, times, and notes under 1000 as note intent", () => {
    const emptyRes = parseQuickCapture("   ", BASE_CONTEXT);
    expect(emptyRes).toEqual({ intent: "note", title: "", content: "" });

    for (const sample of [
      "bab 3 skripsi",
      "meeting jam 10",
      "meeting 10:30 tim",
      "2026-11-11 jadwal kuliah",
      "tgl 15/11/2026 bayar nanti",
      "beli permen 500",
      "page 42 notes",
    ]) {
      const parsed = parseQuickCapture(sample, BASE_CONTEXT);
      expect(parsed.intent).toBe("note");
      if (parsed.intent === "note") {
        expect(parsed.title).toBe(sample.slice(0, 120));
        expect(parsed.content).toBe(sample);
      }
    }

    const longMultiline = `${"A".repeat(140)}\nBaris kedua catatan`;
    const multiRes = parseQuickCapture(longMultiline, BASE_CONTEXT);
    expect(multiRes).toEqual({
      intent: "note",
      title: "A".repeat(120),
      content: longMultiline,
    });
  });

  it("prefers active non-archived wallets, prioritizes custom categories, handles all 12 systemKeys, and slices description <= 300 chars", () => {
    // Archived wallet must be ignored -> falls back to defaultWalletId ("w-cash")
    const archivedMention = parseQuickCapture(
      "makan siang 35rb Dompet Lama",
      BASE_CONTEXT,
    );
    expect(archivedMention.intent).toBe("transaction");
    if (archivedMention.intent === "transaction") {
      expect(archivedMention.walletId).toBe("w-cash");
    }

    // Custom category wins over system food_drink synonym ("kopi")
    const customMatch = parseQuickCapture(
      "beli Kopi Spesial 45rb",
      BASE_CONTEXT,
    );
    expect(customMatch.intent).toBe("transaction");
    if (customMatch.intent === "transaction") {
      expect(customMatch.categoryId).toBe("cat-custom-coffee");
    }

    // Zero active wallets -> walletId = null
    const noActiveWallet = parseQuickCapture("jajan 10rb", {
      wallets: [WALLETS[3]!],
      categories: CATEGORIES,
      defaultWalletId: WALLETS[3]!.id,
    });
    expect(noActiveWallet.intent).toBe("transaction");
    if (noActiveWallet.intent === "transaction") {
      expect(noActiveWallet.walletId).toBeNull();
    }

    // Description capped at 300 characters
    const longDescInput = `${"Catatan panjang transaksi ".repeat(20)} 15rb`;
    const capped = parseQuickCapture(longDescInput, BASE_CONTEXT);
    expect(capped.intent).toBe("transaction");
    if (capped.intent === "transaction") {
      expect(capped.description.length).toBeLessThanOrEqual(300);
    }

    // Smoke test all 12 systemKeys resolve cleanly
    const systemSamples: Array<[string, string]> = [
      ["kopi 15rb", "cat-food_drink"],
      ["bensin 30rb", "cat-transport"],
      ["belanja indomaret 60rb", "cat-shopping"],
      ["listrik pln 200rb", "cat-bills"],
      ["tiket bioskop 50rb", "cat-entertainment"],
      ["apotek vitamin 75rb", "cat-health"],
      ["beli buku kuliah 120rb", "cat-education"],
      ["pengeluaran acak 15rb", "cat-other_expense"],
      ["gaji bulan ini 5jt", "cat-salary"],
      ["bonus proyek 500rb", "cat-bonus"],
      ["refund ongkir 12rb", "cat-refund"],
      ["pemasukan hadiah 100rb", "cat-other_income"],
    ];
    for (const [text, expectedCatId] of systemSamples) {
      const res = parseQuickCapture(text, BASE_CONTEXT);
      expect(res.intent).toBe("transaction");
      if (res.intent === "transaction") {
        expect(res.categoryId).toBe(expectedCatId);
      }
    }
  });

  it("executes strictly under 50 ms on average and p99 across 100 wallets and 100 categories", () => {
    const manyWallets: QuickCaptureWalletSummary[] = Array.from(
      { length: 100 },
      (_, idx) => ({
        id: `wallet-${idx}`,
        name: `Dompet ${idx}`,
        isDefault: idx === 0,
        archivedAt: null,
      }),
    );
    const manyCategories: QuickCaptureCategorySummary[] = [
      ...CATEGORIES,
      ...Array.from({ length: 87 }, (_, idx) => ({
        id: `custom-${idx}`,
        name: `Kategori Custom ${idx}`,
        type: (idx % 2 === 0 ? "expense" : "income") as "expense" | "income",
        systemKey: null,
      })),
    ];
    const stressCtx: QuickCaptureContext = {
      wallets: manyWallets,
      categories: manyCategories,
      defaultWalletId: "wallet-0",
    };

    const durations: number[] = [];
    for (let i = 0; i < 100; i += 1) {
      const sample =
        i % 3 === 0
          ? `beli makan siang 35rb Dompet ${i % 100}`
          : i % 3 === 1
            ? `+bonus proyek 1.5jt Dompet ${i % 100}`
            : `meeting jam 10 bahas bab ${i % 20} skripsi`;
      const start = performance.now();
      parseQuickCapture(sample, stressCtx);
      durations.push(performance.now() - start);
    }

    durations.sort((a, b) => a - b);
    const avg = durations.reduce((acc, d) => acc + d, 0) / durations.length;
    const p99 = durations[Math.min(durations.length - 1, 98)]!;

    expect(avg).toBeLessThan(50);
    expect(p99).toBeLessThan(50);
  });
});

