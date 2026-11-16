"use client";

import { useEffect } from "react";
import { Download, ExternalLink, FileText } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { NoteAttachmentDto } from "@/features/notes/attachments-service";
import { extractPdfPageCount } from "@/features/notes/pdf-metadata";
import { useI18n } from "@/lib/i18n/context";
import type { Dictionary } from "@/lib/i18n/types";

export { extractPdfPageCount };

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPageCount(count: number, t: Dictionary): string {
  if (count === 1) {
    return t.notes.attachments.pageCountSingle.replace("{count}", "1");
  }
  return t.notes.attachments.pageCountBadge.replace("{count}", String(count));
}

export interface PdfDocumentModalProps {
  open: boolean;
  onClose: () => void;
  attachment: NoteAttachmentDto | null;
  displayName?: string;
  pageCount?: number;
  onPageCountResolved?: (pageCount: number) => void;
}

export function PdfDocumentModal({
  open,
  onClose,
  attachment,
  displayName,
  pageCount,
  onPageCountResolved,
}: PdfDocumentModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open || !attachment || pageCount !== undefined) {
      return;
    }

    let active = true;
    void (async () => {
      try {
        const response = await fetch(attachment.url);
        if (!response.ok) return;
        const arrayBuffer = await response.arrayBuffer();
        if (!active) return;
        const resolved = extractPdfPageCount(arrayBuffer);
        if (resolved && resolved > 0) {
          onPageCountResolved?.(resolved);
        }
      } catch {
        // Safe fallback if network or parse fails
      }
    })();

    return () => {
      active = false;
    };
  }, [open, attachment, pageCount, onPageCountResolved]);

  if (!attachment) {
    return null;
  }

  const effectiveFilename =
    displayName ||
    attachment.originalFileName ||
    `attachment-${attachment.id}.pdf`;

  const pageCountLabel = pageCount ? formatPageCount(pageCount, t) : null;
  const description = pageCountLabel
    ? `${t.notes.attachments.pdfDocumentLabel} • ${pageCountLabel} • ${formatFileSize(attachment.sizeBytes)}`
    : `${t.notes.attachments.pdfDocumentLabel} • ${formatFileSize(attachment.sizeBytes)}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.notes.attachments.pdfModalTitle}
      description={description}
      className="max-w-4xl w-[95vw]"
    >
      <div className="flex flex-col gap-3">
        {/* Action toolbar */}
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
          <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
            <FileText className="h-4 w-4 text-rose-500" aria-hidden="true" />
            <span
              className="truncate max-w-[200px] sm:max-w-md font-semibold text-[var(--text-primary)]"
              title={effectiveFilename}
            >
              {effectiveFilename}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t.notes.attachments.openInNewTab}</span>
            </a>

            <a
              href={attachment.url}
              download={effectiveFilename}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[var(--accent-primary)] px-3.5 py-1 text-xs font-semibold text-[var(--accent-contrast)] hover:opacity-90 transition-opacity focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t.notes.attachments.downloadPdf}</span>
            </a>
          </div>
        </div>

        {/* Sandboxed PDF Viewport (SEC-4) */}
        <div className="relative w-full h-[65vh] sm:h-[72vh] rounded-xl overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
          <iframe
            src={attachment.url}
            title={t.notes.attachments.pdfModalTitle}
            sandbox="allow-scripts allow-same-origin"
            className="w-full h-full border-0"
          />
        </div>
      </div>
    </Modal>
  );
}
