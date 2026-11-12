// @vitest-environment jsdom
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  createElement,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteAttachmentsPanel } from "@/components/notes/NoteAttachmentsPanel";
import { NoteDetailView } from "@/components/notes/NoteDetailView";
import { NotesWorkspace } from "@/components/notes/NotesWorkspace";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import {
  assertValidAttachmentSize,
  extractAttachmentUploadFromRequest,
  MAX_ATTACHMENT_BYTES,
  MAX_MULTIPART_CONTENT_LENGTH,
  validateAttachmentImageBuffer,
  type NoteAttachmentDto,
} from "@/features/notes/attachments-service";
import type { NoteDto } from "@/features/notes/service";
import { ApiError } from "@/lib/api-response";
import { resetEnvCacheForTest } from "@/lib/env";
import { getStorage } from "@/lib/storage";
import { LocalStorageAdapter } from "@/lib/storage/local";
import { S3StorageAdapter } from "@/lib/storage/s3";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/app/notes",
}));

const JPEG_SAMPLE = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
]);

const PNG_SAMPLE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const WEBP_SAMPLE = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x4c, 0x0d, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

const tempDirs: string[] = [];
const originalEnvSnapshot = { ...process.env };

function makeSampleNote(overrides: Partial<NoteDto> = {}): NoteDto {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    folderId: null,
    folderName: null,
    title: "Nota Belanja",
    content: "Daftar kebutuhan bulanan",
    isPinned: false,
    tags: [],
    checklistTotal: 0,
    checklistCompleted: 0,
    createdAt: "2026-11-12T01:00:00.000Z",
    updatedAt: "2026-11-12T01:00:00.000Z",
    ...overrides,
  };
}

function makeAttachment(
  overrides: Partial<NoteAttachmentDto> = {},
): NoteAttachmentDto {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    noteId: "11111111-1111-4111-8111-111111111111",
    mimeType: "image/png",
    sizeBytes: 1234,
    url: "/api/attachments/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    createdAt: "2026-11-12T01:00:00.000Z",
    ...overrides,
  };
}

const PreferencesProviderWithOptionalChildrenProp =
  PreferencesProvider as ComponentType<
    Omit<ComponentProps<typeof PreferencesProvider>, "children"> & {
      children?: ReactNode;
    }
  >;

function renderWithPreferences(
  locale: "id" | "en",
  child: ReturnType<typeof createElement>,
) {
  return createElement(
    PreferencesProviderWithOptionalChildrenProp,
    {
      initialLocale: locale,
      initialTheme: "light",
      hasCookieLocale: true,
      hasCookieTheme: true,
    },
    child,
  );
}

