(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EdisonQuery = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function buildIssueQuery(opts) {
    opts = opts || {};
    var owner = opts.owner || 'ZarleyLtd';
    var edisonRepo = opts.edisonRepo || 'Edison';
    var parts = ['is:issue'];
    if (opts.isNew) {
      parts.push('repo:' + owner + '/' + edisonRepo);
      parts.push('label:app:new');
    } else if (opts.appRepo) {
      parts.push('repo:' + owner + '/' + opts.appRepo);
      parts.push('label:edison');
    } else {
      parts.push('user:' + owner);
      parts.push('label:edison');
    }
    if (opts.type) parts.push('label:"type:' + opts.type + '"');
    if (opts.stage) parts.push('label:"stage:' + opts.stage + '"');
    if (opts.priority) parts.push('label:' + opts.priority);
    if (opts.state === 'open') parts.push('is:open');
    if (opts.state === 'closed') parts.push('is:closed');
    if (opts.text && String(opts.text).trim()) {
      parts.push(String(opts.text).trim().replace(/\s+/g, ' '));
    }
    return parts.join(' ');
  }

  function buildPrQuery(owner, repo, number) {
    return 'repo:' + owner + '/' + repo + ' is:pr #' + number;
  }

  function mentionsIssue(text, number) {
    var re = new RegExp('(^|\\D)#' + String(number) + '(\\D|$)');
    return re.test(String(text || ''));
  }

  function suggestRepoName(title) {
    var words = String(title || '')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return words
      .map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join('')
      .slice(0, 80);
  }

  function validRepoName(name) {
    return /^[A-Za-z0-9_.-]{1,100}$/.test(String(name || ''));
  }

  function previewPageUrl(owner, repo, sha, page) {
    var path = String(page || 'index.html').replace(/^\/+/, '');
    var encoded = path.split('/').filter(Boolean).map(function (part) {
      return encodeURIComponent(part);
    }).join('/');
    var raw = 'https://raw.githubusercontent.com/' +
      encodeURIComponent(owner) + '/' +
      encodeURIComponent(repo) + '/' +
      encodeURIComponent(sha) + '/' +
      encoded;
    return 'https://htmlpreview.github.io/?' + raw;
  }

  function previewPages(files) {
    var html = [];
    var list = Array.isArray(files) ? files : [];
    list.forEach(function (file) {
      var name = typeof file === 'string' ? file : (file && file.filename) || '';
      var status = typeof file === 'string' ? '' : (file && file.status) || '';
      if (status === 'removed' || status === 'deleted') return;
      if (!/\.html?$/i.test(name)) return;
      if (html.indexOf(name) === -1) html.push(name);
    });
    if (!html.length) return ['index.html'];
    html.sort(function (a, b) {
      var aHome = /(^|\/)index\.html?$/i.test(a);
      var bHome = /(^|\/)index\.html?$/i.test(b);
      if (aHome && !bHome) return -1;
      if (bHome && !aHome) return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    return html.slice(0, 4);
  }

  function insertApp(apps, app) {
    var rest = (apps || []).filter(function (item) {
      return !item.isNew && item.repo !== app.repo;
    });
    rest.push(app);
    rest.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name));
    });
    var fresh = (apps || []).filter(function (item) {
      return item.isNew;
    });
    if (!fresh.length) fresh = [{ name: 'New app', repo: null, pagesUrl: '', localPath: '', isNew: true }];
    return fresh.concat(rest);
  }

  return {
    buildIssueQuery: buildIssueQuery,
    buildPrQuery: buildPrQuery,
    mentionsIssue: mentionsIssue,
    previewPageUrl: previewPageUrl,
    previewPages: previewPages,
    suggestRepoName: suggestRepoName,
    validRepoName: validRepoName,
    insertApp: insertApp
  };
});
