/**
 * DOCX Debugging & Logging Utility
 * Provides detailed logging and diagnostics for DOCX rendering
 */

import { type DocxStructure } from './docxPageSettings';

export interface RenderingDebugLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  category: string;
  message: string;
  details?: Record<string, unknown>;
}

class DocxDebugLogger {
  private logs: RenderingDebugLog[] = [];
  private enableConsole = true;

  log(
    level: 'info' | 'warn' | 'error' | 'success',
    category: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    const logEntry: RenderingDebugLog = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details,
    };

    this.logs.push(logEntry);

    if (this.enableConsole) {
      const emoji = {
        info: '📄',
        warn: '⚠️',
        error: '❌',
        success: '✅',
      }[level];

      console.log(`${emoji} [${category}] ${message}`, details || '');
    }
  }

  getLogs(): RenderingDebugLog[] {
    return this.logs;
  }

  getReport(): string {
    return this.logs
      .map(
        (log) =>
          `[${log.timestamp}] ${log.level.toUpperCase()} (${log.category}): ${log.message}${
            log.details ? '\n  ' + JSON.stringify(log.details, null, 2) : ''
          }`
      )
      .join('\n');
  }

  clear() {
    this.logs = [];
  }
}

export const docxDebugLogger = new DocxDebugLogger();

/**
 * Generate a detailed debug report for DOCX structure
 */
export function generateDocxDebugReport(structure: DocxStructure): string {
  const { pageSettings, sections, headers, footers, debugInfo } = structure;

  let report = `
╔══════════════════════════════════════════════════════════════╗
║           DOCX STRUCTURE DEBUG REPORT                         ║
╚══════════════════════════════════════════════════════════════╝

📄 DOCUMENT PROPERTIES
─────────────────────────────────────────────────────────────
  Page Size:         ${debugInfo.pageSize}
  Page Dimensions:   ${debugInfo.pageWidth} × ${debugInfo.pageHeight}
  Orientation:       ${pageSettings.orientation}
  
📐 PAGE MARGINS (in pixels)
─────────────────────────────────────────────────────────────
  Top:               ${debugInfo.margins.top}
  Bottom:            ${debugInfo.margins.bottom}
  Left:              ${debugInfo.margins.left}
  Right:             ${debugInfo.margins.right}
  Header Distance:   ${pageSettings.headerDistance}px
  Footer Distance:   ${pageSettings.footerDistance}px

📑 DOCUMENT STRUCTURE
─────────────────────────────────────────────────────────────
  Sections:          ${debugInfo.sectionsFound}
  Headers:           ${debugInfo.headersFound}
  Footers:           ${debugInfo.footersFound}
  Pages Generated:   ${debugInfo.pagesGenerated || 'N/A'}

📋 SECTION DETAILS
─────────────────────────────────────────────────────────────
`;

  sections.forEach((section, idx) => {
    report += `
  Section ${idx + 1}:
    - Page Size:     ${section.pageSettings.width}px × ${section.pageSettings.height}px
    - Orientation:   ${section.pageSettings.orientation}
    - Headers:       ${section.headerRelIds.length > 0 ? section.headerRelIds.join(', ') : 'None'}
    - Footers:       ${section.footerRelIds.length > 0 ? section.footerRelIds.join(', ') : 'None'}
`;
  });

  if (Object.keys(headers).length > 0) {
    report += `
📝 HEADERS FOUND
─────────────────────────────────────────────────────────────
`;
    Object.entries(headers).forEach(([relId, content]) => {
      const preview = content.substring(0, 100).replace(/\n/g, ' ');
      report += `  [${relId}]: ${preview}${content.length > 100 ? '...' : ''}\n`;
    });
  }

  if (Object.keys(footers).length > 0) {
    report += `
📝 FOOTERS FOUND
─────────────────────────────────────────────────────────────
`;
    Object.entries(footers).forEach(([relId, content]) => {
      const preview = content.substring(0, 100).replace(/\n/g, ' ');
      report += `  [${relId}]: ${preview}${content.length > 100 ? '...' : ''}\n`;
    });
  }

  report += `
═══════════════════════════════════════════════════════════════

💡 VALIDATION CHECKLIST
─────────────────────────────────────────────────────────────
  ✓ Page dimensions extracted: ${debugInfo.pageWidth !== 'Detecting...' ? 'YES' : 'NO'}
  ✓ Margins detected: ${Object.values(debugInfo.margins).every((m) => m !== '') ? 'YES' : 'NO'}
  ✓ Sections found: ${debugInfo.sectionsFound > 0 ? 'YES' : 'NO'}
  ✓ Headers present: ${debugInfo.headersFound > 0 ? 'YES' : 'NO'}
  ✓ Footers present: ${debugInfo.footersFound > 0 ? 'YES' : 'NO'}
  ✓ Page count calculated: ${debugInfo.pagesGenerated ? 'YES' : 'NO'}

═══════════════════════════════════════════════════════════════
`;

  return report;
}

