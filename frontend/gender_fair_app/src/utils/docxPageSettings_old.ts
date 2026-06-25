/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * DOCX Page Settings Extractor
 * Extracts actual page dimensions, margins, headers, footers, and section settings
 * directly from the DOCX XML structure (without commercial libraries).
 */

import JSZip from 'jszip';

export interface PageSettings {
  width: number; // in pixels (converted from twips)
  height: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  headerDistance: number;
  footerDistance: number;
  orientation: 'portrait' | 'landscape';
  paperSize: string;
}

export interface SectionInfo {
  index: number;
  pageSettings: PageSettings;
  headerRelIds: string[];
  footerRelIds: string[];
}

export interface DebugInfo {
  pageSize: string;
  pageWidth: string;
  pageHeight: string;
  margins: {
    top: string;
    bottom: string;
    left: string;
    right: string;
  };
  sectionsFound: number;
  headersFound: number;
  footersFound: number;
  pagesGenerated?: number;
}

export interface DocxStructure {
  pageSettings: PageSettings;
  sections: SectionInfo[];
  headers: Record<string, string>; // rel ID -> HTML content
  footers: Record<string, string>;
  mainDocument: string; // HTML-converted document.xml
  debugInfo: DebugInfo;
}

const TWIP_TO_PX = 1.5; // 1 twip = 1.5 pixels (approximate for 96 DPI)
const A4_WIDTH = 8.27 * 72; // inches to points
const A4_HEIGHT = 11.7 * 72;
const LETTER_WIDTH = 8.5 * 72;
const LETTER_HEIGHT = 11 * 72;
const LEGAL_WIDTH = 8.5 * 72;
const LEGAL_HEIGHT = 14 * 72;

/**
 * Converts twips (twentieth of a point) to pixels
 */
function twipsToPixels(twips: number): number {
  return Math.round(twips * TWIP_TO_PX);
}

/**
 * Detects paper size name based on dimensions
 */
function detectPaperSize(
  width: number,
  height: number
): string {
  const w = Math.round(width);
  const h = Math.round(height);

  // A4: 595 × 842 pixels (210mm × 297mm)
  if ((w >= 590 && w <= 600) && (h >= 835 && h <= 850)) return 'A4';

  // Letter: 612 × 792 pixels (8.5" × 11")
  if ((w >= 600 && w <= 620) && (h >= 780 && h <= 800)) return 'Letter';

  // Legal: 612 × 1008 pixels (8.5" × 14")
  if ((w >= 600 && w <= 620) && (h >= 1000 && h <= 1020)) return 'Legal';

  // Tabloid: 792 × 1224 pixels (11" × 17")
  if ((w >= 780 && w <= 800) && (h >= 1210 && h <= 1240)) return 'Tabloid';

  return 'Custom';
}

/**
 * Extracts page settings from section properties XML element
 */
function extractPageSettingsFromSection(
  sectPrElement: Element
): Partial<PageSettings> {
  const settings: Partial<PageSettings> = {};

  // Extract page size (w:pgSz)
  const pgSz = sectPrElement.querySelector('[name="pgSz"], pgSz');
  if (pgSz) {
    const width = pgSz.getAttribute('w:w') || pgSz.getAttribute('w');
    const height = pgSz.getAttribute('w:h') || pgSz.getAttribute('h');
    const orient = pgSz.getAttribute('w:orient') || pgSz.getAttribute('orient');

    if (width) settings.width = twipsToPixels(parseInt(width, 10));
    if (height) settings.height = twipsToPixels(parseInt(height, 10));
    if (orient) settings.orientation = orient === 'landscape' ? 'landscape' : 'portrait';
  }

  // Extract margins (w:pgMar)
  const pgMar = sectPrElement.querySelector('[name="pgMar"], pgMar');
  if (pgMar) {
    const top = pgMar.getAttribute('w:top') || pgMar.getAttribute('top');
    const bottom = pgMar.getAttribute('w:bottom') || pgMar.getAttribute('bottom');
    const left = pgMar.getAttribute('w:left') || pgMar.getAttribute('left');
    const right = pgMar.getAttribute('w:right') || pgMar.getAttribute('right');
    const header = pgMar.getAttribute('w:header') || pgMar.getAttribute('header');
    const footer = pgMar.getAttribute('w:footer') || pgMar.getAttribute('footer');

    if (top) settings.marginTop = twipsToPixels(parseInt(top, 10));
    if (bottom) settings.marginBottom = twipsToPixels(parseInt(bottom, 10));
    if (left) settings.marginLeft = twipsToPixels(parseInt(left, 10));
    if (right) settings.marginRight = twipsToPixels(parseInt(right, 10));
    if (header) settings.headerDistance = twipsToPixels(parseInt(header, 10));
    if (footer) settings.footerDistance = twipsToPixels(parseInt(footer, 10));
  }

  return settings;
}

