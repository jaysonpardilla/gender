export interface WordLineLocation {
  page: number;
  line: number;
  occurrence: number;
}

export interface DocumentLineNumberResult {
  locations: Map<string, WordLineLocation[]>;
  lineCount: number;
}

interface TextFragment {
  top: number;
  height: number;
  fontSize: number;
  fontFamily: string;
}

interface DocumentLine {
  top: number;
  height: number;
  fontSize: number;
  fontFamily: string;
}

interface NumberedLine extends DocumentLine {
  number: number;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
};

const getNearestLineNumber = (lines: NumberedLine[], top: number): number => {
  return lines.reduce((nearest, line) => (
    Math.abs(line.top - top) < Math.abs(nearest.top - top) ? line : nearest
  )).number;
};

export function addDocumentLineNumbers(
  page: HTMLElement,
  pageNumber: number,
  terms: string[] = [],
  startNumber?: number,
): DocumentLineNumberResult {
  page.querySelector('.document-line-number-gutter')?.remove();

  const pageRect = page.getBoundingClientRect();
  const contentTop = pageRect.top + page.clientTop;
  const fragments: TextFragment[] = [];
  const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parent = node.parentElement;
    if (!node.textContent?.trim() || !parent || parent.closest('.document-line-number-gutter')) {
      continue;
    }

    const style = window.getComputedStyle(parent);
    const fontSize = parseFloat(style.fontSize);
    const range = document.createRange();
    range.selectNodeContents(node);
    Array.from(range.getClientRects()).forEach((rect) => {
      if (rect.width > 0 && rect.height > 0) {
        fragments.push({
          top: rect.top - contentTop,
          height: rect.height,
          fontSize: Number.isFinite(fontSize) ? fontSize : rect.height,
          fontFamily: style.fontFamily,
        });
      }
    });
  }

  fragments.sort((left, right) => left.top - right.top);
  const medianTextHeight = median(fragments.map((fragment) => fragment.height)) || 16;
  const sameLineTolerance = Math.max(2, medianTextHeight * 0.3);
  const lineGroups: TextFragment[][] = [];

  fragments.forEach((fragment) => {
    const currentGroup = lineGroups[lineGroups.length - 1];
    if (!currentGroup || fragment.top - median(currentGroup.map((item) => item.top)) > sameLineTolerance) {
      lineGroups.push([fragment]);
    } else {
      currentGroup.push(fragment);
    }
  });

  const documentLines: DocumentLine[] = lineGroups.map((group) => {
    const families = new Map<string, number>();
    group.forEach((fragment) => {
      families.set(fragment.fontFamily, (families.get(fragment.fontFamily) || 0) + 1);
    });
    const fontFamily = Array.from(families.entries())
      .sort((left, right) => right[1] - left[1])[0]?.[0] || 'Arial, sans-serif';

    return {
      top: median(group.map((fragment) => fragment.top)),
      height: median(group.map((fragment) => fragment.height)),
      fontSize: median(group.map((fragment) => fragment.fontSize)) || medianTextHeight,
      fontFamily,
    };
  });

  const lineGaps = documentLines.slice(1)
    .map((line, index) => line.top - documentLines[index].top)
    .filter((gap) => gap > sameLineTolerance && gap <= medianTextHeight * 2.5);
  const linePitch = median(lineGaps) || medianTextHeight;
  const pageHeight = page.clientHeight || pageRect.height;
  const numberedLines: NumberedLine[] = [];

  const firstDocumentLine = documentLines[0];
  if (firstDocumentLine && firstDocumentLine.top > 0) {
    const rowsBeforeText = Math.max(1, Math.round(firstDocumentLine.top / linePitch));
    for (let row = 0; row < rowsBeforeText; row += 1) {
      numberedLines.push({
        ...firstDocumentLine,
        top: firstDocumentLine.top * (row / rowsBeforeText),
        number: numberedLines.length + 1,
      });
    }
  }

  documentLines.forEach((line, index) => {
    if (index > 0) {
      const previousLine = documentLines[index - 1];
      const gap = line.top - previousLine.top;
      const rowsBetween = Math.max(1, Math.round(gap / linePitch));

      for (let row = 1; row < rowsBetween; row += 1) {
        const progress = row / rowsBetween;
        const styleLine = progress < 0.5 ? previousLine : line;
        numberedLines.push({
          top: previousLine.top + (gap * progress),
          height: styleLine.height,
          fontSize: styleLine.fontSize,
          fontFamily: styleLine.fontFamily,
          number: numberedLines.length + 1,
        });
      }
    }

    numberedLines.push({ ...line, number: numberedLines.length + 1 });
  });

  const lastLine = numberedLines[numberedLines.length - 1];
  if (lastLine) {
    const remainingRows = Math.max(0, Math.floor((pageHeight - lastLine.top - 1) / linePitch));
    for (let row = 1; row <= remainingRows; row += 1) {
      numberedLines.push({
        ...lastLine,
        top: lastLine.top + (linePitch * row),
        number: numberedLines.length + 1,
      });
    }
  } else {
    const pageStyle = window.getComputedStyle(page);
    const fontSize = parseFloat(pageStyle.fontSize) || 14;
    const fontFamily = pageStyle.fontFamily || 'Arial, sans-serif';
    const fallbackPitch = parseFloat(pageStyle.lineHeight) || fontSize * 1.2;
    const totalRows = Math.ceil(pageHeight / fallbackPitch);
    for (let row = 0; row < totalRows; row += 1) {
      numberedLines.push({
        top: row * fallbackPitch,
        height: fallbackPitch,
        fontSize,
        fontFamily,
        number: row + 1,
      });
    }
  }

  const pageNumberOffset = startNumber ?? ((pageNumber - 1) * numberedLines.length);
  numberedLines.forEach((line, index) => {
    line.number = pageNumberOffset + index + 1;
  });

  const gutter = document.createElement('div');
  gutter.className = 'document-line-number-gutter';
  gutter.setAttribute('aria-hidden', 'true');

  numberedLines.forEach((line) => {
    const label = document.createElement('span');
    label.textContent = String(line.number);
    label.style.top = `${line.top + ((line.height - linePitch) / 2)}px`;
    label.style.height = `${linePitch}px`;
    label.style.fontSize = `${line.fontSize}px`;
    label.style.fontFamily = line.fontFamily;
    gutter.appendChild(label);
  });
  page.appendChild(gutter);

  const locations = new Map<string, WordLineLocation[]>();
  const addLocation = (term: string, top: number, target?: HTMLElement) => {
    const normalizedTerm = term.trim().toLocaleLowerCase();
    if (!normalizedTerm || numberedLines.length === 0) return;
    const matches = locations.get(normalizedTerm) || [];
    const location = {
      page: pageNumber,
      line: getNearestLineNumber(numberedLines, top),
      occurrence: matches.length + 1,
    };
    target?.setAttribute('data-document-line', String(location.line));
    target?.setAttribute('data-document-occurrence', String(location.occurrence));
    matches.push(location);
    locations.set(normalizedTerm, matches);
  };

  page.querySelectorAll<HTMLElement>('.bias-word-highlight').forEach((highlight) => {
    const word = highlight.textContent?.trim();
    if (word) {
      addLocation(word, highlight.getBoundingClientRect().top - contentTop, highlight);
    }
  });

  terms.forEach((term) => {
    const firstToken = term.trim().split(/\s+/)[0];
    const normalizedTerm = term.trim().toLocaleLowerCase();
    if (!firstToken || locations.has(normalizedTerm)) return;
    const escapedToken = firstToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tokenPattern = new RegExp(`(^|\\W)${escapedToken}(?=\\W|$)`, 'i');
    const occurrencePattern = new RegExp(`(^|\\W)${escapedToken}(?=\\W|$)`, 'gi');
    Array.from(page.querySelectorAll<HTMLElement>('.react-pdf__Page__textContent span'))
      .filter((span) => tokenPattern.test(span.textContent?.trim() || ''))
      .forEach((matchingText) => {
        const text = matchingText.textContent?.trim() || '';
        const occurrences = Array.from(text.matchAll(occurrencePattern));
        occurrences.forEach(() => {
          addLocation(term, matchingText.getBoundingClientRect().top - contentTop, matchingText);
        });
      });
  });

  return { locations, lineCount: numberedLines.length };
}
