/**
 * DOCX Renderer Component
 * Displays DOCX files as paginated preview with actual page dimensions, headers, and footers
 */

import React, { useEffect, useRef, useState, memo, useCallback } from 'react';
import { renderAsync } from 'docx-preview';
import {
  type PageSettings,
  extractDocxStructure,
} from '../utils/docxPageSettings';
import {
  generateDocxDebugReport,
  validateDocxStructure,
} from '../utils/docxDebugger';
import { modifyDocxWithReplacements } from '../utils/documentModifier';

interface WordReplacement {
  original: string;
  replacement: string;
  approved: boolean;
  instanceId: string;
}

interface DocxRendererProps {
  docxBytes: Uint8Array;
  fileName: string;
  wordReplacements?: WordReplacement[];
  onReflow?: (newPageCount: number) => void;
  downloadEnabled?: boolean;
}

interface RenderedPage {
  pageNum: number;
  element: HTMLElement;
  settings: PageSettings;
}

type DocxTypographyStyle = {
  fontFamily: string;
  lineHeight: number;
  paragraphSpacingBefore: number;
  paragraphSpacingAfter: number;
};

const FALLBACK_FONT_FAMILY = '"Calibri", "Segoe UI", Arial, sans-serif';

function getLocalName(tagName: string): string {
  return tagName.includes(':') ? tagName.split(':').pop() || tagName : tagName;
}

function parseDocxTypographyStyles(mainDocument: string): DocxTypographyStyle {
  if (!mainDocument) {
    return {
      fontFamily: FALLBACK_FONT_FAMILY,
      lineHeight: 1.45,
      paragraphSpacingBefore: 6,
      paragraphSpacingAfter: 6,
    };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(mainDocument, 'application/xml');
    const fontElements = Array.from(doc.getElementsByTagName('*')).filter(
      (el) => getLocalName(el.tagName) === 'rFonts'
    );

    const fontFamily = fontElements
      .map((el) =>
        el.getAttribute('w:ascii') ||
        el.getAttribute('ascii') ||
        el.getAttribute('w:hAnsi') ||
        el.getAttribute('hAnsi') ||
        el.getAttribute('w:eastAsia') ||
        el.getAttribute('eastAsia')
      )
      .find((value): value is string => Boolean(value));

    const spacingElement = Array.from(doc.getElementsByTagName('*')).find(
      (el) => getLocalName(el.tagName) === 'spacing'
    );

    const lineValue = spacingElement
      ? parseInt(spacingElement.getAttribute('w:line') || spacingElement.getAttribute('line') || '', 10)
      : NaN;
    const lineRule = spacingElement?.getAttribute('w:lineRule') || spacingElement?.getAttribute('lineRule') || 'auto';
    const lineHeight = Number.isFinite(lineValue) && lineValue > 0
      ? (lineRule === 'exact' ? Math.max(1.1, lineValue / 240) : Math.max(1.2, lineValue / 240))
      : 1.45;

    const before = spacingElement
      ? parseInt(spacingElement.getAttribute('w:before') || spacingElement.getAttribute('before') || '', 10)
      : NaN;
    const after = spacingElement
      ? parseInt(spacingElement.getAttribute('w:after') || spacingElement.getAttribute('after') || '', 10)
      : NaN;

    return {
      fontFamily: fontFamily || FALLBACK_FONT_FAMILY,
      lineHeight,
      paragraphSpacingBefore: Number.isFinite(before) ? Math.max(0, Math.round((before * 96) / 1440)) : 6,
      paragraphSpacingAfter: Number.isFinite(after) ? Math.max(0, Math.round((after * 96) / 1440)) : 6,
    };
  } catch {
    return {
      fontFamily: FALLBACK_FONT_FAMILY,
      lineHeight: 1.45,
      paragraphSpacingBefore: 6,
      paragraphSpacingAfter: 6,
    };
  }
}

// Props for the page display component
interface DocxPageDisplayProps {
  currentPage: RenderedPage | null;
  wordReplacements: WordReplacement[];
  highlightWordsPerOccurrence: (container: HTMLElement, wordReplacements: WordReplacement[]) => void;
}

const normalizeColor = (value: string | null): string => value?.replace(/\s+/g, '').toLowerCase() ?? '';

const isBlackColor = (value: string): boolean => {
  return [
    'black',
    '#000',
    '#000000',
    'rgb(0,0,0)',
    'rgba(0,0,0,1)',
    'rgba(0,0,0,0.99)',
    'rgba(0,0,0,0.98)',
  ].includes(value);
};