/**
 * Gets default page settings (A4 if not specified)
 */
function getDefaultPageSettings(): PageSettings {
  const width = twipsToPixels(11906); // A4 width in twips
  const height = twipsToPixels(16838); // A4 height in twips

  return {
    width,
    height,
    marginTop: twipsToPixels(1440), // 1 inch
    marginBottom: twipsToPixels(1440),
    marginLeft: twipsToPixels(1440),
    marginRight: twipsToPixels(1440),
    headerDistance: twipsToPixels(720), // 0.5 inch
    footerDistance: twipsToPixels(720),
    orientation: 'portrait',
    paperSize: detectPaperSize(width, height),
  };
}

/**
 * Extracts all section information from document
 */
function extractSections(
  documentXml: string
): SectionInfo[] {
  const sections: SectionInfo[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(documentXml, 'application/xml');

  if (doc.documentElement.nodeName === 'parsererror') {
    console.warn('⚠️ Failed to parse document.xml');
    return sections;
  }

  // Find all sectPr (section properties) elements
  const sectPrElements = doc.querySelectorAll('sectPr');
  
  sectPrElements.forEach((sectPr, index) => {
    const settings = extractPageSettingsFromSection(sectPr);
    const defaults = getDefaultPageSettings();

    const sectionSettings: PageSettings = {
      width: settings.width ?? defaults.width,
      height: settings.height ?? defaults.height,
      marginTop: settings.marginTop ?? defaults.marginTop,
      marginBottom: settings.marginBottom ?? defaults.marginBottom,
      marginLeft: settings.marginLeft ?? defaults.marginLeft,
      marginRight: settings.marginRight ?? defaults.marginRight,
      headerDistance: settings.headerDistance ?? defaults.headerDistance,
      footerDistance: settings.footerDistance ?? defaults.footerDistance,
      orientation: settings.orientation ?? defaults.orientation,
      paperSize: ''
    };

    // Extract header/footer relationships
    const headerRelIds: string[] = [];
    const footerRelIds: string[] = [];

    const headerRefElements = sectPr.querySelectorAll('headerReference');
    headerRefElements.forEach((ref) => {
      const relId = ref.getAttribute('r:id') || ref.getAttribute('id');
      if (relId) headerRelIds.push(relId);
    });

    const footerRefElements = sectPr.querySelectorAll('footerReference');
    footerRefElements.forEach((ref) => {
      const relId = ref.getAttribute('r:id') || ref.getAttribute('id');
      if (relId) footerRelIds.push(relId);
    });

    sections.push({
      index,
      pageSettings: sectionSettings,
      headerRelIds,
      footerRelIds,
    });
  });

  return sections.length > 0 ? sections : [{ index: 0, pageSettings: getDefaultPageSettings(), headerRelIds: [], footerRelIds: [] }];
}

/**
 * Extracts header and footer files from DOCX
 */
async function extractHeadersAndFooters(
  zip: JSZip,
  relationships: Map<string, string>
): Promise<{ headers: Record<string, string>; footers: Record<string, string> }> {
  const headers: Record<string, string> = {};
  const footers: Record<string, string> = {};

  try {
    // Process each relationship
    for (const [relId, filePath] of relationships) {
      if (filePath.includes('header')) {
        try {
          const content = await zip.file(filePath)?.async('string');
          if (content) {
            headers[relId] = content;
          }
        } catch (e) {
          console.warn(`⚠️ Failed to extract header: ${filePath}`);
        }
      } else if (filePath.includes('footer')) {
        try {
          const content = await zip.file(filePath)?.async('string');
          if (content) {
            footers[relId] = content;
          }
        } catch (e) {
          console.warn(`⚠️ Failed to extract footer: ${filePath}`);
        }
      }
    }
  } catch (e) {
    console.warn('⚠️ Error extracting headers/footers:', e);
  }

  return { headers, footers };
}

/**
 * Extracts relationships from document.xml.rels
 */
async function extractRelationships(
  zip: JSZip
): Promise<Map<string, string>> {
  const rels = new Map<string, string>();

  try {
    const relsContent = await zip.file('word/_rels/document.xml.rels')?.async('string');
    if (!relsContent) return rels;

    const parser = new DOMParser();
    const doc = parser.parseFromString(relsContent, 'application/xml');

    if (doc.documentElement.nodeName === 'parsererror') {
      console.warn('⚠️ Failed to parse document.xml.rels');
      return rels;
    }

    const relationships = doc.querySelectorAll('Relationship');
    relationships.forEach((rel) => {
      const id = rel.getAttribute('Id');
      const target = rel.getAttribute('Target');
      if (id && target) {
        // Resolve relative paths
        const fullPath = target.startsWith('../')
          ? `word/${target.substring(3)}`
          : `word/${target}`;
        rels.set(id, fullPath);
      }
    });
  } catch (e) {
    console.warn('⚠️ Error extracting relationships:', e);
  }

  return rels;
}

/**
 * Main function: Extracts all DOCX structure information
 */
export async function extractDocxStructure(
  docxBytes: Uint8Array
): Promise<DocxStructure> {
  const debugInfo: DebugInfo = {
    pageSize: 'Detecting...',
    pageWidth: 'Detecting...',
    pageHeight: 'Detecting...',
    margins: { top: '', bottom: '', left: '', right: '' },
    sectionsFound: 0,
    headersFound: 0,
    footersFound: 0,
  };

  try {
    console.log('📦 Extracting DOCX structure...');

    // Load DOCX as ZIP
    const zip = new JSZip();
    await zip.loadAsync(docxBytes);
    console.log('✅ DOCX loaded as ZIP');

    // Extract document.xml
    const documentXml = await zip.file('word/document.xml')?.async('string');
    if (!documentXml) {
      throw new Error('Missing word/document.xml');
    }
    console.log('✅ document.xml extracted');

    // Extract relationships
    const relationships = await extractRelationships(zip);
    console.log(`✅ Relationships extracted: ${relationships.size} found`);

    // Extract sections
    const sections = extractSections(documentXml);
    debugInfo.sectionsFound = sections.length;
    console.log(`✅ Sections extracted: ${sections.length} found`);

    // Get main page settings from first section
    const pageSettings = sections[0]?.pageSettings || getDefaultPageSettings();
    debugInfo.pageSize = detectPaperSize(pageSettings.width, pageSettings.height);
    debugInfo.pageWidth = `${Math.round(pageSettings.width)}px`;
    debugInfo.pageHeight = `${Math.round(pageSettings.height)}px`;
    debugInfo.margins = {
      top: `${Math.round(pageSettings.marginTop)}px`,
      bottom: `${Math.round(pageSettings.marginBottom)}px`,
      left: `${Math.round(pageSettings.marginLeft)}px`,
      right: `${Math.round(pageSettings.marginRight)}px`,
    };

    // Extract headers and footers
    const { headers, footers } = await extractHeadersAndFooters(zip, relationships);
    debugInfo.headersFound = Object.keys(headers).length;
    debugInfo.footersFound = Object.keys(footers).length;
    console.log(`✅ Headers found: ${headers.size}`);
    console.log(`✅ Footers found: ${footers.size}`);

    console.log('📊 Debug Info:');
    console.log(`   Page Size: ${debugInfo.pageSize}`);
    console.log(`   Width: ${debugInfo.pageWidth}`);
    console.log(`   Height: ${debugInfo.pageHeight}`);
    console.log(`   Margins: T=${debugInfo.margins.top}, B=${debugInfo.margins.bottom}, L=${debugInfo.margins.left}, R=${debugInfo.margins.right}`);
    console.log(`   Sections Found: ${debugInfo.sectionsFound}`);
    console.log(`   Headers Found: ${debugInfo.headersFound}`);
    console.log(`   Footers Found: ${debugInfo.footersFound}`);

    return {
      pageSettings,
      sections,
      headers,
      footers,
      mainDocument: documentXml,
      debugInfo,
    };
  } catch (error) {
    console.error('❌ Error extracting DOCX structure:', error);
    const defaults = getDefaultPageSettings();
    debugInfo.pageSize = 'A4 (error, using default)';
    debugInfo.pageWidth = `${Math.round(defaults.width)}px`;
    debugInfo.pageHeight = `${Math.round(defaults.height)}px`;
    return {
      pageSettings: defaults,
      sections: [{ index: 0, pageSettings: defaults, headerRelIds: [], footerRelIds: [] }],
      headers: {},
      footers: {},
      mainDocument: '',
      debugInfo,
    };
  }
}

// Explicit exports to ensure Vite recognizes them