/**
 * Validate DOCX structure for proper rendering
 */
export function validateDocxStructure(structure: DocxStructure): {
  isValid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  const { pageSettings, sections, debugInfo } = structure;

  // Check page settings
  if (pageSettings.width <= 0 || pageSettings.height <= 0) {
    errors.push('Invalid page dimensions');
  }

  if (pageSettings.width < 100 || pageSettings.height < 100) {
    warnings.push('Page dimensions seem unusually small');
  }

  // Check margins
  if (pageSettings.marginTop < 0 || pageSettings.marginBottom < 0) {
    warnings.push('Top or bottom margin is negative');
  }

  if (
    pageSettings.marginTop + pageSettings.marginBottom >= pageSettings.height
  ) {
    warnings.push('Top and bottom margins exceed page height');
  }

  // Check sections
  if (sections.length === 0) {
    warnings.push('No sections found - using defaults');
  }

  // Check headers/footers
  if (sections.some((s) => s.headerRelIds.length > 0) && debugInfo.headersFound === 0) {
    warnings.push('Sections reference headers but none were found');
  }

  if (sections.some((s) => s.footerRelIds.length > 0) && debugInfo.footersFound === 0) {
    warnings.push('Sections reference footers but none were found');
  }

  // Check page count
  if (!debugInfo.pagesGenerated || debugInfo.pagesGenerated < 1) {
    warnings.push('Page count not calculated');
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Get friendly paper size name
 */
export function getPaperSizeName(
  width: number,
  height: number
): { name: string; width: string; height: string } {
  const sizes: Array<{
    name: string;
    width: number;
    height: number;
    tolerance: number;
  }> = [
    { name: 'A4', width: 595, height: 842, tolerance: 10 },
    { name: 'Letter', width: 612, height: 792, tolerance: 10 },
    { name: 'Legal', width: 612, height: 1008, tolerance: 10 },
    { name: 'Tabloid', width: 792, height: 1224, tolerance: 10 },
    { name: 'A3', width: 842, height: 1191, tolerance: 10 },
    { name: 'A5', width: 420, height: 595, tolerance: 10 },
    { name: 'B4', width: 708, height: 1001, tolerance: 10 },
    { name: 'B5', width: 499, height: 708, tolerance: 10 },
  ];

  for (const size of sizes) {
    if (
      Math.abs(width - size.width) <= size.tolerance &&
      Math.abs(height - size.height) <= size.tolerance
    ) {
      return {
        name: size.name,
        width: `${(size.width / 72).toFixed(2)}" / ${Math.round((size.width / 72) * 2.54)}mm`,
        height: `${(size.height / 72).toFixed(2)}" / ${Math.round((size.height / 72) * 2.54)}mm`,
      };
    }
  }

  // Custom size
  return {
    name: 'Custom',
    width: `${(width / 72).toFixed(2)}" / ${Math.round((width / 72) * 2.54)}mm`,
    height: `${(height / 72).toFixed(2)}" / ${Math.round((height / 72) * 2.54)}mm`,
  };
}