const removeBlackSvgArtifacts = (root: HTMLElement) => {
  const selectors = [
    'rect',
    'path',
    'ellipse',
    'circle',
    'polygon',
    'polyline',
    'line',
    'foreignObject',
    'svg[style*="background:black"]',
  ];

  root.querySelectorAll(selectors.join(',')).forEach((node) => {
    if (!(node instanceof HTMLElement || node instanceof SVGElement)) {
      return;
    }

    const style = window.getComputedStyle(node as Element);
    const fill = normalizeColor((style as unknown as { fill?: string }).fill || node.getAttribute('fill'));
    const stroke = normalizeColor((style as unknown as { stroke?: string }).stroke || node.getAttribute('stroke'));
    const strokeWidth = parseFloat((style as unknown as { strokeWidth?: string }).strokeWidth || node.getAttribute('stroke-width') || '0');
    const hasNoFill = !fill || fill === 'none';
    const hasNoStroke = !stroke || stroke === 'none' || strokeWidth === 0;

    if (hasNoFill && hasNoStroke) {
      node.remove();
      return;
    }

    const rect = (node as HTMLElement).getBoundingClientRect ? (node as HTMLElement).getBoundingClientRect() : null;
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      node.remove();
      return;
    }

    const isTopLeft = rect.left - root.getBoundingClientRect().left < 120 && rect.top - root.getBoundingClientRect().top < 120;
    if (isTopLeft || rect.width / root.getBoundingClientRect().width > 0.05 || rect.height / root.getBoundingClientRect().height > 0.05) {
      node.remove();
    }
  });
};

const removeDocxFooterArtifacts = (root: HTMLElement) => {
  const foreignObjects = Array.from(root.querySelectorAll<HTMLElement>('foreignObject'));
  foreignObjects.forEach((fo) => {
    const hasBlackRect = !!fo.querySelector('rect[fill="black"], rect[fill="#000"], rect[fill="#000000"], rect[style*="fill:black"], rect[style*="fill:#000"], rect[style*="fill:#000000"]');
    const hasFooter = !!fo.querySelector('.docx_footer, p.docx_footer');
    if (hasBlackRect || hasFooter) {
      fo.remove();
      return;
    }
    const rect = fo.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const isTopLeft = rect.left - rootRect.left < 120 && rect.top - rootRect.top < 120;
    const isLarge = rect.width >= 30 && rect.height >= 30;
    if (isTopLeft && isLarge) {
      fo.remove();
    }
  });
};

const removeDocxHeaderArtifacts = (root: HTMLElement) => {
  const headerArtifacts = Array.from(root.querySelectorAll<HTMLElement>('header, p.docx_header, .docx_header'));
  headerArtifacts.forEach((node) => {
    node.remove();
  });
};

