/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * DOCX Page Settings Extractor
 * Extracts actual page dimensions, margins, headers, footers, and section settings
 * directly from the DOCX XML structure (without commercial libraries).
 */

import JSZip from 'jszip';

// Type definitions
export type PageSettings = {
  width: number;
  height: number;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  headerDistance: number;
  footerDistance: number;
  orientation: 'portrait' | 'landscape';
  paperSize: string;
};

export type SectionInfo = {
  index: number;
  pageSettings: PageSettings;
  headerRelIds: string[];
  footerRelIds: string[];
};

export type DebugInfo = {
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
};

export type DocxStructure = {
  pageSettings: PageSettings;
  sections: SectionInfo[];
  headers: Record<string, string>;
  footers: Record<string, string>;
  mainDocument: string;
  debugInfo: DebugInfo;
};

// Constants
const TWIP_TO_PX = 96 / 1440; // 1 twip = 1/1440 inch, and 1 inch = 96px at 96 DPI
function twipsToPixels(twips: number): number {
  return Math.round(twips * TWIP_TO_PX);
}

function detectPaperSize(width: number, height: number): string {
  const w = Math.round(width);
  const h = Math.round(height);

  if ((w >= 780 && w <= 810) && (h >= 1110 && h <= 1150)) return 'A4';
  if ((w >= 800 && w <= 830) && (h >= 1040 && h <= 1080)) return 'Letter';
  if ((w >= 800 && w <= 830) && (h >= 1320 && h <= 1360)) return 'Legal';
  if ((w >= 1040 && w <= 1080) && (h >= 1380 && h <= 1420)) return 'Tabloid';

  return 'Custom';
}

function extractPageSettingsFromSection(sectPrElement: Element): Partial<PageSettings> {
  const settings: Partial<PageSettings> = {};

  const pgSz = sectPrElement.querySelector('[name="pgSz"], pgSz');
  if (pgSz) {
    const width = pgSz.getAttribute('w:w') || pgSz.getAttribute('w');
    const height = pgSz.getAttribute('w:h') || pgSz.getAttribute('h');
    const orient = pgSz.getAttribute('w:orient') || pgSz.getAttribute('orient');

    if (width) settings.width = twipsToPixels(parseInt(width, 10));
    if (height) settings.height = twipsToPixels(parseInt(height, 10));
    if (orient) settings.orientation = orient === 'landscape' ? 'landscape' : 'portrait';
  }

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

function getDefaultPageSettings(): PageSettings {
  return {
    width: twipsToPixels(11906),
    height: twipsToPixels(16838),
    marginTop: twipsToPixels(1440),
    marginBottom: twipsToPixels(1440),
    marginLeft: twipsToPixels(1440),
    marginRight: twipsToPixels(1440),
    headerDistance: twipsToPixels(720),
    footerDistance: twipsToPixels(720),
    orientation: 'portrait',
    paperSize: 'A4',
  };
}

function extractSections(documentXml: string): SectionInfo[] {
  const sections: SectionInfo[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(documentXml, 'application/xml');

  if (doc.documentElement.nodeName === 'parsererror') {
    console.warn('⚠️ Failed to parse document.xml');
    return sections;
  }

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
      paperSize: detectPaperSize(
        settings.width ?? defaults.width,
        settings.height ?? defaults.height
      ),
    };

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

async function extractHeadersAndFooters(
  zip: JSZip,
  relationships: Map<string, string>
): Promise<{ headers: Record<string, string>; footers: Record<string, string> }> {
  const headers: Record<string, string> = {};
  const footers: Record<string, string> = {};

  try {
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

async function extractRelationships(zip: JSZip): Promise<Map<string, string>> {
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

export async function extractDocxStructure(docxBytes: Uint8Array): Promise<DocxStructure> {
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

    const zip = new JSZip();
    await zip.loadAsync(docxBytes);
    console.log('✅ DOCX loaded as ZIP');

    const documentXml = await zip.file('word/document.xml')?.async('string');
    if (!documentXml) {
      throw new Error('Missing word/document.xml');
    }
    console.log('✅ document.xml extracted');

    const relationships = await extractRelationships(zip);
    console.log(`✅ Relationships extracted: ${relationships.size} found`);

    const sections = extractSections(documentXml);
    debugInfo.sectionsFound = sections.length;
    console.log(`✅ Sections extracted: ${sections.length} found`);

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

    const { headers, footers } = await extractHeadersAndFooters(zip, relationships);
    debugInfo.headersFound = Object.keys(headers).length;
    debugInfo.footersFound = Object.keys(footers).length;
    console.log(`✅ Headers found: ${Object.keys(headers).length}`);
    console.log(`✅ Footers found: ${Object.keys(footers).length}`);

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
