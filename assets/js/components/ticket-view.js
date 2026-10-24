var EdisonTicket = (function () {
  'use strict';

  var generation = 0;
  var active = null;
  var readyRepos = {};
  var freshComment = null;

  function commentsWithFresh(comments, repo, number) {
    var list = (comments || []).slice();
    if (!freshComment || freshComment.repo !== repo || String(freshComment.number) !== String(number)) return list;
    var created = freshComment.comment;
    if (!created) return list;
    var index = -1;
    for (var i = 0; i < list.length; i++) {
      if (created.id && String(list[i].id) === String(created.id)) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      if (!list.some(function (item) { return item.body === created.body; })) list.push(created);
      else freshComment = null;
    } else if (list[index].body !== created.body) {
      list[index] = created;
    } else {
      freshComment = null;
    }
    return list;
  }

  function agentDeployed(issue, comments) {
    var stage = stageName(issue);
    if (stage === 'working' || stage === 'review') return true;
    return (comments || []).some(function (comment) {
      var body = String(comment.body || '');
      return /^@(cursor|claude)\b/.test(body) && body.indexOf('Edison ticket:') !== -1;
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !active || active.token !== generation) return;
    if (!active.session.sheet && !active.session.confirmClose && !active.session.confirmMerge && !active.session.confirmEdit && !active.session.editingComment) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (active.session.confirmEdit) {
      var kept = currentEdit(active.el || document);
      if (kept) active.session.editDraft = kept;
    }
    active.session.sheet = null;
    active.session.confirmClose = false;
    active.session.confirmMerge = false;
    active.session.confirmEdit = false;
    active.session.editingComment = null;
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

  function agentPullComments(repo, pulls) {
    var list = pulls || [];
    if (!list.length) return Promise.resolve([]);
    return Promise.all(list.map(function (pr) {
      return EdisonApi.comments(repo, pr.number).catch(function () { return []; });
    })).then(function (groups) {
      var all = [];
      groups.forEach(function (group) {
        all = all.concat(group || []);
      });
      return all;
    });
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
      var pulls = parts[2] || [];
      return agentPullComments(repo, pulls).then(function (prComments) {
      if (token !== generation) return;
      var comments = EdisonQuery.withAgentUpdates(commentsWithFresh(parts[1], repo, number), prComments);
      var target = EdisonQuery.oldestOpenPull(pulls);
      var promote = Promise.resolve(false);
      if (stageName(issue) === 'working' && target) {
        promote = EdisonApi.pull(repo, target.number).then(function (full) {
          var sha = full && full.head && full.head.sha;
          if (!EdisonQuery.roundLanded(comments, sha)) return false;
          return EdisonApi.updateIssue(repo, issue.number, {
            labels: EdisonLabels.replaceStage(issue.labels, 'review')
          }).then(function () { return true; });
        }).catch(function () { return false; });
      }
      return promote.then(function (moved) {
        if (token !== generation) return;
        if (moved) return mount(el, repo, number);
      var session = { editing: false, confirmClose: false, confirmMerge: false, confirmEdit: false, editDraft: null, editChange: null, checks: null, mergeable: null, sheet: null, noteError: '', editingComment: null };
      var ctx = {
        el: el,
        repo: repo,
        issue: issue,
        comments: comments,
        pulls: pulls,
        apps: parts[3],
        rules: parts[4],
        session: session,
        token: token
      };
      ctx.token = token;
      function draw() {
        if (token !== generation) return;
        active = { session: session, draw: draw, token: token, el: el };
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
      });
      });
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
    return EdisonQuery.oldestOpenPull(pulls);
  }

  function shownPulls(pulls) {
    var open = EdisonQuery.openPullsByAge(pulls);
    if (open.length) return open;
    return (pulls || []).slice(0, 1);
  }

  function rulesReady(status) {
    return !!(status && (status.state === 'merged' || status.state === 'stale'));
  }

  function pullHint(pulls) {
    var open = EdisonQuery.openPullsByAge(pulls);
    if (open.length < 2) return '';
    return ' More than one pull request is open. Updates go to #' + open[0].number + '.';
  }

  function actionBar(ctx) {
    var issue = ctx.issue;
    var stage = stageName(issue);
    var isNew = EdisonLabels.isNewApp(issue.labels);
    var rules = ctx.rules;
    var session = ctx.session;
    if (session.confirmEdit) {
      return '<div class="action-bar"><p class="hint" role="status">' + esc(editWarning(session.editChange)) + '</p>' +
        '<button type="button" class="primary" data-action="edit-yes">Save anyway</button>' +
        '<button type="button" class="quiet" data-action="edit-no">Don\u2019t save</button></div>';
    }
    if (session.confirmMerge) return mergeConfirm(ctx);
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
      hint = 'Marking ready does not start the agent. Deploy Agent does that.';
      primary = '<button type="button" class="primary" data-action="ready">Mark ready</button>';
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close</button>';
    } else if ((stage === 'ready' || stage === 'needs-input') && !rulesReady(rules)) {
      hint = 'Deploy Agent waits until the agent rules are on the default branch.';
      if (rules && rules.state === 'open' && rules.pull && rules.pull.html_url) link = externalLink(rules.pull.html_url, 'Open rules pull request');
      else link = '<a href="settings.html">Settings</a>';
      if (rules && rules.state === 'error' && rules.message) hint = rules.message;
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close</button>';
    } else if (stage === 'ready') {
      if (openPull(ctx.pulls)) {
        hint = 'A pull request is already open. Deploy Agent continues it and includes every note since the last round.' + pullHint(ctx.pulls);
      } else {
        hint = 'Posts the agent mention on the GitHub issue and moves this to Working. The agent stops at a pull request.';
      }
      primary = '<button type="button" class="primary" data-action="send">Deploy Agent</button>';
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close</button>';
    } else if (stage === 'needs-input') {
      if (openPull(ctx.pulls)) {
        hint = 'Notes wait until you tap Deploy Agent. That continues this pull request and includes every note since the last round.' + pullHint(ctx.pulls);
      } else {
        hint = 'Answer above, then tap Deploy Agent. That posts the agent mention again.';
      }
      primary = '<button type="button" class="primary" data-action="send">Deploy Agent</button>';
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close</button>';
    } else if (stage === 'working') {
      hint = openPull(ctx.pulls)
        ? 'The agent is updating this pull request. A note saved now is included the next time you send.'
        : 'The agent is working. It stops at a pull request.';
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close</button>';
    } else if (stage === 'review') {
      var pr = openPull(ctx.pulls);
      if (pr) {
        hint = 'Add notes for what should change. Send to agent continues this pull request and picks them up. Merge when you want this version live.' + pullHint(ctx.pulls);
        primary = '<button type="button" class="primary" data-action="send">Send to agent</button>';
        link = '<button type="button" class="secondary" data-action="merge-ask">Merge PR</button>';
      } else if (ctx.pulls.length) {
        hint = 'The pull request is merged. Close this ticket when you are finished.';
      } else {
        hint = 'Close this ticket when you are finished.';
      }
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
    var scroller = el.querySelector('.ticket-scroll');
    var scrollOnInner = scroller && getComputedStyle(scroller).display !== 'contents';
    var y = scrollOnInner ? scroller.scrollTop : el.scrollTop;
    document.title = issue.title + ' \u00b7 Edison';
    var html = '<article class="ticket"><div class="ticket-scroll"><div class="ticket-head">';
    html += '<div class="kicker-row"><p class="kicker">' + esc(EdisonLabels.STAGE_LABEL[stage] || stage) + ' \u00b7 ' + esc(metaLine(appLabel, type, priority, issue)) + '</p>';
    if (issue.state !== 'closed') html += '<button type="button" class="text" data-action="open-details">Type, priority, stage</button>';
    html += '</div>';
    if (session.editing) {
      var draft = session.editDraft;
      var titleValue = draft ? draft.title : issue.title;
      var bodyValue = draft ? draft.body : (issue.body || '');
      html += '<form id="edit-form" class="stack">';
      html += '<label class="field">Title<input name="title" required maxlength="120" value="' + esc(titleValue) + '" /></label>';
      html += '<label class="field">Description<textarea name="notes">' + esc(bodyValue) + '</textarea></label>';
      if (!session.confirmEdit) {
        html += '<button type="submit" class="primary">Save</button>';
        html += '<button type="button" class="quiet" data-action="cancel-edit">Cancel</button>';
      }
      html += '</form>';
    } else {
      html += '<div class="ticket-title">' + EdisonFormat.bulb(stage, 'lg') + '<h1>' + esc(issue.title) + '</h1></div>';
    }
    html += '</div><div class="ticket-rest">';
    html += '<p class="meta ticket-links">' + externalLink(issue.html_url, '#' + issue.number + ' on GitHub');
    if (app && app.pagesUrl) html += ' \u00b7 ' + externalLink(app.pagesUrl, 'Live site');
    html += '</p>';
    var ready = readyRepos[repo + '#' + issue.number];
    if (ready) {
      html += '<div class="pr-panel"><p class="ok">Repository ready</p><p>On this PC:</p><code class="clone">' + esc(ready.clone) + '</code>';
      if (ready.number) html += '<p><a href="index.html?repo=' + encodeURIComponent(ready.repo) + '&n=' + encodeURIComponent(ready.number) + '">Open the first ticket</a></p>';
      html += '</div>';
    }
    var visibleNotes = ctx.comments.filter(function (comment) {
      return EdisonQuery.noteText(comment && comment.body);
    });
    if (stage === 'needs-input' && visibleNotes.length) {
      var ask = EdisonCard.excerpt(EdisonQuery.noteText(visibleNotes[visibleNotes.length - 1].body));
      if (ask) html += '<div class="ask"><p class="meta">The agent asked</p><p class="quote">' + esc(ask) + '</p></div>';
    }
    if (stage === 'review') {
      var shown = shownPulls(ctx.pulls);
      shown.forEach(function (pr, index) {
        html += '<div class="pr-panel"><p class="meta">Pull request</p><h2>' + externalLink(pr.html_url, pr.title) + '</h2>';
        if (index === 0) html += '<div data-review hidden></div>';
        html += '<p class="ok" data-checks="' + index + '">' + esc(pr.state) + '</p></div>';
      });
    }
    if (!session.editing) {
      html += '<div class="block-title"><h2>Description</h2><button type="button" class="text" data-action="edit">Edit</button></div>';
      html += '<div class="prose" id="ticket-body">' + (issue.body ? EdisonFormat.renderMarkdown(issue.body) : '<p class="hint">No description yet.</p>') + '</div>';
    }
    var canEditNotes = !agentDeployed(issue, ctx.comments);
    html += '<div class="block-title"><h2>Notes</h2></div><ol class="notes">';
    if (!visibleNotes.length) html += '<li class="hint">No notes yet.</li>';
    visibleNotes.forEach(function (comment) {
      var who = comment.user && comment.user.login ? comment.user.login : 'note';
      var editingThis = canEditNotes && session.editingComment && String(session.editingComment) === String(comment.id);
      var text = EdisonQuery.noteText(comment.body);
      html += '<li' + (comment.id ? ' data-comment="' + esc(comment.id) + '"' : '') + '>';
      if (editingThis) {
        html += '<form id="note-edit-form" class="stack">';
        html += '<label class="field">Note<textarea name="note">' + esc(text) + '</textarea></label>';
        html += '<button type="submit" class="primary">Save</button>';
        html += '<button type="button" class="quiet" data-action="cancel-note">Cancel</button></form>';
      } else {
        html += '<div class="note-head"><p class="meta">' + esc(who) + ' \u00b7 ' + esc(EdisonFormat.timeAgo(comment.created_at)) + '</p>';
        if (canEditNotes && comment.id) html += '<button type="button" class="text" data-action="edit-note" data-id="' + esc(comment.id) + '">Edit</button>';
        html += '</div><div class="prose">' + EdisonFormat.renderMarkdown(text) + '</div>';
      }
      html += '</li>';
    });
    html += '</ol>';
    html += '<form id="note-form" class="stack">';
    html += '<label class="field">Add a note<textarea name="note" placeholder="Add a note. This does not start the agent."></textarea></label>';
    if (session.noteError) html += '<p class="inline-error" role="alert">' + esc(session.noteError) + '</p>';
    html += '<button type="submit" class="primary">Add note</button></form>';
    html += '</div></div>' + actionBar(ctx) + '</article>';
    el.innerHTML = html;
    var nextScroller = el.querySelector('.ticket-scroll');
    if (nextScroller && getComputedStyle(nextScroller).display !== 'contents') nextScroller.scrollTop = y;
    else el.scrollTop = y;
    if (session.confirmEdit) {
      var confirmButton = el.querySelector('[data-action="edit-yes"]');
      if (confirmButton) confirmButton.focus();
    } else if (session.editing) {
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
      session.confirmMerge = false;
      session.confirmClose = true;
      ctx.draw();
    } else if (action === 'close-no') {
      session.confirmClose = false;
      ctx.draw();
    } else if (action === 'merge-ask') {
      session.confirmClose = false;
      session.confirmMerge = true;
      ctx.draw();
    } else if (action === 'merge-no') {
      session.confirmMerge = false;
      ctx.draw();
    } else if (action === 'merge-yes') {
      mergePullRequest(ctx, button);
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
      session.confirmEdit = false;
      session.editDraft = null;
      session.editChange = null;
      ctx.draw();
    } else if (action === 'cancel-edit') {
      session.editing = false;
      session.confirmEdit = false;
      session.editDraft = null;
      session.editChange = null;
      ctx.draw();
    } else if (action === 'edit-yes') {
      saveDetails(ctx.el, ctx.repo, ctx.issue, button);
    } else if (action === 'edit-no') {
      var kept = currentEdit(ctx.el);
      if (kept) session.editDraft = kept;
      session.confirmEdit = false;
      ctx.draw();
    } else if (action === 'edit-note') {
      if (agentDeployed(ctx.issue, ctx.comments)) return;
      session.editingComment = button.getAttribute('data-id');
      ctx.draw();
      var noteField = ctx.el.querySelector('#note-edit-form textarea');
      if (noteField) noteField.focus();
    } else if (action === 'cancel-note') {
      session.editingComment = null;
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
      if (ctx.session.confirmEdit) return;
      var draft = currentEdit(ctx.el);
      if (!draft || !draft.title) {
        BriefMessage.show('Add a title', form.querySelector('button'));
        return;
      }
      var change = describeEditChange(ctx.issue, draft);
      if (agentDeployed(ctx.issue, ctx.comments) && (change.title || change.body)) {
        ctx.session.editDraft = draft;
        ctx.session.editChange = change;
        ctx.session.confirmEdit = true;
        ctx.draw();
        return;
      }
      saveDetails(ctx.el, ctx.repo, ctx.issue, form.querySelector('button'));
    } else if (form.id === 'note-form') {
      event.preventDefault();
      var note = String(new FormData(form).get('note') || '').trim();
      var button = form.querySelector('button');
      if (!note) {
        ctx.session.noteError = 'Write a note first.';
        ctx.draw();
        var field = ctx.el.querySelector('#note-form textarea');
        if (field) field.focus();
        return;
      }
      ctx.session.noteError = '';
      button.disabled = true;
      button.textContent = 'Adding\u2026';
      EdisonApi.createComment(ctx.repo, ctx.issue.number, note).then(function (created) {
        freshComment = { repo: ctx.repo, number: ctx.issue.number, comment: created };
        return mount(ctx.el, ctx.repo, ctx.issue.number).then(function () { return created; });
      }).then(function (created) {
        var found = created && created.id ? ctx.el.querySelector('[data-comment="' + created.id + '"]') : null;
        if (!found) {
          BriefMessage.show('Saved. Open the ticket again if it is not in the list.', button, { durationMs: 2800, multiline: true });
          return;
        }
        if (found.scrollIntoView) found.scrollIntoView({ block: 'nearest' });
        BriefMessage.show('Note added', found);
      }).catch(function (error) {
        button.disabled = false;
        button.textContent = 'Add note';
        BriefMessage.show(error.message, button, { durationMs: 2500, multiline: true });
      });
    } else if (form.id === 'note-edit-form') {
      event.preventDefault();
      saveNote(ctx, form);
    }
  }

  function saveNote(ctx, form) {
    var button = form.querySelector('button[type="submit"]');
    if (agentDeployed(ctx.issue, ctx.comments)) {
      ctx.session.editingComment = null;
      ctx.draw();
      return;
    }
    var text = String(new FormData(form).get('note') || '').trim();
    if (!text) {
      BriefMessage.show('Write a note first.', button);
      return;
    }
    var id = ctx.session.editingComment;
    button.disabled = true;
    EdisonApi.updateComment(ctx.repo, id, text).then(function (updated) {
      freshComment = {
        repo: ctx.repo,
        number: ctx.issue.number,
        comment: updated || { id: id, body: text }
      };
      return mount(ctx.el, ctx.repo, ctx.issue.number);
    }).then(function () {
      var found = ctx.el.querySelector('[data-comment="' + id + '"]');
      BriefMessage.show('Note saved', found || ctx.el);
    }).catch(function (error) {
      button.disabled = false;
      BriefMessage.show(error.message, button, { durationMs: 2500, multiline: true });
    });
  }

  function settled(promise) {
    return promise.then(function (value) {
      return value;
    }, function () {
      return null;
    });
  }

  function reviewLabel(page, alone) {
    if (alone && /(^|\/)index\.html?$/i.test(page)) return 'Review page';
    return 'Review ' + page.split('/').pop();
  }

  function paintReviewLinks(ctx, sha, files) {
    var pages = EdisonQuery.previewPages(files);
    var html = pages.map(function (page) {
      return externalLink(
        EdisonQuery.previewPageUrl(EDISON_CONFIG.OWNER, ctx.repo, sha, page),
        reviewLabel(page, pages.length === 1)
      );
    }).join('');
    ctx.el.querySelectorAll('[data-review]').forEach(function (slot) {
      slot.innerHTML = html;
      slot.hidden = false;
    });
  }

  function mergeConfirm(ctx) {
    var failed = ctx.session.checks && ctx.session.checks.failed;
    var hint = 'Merge this pull request? The live site updates after GitHub Pages deploys. The ticket stays open until you close it.';
    var button = '<button type="button" class="primary" data-action="merge-yes">Merge PR</button>';
    if (ctx.session.mergeable === false) {
      hint = 'GitHub cannot merge this pull request yet.';
      button = '';
    } else if (failed) {
      hint = failed + (failed === 1 ? ' check has' : ' checks have') + ' failed. Merge this pull request anyway? The ticket stays open until you close it.';
      button = '<button type="button" class="danger" data-action="merge-yes">Merge anyway</button>';
    }
    return '<div class="action-bar"><p class="hint">' + esc(hint) + '</p>' + button +
      '<button type="button" class="quiet" data-action="merge-no">Don\u2019t merge</button></div>';
  }

  function mergePullRequest(ctx, button) {
    var pr = openPull(ctx.pulls);
    if (!pr) {
      ctx.session.confirmMerge = false;
      ctx.draw();
      return;
    }
    if (button) button.disabled = true;
    EdisonApi.mergePull(ctx.repo, pr.number).then(function () {
      pr.state = 'closed';
      ctx.session.confirmMerge = false;
      ctx.session.confirmClose = true;
      BriefMessage.show('Pull request merged', button || ctx.el);
      ctx.draw();
    }).catch(function (error) {
      if (button) button.disabled = false;
      BriefMessage.show(error.message, button || ctx.el, { durationMs: 2800, multiline: true });
    });
  }

  function loadChecks(ctx) {
    var pulls = shownPulls(ctx.pulls);
    if (stageName(ctx.issue) !== 'review') return;
    pulls.forEach(function (pr, index) {
      var sha = '';
      EdisonApi.request('/repos/' + EDISON_CONFIG.OWNER + '/' + encodeURIComponent(ctx.repo) + '/pulls/' + pr.number).then(function (full) {
        sha = full.head && full.head.sha;
        if (index === 0) ctx.session.mergeable = full.mergeable;
        if (!sha) return null;
        return Promise.all([
          settled(EdisonApi.checkRuns(ctx.repo, sha)),
          settled(EdisonApi.request('/repos/' + EDISON_CONFIG.OWNER + '/' + encodeURIComponent(ctx.repo) + '/pulls/' + pr.number + '/files?per_page=100')),
          settled(EdisonApi.repoMeta(ctx.repo))
        ]);
      }).then(function (parts) {
        if (!parts || ctx.token !== generation) return;
        var slot = ctx.el.querySelector('[data-checks="' + index + '"]');
        var runs = (parts[0] && parts[0].check_runs) || [];
        var failed = runs.filter(function (run) { return run.conclusion === 'failure'; }).length;
        if (slot) {
          if (!runs.length) slot.textContent = 'No checks yet';
          else {
            slot.textContent = failed
              ? failed + ' check' + (failed === 1 ? '' : 's') + ' failed'
              : runs.length + ' check' + (runs.length === 1 ? '' : 's') + ' passed';
          }
        }
        if (index === 0) {
          ctx.session.checks = { failed: failed, total: runs.length };
          if (parts[2] && parts[2].private === false) paintReviewLinks(ctx, sha, parts[1]);
        }
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

  function currentEdit(el) {
    var form = el.querySelector('#edit-form');
    if (!form) return null;
    return {
      title: form.querySelector('[name="title"]').value.trim(),
      body: form.querySelector('[name="notes"]').value
    };
  }

  function describeEditChange(issue, draft) {
    return {
      title: draft.title !== String(issue.title || '').trim(),
      body: draft.body !== String(issue.body || '')
    };
  }

  function editWarning(change) {
    var what = 'the title or description';
    if (change && change.title && !change.body) what = 'the title';
    else if (change && change.body && !change.title) what = 'the description';
    return 'The agent will not see changes to ' + what + '. It can leave a misleading picture for future viewers of the ticket.';
  }

  function saveDetails(el, repo, issue, button) {
    var draft = currentEdit(el);
    var session = el._ctx && el._ctx.session;
    if (!draft && session && session.editDraft) draft = session.editDraft;
    if (!draft || !draft.title) {
      BriefMessage.show('Add a title', button);
      return;
    }
    var title = draft.title;
    var body = draft.body;
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

  function noteDraft(el) {
    var field = el.querySelector('#note-form textarea');
    return field ? String(field.value || '').trim() : '';
  }

  function switchOn(el, repo, issue, button) {
    var existing = el._ctx && openPull(el._ctx.pulls);
    if (existing) {
      continuePull(el, repo, issue, button, existing);
      return;
    }
    button.disabled = true;
    EdisonSetup.rulesStatus(repo).then(function (status) {
      if (!rulesReady(status)) {
        BriefMessage.show('Merge the agent rules before Deploy Agent.', button, { durationMs: 2800, multiline: true });
        return mount(el, repo, issue.number);
      }
      return EdisonAgents.current().then(function (agent) {
        var body = EdisonAgents.commentBody(agent, repo, issue) + '\n\n' + EdisonQuery.deployMarker();
        return EdisonApi.createComment(repo, issue.number, body);
      }).then(function () {
        return EdisonApi.updateIssue(repo, issue.number, {
          labels: EdisonLabels.replaceStage(issue.labels, 'working')
        });
      }).then(function () {
        BriefMessage.show('Agent deployed', button);
        return mount(el, repo, issue.number);
      });
    }).catch(function (error) {
      button.disabled = false;
      BriefMessage.show(error.message, button, { durationMs: 2800, multiline: true });
    });
  }

  function continuePull(el, repo, issue, button, pr) {
    var draft = noteDraft(el);
    var notes = EdisonQuery.pendingNotes(el._ctx.comments, draft);
    if (!notes.length) {
      BriefMessage.show('Write a note first.', button);
      return;
    }
    button.disabled = true;
    var mentioned = false;
    EdisonSetup.rulesStatus(repo).then(function (status) {
      if (!rulesReady(status)) {
        BriefMessage.show('Merge the agent rules before Deploy Agent.', button, { durationMs: 2800, multiline: true });
        return mount(el, repo, issue.number);
      }
      return EdisonApi.pull(repo, pr.number).then(function (full) {
        var sha = full && full.head && full.head.sha || '';
        var branch = full && full.head && full.head.ref || '';
        if (!branch) throw new Error('Could not read the pull request branch.');
        var posted = draft ? EdisonApi.createComment(repo, issue.number, draft) : Promise.resolve();
        return posted.then(function () {
          return EdisonAgents.current();
        }).then(function (agent) {
          return EdisonApi.createComment(repo, pr.number, EdisonQuery.followUpComment({
            mention: agent.mention,
            notes: notes,
            pr: pr.number,
            branch: branch,
            issue: issue.number,
            title: issue.title,
            repo: repo,
            owner: EDISON_CONFIG.OWNER
          }));
        }).then(function () {
          mentioned = true;
          return EdisonApi.createComment(repo, issue.number, EdisonQuery.deployMarker(pr.number, sha)).catch(function () {
            return null;
          });
        }).then(function () {
          return EdisonApi.updateIssue(repo, issue.number, {
            labels: EdisonLabels.replaceStage(issue.labels, 'working')
          });
        }).then(function () {
          BriefMessage.show('Agent sent', button);
          return mount(el, repo, issue.number);
        });
      });
    }).catch(function (error) {
      var recover = mentioned
        ? EdisonApi.updateIssue(repo, issue.number, {
          labels: EdisonLabels.replaceStage(issue.labels, 'working')
        }).catch(function () { return null; }).then(function () {
          return mount(el, repo, issue.number);
        })
        : (draft ? mount(el, repo, issue.number) : Promise.resolve());
      return recover.then(function () {
        if (!mentioned && !draft && button) button.disabled = false;
        BriefMessage.show(error.message, button || el, { durationMs: 2800, multiline: true });
      });
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
