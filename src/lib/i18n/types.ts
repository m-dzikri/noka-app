export type Locale = "id" | "en";

export type Theme = "light" | "dark";

export interface PreferencesPatch {
  locale?: Locale;
  theme?: Theme;
}

export interface UpdatePreferencesOptions {
  persist?: boolean;
}

export type PersistPreferencesHandler = (
  patch: PreferencesPatch,
) => Promise<void> | void;

export interface LandingFeatureItem {
  title: string;
  description: string;
}

export interface LandingQuickCapturePreset {
  id: "expense" | "income" | "note";
  chip: string;
  kindLabel: string;
  categoryLabel: string;
  walletLabel?: string;
  amountSign?: "positive" | "negative" | "neutral";
  amountText?: string;
  noteTitle?: string;
  hintText: string;
}

export interface LandingChecklistItem {
  id: string;
  label: string;
}

export interface LandingDictionary {
  seoTitle: string;
  seoDescription: string;
  header: {
    primaryNavAriaLabel: string;
    previewLink: string;
    featuresLink: string;
    openWorkspace: string;
    signIn: string;
    signUp: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryGuestCta: string;
    secondaryGuestCta: string;
    primaryAuthCta: string;
    secondaryAuthCta: string;
    trustLine: string;
  };
  preview: {
    sectionTitle: string;
    sectionSubtitle: string;
    quickCaptureLabel: string;
    quickCaptureHint: string;
    detectedHeading: string;
    checklistHeading: string;
    safeToSpendTitle: string;
    safeToSpendVisibleAmount: string;
    safeToSpendSuffix: string;
    safeToSpendSubtext: string;
    linkedNotesTitle: string;
    linkedNotesDetailPrefix: string;
    linkedNotesVisibleAmount: string;
    privacyBlurButtonShow: string;
    privacyBlurButtonHide: string;
    privacyBlurHint: string;
    presets: [
      LandingQuickCapturePreset,
      LandingQuickCapturePreset,
      LandingQuickCapturePreset,
    ];
    checklistItems: [
      LandingChecklistItem,
      LandingChecklistItem,
      LandingChecklistItem,
    ];
  };
  features: {
    sectionTitle: string;
    sectionSubtitle: string;
    items: [
      LandingFeatureItem,
      LandingFeatureItem,
      LandingFeatureItem,
      LandingFeatureItem,
      LandingFeatureItem,
    ];
  };
  footer: {
    privacyHeading: string;
    privacyPoints: [string, string, string];
    copyright: string;
  };
}

export interface NotesDictionary {
  workspaceTitle: string;
  workspaceSubtitle: string;
  newNoteButton: string;
  creatingNote: string;
  searchLabel: string;
  searchPlaceholder: string;
  clearSearch: string;
  filterPinnedOnly: string;
  filterAllNotes: string;
  filterUnfiled: string;
  filterAllTags: string;
  filterByTagLabel: string;
  loadMoreButton: string;
  loadingMore: string;
  emptyListTitle: string;
  emptyListDescription: string;
  emptyFilterDescription: string;
  selectNotePromptTitle: string;
  selectNotePromptDescription: string;
  untitledNote: string;
  backToNotes: string;
  noteNotFoundTitle: string;
  noteNotFoundDescription: string;
  titleLabel: string;
  titlePlaceholder: string;
  contentLabel: string;
  contentPlaceholder: string;
  folderLabel: string;
  noFolderOption: string;
  pinButtonLabel: string;
  pinnedLabel: string;
  unpinnedLabel: string;
  modeEdit: string;
  modePreview: string;
  modeSplit: string;
  modeGroupAriaLabel: string;
  toolbarAriaLabel: string;
  toolHeading: string;
  toolBold: string;
  toolItalic: string;
  toolList: string;
  toolChecklist: string;
  toolCode: string;
  toolLink: string;
  toolDefaultHeading: string;
  toolDefaultBold: string;
  toolDefaultItalic: string;
  toolDefaultList: string;
  toolDefaultChecklist: string;
  toolDefaultCode: string;
  toolDefaultLink: string;
  tagsLabel: string;
  tagPlaceholder: string;
  addTagButton: string;
  maxTagsReached: string;
  removeTagAriaPrefix: string;
  statusSaved: string;
  statusSaving: string;
  statusPendingSync: string;
  statusError: string;
  conflictServerWinsNotice: string;
  checklistCountLabel: string;
  checklistToggleAria: string;
  previewEmpty: string;
  deleteNoteButton: string;
  deleteConfirmTitle: string;
  deleteConfirmDescription: string;
  deleteConfirmButton: string;
  deletingNote: string;
  noteCountSummary: string;
  attachments: {
    sectionTitle: string;
    countBadge: string;
    uploadButton: string;
    uploadInputAria: string;
    uploadingStatus: string;
    limitReachedNotice: string;
    offlineNotice: string;
    offlinePlaceholder: string;
    retryLoadButton: string;
    emptyText: string;
    imageAlt: string;
    openPreviewAria: string;
    deleteButton: string;
    deleteButtonAria: string;
    deleteConfirmTitle: string;
    deleteConfirmDescription: string;
    deleteConfirmButton: string;
    deletingButton: string;
    lightboxTitle: string;
    closePreview: string;
    unsupportedClientType: string;
    clientEmptyFile: string;
    clientFileTooLarge: string;
  };
}

