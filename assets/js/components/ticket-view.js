var EdisonTicket = (function () {
  'use strict';

  var generation = 0;
  var active = null;
  var readyRepos = {};

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !active || active.token !== generation) return;
    if (!active.session.sheet && !active.session.confirmClose) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    active.session.sheet = null;
    active.session.confirmClose = false;
    active.draw();
  });

  function esc(value) {
    return EdisonFormat.escapeHtml(value);
  }

  function sheetRoot() {
    var root = document.getElementById('ticket-sheets');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ticket-sheets';
      document.body.appendChild(root);
    }
    return root;
  }

  function clearSheet() {
    var root = document.getElementById('ticket-sheets');
    if (root) root.innerHTML = '';
    document.body.classList.remove('ticket-sheet');
  }

  function externalLink(href, label) {
    return '<a class="external" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' +
      esc(label) + '<span class="external-mark" aria-hidden="true">\u2197</span><span class="sr">, opens outside Edison</span></a>';
  }

  function stageName(issue) {
    return issue.state === 'closed' ? 'done' : EdisonLabels.stageOf(issue.labels);
  }

  function mount(el, repo, number) {
    var token = ++generation;
    clearSheet();
    el.innerHTML = '<p class="hint loading-line">Opening the ticket\u2026</p>';
    return Promise.all([
      EdisonApi.issue(repo, number),
      EdisonApi.comments(repo, number),
      EdisonApi.searchPulls(repo, number),
      EdisonApps.load(),
      EdisonSetup.rulesStatus(repo).catch(function (error) {
        return { state: 'error', message: error && error.message ? error.message : 'Could not check the agent rules.' };
      })
    ]).then(function (parts) {
      if (token !== generation) return;
      var issue = parts[0];
      var stage = stageName(issue);
      var openPulls = (parts[2] || []).filter(function (pr) { return pr.state === 'open'; });
      if (stage === 'working' && openPulls.length) {
        return EdisonApi.updateIssue(repo, issue.number, {
          labels: EdisonLabels.replaceStage(issue.labels, 'review')
        }).then(function () {
          if (token !== generation) return;
          return mount(el, repo, issue.number);
        });
      }
      var session = { editing: false, confirmClose: false, sheet: null, noteError: '' };
      var ctx = {
        el: el,
        repo: repo,
        issue: issue,
        comments: parts[1] || [],
        pulls: parts[2] || [],
        apps: parts[3],
        rules: parts[4],
        session: session,
        token: token
      };
      ctx.token = token;
      function draw() {
        if (token !== generation) return;
        active = { session: session, draw: draw, token: token };
        el._ctx = ctx;
        render(ctx);
        paintSheet(ctx);
        loadChecks(ctx);
      }
      ctx.draw = draw;
      if (!el._bound) {
        el._bound = true;
        el.addEventListener('click', function (event) {
          if (el._ctx) onArticleClick(event, el._ctx);
        });
        el.addEventListener('submit', function (event) {
          if (el._ctx) onArticleSubmit(event, el._ctx);
        });
      }
      draw();
    }).catch(function (error) {
      if (token !== generation) return;
      el.innerHTML = '<p class="banner" role="alert">' + esc(error.message) + '</p>';
    });
  }

  function metaLine(appLabel, type, priority, issue) {
    var bits = [appLabel, EdisonLabels.TYPE_LABEL[type] || type || 'Note'];
    if (priority) bits.push(String(priority).toUpperCase());
    var ago = EdisonFormat.timeAgo(issue.updated_at);
    if (ago) bits.push(ago);
    return bits.join(' \u00b7 ');
  }

  function openPull(pulls) {
    for (var i = 0; i < pulls.length; i++) {
      if (pulls[i].state === 'open') return pulls[i];
    }
    return null;
  }

  function actionBar(ctx) {
    var issue = ctx.issue;
    var stage = stageName(issue);
    var isNew = EdisonLabels.isNewApp(issue.labels);
    var rules = ctx.rules;
    var session = ctx.session;
    if (session.confirmClose) {
      return '<div class="action-bar"><p class="hint">Close this ticket? It moves to Done.</p>' +
        '<button type="button" class="danger" data-action="close-yes">Close ticket</button>' +
        '<button type="button" class="quiet" data-action="close-no">Keep it open</button></div>';
    }
    var hint = '';
    var primary = '';
    var link = '';
    var quiet = '';
    if (issue.state === 'closed') {
      hint = 'This ticket is done. Reopen puts it back in the inbox.';
      primary = '<button type="button" class="primary" data-action="reopen">Reopen</button>';
    } else if (isNew) {
      hint = 'Creates the GitHub repository and a first ticket. Cloning onto this PC is a separate step.';
      primary = '<button type="button" class="primary" data-action="open-create">Create repository</button>';
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close</button>';
    } else if (stage === 'inbox' || stage === 'parked') {
      hint = 'Marking ready does not start the agent. Switch on does that.';
      primary = '<button type="button" class="primary" data-action="ready">Mark ready</button>';
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close</button>';
    } else if ((stage === 'ready' || stage === 'needs-input') && (!rules || rules.state !== 'merged')) {
      hint = 'Switch on waits until the agent rules are on the default branch.';
      if (rules && rules.state === 'open' && rules.pull && rules.pull.html_url) link = externalLink(rules.pull.html_url, 'Open rules pull request');
      else link = '<a href="settings.html">Settings</a>';
      if (rules && rules.state === 'error' && rules.message) hint = rules.message;
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close</button>';
    } else if (stage === 'ready') {
      hint = 'Posts the agent mention on the GitHub issue and moves this to Working. The agent stops at a pull request.';
      primary = '<button type="button" class="primary" data-action="send">Switch on</button>';
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close</button>';
    } else if (stage === 'needs-input') {
      hint = 'Answer above, then switch on. That posts the agent mention again.';
      primary = '<button type="button" class="primary" data-action="send">Switch on</button>';
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close</button>';
    } else if (stage === 'working') {
      hint = 'The agent is working. It will stop at a pull request. Edison does not merge it.';
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close</button>';
    } else if (stage === 'review') {
      var pr = openPull(ctx.pulls) || ctx.pulls[0];
      hint = 'Merge on GitHub. Close this ticket when you are finished.';
      if (pr) link = externalLink(pr.html_url, 'Open pull request');
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close ticket</button>';
    } else {
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close</button>';
    }
    var html = '<div class="action-bar">';
    if (hint) html += '<p class="hint">' + esc(hint) + '</p>';
    html += primary + link + quiet + '</div>';
    return html;
  }

  function render(ctx) {
    var el = ctx.el;
    var issue = ctx.issue;
    var repo = ctx.repo;
    var session = ctx.session;
    var stage = stageName(issue);
    var isNew = EdisonLabels.isNewApp(issue.labels);
    var app = EdisonApps.byRepo(ctx.apps, repo);
    var appLabel = isNew ? 'New app' : (app && app.name) || repo;
    var type = EdisonLabels.typeOf(issue.labels);
    var priority = EdisonLabels.priorityOf(issue.labels) || '';
    var y = el.scrollTop;
    document.title = issue.title + ' \u00b7 Edison';
    var html = '<article class="ticket">';
    html += '<p class="kicker">' + esc(EdisonLabels.STAGE_LABEL[stage] || stage) + ' \u00b7 ' + esc(metaLine(appLabel, type, priority, issue)) + '</p>';
    if (session.editing) {
      html += '<form id="edit-form" class="stack">';
      html += '<label class="field">Title<input name="title" required maxlength="120" value="' + esc(issue.title) + '" /></label>';
      html += '<label class="field">Description<textarea name="notes">' + esc(issue.body || '') + '</textarea></label>';
      html += '<button type="submit" class="primary">Save</button>';
      html += '<button type="button" class="quiet" data-action="cancel-edit">Cancel</button></form>';
    } else {
      html += '<div class="ticket-title">' + EdisonFormat.bulb(stage, 'lg') + '<h1>' + esc(issue.title) + '</h1></div>';
    }
    html += actionBar(ctx);
    if (issue.state !== 'closed') {
      html += '<p class="meta"><button type="button" class="text" data-action="open-details">Type, priority, stage</button>';
    } else {
      html += '<p class="meta">';
    }
    html += (issue.state === 'closed' ? '' : ' \u00b7 ') + externalLink(issue.html_url, '#' + issue.number + ' on GitHub');
    if (app && app.pagesUrl) html += ' \u00b7 ' + externalLink(app.pagesUrl, 'Live site');
    html += '</p>';
    var ready = readyRepos[repo + '#' + issue.number];
    if (ready) {
      html += '<div class="pr-panel"><p class="ok">Repository ready</p><p>On this PC:</p><code class="clone">' + esc(ready.clone) + '</code>';
      if (ready.number) html += '<p><a href="index.html?repo=' + encodeURIComponent(ready.repo) + '&n=' + encodeURIComponent(ready.number) + '">Open the first ticket</a></p>';
      html += '</div>';
    }
    if (stage === 'needs-input' && ctx.comments.length) {
      var ask = EdisonCard.excerpt(ctx.comments[ctx.comments.length - 1].body);
      if (ask) html += '<div class="ask"><p class="meta">The agent asked</p><p class="quote">' + esc(ask) + '</p></div>';
    }
    if (stage === 'review') {
      var shown = ctx.pulls.filter(function (pr) { return pr.state === 'open'; });
      if (!shown.length) shown = ctx.pulls.slice(0, 1);
      shown.forEach(function (pr, index) {
        html += '<div class="pr-panel"><p class="meta">Pull request</p><h2>' + externalLink(pr.html_url, pr.title) + '</h2>';
        html += '<p class="ok" data-checks="' + index + '">' + esc(pr.state) + '</p></div>';
      });
    }
    if (!session.editing) {
      html += '<div class="block-title"><h2>Description</h2><button type="button" class="text" data-action="edit">Edit</button></div>';
      html += '<div class="prose" id="ticket-body">' + (issue.body ? EdisonFormat.renderMarkdown(issue.body) : '<p class="hint">No description yet.</p>') + '</div>';
    }
    html += '<div class="block-title"><h2>Notes</h2></div><ol class="notes">';
    if (!ctx.comments.length) html += '<li class="hint">No notes yet.</li>';
    ctx.comments.forEach(function (comment) {
      var who = comment.user && comment.user.login ? comment.user.login : 'note';
      html += '<li><p class="meta">' + esc(who) + ' \u00b7 ' + esc(EdisonFormat.timeAgo(comment.created_at)) + '</p>';
      html += '<div class="prose">' + EdisonFormat.renderMarkdown(comment.body || '') + '</div></li>';
    });
    html += '</ol>';
    html += '<form id="note-form" class="stack">';
    html += '<label class="field">Add a note<textarea name="note" placeholder="Reply, or add something the agent should know"></textarea></label>';
    if (session.noteError) html += '<p class="inline-error" role="alert">' + esc(session.noteError) + '</p>';
    html += '<button type="submit" class="primary">Add note</button></form>';
    html += '</article>';
    el.innerHTML = html;
    el.scrollTop = y;
    if (session.editing) {
      var title = el.querySelector('#edit-form [name="title"]');
      if (title) title.focus();
    }
  }

  function segment(name, options, current) {
    return '<div class="segment" role="group" aria-label="' + esc(name) + '">' + options.map(function (option) {
      var pressed = option.value === current ? 'true' : 'false';
      return '<button type="button" data-segment="' + esc(name) + '" data-value="' + esc(option.value) + '" aria-pressed="' + pressed + '">' + esc(option.label) + '</button>';
    }).join('') + '</div>';
  }

  function paintSheet(ctx) {
    var root = sheetRoot();
    var session = ctx.session;
    if (!session.sheet) {
      root.innerHTML = '';
      document.body.classList.remove('ticket-sheet');
      return;
    }
    document.body.classList.add('ticket-sheet');
    var html = '<div class="backdrop">';
    if (session.sheet === 'details') html += detailsSheet(ctx);
    else if (session.sheet === 'create') html += createSheet(ctx);
    html += '</div>';
    root.innerHTML = html;
    root.onclick = function (event) {
      if (event.target.classList.contains('backdrop') || (event.target.closest('[data-action]') && event.target.closest('[data-action]').getAttribute('data-action') === 'close-ticket-sheet')) {
        session.sheet = null;
        ctx.draw();
        return;
      }
    };
    root.onsubmit = function (event) {
      if (event.target.id === 'details-form') saveDetailsSheet(event, ctx);
      else if (event.target.id === 'create-form') submitCreate(event, ctx);
    };
    var focus = root.querySelector('input, select, textarea');
    if (focus) focus.focus();
  }

  function detailsSheet(ctx) {
    var issue = ctx.issue;
    var stage = stageName(issue);
    var type = EdisonLabels.typeOf(issue.labels) || 'bug';
    var priority = EdisonLabels.priorityOf(issue.labels) || 'p2';
    var stages = [
      { value: 'inbox', label: 'Inbox' },
      { value: 'ready', label: 'Ready' },
      { value: 'needs-input', label: 'Needs you' },
      { value: 'parked', label: 'Parked' }
    ];
    if (stage === 'review' || stage === 'working') {
      stages.push({ value: stage, label: EdisonLabels.STAGE_LABEL[stage] });
    }
    var html = '<form class="sheet stack" id="details-form" role="dialog" aria-modal="true" aria-labelledby="details-title">';
    html += '<h2 id="details-title">Type, priority, stage</h2>';
    html += '<div class="field">Type' + segment('detail-type', EdisonLabels.TYPES.map(function (name) {
      return { value: name, label: EdisonLabels.TYPE_LABEL[name] };
    }), type) + '</div>';
    html += '<div class="field">Priority' + segment('detail-priority', EdisonLabels.PRIORITIES.map(function (name) {
      return { value: name, label: name.toUpperCase() };
    }), priority) + '</div>';
    html += '<div class="field">Stage' + segment('detail-stage', stages, stages.some(function (item) { return item.value === stage; }) ? stage : '') + '</div>';
    html += '<p class="hint">Working and In review follow the agent and the pull request. Closing the ticket is how you mark it done.</p>';
    html += '<div class="sheet-actions"><button type="submit" class="primary">Save</button>';
    html += '<button type="button" class="quiet" data-action="close-ticket-sheet">Cancel</button></div></form>';
    return html;
  }

  function createSheet(ctx) {
    var suggested = EdisonQuery.suggestRepoName(ctx.issue.title);
    var html = '<form class="sheet stack" id="create-form" role="dialog" aria-modal="true" aria-labelledby="create-title">';
    html += '<h2 id="create-title">Create repository</h2>';
    html += '<p class="hint">Creates a public ZarleyLtd repository, files the first ticket there, and closes this idea.</p>';
    html += '<label class="field">Repository name<input name="repoName" required value="' + esc(suggested) + '" /></label>';
    html += '<p id="promote-result" class="hint" role="status"></p>';
    html += '<div class="sheet-actions"><button type="submit" class="primary">Create ZarleyLtd repository</button>';
    html += '<button type="button" class="quiet" data-action="close-ticket-sheet">Cancel</button></div></form>';
    return html;
  }

  function pressed(form, name) {
    var button = form.querySelector('[data-segment="' + name + '"][aria-pressed="true"]');
    return button ? button.getAttribute('data-value') : '';
  }

  function saveDetailsSheet(event, ctx) {
    event.preventDefault();
    var form = event.target;
    var issue = ctx.issue;
    var type = pressed(form, 'detail-type');
    var priority = pressed(form, 'detail-priority');
    var stagePick = pressed(form, 'detail-stage');
    var labels = EdisonLabels.replaceType(issue.labels, type);
    labels = EdisonLabels.replacePriority(labels, priority);
    var stage = stageName(issue);
    if (stagePick && stagePick !== stage && stagePick !== 'working' && stagePick !== 'done') {
      labels = EdisonLabels.replaceStage(labels, stagePick);
    }
    var button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    updateLabels(ctx.el, ctx.repo, issue, labels);
  }

  function submitCreate(event, ctx) {
    event.preventDefault();
    var form = event.target;
    createRepo(ctx.el, ctx.repo, ctx.issue, new FormData(form).get('repoName'), form.querySelector('button[type="submit"]'));
  }

  function onArticleClick(event, ctx) {
    var button = event.target.closest('[data-action]');
    if (!button || !ctx.el.contains(button)) return;
    var action = button.getAttribute('data-action');
    var session = ctx.session;
    if (action === 'close-ask') {
      session.confirmClose = true;
      ctx.draw();
    } else if (action === 'close-no') {
      session.confirmClose = false;
      ctx.draw();
    } else if (action === 'close-yes') {
      setState(ctx.el, ctx.repo, ctx.issue, 'closed', button);
    } else if (action === 'reopen') {
      setState(ctx.el, ctx.repo, ctx.issue, 'open', button);
    } else if (action === 'ready') {
      setStage(ctx.el, ctx.repo, ctx.issue, 'ready', button);
    } else if (action === 'send') {
      switchOn(ctx.el, ctx.repo, ctx.issue, button);
    } else if (action === 'edit') {
      session.editing = true;
      ctx.draw();
    } else if (action === 'cancel-edit') {
      session.editing = false;
      ctx.draw();
    } else if (action === 'open-details') {
      session.sheet = 'details';
      ctx.draw();
    } else if (action === 'open-create') {
      session.sheet = 'create';
      ctx.draw();
    }
  }

  function onArticleSubmit(event, ctx) {
    var form = event.target;
    if (form.id === 'edit-form') {
      event.preventDefault();
      saveDetails(ctx.el, ctx.repo, ctx.issue, form.querySelector('button'));
    } else if (form.id === 'note-form') {
      event.preventDefault();
      var note = String(new FormData(form).get('note') || '').trim();
      var button = form.querySelector('button');
      if (!note) {
        ctx.session.noteError = 'Write a note first.';
        ctx.draw();
        return;
      }
      ctx.session.noteError = '';
      button.disabled = true;
      EdisonApi.createComment(ctx.repo, ctx.issue.number, note).then(function () {
        BriefMessage.show('Note added', button);
        mount(ctx.el, ctx.repo, ctx.issue.number);
      }).catch(function (error) {
        button.disabled = false;
        BriefMessage.show(error.message, button, { durationMs: 2500, multiline: true });
      });
    }
  }

  function loadChecks(ctx) {
    var pulls = ctx.pulls.filter(function (pr) { return pr.state === 'open'; });
    if (!pulls.length) pulls = ctx.pulls.slice(0, 1);
    if (stageName(ctx.issue) !== 'review') return;
    pulls.forEach(function (pr, index) {
      EdisonApi.request('/repos/' + EDISON_CONFIG.OWNER + '/' + encodeURIComponent(ctx.repo) + '/pulls/' + pr.number).then(function (full) {
        var sha = full.head && full.head.sha;
        if (!sha) return null;
        return EdisonApi.checkRuns(ctx.repo, sha);
      }).then(function (result) {
        if (!result || ctx.token !== generation) return;
        var slot = ctx.el.querySelector('[data-checks="' + index + '"]');
        if (!slot) return;
        var runs = result.check_runs || [];
        if (!runs.length) {
          slot.textContent = 'No checks yet';
          return;
        }
        var failed = runs.filter(function (run) { return run.conclusion === 'failure'; }).length;
        slot.textContent = failed
          ? failed + ' check' + (failed === 1 ? '' : 's') + ' failed'
          : runs.length + ' check' + (runs.length === 1 ? '' : 's') + ' passed';
      }).catch(function () {});
    });
  }

  function updateLabels(el, repo, issue, labels) {
    return EdisonApi.updateIssue(repo, issue.number, { labels: labels }).then(function () {
      return mount(el, repo, issue.number);
    }).catch(function (error) {
      el.insertAdjacentHTML('afterbegin', '<p class="banner" role="alert">' + esc(error.message) + '</p>');
    });
  }

  function setStage(el, repo, issue, stage, button) {
    if (stage === 'working') return;
    if (button) button.disabled = true;
    return updateLabels(el, repo, issue, EdisonLabels.replaceStage(issue.labels, stage));
  }

  function saveDetails(el, repo, issue, button) {
    var form = el.querySelector('#edit-form');
    var title = form.querySelector('[name="title"]').value.trim();
    var body = form.querySelector('[name="notes"]').value;
    if (!title) {
      BriefMessage.show('Add a title', button);
      return;
    }
    button.disabled = true;
    EdisonApi.updateIssue(repo, issue.number, { title: title, body: body }).then(function () {
      BriefMessage.show('Saved', button, { durationMs: 2200 });
      return mount(el, repo, issue.number);
    }).catch(function (error) {
      button.disabled = false;
      BriefMessage.show(error.message, button, { durationMs: 2800, multiline: true });
    });
  }

  function setState(el, repo, issue, state, button) {
    if (button) button.disabled = true;
    EdisonApi.updateIssue(repo, issue.number, { state: state }).then(function () {
      if (state === 'closed' && button) BriefMessage.show('Ticket closed', button, { durationMs: 2500 });
      return mount(el, repo, issue.number);
    }).catch(function (error) {
      if (button) button.disabled = false;
      el.insertAdjacentHTML('afterbegin', '<p class="banner" role="alert">' + esc(error.message) + '</p>');
    });
  }

  function switchOn(el, repo, issue, button) {
    button.disabled = true;
    EdisonSetup.rulesStatus(repo).then(function (status) {
      if (!status || status.state !== 'merged') {
        BriefMessage.show('Merge the agent rules before Switch on.', button, { durationMs: 2800, multiline: true });
        return mount(el, repo, issue.number);
      }
      return EdisonAgents.current().then(function (agent) {
        return EdisonApi.createComment(repo, issue.number, EdisonAgents.commentBody(agent, repo, issue));
      }).then(function () {
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
    var result = document.getElementById('promote-result');
    if (result) result.textContent = 'Creating the repository\u2026';
    var createdIssue = null;
    var clone = 'git clone https://github.com/' + EDISON_CONFIG.OWNER + '/' + name + '.git ' + EDISON_CONFIG.LOCAL_ROOT + '/' + name;
    EdisonApi.createRepo(name, 'Created from Edison idea #' + issue.number)
      .then(function () {
        if (result) result.textContent = 'Writing the starter README\u2026';
        var readme = '# ' + name + '\n\nThis app was created from an Edison idea: ' + issue.html_url + '\n\nThe first ticket for an agent is in this repository.\n';
        return EdisonApi.putText(name, 'README.md', 'Start ' + name + ' from Edison', readme);
      })
      .then(function () {
        if (result) result.textContent = 'Adding Edison labels\u2026';
        return EdisonApi.ensureLabels(name);
      })
      .then(function () {
        return EdisonApps.load();
      })
      .then(function (apps) {
        if (result) result.textContent = 'Adding it to Edison\u2026';
        var next = EdisonQuery.insertApp(apps, {
          name: name,
          repo: name,
          pagesUrl: 'https://zarleyltd.github.io/' + name + '/',
          localPath: EDISON_CONFIG.LOCAL_ROOT + '/' + name
        });
        return EdisonApps.save(next);
      })
      .then(function () {
        if (result) result.textContent = 'Opening the first ticket\u2026';
        return EdisonApi.createIssue(name, {
          title: 'Scaffold the app from Edison idea #' + issue.number,
          body: 'Build the first version of this app from the Edison idea.\n\n' + issue.html_url + '\n\n' + (issue.body || ''),
          labels: ['edison', 'type:feature', 'stage:ready', 'p2']
        });
      })
      .then(function (scaffold) {
        createdIssue = scaffold;
        return EdisonApi.createComment(ideaRepo, issue.number, 'Repository created: https://github.com/' + EDISON_CONFIG.OWNER + '/' + name + '\n\nFirst ticket: ' + scaffold.html_url + '\n\nOn the PC that holds the other apps, clone it with:\n\n```\n' + clone + '\n```');
      })
      .then(function () {
        return EdisonApi.updateIssue(ideaRepo, issue.number, { state: 'closed' });
      })
      .then(function () {
        readyRepos[ideaRepo + '#' + issue.number] = {
          clone: clone,
          repo: name,
          number: createdIssue && createdIssue.number
        };
        BriefMessage.show('Repository created', button);
        return mount(el, ideaRepo, issue.number);
      })
      .catch(function (error) {
        button.disabled = false;
        if (result) result.textContent = error.message;
      });
  }

  return { mount: mount };
})();
