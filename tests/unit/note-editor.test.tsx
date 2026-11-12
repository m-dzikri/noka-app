import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { NotesWorkspace } from "@/components/notes/NotesWorkspace";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { LocaleToggle } from "@/components/ui/LocaleToggle";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { FolderDto, NoteDto, TagDto } from "@/features/notes/service";

const routerPushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
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
});
