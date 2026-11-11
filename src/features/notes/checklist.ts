import { ApiError } from "@/lib/api-response";

export interface ChecklistItem {
  index: number;
  checked: boolean;
  text: string;
  line: number;
}

interface FenceState {
  char: "`" | "~";
  length: number;
}

interface ParsedLine {
  content: string;
  ending: string;
}

interface ListFrame {
  contentIndent: number;
}

interface ChecklistMatch {
  lineIndex: number;
  lineNumber: number;
  prefix: string;
  markerChar: string;
  suffix: string;
  text: string;
}

const FENCE_OPEN_REGEX = /^(`{3,}|~{3,})([^\r\n]*)$/;
const TASK_ITEM_REGEX =
  /^((?:[-+*]|\d{1,9}[.)])[ \t]+)\[([ xX])\]([ \t]+)(.*)$/;

function splitLinesPreservingEndings(markdown: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  let start = 0;

  for (let i = 0; i < markdown.length; i += 1) {
    const ch = markdown[i];
    if (ch === "\r" && markdown[i + 1] === "\n") {
      lines.push({ content: markdown.slice(start, i), ending: "\r\n" });
      i += 1;
      start = i + 1;
    } else if (ch === "\n") {
      lines.push({ content: markdown.slice(start, i), ending: "\n" });
      start = i + 1;
    }
  }

  lines.push({ content: markdown.slice(start), ending: "" });
  return lines;
}

function measureLeadingIndent(line: string): {
  columns: number;
  strippedStart: number;
  blockquotePrefixLen: number;
} {
  let idx = 0;
  // Consume blockquote markers (`> ` or `>`) so quoted task lists match GFM behavior.
  while (idx < line.length) {
    let probe = idx;
    let leadingSpaces = 0;
    while (probe < line.length && line[probe] === " " && leadingSpaces < 3) {
      leadingSpaces += 1;
      probe += 1;
    }
    if (line[probe] === ">") {
      idx = probe + 1;
      if (line[idx] === " " || line[idx] === "\t") {
        idx += 1;
      }
      continue;
    }
    break;
  }

  const blockquotePrefixLen = idx;
  let columns = 0;
  while (idx < line.length) {
    const ch = line[idx];
    if (ch === " ") {
      columns += 1;
      idx += 1;
    } else if (ch === "\t") {
      columns += 4 - (columns % 4);
      idx += 1;
    } else {
      break;
    }
  }

  return { columns, strippedStart: idx, blockquotePrefixLen };
}

function tryOpenFence(trimmed: string): FenceState | null {
  const match = FENCE_OPEN_REGEX.exec(trimmed);
  if (!match) {
    return null;
  }

  const marker = match[1];
  const infoString = match[2];
  const fenceChar = marker[0] as "`" | "~";

  // CommonMark rejects backtick code fences whose info string contains backticks.
  if (fenceChar === "`" && infoString.includes("`")) {
    return null;
  }

  return { char: fenceChar, length: marker.length };
}

function isClosingFence(trimmed: string, fence: FenceState): boolean {
  if (trimmed.length < fence.length) {
    return false;
  }

  let runLength = 0;
  while (runLength < trimmed.length && trimmed[runLength] === fence.char) {
    runLength += 1;
  }

  if (runLength < fence.length) {
    return false;
  }

  for (let i = runLength; i < trimmed.length; i += 1) {
    if (trimmed[i] !== " " && trimmed[i] !== "\t") {
      return false;
    }
  }

  return true;
}