const removeBlackArtifacts = (root: HTMLElement) => {
  const rootRect = root.getBoundingClientRect();
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('*'));

  candidates.forEach((node) => {
    const styleAttr = normalizeColor(node.getAttribute('style'));
    const fillAttr = normalizeColor(node.getAttribute('fill'));
    const strokeAttr = normalizeColor(node.getAttribute('stroke'));
    const bgColor = normalizeColor(window.getComputedStyle(node).backgroundColor);
    const inlineBg = /background(-color)?:.*(black|#000|#000000|rgb\(0,0,0\)|rgba\(0,0,0,1\))/i.test(styleAttr);
    const inlineFill = /fill:.*(black|#000|#000000|rgb\(0,0,0\)|rgba\(0,0,0,1\))/i.test(styleAttr);
    const inlineStroke = /stroke:.*(black|#000|#000000|rgb\(0,0,0\)|rgba\(0,0,0,1\))/i.test(styleAttr);
    const hasBlackFill = isBlackColor(fillAttr) || inlineFill;
    const hasBlackStroke = isBlackColor(strokeAttr) || inlineStroke;
    const hasBlackBackground = isBlackColor(bgColor) || inlineBg;

    if (!hasBlackFill && !hasBlackStroke && !hasBlackBackground) return;

    const rect = node.getBoundingClientRect();
    const area = rect.width * rect.height;
    const rootArea = Math.max(1, rootRect.width * rootRect.height);
    const areaRatio = area / rootArea;
    const isLargeBlock = rect.width >= 30 && rect.height >= 30;
    const isTopLeft = rect.left - rootRect.left < 80 && rect.top - rootRect.top < 80;
    const nodeName = node.tagName.toLowerCase();
    const isSvgShape = ['rect', 'path', 'ellipse', 'circle', 'polygon', 'polyline', 'line', 'g', 'svg'].includes(nodeName);

    if (isLargeBlock && (isTopLeft || areaRatio > 0.01 || isSvgShape)) {
      node.remove();
      return;
    }

    const blackSolid = (hasBlackBackground || hasBlackFill || hasBlackStroke) && areaRatio > 0.005;
    if (blackSolid) {
      node.remove();
    }
  });
};

// Memoized page display component - only updates when currentPage or highlighting changes
const DocxPageDisplay = memo<DocxPageDisplayProps>(({ currentPage, wordReplacements, highlightWordsPerOccurrence }) => {
  const pageContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pageContainerRef.current && currentPage?.element) {
      pageContainerRef.current.innerHTML = '';
      const cloned = currentPage.element.cloneNode(true) as HTMLElement;
      cloned.style.transformOrigin = 'top center';
      cloned.style.width = '100%';
      cloned.style.maxWidth = '100%';

      pageContainerRef.current.appendChild(cloned);
      removeBlackArtifacts(cloned);
      removeBlackSvgArtifacts(cloned);
      removeDocxFooterArtifacts(cloned);
      removeDocxHeaderArtifacts(cloned);

      // Apply highlighting to the cloned page
      const docxSection = cloned.querySelector('section.docx') as HTMLElement | null;
      if (docxSection) {
        highlightWordsPerOccurrence(docxSection, wordReplacements);
      }
    }
  }, [currentPage, wordReplacements, highlightWordsPerOccurrence]);

  return (
    <div
      style={{ width: '100%', maxWidth: '100%', display: 'flex', justifyContent: 'center' }}
      ref={pageContainerRef}
    />
  );
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if currentPage changes or approved replacements change
  if (prevProps.currentPage !== nextProps.currentPage) return false;
  
  const prevApproved = prevProps.wordReplacements.filter(r => r.approved);
  const nextApproved = nextProps.wordReplacements.filter(r => r.approved);
  
  if (prevApproved.length !== nextApproved.length) return false;
  
  return prevApproved.every((item, index) => {
    const nextItem = nextApproved[index];
    return (
      item.original === nextItem.original &&
      item.replacement === nextItem.replacement &&
      item.approved === nextItem.approved &&
      item.instanceId === nextItem.instanceId
    );
  });
});

DocxPageDisplay.displayName = 'DocxPageDisplay';

// Helper function to get only approved replacements
const getApprovedReplacements = (replacements: WordReplacement[]): WordReplacement[] => {
  return replacements.filter(r => r.approved);
};

// Custom comparison function - only re-render if approved replacements change
const areDocxPropsEqual = (prevProps: DocxRendererProps, nextProps: DocxRendererProps): boolean => {
  // Always re-render if docxBytes or fileName changes
  if (prevProps.docxBytes !== nextProps.docxBytes) return false;
  if (prevProps.fileName !== nextProps.fileName) return false;
  if (prevProps.onReflow !== nextProps.onReflow) return false;

  // Only compare approved replacements, not the entire array
  const prevApproved = getApprovedReplacements(prevProps.wordReplacements || []);
  const nextApproved = getApprovedReplacements(nextProps.wordReplacements || []);

  // If lengths are different, they're not equal
  if (prevApproved.length !== nextApproved.length) return false;

  // Compare each approved item
  return prevApproved.every((item, index) => {
    const nextItem = nextApproved[index];
    return (
      item.original === nextItem.original &&
      item.replacement === nextItem.replacement &&
      item.approved === nextItem.approved &&
      item.instanceId === nextItem.instanceId
    );
  });
};

