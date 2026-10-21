(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EdisonFormat = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var BULB =
    '<svg class="bulb-svg" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 3a8 8 0 0 0-4.6 14.5c.4.4.6.9.6 1.4V21a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.1c0-.5.2-1 .6-1.4A8 8 0 0 0 16 3zm-2.2 20.2h4.4V25a2.2 2.2 0 0 1-4.4 0v-1.8z"/></svg>';

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function bulb(stage, size) {
    var classes = 'bulb-icon stage-' + escapeHtml(stage || 'inbox');
    if (size) classes += ' ' + escapeHtml(size);
    return '<span class="' + classes + '">' + BULB + '</span>';
  }

  function timeAgo(iso) {
    if (!iso) return '';
    var then = new Date(iso).getTime();
    if (isNaN(then)) return '';
    var seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    var steps = [
      [60, 'just now', 1],
      [3600, 'm', 60],
      [86400, 'h', 3600],
      [604800, 'd', 86400],
      [Infinity, 'w', 604800]
    ];
    if (seconds < 60) return 'just now';
    for (var i = 1; i < steps.length; i++) {
      if (seconds < steps[i][0]) {
        return Math.floor(seconds / steps[i][2]) + steps[i][1] + ' ago';
      }
    }
    return '';
  }

  function repoFromUrl(repositoryUrl) {
    var parts = String(repositoryUrl || '').split('/');
    return parts[parts.length - 1] || '';
  }

  function inlineMarkdown(part) {
    var html = escapeHtml(part);
    html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, '<img alt="$1" src="$2" />');
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    html = html.replace(/(^|[^"'>\]])\b(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\n/g, '<br />');
    return html;
  }

  function renderMarkdown(markdown) {
    var text = String(markdown || '');
    var blocks = text.split('```');
    return blocks
      .map(function (part, index) {
        if (index % 2 === 1) {
          var code = part.replace(/^[^\n]*\n/, '');
          return '<pre><code>' + escapeHtml(code) + '</code></pre>';
        }
        return inlineMarkdown(part);
      })
      .join('');
  }

  function toBase64Text(text) {
    return btoa(unescape(encodeURIComponent(String(text))));
  }

  return {
    escapeHtml: escapeHtml,
    bulb: bulb,
    timeAgo: timeAgo,
    repoFromUrl: repoFromUrl,
    renderMarkdown: renderMarkdown,
    toBase64Text: toBase64Text
  };
});
