/**
 * Markdown rendering helper.
 *
 * Renders Markdown to HTML with `marked` and sanitizes the result with
 * `DOMPurify` before it's handed to React's dangerouslySetInnerHTML. Posts are
 * authored only by admins/managers, but sanitizing is cheap defense-in-depth
 * (and protects against a compromised admin account or pasted content).
 *
 * Used by the public BlogPost page and the admin editor's live preview, so the
 * output is identical in both places.
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// GitHub-ish defaults: convert single line breaks to <br>, autolink URLs.
marked.setOptions({
  breaks: true,
  gfm: true,
});

/**
 * Render a Markdown string to a sanitized HTML string.
 * @param {string} md
 * @returns {string} HTML safe to inject.
 */
export function renderMarkdown(md) {
  if (!md) return '';
  const rawHtml = marked.parse(String(md));
  return DOMPurify.sanitize(rawHtml, { USE_PROFILES: { html: true } });
}
