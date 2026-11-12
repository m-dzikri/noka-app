"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseChecklists } from "@/features/notes/checklist";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

export interface MarkdownPreviewProps {
  content: string;
  onToggleChecklist?: (index: number, checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

interface HastElementLike {
  type?: unknown;
  tagName?: unknown;
  properties?: Record<string, unknown>;
  children?: unknown[];
}

/**
 * Stamps sequential 0-based `data-checklist-index` attributes onto GFM task-list checkboxes in the HAST tree.
 */
function rehypeChecklistIndex() {
  return (tree: unknown) => {
    let index = 0;

    const visit = (node: unknown, insideTaskListItem: boolean): void => {
      if (typeof node !== "object" || node === null) {
        return;
      }

      const element = node as HastElementLike;
      const props = element.properties ?? {};
      const classes = Array.isArray(props.className) ? props.className : [];
      const isTaskLi =
        element.type === "element" &&
        element.tagName === "li" &&
        classes.includes("task-list-item");

      if (
        insideTaskListItem &&
        element.type === "element" &&
        element.tagName === "input" &&
        props.type === "checkbox"
      ) {
        props["data-checklist-index"] = index;
        index += 1;
      }

      if (Array.isArray(element.children)) {
        for (const child of element.children) {
          visit(child, insideTaskListItem || isTaskLi);
        }
      }
    };

    visit(tree, false);
  };
}

/**
 * Restricts Markdown link and image URLs strictly to safe protocols (SEC-7).
 */
export function sanitizeMarkdownUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) {
    return "";
  }

  const compact = trimmed.replace(/[\u0000-\u0020]+/g, "");
  if (
    compact.startsWith("//") ||
    compact.startsWith("\\\\") ||
    compact.startsWith("/\\")
  ) {
    return "";
  }

  if (
    trimmed.startsWith("#") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("/")
  ) {
    return trimmed;
  }

  try {
    const parsed = new URL(compact);
    if (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "mailto:"
    ) {
      return trimmed;
    }
    return "";
  } catch {
    // Reject protocol-like strings (e.g. `javascript:alert(1)`) cleanly.
    return compact.includes(":") ? "" : trimmed;
  }
}

/**
 * Safe Markdown + GFM task-list renderer (zero rehype-raw, strict URL filtering, interactive checkboxes).
 */
export function MarkdownPreview({
  content,
  onToggleChecklist,
  disabled = false,
  className,
}: MarkdownPreviewProps) {
  const { t } = useI18n();
  const checklistItems = parseChecklists(content);

  if (content.trim().length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 p-4 text-sm text-[var(--text-muted)]",
          className,
        )}
      >
        {t.notes.previewEmpty}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "noka-markdown space-y-3 text-sm leading-relaxed text-[var(--text-primary)] break-words",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeChecklistIndex]}
        urlTransform={sanitizeMarkdownUrl}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-4 text-xl font-bold tracking-tight text-[var(--text-primary)] first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-3 text-lg font-semibold tracking-tight text-[var(--text-primary)] first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2.5 text-base font-semibold text-[var(--text-primary)] first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="text-[var(--text-primary)]">{children}</p>
          ),
          ul: ({ children, className: listClassName }) => (
            <ul
              className={cn(
                "space-y-1.5 pl-5",
                listClassName?.includes("contains-task-list")
                  ? "list-none pl-1"
                  : "list-disc",
                listClassName,
              )}
            >
              {children}
            </ul>
          ),
          ol: ({ children, className: listClassName }) => (
            <ol
              className={cn(
                "list-decimal space-y-1.5 pl-5",
                listClassName?.includes("contains-task-list") && "list-none pl-1",
                listClassName,
              )}
            >
              {children}
            </ol>
          ),
          li: ({ children, className: itemClassName }) => (
            <li
              className={cn(
                "text-[var(--text-primary)]",
                itemClassName?.includes("task-list-item") &&
                  "flex flex-wrap items-start gap-2.5",
                itemClassName,
              )}
            >
              {children}
            </li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[var(--accent-primary)] bg-[var(--bg-subtle)]/70 px-3 py-2 text-[var(--text-secondary)] rounded-r-lg">
              {children}
            </blockquote>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3 font-mono text-xs text-[var(--text-primary)]">
              {children}
            </pre>
          ),
          code: ({ children, className: codeClassName }) => {
            const isBlock = Boolean(codeClassName?.includes("language-"));
            return (
              <code
                className={cn(
                  "font-mono text-xs",
                  !isBlock &&
                    "rounded bg-[var(--bg-subtle)] px-1.5 py-0.5 text-[var(--text-primary)]",
                  codeClassName,
                )}
              >
                {children}
              </code>
            );
          },
          a: ({
            href,
            children,
          }: ComponentPropsWithoutRef<"a"> & { children?: ReactNode }) => {
            const safeHref = typeof href === "string" ? sanitizeMarkdownUrl(href) : "";
            if (!safeHref) {
              return (
                <span className="text-[var(--text-secondary)] underline decoration-dotted">
                  {children}
                </span>
              );
            }

            const isExternal =
              safeHref.startsWith("http://") || safeHref.startsWith("https://");

            return (
              <a
                href={safeHref}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer nofollow" : undefined}
                className="font-medium text-[var(--accent-text)] underline underline-offset-2 hover:opacity-85"
              >
                {children}
              </a>
            );
          },
          input: (props) => {
            const rawIndex = (
              props as Record<string, unknown>
            )["data-checklist-index"];
            if (props.type === "checkbox" && typeof rawIndex === "number") {
              const checked = Boolean(props.checked);
              const matchedItem = checklistItems[rawIndex];
              const ariaLabel = matchedItem
                ? `${t.notes.checklistToggleAria}: ${matchedItem.text}`
                : t.notes.checklistToggleAria;

              return (
                <input
                  type="checkbox"
                  checked={checked}
                  data-checklist-index={rawIndex}
                  disabled={disabled || !onToggleChecklist}
                  aria-label={ariaLabel}
                  onChange={() => onToggleChecklist?.(rawIndex, !checked)}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border border-[var(--border-strong)] accent-[var(--accent-primary)] disabled:cursor-default"
                />
              );
            }

            return <input {...props} />;
          },
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
              <table className="w-full border-collapse text-left text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2 font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-[var(--border-subtle)] px-3 py-2">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

