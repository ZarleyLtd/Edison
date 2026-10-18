var EdisonTicket = (function () {
  'use strict';

  var generation = 0;

  function mount(el, repo, number) {
    var token = ++generation;
    el.innerHTML = '<p class="muted">Opening the ticket…</p>';
    return Promise.all([
      EdisonApi.issue(repo, number),
      EdisonApi.comments(repo, number),
      EdisonApi.searchPulls(repo, number),
      EdisonApps.load()
    ]).then(function (parts) {
      if (token !== generation) return;
      return paint(el, repo, parts[0], parts[1], parts[2], parts[3]);
    }).catch(function (error) {
      if (token !== generation) return;
      el.innerHTML = '<p class="banner">' + EdisonFormat.escapeHtml(error.message) + '</p>';
    });
  }

  function stageName(issue) {
    return issue.state === 'closed' ? 'done' : EdisonLabels.stageOf(issue.labels);
  }

  function paint(el, repo, issue, comments, pulls, apps) {
    var stage = stageName(issue);
    var isNew = EdisonLabels.isNewApp(issue.labels);
    var app = EdisonApps.byRepo(apps, repo);
    var appLabel = isNew ? 'New app' : (app && app.name) || repo;
    var openPulls = (pulls || []).filter(function (pr) {
      return pr.state === 'open';
    });
    if (stage === 'working' && openPulls.length) {
      return EdisonApi.updateIssue(repo, issue.number, {
        labels: EdisonLabels.replaceStage(issue.labels, 'review')
      }).then(function () {
        return mount(el, repo, issue.number);
      });
    }

    var type = EdisonLabels.typeOf(issue.labels);
    var priority = EdisonLabels.priorityOf(issue.labels) || 'p2';
    var html = '<article class="ticket">';
    html += '<p class="meta"><a href="index.html?repo=' + encodeURIComponent(repo) + '&n=' + issue.number + '">Tickets</a></p>';
    html += '<h1>' + EdisonFormat.bulb(stage) + ' ' + EdisonFormat.escapeHtml(issue.title) + '</h1>';
    html += '<p class="status-line"><span class="status-badge lg stage-' + EdisonFormat.escapeHtml(stage) + '">' + EdisonFormat.escapeHtml(EdisonLabels.STAGE_LABEL[stage] || stage) + '</span></p>';
    html += '<p class="meta">' + EdisonFormat.escapeHtml(appLabel);
    html += ' · <a href="' + EdisonFormat.escapeHtml(issue.html_url) + '" target="_blank" rel="noopener noreferrer">#' + issue.number + ' on GitHub</a></p>';
    if (app && app.pagesUrl) {
      html += '<p class="meta"><a href="' + EdisonFormat.escapeHtml(app.pagesUrl) + '" target="_blank" rel="noopener noreferrer">Live site</a></p>';
    }
    html += '<div class="prose">' + EdisonFormat.renderMarkdown(issue.body || '') + '</div>';
    html += '<div class="actions">';
    if (issue.state === 'open' && !isNew && (stage === 'ready' || stage === 'needs-input')) {
      html += '<button type="button" class="primary" data-action="send">Switch on</button>';
    } else if (issue.state === 'open' && !isNew && stage !== 'ready') {
      html += '<button type="button" data-action="ready">Mark ready</button>';
    }
    if (issue.state === 'open' && isNew) {
      html += '<button type="button" class="primary" data-action="show-promote">Create repo</button>';
    }
    html += issue.state === 'closed'
      ? '<button type="button" data-action="reopen">Reopen</button>'
      : '<button type="button" data-action="close">Close</button>';
    html += '</div>';

    if (isNew && issue.state === 'open') {
      html += '<form id="promote-form" class="stack" hidden>';
      html += '<h2>Create the app</h2>';
      html += '<p class="hint">This creates a public GitHub repository, files the first build ticket there, and closes this idea. On this PC you then clone it into C:\\CursorSites. A phone cannot create that folder itself.</p>';
      html += '<label class="field">Repository name<input name="repoName" required value="' + EdisonFormat.escapeHtml(EdisonQuery.suggestRepoName(issue.title)) + '" /></label>';
      html += '<button type="submit" class="primary">Create ZarleyLtd repository</button>';
      html += '<p id="promote-result" class="hint"></p>';
      html += '</form>';
    }

    html += '<h2>Stage and labels</h2><div class="row" data-stages>';
    EdisonLabels.STAGES.forEach(function (name) {
      html += '<button type="button" data-stage="' + name + '"' + (stage === name ? ' aria-pressed="true"' : '') + '>' + EdisonFormat.escapeHtml(EdisonLabels.STAGE_LABEL[name]) + '</button>';
    });
    html += '</div><div class="row">';
    html += '<label class="field">Type<select data-type>';
    EdisonLabels.TYPES.forEach(function (name) {
      html += '<option value="' + name + '"' + (type === name ? ' selected' : '') + '>' + EdisonFormat.escapeHtml(EdisonLabels.TYPE_LABEL[name]) + '</option>';
    });
    html += '</select></label><label class="field">Priority<select data-priority>';
    EdisonLabels.PRIORITIES.forEach(function (name) {
      html += '<option value="' + name + '"' + (priority === name ? ' selected' : '') + '>' + name + '</option>';
    });
    html += '</select></label></div>';

    html += '<h2>Review</h2>';
    if (!pulls.length) html += '<p class="muted">No pull request yet.</p>';
    pulls.forEach(function (pr, index) {
      html += '<div class="pr"><div><a href="' + EdisonFormat.escapeHtml(pr.html_url) + '" target="_blank" rel="noopener noreferrer">' + EdisonFormat.escapeHtml(pr.title) + '</a>';
      html += '<div class="checks" data-checks="' + index + '">' + EdisonFormat.escapeHtml(pr.state) + '</div></div></div>';
    });

    html += '<h2>Notes</h2><ol class="comments">';
    if (!comments.length) html += '<li class="muted">No notes yet.</li>';
    comments.forEach(function (comment) {
      html += '<li><p class="meta">' + EdisonFormat.escapeHtml(comment.user && comment.user.login) + ' · ' + EdisonFormat.escapeHtml(EdisonFormat.timeAgo(comment.created_at)) + '</p>';
      html += '<div class="prose">' + EdisonFormat.renderMarkdown(comment.body || '') + '</div></li>';
    });
    html += '</ol><form id="note-form" class="stack"><label class="field">Add a note<textarea name="note" required></textarea></label><button type="submit">Add note</button></form>';
    html += '</article>';
    el.innerHTML = html;

    el.querySelectorAll('[data-stage]').forEach(function (button) {
      button.addEventListener('click', function () {
        setStage(el, repo, issue, button.getAttribute('data-stage'), button);
      });
    });
    el.querySelector('[data-type]').addEventListener('change', function (event) {
      updateLabels(el, repo, issue, EdisonLabels.replaceType(issue.labels, event.target.value));
    });
    el.querySelector('[data-priority]').addEventListener('change', function (event) {
      updateLabels(el, repo, issue, EdisonLabels.replacePriority(issue.labels, event.target.value));
    });
    var send = el.querySelector('[data-action="send"]');
    if (send) send.addEventListener('click', function () { switchOn(el, repo, issue, send); });
    var ready = el.querySelector('[data-action="ready"]');
    if (ready) ready.addEventListener('click', function () { setStage(el, repo, issue, 'ready', ready); });
    var close = el.querySelector('[data-action="close"]');
    if (close) close.addEventListener('click', function () { setState(el, repo, issue, 'closed'); });
    var reopen = el.querySelector('[data-action="reopen"]');
    if (reopen) reopen.addEventListener('click', function () { setState(el, repo, issue, 'open'); });
    var showPromote = el.querySelector('[data-action="show-promote"]');
    if (showPromote) {
      showPromote.addEventListener('click', function () {
        el.querySelector('#promote-form').hidden = false;
        el.querySelector('[name="repoName"]').focus();
      });
    }
    var promote = el.querySelector('#promote-form');
    if (promote) {
      promote.addEventListener('submit', function (event) {
        event.preventDefault();
        createRepo(el, repo, issue, new FormData(promote).get('repoName'), promote.querySelector('button'));
      });
    }
    el.querySelector('#note-form').addEventListener('submit', function (event) {
      event.preventDefault();
      var form = event.target;
      var note = new FormData(form).get('note');
      var button = form.querySelector('button');
      button.disabled = true;
      EdisonApi.createComment(repo, issue.number, note).then(function () {
        BriefMessage.show('Note added', button);
        mount(el, repo, issue.number);
      }).catch(function (error) {
        button.disabled = false;
        BriefMessage.show(error.message, button, { durationMs: 2500, multiline: true });
      });
    });

    pulls.forEach(function (pr, index) {
      EdisonApi.request('/repos/' + EDISON_CONFIG.OWNER + '/' + encodeURIComponent(repo) + '/pulls/' + pr.number).then(function (full) {
        var sha = full.head && full.head.sha;
        if (!sha) return null;
        return EdisonApi.checkRuns(repo, sha);
      }).then(function (result) {
        if (!result) return;
        var slot = el.querySelector('[data-checks="' + index + '"]');
        if (!slot) return;
        var runs = (result && result.check_runs) || [];
        if (!runs.length) {
          slot.textContent = pr.state + ' · no checks yet';
          return;
        }
        var failed = runs.filter(function (run) { return run.conclusion === 'failure'; }).length;
        slot.textContent = pr.state + ' · ' + runs.length + ' check' + (runs.length === 1 ? '' : 's') + (failed ? ' · ' + failed + ' failed' : '');
      }).catch(function () {
        /* checks are optional on the ticket */
      });
    });
  }

  function updateLabels(el, repo, issue, labels) {
    return EdisonApi.updateIssue(repo, issue.number, { labels: labels }).then(function () {
      return mount(el, repo, issue.number);
    }).catch(function (error) {
      el.insertAdjacentHTML('afterbegin', '<p class="banner">' + EdisonFormat.escapeHtml(error.message) + '</p>');
    });
  }

  function setStage(el, repo, issue, stage, button) {
    if (button) button.disabled = true;
    return updateLabels(el, repo, issue, EdisonLabels.replaceStage(issue.labels, stage));
  }

  function setState(el, repo, issue, state) {
    EdisonApi.updateIssue(repo, issue.number, { state: state }).then(function () {
      mount(el, repo, issue.number);
    }).catch(function (error) {
      el.insertAdjacentHTML('afterbegin', '<p class="banner">' + EdisonFormat.escapeHtml(error.message) + '</p>');
    });
  }

  function switchOn(el, repo, issue, button) {
    button.disabled = true;
    EdisonAgents.current().then(function (agent) {
      return EdisonApi.createComment(repo, issue.number, EdisonAgents.commentBody(agent, repo, issue)).then(function () {
        return EdisonApi.updateIssue(repo, issue.number, {
          labels: EdisonLabels.replaceStage(issue.labels, 'working')
        });
      }).then(function () {
        BriefMessage.show('Switched on', button);
        return mount(el, repo, issue.number);
      });
    }).catch(function (error) {
      button.disabled = false;
      BriefMessage.show(error.message, button, { durationMs: 2800, multiline: true });
    });
  }

  function createRepo(el, ideaRepo, issue, rawName, button) {
    var name = String(rawName || '').trim();
    if (!EdisonQuery.validRepoName(name) || name.toLowerCase() === 'edison') {
      BriefMessage.show('Use letters, numbers, dots, underscores, or hyphens.', button, { durationMs: 2500, multiline: true });
      return;
    }
    button.disabled = true;
    var result = el.querySelector('#promote-result');
    result.textContent = 'Creating the repository…';
    var createdIssue = null;
    EdisonApi.createRepo(name, 'Created from Edison idea #' + issue.number)
      .then(function () {
        result.textContent = 'Writing the starter README…';
        var readme = '# ' + name + '\n\nThis app was created from an Edison idea: ' + issue.html_url + '\n\nThe first ticket for an agent is in this repository.\n';
        return EdisonApi.putText(name, 'README.md', 'Start ' + name + ' from Edison', readme);
      })
      .then(function () {
        result.textContent = 'Adding Edison labels…';
        return EdisonApi.ensureLabels(name);
      })
      .then(function () {
        return EdisonApps.load();
      })
      .then(function (apps) {
        result.textContent = 'Adding it to Edison…';
        var next = EdisonQuery.insertApp(apps, {
          name: name,
          repo: name,
          pagesUrl: 'https://zarleyltd.github.io/' + name + '/',
          localPath: EDISON_CONFIG.LOCAL_ROOT + '/' + name
        });
        return EdisonApps.save(next);
      })
      .then(function () {
        result.textContent = 'Opening the first ticket…';
        return EdisonApi.createIssue(name, {
          title: 'Scaffold the app from Edison idea #' + issue.number,
          body: 'Build the first version of this app from the Edison idea.\n\n' + issue.html_url + '\n\n' + (issue.body || ''),
          labels: ['edison', 'type:feature', 'stage:ready', 'p2']
        });
      })
      .then(function (scaffold) {
        createdIssue = scaffold;
        return EdisonApi.createComment(ideaRepo, issue.number, 'Repository created: https://github.com/' + EDISON_CONFIG.OWNER + '/' + name + '\n\nFirst ticket: ' + scaffold.html_url + '\n\nOn the PC that holds the other apps, clone it with:\n\n```\ngit clone https://github.com/' + EDISON_CONFIG.OWNER + '/' + name + '.git C:\\CursorSites\\' + name + '\n```');
      })
      .then(function () {
        return EdisonApi.updateIssue(ideaRepo, issue.number, { state: 'closed' });
      })
      .then(function () {
        var clone = 'git clone https://github.com/' + EDISON_CONFIG.OWNER + '/' + name + '.git C:\\CursorSites\\' + name;
        result.innerHTML = 'Repository ready. <a href="' + EdisonFormat.escapeHtml(createdIssue.html_url) + '">Open the first ticket</a>. On this PC run <code>' + EdisonFormat.escapeHtml(clone) + '</code>.';
        BriefMessage.show('Repository created', button);
      })
      .catch(function (error) {
        button.disabled = false;
        result.textContent = error.message;
      });
  }

  return { mount: mount };
})();