export interface FoldersDictionary {
  manageButton: string;
  modalTitle: string;
  modalDescription: string;
  newFolderLabel: string;
  newFolderPlaceholder: string;
  createButton: string;
  creatingButton: string;
  renameButton: string;
  saveRenameButton: string;
  deleteButton: string;
  emptyTitle: string;
  folderNameRequired: string;
  deleteNotice: string;
}

export interface PrivacyDictionary {
  hideLabel: string;
  showLabel: string;
  shortLabel: string;
  activeBadge: string;
  hiddenAriaLabel: string;
  maskedValue: string;
}

export interface FinanceDictionary {
  pageTitle: string;
  pageSubtitle: string;
  totalBalanceLabel: string;
  walletsSectionTitle: string;
  manageWalletsButton: string;
  manageCategoriesButton: string;
  newTransactionButton: string;
  newTransferButton: string;
  showArchivedLabel: string;
  defaultBadge: string;
  archivedBadge: string;
  safeToSpendBadge: string;
  noWalletsTitle: string;
  noWalletsDescription: string;
  createFirstWalletCta: string;
  walletTypes: {
    cash: string;
    bank: string;
    ewallet: string;
  };
  filters: {
    allWallets: string;
    allTypes: string;
    income: string;
    expense: string;
    transfer: string;
    allCategories: string;
    fromDate: string;
    toDate: string;
    reset: string;
    cycleDefaultHint: string;
  };
  ledger: {
    sectionTitle: string;
    allTab: string;
    transactionsTab: string;
    transfersTab: string;
    linkedBadge: string;
    transferBadge: string;
    emptyCombined: string;
    emptyTransactions: string;
    emptyTransfers: string;
    loadMore: string;
    loadingMore: string;
    editButton: string;
    deleteButton: string;
    deletingButton: string;
    confirmDeleteTransaction: string;
    confirmDeleteTransfer: string;
    transferArrowAria: string;
  };
  summary: {
    sectionTitle: string;
    totalIncome: string;
    totalExpense: string;
    netCashflow: string;
    categoryBreakdownTitle: string;
    emptyBreakdown: string;
    excludedTransferNote: string;
    shareLabel: string;
  };
  safeToSpend: {
    title: string;
    perDaySuffix: string;
    cycleRangeLabel: string;
    remainingDaysLabel: string;
    includedBalanceLabel: string;
    includedWalletsCount: string;
    noWalletsHint: string;
    nonPositiveHint: string;
    activeHint: string;
  };
  walletModal: {
    title: string;
    description: string;
    newWalletHeading: string;
    editWalletHeading: string;
    nameLabel: string;
    namePlaceholder: string;
    typeLabel: string;
    initialBalanceLabel: string;
    includeInSafeToSpendLabel: string;
    setDefaultLabel: string;
    createButton: string;
    creatingButton: string;
    saveButton: string;
    savingButton: string;
    cancelEditButton: string;
    editButton: string;
    archiveButton: string;
    unarchiveButton: string;
    deleteButton: string;
    archiveOfferTitle: string;
    archiveOfferButton: string;
    nameRequiredError: string;
    invalidAmountError: string;
  };
  categoryModal: {
    title: string;
    description: string;
    newCategoryHeading: string;
    nameLabel: string;
    namePlaceholder: string;
    typeLabel: string;
    createButton: string;
    creatingButton: string;
    systemLockedBadge: string;
    renameButton: string;
    saveRenameButton: string;
    deleteButton: string;
    migrateNotice: string;
    nameRequiredError: string;
  };
  transactionModal: {
    createTitle: string;
    editTitle: string;
    typeLabel: string;
    incomeOption: string;
    expenseOption: string;
    walletLabel: string;
    categoryLabel: string;
    amountLabel: string;
    amountPlaceholder: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
    occurredAtLabel: string;
    createButton: string;
    creatingButton: string;
    saveButton: string;
    savingButton: string;
    noActiveWalletsNotice: string;
    invalidAmountError: string;
    selectWalletError: string;
    selectCategoryError: string;
  };
  transferModal: {
    createTitle: string;
    editTitle: string;
    fromWalletLabel: string;
    toWalletLabel: string;
    amountLabel: string;
    amountPlaceholder: string;
    noteLabel: string;
    notePlaceholder: string;
    occurredAtLabel: string;
    createButton: string;
    creatingButton: string;
    saveButton: string;
    savingButton: string;
    needTwoWalletsNotice: string;
    sameWalletError: string;
    invalidAmountError: string;
  };
}