const createDocxPageElement = (
  pageSettings: PageSettings,
  typography: DocxTypographyStyle,
  sectionElement: HTMLElement,
): HTMLElement => {
  const pageElement = document.createElement('div');
  pageElement.className = 'docx-page';
  pageElement.style.width = `min(100%, ${pageSettings.width}px)`;
  pageElement.style.maxWidth = '100%';
  pageElement.style.minHeight = `${pageSettings.height}px`;
  pageElement.style.height = 'auto';
  pageElement.style.padding = '0';
  pageElement.style.boxSizing = 'border-box';
  pageElement.style.backgroundColor = '#ffffff';
  pageElement.style.border = '1px solid #e5e7eb';
  pageElement.style.borderRadius = '10px';
  pageElement.style.boxShadow = '0 16px 40px rgba(15, 23, 42, 0.12)';
  pageElement.style.margin = '0 auto 28px';
  pageElement.style.overflow = 'hidden';
  pageElement.style.position = 'relative';
  pageElement.style.display = 'flex';
  pageElement.style.flexDirection = 'column';

  const pageBody = document.createElement('div');
  pageBody.style.width = '100%';
  pageBody.style.height = 'auto';
  pageBody.style.minHeight = `${pageSettings.height}px`;
  pageBody.style.padding = `${pageSettings.marginTop}px ${pageSettings.marginRight}px ${pageSettings.marginBottom}px ${pageSettings.marginLeft}px`;
  pageBody.style.boxSizing = 'border-box';
  pageBody.style.backgroundColor = '#ffffff';
  pageBody.style.overflow = 'visible';

  const sectionClone = sectionElement.cloneNode(false) as HTMLElement;
  sectionClone.style.width = '100%';
  sectionClone.style.maxWidth = '100%';
  sectionClone.style.minHeight = 'auto';
  sectionClone.style.position = 'relative';
  sectionClone.style.margin = '0';
  sectionClone.style.padding = '0';
  sectionClone.style.boxSizing = 'border-box';
  sectionClone.style.backgroundColor = '#ffffff';
  sectionClone.style.boxShadow = 'none';
  sectionClone.style.color = '#111827';
  sectionClone.style.fontFamily = typography.fontFamily;
  sectionClone.style.lineHeight = `${typography.lineHeight}`;
  sectionClone.style.fontSize = '11pt';
  sectionClone.style.display = 'block';

  pageBody.appendChild(sectionClone);
  pageElement.appendChild(pageBody);

  return pageElement;
};