describe("Attachment Validation, Storage Adapters & UI Offline Guards (TS-005-01)", () => {
  beforeEach(() => {
    resetEnvCacheForTest();
  });

  afterEach(async () => {
    process.env = { ...originalEnvSnapshot };
    resetEnvCacheForTest();
    vi.unstubAllGlobals();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  it("accepts JPEG/PNG/WebP magic bytes and rejects spoofed text/EXE/SVG or mismatched MIME with 422", async () => {
    await expect(
      validateAttachmentImageBuffer(JPEG_SAMPLE, "image/jpg"),
    ).resolves.toEqual({
      mimeType: "image/jpeg",
      ext: "jpg",
      sizeBytes: JPEG_SAMPLE.byteLength,
    });

    await expect(
      validateAttachmentImageBuffer(PNG_SAMPLE, "application/octet-stream"),
    ).resolves.toEqual({
      mimeType: "image/png",
      ext: "png",
      sizeBytes: PNG_SAMPLE.byteLength,
    });

    await expect(
      validateAttachmentImageBuffer(WEBP_SAMPLE, ""),
    ).resolves.toEqual({
      mimeType: "image/webp",
      ext: "webp",
      sizeBytes: WEBP_SAMPLE.byteLength,
    });

    const textSpoof = Buffer.from("plain text pretending to be jpg", "utf8");
    await expect(
      validateAttachmentImageBuffer(textSpoof, "image/jpeg"),
    ).rejects.toMatchObject({
      status: 422,
      code: "UNSUPPORTED_IMAGE_TYPE",
    });

    const svgSpoof = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      "utf8",
    );
    await expect(
      validateAttachmentImageBuffer(svgSpoof, "image/svg+xml"),
    ).rejects.toMatchObject({
      status: 422,
      code: "UNSUPPORTED_IMAGE_TYPE",
    });

    const exeHeader = Buffer.from([
      0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00,
    ]);
    await expect(
      validateAttachmentImageBuffer(exeHeader, "image/png"),
    ).rejects.toMatchObject({
      status: 422,
      code: "UNSUPPORTED_IMAGE_TYPE",
    });

    await expect(
      validateAttachmentImageBuffer(JPEG_SAMPLE, "image/png"),
    ).rejects.toMatchObject({
      status: 422,
      code: "UNSUPPORTED_IMAGE_TYPE",
    });
  });

  it("enforces 0-byte 422 EMPTY_FILE, >5 MB 413 FILE_TOO_LARGE, and Content-Length 413 pre-check", async () => {
    expect(() => assertValidAttachmentSize(0)).toThrowError(ApiError);
    try {
      assertValidAttachmentSize(0);
    } catch (err) {
      expect(err).toMatchObject({ status: 422, code: "EMPTY_FILE" });
    }

    try {
      assertValidAttachmentSize(MAX_ATTACHMENT_BYTES + 1);
    } catch (err) {
      expect(err).toMatchObject({ status: 413, code: "FILE_TOO_LARGE" });
    }

    const oversizedHeaderReq = new Request(
      "http://localhost:3000/api/notes/n/attachments",
      {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=----noka",
          "content-length": String(MAX_MULTIPART_CONTENT_LENGTH + 1),
        },
        body: "stub",
      },
    );

    await expect(
      extractAttachmentUploadFromRequest(oversizedHeaderReq),
    ).rejects.toMatchObject({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
    });

    const nonMultipartReq = new Request(
      "http://localhost:3000/api/notes/n/attachments",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
    await expect(
      extractAttachmentUploadFromRequest(nonMultipartReq),
    ).rejects.toMatchObject({
      status: 400,
      code: "INVALID_MULTIPART",
    });
  });

  it("protects LocalStorageAdapter against path traversal while supporting normal CRUD", async () => {
    const tempBase = await mkdtemp(
      path.join(os.tmpdir(), "noka-local-storage-"),
    );
    tempDirs.push(tempBase);
    const adapter = new LocalStorageAdapter(tempBase);

    await expect(adapter.putObject("../escape.png", PNG_SAMPLE)).rejects.toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
    });

    await expect(
      adapter.putObject("users/../../escape.png", PNG_SAMPLE),
    ).rejects.toMatchObject({ status: 422, code: "VALIDATION_ERROR" });

    await expect(adapter.readObject("/etc/passwd")).rejects.toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
    });

    await expect(adapter.deleteObject("..\\escape.png")).rejects.toMatchObject({
      status: 422,
      code: "VALIDATION_ERROR",
    });

    await expect(
      adapter.putObject("users/bad\0key.png", PNG_SAMPLE),
    ).rejects.toMatchObject({ status: 422, code: "VALIDATION_ERROR" });

    await expect(
      stat(path.resolve(tempBase, "../escape.png")),
    ).rejects.toBeDefined();

    const safeKey = "users/u1/notes/n1/a1.png";
    await adapter.putObject(safeKey, PNG_SAMPLE);
    const storedBytes = await readFile(path.join(tempBase, safeKey));
    expect(storedBytes.equals(PNG_SAMPLE)).toBe(true);

    const readBack = await adapter.readObject(safeKey);
    expect(readBack?.equals(PNG_SAMPLE)).toBe(true);
    expect(await adapter.getSignedReadUrl()).toBeNull();

    await adapter.deleteObject(safeKey);
    expect(await adapter.readObject(safeKey)).toBeNull();

    await expect(adapter.deleteObject(safeKey)).resolves.toBeUndefined();
  });

  it("batches S3StorageAdapter deleteObjects per 1,000 keys, ignores NoSuchKey, and throws 503 when S3 missing in production", async () => {
    const sendMock = vi.fn(
      async (command: { input?: unknown; constructor: { name: string } }) => {
        if (command.constructor.name === "DeleteObjectsCommand") {
          const input = command.input as {
            Delete: { Objects: Array<{ Key: string }> };
          };
          const hasKey5 = input.Delete.Objects.some((obj) => obj.Key === "k-5");
          if (hasKey5) {
            return {
              Errors: [
                { Key: "k-3", Code: "NoSuchKey" },
                { Key: "k-5", Code: "AccessDenied" },
              ],
            };
          }
          return { Errors: [] };
        }
        if (command.constructor.name === "GetObjectCommand") {
          const input = command.input as { Key: string };
          if (input.Key === "missing") {
            const err = new Error("Not found");
            err.name = "NoSuchKey";
            throw err;
          }
          return {
            Body: {
              transformToByteArray: async () => new Uint8Array(WEBP_SAMPLE),
            },
          };
        }
        return {};
      },
    );

    const adapter = new S3StorageAdapter({
      endpoint: "https://r2.example.invalid",
      region: "auto",
      bucket: "noka-bucket",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
      client: { send: sendMock } as unknown as S3Client,
    });

    await expect(adapter.deleteObjects([])).resolves.toEqual({
      failedKeys: [],
    });
    expect(sendMock).not.toHaveBeenCalled();

    const keys = Array.from({ length: 2005 }, (_, i) => `k-${i}`);
    const batchResult = await adapter.deleteObjects(keys);
    expect(sendMock).toHaveBeenCalledTimes(3);
    expect(batchResult).toEqual({ failedKeys: ["k-5"] });

    expect(await adapter.readObject("missing")).toBeNull();
    const fetched = await adapter.readObject("present");
    expect(fetched?.equals(WEBP_SAMPLE)).toBe(true);

    const envMap = process.env as Record<string, string | undefined>;
    envMap.NODE_ENV = "production";
    envMap.DATABASE_URL =
      "postgres://postgres:postgres@localhost:5432/noka_test";
    envMap.SESSION_SECRET = "prod-test-session-secret-minimum-32-chars";
    delete envMap.S3_ENDPOINT;
    delete envMap.S3_REGION;
    delete envMap.S3_BUCKET;
    delete envMap.S3_ACCESS_KEY_ID;
    delete envMap.S3_SECRET_ACCESS_KEY;
    resetEnvCacheForTest();

    const prodStorage = getStorage();
    await expect(
      prodStorage.putObject("a", PNG_SAMPLE, "image/png"),
    ).rejects.toMatchObject({
      status: 503,
      code: "STORAGE_UNAVAILABLE",
    });
    await expect(prodStorage.readObject("a")).rejects.toMatchObject({
      status: 503,
      code: "STORAGE_UNAVAILABLE",
    });
    await expect(prodStorage.deleteObject("a")).rejects.toMatchObject({
      status: 503,
      code: "STORAGE_UNAVAILABLE",
    });
    await expect(prodStorage.deleteObjects(["a"])).rejects.toMatchObject({
      status: 503,
      code: "STORAGE_UNAVAILABLE",
    });
    await expect(prodStorage.getSignedReadUrl("a")).rejects.toMatchObject({
      status: 503,
      code: "STORAGE_UNAVAILABLE",
    });
  });

  it("renders NoteAttachmentsPanel upload/lightbox/delete modal, disables upload+delete when offline, shows offlinePlaceholder on error, and retries on online", async () => {
    const attachment = makeAttachment();
    const uploadedAttachment = makeAttachment({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      url: "/api/attachments/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url.endsWith("/attachments") &&
          (!init?.method || init.method === "GET")
        ) {
          return new Response(
            JSON.stringify({ ok: true, data: { attachments: [attachment] } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.endsWith("/attachments") && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              ok: true,
              data: { attachment: uploadedAttachment },
            }),
            {
              status: 201,
              headers: {
                "Content-Type": "application/json",
                "X-Note-Updated-At": "2026-11-12T04:00:00.000Z",
              },
            },
          );
        }
        if (url.startsWith("/api/attachments/") && init?.method === "DELETE") {
          return new Response(
            JSON.stringify({
              ok: true,
              data: { deleted: true, id: attachment.id },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("Not mocked", { status: 500 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const onNoteUpdatedAt = vi.fn();

    const { rerender } = render(
      renderWithPreferences(
        "id",
        createElement(NoteAttachmentsPanel, {
          noteId: attachment.noteId,
          isOnline: true,
          onNoteUpdatedAt,
        }),
      ),
    );

    await waitFor(() => {
      expect(
        screen.getByAltText("Lampiran gambar catatan"),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Perbesar lampiran gambar (1)" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByAltText("Lampiran gambar catatan")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Tutup Pratinjau" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    const fileInput = screen.getByLabelText(
      "Pilih file gambar lampiran (JPEG, PNG, atau WebP)",
    ) as HTMLInputElement;
    const validFile = new File([PNG_SAMPLE], "receipt.png", {
      type: "image/png",
    });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [validFile] } });
    });
    await waitFor(() => {
      expect(screen.getAllByAltText("Lampiran gambar catatan")).toHaveLength(2);
    });
    expect(onNoteUpdatedAt).toHaveBeenCalledWith(
      attachment.noteId,
      "2026-11-12T04:00:00.000Z",
    );

    rerender(
      renderWithPreferences(
        "id",
        createElement(NoteAttachmentsPanel, {
          noteId: attachment.noteId,
          isOnline: false,
          onNoteUpdatedAt,
        }),
      ),
    );

    expect(
      screen.getByText(
        "Mode offline: unggah & hapus lampiran dinonaktifkan sampai kembali online.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Unggah Gambar" }),
    ).toBeDisabled();

    const deleteButtons = screen.getAllByRole("button", {
      name: /Hapus lampiran gambar/,
    });
    for (const btn of deleteButtons) {
      expect(btn).toBeDisabled();
    }

    const firstImg = screen.getAllByAltText("Lampiran gambar catatan")[0];
    fireEvent.error(firstImg);
    expect(
      screen.getByText(
        "Gambar belum tersedia saat offline. Coba lagi ketika online.",
      ),
    ).toBeInTheDocument();

    rerender(
      renderWithPreferences(
        "id",
        createElement(NoteAttachmentsPanel, {
          noteId: attachment.noteId,
          isOnline: true,
          onNoteUpdatedAt,
        }),
      ),
    );
    await waitFor(() => {
      expect(
        screen.queryByText(
          "Gambar belum tersedia saat offline. Coba lagi ketika online.",
        ),
      ).not.toBeInTheDocument();
      expect(screen.getAllByAltText("Lampiran gambar catatan")).toHaveLength(2);
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Hapus lampiran gambar (1)" }),
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Ya, Hapus Gambar" }),
      );
    });
    await waitFor(() => {
      expect(screen.getAllByAltText("Lampiran gambar catatan")).toHaveLength(1);
    });
  });

  it("handles browser online/offline window events without isOnline prop and auto-retries broken images on reconnect", async () => {
    const attachment = makeAttachment();
    Object.defineProperty(window.navigator, "onLine", {
      value: false,
      configurable: true,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({ ok: true, data: { attachments: [attachment] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    render(
      renderWithPreferences(
        "en",
        createElement(NoteAttachmentsPanel, {
          noteId: attachment.noteId,
        }),
      ),
    );

    await waitFor(() => {
      expect(screen.getByAltText("Note image attachment")).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "Offline mode: uploading and deleting attachments is disabled until back online.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload Image" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Delete image attachment (1)" }),
    ).toBeDisabled();

    fireEvent.error(screen.getByAltText("Note image attachment"));
    expect(
      screen.getByText(
        "Image unavailable offline. It will retry when back online.",
      ),
    ).toBeInTheDocument();

    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(
        screen.queryByText(
          "Image unavailable offline. It will retry when back online.",
        ),
      ).not.toBeInTheDocument();
      expect(screen.getByAltText("Note image attachment")).toBeInTheDocument();
    });
  });

  it("mounts NoteAttachmentsPanel through desktop NotesWorkspace and mobile NoteDetailView when enabled", () => {
    const sampleNote = makeSampleNote();
    const initialAttachment = makeAttachment({ noteId: sampleNote.id });

    const { unmount } = render(
      renderWithPreferences(
        "en",
        createElement(NotesWorkspace, {
          initialNotes: [sampleNote],
          initialNextCursor: null,
          initialFolders: [],
          initialTags: [],
          enableAttachments: true,
          initialSelectedAttachments: [initialAttachment],
        }),
      ),
    );

    expect(screen.getByText("Image Attachments")).toBeInTheDocument();
    expect(screen.getByAltText("Note image attachment")).toBeInTheDocument();
    unmount();

    render(
      renderWithPreferences(
        "en",
        createElement(NoteDetailView, {
          initialNote: sampleNote,
          initialFolders: [],
          enableAttachments: true,
          initialAttachments: [initialAttachment],
        }),
      ),
    );

    expect(screen.getByText("Image Attachments")).toBeInTheDocument();
    expect(screen.getByAltText("Note image attachment")).toBeInTheDocument();
  });

  it("fetches live attachments instead of reusing stale SSR snapshot when switching A -> B -> A in NotesWorkspace", async () => {
    const noteA = makeSampleNote({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Catatan Pertama",
    });
    const noteB = makeSampleNote({
      id: "22222222-2222-4222-8222-222222222222",
      title: "Catatan Kedua",
    });
    const uploadedAttachment = makeAttachment({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      noteId: noteA.id,
      url: "/api/attachments/cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });

    let serverAttachmentsForA: NoteAttachmentDto[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";

        if (url === `/api/notes/${noteA.id}/attachments` && method === "POST") {
          serverAttachmentsForA = [uploadedAttachment];
          return new Response(
            JSON.stringify({ ok: true, data: { attachment: uploadedAttachment } }),
            {
              status: 201,
              headers: {
                "Content-Type": "application/json",
                "X-Note-Updated-At": "2026-11-12T03:00:00.000Z",
              },
            },
          );
        }

        if (url === `/api/notes/${noteA.id}/attachments` && method === "GET") {
          return new Response(
            JSON.stringify({ ok: true, data: { attachments: serverAttachmentsForA } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (url === `/api/notes/${noteB.id}/attachments` && method === "GET") {
          return new Response(
            JSON.stringify({ ok: true, data: { attachments: [] } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (
          url === `/api/attachments/${uploadedAttachment.id}` &&
          method === "DELETE"
        ) {
          serverAttachmentsForA = [];
          return new Response(
            JSON.stringify({
              ok: true,
              data: { deleted: true, id: uploadedAttachment.id },
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                "X-Note-Updated-At": "2026-11-12T04:00:00.000Z",
              },
            },
          );
        }

        return new Response(JSON.stringify({ ok: true, data: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("min-width: 1024px"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    render(
      renderWithPreferences(
        "en",
        createElement(NotesWorkspace, {
          initialNotes: [noteA, noteB],
          initialNextCursor: null,
          initialFolders: [],
          initialTags: [],
          enableAttachments: true,
          initialSelectedAttachments: [],
        }),
      ),
    );

    expect(screen.getByText("0/5")).toBeInTheDocument();

    const fileInput = screen.getByLabelText(
      "Select image file attachment (JPEG, PNG, or WebP)",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(fileInput, {
        target: {
          files: [new File([PNG_SAMPLE], "nota.png", { type: "image/png" })],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText("1/5")).toBeInTheDocument();
      expect(screen.getByAltText("Note image attachment")).toBeInTheDocument();
    });

    // Switch to Note B -> unmounts Note A's panel and fetches Note B attachments
    fireEvent.click(screen.getByRole("link", { name: /Catatan Kedua/i }));
    await waitFor(() => {
      expect(screen.getByText("0/5")).toBeInTheDocument();
    });

    // Switch back to Note A -> must fetch live attachments instead of stale SSR []
    fireEvent.click(screen.getByRole("link", { name: /Catatan Pertama/i }));
    await waitFor(() => {
      expect(screen.getByText("1/5")).toBeInTheDocument();
      expect(screen.getByAltText("Note image attachment")).toBeInTheDocument();
    });

    // Delete on Note A -> switch to B -> switch back to A -> must stay 0/5
    fireEvent.click(
      screen.getByRole("button", { name: "Delete image attachment (1)" }),
    );
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Yes, Delete Image" }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText("0/5")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("link", { name: /Catatan Kedua/i }));
    fireEvent.click(screen.getByRole("link", { name: /Catatan Pertama/i }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([u, opts]) => {
          const s = typeof u === "string" ? u : u.toString();
          return (
            s === `/api/notes/${noteA.id}/attachments` &&
            (opts?.method ?? "GET") === "GET"
          );
        }).length,
      ).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("0/5")).toBeInTheDocument();
    });
  });

  it("propagates X-Note-Updated-At when switching notes mid-upload and exposes retry UI on list load failure and lightbox error", async () => {
    const noteA = "11111111-1111-4111-8111-111111111111";
    const noteB = "22222222-2222-4222-8222-222222222222";
    const attA = makeAttachment({ noteId: noteA });

    let resolveUpload: ((res: Response) => void) | null = null;
    let listCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";

        if (url === `/api/notes/${noteA}/attachments` && method === "GET") {
          listCalls += 1;
          if (listCalls === 1) {
            throw new Error("Transient network error");
          }
          return new Response(
            JSON.stringify({ ok: true, data: { attachments: [attA] } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        if (url === `/api/notes/${noteA}/attachments` && method === "POST") {
          return await new Promise<Response>((resolve) => {
            resolveUpload = resolve;
          });
        }

        return new Response(
          JSON.stringify({ ok: true, data: { attachments: [] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });

    const onNoteUpdatedAt = vi.fn();
    const { rerender } = render(
      renderWithPreferences(
        "en",
        createElement(NoteAttachmentsPanel, {
          noteId: noteA,
          isOnline: true,
          onNoteUpdatedAt,
        }),
      ),
    );

    // Initial GET throws -> shows retry button instead of false empty state
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(screen.getByAltText("Note image attachment")).toBeInTheDocument();
    });

    // Open lightbox and fail image while online -> shows retry button inside lightbox
    fireEvent.click(
      screen.getByRole("button", { name: "Open image attachment preview (1)" }),
    );
    const images = screen.getAllByAltText("Note image attachment");
    fireEvent.error(images[images.length - 1]);
    await waitFor(() => {
      expect(
        screen.getAllByRole("button", { name: "Retry" }).length,
      ).toBeGreaterThanOrEqual(1);
    });
    fireEvent.keyDown(document, { key: "Escape" });

    // Start upload on Note A, switch to Note B before POST resolves -> onNoteUpdatedAt still fires for Note A
    const fileInput = screen.getByLabelText(
      "Select image file attachment (JPEG, PNG, or WebP)",
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(fileInput, {
        target: {
          files: [new File([PNG_SAMPLE], "nota.png", { type: "image/png" })],
        },
      });
    });

    rerender(
      renderWithPreferences(
        "en",
        createElement(NoteAttachmentsPanel, {
          noteId: noteB,
          isOnline: true,
          onNoteUpdatedAt,
        }),
      ),
    );

    await act(async () => {
      resolveUpload?.(
        new Response(JSON.stringify({ ok: true, data: { attachment: attA } }), {
          status: 201,
          headers: {
            "Content-Type": "application/json",
            "X-Note-Updated-At": "2026-11-12T05:00:00.000Z",
          },
        }),
      );
    });

    await waitFor(() => {
      expect(onNoteUpdatedAt).toHaveBeenCalledWith(
        noteA,
        "2026-11-12T05:00:00.000Z",
      );
    });
  });
});
