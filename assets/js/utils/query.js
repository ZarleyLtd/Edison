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

  var MARKER_RE = /<!--\s*edison-deploy(?:\s+pr:(\d+))?(?:\s+sha:([0-9a-fA-F]+))?\s*-->/;

  function deployMarker(pr, sha) {
    var text = '<!-- edison-deploy';
    if (pr) text += ' pr:' + pr;
    if (sha) text += ' sha:' + sha;
    return text + ' -->';
  }

  function parseDeployMarker(text) {
    var match = String(text || '').match(MARKER_RE);
    if (!match) return null;
    return { pr: match[1] ? Number(match[1]) : null, sha: match[2] || '' };
  }

  function noteText(text) {
    return String(text || '').replace(/<!--\s*edison-deploy(?:\s+pr:\d+)?(?:\s+sha:[0-9a-fA-F]+)?\s*-->/g, '').trim();
  }

  function latestDeploy(comments) {
    var list = comments || [];
    for (var i = list.length - 1; i >= 0; i--) {
      var parsed = parseDeployMarker(list[i] && list[i].body);
      if (!parsed) continue;
      return { index: i, pr: parsed.pr, sha: parsed.sha };
    }
    return null;
  }

  function notesSinceDeploy(comments) {
    var list = comments || [];
    var latest = latestDeploy(list);
    var start = latest ? latest.index + 1 : 0;
    var notes = [];
    for (var i = start; i < list.length; i++) {
      var comment = list[i] || {};
      if (comment.user && comment.user.type === 'Bot') continue;
      var text = noteText(comment.body);
      if (!text) continue;
      if (/^@(cursor|claude)\b/.test(text)) continue;
      notes.push(text);
    }
    return notes;
  }

  function pendingNotes(comments, draft) {
    var notes = notesSinceDeploy(comments);
    var extra = String(draft || '').trim();
    if (extra) notes.push(extra);
    return notes;
  }

  function isAgentComment(comment) {
    var user = comment && comment.user || {};
    if (user.type === 'Bot') return true;
    return /\[bot\]$/i.test(user.login || '');
  }

  function withAgentUpdates(issueComments, prComments) {
    var base = (issueComments || []).slice();
    var latest = latestDeploy(base);
    var marker = latest ? base[latest.index] : null;
    var since = marker && marker.created_at ? Date.parse(marker.created_at) : NaN;
    var seen = {};
    base.forEach(function (comment) {
      var text = noteText(comment && comment.body);
      if (text) seen[text] = true;
    });
    (prComments || []).forEach(function (comment) {
      if (!isAgentComment(comment)) return;
      var text = noteText(comment && comment.body);
      if (!text || seen[text]) return;
      if (isNaN(since)) return;
      var when = Date.parse(comment && comment.created_at || '');
      if (isNaN(when) || when < since) return;
      seen[text] = true;
      base.push(comment);
    });
    base.sort(function (a, b) {
      return (Date.parse(a && a.created_at || '') || 0) - (Date.parse(b && b.created_at || '') || 0);
    });
    return base;
  }

  function openPullsByAge(pulls) {
    return (pulls || []).filter(function (pr) {
      return pr && pr.state === 'open';
    }).sort(function (a, b) {
      var aTime = Date.parse(a.created_at || '') || 0;
      var bTime = Date.parse(b.created_at || '') || 0;
      if (aTime !== bTime) return aTime - bTime;
      return (Number(a.number) || 0) - (Number(b.number) || 0);
    });
  }

  function oldestOpenPull(pulls) {
    return openPullsByAge(pulls)[0] || null;
  }

  function roundLanded(comments, headSha) {
    var latest = latestDeploy(comments);
    if (!latest || !latest.sha) return true;
    if (!headSha) return false;
    return String(latest.sha) !== String(headSha);
  }

  function followUpComment(opts) {
    opts = opts || {};
    var notes = opts.notes || [];
    var lines = [
      opts.mention || '@cursor',
      '',
      'Continue from the commits already on branch `' + (opts.branch || '') + '` of pull request #' + opts.pr + '.',
      'Do not open another pull request.',
      'Act on every note below, oldest first.',
      '',
      'Edison ticket: ' + (opts.title || ''),
      'Repository: ' + (opts.owner || 'ZarleyLtd') + '/' + (opts.repo || ''),
      'Issue: #' + opts.issue,
      '',
      'Notes since the last round:'
    ];
    notes.forEach(function (note, index) {
      lines.push('');
      lines.push((index + 1) + '. ' + note);
    });
    lines.push('');
    lines.push('Comment a short summary of what you changed and how to review it.');
    lines.push('When this round is on the pull request, add the label stage:review and remove stage:working, including when no code change was needed.');
    lines.push('If you are blocked or need a decision, comment the question and add the label stage:needs-input (and remove stage:working).');
    return lines.join('\n');
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
    deployMarker: deployMarker,
    parseDeployMarker: parseDeployMarker,
    noteText: noteText,
    latestDeploy: latestDeploy,
    notesSinceDeploy: notesSinceDeploy,
    pendingNotes: pendingNotes,
    isAgentComment: isAgentComment,
    withAgentUpdates: withAgentUpdates,
    openPullsByAge: openPullsByAge,
    oldestOpenPull: oldestOpenPull,
    roundLanded: roundLanded,
    followUpComment: followUpComment,
    insertApp: insertApp
  };
});
