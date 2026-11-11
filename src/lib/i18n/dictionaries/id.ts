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
    CSRF_ORIGIN_MISMATCH: "Asal permintaan tidak diizinkan.",
    EMAIL_ALREADY_EXISTS: "Email ini sudah terdaftar. Silakan masuk.",
    INVALID_CREDENTIALS: "Email atau kata sandi salah.",
    UNAUTHORIZED: "Sesi Anda telah berakhir. Silakan masuk kembali.",
    RATE_LIMITED: "Terlalu banyak percobaan. Silakan tunggu sebentar.",
    MAIL_DELIVERY_UNAVAILABLE:
      "Layanan pengiriman email sedang tidak tersedia. Coba lagi nanti.",
    INVALID_OR_EXPIRED_TOKEN:
      "Tautan atur ulang kata sandi tidak valid atau sudah kedaluwarsa.",
    NOT_FOUND: "Sumber daya tidak ditemukan.",
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
  auth: {
    backToHome: "Beranda",
    loginTitle: "Masuk ke Noka",
    loginSubtitle: "Akses catatan Markdown dan buku kas multi-dompet Anda.",
    registerTitle: "Buat Akun Noka",
    registerSubtitle: "Daftar dan langsung mulai tanpa menunggu verifikasi email.",
    forgotPasswordTitle: "Lupa Kata Sandi",
    forgotPasswordSubtitle:
      "Masukkan email terdaftar Anda untuk menerima tautan pengaturan ulang.",
    resetPasswordTitle: "Atur Ulang Kata Sandi",
    resetPasswordSubtitle: "Masukkan kata sandi baru minimal 8 karakter.",
    nameLabel: "Nama Lengkap",
    namePlaceholder: "Contoh: Raka Pratama",
    emailLabel: "Alamat Email",
    emailPlaceholder: "nama@email.com",
    passwordLabel: "Kata Sandi",
    passwordPlaceholder: "Minimal 8 karakter",
    passwordHint: "Minimal 8 karakter",
    confirmPasswordLabel: "Konfirmasi Kata Sandi",
    confirmPasswordPlaceholder: "Ulangi kata sandi",
    newPasswordLabel: "Kata Sandi Baru",
    confirmNewPasswordLabel: "Konfirmasi Kata Sandi Baru",
    loginButton: "Masuk",
    loggingInButton: "Memproses...",
    registerButton: "Daftar & Masuk",
    registeringButton: "Membuat akun...",
    forgotPasswordLink: "Lupa kata sandi?",
    noAccountPrompt: "Belum punya akun?",
    createAccountLink: "Daftar di sini",
    hasAccountPrompt: "Sudah punya akun?",
    signInLink: "Masuk di sini",
    sendResetLinkButton: "Kirim Tautan Reset",
    sendingResetLinkButton: "Mengirim...",
    resetPasswordButton: "Simpan Kata Sandi Baru",
    resettingPasswordButton: "Menyimpan...",
    backToLoginLink: "Kembali ke halaman masuk",
    requestNewLink: "Minta tautan reset baru",
    logoutButton: "Keluar",
    loggingOutButton: "Keluar...",
    nameRequiredError: "Nama wajib diisi.",
    emailInvalidError: "Format email tidak valid.",
    passwordTooShortError: "Kata sandi minimal 8 karakter.",
    passwordMismatchError: "Konfirmasi kata sandi tidak cocok.",
    forgotPasswordGenericSuccess:
      "Jika email terdaftar, tautan atur ulang kata sandi telah dikirim (berlaku 30 menit).",
    forgotPasswordGenericApiMessage:
      "Jika email terdaftar, kami telah mengirimkan tautan untuk mengatur ulang kata sandi Anda.",
    resetPasswordSuccess:
      "Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru Anda.",
    resetTokenMissingError:
      "Token reset tidak ditemukan atau tidak valid. Silakan minta tautan baru.",
    rateLimitedRetryMessage:
      "Terlalu banyak percobaan. Silakan coba lagi dalam {seconds} detik.",
    forgotPasswordEmailSubject: "Atur ulang kata sandi Noka Anda",
    forgotPasswordEmailHeading: "Permintaan Atur Ulang Kata Sandi",
    forgotPasswordEmailIntro:
      "Kami menerima permintaan untuk mengatur ulang kata sandi akun Noka Anda. Klik tombol di bawah untuk membuat kata sandi baru:",
    forgotPasswordEmailAction: "Atur Ulang Kata Sandi",
    forgotPasswordEmailExpiry:
      "Tautan ini hanya berlaku satu kali selama 30 menit.",
    forgotPasswordEmailIgnore:
      "Jika Anda tidak meminta perubahan ini, abaikan email ini.",
  },
  categories: {
    food_drink: "Makan & Minum",
    transport: "Transportasi",
    shopping: "Belanja",
    bills: "Tagihan",
    entertainment: "Hiburan",
    health: "Kesehatan",
    education: "Pendidikan",
    other_expense: "Lainnya",
    salary: "Gaji",
    bonus: "Bonus",
    refund: "Refund",
    other_income: "Lainnya",
  },
  landing: {
    seoTitle: "Noka — Seringan Notepad, Serapi Buku Kas",
    seoDescription:
      "Catatan Markdown, checklist GFM interaktif, Quick Capture offline, Safe-to-Spend harian, dan Privacy Blur dalam satu workspace ringan.",
    header: {
      primaryNavAriaLabel: "Navigasi utama landing",
      openWorkspace: "Buka Workspace",
      signIn: "Masuk",
      signUp: "Daftar",
    },
    hero: {
      eyebrow: "Catatan Markdown & Kas Multi-Dompet IDR",
      title: "Seringan Notepad, Serapi Buku Kas.",
      subtitle:
        "Tulis ide, centang checklist GFM, dan catat pengeluaran dalam hitungan detik—tetap jalan saat offline dan terlindung Privacy Blur sekali klik.",
      primaryGuestCta: "Mulai Gratis",
      secondaryGuestCta: "Masuk",
      primaryAuthCta: "Buka Workspace",
      secondaryAuthCta: "Lihat Pratinjau",
      trustLine:
        "Tanpa verifikasi email bertele-tele • Parsing lokal di perangkat • Data 100% privat per akun",
    },
    preview: {
      sectionTitle: "Pratinjau Interaktif",
      sectionSubtitle:
        "Coba simulasi Quick Capture, checklist GFM, Safe-to-Spend, Linked Notes, dan Privacy Blur langsung di sini—tanpa mengirim data ke server.",
      quickCaptureLabel: "Pilih contoh input Quick Capture",
      quickCaptureHint:
        "Ketik alami: angka non-nominal seperti nomor bab atau jam rapat tetap dikenali sebagai catatan.",
      detectedHeading: "Hasil Deteksi Lokal",
      checklistHeading: "Checklist GFM Interaktif",
      safeToSpendTitle: "Safe-to-Spend Harian",
      safeToSpendVisibleAmount: "Rp85.000",
      safeToSpendSuffix: " / hari • 12 hari tersisa",
      safeToSpendSubtext: "Tunai & E-Wallet aktif • Tabungan Bank dikecualikan",
      linkedNotesTitle: "Linked Notes ↔ Transaksi",
      linkedNotesDetailPrefix: "Skripsi & Riset • 2 transaksi • Net ",
      linkedNotesVisibleAmount: "-Rp125.000",
      privacyBlurButtonShow: "Aktifkan Demo Privacy Blur",
      privacyBlurButtonHide: "Matikan Demo Privacy Blur",
      privacyBlurHint:
        "Hanya mode demo pratinjau; tidak mengubah preferensi akun Anda.",
      presets: [
        {
          id: "expense",
          chip: "kopi kenangan 24rb gopay",
          kindLabel: "Pengeluaran",
          categoryLabel: "Makan & Minum",
          walletLabel: "GoPay",
          amountSign: "neutral",
          amountText: "Rp24.000",
          hintText: "Terdeteksi otomatis: nominal IDR 24rb + dompet GoPay",
        },
        {
          id: "income",
          chip: "+gaji 5jt bca",
          kindLabel: "Pemasukan",
          categoryLabel: "Gaji",
          walletLabel: "BCA",
          amountSign: "positive",
          amountText: "+Rp5.000.000",
          hintText: "Prefiks + menandai pemasukan ke dompet BCA",
        },
        {
          id: "note",
          chip: "bab 3 skripsi",
          kindLabel: "Catatan",
          categoryLabel: "Tanpa Transaksi",
          noteTitle: "bab 3 skripsi",
          hintText:
            "Aturan konservatif: angka \"bab 3\" tidak disalahartikan sebagai nominal uang",
        },
      ],
      checklistItems: [
        { id: "chk-1", label: "Review draft bab 3 sebelum bimbingan" },
        { id: "chk-2", label: "Catat pengeluaran kopi & transportasi hari ini" },
        { id: "chk-3", label: "Cek sisa kuota Safe-to-Spend minggu ini" },
      ],
    },
    features: {
      sectionTitle: "Dirancang untuk Kecepatan dan Ketertiban Harian",
      sectionSubtitle:
        "Lima fondasi inti yang menjaga catatan pribadi dan kas IDR tetap sinkron tanpa terasa berat.",
      items: [
        {
          title: "Catatan Markdown & Checklist GFM",
          description:
            "Editor bersih dengan pratinjau aman serta kotak centang GFM yang bisa diklik langsung tanpa menyentuh sintaks mentah.",
        },
        {
          title: "Smart Quick Capture Offline",
          description:
            "Satu kotak input cepat membedakan transaksi IDR dan catatan berangka secara konservatif 100% lokal di perangkat.",
        },
        {
          title: "Linked Notes ↔ Transaksi",
          description:
            "Tautkan pemasukan atau pengeluaran ke catatan proyek tertentu dan pantau ringkasan masuk, keluar, serta saldo bersih.",
        },
        {
          title: "Safe-to-Spend Harian",
          description:
            "Hitung batas aman belanja harian secara deterministik berdasarkan saldo dompet harian dibagi sisa hari siklus aktif.",
        },
        {
          title: "Privacy Blur Sekali Klik",
          description:
            "Samarkan seluruh angka saldo dan nominal transaksi di layar seketika menjadi Rp ••••• saat bekerja di tempat umum.",
        },
      ],
    },
    footer: {
      privacyHeading: "Privasi & Kontrol Data di Tangan Anda",
      privacyPoints: [
        "Isolasi data ketat per akun: catatan, dompet, dan lampiran gambar bersifat 100% privat.",
        "Parsing Quick Capture berjalan 100% lokal di perangkat tanpa mengirim teks Anda ke AI eksternal.",
        "Kendali penuh: hapus akun mandiri kapan saja beserta pembersihan cache offline perangkat.",
      ],
      copyright: "Noka • Note + Kas",
    },
  },
};