export interface QuickCaptureDictionary {
  ariaLabel: string;
  title: string;
  placeholder: string;
  shortcutHint: string;
  modeNoteLabel: string;
  modeTransactionLabel: string;
  modeOverrideActive: string;
  intentDetectedTransaction: string;
  intentDetectedNote: string;
  txTypeExpense: string;
  txTypeIncome: string;
  walletLabel: string;
  categoryLabel: string;
  descriptionLabel: string;
  noteTitleLabel: string;
  amountLabel: string;
  submitTransaction: string;
  submitNote: string;
  submitting: string;
  noWalletsTitle: string;
  noWalletsAction: string;
  fallbackAsNoteAction: string;
  missingCategoryError: string;
  invalidAmountError: string;
  transactionSavedFeedback: string;
  noteSavedFeedback: string;
  openFinanceLink: string;
  openNoteLink: string;
  clearButton: string;
  collapsePreview: string;
  expandPreview: string;
  noWalletSelected: string;
}

export interface LinkedNotesDictionary {
  sectionTitle: string;
  sectionSubtitle: string;
  totalIncome: string;
  totalExpense: string;
  netAmount: string;
  emptyTitle: string;
  emptySubtitle: string;
  createNewButton: string;
  linkExistingButton: string;
  unlinkButton: string;
  unlinkingButton: string;
  closeModalButton: string;
  createTitle: string;
  typeLabel: string;
  expenseOption: string;
  incomeOption: string;
  walletLabel: string;
  categoryLabel: string;
  amountLabel: string;
  amountPlaceholder: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  occurredAtLabel: string;
  submitCreateButton: string;
  submittingCreateButton: string;
  noWalletsNotice: string;
  pickerTitle: string;
  pickerSearchPlaceholder: string;
  pickerFilterUnlinkedOnly: string;
  pickerLoading: string;
  pickerEmpty: string;
  pickerLoadMore: string;
  pickerLoadingMore: string;
  pickerAlreadyLinkedOther: string;
  pickerAlreadyLinkedCurrent: string;
  pickerLinkAction: string;
  pickerLinkingAction: string;
  unlinkSuccess: string;
  linkedSuccess: string;
  createdSuccess: string;
  untitledNote: string;
  ledgerOpenNotePrefix: string;
  invalidAmountError: string;
}

