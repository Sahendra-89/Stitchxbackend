/**
 * Server-side HTML Sanitizer for user-provided markup (e.g., Blog Posts)
 * Strips executable scripts, event handlers, iframe/object injections, and dangerous protocols.
 */

// Tags allowed in rich article / blog content
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
  'ul', 'ol', 'li',
  'blockquote', 'q', 'cite',
  'pre', 'code', 'kbd', 'samp',
  'a', 'img',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'div', 'span', 'section', 'article', 'sub', 'sup'
]);

// Attributes allowed on specific tags
const ALLOWED_ATTRIBUTES = {
  a: new Set(['href', 'title', 'target', 'rel']),
  img: new Set(['src', 'alt', 'title', 'width', 'height', 'loading']),
  th: new Set(['colspan', 'rowspan', 'scope', 'align']),
  td: new Set(['colspan', 'rowspan', 'align']),
  code: new Set(['class']),
  pre: new Set(['class']),
  div: new Set(['class']),
  span: new Set(['class']),
};

// Safe protocols for links and images
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Sanitizes an HTML string, removing any unsafe tags, attributes, event handlers, and URLs.
 */
export function sanitizeHtml(rawHtml) {
  if (!rawHtml || typeof rawHtml !== 'string') return '';

  let sanitized = rawHtml;

  // 1. Remove dangerous blocks completely (script, iframe, object, embed, style, applet, meta, link, form)
  sanitized = sanitized.replace(/<\s*(script|iframe|object|embed|style|applet|meta|link|form|svg)[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  sanitized = sanitized.replace(/<\s*(script|iframe|object|embed|style|applet|meta|link|form|svg)[^>]*\/?>/gi, '');

  // 2. Strip all inline event handlers (e.g. onerror=, onclick=, onload=, onmouseover=)
  sanitized = sanitized.replace(/\s+on[a-zA-Z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

  // 3. Disarm dangerous protocol references in href and src
  sanitized = sanitized.replace(/(href|src)\s*=\s*['"]\s*(javascript|vbscript|data):[\s\S]*?['"]/gi, '$1="#"');
  sanitized = sanitized.replace(/(href|src)\s*=\s*(javascript|vbscript|data):[^\s>]*/gi, '$1="#"');

  // 4. Clean tag names and attributes
  sanitized = sanitized.replace(/<\s*([a-zA-Z0-9]+)([^>]*)>/g, (match, tagName, attrs) => {
    const lowerTag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(lowerTag)) {
      return ''; // Strip non-allowed tag
    }

    const allowedForTag = ALLOWED_ATTRIBUTES[lowerTag] || new Set();

    // Parse attributes
    const cleanAttrs = [];
    const attrRegex = /([a-zA-Z0-9_-]+)(?:\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s>]+)))?/g;
    let attrMatch;

    while ((attrMatch = attrRegex.exec(attrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrVal = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';

      // Skip event handlers or style
      if (attrName.startsWith('on') || attrName === 'style') continue;

      if (allowedForTag.has(attrName)) {
        // Extra validation for href and src
        if (attrName === 'href' || attrName === 'src') {
          const trimmedVal = attrVal.trim().toLowerCase();
          if (trimmedVal.startsWith('javascript:') || trimmedVal.startsWith('vbscript:') || trimmedVal.startsWith('data:text/html')) {
            continue;
          }
        }

        // Enforce rel="noopener noreferrer" for external target="_blank"
        if (lowerTag === 'a' && attrName === 'target' && attrVal === '_blank') {
          cleanAttrs.push('target="_blank" rel="noopener noreferrer"');
          continue;
        }

        cleanAttrs.push(`${attrName}="${attrVal.replace(/"/g, '&quot;')}"`);
      }
    }

    return `<${lowerTag}${cleanAttrs.length ? ' ' + cleanAttrs.join(' ') : ''}>`;
  });

  // 5. Clean closing tags
  sanitized = sanitized.replace(/<\s*\/\s*([a-zA-Z0-9]+)\s*>/g, (match, tagName) => {
    const lowerTag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(lowerTag)) return '';
    return `</${lowerTag}>`;
  });

  return sanitized;
}

export default sanitizeHtml;
