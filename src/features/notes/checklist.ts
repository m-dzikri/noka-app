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
  blockquoteDepth: number;
  containerIndent: number;
}

interface IndentedCodeState {
  blockquoteDepth: number;
  containerIndent: number;
}

interface ParsedLine {
  content: string;
  ending: string;
}

interface ListFrame {
  contentIndent: number;
  blockquoteDepth: number;
}

interface ParsedListMarker {
  contentIndent: number;
  canInterruptParagraph: boolean;
  hasContent: boolean;
  task: {
    prefixAfterQuote: string;
    markerChar: string;
    suffix: string;
    text: string;
  } | null;
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
const LIST_MARKER_REGEX = /^(?:([-+*])|(\d{1,9})([.)]))(?:([ \t]+)(.*))?$/;
const TASK_ITEM_REGEX = /^\[([ xX])\]([ \t]+)(.*)$/;
const ATX_HEADING_REGEX = /^#{1,6}(?:[ \t]|$)/;
const SETEXT_UNDERLINE_REGEX = /^(?:=+|-+)[ \t]*$/;

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
  blockquoteDepth: number;
} {
  let idx = 0;
  let blockquoteDepth = 0;
  let virtualTabSpaces = 0;

  // Consume CommonMark blockquote markers (`>` with up to 3 leading spaces and 1 optional space).
  while (idx < line.length) {
    let probe = idx;
    let leadingSpaces = virtualTabSpaces;
    let consumedVirtual = false;

    while (probe < line.length && leadingSpaces < 3) {
      if (line[probe] === " ") {
        leadingSpaces += 1;
        probe += 1;
      } else if (line[probe] === "\t" && leadingSpaces + (4 - (leadingSpaces % 4)) <= 3) {
        leadingSpaces += 4 - (leadingSpaces % 4);
        probe += 1;
      } else {
        break;
      }
    }

    if (line[probe] === ">") {
      blockquoteDepth += 1;
      idx = probe + 1;
      virtualTabSpaces = 0;
      if (line[idx] === " ") {
        idx += 1;
      } else if (line[idx] === "\t") {
        // CommonMark consumes 1 column of the tab as the optional space after `>`.
        const tabCol = leadingSpaces + 1;
        const tabWidth = 4 - (tabCol % 4);
        virtualTabSpaces = Math.max(0, tabWidth - 1);
        idx += 1;
        consumedVirtual = true;
      }
      if (!consumedVirtual) {
        virtualTabSpaces = 0;
      }
      continue;
    }
    break;
  }

  let columns = virtualTabSpaces;
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

  return { columns, strippedStart: idx, blockquoteDepth };
}

function isThematicBreakLine(trimmed: string): boolean {
  let markerChar: string | null = null;
  let count = 0;

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === " " || ch === "\t") {
      continue;
    }
    if (ch !== "-" && ch !== "_" && ch !== "*") {
      return false;
    }
    if (markerChar === null) {
      markerChar = ch;
    } else if (markerChar !== ch) {
      return false;
    }
    count += 1;
  }

  return count >= 3;
}

function measureWhitespaceColumns(whitespace: string, startColumn: number): number {
  let cols = 0;
  for (let i = 0; i < whitespace.length; i += 1) {
    const ch = whitespace[i];
    if (ch === "\t") {
      cols += 4 - ((startColumn + cols) % 4);
    } else {
      cols += 1;
    }
  }
  return cols;
}

function parseListMarker(
  rest: string,
  startColumns: number,
): ParsedListMarker | null {
  const match = LIST_MARKER_REGEX.exec(rest);
  if (!match) {
    return null;
  }

  const bulletMarker = match[1];
  const orderedDigits = match[2];
  const orderedDelim = match[3];
  const whitespace = match[4] ?? "";
  const afterWhitespace = match[5] ?? "";

  // A marker followed immediately by non-whitespace is not a CommonMark list item.
  if (whitespace.length === 0 && afterWhitespace.length > 0) {
    return null;
  }

  const markerToken = bulletMarker ?? `${orderedDigits}${orderedDelim}`;
  const wsColumns =
    whitespace.length === 0
      ? 1
      : measureWhitespaceColumns(whitespace, startColumns + markerToken.length);

  // CommonMark §5.2: >= 5 spaces after marker starts an indented code block inside the item (not inline content).
  const startsWithIndentedCode = whitespace.length > 0 && wsColumns >= 5;
  const effectiveWsColumns = startsWithIndentedCode || whitespace.length === 0 ? 1 : wsColumns;
  const contentIndent = startColumns + markerToken.length + effectiveWsColumns;

  const hasContent = afterWhitespace.trim().length > 0;
  const isOrderedOtherThanOne =
    orderedDigits !== undefined && Number.parseInt(orderedDigits, 10) !== 1;
  const canInterruptParagraph = hasContent && !isOrderedOtherThanOne;

  let task: ParsedListMarker["task"] = null;
  if (!startsWithIndentedCode && whitespace.length > 0) {
    const taskMatch = TASK_ITEM_REGEX.exec(afterWhitespace);
    if (taskMatch) {
      task = {
        prefixAfterQuote: markerToken + whitespace,
        markerChar: taskMatch[1],
        suffix: taskMatch[2] + taskMatch[3],
        text: taskMatch[3],
      };
    }
  }

  return {
    contentIndent,
    canInterruptParagraph,
    hasContent,
    task,
  };
}

