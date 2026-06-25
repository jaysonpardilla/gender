/**
 * DOCX Content Converter
 * Converts DOCX XML elements (from headers, footers, body) to HTML for rendering
 */

/**
 * Simple XML to HTML converter for DOCX content
 * Handles basic Word elements: paragraphs, runs, text, images, tables
 */
export function convertDocxXmlToHtml(xmlString: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');

    if (doc.documentElement.nodeName === 'parsererror') {
      console.warn('⚠️ Failed to parse XML for conversion');
      return '<p>Unable to render content</p>';
    }

    const html = convertElement(doc.documentElement);
    return html || '<p>No content</p>';
  } catch (error) {
    console.error('❌ Error converting XML to HTML:', error);
    return '<p>Error rendering content</p>';
  }
}

/**
 * Recursively convert XML element to HTML
 */
function convertElement(element: Element): string {
  const tagName = element.tagName.toLowerCase();

  // Word namespace elements
  if (tagName.includes('hdr') || tagName.includes('ftr')) {
    // Header/footer container
    return convertChildren(element);
  }

  if (tagName.includes('p')) {
    // Paragraph
    const pContent = convertChildren(element);
    return `<p style="margin: 0 0 12px 0; line-height: 1.5;">${pContent}</p>`;
  }

  if (tagName.includes('r')) {
    // Run (text with formatting)
    return convertChildren(element);
  }

  if (tagName.includes('t')) {
    // Text
    const text = element.textContent || '';
    return escapeHtml(text);
  }

  if (tagName.includes('rpr')) {
    // Run properties - skip but process children
    return '';
  }

  if (tagName.includes('ppr')) {
    // Paragraph properties - skip but process children
    return '';
  }

  if (tagName.includes('b')) {
    // Bold
    const content = convertChildren(element);
    return `<strong>${content}</strong>`;
  }

  if (tagName.includes('i')) {
    // Italic
    const content = convertChildren(element);
    return `<em>${content}</em>`;
  }

  if (tagName.includes('u')) {
    // Underline
    const content = convertChildren(element);
    return `<u>${content}</u>`;
  }

  if (tagName.includes('tbl')) {
    // Table
    const rows = element.querySelectorAll('[id*="tr"], tr');
    let tableHtml = '<table style="width:100%; border-collapse:collapse; margin:12px 0;">';

    rows.forEach((row) => {
      const cells = row.querySelectorAll('[id*="tc"], [id*="td"], td');
      let rowHtml = '<tr>';

      cells.forEach((cell) => {
        const cellContent = convertChildren(cell);
        rowHtml += `<td style="border: 1px solid #ccc; padding: 8px;">${cellContent}</td>`;
      });

      rowHtml += '</tr>';
      tableHtml += rowHtml;
    });

    tableHtml += '</table>';
    return tableHtml;
  }

  if (tagName.includes('br')) {
    // Line break
    return '<br />';
  }

  if (tagName.includes('pict') || tagName.includes('drawing') || tagName.includes('blip')) {
    // Image - create placeholder
    return '<div style="background:#f0f0f0; width:100%; height:100px; display:flex; align-items:center; justify-content:center; border:1px dashed #ccc; margin:8px 0;">📷 Image</div>';
  }

  // Default: process children
  return convertChildren(element);
}

/**
 * Convert all child elements
 */
function convertChildren(element: Element): string {
  let html = '';

  for (const child of element.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      html += convertElement(child as Element);
    } else if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || '';
      if (text.trim()) {
        html += escapeHtml(text);
      }
    }
  }

  return html;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

/**
 * Extract page numbers from footer XML
 */
export function extractPageNumberField(xmlString: string): string {
  // Word stores page numbers as fields
  if (xmlString.includes('PAGE')) {
    return 'page-number';
  }
  if (xmlString.includes('NUMPAGES')) {
    return 'total-pages';
  }
  return '';
}

/**
 * Get display string for page number
 */
export function getPageNumberDisplay(fieldType: string, pageNum: number, totalPages: number): string {
  switch (fieldType) {
    case 'page-number':
      return String(pageNum);
    case 'total-pages':
      return String(totalPages);
    case 'page-of-total':
      return `${pageNum} of ${totalPages}`;
    default:
      return `Page ${pageNum}`;
  }
}