function scanChecklistMatches(markdown: string): {
  lines: ParsedLine[];
  matches: ChecklistMatch[];
} {
  const lines = splitLinesPreservingEndings(markdown);
  const matches: ChecklistMatch[] = [];

  let activeFence: FenceState | null = null;
  let activeFenceIndent = 0;
  const listStack: ListFrame[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
    const rawLine = lines[lineIdx].content;
    const { columns, strippedStart, blockquotePrefixLen } =
      measureLeadingIndent(rawLine);
    const rest = rawLine.slice(strippedStart);
    const trimmedBlank = rest.length === 0;

    if (activeFence !== null) {
      const relativeIndent = columns - activeFenceIndent;
      if (relativeIndent >= 0 && relativeIndent <= 3 && isClosingFence(rest, activeFence)) {
        activeFence = null;
        activeFenceIndent = 0;
      }
      continue;
    }

    if (trimmedBlank) {
      continue;
    }

    while (
      listStack.length > 0 &&
      columns < listStack[listStack.length - 1].contentIndent
    ) {
      listStack.pop();
    }

    const containerIndent =
      listStack.length > 0 ? listStack[listStack.length - 1].contentIndent : 0;
    const relativeIndent = columns - containerIndent;

    // Top-level or post-container 4+ column indentation forms an indented code block.
    if (relativeIndent >= 4) {
      continue;
    }

    const openedFence = tryOpenFence(rest);
    if (openedFence) {
      activeFence = openedFence;
      activeFenceIndent = containerIndent;
      continue;
    }

    const listMatch = /^((?:[-+*]|\d{1,9}[.)])[ \t]+)(.*)$/.exec(rest);
    if (!listMatch) {
      // Non-list non-indented paragraph text closes active list containers on top level.
      if (relativeIndent <= 0) {
        listStack.length = 0;
      }
      continue;
    }

    const listContentIndent = columns + listMatch[1].length;
    if (
      listStack.length === 0 ||
      columns >= listStack[listStack.length - 1].contentIndent
    ) {
      listStack.push({ contentIndent: listContentIndent });
    } else {
      listStack[listStack.length - 1] = { contentIndent: listContentIndent };
    }

    const taskMatch = TASK_ITEM_REGEX.exec(rest);
    if (!taskMatch) {
      continue;
    }

    const text = taskMatch[4];
    const nextNonBlankIndented =
      text.trim().length === 0 &&
      lineIdx + 1 < lines.length &&
      lines[lineIdx + 1].content.trim().length > 0 &&
      measureLeadingIndent(lines[lineIdx + 1].content).columns >= listContentIndent;

    // Matches remark-gfm rule: `- [ ]` with neither inline text nor continuation stays a plain bullet.
    if (text.trim().length === 0 && !nextNonBlankIndented) {
      continue;
    }

    const leadingSlice = rawLine.slice(0, strippedStart);
    matches.push({
      lineIndex: lineIdx,
      lineNumber: lineIdx + 1,
      prefix: leadingSlice + taskMatch[1],
      markerChar: taskMatch[2],
      suffix: taskMatch[3] + taskMatch[4],
      text: text.trim(),
    });

    void blockquotePrefixLen;
  }

  return { lines, matches };
}

/**
 * Extracts GFM task-list items (`- [ ]` / `- [x]`) in document order, skipping code blocks.
 */
export function parseChecklists(markdown: string): ChecklistItem[] {
  const { matches } = scanChecklistMatches(markdown);
  return matches.map((match, index) => ({
    index,
    checked: match.markerChar === "x" || match.markerChar === "X",
    text: match.text,
    line: match.lineNumber,
  }));
}

/**
 * Deterministically toggles the N-th GFM task-list item in Markdown while preserving formatting and CRLF.
 */
export function toggleChecklistInMarkdown(
  markdown: string,
  index: number,
  checked: boolean,
): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Checklist index must be a non-negative integer",
    );
  }

  const { lines, matches } = scanChecklistMatches(markdown);
  const target = matches[index];
  if (!target) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Checklist index is out of range for this note",
    );
  }

  const nextMarker = checked ? "x" : " ";
  lines[target.lineIndex] = {
    ...lines[target.lineIndex],
    content: `${target.prefix}[${nextMarker}]${target.suffix}`,
  };

  return lines.map((line) => line.content + line.ending).join("");
}

