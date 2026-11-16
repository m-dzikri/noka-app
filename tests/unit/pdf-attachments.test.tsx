// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoteAttachmentsPanel } from "@/components/notes/NoteAttachmentsPanel";
import {
  PdfDocumentModal,
  extractPdfPageCount,
  formatFileSize,
  formatPageCount,
} from "@/components/notes/PdfDocumentModal";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { idDictionary } from "@/lib/i18n/dictionaries/id";
import { enDictionary } from "@/lib/i18n/dictionaries/en";
import {
  assertValidAttachmentSize,
  MAX_ATTACHMENT_BYTES,
  validateAttachmentBuffer,
  type NoteAttachmentDto,
} from "@/features/notes/attachments-service";
import { ApiError } from "@/lib/api-response";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/app/notes",
}));

const VALID_PDF_SAMPLE = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000102 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF\n",
  "utf8",
);

const JPEG_SAMPLE = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9,
]);

function renderWithI18n(ui: React.ReactElement, locale: "id" | "en" = "id") {
  return render(
    <PreferencesProvider initialLocale={locale} initialTheme="light">
      {ui}
    </PreferencesProvider>,
  );
}

describe("TS-015-01: PDF Attachments Validation, Formatting & UI (Unit)", () => {
  describe("Magic Bytes & MIME Detection (SEC-5, SEC-6, AC-15.1)", () => {
    it("validates legitimate PDF buffer via %PDF- magic bytes signature", async () => {
      const result = await validateAttachmentBuffer(
        VALID_PDF_SAMPLE,
        "application/pdf",
      );
      expect(result.mimeType).toBe("application/pdf");
      expect(result.ext).toBe("pdf");
      expect(result.sizeBytes).toBe(VALID_PDF_SAMPLE.byteLength);
    });

    it("rejects spoofed text file claiming to be application/pdf with 422 UNSUPPORTED_ATTACHMENT_TYPE", async () => {
      const spoofText = Buffer.from("plain text pretending to be a pdf file", "utf8");
      await expect(
        validateAttachmentBuffer(spoofText, "application/pdf"),
      ).rejects.toMatchObject({
        status: 422,
        code: "UNSUPPORTED_ATTACHMENT_TYPE",
      });
    });

    it("rejects executable file claiming to be application/pdf with 422 UNSUPPORTED_ATTACHMENT_TYPE", async () => {
      const exeHeader = Buffer.from([
        0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00,
      ]);
      await expect(
        validateAttachmentBuffer(exeHeader, "application/pdf"),
      ).rejects.toMatchObject({
        status: 422,
        code: "UNSUPPORTED_ATTACHMENT_TYPE",
      });
    });

    it("rejects declared image/png when file is actually a PDF", async () => {
      await expect(
        validateAttachmentBuffer(VALID_PDF_SAMPLE, "image/png"),
      ).rejects.toMatchObject({
        status: 422,
        code: "UNSUPPORTED_ATTACHMENT_TYPE",
      });
    });

    it("rejects declared application/pdf when file is actually a JPEG image", async () => {
      await expect(
        validateAttachmentBuffer(JPEG_SAMPLE, "application/pdf"),
      ).rejects.toMatchObject({
        status: 422,
        code: "UNSUPPORTED_ATTACHMENT_TYPE",
      });
    });
  });

  describe("File Size Boundaries & Formatting (AC-15.2)", () => {
    it("enforces 5 MB limit and non-empty constraints", () => {
      expect(() => assertValidAttachmentSize(0)).toThrowError(ApiError);
      expect(() => assertValidAttachmentSize(-1)).toThrowError(ApiError);
      expect(() => assertValidAttachmentSize(MAX_ATTACHMENT_BYTES)).not.toThrow();
      expect(() =>
        assertValidAttachmentSize(MAX_ATTACHMENT_BYTES + 1),
      ).toThrowError(ApiError);
    });

    it("formats file sizes correctly in KB and MB", () => {
      expect(formatFileSize(500)).toBe("500 B");
      expect(formatFileSize(1024)).toBe("1.0 KB");
      expect(formatFileSize(150 * 1024)).toBe("150.0 KB");
      expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
    });
  });

  describe("UI Rendering: NoteAttachmentsPanel & PdfDocumentModal (UI-3, OFFLINE-4, AC-15.4, AC-15.5)", () => {
    const mockPdfAttachment: NoteAttachmentDto = {
      id: "a1b2c3d4-0000-0000-0000-000000000001",
      noteId: "n1n2n3n4-0000-0000-0000-000000000001",
      mimeType: "application/pdf",
      sizeBytes: 1.8 * 1024 * 1024,
      url: "/api/attachments/a1b2c3d4-0000-0000-0000-000000000001",
      createdAt: "2026-11-16T12:00:00.000Z",
    };

    it("renders PDF document card with badge, size, preview and download buttons", () => {
      renderWithI18n(
        <NoteAttachmentsPanel
          noteId="n1n2n3n4-0000-0000-0000-000000000001"
          isOnline={true}
          initialAttachments={[mockPdfAttachment]}
        />,
      );

      expect(screen.getByTestId("pdf-attachment-card")).toBeInTheDocument();
      expect(screen.getByText("PDF")).toBeInTheDocument();
      expect(screen.getByText(/1.8 MB/)).toBeInTheDocument();
      expect(screen.getByText("Lihat Dokumen")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Unduh Dokumen/i }),
      ).toHaveAttribute(
        "href",
        "/api/attachments/a1b2c3d4-0000-0000-0000-000000000001",
      );
    });

    it("opens PdfDocumentModal with sandboxed iframe when preview is clicked", () => {
      renderWithI18n(
        <NoteAttachmentsPanel
          noteId="n1n2n3n4-0000-0000-0000-000000000001"
          isOnline={true}
          initialAttachments={[mockPdfAttachment]}
        />,
      );

      fireEvent.click(screen.getByText("Lihat Dokumen"));

      const iframe = screen.getByTitle("Pratinjau Dokumen PDF");
      expect(iframe).toBeInTheDocument();
      expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-same-origin");
      expect(iframe).toHaveAttribute(
        "src",
        "/api/attachments/a1b2c3d4-0000-0000-0000-000000000001",
      );
      expect(screen.getByText("Buka di Tab Baru")).toBeInTheDocument();
      expect(screen.getByText("Unduh Dokumen")).toBeInTheDocument();
    });

    it("disables upload and delete buttons when offline (OFFLINE-4)", () => {
      renderWithI18n(
        <NoteAttachmentsPanel
          noteId="n1n2n3n4-0000-0000-0000-000000000001"
          isOnline={false}
          initialAttachments={[mockPdfAttachment]}
        />,
      );

      // Offline notice banner is displayed
      expect(
        screen.getByText(/Mode offline: unggah & hapus lampiran dinonaktifkan/i),
      ).toBeInTheDocument();

      // Upload button is disabled
      expect(
        screen.getByRole("button", { name: /Unggah Gambar/i }),
      ).toBeDisabled();

      // Delete button on the PDF card is disabled
      expect(screen.getByRole("button", { name: /Hapus/i })).toBeDisabled();
    });

    it("renders PdfDocumentModal standalone correctly with sandboxed attributes", () => {
      const onClose = vi.fn();
      renderWithI18n(
        <PdfDocumentModal
          open={true}
          onClose={onClose}
          attachment={mockPdfAttachment}
        />,
      );

      const iframe = screen.getByTitle("Pratinjau Dokumen PDF");
      expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-same-origin");
      expect(screen.getByText("Buka di Tab Baru")).toBeInTheDocument();
    });

    it("renders original desktop filename and page count badge when metadata is provided", () => {
      const enrichedAttachment: NoteAttachmentDto = {
        ...mockPdfAttachment,
        originalFileName: "laporan-keuangan-2026.pdf",
        pageCount: 7,
      };

      renderWithI18n(
        <NoteAttachmentsPanel
          noteId="n1n2n3n4-0000-0000-0000-000000000001"
          isOnline={true}
          initialAttachments={[enrichedAttachment]}
        />,
      );

      // Card displays original desktop filename
      expect(screen.getByText("laporan-keuangan-2026.pdf")).toBeInTheDocument();

      // Card displays page count badge
      const pageBadge = screen.getByTestId("pdf-page-count");
      expect(pageBadge).toHaveTextContent("7 hlm");

      // Download button uses original desktop filename
      const downloadBtn = screen.getByRole("link", { name: /Unduh Dokumen/i });
      expect(downloadBtn).toHaveAttribute(
        "download",
        "laporan-keuangan-2026.pdf",
      );
    });

    it("displays original filename and page count in PdfDocumentModal header and description", () => {
      const enrichedAttachment: NoteAttachmentDto = {
        ...mockPdfAttachment,
        originalFileName: "proposal-riset.pdf",
        pageCount: 3,
      };

      renderWithI18n(
        <PdfDocumentModal
          open={true}
          onClose={vi.fn()}
          attachment={enrichedAttachment}
          displayName={enrichedAttachment.originalFileName}
          pageCount={enrichedAttachment.pageCount}
        />,
      );

      expect(screen.getByText("proposal-riset.pdf")).toBeInTheDocument();
      expect(screen.getByText(/Dokumen PDF • 3 hlm • 1.8 MB/)).toBeInTheDocument();
    });
  });

  describe("Improvement Suggestions: PDF Page Count Extraction & Formatting (REVIEW-RFC-015)", () => {
    it("extracts single page from valid PDF sample", () => {
      expect(extractPdfPageCount(VALID_PDF_SAMPLE)).toBe(1);
    });

    it("extracts multi-page count from /Pages /Count N dictionary", () => {
      const multiPagePdf = Buffer.from(
        "%PDF-1.4\n1 0 obj\n<< /Type /Pages /Kids [2 0 R 3 0 R] /Count 12 >>\nendobj\n%%EOF",
        "utf8",
      );
      expect(extractPdfPageCount(multiPagePdf)).toBe(12);
    });

    it("extracts page count from multiple /Type /Page objects", () => {
      const multiObjPdf = Buffer.from(
        "%PDF-1.4\n1 0 obj<</Type/Page>>endobj\n2 0 obj<</Type/Page>>endobj\n3 0 obj<</Type/Page>>endobj\n%%EOF",
        "utf8",
      );
      expect(extractPdfPageCount(multiObjPdf)).toBe(3);
    });

    it("returns null for non-PDF or image buffers", () => {
      expect(extractPdfPageCount(JPEG_SAMPLE)).toBeNull();
      expect(extractPdfPageCount(Buffer.from([0x00, 0x01, 0x02]))).toBeNull();
    });

    it("formats page count correctly across ID and EN locales", () => {
      expect(formatPageCount(1, idDictionary)).toBe("1 hlm");
      expect(formatPageCount(5, idDictionary)).toBe("5 hlm");

      expect(formatPageCount(1, enDictionary)).toBe("1 pg");
      expect(formatPageCount(5, enDictionary)).toBe("5 pgs");
    });
  });
});