export interface Dictionary {
  common: {
    appName: string;
    tagline: string;
    loading: string;
    save: string;
    cancel: string;
    close: string;
    overviewHeading: string;
    overviewDescription: string;
    notesCardTitle: string;
    notesCardDescription: string;
    openNotes: string;
    financeCardTitle: string;
    financeCardDescription: string;
    openFinance: string;
    quickCapturePlaceholder: string;
    quickActionButton: string;
  };
  nav: {
    workspaceAriaLabel: string;
    mobileNavAriaLabel: string;
    openMenuAriaLabel: string;
    closeMenuAriaLabel: string;
    mobileMenuAriaLabel: string;
    languageLabel: string;
    themeLabel: string;
    notes: string;
    finance: string;
    settings: string;
    quickAction: string;
    skipToContent: string;
  };
  errors: {
    INVALID_JSON: string;
    INTERNAL_ERROR: string;
    VALIDATION_ERROR: string;
    IDEMPOTENCY_KEY_CONFLICT: string;
    INVALID_TIMESTAMP: string;
    DB_UNAVAILABLE: string;
    CSRF_ORIGIN_MISMATCH: string;
    EMAIL_ALREADY_EXISTS: string;
    INVALID_CREDENTIALS: string;
    UNAUTHORIZED: string;
    RATE_LIMITED: string;
    MAIL_DELIVERY_UNAVAILABLE: string;
    INVALID_OR_EXPIRED_TOKEN: string;
    NOT_FOUND: string;
    NOTE_NOT_FOUND: string;
    FOLDER_NOT_FOUND: string;
    INVALID_CURSOR: string;
    FOLDER_NAME_EXISTS: string;
    NOTE_ALREADY_EXISTS: string;
    FOLDER_ALREADY_EXISTS: string;
    INVALID_MULTIPART: string;
    PAYLOAD_TOO_LARGE: string;
    EMPTY_FILE: string;
    FILE_TOO_LARGE: string;
    UNSUPPORTED_IMAGE_TYPE: string;
    ATTACHMENT_LIMIT_REACHED: string;
    ATTACHMENT_NOT_FOUND: string;
    ATTACHMENT_OBJECT_MISSING: string;
    STORAGE_UNAVAILABLE: string;
    RESOURCE_ALREADY_EXISTS: string;
    WALLET_NOT_FOUND: string;
    WALLET_ARCHIVED: string;
    WALLET_HAS_HISTORY: string;
    CATEGORY_NOT_FOUND: string;
    CATEGORY_ALREADY_EXISTS: string;
    CATEGORY_TYPE_MISMATCH: string;
    CANNOT_MODIFY_SYSTEM_CATEGORY: string;
    CANNOT_DELETE_SYSTEM_CATEGORY: string;
    TRANSACTION_NOT_FOUND: string;
    TRANSACTION_ALREADY_LINKED: string;
    TRANSFER_NOT_FOUND: string;
    SAME_WALLET_TRANSFER: string;
    generic: string;
  };
  preferences: {
    themeToggleLabel: string;
    lightMode: string;
    darkMode: string;
    switchToLight: string;
    switchToDark: string;
    localeToggleLabel: string;
    indonesian: string;
    english: string;
    switchToId: string;
    switchToEn: string;
  };
  auth: {
    backToHome: string;
    loginTitle: string;
    loginSubtitle: string;
    registerTitle: string;
    registerSubtitle: string;
    forgotPasswordTitle: string;
    forgotPasswordSubtitle: string;
    resetPasswordTitle: string;
    resetPasswordSubtitle: string;
    nameLabel: string;
    namePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    passwordHint: string;
    confirmPasswordLabel: string;
    confirmPasswordPlaceholder: string;
    newPasswordLabel: string;
    confirmNewPasswordLabel: string;
    loginButton: string;
    loggingInButton: string;
    registerButton: string;
    registeringButton: string;
    forgotPasswordLink: string;
    noAccountPrompt: string;
    createAccountLink: string;
    hasAccountPrompt: string;
    signInLink: string;
    sendResetLinkButton: string;
    sendingResetLinkButton: string;
    resetPasswordButton: string;
    resettingPasswordButton: string;
    backToLoginLink: string;
    requestNewLink: string;
    logoutButton: string;
    loggingOutButton: string;
    nameRequiredError: string;
    emailInvalidError: string;
    passwordTooShortError: string;
    passwordMismatchError: string;
    forgotPasswordGenericSuccess: string;
    forgotPasswordGenericApiMessage: string;
    resetPasswordSuccess: string;
    resetTokenMissingError: string;
    rateLimitedRetryMessage: string;
    forgotPasswordEmailSubject: string;
    forgotPasswordEmailHeading: string;
    forgotPasswordEmailIntro: string;
    forgotPasswordEmailAction: string;
    forgotPasswordEmailExpiry: string;
    forgotPasswordEmailIgnore: string;
  };
  categories: {
    food_drink: string;
    transport: string;
    shopping: string;
    bills: string;
    entertainment: string;
    health: string;
    education: string;
    other_expense: string;
    salary: string;
    bonus: string;
    refund: string;
    other_income: string;
  };
  // Strongly typed landing page & SEO dictionary populated in RFC-003.
  landing: LandingDictionary;
  // Strongly typed Notes & Folders namespaces populated in RFC-004.
  notes: NotesDictionary;
  folders: FoldersDictionary;
  // Strongly typed Finance Core & Dashboard namespaces populated in RFC-006 / RFC-007.
  finance: FinanceDictionary;
  privacy: PrivacyDictionary;
  // Strongly typed Quick Capture & Linked Notes namespaces populated in RFC-008.
  quickCapture: QuickCaptureDictionary;
  linkedNotes: LinkedNotesDictionary;
  // Strongly typed Offline Sync & PWA namespace populated in RFC-009.
  sync: SyncDictionary;
  // Strongly typed Account Settings & Deletion namespace populated in RFC-010.
  settings: SettingsDictionary;
}

