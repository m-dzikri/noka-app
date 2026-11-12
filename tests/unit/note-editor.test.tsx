import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FolderManagerModal } from "@/components/notes/FolderManagerModal";
import { NoteDetailView } from "@/components/notes/NoteDetailView";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { NotesWorkspace } from "@/components/notes/NotesWorkspace";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { LocaleToggle } from "@/components/ui/LocaleToggle";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  areDraftSnapshotsEqual,
  NoteMutationCoordinator,
} from "@/features/notes/mutation-queue";
import type { FolderDto, NoteDto, TagDto } from "@/features/notes/service";

const routerPushMock = vi.fn();
const routerRefreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
    refresh: routerRefreshMock,
  }),
  usePathname: () => "/app/notes",
}));

function makeNote(overrides: Partial<NoteDto> = {}): NoteDto {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    folderId: null,
    folderName: null,
    title: "Weekly Plan",
    content: "- [ ] First item\n- [x] Second item",
    isPinned: false,
    tags: [{ id: "t-1", name: "work" }],
    checklistTotal: 2,
    checklistCompleted: 1,
    createdAt: "2026-11-12T01:00:00.000Z",
    updatedAt: "2026-11-12T01:00:00.000Z",
    ...overrides,
  };
}

const sampleFolders: FolderDto[] = [
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Thesis",
    noteCount: 1,
    createdAt: "2026-11-12T01:00:00.000Z",
    updatedAt: "2026-11-12T01:00:00.000Z",
  },
];

const sampleTags: TagDto[] = [
  {
    id: "t-1",
    name: "work",
    noteCount: 1,
    createdAt: "2026-11-12T01:00:00.000Z",
    updatedAt: "2026-11-12T01:00:00.000Z",
  },
];

