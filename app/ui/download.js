/**
 * app/ui/download.js — one honest place for "save this text as a file".
 *
 * Browsers, embedded webviews and lockdown policies can all refuse a download.
 * Returning false lets every caller offer a copyable fallback instead of
 * claiming a file was saved when it was not.
 */

export function downloadText({ filename, text, mime = 'application/json' }) {
  try {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    }
  } catch {
    /* fall through to the caller's visible fallback */
  }
  return false;
}