function tryOpenFence(
  trimmed: string,
  blockquoteDepth: number,
  containerIndent: number,
): FenceState | null {
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

  return {
    char: fenceChar,
    length: marker.length,
    blockquoteDepth,
    containerIndent,
  };
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

function popClosedBlockquoteLists(listStack: ListFrame[], blockquoteDepth: number): void {
  while (
    listStack.length > 0 &&
    listStack[listStack.length - 1].blockquoteDepth > blockquoteDepth
  ) {
    listStack.pop();
  }
}

function popDedentedLists(listStack: ListFrame[], columns: number): void {
  while (
    listStack.length > 0 &&
    columns < listStack[listStack.length - 1].contentIndent
  ) {
    listStack.pop();
  }
}

function scanChecklistMatches(markdown: string): {
  lines: ParsedLine[];
  matches: ChecklistMatch[];
} {
  const lines = splitLinesPreservingEndings(markdown);
  const matches: ChecklistMatch[] = [];

  let activeFence: FenceState | null = null;
  let indentedCode: IndentedCodeState | null = null;
  let inParagraph = false;
  let sawBlank = false;
  let previousBlockquoteDepth = 0;
  const listStack: ListFrame[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx += 1) {
    const rawLine = lines[lineIdx].content;
    const { columns, strippedStart, blockquoteDepth } =
      measureLeadingIndent(rawLine);
    const rest = rawLine.slice(strippedStart);
    const trimmedBlank = rest.length === 0;

    if (activeFence !== null) {
      const fenceExitedByContainer =
        blockquoteDepth < activeFence.blockquoteDepth ||
        (!trimmedBlank && columns < activeFence.containerIndent);

      if (!fenceExitedByContainer) {
        const relativeIndent = columns - activeFence.containerIndent;
        if (
          !trimmedBlank &&
          relativeIndent >= 0 &&
          relativeIndent <= 3 &&
          isClosingFence(rest, activeFence)
        ) {
          activeFence = null;
          inParagraph = false;
          sawBlank = false;
        }
        previousBlockquoteDepth = blockquoteDepth;
        continue;
      }

      activeFence = null;
      inParagraph = false;
    }

    let exitedIndentedCode = false;
    if (indentedCode !== null) {
      if (trimmedBlank) {
        if (blockquoteDepth < indentedCode.blockquoteDepth) {
          indentedCode = null;
          popClosedBlockquoteLists(listStack, blockquoteDepth);
          inParagraph = false;
          sawBlank = true;
        }
        previousBlockquoteDepth = blockquoteDepth;
        continue;
      }

      if (
        blockquoteDepth >= indentedCode.blockquoteDepth &&
        columns - indentedCode.containerIndent >= 4
      ) {
        previousBlockquoteDepth = blockquoteDepth;
        continue;
      }

      indentedCode = null;
      exitedIndentedCode = true;
      sawBlank = false;
    }

    if (
      blockquoteDepth < previousBlockquoteDepth ||
      (!trimmedBlank &&
        listStack.length > 0 &&
        blockquoteDepth < listStack[listStack.length - 1].blockquoteDepth)
    ) {
      popClosedBlockquoteLists(listStack, blockquoteDepth);
      inParagraph = false;
    }

    if (trimmedBlank) {
      inParagraph = false;
      sawBlank = true;
      previousBlockquoteDepth = blockquoteDepth;
      continue;
    }

    const enteredDeeperQuote = blockquoteDepth > previousBlockquoteDepth;
    if (enteredDeeperQuote) {
      inParagraph = false;
    }

    const parsedList = parseListMarker(rest, columns);
    const topList = listStack[listStack.length - 1];
    const belowListIndent = topList !== undefined && columns < topList.contentIndent;
    const isAtxHeading = ATX_HEADING_REGEX.test(rest);
    const isThematicBreak = isThematicBreakLine(rest);
    const isSetextUnderline =
      inParagraph && !sawBlank && SETEXT_UNDERLINE_REGEX.test(rest);
    const opensFencePreview = FENCE_OPEN_REGEX.test(rest)
      ? tryOpenFence(rest, blockquoteDepth, 0) !== null
      : false;

    // Inside a list container, a lesser-indented non-empty marker closes the inner item to start a new/sibling item.
    const canCloseInnerListAsSibling =
      belowListIndent &&
      parsedList !== null &&
      parsedList.hasContent &&
      !exitedIndentedCode &&
      listStack.some((frame) => frame.blockquoteDepth === blockquoteDepth && columns < frame.contentIndent);

    const interruptsParagraph =
      enteredDeeperQuote ||
      opensFencePreview ||
      isAtxHeading ||
      isThematicBreak ||
      isSetextUnderline ||
      canCloseInnerListAsSibling ||
      (parsedList !== null && parsedList.canInterruptParagraph);

    if (belowListIndent) {
      if (inParagraph && !sawBlank && !interruptsParagraph) {
        // CommonMark lazy continuation extends the innermost open paragraph rather than closing list containers.
        sawBlank = false;
        previousBlockquoteDepth = blockquoteDepth;
        continue;
      }
      popDedentedLists(listStack, columns);
      inParagraph = false;
    }

    const containerIndent =
      listStack.length > 0 ? listStack[listStack.length - 1].contentIndent : 0;
    const relativeIndent = columns - containerIndent;

    if (relativeIndent >= 4) {
      if (inParagraph && !sawBlank) {
        // 4+ spaces inside an active paragraph cannot start an indented code block or nested list.
        sawBlank = false;
        previousBlockquoteDepth = blockquoteDepth;
        continue;
      }
      indentedCode = { blockquoteDepth, containerIndent };
      inParagraph = false;
      sawBlank = false;
      previousBlockquoteDepth = blockquoteDepth;
      continue;
    }

    const openedFence = tryOpenFence(rest, blockquoteDepth, containerIndent);
    if (openedFence !== null) {
      activeFence = openedFence;
      inParagraph = false;
      sawBlank = false;
      previousBlockquoteDepth = blockquoteDepth;
      continue;
    }

    if (isThematicBreak || isAtxHeading || isSetextUnderline) {
      inParagraph = false;
      sawBlank = false;
      previousBlockquoteDepth = blockquoteDepth;
      continue;
    }

    // Check list item: `micromark` exits indented-code with `interrupt=true`, so `2.`/`10.` right after it renders as text.
    const blockOrderedInterrupt = (inParagraph && !sawBlank) || exitedIndentedCode;
    if (
      parsedList !== null &&
      (!blockOrderedInterrupt || parsedList.canInterruptParagraph || canCloseInnerListAsSibling)
    ) {
      listStack.push({
        contentIndent: parsedList.contentIndent,
        blockquoteDepth,
      });

      const task = parsedList.task;
      sawBlank = false;
      inParagraph = parsedList.hasContent;
      previousBlockquoteDepth = blockquoteDepth;

      if (!task) {
        continue;
      }

      const nextNonBlankIndented =
        task.text.trim().length === 0 &&
        lineIdx + 1 < lines.length &&
        lines[lineIdx + 1].content.trim().length > 0 &&
        (() => {
          const nextIndent = measureLeadingIndent(lines[lineIdx + 1].content);
          return (
            nextIndent.blockquoteDepth >= blockquoteDepth &&
            nextIndent.columns >= parsedList.contentIndent
          );
        })();

      // Matches remark-gfm rule: `- [ ]` with neither inline text nor continuation stays a plain bullet.
      if (task.text.trim().length === 0 && !nextNonBlankIndented) {
        continue;
      }

      const leadingSlice = rawLine.slice(0, strippedStart);
      matches.push({
        lineIndex: lineIdx,
        lineNumber: lineIdx + 1,
        prefix: leadingSlice + task.prefixAfterQuote,
        markerChar: task.markerChar,
        suffix: task.suffix,
        text: task.text.trim(),
      });
      continue;
    }

    inParagraph = true;
    sawBlank = false;
    previousBlockquoteDepth = blockquoteDepth;
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