describe("NoteEditor & NotesWorkspace UI behavior (TS-004-02)", () => {
  beforeEach(() => {
    routerPushMock.mockClear();
    routerRefreshMock.mockClear();
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("auto-saves edits after 600ms debounce, updates save badge, and preserves draft on ID/EN + theme toggle", async () => {
    vi.useFakeTimers();

    const updatedDto = makeNote({
      title: "Draft Thesis Chapter 3",
      content: "- [ ] First item\n- [x] Second item\n**bold**",
      updatedAt: "2026-11-12T02:00:00.000Z",
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { note: updatedDto, conflictResolved: "applied" },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const onSaved = vi.fn();

    render(
      <PreferencesProvider
        initialLocale="id"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <LocaleToggle />
        <ThemeToggle />
        <NoteEditor
          note={makeNote()}
          folders={sampleFolders}
          onSaved={onSaved}
          onDeleted={vi.fn()}
        />
      </PreferencesProvider>,
    );

    const titleInput = screen.getByLabelText("Judul catatan") as HTMLInputElement;
    fireEvent.change(titleInput, {
      target: { value: "Draft Thesis Chapter 3" },
    });

    expect(screen.getByTestId("note-save-status")).toHaveTextContent(
      "Menyimpan...",
    );
    expect(fetchMock).not.toHaveBeenCalled();

    // Switch language & dark mode mid-edit; draft title must remain untouched.
    fireEvent.click(screen.getByRole("button", { name: "EN" }));
    fireEvent.click(screen.getByRole("button", { name: /dark/i }));
    expect(titleInput.value).toBe("Draft Thesis Chapter 3");
    expect(screen.getByTestId("note-save-status")).toHaveTextContent(
      "Saving...",
    );

    await act(async () => {
      vi.advanceTimersByTime(610);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/notes/11111111-1111-4111-8111-111111111111");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body)).title).toBe("Draft Thesis Chapter 3");
    expect(onSaved).toHaveBeenCalledWith(updatedDto);
    expect(screen.getByTestId("note-save-status")).toHaveTextContent("Saved");
  });

  it("handles interactive GFM checklist clicks, pin aria-pressed, tags, folder change, and delete confirmation", async () => {
    const toggledNote = makeNote({
      content: "- [x] First item\n- [x] Second item",
      updatedAt: "2026-11-12T02:05:00.000Z",
    });
    const pinnedNote = makeNote({
      content: toggledNote.content,
      isPinned: true,
      updatedAt: "2026-11-12T02:06:00.000Z",
    });
    const taggedNote = makeNote({
      content: toggledNote.content,
      isPinned: true,
      tags: [
        { id: "t-1", name: "work" },
        { id: "t-2", name: "urgent" },
      ],
      updatedAt: "2026-11-12T02:07:00.000Z",
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { note: toggledNote, conflictResolved: "applied" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { note: pinnedNote, conflictResolved: "applied" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { note: taggedNote, conflictResolved: "applied" },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              deleted: true,
              id: "11111111-1111-4111-8111-111111111111",
              conflictResolved: "applied",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const onDeleted = vi.fn();

    render(
      <PreferencesProvider
        initialLocale="en"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <NoteEditor
          note={makeNote()}
          folders={sampleFolders}
          onSaved={vi.fn()}
          onDeleted={onDeleted}
        />
      </PreferencesProvider>,
    );

    // Click GFM checkbox in Split preview pane.
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/notes/11111111-1111-4111-8111-111111111111/checklist",
    );

    // Toggle Pin button with aria-pressed.
    const pinButton = screen.getByRole("button", { name: "Pin note" });
    expect(pinButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pinButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(pinButton).toHaveAttribute("aria-pressed", "true");
    });

    // Add tag via input + Add button.
    const tagInput = screen.getByLabelText("Tags");
    fireEvent.change(tagInput, { target: { value: "urgent" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(screen.getByText("#urgent")).toBeVisible();
    });

    // Open delete modal and confirm.
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Yes, Delete Note" }));

    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalledWith(
        "11111111-1111-4111-8111-111111111111",
      );
    });
  });

  it("supports debounced 180ms search, New Note creation, and Load More pagination in NotesWorkspace", async () => {
    const firstNote = makeNote();
    const secondPageNote = makeNote({
      id: "33333333-3333-4333-8333-333333333333",
      title: "Grocery List",
      content: "- [ ] Milk",
      tags: [],
      checklistTotal: 1,
      checklistCompleted: 0,
    });
    const createdNote = makeNote({
      id: "44444444-4444-4444-8444-444444444444",
      title: "",
      content: "",
      tags: [],
      checklistTotal: 0,
      checklistCompleted: 0,
    });

    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (input) => {
      const url = String(input);
      if (url.startsWith("/api/notes?")) {
        if (url.includes("cursor=cursor-1")) {
          return new Response(
            JSON.stringify({
              ok: true,
              data: { items: [secondPageNote], nextCursor: null },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            ok: true,
            data: { items: [firstNote], nextCursor: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url === "/api/notes") {
        return new Response(
          JSON.stringify({ ok: true, data: { note: createdNote } }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url === "/api/tags") {
        return new Response(
          JSON.stringify({ ok: true, data: { tags: sampleTags } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ ok: true, data: { folders: sampleFolders } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PreferencesProvider
        initialLocale="en"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <NotesWorkspace
          initialNotes={[firstNote]}
          initialNextCursor="cursor-1"
          initialFolders={sampleFolders}
          initialTags={sampleTags}
        />
      </PreferencesProvider>,
    );

    // Load more appends secondPageNote.
    fireEvent.click(screen.getByRole("button", { name: "Load More" }));
    expect(await screen.findByText("Grocery List")).toBeVisible();

    // Debounced search queries /api/notes?limit=50&q=Weekly.
    fireEvent.change(screen.getByLabelText("Search notes"), {
      target: { value: "Weekly" },
    });

    await waitFor(
      () => {
        expect(
          fetchMock.mock.calls.some(([url]) =>
            String(url).includes("q=Weekly"),
          ),
        ).toBe(true);
      },
      { timeout: 1_500 },
    );

    // Create new note invokes POST /api/notes.
    fireEvent.click(screen.getAllByRole("button", { name: "New Note" })[0]);
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => url === "/api/notes" && init?.method === "POST",
        ),
      ).toBe(true);
    });
  });

  it("toggles multiple checklist items offline while dirty and flushes on online event", async () => {
    const onlineSpy = vi.spyOn(window.navigator, "onLine", "get");
    onlineSpy.mockReturnValue(false);

    const syncedNote = makeNote({
      title: "Offline Plan",
      content: "- [x] First item\n- [ ] Second item",
      checklistTotal: 2,
      checklistCompleted: 1,
      updatedAt: "2026-11-12T03:00:00.000Z",
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { note: syncedNote, conflictResolved: "applied" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const onSaved = vi.fn();

    render(
      <PreferencesProvider
        initialLocale="en"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <NoteEditor
          note={makeNote()}
          folders={sampleFolders}
          onSaved={onSaved}
          onDeleted={vi.fn()}
        />
      </PreferencesProvider>,
    );

    // Edit title while offline so editor holds dirty unpersisted state.
    fireEvent.change(screen.getByLabelText("Note title"), {
      target: { value: "Offline Plan" },
    });

    // Sequentially toggle two checklist items offline without issuing fetch requests.
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getAllByRole("checkbox")[1]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("note-save-status")).toHaveTextContent(
      "Pending sync",
    );
    expect(
      (screen.getByLabelText("Note Markdown content") as HTMLTextAreaElement)
        .value,
    ).toBe("- [x] First item\n- [ ] Second item");

    // Going back online flushes buffered draft + checklist toggles atomically.
    onlineSpy.mockReturnValue(true);
    window.dispatchEvent(new Event("online"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/notes/11111111-1111-4111-8111-111111111111");
    expect(JSON.parse(String(init.body))).toMatchObject({
      title: "Offline Plan",
      content: "- [x] First item\n- [ ] Second item",
    });
    expect(onSaved).toHaveBeenCalledWith(syncedNote);
    expect(screen.getByTestId("note-save-status")).toHaveTextContent("Saved");
  });

  it("keeps NoteEditor mounted when edited note leaves active filter and clears deleted folder while dirty", async () => {
    const pinnedNote = makeNote({
      isPinned: true,
      folderId: sampleFolders[0].id,
      folderName: sampleFolders[0].name,
      title: "Pinned Thesis",
    });
    const unpinnedNote = {
      ...pinnedNote,
      isPinned: false,
      updatedAt: "2026-11-12T03:10:00.000Z",
    };

    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (input, init) => {
      const url = String(input);
      if (url.startsWith("/api/notes?")) {
        return new Response(
          JSON.stringify({
            ok: true,
            data: { items: [pinnedNote], nextCursor: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.startsWith("/api/notes/") && init?.method === "PATCH") {
        return new Response(
          JSON.stringify({
            ok: true,
            data: { note: unpinnedNote, conflictResolved: "applied" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url === "/api/tags") {
        return new Response(
          JSON.stringify({ ok: true, data: { tags: sampleTags } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ ok: true, data: { folders: sampleFolders } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount: unmountWorkspace } = render(
      <PreferencesProvider
        initialLocale="en"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <NotesWorkspace
          initialNotes={[pinnedNote]}
          initialNextCursor={null}
          initialFolders={sampleFolders}
          initialTags={sampleTags}
        />
      </PreferencesProvider>,
    );

    // Activate Pinned filter, then unpin the currently edited note.
    fireEvent.click(screen.getByRole("button", { name: "Pinned" }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes("pinned=true")),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Pin note" }));

    // Left list becomes empty under Pinned filter, yet NoteEditor remains mounted!
    expect(await screen.findByText("No notes yet")).toBeVisible();
    expect(
      (screen.getByLabelText("Note title") as HTMLInputElement).value,
    ).toBe("Pinned Thesis");
    unmountWorkspace();

    // Re-render NoteEditor standalone with dirty draft referencing a deleted folder -> resets to unfiled.
    const standaloneFetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            note: makeNote({ folderId: null, folderName: null, content: "Dirty edited" }),
            conflictResolved: "applied",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", standaloneFetchMock);
    vi.useFakeTimers();

    const { rerender } = render(
      <PreferencesProvider
        initialLocale="en"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <NoteEditor
          note={makeNote({ folderId: sampleFolders[0].id })}
          folders={sampleFolders}
          onSaved={vi.fn()}
          onDeleted={vi.fn()}
        />
      </PreferencesProvider>,
    );

    fireEvent.change(screen.getByLabelText("Note Markdown content"), {
      target: { value: "Dirty edited" },
    });
    expect(
      (screen.getByLabelText("Folder") as HTMLSelectElement).value,
    ).toBe(sampleFolders[0].id);

    rerender(
      <PreferencesProvider
        initialLocale="en"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <NoteEditor
          note={makeNote({ folderId: sampleFolders[0].id })}
          folders={[]}
          onSaved={vi.fn()}
          onDeleted={vi.fn()}
        />
      </PreferencesProvider>,
    );

    expect(
      (screen.getByLabelText("Folder") as HTMLSelectElement).value,
    ).toBe("");

    await act(async () => {
      vi.advanceTimersByTime(620);
      await Promise.resolve();
      await Promise.resolve();
    });

    const [, patchInit] = standaloneFetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(patchInit.body)).folderId).toBeNull();
  });

  it("supports i18n Markdown toolbar, mode switcher, folder select, tag limit/remove, conflict notice, and save errors", async () => {
    const twentyTags = Array.from({ length: 20 }, (_, i) => ({
      id: `tag-${i + 1}`,
      name: `tag-${i + 1}`,
    }));
    const serverWinsNote = makeNote({
      title: "Server Authoritative",
      content: "Server body",
      tags: twentyTags,
      updatedAt: "2026-11-12T04:00:00.000Z",
    });

    const fetchMock = vi
      .fn()
      // 1. Folder select -> 500 -> pending_sync
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false }), { status: 500 }),
      )
      // 2. Remove tag -> 422 -> Save error
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false }), { status: 422 }),
      )
      // 3. Toolbar edit -> server_newer conflict notice
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { note: serverWinsNote, conflictResolved: "server_newer" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PreferencesProvider
        initialLocale="id"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <NoteEditor
          note={makeNote({ content: "", tags: twentyTags })}
          folders={sampleFolders}
          onSaved={vi.fn()}
          onDeleted={vi.fn()}
        />
      </PreferencesProvider>,
    );

    // Indonesian toolbar inserts localized default snippet.
    fireEvent.click(screen.getByRole("button", { name: "Judul H2" }));
    const contentArea = screen.getByLabelText("Isi Markdown catatan") as HTMLTextAreaElement;
    expect(contentArea.value).toContain("## Judul");

    // Mode switcher hides/shows textarea vs preview cleanly.
    fireEvent.click(screen.getByRole("button", { name: "Pratinjau" }));
    expect(screen.queryByLabelText("Isi Markdown catatan")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Isi Markdown catatan")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Split" }));

    // NOTE_MAX_TAGS guard blocks adding 21st distinct tag with inline notice.
    fireEvent.change(screen.getByLabelText("Tag"), {
      target: { value: "tag-21" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Tambah" }));
    expect(await screen.findByText("Maksimal 20 tag per catatan.")).toBeVisible();

    // Folder selection -> HTTP 500 triggers pending_sync badge.
    fireEvent.change(screen.getByLabelText("Folder"), {
      target: { value: sampleFolders[0].id },
    });
    await waitFor(() => {
      expect(screen.getByTestId("note-save-status")).toHaveTextContent(
        "Menunggu sinkronisasi",
      );
    });

    // Remove tag -> HTTP 422 triggers error badge.
    fireEvent.click(screen.getByRole("button", { name: "Hapus tag tag-1" }));
    await waitFor(() => {
      expect(screen.getByTestId("note-save-status")).toHaveTextContent(
        "Gagal menyimpan",
      );
    });

    // Debounced auto-save receiving server_newer displays conflict notice and adopts server note.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Tebal" }));
    await act(async () => {
      vi.advanceTimersByTime(620);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByText("Versi server yang lebih baru dipertahankan."),
    ).toBeVisible();
    expect(
      (screen.getByLabelText("Judul catatan") as HTMLInputElement).value,
    ).toBe("Server Authoritative");
  });

  it("supports FolderManagerModal CRUD + validation and NoteDetailView lifecycle", async () => {
    const folderB: FolderDto = {
      id: "55555555-5555-4555-8555-555555555555",
      name: "Finance",
      noteCount: 0,
      createdAt: "2026-11-12T01:00:00.000Z",
      updatedAt: "2026-11-12T01:00:00.000Z",
    };

    const fetchMock = vi
      .fn()
      // Create folder 409 duplicate
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: "FOLDER_NAME_EXISTS", message: "Exists" },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      )
      // Create folder 201
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: true, data: { folder: folderB } }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      // Rename folder 200
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              folder: { ...sampleFolders[0], name: "Thesis Final" },
              conflictResolved: "applied",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      // Delete folder 200
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              deleted: true,
              id: sampleFolders[0].id,
              movedNotesCount: 1,
              conflictResolved: "applied",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const onFoldersChanged = vi.fn();
    const { unmount: unmountModal } = render(
      <PreferencesProvider
        initialLocale="en"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <FolderManagerModal
          open={true}
          onClose={vi.fn()}
          folders={sampleFolders}
          onFoldersChanged={onFoldersChanged}
        />
      </PreferencesProvider>,
    );

    // Blank create -> inline required notice
    fireEvent.click(screen.getByRole("button", { name: "Create Folder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Folder name is required.",
    );

    // Duplicate 409 error -> inline translated alert
    fireEvent.change(screen.getByLabelText("New folder name"), {
      target: { value: "Thesis" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Folder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A folder with this name already exists.",
    );

    // Valid create -> calls onFoldersChanged
    fireEvent.change(screen.getByLabelText("New folder name"), {
      target: { value: "Finance" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Folder" }));
    await waitFor(() => {
      expect(onFoldersChanged).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: folderB.id, name: "Finance" }),
        ]),
      );
    });

    // Rename Thesis -> Thesis Final
    fireEvent.click(screen.getByRole("button", { name: "Rename Thesis" }));
    const renameInputs = screen.getAllByLabelText("New folder name");
    fireEvent.change(renameInputs[1], { target: { value: "Thesis Final" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      expect(onFoldersChanged).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ id: sampleFolders[0].id, name: "Thesis Final" }),
        ]),
      );
    });

    // Delete Thesis -> passes deletedId to onFoldersChanged
    fireEvent.click(screen.getByRole("button", { name: "Delete Thesis" }));
    await waitFor(() => {
      expect(onFoldersChanged).toHaveBeenCalledWith([], sampleFolders[0].id);
    });
    unmountModal();

    // NoteDetailView null state -> Not found + Back to Notes link
    const { unmount } = render(
      <PreferencesProvider
        initialLocale="en"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <NoteDetailView initialNote={null} initialFolders={[]} />
      </PreferencesProvider>,
    );
    expect(screen.getByText("Note not found")).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Notes" })).toHaveAttribute(
      "href",
      "/app/notes",
    );
    unmount();

    // NoteDetailView valid note -> Back button navigates to /app/notes
    render(
      <PreferencesProvider
        initialLocale="en"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <NoteDetailView
          initialNote={makeNote()}
          initialFolders={sampleFolders}
        />
      </PreferencesProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to Notes" }));
    expect(routerPushMock).toHaveBeenCalledWith("/app/notes");
  });

  it("serializes per-note mutations in NoteMutationCoordinator while keeping different notes independent", async () => {
    const coordinator = new NoteMutationCoordinator();
    const events: string[] = [];

    let resolveA1!: () => void;
    let resolveB1!: () => void;

    const taskA1 = coordinator.enqueue("note-a", async () => {
      events.push("A1:start");
      await new Promise<void>((resolve) => {
        resolveA1 = resolve;
      });
      events.push("A1:end");
      return "a1";
    });

    const taskB1 = coordinator.enqueue("note-b", async () => {
      events.push("B1:start");
      await new Promise<void>((resolve) => {
        resolveB1 = resolve;
      });
      events.push("B1:end");
      return "b1";
    });

    const taskA2 = coordinator.enqueue("note-a", async () => {
      events.push("A2:start");
      events.push("A2:end");
      return "a2";
    });

    await Promise.resolve();
    expect(coordinator.hasInFlight("note-a")).toBe(true);
    expect(coordinator.hasInFlight("note-b")).toBe(true);
    // note-b starts immediately without waiting on note-a; A2 waits behind A1.
    expect(events).toEqual(["A1:start", "B1:start"]);

    resolveB1();
    await expect(taskB1).resolves.toBe("b1");
    expect(events).toEqual(["A1:start", "B1:start", "B1:end"]);

    resolveA1();
    await expect(taskA1).resolves.toBe("a1");
    await expect(taskA2).resolves.toBe("a2");
    expect(events).toEqual([
      "A1:start",
      "B1:start",
      "B1:end",
      "A1:end",
      "A2:start",
      "A2:end",
    ]);
    expect(coordinator.hasInFlight("note-a")).toBe(false);

    // Rejected task does not wedge subsequent tasks on the same note.
    await expect(
      coordinator.enqueue("note-a", async () => {
        throw new Error("transient failure");
      }),
    ).rejects.toThrow("transient failure");
    await expect(
      coordinator.enqueue("note-a", async () => "recovered"),
    ).resolves.toBe("recovered");

    // Monotonic timestamp seeding & snapshot equality guard (including tags containing `|`).
    coordinator.seedKnownUpdatedAt("note-a", "2026-11-12T02:00:00.000Z");
    coordinator.seedKnownUpdatedAt("note-a", "2026-11-12T01:00:00.000Z");
    expect(coordinator.getKnownUpdatedAt("note-a")).toBe(
      "2026-11-12T02:00:00.000Z",
    );
    expect(
      areDraftSnapshotsEqual(
        {
          title: "T",
          content: "C",
          folderId: null,
          isPinned: false,
          tags: ["a|b", "c"],
        },
        {
          title: "T",
          content: "C",
          folderId: null,
          isPinned: false,
          tags: ["a", "b|c"],
        },
      ),
    ).toBe(false);

    const seq1 = coordinator.stagePendingDraft(
      "note-a",
      {
        title: "Draft",
        content: "Body",
        folderId: "f-1",
        isPinned: false,
        tags: [],
      },
      "2026-11-12T02:00:00.000Z",
      "pending_sync",
    );
    expect(coordinator.isLatestSeqQueued("note-a")).toBe(false);
    coordinator.markSeqQueued("note-a", seq1);
    expect(coordinator.isLatestSeqQueued("note-a")).toBe(true);
    coordinator.reconcilePendingFolder("note-a", null);
    expect(coordinator.getPendingDraft("note-a")?.snapshot.folderId).toBeNull();
  });

  it("handles rapid A -> B -> A switching, per-note flush queuing, offline draft preservation, and online reconnect flush", async () => {
    const noteAInitial = makeNote({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Alpha Initial",
      content: "- [ ] First\n- [ ] Second",
      updatedAt: "2026-11-12T01:00:00.000Z",
    });
    const noteB = makeNote({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      title: "Beta Note",
      content: "Beta body",
      updatedAt: "2026-11-12T01:05:00.000Z",
    });

    interface DeferredResponse {
      url: string;
      body: Record<string, unknown>;
      resolve: (response: Response) => void;
    }
    const deferredRequests: DeferredResponse[] = [];

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const parsedBody = init?.body ? JSON.parse(String(init.body)) : {};
      return new Promise<Response>((resolve) => {
        deferredRequests.push({
          url: String(input),
          body: parsedBody,
          resolve,
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onSaved = vi.fn();
    const { rerender, unmount } = render(
      <PreferencesProvider
        initialLocale="en"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <NoteEditor
          note={noteAInitial}
          folders={sampleFolders}
          onSaved={onSaved}
          onDeleted={vi.fn()}
        />
      </PreferencesProvider>,
    );

    const wrap = (currentNote: NoteDto) => (
      <PreferencesProvider
        initialLocale="en"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <NoteEditor
          note={currentNote}
          folders={sampleFolders}
          onSaved={onSaved}
          onDeleted={vi.fn()}
        />
      </PreferencesProvider>
    );

    // 1. Edit Note A then immediately switch A -> B -> A before Flush #1 settles.
    fireEvent.change(screen.getByLabelText("Note title"), {
      target: { value: "Alpha Draft 1" },
    });
    rerender(wrap(noteB));

    await waitFor(() => {
      expect(deferredRequests).toHaveLength(1);
    });
    expect(deferredRequests[0].body.title).toBe("Alpha Draft 1");
    expect(deferredRequests[0].body.updatedAt).toBe(noteAInitial.updatedAt);

    // Switch immediately back to A while parent prop is still stale ("Alpha Initial", t0).
    rerender(wrap(noteAInitial));
    expect((screen.getByLabelText("Note title") as HTMLInputElement).value).toBe(
      "Alpha Draft 1",
    );
    expect(screen.getByTestId("note-save-status")).toHaveTextContent("Saving...");

    // Edit again and pin while Flush #1 is still in-flight -> Flush #2 queues behind Flush #1!
    fireEvent.change(screen.getByLabelText("Note title"), {
      target: { value: "Alpha Draft 2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pin note" }));
    expect(deferredRequests).toHaveLength(1);

    // Resolve Flush #1 with t1 -> Flush #2 automatically receives updatedAt = t1 and keeps "Saving..." until #2 completes.
    const t1 = "2026-11-12T02:00:00.000Z";
    const t2 = "2026-11-12T03:00:00.000Z";
    await act(async () => {
      deferredRequests[0].resolve(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              note: {
                ...noteAInitial,
                title: "Alpha Draft 1",
                updatedAt: t1,
              },
              conflictResolved: "applied",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(deferredRequests).toHaveLength(2);
    });
    expect(deferredRequests[1].body.title).toBe("Alpha Draft 2");
    expect(deferredRequests[1].body.isPinned).toBe(true);
    expect(deferredRequests[1].body.updatedAt).toBe(t1);
    expect(screen.getByTestId("note-save-status")).toHaveTextContent("Saving...");

    await act(async () => {
      deferredRequests[1].resolve(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              note: {
                ...noteAInitial,
                title: "Alpha Draft 2",
                isPinned: true,
                updatedAt: t2,
              },
              conflictResolved: "applied",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("note-save-status")).toHaveTextContent("Saved");
    });

    // 2. Rapid checklist double-click while Note A is open: Toggle #1 + Toggle #2 serialize without race.
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    await waitFor(() => {
      expect(deferredRequests).toHaveLength(3);
    });
    expect(deferredRequests[2].url).toBe(
      `/api/notes/${noteAInitial.id}/checklist`,
    );
    expect(deferredRequests[2].body.updatedAt).toBe(t2);

    const t3 = "2026-11-12T03:30:00.000Z";
    await act(async () => {
      deferredRequests[2].resolve(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              note: {
                ...noteAInitial,
                title: "Alpha Draft 2",
                isPinned: true,
                content: "- [x] First\n- [ ] Second",
                checklistCompleted: 1,
                updatedAt: t3,
              },
              conflictResolved: "applied",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(deferredRequests).toHaveLength(4);
    });
    expect(deferredRequests[3].url).toBe(`/api/notes/${noteAInitial.id}`);
    expect(deferredRequests[3].body.content).toBe("- [x] First\n- [x] Second");
    expect(deferredRequests[3].body.updatedAt).toBe(t3);

    const t4 = "2026-11-12T04:00:00.000Z";
    await act(async () => {
      deferredRequests[3].resolve(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              note: {
                ...noteAInitial,
                title: "Alpha Draft 2",
                isPinned: true,
                content: "- [x] First\n- [x] Second",
                checklistCompleted: 2,
                updatedAt: t4,
              },
              conflictResolved: "applied",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByTestId("note-save-status")).toHaveTextContent("Saved");
    });

    // 3. Offline A -> B -> A preserves pending_sync draft, then A -> B + online auto-flushes Note A!
    Object.defineProperty(window.navigator, "onLine", {
      value: false,
      configurable: true,
    });
    const staleA = {
      ...noteAInitial,
      title: "Alpha Draft 2",
      updatedAt: t4,
    };
    fireEvent.change(screen.getByLabelText("Note title"), {
      target: { value: "Alpha Offline Draft" },
    });
    rerender(wrap(noteB));
    // Re-select Note A with stale title while still offline -> restores "Alpha Offline Draft" & "Pending sync".
    rerender(wrap(staleA));
    expect((screen.getByLabelText("Note title") as HTMLInputElement).value).toBe(
      "Alpha Offline Draft",
    );
    await waitFor(() => {
      expect(screen.getByTestId("note-save-status")).toHaveTextContent(
        "Pending sync",
      );
    });

    // Switch back to B, reconnect online -> Note A's switched-away pending_sync draft auto-flushes!
    rerender(wrap(noteB));
    const callsBeforeReconnect = deferredRequests.length;
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(deferredRequests.length).toBeGreaterThan(callsBeforeReconnect);
    });
    const reconnectReq = deferredRequests[callsBeforeReconnect];
    expect(reconnectReq.url).toBe(`/api/notes/${noteAInitial.id}`);
    expect(reconnectReq.body.title).toBe("Alpha Offline Draft");
    expect(reconnectReq.body.updatedAt).toBe(t4);

    await act(async () => {
      reconnectReq.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              note: { ...staleA, title: "Alpha Offline Draft" },
              conflictResolved: "applied",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      await Promise.resolve();
    });

    unmount();
  });

  it("flushes debounced edits on Back navigation, pagehide, and unmount cleanly within 600ms window", async () => {
    // 1. Coordinator waitForIdle awaits chained queue tasks cleanly (even after rejection) and resolves immediately if idle.
    const coordinator = new NoteMutationCoordinator();
    await coordinator.waitForIdle("idle-note");

    let releaseTask2!: () => void;
    let markTask2Started!: () => void;
    const task2Started = new Promise<void>((resolve) => {
      markTask2Started = resolve;
    });
    const finished: string[] = [];
    void coordinator
      .enqueue("busy-note", async () => {
        throw new Error("transient failure");
      })
      .catch(() => {
        finished.push("task1-caught");
      });
    void coordinator.enqueue("busy-note", async () => {
      markTask2Started();
      await new Promise<void>((resolve) => {
        releaseTask2 = resolve;
      });
      finished.push("task2-done");
    });

    let waitSettled = false;
    const waitPromise = coordinator.waitForIdle("busy-note").then(() => {
      waitSettled = true;
    });
    await task2Started;
    await Promise.resolve();
    expect(waitSettled).toBe(false);
    releaseTask2();
    await waitPromise;
    expect(waitSettled).toBe(true);
    expect(finished).toEqual(["task1-caught", "task2-done"]);

    // 2. Clean unmount (including StrictMode-like no-edit unmount) sends zero spurious PATCHes.
    const fetchCalls: { url: string; init?: RequestInit }[] = [];
    const immediateFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), init });
      return new Response(
        JSON.stringify({
          ok: true,
          data: { note: makeNote({ updatedAt: "2026-11-12T05:00:00.000Z" }), conflictResolved: "applied" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", immediateFetch);

    const wrapEditor = (noteProp: NoteDto) => (
      <PreferencesProvider
        initialLocale="en"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <NoteEditor
          note={noteProp}
          folders={sampleFolders}
          onSaved={vi.fn()}
          onDeleted={vi.fn()}
        />
      </PreferencesProvider>
    );

    const cleanRender = render(wrapEditor(makeNote()));
    cleanRender.unmount();
    expect(fetchCalls).toHaveLength(0);

    // 3. Edit within 600ms debounce + unmount immediately -> best-effort PATCH with keepalive: true.
    const smallRender = render(wrapEditor(makeNote()));
    fireEvent.change(screen.getByLabelText("Note title"), {
      target: { value: "Flushed On Unmount" },
    });
    smallRender.unmount();
    await waitFor(() => {
      expect(fetchCalls).toHaveLength(1);
    });
    expect(fetchCalls[0].url).toBe(`/api/notes/${makeNote().id}`);
    expect(fetchCalls[0].init?.keepalive).toBe(true);
    expect(JSON.parse(String(fetchCalls[0].init?.body)).title).toBe(
      "Flushed On Unmount",
    );

    // 4. Large >60KB edit + pagehide -> sends once WITHOUT keepalive (exceeds 64KiB spec budget); unmount does not duplicate.
    const largeRender = render(wrapEditor(makeNote()));
    fireEvent.change(screen.getByLabelText("Note Markdown content"), {
      target: { value: "a".repeat(62_000) },
    });
    window.dispatchEvent(new Event("pagehide"));
    await waitFor(() => {
      expect(fetchCalls).toHaveLength(2);
    });
    expect(fetchCalls[1].init?.keepalive).toBeUndefined();
    largeRender.unmount();
    await Promise.resolve();
    expect(fetchCalls).toHaveLength(2);

    // 5. Offline edit + unmount -> keeps zero failed network calls.
    Object.defineProperty(window.navigator, "onLine", {
      value: false,
      configurable: true,
    });
    const offlineRender = render(wrapEditor(makeNote()));
    fireEvent.change(screen.getByLabelText("Note title"), {
      target: { value: "Offline Unsaved Edit" },
    });
    offlineRender.unmount();
    await Promise.resolve();
    expect(fetchCalls).toHaveLength(2);

    // 6. Online NoteDetailView Back click within 600ms awaits PATCH commit before calling router.push + router.refresh.
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
    let resolveBackPatch!: (value: Response) => void;
    const backRequests: { url: string; body: Record<string, unknown>; keepalive?: boolean }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        backRequests.push({
          url: String(input),
          body: JSON.parse(String(init?.body ?? "{}")),
          keepalive: init?.keepalive,
        });
        return new Promise<Response>((resolve) => {
          resolveBackPatch = resolve;
        });
      }),
    );

    const detailView = render(
      <PreferencesProvider
        initialLocale="en"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <NoteDetailView initialNote={makeNote()} initialFolders={sampleFolders} />
      </PreferencesProvider>,
    );

    fireEvent.change(screen.getByLabelText("Note title"), {
      target: { value: "Quick Mobile Edit" },
    });
    const backBtn = screen.getByRole("button", { name: "Back to Notes" });
    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(backRequests).toHaveLength(1);
    });
    expect(backRequests[0].body.title).toBe("Quick Mobile Edit");
    expect(backRequests[0].keepalive).toBeUndefined();
    expect(backBtn).toBeDisabled();
    expect(routerPushMock).not.toHaveBeenCalled();

    await act(async () => {
      resolveBackPatch(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              note: makeNote({
                title: "Quick Mobile Edit",
                updatedAt: "2026-11-12T06:00:00.000Z",
              }),
              conflictResolved: "applied",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/app/notes");
      expect(routerRefreshMock).toHaveBeenCalled();
    });
    detailView.unmount();

    // 7. Offline Back click navigates immediately without blocking.
    routerPushMock.mockClear();
    routerRefreshMock.mockClear();
    Object.defineProperty(window.navigator, "onLine", {
      value: false,
      configurable: true,
    });
    const offlineDetail = render(
      <PreferencesProvider
        initialLocale="en"
        initialTheme="light"
        hasCookieLocale={true}
        hasCookieTheme={true}
      >
        <NoteDetailView initialNote={makeNote()} initialFolders={sampleFolders} />
      </PreferencesProvider>,
    );
    fireEvent.change(screen.getByLabelText("Note title"), {
      target: { value: "Offline Mobile Draft" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Back to Notes" }));
    expect(routerPushMock).toHaveBeenCalledWith("/app/notes");
    expect(backRequests).toHaveLength(1);
    offlineDetail.unmount();
  });
});
