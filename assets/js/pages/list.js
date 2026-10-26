var EdisonList = (function () {
  'use strict';

  var apps = [];
  var issues = [];
  var urls = [];
  var filing = false;
  var loading = false;
  var loadError = '';
  var loadToken = 0;
  var searchTimer = 0;
  var searchOpen = false;
  var queryText = '';
  var notice = '';
  var workingOpen = false;
  var sheetName = null;
  var filters = { app: '', type: '', priority: '', done: false };
  var draft = blankDraft();

  function blankDraft() {
    return { title: '', app: '', type: 'bug', priority: 'p2', notes: '' };
  }

  function esc(value) {
    return EdisonFormat.escapeHtml(value);
  }

  function isWide() {
    return window.matchMedia('(min-width: 1100px)').matches;
  }

  function emptyDetail() {
    return '<div class="empty">' + EdisonFormat.bulb('ready', 'xl') +
      '<h2>What needs you is at the top.</h2>' +
      '<p class="lede">Select a ticket. On a phone it fills this page.</p>' +
      '<p class="hint">n new ticket · / search · Esc closes a sheet</p></div>';
  }

  function fillEmptyDetail() {
    var pane = document.getElementById('detail');
    if (pane) pane.innerHTML = emptyDetail();
  }

  function appFilterLabel(value) {
    if (value === 'new') return 'New app';
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].repo === value) return apps[i].name;
    }
    return value;
  }

  function filterCount() {
    var count = 0;
    if (filters.app) count += 1;
    if (filters.type) count += 1;
    if (filters.priority) count += 1;
    if (filters.done) count += 1;
    return count;
  }

  function updateFilterButton() {
    var button = document.getElementById('filter-open');
    if (!button) return;
    var count = filterCount();
    button.textContent = count ? 'Filter · ' + count : 'Filter';
  }

  function ticketParams() {
    var params = new URLSearchParams(location.search);
    if (!params.get('repo') || !params.get('n')) return null;
    return { repo: params.get('repo'), number: params.get('n') };
  }

  function screen() {
    if (!EdisonAuth.getToken()) return 'home';
    return ticketParams() ? 'ticket' : 'home';
  }

  function applyChrome() {
    var phoneTicket = screen() === 'ticket' && !isWide();
    document.body.dataset.screen = screen();
    document.body.dataset.wide = isWide() ? 'true' : 'false';
    var back = document.getElementById('back');
    var brand = document.getElementById('brand');
    var wrap = document.getElementById('search-wrap');
    var searchButton = document.getElementById('search-open');
    var filterButton = document.getElementById('filter-open');
    var settings = document.getElementById('settings-link');
    if (back) back.hidden = !phoneTicket;
    if (brand) brand.hidden = phoneTicket || searchOpen;
    if (wrap) wrap.hidden = phoneTicket || !searchOpen;
    if (searchButton) {
      searchButton.hidden = phoneTicket || searchOpen;
      searchButton.setAttribute('aria-expanded', searchOpen && !phoneTicket ? 'true' : 'false');
    }
    if (filterButton) {
      filterButton.hidden = phoneTicket;
      filterButton.setAttribute('aria-expanded', sheetName === 'filter' ? 'true' : 'false');
    }
    if (settings) settings.hidden = phoneTicket;
    document.body.classList.toggle('sheet-open', !!sheetName);
  }

  function section(label, html) {
    if (!html) return '';
    return '<h2 class="section-label">' + esc(label) + '</h2>' + html;
  }

  function needsQuote(issue) {
    var text = EdisonCard.excerpt(issue.body);
    if (!text) return '';
    if (text.toLowerCase() === String(issue.title || '').trim().toLowerCase()) return '';
    return '<p class="quote">' + esc(text) + '</p>';
  }

  function paintList() {
    var list = document.getElementById('list');
    if (!list) return;
    var y = list.scrollTop;
    var html = '<div class="list-head"><h1>Tickets</h1><button type="button" class="primary new-btn" data-action="open-new">New ticket</button></div>';
    if (loadError) html += '<p class="banner" role="alert">' + esc(loadError) + '</p>';
    if (notice) html += '<div class="notice" role="status">' + esc(notice) + '</div>';
    var bits = [];
    if (queryText.trim()) bits.push('\u201c' + queryText.trim() + '\u201d');
    if (filters.app) bits.push(appFilterLabel(filters.app));
    if (filters.type) bits.push(EdisonLabels.TYPE_LABEL[filters.type] || filters.type);
    if (filters.priority) bits.push(filters.priority.toUpperCase());
    if (filters.done) bits.push('Done');
    if (bits.length) {
      html += '<div class="notice">' + esc(bits.join(' · ')) + ' <button type="button" class="text" data-action="clear-filters">Clear</button></div>';
    }
    if (!EdisonAuth.getToken()) {
      html += '<div class="empty">' + EdisonFormat.bulb('ready', 'xl') + '<h2>No tickets yet</h2><p class="lede">Add a GitHub token in Settings to see and file them.</p></div>';
    } else if (loading) {
      html += '<p class="hint loading-line">Looking for tickets…</p>';
    } else if (!issues.length) {
      var title = filters.done ? 'Nothing done matches' : (bits.length ? 'Nothing in this view' : 'No tickets yet');
      var lede = bits.length || filters.done ? 'Try another filter, or file a ticket.' : 'File one with New ticket.';
      html += '<div class="empty">' + EdisonFormat.bulb(filters.done ? 'done' : 'inbox', 'xl') + '<h2>' + esc(title) + '</h2><p class="lede">' + esc(lede) + '</p></div>';
    } else if (filters.done) {
      html += section('Done', '<div class="rows">' + issues.map(function (issue) {
        return EdisonCard.row(issue, apps);
      }).join('') + '</div>');
    } else {
      var groups = { 'needs-input': [], review: [], inbox: [], ready: [], working: [], parked: [] };
      issues.forEach(function (issue) {
        var stage = issue.state === 'closed' ? 'done' : EdisonLabels.stageOf(issue.labels);
        if (groups[stage]) groups[stage].push(issue);
        else groups.inbox.push(issue);
      });
      html += section('Needs you', groups['needs-input'].map(function (issue) {
        return EdisonCard.attention(issue, apps, 'needs', needsQuote(issue));
      }).join(''));
      html += section('In review', groups.review.map(function (issue) {
        return EdisonCard.attention(issue, apps, 'review', '');
      }).join(''));
      html += section('Inbox', groups.inbox.length ? '<div class="rows">' + groups.inbox.map(function (issue) {
        return EdisonCard.row(issue, apps);
      }).join('') + '</div>' : '');
      html += section('Ready', groups.ready.length ? '<div class="rows">' + groups.ready.map(function (issue) {
        return EdisonCard.row(issue, apps);
      }).join('') + '</div>' : '');
      if (groups.working.length) {
        html += '<button type="button" class="expander" data-action="toggle-working" aria-expanded="' + (workingOpen ? 'true' : 'false') + '">With the agent · ' + groups.working.length + '</button>';
        if (workingOpen) {
          html += '<div class="rows">' + groups.working.map(function (issue) {
            return EdisonCard.row(issue, apps);
          }).join('') + '</div>';
        }
      }
      html += section('Parked', groups.parked.length ? '<div class="rows">' + groups.parked.map(function (issue) {
        return EdisonCard.row(issue, apps);
      }).join('') + '</div>' : '');
    }
    list.innerHTML = html;
    list.scrollTop = y;
    updateFilterButton();
    markSelected();
  }

  function markSelected() {
    var params = new URLSearchParams(location.search);
    document.querySelectorAll('.row-link, .attention').forEach(function (link) {
      var on = link.getAttribute('data-repo') === params.get('repo') && link.getAttribute('data-number') === params.get('n');
      if (on) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function showDetail(repo, number) {
    markSelected();
    var pane = document.getElementById('detail');
    if (!pane) return;
    pane.scrollTop = 0;
    var workspace = document.querySelector('.workspace');
    if (workspace) workspace.scrollTop = 0;
    EdisonTicket.mount(pane, repo, number);
  }

  function openTicket(repo, number) {
    history.pushState({ ticket: true }, '', 'index.html?repo=' + encodeURIComponent(repo) + '&n=' + encodeURIComponent(number));
    applyChrome();
    showDetail(repo, number);
  }

  function openFromQuery() {
    applyChrome();
    var picked = ticketParams();
    if (!EdisonAuth.getToken() || !picked) {
      if (!picked) fillEmptyDetail();
      document.title = 'Edison';
      markSelected();
      return;
    }
    showDetail(picked.repo, picked.number);
  }

  function includeCreated(items, issue) {
    if (!issue) return items;
    var repo = EdisonFormat.repoFromUrl(issue.repository_url);
    if (filters.app === 'new') {
      if (!EdisonLabels.isNewApp(issue.labels)) return items;
    } else if (filters.app && filters.app !== repo) {
      return items;
    }
    if (filters.type && EdisonLabels.typeOf(issue.labels) !== filters.type) return items;
    if (filters.priority && EdisonLabels.priorityOf(issue.labels) !== filters.priority) return items;
    if (filters.done) {
      if (issue.state !== 'closed') return items;
    } else if (issue.state === 'closed') {
      return items;
    }
    var text = String(queryText || '').trim().toLowerCase();
    if (text && (issue.title + ' ' + (issue.body || '')).toLowerCase().indexOf(text) === -1) return items;
    var present = items.some(function (item) {
      return item.number === issue.number && EdisonFormat.repoFromUrl(item.repository_url) === repo;
    });
    if (!present) items.unshift(issue);
    return items;
  }

  function load(extraIssue) {
    var token = ++loadToken;
    loadError = '';
    if (!EdisonAuth.getToken()) {
      loading = false;
      issues = [];
      paintList();
      return Promise.resolve();
    }
    loading = true;
    paintList();
    var query = EdisonQuery.buildIssueQuery({
      owner: EDISON_CONFIG.OWNER,
      edisonRepo: EDISON_CONFIG.REPO,
      isNew: filters.app === 'new',
      appRepo: filters.app && filters.app !== 'new' ? filters.app : '',
      type: filters.type,
      priority: filters.priority,
      state: filters.done ? 'closed' : 'open',
      text: queryText
    });
    return EdisonApi.searchIssues(query).then(function (result) {
      if (token !== loadToken) return;
      loading = false;
      issues = includeCreated(result.items || [], extraIssue);
      paintList();
    }).catch(function (error) {
      if (token !== loadToken) return;
      loading = false;
      issues = [];
      loadError = error.message;
      paintList();
    });
  }

  function appOptions(selected, blankLabel) {
    var html = '<option value="">' + esc(blankLabel) + '</option>';
    apps.forEach(function (app) {
      var value = app.isNew ? 'new' : app.repo;
      html += '<option value="' + esc(value) + '"' + (selected === value ? ' selected' : '') + '>' + esc(app.name) + '</option>';
    });
    return html;
  }

  function segment(name, options, current) {
    return '<div class="segment" role="group" aria-label="' + esc(name) + '">' + options.map(function (option) {
      var pressed = option.value === current ? 'true' : 'false';
      return '<button type="button" data-segment="' + esc(name) + '" data-value="' + esc(option.value) + '" aria-pressed="' + pressed + '">' + esc(option.label) + '</button>';
    }).join('') + '</div>';
  }

  function typeOptions() {
    return [
      { value: 'bug', label: 'Bug' },
      { value: 'change', label: 'Change' },
      { value: 'feature', label: 'Feature' },
      { value: 'idea', label: 'Idea' },
      { value: 'query', label: 'Query' }
    ];
  }

  function priorityOptions(includeAny) {
    var options = includeAny ? [{ value: '', label: 'Any' }] : [];
    options.push({ value: 'p1', label: 'P1' }, { value: 'p2', label: 'P2' }, { value: 'p3', label: 'P3' });
    return options;
  }

  function renderUrls() {
    var list = document.getElementById('urls');
    if (!list) return;
    list.innerHTML = urls.map(function (url, index) {
      return '<li>' + esc(url) + '<button type="button" data-action="remove-link" data-index="' + index + '" aria-label="Remove link">×</button></li>';
    }).join('');
  }

  function newSheet() {
    var type = draft.app === 'new' ? 'idea' : (draft.type || 'bug');
    var html = '<form class="sheet stack" id="new-form" role="dialog" aria-modal="true" aria-labelledby="sheet-title">';
    html += '<h2 id="sheet-title">' + EdisonFormat.bulb('inbox') + ' New ticket</h2>';
    html += '<label class="field">Title<input id="title" name="title" required maxlength="120" value="' + esc(draft.title) + '" placeholder="What did you notice?" /></label>';
    html += '<label class="field">App<select id="app" name="app" required>' + appOptions(draft.app, 'Choose an app') + '</select></label>';
    html += '<input type="hidden" id="type" name="type" value="' + esc(type) + '" />';
    html += '<input type="hidden" id="priority" name="priority" value="' + esc(draft.priority || 'p2') + '" />';
    html += '<div class="field">Type' + segment('type', typeOptions(), type) + '</div>';
    html += '<div class="field">Priority' + segment('priority', priorityOptions(false), draft.priority || 'p2') + '</div>';
    html += '<p class="hint" id="new-app-hint"' + (draft.app === 'new' ? '' : ' hidden') + '>This stays in Edison until you create the repository. Deploy Agent stays hidden.</p>';
    html += '<label class="field">Description<textarea id="notes" name="notes" placeholder="Optional">' + esc(draft.notes) + '</textarea></label>';
    html += '<div class="field">Link<input id="url" name="url" type="url" inputmode="url" placeholder="https://" /></div>';
    html += '<button type="button" class="quiet" data-action="add-link">Add link</button>';
    html += '<ul class="chips" id="urls"></ul>';
    html += '<label class="field">Photos<input id="photos" name="photo" type="file" accept="image/*" capture="environment" multiple /></label>';
    html += '<div id="file-progress" class="file-progress" hidden>';
    html += '<div class="file-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="Filing the ticket">';
    html += '<div class="file-progress__bar"></div></div>';
    html += '<p id="file-progress-label" class="hint">Filing the ticket…</p></div>';
    html += '<div class="sheet-actions"><button type="submit" class="primary" id="save-ticket">File ticket</button>';
    html += '<button type="button" class="quiet" id="sheet-cancel" data-action="close-sheet">Cancel</button></div>';
    html += '</form>';
    return html;
  }

  function filterSheet() {
    var typeOptionsAny = [{ value: '', label: 'Any' }].concat(typeOptions());
    var html = '<form class="sheet stack" id="filter-form" role="dialog" aria-modal="true" aria-labelledby="filter-title">';
    html += '<h2 id="filter-title">Filter</h2>';
    html += '<label class="field">App<select name="app">' + appOptions(filters.app, 'All apps') + '</select></label>';
    html += '<div class="field">Type' + segment('filter-type', typeOptionsAny, filters.type) + '</div>';
    html += '<div class="field">Priority' + segment('filter-priority', priorityOptions(true), filters.priority) + '</div>';
    html += '<div class="field">Show' + segment('filter-done', [
      { value: 'open', label: 'Open' },
      { value: 'done', label: 'Done' }
    ], filters.done ? 'done' : 'open') + '</div>';
    html += '<div class="sheet-actions"><button type="submit" class="primary">Show tickets</button>';
    html += '<button type="button" class="quiet" data-action="close-sheet">Cancel</button></div>';
    html += '</form>';
    return html;
  }

  function paintSheets() {
    var root = document.getElementById('sheets');
    applyChrome();
    if (!root) return;
    if (!sheetName) {
      root.innerHTML = '';
      return;
    }
    var html = '<div class="backdrop">';
    if (sheetName === 'new') html += newSheet();
    else if (sheetName === 'filter') html += filterSheet();
    html += '</div>';
    root.innerHTML = html;
    renderUrls();
    var backdrop = root.querySelector('.backdrop');
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) closeSheet();
    });
    var focus = root.querySelector('input:not([type="hidden"]), select, textarea');
    if (focus) focus.focus();
  }

  function readDraft() {
    var title = document.getElementById('title');
    if (!title) return;
    draft.title = title.value;
    draft.app = document.getElementById('app').value;
    draft.type = document.getElementById('type').value;
    draft.priority = document.getElementById('priority').value;
    draft.notes = document.getElementById('notes').value;
  }

  function closeSheet(keepDraft) {
    if (filing) return;
    if (sheetName === 'new' && keepDraft !== false) readDraft();
    sheetName = null;
    paintSheets();
    paintList();
  }

  function openSheet(name) {
    if (filing) return;
    if (sheetName === name) {
      var focus = document.querySelector('#sheets input:not([type="hidden"]), #sheets select, #sheets textarea');
      if (focus) focus.focus();
      return;
    }
    if (sheetName === 'new') readDraft();
    sheetName = name;
    paintSheets();
  }

  function pressGroup(group, value) {
    group.querySelectorAll('button').forEach(function (peer) {
      peer.setAttribute('aria-pressed', peer.getAttribute('data-value') === value ? 'true' : 'false');
    });
  }

  function addLink() {
    var form = document.getElementById('new-form');
    var field = form && form.querySelector('[name="url"]');
    var value = field ? field.value.trim() : '';
    if (!/^https?:\/\//i.test(value)) {
      BriefMessage.show('Paste a full http or https link', field || form);
      return;
    }
    urls.push(value);
    field.value = '';
    renderUrls();
  }

  function setProgress(fraction, label) {
    var wrap = document.getElementById('file-progress');
    if (!wrap) return;
    var track = wrap.querySelector('[role="progressbar"]');
    var bar = wrap.querySelector('.file-progress__bar');
    var pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
    wrap.hidden = false;
    wrap.classList.toggle('is-busy', pct < 100);
    bar.style.width = pct + '%';
    track.setAttribute('aria-valuenow', String(pct));
    track.setAttribute('aria-valuetext', label);
    document.getElementById('file-progress-label').textContent = label;
  }

  function resetProgress() {
    var wrap = document.getElementById('file-progress');
    if (!wrap) return;
    var track = wrap.querySelector('[role="progressbar"]');
    var bar = wrap.querySelector('.file-progress__bar');
    wrap.hidden = true;
    wrap.classList.remove('is-busy');
    bar.style.width = '0';
    track.setAttribute('aria-valuenow', '0');
    document.getElementById('file-progress-label').textContent = 'Filing the ticket…';
  }

  function uploadPhotos(repo, issue, files) {
    var chain = Promise.resolve(issue.body || '');
    var hold = {};
    var isNew = EdisonLabels.isNewApp(issue.labels);
    files.forEach(function (file, index) {
      chain = chain.then(function (body) {
        setProgress(0.4 + (0.55 * (index / files.length)), 'Adding photo ' + (index + 1) + ' of ' + files.length);
        return ImageCompress.compressToTarget(file, 100 * 1024).then(function (blob) {
          return ImageCompress.blobToBase64(blob);
        }).then(function (base64) {
          var path = 'attachments/' + repo + '/' + issue.number + '/' + Date.now() + '-' + index + '.jpg';
          return EdisonApi.storeTicketPhoto(repo, issue.number, path, base64, 'Attach photo to ' + repo + '#' + issue.number, hold, isNew).then(function (saved) {
            return body + '\n\n![' + (file.name || 'photo') + '](' + saved.url + ')';
          });
        });
      });
    });
    return chain.then(function (body) {
      if (!files.length) return issue;
      return EdisonApi.updateIssue(repo, issue.number, { body: body });
    });
  }

  function submitTicket(event) {
    event.preventDefault();
    if (document.activeElement && document.activeElement.id === 'url') {
      addLink();
      return;
    }
    var button = document.getElementById('save-ticket');
    var title = document.getElementById('title').value.trim();
    var app = document.getElementById('app').value;
    var type = document.getElementById('type').value;
    var priority = document.getElementById('priority').value || 'p2';
    var notes = document.getElementById('notes').value.trim();
    var files = Array.prototype.slice.call(document.getElementById('photos').files || []);
    if (filing) return;
    if (!EdisonAuth.getToken()) {
      BriefMessage.show('Add a GitHub token in Settings first', button);
      return;
    }
    if (!title || !app) {
      BriefMessage.show('Add a title and an app', button);
      return;
    }
    if (app === 'new') type = 'idea';
    var repo = app === 'new' ? EDISON_CONFIG.REPO : app;
    var labels = ['edison', 'type:' + type, 'stage:inbox', priority];
    if (app === 'new') labels.push('app:new');
    var body = notes || title;
    if (urls.length) {
      body += '\n\n## Links\n\n' + urls.map(function (url) { return '- ' + url; }).join('\n');
    }
    filing = true;
    button.disabled = true;
    document.getElementById('sheet-cancel').disabled = true;
    setProgress(files.length ? 0.12 : 0.2, 'Filing the ticket…');
    EdisonApi.ensureLabels(repo).then(function () {
      setProgress(files.length ? 0.4 : 0.65, 'Filing the ticket…');
      return EdisonApi.createIssue(repo, { title: title, body: body, labels: labels });
    }).then(function (issue) {
      if (!issue.repository_url) {
        issue.repository_url = 'https://api.github.com/repos/' + EDISON_CONFIG.OWNER + '/' + repo;
      }
      if (!files.length) setProgress(1, 'Ticket created');
      return uploadPhotos(repo, issue, files).then(function () {
        return issue;
      });
    }).then(function (issue) {
      setProgress(1, 'Ticket created');
      window.setTimeout(function () {
        filing = false;
        resetProgress();
        draft = blankDraft();
        urls = [];
        filters.done = false;
        notice = 'Filed. It is in the inbox.';
        closeSheet(false);
        load(issue).then(function () {
          openTicket(repo, issue.number);
        });
      }, 400);
    }).catch(function (error) {
      filing = false;
      button.disabled = false;
      var cancel = document.getElementById('sheet-cancel');
      if (cancel) cancel.disabled = false;
      resetProgress();
      BriefMessage.show(error.message, button, { durationMs: 3000, multiline: true });
    });
  }

  function pressedValue(form, name) {
    var button = form.querySelector('[data-segment="' + name + '"][aria-pressed="true"]');
    return button ? button.getAttribute('data-value') : '';
  }

  function applyFilter(event) {
    event.preventDefault();
    var form = event.target;
    filters.app = String(new FormData(form).get('app') || '');
    filters.type = pressedValue(form, 'filter-type');
    filters.priority = pressedValue(form, 'filter-priority');
    filters.done = pressedValue(form, 'filter-done') === 'done';
    notice = '';
    sheetName = null;
    paintSheets();
    load();
  }

  function clearFilters() {
    filters = { app: '', type: '', priority: '', done: false };
    queryText = '';
    searchOpen = false;
    notice = '';
    var search = document.getElementById('search');
    if (search) search.value = '';
    applyChrome();
    load();
  }

  function openSearch() {
    searchOpen = true;
    applyChrome();
    var search = document.getElementById('search');
    if (search) search.focus();
  }

  function closeSearch() {
    searchOpen = false;
    queryText = '';
    var search = document.getElementById('search');
    if (search) search.value = '';
    applyChrome();
    load();
  }

  function onSegment(button) {
    var group = button.parentNode;
    var value = button.getAttribute('data-value');
    var kind = button.getAttribute('data-segment');
    if (kind === 'type' && document.getElementById('app') && document.getElementById('app').value === 'new') {
      value = 'idea';
    }
    pressGroup(group, value);
    if (kind === 'type' && document.getElementById('type')) document.getElementById('type').value = value;
    if (kind === 'priority' && document.getElementById('priority')) document.getElementById('priority').value = value;
  }

  function onClick(event) {
    if (event.target.closest('#back')) {
      event.preventDefault();
      if (history.state && history.state.ticket) history.back();
      else {
        history.pushState({}, '', 'index.html');
        openFromQuery();
      }
      return;
    }
    var segmentButton = event.target.closest('[data-segment]');
    if (segmentButton) {
      onSegment(segmentButton);
      return;
    }
    var actionEl = event.target.closest('[data-action]');
    if (actionEl) {
      var action = actionEl.getAttribute('data-action');
      if (action === 'open-search') openSearch();
      else if (action === 'open-new') openSheet('new');
      else if (action === 'open-filter') openSheet('filter');
      else if (action === 'close-sheet') closeSheet();
      else if (action === 'clear-filters') clearFilters();
      else if (action === 'toggle-working') {
        workingOpen = !workingOpen;
        paintList();
      } else if (action === 'add-link') addLink();
      else if (action === 'remove-link') {
        urls.splice(Number(actionEl.getAttribute('data-index')), 1);
        renderUrls();
      }
      return;
    }
    var link = event.target.closest('a[data-repo]');
    if (!link) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    openTicket(link.getAttribute('data-repo'), link.getAttribute('data-number'));
  }

  function onSubmit(event) {
    if (event.target.id === 'new-form') submitTicket(event);
    else if (event.target.id === 'filter-form') applyFilter(event);
  }

  function onChange(event) {
    var target = event.target;
    if (!target.form || target.form.id !== 'new-form' || target.id !== 'app') return;
    var hint = document.getElementById('new-app-hint');
    var isNew = target.value === 'new';
    if (hint) hint.hidden = !isNew;
    if (isNew) {
      document.getElementById('type').value = 'idea';
      var group = target.form.querySelector('[data-segment="type"]');
      if (group) pressGroup(group.parentNode, 'idea');
    }
  }

  function onKey(event) {
    var tag = (event.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (event.key === 'Escape') {
      if (filing) return;
      if (sheetName) {
        event.preventDefault();
        closeSheet();
      } else if (searchOpen) {
        event.preventDefault();
        closeSearch();
      }
      return;
    }
    if (typing || filing) return;
    if (event.key === 'n') {
      event.preventDefault();
      openSheet('new');
    }
    if (event.key === '/' && !(screen() === 'ticket' && !isWide())) {
      event.preventDefault();
      openSearch();
    }
  }

  function onSearchInput(event) {
    queryText = event.target.value;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(function () {
      notice = '';
      load();
    }, 300);
  }

  function init() {
    document.body.addEventListener('click', onClick);
    document.body.addEventListener('submit', onSubmit);
    document.body.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    window.addEventListener('popstate', openFromQuery);
    window.addEventListener('resize', applyChrome);
    document.getElementById('search').addEventListener('input', onSearchInput);
    applyChrome();
    if (ticketParams() && EdisonAuth.getToken()) {
      var pane = document.getElementById('detail');
      if (pane) pane.innerHTML = '<p class="hint loading-line">Opening the ticket\u2026</p>';
    }
    EdisonApps.load().then(function (list) {
      apps = list;
      if (sheetName) {
        if (sheetName === 'new') readDraft();
        paintSheets();
      }
      return load();
    }).then(function () {
      openFromQuery();
    }).catch(function (error) {
      loadError = error.message;
      loading = false;
      paintList();
    });
  }

  return { init: init };
})();
