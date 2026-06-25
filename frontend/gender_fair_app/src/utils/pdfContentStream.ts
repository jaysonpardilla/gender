/* eslint-disable @typescript-eslint/no-unused-vars */
// import { StandardFonts } from 'pdf-lib'; // Currently unused

export interface WordReplacement {
  original: string;
  replacement: string;
  approved: boolean;
}

export interface TextItemInfo {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
  transform: number[];
}

export interface TextOperation {
  type: 'text' | 'positioning' | 'font' | 'matrix' | 'spacing' | 'other';
  command: string;
  operands: (string | number | number[])[];
  originalBinary: Uint8Array;
  startOffset: number;
  endOffset: number;
  textContent?: string;
}

export interface PositionDelta {
  xShift: number;
  yShift: number;
  fontScale: number;
}

export interface TextLocationMap {
  operationIndex: number;
  textLength: number;
  position: { x: number; y: number };
  fontSize: number;
}

function encodeString(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// Note: These functions are kept for potential future use but not currently called
// Commenting out to avoid unused variable warnings
/*
function _extractOperator(data: Uint8Array, pos: number): { operator: string; operandsEnd: number } {
  let end = pos;
  while (end < data.length && String.fromCharCode(data[end]).match(/[A-Za-z*'\"]/)) {
    end++;
  }

  const operator = decodeString(data, pos, end);
  return { operator, operandsEnd: pos };
}

function _parseContentStream(streamData: Uint8Array): TextOperation[] {
  const operations: TextOperation[] = [];
  let pos = 0;

  while (pos < streamData.length) {
    const byte = streamData[pos];
    const char = String.fromCharCode(byte);

    if (char === ' ' || char === '\n' || char === '\r' || char === '\t') {
      pos++;
      continue;
    }

    if ((char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z') || char === '*' || char === "'" || char === '"') {
      const startPos = pos;
      const endPos = findOperatorEnd(streamData, pos);
      const operatorStr = decodeString(streamData, pos, endPos).trim();

      const parts = operatorStr.split(/\s+/);
      const operator = parts[parts.length - 1];

      if (TEXT_SHOWING_OPERATORS.includes(operator)) {
        operations.push({
          type: 'text',
          command: operator,
          operands: [operatorStr.substring(0, operatorStr.length - operator.length).trim()],
          originalBinary: streamData.slice(startPos, endPos),
          startOffset: startPos,
          endOffset: endPos,
          textContent: operatorStr
        });
      } else if (POSITIONING_OPERATORS.includes(operator)) {
        operations.push({
          type: 'positioning',
          command: operator,
          operands: parts.slice(0, -1).map(p => {
            const num = parseFloat(p);
            return isNaN(num) ? p : num;
          }),
          originalBinary: streamData.slice(startPos, endPos),
          startOffset: startPos,
          endOffset: endPos
        });
      } else if (FONT_OPERATORS.includes(operator)) {
        operations.push({
          type: 'font',
          command: operator,
          operands: parts.slice(0, -1),
          originalBinary: streamData.slice(startPos, endPos),
          startOffset: startPos,
          endOffset: endPos
        });
      } else if (SPACING_OPERATORS.includes(operator)) {
        operations.push({
          type: 'spacing',
          command: operator,
          operands: parts.slice(0, -1).map(p => {
            const num = parseFloat(p);
            return isNaN(num) ? p : num;
          }),
          originalBinary: streamData.slice(startPos, endPos),
          startOffset: startPos,
          endOffset: endPos
        });
      } else {
        operations.push({
          type: 'other',
          command: operator,
          operands: [],
          originalBinary: streamData.slice(startPos, endPos),
          startOffset: startPos,
          endOffset: endPos
        });
      }

      pos = endPos;
    } else {
      pos++;
    }
  }

  return operations;
}
*/

function calculateFontScaling(original: string, replacement: string, maxScale: number = 0.9): number {
  if (replacement.length === original.length) return 1;
  if (replacement.length < original.length) return 1;

  const lengthRatio = original.length / replacement.length;
  const scale = Math.max(maxScale, lengthRatio);
  return Math.min(1, scale);
}

function calculateCharacterSpacing(original: string, replacement: string, fontSize: number): number {
  if (replacement.length === original.length) return 0;

  const lengthDiff = replacement.length - original.length;
  const spacingAdjustment = -(fontSize * 0.05 * lengthDiff);
  return spacingAdjustment;
}

export function findAndReplaceInText(
  textContent: string,
  replacements: WordReplacement[]
): { newText: string; isModified: boolean; scale: number; spacing: number } {
  let modifiedText = textContent;
  let isModified = false;
  let totalScale = 1;
  let totalSpacing = 0;

  const approvedReplacements = replacements.filter(r => r.approved);

  for (const replacement of approvedReplacements) {
    const regex = new RegExp(`\\b${replacement.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(modifiedText)) {
      modifiedText = modifiedText.replace(regex, replacement.replacement);
      isModified = true;

      const scale = calculateFontScaling(replacement.original, replacement.replacement);
      totalScale *= scale;

      const fontSize = 12;
      const spacing = calculateCharacterSpacing(replacement.original, replacement.replacement, fontSize);
      totalSpacing += spacing;
    }
  }

  return {
    newText: modifiedText,
    isModified,
    scale: totalScale,
    spacing: totalSpacing
  };
}

export function rebuildContentStream(
  originalStream: Uint8Array,
  replacements: WordReplacement[],
  _textItems: TextItemInfo[]
): Uint8Array {
  const textContent = originalStream.toString();
  const { newText: _newText, isModified, scale, spacing } = findAndReplaceInText(textContent, replacements);

  if (!isModified) {
    return originalStream;
  }

  let modifiedStream = textContent;

  if (scale !== 1) {
    modifiedStream = modifiedStream.replace(/(\d+)\s+Tz/, `${Math.round(scale * 100)} Tz`);
  }

  if (spacing !== 0) {
    modifiedStream = modifiedStream.replace(
      /Tc\s+([\d.]+)/g,
      `Tc ${spacing.toFixed(2)}`
    );
  }

  return encodeString(modifiedStream);
}

export function applyTextReplacements(
  operationsList: TextOperation[],
  replacements: WordReplacement[],
  _fontSize: number = 12
): { modified: Uint8Array; operations: TextOperation[] } {
  const modifiedOps = [...operationsList];
  let currentScale = 1;
  let currentSpacing = 0;

  for (let i = 0; i < modifiedOps.length; i++) {
    const op = modifiedOps[i];

    if (op.type === 'text' && op.textContent) {
      const result = findAndReplaceInText(op.textContent, replacements);

      if (result.isModified) {
        op.textContent = result.newText;
        currentScale = result.scale;
        currentSpacing = result.spacing;
      }
    }

    if (op.type === 'font') {
      if (currentScale !== 1) {
        const newOp = { ...op };
        newOp.command = 'Tz';
        newOp.operands = [Math.round(currentScale * 100)];
        modifiedOps.splice(i + 1, 0, newOp);
        i++;
      }
    }

    if (op.type === 'spacing' && currentSpacing !== 0) {
      op.command = 'Tc';
      op.operands = [currentSpacing.toFixed(2)];
    }
  }

  const binaryData: number[] = [];

  for (const op of modifiedOps) {
    const opStr = op.textContent || op.originalBinary.toString();
    const bytes = encodeString(opStr);
    binaryData.push(...bytes);
    binaryData.push(10);
  }

  return {
    modified: new Uint8Array(binaryData),
    operations: modifiedOps
  };
}

export function extractVisibleText(operations: TextOperation[]): string {
  let text = '';

  for (const op of operations) {
    if (op.type === 'text' && op.textContent) {
      text += op.textContent + ' ';
    }
  }

  return text;
}

export function mapOperationsToPositions(
  operations: TextOperation[],
  textItems: TextItemInfo[]
): Map<number, TextLocationMap> {
  const locationMap = new Map<number, TextLocationMap>();
  let textIndex = 0;

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];

    if (op.type === 'text' && textIndex < textItems.length) {
      const item = textItems[textIndex];
      locationMap.set(i, {
        operationIndex: i,
        textLength: op.textContent?.length || 0,
        position: { x: item.x, y: item.y },
        fontSize: item.fontSize
      });
      textIndex++;
    }
  }

  return locationMap;
}
