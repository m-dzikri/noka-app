import {
  createElement,
  type ComponentProps,
  type ComponentType,
  type ReactNode,
} from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownPreview, sanitizeMarkdownUrl } from "@/components/notes/MarkdownPreview";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import {
  parseChecklists,
  toggleChecklistInMarkdown,
} from "@/features/notes/checklist";

const TestPreferencesProvider = PreferencesProvider as ComponentType<
  Omit<ComponentProps<typeof PreferencesProvider>, "children"> & {
    children?: ReactNode;
  }
>;

function renderPreview(
  content: string,
  onToggleChecklist?: (index: number, checked: boolean) => void,
) {
  return render(
    createElement(
      TestPreferencesProvider,
      {
        initialLocale: "en",
        initialTheme: "light",
        hasCookieLocale: true,
        hasCookieTheme: true,
      },
      createElement(MarkdownPreview, { content, onToggleChecklist }),
    ),
  );
}

describe("GFM checklist engine & safe MarkdownPreview (TS-004-01)", () => {
  it("parses and toggles nested, ordered, alternate bullets while preserving CRLF endings", () => {
    const crlfMarkdown = [
      "# Belanja",
      "- [ ] Kopi",
      "  * [X] Susu oat",
      "1. [ ] Roti",
      "2) [x] Telur",
      "> - [ ] Dari kutipan",
    ].join("\r\n");

    const parsed = parseChecklists(crlfMarkdown);
    expect(parsed).toEqual([
      { index: 0, checked: false, text: "Kopi", line: 2 },
      { index: 1, checked: true, text: "Susu oat", line: 3 },
      { index: 2, checked: false, text: "Roti", line: 4 },
      { index: 3, checked: true, text: "Telur", line: 5 },
      { index: 4, checked: false, text: "Dari kutipan", line: 6 },
    ]);

    const toggled = toggleChecklistInMarkdown(crlfMarkdown, 2, true);
    expect(toggled).toBe(
      [
        "# Belanja",
        "- [ ] Kopi",
        "  * [X] Susu oat",
        "1. [x] Roti",
        "2) [x] Telur",
        "> - [ ] Dari kutipan",
      ].join("\r\n"),
    );

    const unchecked = toggleChecklistInMarkdown(toggled, 1, false);
    expect(unchecked).toContain("  * [ ] Susu oat\r\n");
  });

  it("ignores checklist syntax inside variable-length backtick/tilde fences and indented code blocks", () => {
    const markdown = [
      "- [ ] Real first",
      "````markdown",
      "- [ ] Inside 4-backtick fence",
      "```",
      "- [x] Nested 3-backtick inside 4-backtick fence",
      "````",
      "~~~~",
      "- [ ] Inside tilde fence",
      "~~~~",
      "",
      "    - [ ] Top-level indented code block",
      "",
      "Standalone empty below should be skipped:",
      "- [ ]",
      "- [x] Real second",
    ].join("\n");

    const items = parseChecklists(markdown);
    expect(items).toEqual([
      { index: 0, checked: false, text: "Real first", line: 1 },
      { index: 1, checked: true, text: "Real second", line: 15 },
    ]);

    const toggled = toggleChecklistInMarkdown(markdown, 1, false);
    expect(toggled).toContain("- [ ] Inside 4-backtick fence");
    expect(toggled).toContain("- [ ] Inside tilde fence");
    expect(toggled).toContain("    - [ ] Top-level indented code block");
    expect(toggled.endsWith("- [ ] Real second")).toBe(true);
  });

  it("rejects negative or out-of-range checklist index with 422 VALIDATION_ERROR", () => {
    expect(() => toggleChecklistInMarkdown("- [ ] Only one", -1, true)).toThrow(
      /non-negative integer/,
    );
    expect(() => toggleChecklistInMarkdown("- [ ] Only one", 1, true)).toThrow(
      /out of range/,
    );
  });

  it("keeps 1:1 parity between parseChecklists and ReactMarkdown + remark-gfm checkboxes", () => {
    const markdown = [
      "- [ ] Task A",
      "- [x] Task B",
      "```ts",
      "- [ ] Ignored code task",
      "```",
      "1. [ ] Task C",
      "",
      "> - Quoted bullet",
      "",
      "    - [ ] Top-level code after blockquote exit",
      "",
      "10. [ ] Ignored non-1 ordered list immediately after indented code",
      "",
      "Section after code:",
      "",
      "10. Parent item",
      "    continuation line inside 4-space ordered list",
      "    - [ ] Nested ordered-list task D",
      "",
      "> - [ ] Quoted nested parent",
      ">   - [x] Quoted child E",
      ">   lazy continuation keeping child open",
      ">",
      ">       - [ ] Nested task inside quoted child E",
      "",
      "> - [ ] Quoted second parent",
      ">   - [x] Quoted child F",
      ">",
      ">   continuation after blank closing child",
      ">",
      ">       - [ ] Indented code inside quoted parent",
      "",
      "- [ ] Item with unclosed fence",
      "  ```",
      "  - [ ] Ignored inside item fence",
      "- [ ] Sibling closing unclosed item fence",
    ].join("\n");

    const parsed = parseChecklists(markdown);
    expect(parsed.map((item) => item.text)).toEqual([
      "Task A",
      "Task B",
      "Task C",
      "Nested ordered-list task D",
      "Quoted nested parent",
      "Quoted child E",
      "Nested task inside quoted child E",
      "Quoted second parent",
      "Quoted child F",
      "Item with unclosed fence",
      "Sibling closing unclosed item fence",
    ]);

    const onToggle = vi.fn();
    renderPreview(markdown, onToggle);

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(parsed.length);
    for (const [idx, item] of parsed.entries()) {
      expect(checkboxes[idx]).toHaveAttribute("data-checklist-index", String(idx));
      if (item.checked) {
        expect(checkboxes[idx]).toBeChecked();
      } else {
        expect(checkboxes[idx]).not.toBeChecked();
      }
    }

    fireEvent.click(checkboxes[3]);
    expect(onToggle).toHaveBeenCalledWith(3, true);
    fireEvent.click(checkboxes[5]);
    expect(onToggle).toHaveBeenCalledWith(5, false);
    fireEvent.click(checkboxes[10]);
    expect(onToggle).toHaveBeenCalledWith(10, true);

    const toggled = toggleChecklistInMarkdown(markdown, 3, true);
    expect(toggled).toContain("    - [x] Nested ordered-list task D");
  });

  it("strips raw HTML and blocks unsafe javascript:/data:/vbscript: links (SEC-7)", () => {
    expect(sanitizeMarkdownUrl("https://noka.app/notes")).toBe(
      "https://noka.app/notes",
    );
    expect(sanitizeMarkdownUrl("mailto:team@noka.app")).toBe(
      "mailto:team@noka.app",
    );
    expect(sanitizeMarkdownUrl("/app/notes")).toBe("/app/notes");
    expect(sanitizeMarkdownUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeMarkdownUrl("data:text/html,<script>alert(1)</script>")).toBe(
      "",
    );
    expect(sanitizeMarkdownUrl("vbscript:msgbox(1)")).toBe("");
    expect(sanitizeMarkdownUrl("//evil.com/phish")).toBe("");

    const malicious = [
      "<script>window.__xss=true</script>",
      "<iframe src=\"https://evil.com\"></iframe>",
      "<img src=x onerror=alert(1)>",
      "<u>raw html disabled</u>",
      "[Safe](https://noka.app)",
      "[Evil JS](javascript:alert(1))",
      "[Evil Data](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
      "[Evil Proto](//evil.com/phish)",
      "[Evil Raw](data:text/html,<svg onload=alert(1)>)",
    ].join("\n\n");

    const { container } = renderPreview(malicious);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("u")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();

    const links = Array.from(container.querySelectorAll("a"));
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://noka.app");
    expect(links[0]).toHaveTextContent("Safe");
    expect(screen.getByText("Evil JS")).toBeVisible();
    expect(screen.getByText("Evil Data")).toBeVisible();
    expect(screen.getByText("Evil Proto")).toBeVisible();
  });
});