const DocxRendererContent: React.FC<DocxRendererProps> = ({
  docxBytes,
  fileName,
  wordReplacements = [],
  onReflow,
  downloadEnabled = false,
}) => {
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [activeDocxBytes, setActiveDocxBytes] = useState<Uint8Array>(docxBytes);
  const offscreenContainerRef = useRef<HTMLDivElement | null>(null);

  // Helper: Remove all highlights from a container
  const removeAllHighlights = useCallback((container: HTMLElement) => {
    const highlights = container.querySelectorAll('.bias-word-highlight');
    highlights.forEach((highlight) => {
      const parent = highlight.parentElement;
      if (parent) {
        while (highlight.firstChild) {
          parent.insertBefore(highlight.firstChild, highlight);
        }
        parent.removeChild(highlight);
      }
    });
  }, []);

  // Helper: Highlight per-occurrence bias words based on individual approval state
  const highlightWordsPerOccurrence = useCallback(
    (container: HTMLElement, wordReplacements: WordReplacement[]) => {
      // ALWAYS remove old highlights first, before applying new ones
      removeAllHighlights(container);

      if (wordReplacements.length === 0) {
        return;
      }

      // Separate non-approved originals (bias) and approved replacements
      const originalsToHighlight = new Set(
        wordReplacements
          .filter((r) => !r.approved)
          .map((r) => r.original.toLowerCase()),
      );

      const replacementsToHighlight = new Set(
        wordReplacements
          .filter((r) => r.approved)
          .map((r) => String(r.replacement).toLowerCase()),
      );

      if (originalsToHighlight.size === 0 && replacementsToHighlight.size === 0) {
        return;
      }

      // Build regex for originals and replacements separately so we can style them differently
      const escapeForRegex = (w: string) => w.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
      const originalsPattern = Array.from(originalsToHighlight).map(escapeForRegex).join('|');
      const replacementsPattern = Array.from(replacementsToHighlight).map(escapeForRegex).join('|');
      
      // Traverse all text nodes and highlight matching words
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        null,
      );

      const nodesToProcess: Array<{ node: Text; parent: HTMLElement }> = [];
      let node;
      while ((node = walker.nextNode())) {
        if (node.nodeValue && node.nodeValue.trim()) {
          nodesToProcess.push({ node: node as Text, parent: node.parentElement! });
        }
      }

      // Process each text node
      nodesToProcess.forEach(({ node, parent }) => {
        const textContent = node.nodeValue!;

        // Combine patterns
        const combinedParts: string[] = [];
        if (originalsPattern) combinedParts.push(originalsPattern);
        if (replacementsPattern) combinedParts.push(replacementsPattern);
        if (combinedParts.length === 0) return;

        const combinedPattern = combinedParts.join('|');
        const regex = new RegExp(`\\b(${combinedPattern})\\b`, 'gi');
        let match;
        let hasMatches = false;
        const fragments: Array<Node> = [];
        let lastIndex = 0;

        while ((match = regex.exec(textContent)) !== null) {
          hasMatches = true;

          // Add text before match
          if (match.index > lastIndex) {
            fragments.push(
              document.createTextNode(textContent.substring(lastIndex, match.index)),
            );
          }

          const matchedText = match[0];
          const lower = matchedText.toLowerCase();

          // Determine whether this match is an original bias word or an approved replacement
          const isReplacement = replacementsToHighlight.has(lower);

          // Create highlighted span for the matched word
          const highlight = document.createElement('span');
          highlight.textContent = matchedText;
          highlight.className = 'bias-word-highlight';
          highlight.setAttribute('data-highlight-type', isReplacement ? 'replacement' : 'original');

          if (isReplacement) {
            // Green background for replacements that have been applied
            highlight.style.backgroundColor = '#bbf7d0';
            highlight.style.border = '1px solid #34d399';
            highlight.style.color = '#065f46';
          } else {
            // Red background for detected biased words
            highlight.style.backgroundColor = '#fecaca';
            highlight.style.border = '1px solid #f87171';
            highlight.style.color = '#7f1d1d';
          }

          highlight.style.borderRadius = '3px';
          highlight.style.padding = '2px 4px';
          fragments.push(highlight);

          lastIndex = regex.lastIndex;
        }

        // If we found matches, replace the original node with fragments
        if (hasMatches) {
          // Add any remaining text
          if (lastIndex < textContent.length) {
            fragments.push(
              document.createTextNode(textContent.substring(lastIndex)),
            );
          }

          // Create wrapper and add all fragments
          const wrapper = document.createElement('span');
          fragments.forEach((frag) => wrapper.appendChild(frag));
          parent.replaceChild(wrapper, node);
        }
      });
    },
    [removeAllHighlights]
  );

  // Wrap highlightWordsPerOccurrence in useCallback so it's stable across renders
  // IMPORTANT: Must be before any useEffect hooks to follow Rules of Hooks
  const memoizedHighlight = useCallback(
    (container: HTMLElement, wordReplacements: WordReplacement[]) => {
      highlightWordsPerOccurrence(container, wordReplacements);
    },
    [highlightWordsPerOccurrence]
  );

  useEffect(() => {
    return () => {
      if (offscreenContainerRef.current) {
        document.body.removeChild(offscreenContainerRef.current);
        offscreenContainerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const applyApprovedReplacements = async () => {
      const approvedReplacements = wordReplacements.filter((r) => r.approved);
      if (approvedReplacements.length === 0) {
        setActiveDocxBytes(docxBytes);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const modifiedBytes = await modifyDocxWithReplacements(docxBytes, approvedReplacements);
        setActiveDocxBytes(modifiedBytes);
        setCurrentPageIndex(0);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('❌ DOCX auto-update failed:', err);
        setError(`Failed to update DOCX preview: ${errorMsg}`);
      } finally {
        setLoading(false);
      }
    };

    applyApprovedReplacements();
  }, [wordReplacements, docxBytes]);

  // Extract and render DOCX
  useEffect(() => {
    const renderDocx = async (bytes: Uint8Array) => {
      setLoading(true);
      setError(null);

      try {
        console.log('🔍 Extracting DOCX structure...');
        const structure = await extractDocxStructure(bytes);

        // Generate debug report and log it
        const report = generateDocxDebugReport(structure);
        console.log(report);

        // Validate structure
        const validation = validateDocxStructure(structure);
        if (!validation.isValid) {
          console.error('❌ Validation errors:', validation.errors);
        }
        validation.warnings.forEach((w) => console.warn(`⚠️ ${w}`));

        console.log('📄 Rendering DOCX with docx-preview...');
        const pageSettings = structure.pageSettings;
        const typography = parseDocxTypographyStyles(structure.mainDocument);

        // Create offscreen container attached to the DOM so layout can be measured correctly
        if (offscreenContainerRef.current) {
          document.body.removeChild(offscreenContainerRef.current);
          offscreenContainerRef.current = null;
        }

        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.top = '-9999px';
        container.style.left = '-9999px';
        container.style.width = `${pageSettings.width}px`;
        container.style.minHeight = '1px';
        container.style.padding = '0';
        container.style.boxSizing = 'border-box';
        container.style.background = 'transparent';
        container.style.visibility = 'hidden';
        container.style.pointerEvents = 'none';
        document.body.appendChild(container);
        offscreenContainerRef.current = container;

        try {
          await renderAsync(bytes, container, undefined, {
            ignoreWidth: false,
            ignoreHeight: false,
            renderHeaders: true,
            renderFooters: true,
            ignoreLastRenderedPageBreak: false,
            breakPages: true,
            inWrapper: false,
            useBase64URL: true,
          });
        } finally {
          // Ensure we still compute layout even if renderAsync throws.
        }

        console.log('✅ Document rendered');

        const pageNodes = Array.from(container.querySelectorAll('section.docx')) as HTMLElement[];
        let renderedPages: RenderedPage[] = [];

        if (pageNodes.length > 0) {
          const availableContentHeight = Math.max(
            1,
            pageSettings.height - pageSettings.marginTop - pageSettings.marginBottom - 24,
          );

          const splitPages: RenderedPage[] = [];

          pageNodes.forEach((pageNode) => {
            const pageElement = createDocxPageElement(pageSettings, typography, pageNode);
            const pageSection = pageElement.querySelector('section') as HTMLElement | null;
            if (!pageSection) {
              splitPages.push({ pageNum: splitPages.length + 1, element: pageElement, settings: pageSettings });
              return;
            }

            const sourceChildren = Array.from(pageNode.children);
            if (sourceChildren.length === 0) {
              splitPages.push({ pageNum: splitPages.length + 1, element: pageElement, settings: pageSettings });
              return;
            }

            let currentPageElement = pageElement;
            let currentSection = currentPageElement.querySelector('section') as HTMLElement | null;

            if (!currentSection) {
              splitPages.push({ pageNum: splitPages.length + 1, element: currentPageElement, settings: pageSettings });
              return;
            }

            const pageChildren: HTMLElement[] = [];
            sourceChildren.forEach((child) => {
              const childClone = child.cloneNode(true) as HTMLElement;
              if (!currentSection) {
                return;
              }

              currentSection.appendChild(childClone);
              pageChildren.push(childClone);

              const currentHeight = currentSection.scrollHeight;
              if (currentHeight > availableContentHeight && pageChildren.length > 1) {
                currentSection.removeChild(childClone);
                pageChildren.pop();

                splitPages.push({
                  pageNum: splitPages.length + 1,
                  element: currentPageElement,
                  settings: pageSettings,
                });

                currentPageElement = createDocxPageElement(pageSettings, typography, pageNode);
                currentSection = currentPageElement.querySelector('section') as HTMLElement | null;
                if (!currentSection) {
                  return;
                }
                currentSection.appendChild(childClone);
                pageChildren.length = 0;
                pageChildren.push(childClone);
              }
            });

            if (currentSection && currentSection.children.length > 0) {
              splitPages.push({
                pageNum: splitPages.length + 1,
                element: currentPageElement,
                settings: pageSettings,
              });
            }
          });

          renderedPages = splitPages;
          structure.debugInfo.pagesGenerated = renderedPages.length;
          console.log(`📊 Detected ${renderedPages.length} pages from docx-preview`);
        } else {
          const renderedHtml = container.innerHTML;
          const contentHeight = Math.max(container.scrollHeight, container.getBoundingClientRect().height);
          const availablePageHeight = Math.max(1, pageSettings.height);

          let estimatedPageCount = Math.ceil(contentHeight / availablePageHeight);
          if (estimatedPageCount < 1) {
            estimatedPageCount = 1;
          }
          console.log(`📊 Estimated pages: ${estimatedPageCount}`);
          structure.debugInfo.pagesGenerated = estimatedPageCount;

          for (let i = 0; i < estimatedPageCount; i++) {
            const pageElement = document.createElement('div');
            pageElement.className = 'docx-page';
            pageElement.style.width = '100%';
            pageElement.style.padding = '0';
            pageElement.style.boxSizing = 'border-box';
            pageElement.style.backgroundColor = 'white';
            pageElement.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
            pageElement.style.marginBottom = '20px';
            pageElement.style.overflow = 'hidden';
            pageElement.style.position = 'relative';
            pageElement.style.display = 'flex';
            pageElement.style.flexDirection = 'column';

            const contentElement = document.createElement('div');
            contentElement.className = 'docx-content';
            contentElement.style.position = 'absolute';
            contentElement.style.top = `-${i * pageSettings.height}px`;
            contentElement.style.left = '0';
            contentElement.style.width = '100%';
            contentElement.style.minHeight = '100%';
            contentElement.style.padding = '0';
            contentElement.style.margin = '0';
            contentElement.style.boxSizing = 'border-box';
            contentElement.style.overflow = 'hidden';
            contentElement.innerHTML = renderedHtml;
            pageElement.appendChild(contentElement);

            renderedPages.push({
              pageNum: i + 1,
              element: pageElement,
              settings: pageSettings,
            });
          }
        }

        if (offscreenContainerRef.current) {
          document.body.removeChild(offscreenContainerRef.current);
          offscreenContainerRef.current = null;
        }

        setPages(renderedPages);
        setCurrentPageIndex(0);
        onReflow?.(renderedPages.length);
        console.log(`✅ Created ${renderedPages.length} pages`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('❌ Error rendering DOCX:', err);
        setError(`Failed to render document: ${errorMsg}`);
      } finally {
        if (offscreenContainerRef.current) {
          if (document.body.contains(offscreenContainerRef.current)) {
            document.body.removeChild(offscreenContainerRef.current);
          }
          offscreenContainerRef.current = null;
        }
        setLoading(false);
      }
    };

    renderDocx(activeDocxBytes);
  }, [activeDocxBytes, onReflow]);

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4" />
        <p className="text-gray-600">Rendering DOCX preview...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-red-50 p-4">
        <div className="text-center">
          <p className="text-red-700 font-semibold mb-2">❌ Rendering Error</p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-gray-50">
        <p className="text-gray-600">No pages to display</p>
      </div>
    );
  }

  const currentPage = pages[currentPageIndex];

  return (
    <div className="h-full flex flex-col docx-viewer">
      {/* Main Content Area - Only the page display will re-render on highlighting changes */}
      <div className="flex-1 overflow-auto p-0">
        {currentPage && (
          <DocxPageDisplay
            currentPage={currentPage}
            wordReplacements={wordReplacements}
            highlightWordsPerOccurrence={memoizedHighlight}
          />
        )}
      </div>

      {/* Navigation Controls - Static, never re-renders */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentPageIndex(Math.max(0, currentPageIndex - 1))}
            disabled={currentPageIndex === 0}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600"
          >
            ← Prev
          </button>
          <button
            onClick={() => setCurrentPageIndex(Math.min(pages.length - 1, currentPageIndex + 1))}
            disabled={currentPageIndex === pages.length - 1}
            className="px-3 py-1 bg-blue-500 text-white rounded disabled:bg-gray-300 hover:bg-blue-600"
          >
            Next →
          </button>
        </div>

        <div className="text-sm text-gray-600">
          Page {currentPage.pageNum} of {pages.length}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              if (!downloadEnabled) return;
              const bytes = (typeof activeDocxBytes !== 'undefined' && activeDocxBytes) ? activeDocxBytes : docxBytes;
              if (!bytes) return;
              const arrayBuffer = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
              const blob = new Blob([arrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              const downloadName = fileName.includes('.') ? fileName.replace(/\.[^.]+$/, `_modified.docx`) : `${fileName}_modified.docx`;
              link.download = downloadName;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(link.href);
            }}
            disabled={!downloadEnabled}
            className={`px-3 py-1 ${downloadEnabled ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-gray-200 text-gray-500 cursor-not-allowed'} rounded`}
          >
            📥 {downloadEnabled ? 'Download' : 'Save to enable'}
          </button>
        </div>
      </div>

      {/* Replacements Applied Badge - Static, only shows/hides based on approval count */}
      {wordReplacements.filter((r) => r.approved).length > 0 && (
        <div className="bg-green-50 border-t border-green-200 px-4 py-2 text-xs text-green-900">
          ✅ {wordReplacements.filter((r) => r.approved).length} gender-fair replacements applied to this document
        </div>
      )}

    </div>
  );
};

// Memoize with custom comparison - only re-render if approved replacements change
const DocxRenderer = memo(DocxRendererContent, areDocxPropsEqual);

export default DocxRenderer;