export interface SettingsPrivacySummaryDictionary {
  heading: string;
  subheading: string;
  zeroLogsTitle: string;
  zeroLogsDesc: string;
  userIsolationTitle: string;
  userIsolationDesc: string;
  localControlTitle: string;
  localControlDesc: string;
  noTrackingTitle: string;
  noTrackingDesc: string;
}

export interface SettingsDictionary {
  pageTitle: string;
  pageSubtitle: string;
  profileTitle: string;
  profileSubtitle: string;
  emailLabel: string;
  emailHelp: string;
  nameLabel: string;
  namePlaceholder: string;
  localeLabel: string;
  localeOptionId: string;
  localeOptionEn: string;
  themeLabel: string;
  themeOptionLight: string;
  themeOptionDark: string;
  cycleStartDayLabel: string;
  cycleStartDayHelp: string;
  cycleDayPrefix: string;
  cycleEndOfMonth: string;
  saveProfileButton: string;
  savingProfileButton: string;
  profileSavedSuccess: string;
  offlineProfileNotice: string;
  passwordTitle: string;
  passwordSubtitle: string;
  currentPasswordLabel: string;
  currentPasswordPlaceholder: string;
  newPasswordLabel: string;
  newPasswordPlaceholder: string;
  newPasswordHelp: string;
  confirmPasswordLabel: string;
  confirmPasswordPlaceholder: string;
  passwordMismatchError: string;
  invalidCurrentPasswordError: string;
  changePasswordButton: string;
  changingPasswordButton: string;
  passwordChangedSuccess: string;
  offlinePasswordNotice: string;
  deleteAccountTitle: string;
  deleteAccountSubtitle: string;
  deleteAccountWarningHeading: string;
  deleteAccountWarningBody: string;
  deleteAccountButton: string;
  offlineDeleteAccountNotice: string;
  deleteModalTitle: string;
  deleteModalBody: string;
  deleteModalConfirmPrompt: string;
  deleteModalConfirmWord: string;
  deleteModalPasswordLabel: string;
  deleteModalPasswordPlaceholder: string;
  deleteModalCancelButton: string;
  deleteModalConfirmButton: string;
  deleteModalDeletingButton: string;
  invalidPasswordError: string;
  deleteAccountGenericError: string;
  privacySummary: SettingsPrivacySummaryDictionary;
}

export interface SyncDictionary {
  statusSynced: string;
  statusOffline: string;
  statusSyncing: string;
  statusSyncError: string;
  statusAriaLabel: string;
  syncNowButton: string;
  syncingButton: string;
  openDetailsAriaLabel: string;
  panelTitle: string;
  panelCloseButton: string;
  pendingCountPrefix: string;
  failedCountPrefix: string;
  lastSyncedPrefix: string;
  neverSyncedLabel: string;
  failedItemsHeading: string;
  discardMutationButton: string;
  onlineOnlyWalletsNotice: string;
  onlineOnlyCategoriesNotice: string;
  onlineOnlyAttachmentsNotice: string;
  privateModeBannerTitle: string;
  privateModeBannerBody: string;
  dismissBannerButton: string;
  offlineNoteFallbackHint: string;
}

