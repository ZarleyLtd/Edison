var EdisonCard = (function () {
  'use strict';

  function href(repo, number) {
    return 'ticket.html?repo=' + encodeURIComponent(repo) + '&n=' + encodeURIComponent(number);
  }

  function stageOfIssue(issue) {
    return issue.state === 'closed' ? 'done' : EdisonLabels.stageOf(issue.labels);
  }

  function appName(issue, apps) {
    if (EdisonLabels.isNewApp(issue.labels)) return 'New app';
    var repo = EdisonFormat.repoFromUrl(issue.repository_url);
    var app = apps && EdisonApps.byRepo(apps, repo);
    return (app && app.name) || repo;
  }

  function metaLine(issue, apps, includePriority) {
    var type = EdisonLabels.TYPE_LABEL[EdisonLabels.typeOf(issue.labels)] || 'Note';
    var priority = EdisonLabels.priorityOf(issue.labels);
    var bits = [appName(issue, apps), type];
    if (includePriority !== false && priority) bits.push(priority.toUpperCase());
    var ago = EdisonFormat.timeAgo(issue.updated_at);
    if (ago) bits.push(ago);
    return bits.join(' · ');
  }

  function isCurrent(repo, number) {
    var params = new URLSearchParams(location.search);
    return params.get('repo') === repo && params.get('n') === String(number);
  }

  function excerpt(body) {
    var text = String(body || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[#*_>`]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return '';
    if (text.length > 160) return text.slice(0, 157).trim() + '\u2026';
    return text;
  }

  function row(issue, apps) {
    var stage = stageOfIssue(issue);
    var repo = EdisonFormat.repoFromUrl(issue.repository_url);
    var priority = EdisonLabels.priorityOf(issue.labels);
    var current = isCurrent(repo, issue.number) ? ' aria-current="page"' : '';
    var pri = priority
      ? '<span class="pri ' + EdisonFormat.escapeHtml(priority) + '">' + EdisonFormat.escapeHtml(priority.toUpperCase()) + '</span>'
      : '<span class="pri"></span>';
    return '<a class="row-link' + (stage === 'done' ? ' done' : '') + '" data-repo="' + EdisonFormat.escapeHtml(repo) + '" data-number="' + issue.number + '" href="' + href(repo, issue.number) + '"' + current + '>' +
      EdisonFormat.bulb(stage) +
      '<span class="row-title">' + EdisonFormat.escapeHtml(issue.title) + '</span>' + pri +
      '<span class="meta">' + EdisonFormat.escapeHtml(metaLine(issue, apps, false)) + '</span></a>';
  }

  function attention(issue, apps, kind, extraHtml) {
    var stage = stageOfIssue(issue);
    var repo = EdisonFormat.repoFromUrl(issue.repository_url);
    var current = isCurrent(repo, issue.number) ? ' aria-current="page"' : '';
    return '<a class="attention ' + kind + '" data-repo="' + EdisonFormat.escapeHtml(repo) + '" data-number="' + issue.number + '" href="' + href(repo, issue.number) + '"' + current + '>' +
      '<div class="attention-head">' + EdisonFormat.bulb(stage) + '<h2>' + EdisonFormat.escapeHtml(issue.title) + '</h2></div>' +
      (extraHtml || '') +
      '<p class="meta">' + EdisonFormat.escapeHtml(metaLine(issue, apps, true)) + '</p></a>';
  }

  return {
    href: href,
    excerpt: excerpt,
    row: row,
    attention: attention
  };
})();
