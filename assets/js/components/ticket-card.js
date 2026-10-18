var EdisonCard = (function () {
  'use strict';

  function href(repo, number) {
    return 'ticket.html?repo=' + encodeURIComponent(repo) + '&n=' + encodeURIComponent(number);
  }

  function render(issue, repoName) {
    var labels = issue.labels || [];
    var stage = issue.state === 'closed' ? 'done' : EdisonLabels.stageOf(labels);
    var type = EdisonLabels.TYPE_LABEL[EdisonLabels.typeOf(labels)] || 'Note';
    var priority = EdisonLabels.priorityOf(labels);
    var bits = [repoName || EdisonFormat.repoFromUrl(issue.repository_url), type];
    if (EdisonLabels.isNewApp(labels)) bits[0] = 'New app';
    if (priority) bits.push(priority);
    bits.push(EdisonFormat.timeAgo(issue.updated_at));
    var repo = EdisonFormat.repoFromUrl(issue.repository_url);
    var status = EdisonLabels.STAGE_LABEL[stage] || stage;
    return (
      '<a class="card" data-repo="' + EdisonFormat.escapeHtml(repo) + '" data-number="' + issue.number + '" href="' + href(repo, issue.number) + '">' +
      EdisonFormat.bulb(stage) +
      '<span class="card-main"><span class="status-badge stage-' + EdisonFormat.escapeHtml(stage) + '">' + EdisonFormat.escapeHtml(status) + '</span>' +
      '<h2>' + EdisonFormat.escapeHtml(issue.title) + '</h2>' +
      '<p class="meta">' + EdisonFormat.escapeHtml(bits.filter(Boolean).join(' · ')) + '</p></span></a>'
    );
  }

  return { render: render, href: href };
})();
