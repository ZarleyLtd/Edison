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

  function linkButton(href, label) {
    return '<a class="quiet" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' +
      esc(label) + '<span class="sr">, opens outside Edison</span></a>';
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
      var session = { editing: false, confirmClose: false, confirmMerge: false, confirmEdit: false, editDraft: null, editChange: null, checks: null, mergeable: null, sheet: null, noteError: '', noteDraft: '', noteLinks: [], noteFiles: [], noteLinkOpen: false, editingComment: null, reviewLinks: '', reviewReady: false, reviewLoading: false };
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
        el.addEventListener('input', function (event) {
          if (!el._ctx || event.target.name !== 'note' || !event.target.closest('#note-form')) return;
          el._ctx.session.noteDraft = event.target.value;
        });
        el.addEventListener('change', function (event) {
          if (el._ctx) onNotePhotos(event, el._ctx);
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
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close ticket</button>';
    } else if (stage === 'inbox' || stage === 'parked') {
      hint = 'Marking ready does not start the agent. Deploy Agent does that.';
      primary = '<button type="button" class="primary" data-action="ready">Mark ready</button>';
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close ticket</button>';
    } else if ((stage === 'ready' || stage === 'needs-input') && !rulesReady(rules)) {
      hint = 'Deploy Agent waits until the agent rules are on the default branch.';
      if (rules && rules.state === 'open' && rules.pull && rules.pull.html_url) link = externalLink(rules.pull.html_url, 'Open rules pull request');
      else link = '<a href="settings.html">Settings</a>';
      if (rules && rules.state === 'error' && rules.message) hint = rules.message;
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close ticket</button>';
    } else if (stage === 'ready') {
      if (openPull(ctx.pulls)) {
        hint = 'A pull request is already open. Deploy Agent continues it and includes every note since the last round.' + pullHint(ctx.pulls);
      } else {
        hint = 'Posts the agent mention on the GitHub issue and moves this to Working. The agent stops at a pull request.';
      }
      primary = '<button type="button" class="primary" data-action="send">Deploy Agent</button>';
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close ticket</button>';
    } else if (stage === 'needs-input') {
      if (openPull(ctx.pulls)) {
        hint = 'Notes wait until you tap Deploy Agent. That continues this pull request and includes every note since the last round.' + pullHint(ctx.pulls);
      } else {
        hint = 'Answer above, then tap Deploy Agent. That posts the agent mention again.';
      }
      primary = '<button type="button" class="primary" data-action="send">Deploy Agent</button>';
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close ticket</button>';
    } else if (stage === 'working') {
      hint = openPull(ctx.pulls)
        ? 'The agent is updating this pull request. A note saved now is included the next time you send.'
        : 'The agent is working. It stops at a pull request.';
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close ticket</button>';
    } else if (stage === 'review') {
      var pr = openPull(ctx.pulls);
      if (pr) {
        hint = 'Add notes for what should change. Send to agent continues this pull request and picks them up. Merge when you want this version live. Close ticket closes the pull request without merging.' + pullHint(ctx.pulls);
        primary = '<button type="button" class="primary" data-action="send">Send to agent</button>';
        link = '<button type="button" class="secondary" data-action="merge-ask">Merge PR</button>';
      } else if (ctx.pulls.length) {
        hint = 'The pull request is merged. Close this ticket when you are finished.';
      } else {
        hint = 'Close this ticket when you are finished.';
      }
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close ticket</button>';
    } else {
      quiet = '<button type="button" class="quiet" data-action="close-ask">Close ticket</button>';
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
        html += '<div class="sheet-actions"><button type="submit" class="primary">Save</button>';
        html += '<button type="button" class="quiet" data-action="cancel-edit">Cancel</button></div>';
      }
      html += '</form>';
    } else {
      html += '<div class="ticket-title">' + EdisonFormat.bulb(stage, 'lg') + '<h1>' + esc(issue.title) + '</h1></div>';
    }
    html += '</div><div class="ticket-rest">';
    html += '<div class="ticket-links">' + linkButton(issue.html_url, '#' + issue.number + ' on GitHub');
    if (app && app.pagesUrl) html += linkButton(app.pagesUrl, 'Live site');
    var listed = shownPulls(ctx.pulls);
    if (listed.length) html += linkButton(listed[0].html_url, 'Pull request');
    if (stage === 'review' && listed.length) html += session.reviewLinks || '<span data-review hidden></span>';
    html += '</div>';
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
    if (!session.editing) {
      html += '<div class="block-title"><h2>Description</h2><button type="button" class="text" data-action="edit">Edit</button></div>';
      html += '<div class="prose" id="ticket-body">' + (issue.body ? EdisonFormat.renderMarkdown(issue.body) : '<p class="hint">No description yet.</p>') + '</div>';
    }
    html += '<div class="block-title"><h2>Notes</h2></div><ol class="notes">';
    if (!visibleNotes.length) html += '<li class="hint">No notes yet.</li>';
    visibleNotes.forEach(function (comment) {
      html += noteItemHtml(ctx, comment);
    });
    html += '</ol>';
    html += noteComposer(session);
    html += '</div></div>' + actionBar(ctx) + '</article>';
    el.innerHTML = html;
    var nextScroller = el.querySelector('.ticket-scroll');
    if (nextScroller && getComputedStyle(nextScroller).display !== 'contents') nextScroller.scrollTop = y;
    else el.scrollTop = y;
    if (session.editing && !session.confirmEdit) {
      var title = el.querySelector('#edit-form [name="title"]');
      if (title) title.focus();
    }
  }

  function paperclipIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M21.44 11.05l-8.49 8.49a5.5 5.5 0 0 1-7.78-7.78l8.49-8.48a3.5 3.5 0 0 1 4.95 4.95l-8.49 8.48a1.5 1.5 0 0 1-2.12-2.12l7.78-7.78"/></svg>';
  }

  function cameraIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.2 4.5l1.1 1.8h3.4l1.1-1.8H19a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h4.2zM12 9.2A3.8 3.8 0 1 0 15.8 13 3.8 3.8 0 0 0 12 9.2z"/></svg>';
  }

  function noteAttachmentChips(session) {
    var html = '';
    (session.noteLinks || []).forEach(function (url, index) {
      html += '<li>' + esc(url) + '<button type="button" data-action="remove-note-link" data-index="' + index + '" aria-label="Remove link">×</button></li>';
    });
    (session.noteFiles || []).forEach(function (file, index) {
      html += '<li>' + esc(file.name || 'Photo') + '<button type="button" data-action="remove-note-file" data-index="' + index + '" aria-label="Remove photo">×</button></li>';
    });
    return html;
  }

  function noteComposer(session) {
    var html = '<form id="note-form" class="note-compose">';
    html += '<label class="field">Add a note<textarea name="note" placeholder="Add a note. This does not start the agent.">' + esc(session.noteDraft || '') + '</textarea></label>';
    html += '<ul class="chips" id="note-attachments"' + (noteAttachmentChips(session) ? '' : ' hidden') + '>' + noteAttachmentChips(session) + '</ul>';
    html += '<div class="note-tools">';
    html += '<button type="button" class="icon-btn" data-action="toggle-note-link" aria-label="Add a link" aria-expanded="' + (session.noteLinkOpen ? 'true' : 'false') + '">' + paperclipIcon() + '</button>';
    html += '<button type="button" class="icon-btn" data-action="pick-note-photo" aria-label="Add a photo">' + cameraIcon() + '</button>';
    html += '<input id="note-photos" type="file" accept="image/*" multiple hidden />';
    html += '<button type="submit" class="primary">Add note</button></div>';
    html += '<div class="note-link-row"' + (session.noteLinkOpen ? '' : ' hidden') + '>';
    html += '<input name="url" type="text" inputmode="url" placeholder="https://" aria-label="Link" autocomplete="off" />';
    html += '<button type="button" class="quiet" data-action="confirm-note-link">Add link</button></div>';
    html += '</form>';
    return html;
  }

  function paintNoteAttachments(ctx) {
    var list = ctx.el.querySelector('#note-attachments');
    if (!list) return;
    var html = noteAttachmentChips(ctx.session);
    list.innerHTML = html;
    list.hidden = !html;
  }

  function closeNoteLinkRow(ctx) {
    ctx.session.noteLinkOpen = false;
    var row = ctx.el.querySelector('.note-link-row');
    var toggle = ctx.el.querySelector('[data-action="toggle-note-link"]');
    if (row) row.hidden = true;
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  }

  function confirmNoteLink(ctx, field) {
    var value = field ? field.value.trim() : '';
    if (!value) {
      BriefMessage.show('Add a link', field || ctx.el.querySelector('[data-action="toggle-note-link"]'));
      return;
    }
    if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
    if (!/^https?:\/\/\S+$/i.test(value)) {
      BriefMessage.show('Add a link', field || ctx.el.querySelector('[data-action="toggle-note-link"]'));
      return;
    }
    ctx.session.noteLinks.push(value);
    if (field) field.value = '';
    paintNoteAttachments(ctx);
    closeNoteLinkRow(ctx);
    var note = ctx.el.querySelector('#note-form textarea');
    if (note) note.focus();
  }

  function onNotePhotos(event, ctx) {
    var input = event.target;
    if (!input || input.id !== 'note-photos' || !input.files) return;
    Array.prototype.forEach.call(input.files, function (file) {
      ctx.session.noteFiles.push(file);
    });
    input.value = '';
    paintNoteAttachments(ctx);
  }

  function uploadNotePhotos(repo, number, files, button) {
    var markdown = '';
    var chain = Promise.resolve();
    files.forEach(function (file, index) {
      chain = chain.then(function () {
        if (button) button.textContent = 'Adding photo ' + (index + 1) + ' of ' + files.length;
        return ImageCompress.compressToTarget(file, 100 * 1024).then(function (blob) {
          return ImageCompress.blobToBase64(blob);
        }).then(function (base64) {
          var path = 'attachments/' + repo + '/' + number + '/' + Date.now() + '-' + index + '.jpg';
          return EdisonApi.putContents(EDISON_CONFIG.REPO, path, 'Attach photo to ' + repo + '#' + number, base64).then(function (saved) {
            var url = (saved.content && saved.content.download_url) ||
              ('https://raw.githubusercontent.com/' + EDISON_CONFIG.OWNER + '/' + EDISON_CONFIG.REPO + '/main/' + path);
            markdown += (markdown ? '\n\n' : '') + '![' + (file.name || 'photo') + '](' + url + ')';
          });
        });
      });
    });
    return chain.then(function () { return markdown; });
  }

  function noteItemHtml(ctx, comment) {
    var canEditNotes = !agentDeployed(ctx.issue, ctx.comments);
    var who = comment.user && comment.user.login ? comment.user.login : 'note';
    var mine = !!(comment.user && comment.user.login) && !EdisonQuery.isAgentComment(comment);
    var editingThis = canEditNotes && ctx.session.editingComment && String(ctx.session.editingComment) === String(comment.id);
    var text = EdisonQuery.noteText(comment.body);
    var noteClass = mine ? 'note-mine' : 'note-other';
    if (editingThis) noteClass += ' note-editing';
    var html = '<li class="' + noteClass + '"' + (comment.id ? ' data-comment="' + esc(comment.id) + '"' : '') + '>';
    if (editingThis) {
      html += '<form id="note-edit-form" class="stack">';
      html += '<label class="field">Note<textarea name="note">' + esc(text) + '</textarea></label>';
      html += '<div class="sheet-actions"><button type="submit" class="primary">Save</button>';
      html += '<button type="button" class="quiet" data-action="cancel-note">Cancel</button></div></form>';
    } else {
      html += '<div class="note-head"><p class="meta">' + esc(who) + ' \u00b7 ' + esc(EdisonFormat.timeAgo(comment.created_at)) + '</p>';
      if (canEditNotes && comment.id) html += '<button type="button" class="text" data-action="edit-note" data-id="' + esc(comment.id) + '">Edit</button>';
      html += '</div><div class="prose">' + EdisonFormat.renderMarkdown(text) + '</div>';
    }
    return html + '</li>';
  }

  function rememberComment(ctx, comment) {
    if (!comment) return;
    var list = ctx.comments;
    var index = -1;
    for (var i = 0; i < list.length; i++) {
      if (comment.id && String(list[i].id) === String(comment.id)) {
        index = i;
        break;
      }
    }
    if (index === -1) list.push(comment);
    else list[index] = comment;
    freshComment = { repo: ctx.repo, number: ctx.issue.number, comment: comment };
  }

  function placeNote(ctx, comment) {
    var list = ctx.el.querySelector('ol.notes');
    if (!list || !comment || !EdisonQuery.noteText(comment.body)) return null;
    var empty = list.querySelector('li.hint');
    if (empty) empty.remove();
    var html = noteItemHtml(ctx, comment);
    var selector = comment.id != null ? '[data-comment="' + String(comment.id).replace(/"/g, '') + '"]' : '';
    var existing = selector ? list.querySelector(selector) : null;
    if (existing) existing.outerHTML = html;
    else list.insertAdjacentHTML('beforeend', html);
    return selector ? list.querySelector(selector) : list.lastElementChild;
  }

  function segment(name, options, current) {
    return '<div class="segment" role="group" aria-label="' + esc(name) + '">' + options.map(function (option) {
      var pressed = option.value === current ? 'true' : 'false';
      return '<button type="button" data-segment="' + esc(name) + '" data-value="' + esc(option.value) + '" aria-pressed="' + pressed + '">' + esc(option.label) + '</button>';
    }).join('') + '</div>';
  }

  function confirmDialog(title, hint, actions) {
    return '<div class="backdrop confirm-backdrop"><div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">' +
      '<h2 id="confirm-title">' + esc(title) + '</h2>' +
      '<p>' + esc(hint) + '</p>' +
      '<div class="confirm-actions">' + actions + '</div></div></div>';
  }

  function confirmOverlay(ctx) {
    var session = ctx.session;
    if (session.confirmEdit) {
      return confirmDialog(
        'Save changes',
        editWarning(session.editChange),
        '<button type="button" class="primary" data-action="edit-yes">Save anyway</button>' +
          '<button type="button" class="quiet" data-action="edit-no">Don\u2019t save</button>'
      );
    }
    if (session.confirmMerge) return mergeConfirm(ctx);
    if (session.confirmClose) return closeConfirm(ctx);
    return '';
  }

  function dismissOverlay(ctx) {
    var session = ctx.session;
    if (session.confirmEdit) {
      var kept = currentEdit(ctx.el);
      if (kept) session.editDraft = kept;
    }
    session.confirmClose = false;
    session.confirmMerge = false;
    session.confirmEdit = false;
    session.sheet = null;
    ctx.draw();
  }

  function paintSheet(ctx) {
    var root = sheetRoot();
    var session = ctx.session;
    var confirm = confirmOverlay(ctx);
    if (!confirm && !session.sheet) {
      root.innerHTML = '';
      document.body.classList.remove('ticket-sheet');
      return;
    }
    document.body.classList.add('ticket-sheet');
    var html = confirm;
    if (!html) {
      html = '<div class="backdrop">';
      if (session.sheet === 'details') html += detailsSheet(ctx);
      else if (session.sheet === 'create') html += createSheet(ctx);
      html += '</div>';
    }
    root.innerHTML = html;
    root.onclick = function (event) {
      var pressed = event.target.closest('[data-action]');
      var action = pressed && pressed.getAttribute('data-action');
      if (event.target.classList.contains('backdrop') || action === 'close-ticket-sheet') {
        dismissOverlay(ctx);
        return;
      }
      if (pressed) onArticleClick(event, ctx);
    };
    root.onsubmit = function (event) {
      if (event.target.id === 'details-form') saveDetailsSheet(event, ctx);
      else if (event.target.id === 'create-form') submitCreate(event, ctx);
    };
    var focus = confirm
      ? root.querySelector('.confirm-actions .danger, .confirm-actions .primary, .confirm-actions button')
      : root.querySelector('input, select, textarea');
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
    if (!button || (!ctx.el.contains(button) && !button.closest('#ticket-sheets'))) return;
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
      closeTicket(ctx, button);
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
    } else if (action === 'toggle-note-link') {
      session.noteLinkOpen = !session.noteLinkOpen;
      var row = ctx.el.querySelector('.note-link-row');
      var toggle = ctx.el.querySelector('[data-action="toggle-note-link"]');
      if (row) row.hidden = !session.noteLinkOpen;
      if (toggle) toggle.setAttribute('aria-expanded', session.noteLinkOpen ? 'true' : 'false');
      if (session.noteLinkOpen) {
        var linkField = ctx.el.querySelector('#note-form [name="url"]');
        if (linkField) linkField.focus();
      }
    } else if (action === 'confirm-note-link') {
      confirmNoteLink(ctx, ctx.el.querySelector('#note-form [name="url"]'));
    } else if (action === 'remove-note-link') {
      session.noteLinks.splice(Number(button.getAttribute('data-index')), 1);
      paintNoteAttachments(ctx);
    } else if (action === 'pick-note-photo') {
      var picker = ctx.el.querySelector('#note-photos');
      if (picker) picker.click();
    } else if (action === 'remove-note-file') {
      session.noteFiles.splice(Number(button.getAttribute('data-index')), 1);
      paintNoteAttachments(ctx);
    }
  }

  function submitNote(ctx, form) {
    var note = String(new FormData(form).get('note') || '').trim();
    var links = ctx.session.noteLinks.slice();
    var files = ctx.session.noteFiles.slice();
    var button = form.querySelector('button[type="submit"]');
    if (!note && !links.length && !files.length) {
      BriefMessage.show('Add a note, a link, or a photo', button);
      return;
    }
    ctx.session.noteDraft = note;
    if (button) {
      button.disabled = true;
      button.textContent = files.length ? 'Adding photo 1 of ' + files.length : 'Adding\u2026';
    }
    uploadNotePhotos(ctx.repo, ctx.issue.number, files, button).then(function (images) {
      var parts = [];
      if (note) parts.push(note);
      if (links.length) parts.push(links.join('\n'));
      if (images) parts.push(images);
      return EdisonApi.createComment(ctx.repo, ctx.issue.number, parts.join('\n\n'));
    }).then(function (created) {
      rememberComment(ctx, created);
      ctx.session.noteDraft = '';
      ctx.session.noteLinks = [];
      ctx.session.noteFiles = [];
      ctx.session.noteLinkOpen = false;
      var found = placeNote(ctx, created);
      if (!found) return mount(ctx.el, ctx.repo, ctx.issue.number);
      var field = form.querySelector('textarea');
      if (field) field.value = '';
      var urlField = form.querySelector('[name="url"]');
      if (urlField) urlField.value = '';
      closeNoteLinkRow(ctx);
      paintNoteAttachments(ctx);
      if (button) {
        button.disabled = false;
        button.textContent = 'Add note';
      }
      if (found.scrollIntoView) found.scrollIntoView({ block: 'nearest' });
      BriefMessage.show('Note added', found);
    }).catch(function (error) {
      if (button) {
        button.disabled = false;
        button.textContent = 'Add note';
      }
      BriefMessage.show(error.message, button || form, { durationMs: 2500, multiline: true });
    });
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
      var urlField = form.querySelector('[name="url"]');
      if (urlField && document.activeElement === urlField) {
        confirmNoteLink(ctx, urlField);
        return;
      }
      submitNote(ctx, form);
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
      var previous = null;
      ctx.comments.forEach(function (item) {
        if (String(item.id) === String(id)) previous = item;
      });
      var comment = updated || { id: id, body: text };
      if (previous) {
        if (!comment.user) comment.user = previous.user;
        if (!comment.created_at) comment.created_at = previous.created_at;
      }
      ctx.session.editingComment = null;
      rememberComment(ctx, comment);
      var found = placeNote(ctx, comment);
      if (!found) return mount(ctx.el, ctx.repo, ctx.issue.number);
      BriefMessage.show('Note saved', found);
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
      return linkButton(
        EdisonQuery.previewPageUrl(EDISON_CONFIG.OWNER, ctx.repo, sha, page),
        reviewLabel(page, pages.length === 1)
      );
    }).join('');
    ctx.session.reviewLinks = html;
    ctx.el.querySelectorAll('[data-review]').forEach(function (slot) {
      slot.innerHTML = html;
      slot.hidden = false;
    });
  }

  function closeConfirm(ctx) {
    var open = EdisonQuery.openPullsByAge(ctx.pulls);
    var hint = 'Close this ticket? It moves to Done.';
    if (open.length === 1) {
      hint = 'Close this ticket without merging? The pull request will be closed, its branch deleted, and the ticket moves to Done.';
    } else if (open.length > 1) {
      hint = 'Close this ticket without merging? The open pull requests will be closed, their branches deleted, and the ticket moves to Done.';
    }
    return confirmDialog(
      'Close ticket',
      hint,
      '<button type="button" class="primary" data-action="close-yes">Close ticket</button>' +
        '<button type="button" class="quiet" data-action="close-no">Keep it open</button>'
    );
  }

  function closeOpenPulls(repo, pulls) {
    var open = EdisonQuery.openPullsByAge(pulls);
    return open.reduce(function (chain, pr) {
      return chain.then(function () {
        return EdisonApi.pull(repo, pr.number).then(function (full) {
          return EdisonApi.closePull(repo, pr.number).then(function () {
            var branch = EdisonQuery.discardBranch(full, EDISON_CONFIG.OWNER, repo);
            if (!branch) return null;
            return EdisonApi.deleteBranch(repo, branch);
          });
        });
      });
    }, Promise.resolve());
  }

  function closeTicket(ctx, button) {
    if (button) button.disabled = true;
    closeOpenPulls(ctx.repo, ctx.pulls).then(function () {
      return setState(ctx.el, ctx.repo, ctx.issue, 'closed', button);
    }).catch(function (error) {
      if (button) button.disabled = false;
      BriefMessage.show(error.message, button || ctx.el, { durationMs: 2800, multiline: true });
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
      button = '<button type="button" class="primary" data-action="merge-yes">Merge anyway</button>';
    }
    return confirmDialog(
      'Merge pull request',
      hint,
      button + '<button type="button" class="quiet" data-action="merge-no">Don\u2019t merge</button>'
    );
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
    if (ctx.session.reviewReady || ctx.session.reviewLoading || !pulls.length) return;
    ctx.session.reviewLoading = true;
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
        if (ctx.token !== generation) return;
        if (index !== 0) return;
        ctx.session.reviewLoading = false;
        if (!parts) return;
        var runs = (parts[0] && parts[0].check_runs) || [];
        var failed = runs.filter(function (run) { return run.conclusion === 'failure'; }).length;
        ctx.session.checks = { failed: failed, total: runs.length };
        ctx.session.reviewReady = true;
        if (parts[2] && parts[2].private === false) paintReviewLinks(ctx, sha, parts[1]);
      }).catch(function () {
        if (index === 0 && ctx.token === generation) ctx.session.reviewLoading = false;
      });
    });
  }

  function updateLabels(el, repo, issue, labels) {
    return EdisonApi.ensureLabels(repo).then(function () {
      return EdisonApi.updateIssue(repo, issue.number, { labels: labels });
    }).then(function () {
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
