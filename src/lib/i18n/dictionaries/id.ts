import type { Dictionary } from "@/lib/i18n/types";

export const idDictionary: Dictionary = {
  common: {
    appName: "Noka",
    tagline: "Seringan Notepad, Serapi Buku Kas.",
    loading: "Memuat...",
    save: "Simpan",
    cancel: "Batal",
    close: "Tutup",
    overviewHeading: "Selamat datang di Noka",
    overviewDescription:
      "Kelola catatan Markdown, daftar periksa harian, dan pencatatan keuangan multi-dompet Anda dari satu ruang kerja ringan.",
    notesCardTitle: "Ruang Catatan",
    notesCardDescription:
      "Tulis catatan cepat, kelola folder, tandai checklist GFM, dan temukan kembali dalam sekejap.",
    openNotes: "Buka Catatan",
    financeCardTitle: "Ruang Keuangan",
    financeCardDescription:
      "Pantau saldo dompet IDR, catat pemasukan maupun pengeluaran, dan lacak transfer antar-dompet.",
    openFinance: "Buka Keuangan",
    quickCapturePlaceholder: "Ketik catatan atau pengeluaran cepat...",
    quickActionButton: "Catat",
  },
  nav: {
    workspaceAriaLabel: "Navigasi ruang kerja",
    mobileNavAriaLabel: "Navigasi seluler",
    notes: "Catatan",
    finance: "Keuangan",
    settings: "Pengaturan",
    quickAction: "Catat Cepat",
    skipToContent: "Lompat ke konten utama",
  },
  errors: {
    INVALID_JSON: "Format JSON permintaan tidak valid.",
    INTERNAL_ERROR: "Terjadi kesalahan internal server. Silakan coba lagi.",
    VALIDATION_ERROR: "Data masukan tidak valid.",
    IDEMPOTENCY_KEY_CONFLICT:
      "Kunci idempotensi sudah dipakai oleh permintaan dengan muatan berbeda.",
    INVALID_TIMESTAMP: "Format waktu pembaruan tidak valid.",
    DB_UNAVAILABLE: "Layanan database sementara tidak tersedia.",
    generic: "Permintaan tidak dapat diproses.",
  },
  preferences: {
    themeToggleLabel: "Ubah tema tampilan",
    lightMode: "Terang",
    darkMode: "Gelap",
    switchToLight: "Ganti ke mode terang",
    switchToDark: "Ganti ke mode gelap",
    localeToggleLabel: "Ubah bahasa aplikasi",
    indonesian: "ID",
    english: "EN",
    switchToId: "Ganti ke Bahasa Indonesia",
    switchToEn: "Ganti ke Bahasa Inggris",
  },
};

