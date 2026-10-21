(function () {
  'use strict';

  var STAGES = {
    inbox: 'Inbox',
    ready: 'Ready',
    working: 'Working',
    'needs-input': 'Needs you',
    review: 'In review',
    parked: 'Parked',
    done: 'Done'
  };

  var TYPES = {
    bug: 'Bug',
    change: 'Change',
    feature: 'Feature',
    idea: 'Idea'
  };

  var APPS = [
    'New app', '4NextBus', '4NextDart', '4NextLocalTrain', '4NextTram', 'BGS',
    'CrossGunsSnooker', 'FamilyTree', 'GolfScoreChecker', 'helloworld',
    'HelloWorldCursor', 'ierne-snooker', 'RNR', 'Scrabble', 'Splitify',
    'theConfessional', 'theGolfApp', 'Edison'
  ];

  var tickets = [
    {
      id: 'stops', n: 48, app: '4NextBus', type: 'bug', priority: 'p1', stage: 'needs-input',
      ago: '2h', rules: 'merged', isNew: false,
      title: "Yesterday's departures on the stop screen",
      body: 'After midnight the stop page still lists yesterday evening. Refreshing does not clear them.',
      ask: 'Which source should I trust when they disagree, the live feed or the timetable?',
      notes: [
        { who: 'you', when: '2h', text: 'Seen on the 84 towards town. The 23:10 is still sitting at the top.' },
        { who: 'cursor', when: '1h', text: 'Which source should I trust when they disagree, the live feed or the timetable?' }
      ],
      pr: null
    },
    {
      id: 'saturday', n: 31, app: 'BGS', type: 'feature', priority: 'p2', stage: 'review',
      ago: '1d', rules: 'merged', isNew: false,
      title: 'Saturday timetable',
      body: 'Saturday service is missing from the week view. Add it beside Friday, using the same stop order.',
      ask: '',
      notes: [{ who: 'cursor', when: '1d', text: 'Opened a pull request. Saturday is copied from the Friday pattern with the two early journeys removed.' }],
      pr: { title: 'Add Saturday service', checks: '3 checks passed', url: 'https://github.com/ZarleyLtd/BGS/pull/18' }
    },
    {
      id: 'token', n: 12, app: 'HelloWorldCursor', type: 'bug', priority: 'p2', stage: 'inbox',
      ago: '5h', rules: 'merged', isNew: false,
      title: 'Token field clears itself',
      body: 'Tap the token box, switch away, and come back. The characters are gone before Save.',
      ask: '',
      notes: [],
      pr: null
    },
    {
      id: 'next', n: 7, app: 'Edison', type: 'change', priority: 'p2', stage: 'ready',
      ago: '3h', rules: 'merged', isNew: false,
      title: 'One next action on each ticket',
      body: 'The ticket should say what to do next. Stage, type, and priority stay available, but they are not the first thing on the page.',
      ask: '',
      notes: [],
      pr: null
    },
    {
      id: 'course', n: 4, app: 'GolfScoreChecker', type: 'feature', priority: 'p3', stage: 'ready',
      ago: '4d', rules: 'missing', isNew: false,
      title: 'Remember the last course',
      body: 'Open the app and offer the course from last time, instead of an empty picker.',
      ask: '',
      notes: [],
      pr: null
    },
    {
      id: 'badge', n: 29, app: 'BGS', type: 'change', priority: 'p2', stage: 'working',
      ago: '20m', rules: 'merged', isNew: false,
      title: 'Late bus badge uses the wrong colour',
      body: 'A bus under two minutes late is shown in red. Amber is enough until it is five minutes late.',
      ask: '',
      notes: [{ who: 'cursor', when: '18m', text: 'Working from the ready comment. I will stop at a pull request.' }],
      pr: null
    },
    {
      id: 'tuesday', n: 3, app: 'New app', type: 'idea', priority: 'p2', stage: 'inbox',
      ago: '1d', rules: 'merged', isNew: true,
      title: 'Scorecard for the Tuesday group',
      body: 'A phone page for eight players. Enter holes, see the running total, nothing else.',
      ask: '',
      notes: [],
      pr: null
    },
    {
      id: 'dictionary', n: 15, app: 'Scrabble', type: 'idea', priority: 'p3', stage: 'parked',
      ago: '2w', rules: 'merged', isNew: false,
      title: 'Dictionary check on a phone',
      body: 'Look up a word without leaving the score sheet. Parked until the score sheet itself is settled.',
      ask: '',
      notes: [],
      pr: null
    },
    {
      id: 'settle', n: 22, app: 'Splitify', type: 'bug', priority: 'p2', stage: 'done',
      ago: '6d', rules: 'merged', isNew: false,
      title: 'Settle screen counts a person twice',
      body: 'Alex appeared in the share list twice when the receipt was edited.',
      ask: '',
      notes: [{ who: 'you', when: '6d', text: 'Merged. The duplicate was the edited line, not a second person.' }],
      pr: { title: 'Count each person once', checks: 'Merged', url: 'https://github.com/ZarleyLtd/Splitify/pull/9' }
    }
  ];

  var repos = [
    { name: '4NextBus', rules: 'merged' },
    { name: '4NextDart', rules: 'merged' },
    { name: '4NextLocalTrain', rules: 'merged' },
    { name: '4NextTram', rules: 'merged' },
    { name: 'BGS', rules: 'merged' },
    { name: 'CrossGunsSnooker', rules: 'merged' },
    { name: 'Edison', rules: 'merged' },
    { name: 'FamilyTree', rules: 'merged' },
    { name: 'GolfScoreChecker', rules: 'missing' },
    { name: 'HelloWorldCursor', rules: 'merged' },
    { name: 'ierne-snooker', rules: 'open', pr: 'https://github.com/ZarleyLtd/ierne-snooker/pull/4' },
    { name: 'Scrabble', rules: 'merged' },
    { name: 'Splitify', rules: 'merged' }
  ];

  var state = {
    query: '',
    searchOpen: false,
    filters: { app: '', type: '', priority: '', done: false },
    sheet: null,
    notice: '',
    workingOpen: false,
    confirmClose: false,
    editing: false,
    noteError: '',
    draftLinks: [],
    photoName: '',
    vendor: 'cursor',
    signedIn: 'mrjoh',
    tokenMessage: '',
    tokenError: false,
    nextNumber: 60,
    paintedId: ''
  };

  var newDraft = blankDraft();

  function blankDraft() {
    return { title: '', app: '', type: 'bug', priority: 'p2', body: '', links: [], photo: '' };
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function externalLink(href, label) {
    return '<a class="external" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' +
      esc(label) + '<span class="external-mark" aria-hidden="true">↗️</span><span class="sr">, opens outside Edison</span></a>';
  }

  function paragraphs(text) {
    return String(text || '').split(/\n\n/).filter(Boolean).map(function (part) {
      return '<p>' + esc(part) + '</p>';
    }).join('');
  }

  function screen() {
    var hash = location.hash || '#/';
    if (hash.indexOf('#/settings') === 0) return 'settings';
    if (hash.indexOf('#/t/') === 0) return 'ticket';
    return 'home';
  }

  function ticketId() {
    var hash = location.hash || '';
    if (hash.indexOf('#/t/') !== 0) return '';
    return decodeURIComponent(hash.slice(4));
  }

  function ticketById(id) {
    for (var i = 0; i < tickets.length; i++) {
      if (tickets[i].id === id) return tickets[i];
    }
    return null;
  }

  function isWide() {
    return window.matchMedia('(min-width: 1100px)').matches;
  }

  function vendorMention() {
    return state.vendor === 'claude' ? '@claude' : '@cursor';
  }

  function visibleTickets() {
    var q = state.query.trim().toLowerCase();
    return tickets.filter(function (ticket) {
      if (state.filters.done) {
        if (ticket.stage !== 'done') return false;
      } else if (ticket.stage === 'done') {
        return false;
      }
      if (state.filters.app && ticket.app !== state.filters.app) return false;
      if (state.filters.type && ticket.type !== state.filters.type) return false;
      if (state.filters.priority && ticket.priority !== state.filters.priority) return false;
      if (!q) return true;
      var hay = (ticket.title + ' ' + ticket.body + ' ' + ticket.app).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function filterSummary() {
    var bits = [];
    if (state.filters.app) bits.push(state.filters.app);
    if (state.filters.type) bits.push(TYPES[state.filters.type]);
    if (state.filters.priority) bits.push(state.filters.priority.toUpperCase());
    if (state.filters.done) bits.push('Done');
    return bits;
  }

  var BULB =
    '<svg class="bulb-svg" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M16 3a8 8 0 0 0-4.6 14.5c.4.4.6.9.6 1.4V21a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.1c0-.5.2-1 .6-1.4A8 8 0 0 0 16 3zm-2.2 20.2h4.4V25a2.2 2.2 0 0 1-4.4 0v-1.8z"/></svg>';

  function bulb(stage, size) {
    return '<span class="bulb-icon stage-' + esc(stage || 'inbox') + (size ? ' ' + size : '') + '">' + BULB + '</span>';
  }

  function meta(ticket, includePriority) {
    var bits = [ticket.app, TYPES[ticket.type] || ticket.type];
    if (includePriority !== false) bits.push(ticket.priority.toUpperCase());
    bits.push(ticket.ago);
    return bits.map(esc).join(' · ');
  }

  function row(ticket) {
    var current = ticket.id === ticketId() ? ' aria-current="page"' : '';
    var pri = '<span class="pri ' + esc(ticket.priority) + '">' + esc(ticket.priority.toUpperCase()) + '</span>';
    return '<a class="row-link' + (ticket.stage === 'done' ? ' done' : '') + '" href="#/t/' + encodeURIComponent(ticket.id) + '"' + current + '>' +
      bulb(ticket.stage) +
      '<span class="row-title">' + esc(ticket.title) + '</span>' + pri +
      '<span class="meta">' + meta(ticket, false) + '</span></a>';
  }

  function attention(ticket, kind) {
    var current = ticket.id === ticketId() ? ' aria-current="page"' : '';
    var extra = '';
    if (kind === 'needs' && ticket.ask) extra = '<p class="quote">' + esc(ticket.ask) + '</p>';
    if (kind === 'review' && ticket.pr) extra = '<p class="meta ok">' + esc(ticket.pr.checks) + '</p>';
    return '<a class="attention ' + kind + '" href="#/t/' + encodeURIComponent(ticket.id) + '"' + current + '>' +
      '<div class="attention-head">' + bulb(ticket.stage) + '<h2>' + esc(ticket.title) + '</h2></div>' + extra +
      '<p class="meta">' + meta(ticket) + '</p></a>';
  }

  function section(label, html) {
    if (!html) return '';
    return '<h2 class="section-label">' + esc(label) + '</h2>' + html;
  }

  function paintList() {
    var list = document.getElementById('list');
    var items = visibleTickets();
    var html = '<div class="list-head"><h1>Tickets</h1><button type="button" class="primary new-btn" data-action="open-new">New ticket</button></div>';
    if (state.notice) html += '<p class="notice" role="status">' + esc(state.notice) + '</p>';
    var summary = filterSummary();
    if (summary.length || state.query) {
      var bits = summary.slice();
      if (state.query) bits.unshift('“' + state.query + '”');
      html += '<p class="notice">' + esc(bits.join(' · ')) + ' <button type="button" class="text" data-action="clear-filters">Clear</button></p>';
    }
    if (!items.length) {
      html += '<div class="empty"><h2>' + (state.filters.done ? 'Nothing done matches' : 'Nothing in this view') + '</h2><p class="lede">Try another filter, or file a ticket.</p></div>';
    } else if (state.filters.done) {
      html += section('Done', '<div class="rows">' + items.map(row).join('') + '</div>');
    } else {
      var groups = { 'needs-input': '', review: '', inbox: '', ready: '', working: '', parked: '' };
      items.forEach(function (ticket) {
        if (ticket.stage === 'needs-input') groups['needs-input'] += attention(ticket, 'needs');
        else if (ticket.stage === 'review') groups.review += attention(ticket, 'review');
        else if (groups[ticket.stage] != null) groups[ticket.stage] += row(ticket);
      });
      html += section('Needs you', groups['needs-input']);
      html += section('In review', groups.review);
      html += section('Inbox', groups.inbox ? '<div class="rows">' + groups.inbox + '</div>' : '');
      html += section('Ready', groups.ready ? '<div class="rows">' + groups.ready + '</div>' : '');
      if (groups.working) {
        var count = items.filter(function (ticket) { return ticket.stage === 'working'; }).length;
        html += '<button type="button" class="expander" data-action="toggle-working" aria-expanded="' + (state.workingOpen ? 'true' : 'false') + '">With the agent · ' + count + '</button>';
        if (state.workingOpen) html += '<div class="rows">' + groups.working + '</div>';
      }
      html += section('Parked', groups.parked ? '<div class="rows">' + groups.parked + '</div>' : '');
    }
    html += '<p class="preview-note">Preview with sample tickets. Nothing is saved.</p>';
    list.innerHTML = html;
    var filterBtn = document.getElementById('filter-open');
    if (filterBtn) filterBtn.textContent = summary.length ? 'Filter · ' + summary.length : 'Filter';
  }

  function actions(ticket) {
    if (ticket.stage === 'done') {
      return { primary: 'Reopen', primaryAction: 'reopen', note: 'This ticket is done. Reopen puts it back in the inbox.' };
    }
    if (ticket.isNew) {
      return { primary: 'Create repository', primaryAction: 'open-create', quiet: 'Close', note: 'Creates the GitHub repository and a first ticket. Cloning onto this PC is a separate step.' };
    }
    if (ticket.stage === 'inbox' || ticket.stage === 'parked') {
      return { primary: 'Mark ready', primaryAction: 'mark-ready', quiet: 'Close', note: 'Marking ready does not start the agent. Switch on does that.' };
    }
    if ((ticket.stage === 'ready' || ticket.stage === 'needs-input') && ticket.rules !== 'merged') {
      return { link: '#/settings', linkLabel: 'Settings', quiet: 'Close', note: 'Switch on waits until the agent rules are on the default branch. Start the rules pull request in Settings.' };
    }
    if (ticket.stage === 'ready') {
      return { primary: 'Switch on', primaryAction: 'switch-on', quiet: 'Close', note: 'Posts ' + vendorMention() + ' on the GitHub issue and moves this to Working. The agent stops at a pull request.' };
    }
    if (ticket.stage === 'needs-input') {
      return { primary: 'Switch on', primaryAction: 'switch-on', quiet: 'Close', note: 'Answer above, then switch on. That posts ' + vendorMention() + ' again.' };
    }
    if (ticket.stage === 'working') {
      return { quiet: 'Close', note: 'The agent is working. It will stop at a pull request. Edison does not merge it.' };
    }
    if (ticket.stage === 'review') {
      return {
        link: ticket.pr ? ticket.pr.url : 'https://github.com/ZarleyLtd',
        linkLabel: 'Open pull request',
        external: true,
        quiet: 'Close ticket',
        note: 'Merge on GitHub. Close this ticket when you are finished.'
      };
    }
    return { quiet: 'Close', note: '' };
  }

  function actionBar(ticket) {
    if (state.confirmClose) {
      return '<div class="action-bar"><p class="hint">Close this ticket? It moves to Done.</p>' +
        '<button type="button" class="danger" data-action="close-yes">Close ticket</button>' +
        '<button type="button" class="quiet" data-action="close-no">Keep it open</button></div>';
    }
    var spec = actions(ticket);
    var html = '<div class="action-bar">';
    if (spec.note) html += '<p class="hint">' + esc(spec.note) + '</p>';
    if (spec.primary) html += '<button type="button" class="primary" data-action="' + spec.primaryAction + '">' + esc(spec.primary) + '</button>';
    if (spec.link) {
      html += spec.external
        ? externalLink(spec.link, spec.linkLabel)
        : '<a href="' + esc(spec.link) + '">' + esc(spec.linkLabel) + '</a>';
    }
    if (spec.quiet) html += '<button type="button" class="quiet" data-action="close-ask">' + esc(spec.quiet) + '</button>';
    html += '</div>';
    return html;
  }

  function paintDetail() {
    var pane = document.getElementById('detail');
    var y = pane.scrollTop;
    var id = ticketId();
    var mode = screen();
    if (mode === 'settings') {
      pane.innerHTML = settingsHtml();
      pane.scrollTop = 0;
      return;
    }
    if (mode !== 'ticket') {
      pane.innerHTML = '<div class="empty">' + bulb('ready', 'xl') + '<h2>What needs you is at the top.</h2><p class="lede">Select a ticket. On a phone it opens on its own page.</p><p class="hint">n new ticket · / search · Esc closes a sheet</p></div>';
      return;
    }
    var ticket = ticketById(id);
    if (!ticket) {
      pane.innerHTML = '<div class="empty"><h2>That ticket is not in this preview.</h2></div>';
      return;
    }
    if (state.paintedId !== id) {
      y = 0;
      state.confirmClose = false;
      state.editing = false;
      state.noteError = '';
    }
    state.paintedId = id;
    document.title = ticket.title + ' · Edison';
    var html = '<article class="ticket">';
    html += '<p class="kicker">' + esc(STAGES[ticket.stage]) + ' · ' + meta(ticket) + '</p>';
    if (state.editing) {
      html += '<form id="edit-form" class="stack">';
      html += '<label class="field">Title<input name="title" required value="' + esc(ticket.title) + '" /></label>';
      html += '<label class="field">Description<textarea name="body">' + esc(ticket.body) + '</textarea></label>';
      html += '<button type="submit" class="primary">Save</button>';
      html += '<button type="button" class="quiet" data-action="cancel-edit">Cancel</button></form>';
    } else {
      html += '<div class="ticket-title">' + bulb(ticket.stage, 'lg') + '<h1>' + esc(ticket.title) + '</h1></div>';
    }
    html += actionBar(ticket);
    html += '<p class="meta"><button type="button" class="text" data-action="open-details">Type, priority, stage</button>';
    html += ' · ' + externalLink('https://github.com/ZarleyLtd/' + encodeURIComponent(ticket.app === 'New app' ? 'Edison' : ticket.app) + '/issues/' + ticket.n, '#' + ticket.n + ' on GitHub') + '</p>';
    if (ticket.ask && ticket.stage === 'needs-input') {
      html += '<div class="ask"><p class="meta">The agent asked</p><p class="quote">' + esc(ticket.ask) + '</p></div>';
    }
    if (ticket.pr && ticket.stage === 'review') {
      html += '<div class="pr-panel"><p class="meta">Pull request</p><h2>' + externalLink(ticket.pr.url, ticket.pr.title) + '</h2><p class="ok">' + esc(ticket.pr.checks) + '</p></div>';
    }
    if (ticket.repoReady) {
      html += '<div class="pr-panel"><p class="ok">Repository ready</p><p>On this PC:</p><code class="clone">' + esc(ticket.clone) + '</code>';
      if (ticket.scaffoldId) html += '<p><a href="#/t/' + encodeURIComponent(ticket.scaffoldId) + '">Open the first ticket</a></p>';
      html += '</div>';
    }
    if (!state.editing) {
      html += '<div class="block-title"><h2>Description</h2><button type="button" class="text" data-action="edit">Edit</button></div>';
      html += '<div class="prose">' + (paragraphs(ticket.body) || '<p class="hint">No description yet.</p>') + '</div>';
    }
    html += '<div class="block-title"><h2>Notes</h2></div><ol class="notes">';
    if (!ticket.notes.length) html += '<li class="hint">No notes yet.</li>';
    ticket.notes.forEach(function (note) {
      html += '<li><p class="meta">' + esc(note.who) + ' · ' + esc(note.when) + '</p><div class="prose">' + paragraphs(note.text) + '</div></li>';
    });
    html += '</ol>';
    html += '<form id="note-form" class="stack">';
    html += '<label class="field">Add a note<textarea name="note" placeholder="Reply, or add something the agent should know"></textarea></label>';
    if (state.noteError) html += '<p class="inline-error" role="alert">' + esc(state.noteError) + '</p>';
    html += '<button type="submit" class="primary">Add note</button></form>';
    html += '</article>';
    pane.innerHTML = html;
    pane.scrollTop = y;
  }

  function settingsHtml() {
    document.title = 'Settings · Edison';
    var html = '<div class="settings stack">';
    html += '<h1>' + bulb('ready', 'lg') + 'Settings</h1>';
    html += '<section class="stack"><h2>GitHub</h2>';
    html += '<p>' + (state.signedIn ? 'Signed in as ' + esc(state.signedIn) + '.' : 'No token on this browser.') + '</p>';
    html += '<label class="field">Personal access token<input id="token" type="password" autocomplete="off" /></label>';
    html += '<button type="button" class="primary" id="save-token" data-action="save-token">Save token</button>';
    html += '<button type="button" class="quiet" data-action="clear-token">Remove token</button>';
    if (state.tokenMessage) html += '<p class="' + (state.tokenError ? 'inline-error' : 'hint') + '" role="status">' + esc(state.tokenMessage) + '</p>';
    html += '<p class="hint">The token stays in this browser. It needs access to the ZarleyLtd repositories you want in the list. ' + externalLink('https://github.com/settings/tokens/new?scopes=repo&description=Edison', 'Create a token') + '</p></section>';
    html += '<section class="stack"><h2>Agent</h2>';
    html += '<label class="field">Vendor<select id="vendor">';
    html += '<option value="cursor"' + (state.vendor === 'cursor' ? ' selected' : '') + '>Cursor</option>';
    html += '<option value="claude"' + (state.vendor === 'claude' ? ' selected' : '') + '>Claude</option>';
    html += '</select></label>';
    html += '<button type="button" class="primary" data-action="save-agent">Save agent</button>';
    html += '<p class="hint" id="agent-status">Switch on comments ' + vendorMention() + '.</p></section>';
    html += '<section><h2>Repositories</h2><p class="hint">Switch on stays off until the rules file is on the default branch.</p>';
    repos.forEach(function (repo, index) {
      html += '<div class="repo"><strong>' + esc(repo.name) + '</strong><span>';
      if (repo.rules === 'merged') html += '<span class="ok">Rules on the default branch</span>';
      else if (repo.rules === 'open') html += externalLink(repo.pr, 'Open rules pull request');
      else html += '<button type="button" class="quiet" data-action="start-rules" data-index="' + index + '">Start rules pull request</button>';
      html += '</span></div>';
    });
    html += '</section></div>';
    return html;
  }

  function segment(name, options, current) {
    return '<div class="segment" role="group" aria-label="' + esc(name) + '">' + options.map(function (option) {
      var pressed = option.value === current ? 'true' : 'false';
      return '<button type="button" data-segment="' + esc(name) + '" data-value="' + esc(option.value) + '" aria-pressed="' + pressed + '">' + esc(option.label) + '</button>';
    }).join('') + '</div>';
  }

  function paintSheets() {
    var root = document.getElementById('sheets');
    document.body.classList.toggle('sheet-open', !!state.sheet);
    if (!state.sheet) {
      root.innerHTML = '';
      return;
    }
    var html = '<div class="backdrop">';
    if (state.sheet === 'new') html += newSheet();
    else if (state.sheet === 'filter') html += filterSheet();
    else if (state.sheet === 'details') html += detailsSheet();
    else if (state.sheet === 'create') html += createSheet();
    html += '</div>';
    root.innerHTML = html;
    var backdrop = root.querySelector('.backdrop');
    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) closeSheet();
    });
    var focus = root.querySelector('input, select, textarea, button');
    if (focus) focus.focus();
  }

  function newSheet() {
    var html = '<form class="sheet stack" id="new-form">';
    html += '<h2>' + bulb('inbox') + ' New ticket</h2>';
    html += '<label class="field">Title<input name="title" required maxlength="120" value="' + esc(newDraft.title) + '" placeholder="What did you notice?" /></label>';
    html += '<label class="field">App<select name="app" required><option value="">Choose an app</option>';
    APPS.forEach(function (app) {
      html += '<option value="' + esc(app) + '"' + (newDraft.app === app ? ' selected' : '') + '>' + esc(app) + '</option>';
    });
    html += '</select></label>';
    html += '<div class="field">Type' + segment('type', [
      { value: 'bug', label: 'Bug' },
      { value: 'change', label: 'Change' },
      { value: 'feature', label: 'Feature' },
      { value: 'idea', label: 'Idea' }
    ], newDraft.type) + '</div>';
    html += '<div class="field">Priority' + segment('priority', [
      { value: 'p1', label: 'P1' },
      { value: 'p2', label: 'P2' },
      { value: 'p3', label: 'P3' }
    ], newDraft.priority) + '</div>';
    if (newDraft.app === 'New app') html += '<p class="hint">This stays in Edison until you create the repository. Switch on stays hidden.</p>';
    html += '<label class="field">Description<textarea name="body" placeholder="Optional">' + esc(newDraft.body) + '</textarea></label>';
    html += '<div class="field">Link<input name="url" type="url" inputmode="url" placeholder="https://" /></div>';
    html += '<button type="button" class="quiet" data-action="add-link">Add link</button>';
    if (newDraft.links.length) {
      html += '<ul class="chips">';
      newDraft.links.forEach(function (link, index) {
        html += '<li>' + esc(link) + '<button type="button" data-action="remove-link" data-index="' + index + '" aria-label="Remove link">×</button></li>';
      });
      html += '</ul>';
    }
    html += '<label class="field">Photo<input name="photo" type="file" accept="image/*" /></label>';
    if (newDraft.photo) html += '<p class="hint">' + esc(newDraft.photo) + '</p>';
    html += '<div class="sheet-actions"><button type="submit" class="primary">File ticket</button><button type="button" class="quiet" data-action="close-sheet">Cancel</button></div>';
    html += '</form>';
    return html;
  }

  function filterSheet() {
    var html = '<form class="sheet stack" id="filter-form">';
    html += '<h2>Filter</h2>';
    html += '<label class="field">App<select name="app"><option value="">All apps</option>';
    APPS.forEach(function (app) {
      html += '<option value="' + esc(app) + '"' + (state.filters.app === app ? ' selected' : '') + '>' + esc(app) + '</option>';
    });
    html += '</select></label>';
    html += '<div class="field">Type' + segment('filter-type', [
      { value: '', label: 'Any' },
      { value: 'bug', label: 'Bug' },
      { value: 'change', label: 'Change' },
      { value: 'feature', label: 'Feature' },
      { value: 'idea', label: 'Idea' }
    ], state.filters.type) + '</div>';
    html += '<div class="field">Priority' + segment('filter-priority', [
      { value: '', label: 'Any' },
      { value: 'p1', label: 'P1' },
      { value: 'p2', label: 'P2' },
      { value: 'p3', label: 'P3' }
    ], state.filters.priority) + '</div>';
    html += '<div class="field">Show' + segment('filter-done', [
      { value: 'open', label: 'Open' },
      { value: 'done', label: 'Done' }
    ], state.filters.done ? 'done' : 'open') + '</div>';
    html += '<div class="sheet-actions"><button type="submit" class="primary">Show tickets</button><button type="button" class="quiet" data-action="close-sheet">Cancel</button></div>';
    html += '</form>';
    return html;
  }

  function detailsSheet() {
    var ticket = ticketById(ticketId());
    if (!ticket) return '';
    var html = '<form class="sheet stack" id="details-form">';
    html += '<h2>Type, priority, stage</h2>';
    html += '<div class="field">Type' + segment('detail-type', [
      { value: 'bug', label: 'Bug' },
      { value: 'change', label: 'Change' },
      { value: 'feature', label: 'Feature' },
      { value: 'idea', label: 'Idea' }
    ], ticket.type) + '</div>';
    html += '<div class="field">Priority' + segment('detail-priority', [
      { value: 'p1', label: 'P1' },
      { value: 'p2', label: 'P2' },
      { value: 'p3', label: 'P3' }
    ], ticket.priority) + '</div>';
    html += '<div class="field">Stage' + segment('detail-stage', [
      { value: 'inbox', label: 'Inbox' },
      { value: 'ready', label: 'Ready' },
      { value: 'needs-input', label: 'Needs you' },
      { value: 'parked', label: 'Parked' }
    ], ticket.stage) + '</div>';
    html += '<p class="hint">Working and In review follow the agent and the pull request. Closing the ticket is how you mark it done.</p>';
    html += '<div class="sheet-actions"><button type="submit" class="primary">Save</button><button type="button" class="quiet" data-action="close-sheet">Cancel</button></div>';
    html += '</form>';
    return html;
  }

  function createSheet() {
    var ticket = ticketById(ticketId());
    var suggested = ticket ? suggestRepo(ticket.title) : '';
    var html = '<form class="sheet stack" id="create-form">';
    html += '<h2>Create repository</h2>';
    html += '<p class="hint">Creates a public ZarleyLtd repository, files the first ticket there, and closes this idea. This preview does not call GitHub.</p>';
    html += '<label class="field">Repository name<input name="repoName" required value="' + esc(suggested) + '" /></label>';
    html += '<div class="sheet-actions"><button type="submit" class="primary">Create ZarleyLtd repository</button><button type="button" class="quiet" data-action="close-sheet">Cancel</button></div>';
    html += '</form>';
    return html;
  }

  function suggestRepo(title) {
    var parts = String(title || '').replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/);
    return parts.map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    }).join('').slice(0, 40) || 'NewApp';
  }

  function readDraftFromSheet() {
    var form = document.getElementById('new-form');
    if (!form) return;
    var data = new FormData(form);
    newDraft.title = String(data.get('title') || '');
    newDraft.app = String(data.get('app') || '');
    newDraft.body = String(data.get('body') || '');
    var photo = form.querySelector('[name="photo"]');
    if (photo && photo.files && photo.files[0]) newDraft.photo = photo.files[0].name;
  }

  function closeSheet() {
    if (state.sheet === 'new') readDraftFromSheet();
    state.sheet = null;
    paintSheets();
    paintList();
  }

  function applyChrome() {
    var mode = screen();
    var wide = isWide();
    document.body.dataset.screen = mode;
    document.body.dataset.wide = wide ? 'true' : 'false';
    var phoneTicket = mode === 'ticket' && !wide;
    document.getElementById('back').hidden = !(phoneTicket || mode === 'settings');
    document.getElementById('brand').hidden = phoneTicket || mode === 'settings' || state.searchOpen;
    document.getElementById('search-wrap').hidden = !state.searchOpen || mode === 'settings';
    document.getElementById('search-open').hidden = state.searchOpen || mode === 'settings' || phoneTicket;
    document.getElementById('filter-open').hidden = mode === 'settings' || phoneTicket;
    document.getElementById('settings-link').hidden = mode === 'settings' || phoneTicket;
    if (mode !== 'ticket') document.title = mode === 'settings' ? 'Settings · Edison' : 'Edison';
  }

  function render() {
    if (screen() !== 'ticket') {
      state.confirmClose = false;
      state.editing = false;
      state.noteError = '';
    }
    applyChrome();
    paintList();
    paintDetail();
    paintSheets();
  }

  function markReady(ticket) {
    ticket.stage = 'ready';
    ticket.ago = 'just now';
    state.notice = '';
    render();
  }

  function switchOn(ticket) {
    ticket.stage = 'working';
    ticket.ago = 'just now';
    ticket.notes.push({
      who: state.vendor === 'claude' ? 'claude' : 'cursor',
      when: 'just now',
      text: 'Switched on. Mentioned ' + vendorMention() + '.'
    });
    state.workingOpen = true;
    state.notice = 'Switched on. The agent has this ticket.';
    render();
  }

  document.body.addEventListener('click', function (event) {
    var button = event.target.closest('[data-segment]');
    if (button) {
      var group = button.parentNode;
      group.querySelectorAll('button').forEach(function (peer) {
        peer.setAttribute('aria-pressed', peer === button ? 'true' : 'false');
      });
      var kind = button.getAttribute('data-segment');
      var value = button.getAttribute('data-value');
      if (kind === 'type') newDraft.type = value;
      if (kind === 'priority') newDraft.priority = value;
      if (kind === 'filter-type') state.filters.type = value;
      if (kind === 'filter-priority') state.filters.priority = value;
      if (kind === 'filter-done') state.filters.done = value === 'done';
      if (kind === 'detail-type' || kind === 'detail-priority' || kind === 'detail-stage') {
        button.form.dataset[kind] = value;
      }
      return;
    }
    var el = event.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    if (action === 'open-search') {
      state.searchOpen = true;
      applyChrome();
      document.getElementById('search').focus();
      return;
    }
    if (action === 'open-new') {
      state.sheet = 'new';
      paintSheets();
      return;
    }
    if (action === 'open-filter') {
      state.sheet = 'filter';
      paintSheets();
      return;
    }
    if (action === 'close-sheet') {
      closeSheet();
      return;
    }
    if (action === 'clear-filters') {
      state.filters = { app: '', type: '', priority: '', done: false };
      state.query = '';
      state.searchOpen = false;
      document.getElementById('search').value = '';
      render();
      return;
    }
    if (action === 'toggle-working') {
      state.workingOpen = !state.workingOpen;
      paintList();
      return;
    }
    if (action === 'add-link') {
      readDraftFromSheet();
      var form = document.getElementById('new-form');
      var url = String(new FormData(form).get('url') || '').trim();
      if (!/^https?:\/\//i.test(url)) {
        var field = form.querySelector('[name="url"]');
        field.setCustomValidity('Paste a full http or https link');
        field.reportValidity();
        return;
      }
      form.querySelector('[name="url"]').setCustomValidity('');
      newDraft.links.push(url);
      paintSheets();
      return;
    }
    if (action === 'remove-link') {
      readDraftFromSheet();
      newDraft.links.splice(Number(el.getAttribute('data-index')), 1);
      paintSheets();
      return;
    }
    var ticket = ticketById(ticketId());
    if (!ticket && action !== 'save-token' && action !== 'clear-token' && action !== 'save-agent' && action !== 'start-rules') return;
    if (action === 'mark-ready') markReady(ticket);
    if (action === 'switch-on') switchOn(ticket);
    if (action === 'close-ask') {
      state.confirmClose = true;
      paintDetail();
    }
    if (action === 'close-no') {
      state.confirmClose = false;
      paintDetail();
    }
    if (action === 'close-yes') {
      ticket.stage = 'done';
      ticket.ago = 'just now';
      state.confirmClose = false;
      state.notice = 'Closed. It is under Done.';
      state.filters.done = false;
      location.hash = '#/';
    }
    if (action === 'reopen') {
      ticket.stage = 'inbox';
      ticket.ago = 'just now';
      state.notice = 'Reopened in the inbox.';
      render();
    }
    if (action === 'edit') {
      state.editing = true;
      paintDetail();
      var title = document.querySelector('#edit-form [name="title"]');
      if (title) title.focus();
    }
    if (action === 'cancel-edit') {
      state.editing = false;
      paintDetail();
    }
    if (action === 'open-details') {
      state.sheet = 'details';
      paintSheets();
    }
    if (action === 'open-create') {
      state.sheet = 'create';
      paintSheets();
    }
    if (action === 'save-token') saveToken();
    if (action === 'clear-token') {
      state.signedIn = '';
      state.tokenError = false;
      state.tokenMessage = 'Token removed from this browser.';
      paintDetail();
    }
    if (action === 'save-agent') {
      state.vendor = document.getElementById('vendor').value;
      var status = document.getElementById('agent-status');
      status.textContent = state.vendor === 'claude'
        ? 'Saved. Switch on comments @claude. Copy the Claude workflow into an app before it will run there.'
        : 'Saved. Switch on comments @cursor.';
    }
    if (action === 'start-rules') {
      var repo = repos[Number(el.getAttribute('data-index'))];
      repo.rules = 'open';
      repo.pr = 'https://github.com/ZarleyLtd/' + repo.name + '/pull/1';
      var match = tickets.filter(function (item) { return item.app === repo.name; });
      match.forEach(function (item) { item.rules = 'open'; });
      paintDetail();
    }
  });

  document.body.addEventListener('submit', function (event) {
    var form = event.target;
    if (form.id === 'new-form') {
      event.preventDefault();
      readDraftFromSheet();
      var photoInput = form.querySelector('[name="photo"]');
      if (photoInput && photoInput.files && photoInput.files[0]) newDraft.photo = photoInput.files[0].name;
      if (!newDraft.title.trim() || !newDraft.app) return;
      var id = 't' + state.nextNumber;
      var body = newDraft.body.trim();
      if (newDraft.links.length) body += (body ? '\n\n' : '') + newDraft.links.map(function (link) { return link; }).join('\n');
      if (newDraft.photo) body += (body ? '\n\n' : '') + 'Photo: ' + newDraft.photo;
      tickets.unshift({
        id: id,
        n: state.nextNumber++,
        app: newDraft.app,
        type: newDraft.app === 'New app' ? 'idea' : newDraft.type,
        priority: newDraft.priority,
        stage: 'inbox',
        ago: 'just now',
        rules: newDraft.app === 'GolfScoreChecker' ? 'missing' : 'merged',
        isNew: newDraft.app === 'New app',
        title: newDraft.title.trim(),
        body: body || newDraft.title.trim(),
        ask: '',
        notes: [],
        pr: null
      });
      state.notice = 'Filed. It is in the inbox.';
      state.filters.done = false;
      newDraft = blankDraft();
      state.sheet = null;
      location.hash = '#/t/' + encodeURIComponent(id);
      return;
    }
    if (form.id === 'filter-form') {
      event.preventDefault();
      state.filters.app = String(new FormData(form).get('app') || '');
      state.sheet = null;
      if (screen() === 'ticket' && !isWide()) location.hash = '#/';
      else render();
      return;
    }
    if (form.id === 'note-form') {
      event.preventDefault();
      var ticket = ticketById(ticketId());
      var note = String(new FormData(form).get('note') || '').trim();
      if (!note) {
        state.noteError = 'Write a note first.';
        paintDetail();
        return;
      }
      state.noteError = '';
      ticket.notes.push({ who: 'you', when: 'just now', text: note });
      if (ticket.stage === 'needs-input') ticket.ask = '';
      paintDetail();
      var list = document.querySelector('#detail .notes');
      if (list && list.lastElementChild) list.lastElementChild.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (form.id === 'edit-form') {
      event.preventDefault();
      var current = ticketById(ticketId());
      var data = new FormData(form);
      var title = String(data.get('title') || '').trim();
      if (!title) return;
      current.title = title;
      current.body = String(data.get('body') || '');
      state.editing = false;
      state.notice = '';
      render();
      return;
    }
    if (form.id === 'details-form') {
      event.preventDefault();
      var item = ticketById(ticketId());
      var typeBtn = form.querySelector('[data-segment="detail-type"][aria-pressed="true"]');
      var priBtn = form.querySelector('[data-segment="detail-priority"][aria-pressed="true"]');
      var stageBtn = form.querySelector('[data-segment="detail-stage"][aria-pressed="true"]');
      if (typeBtn) item.type = typeBtn.getAttribute('data-value');
      if (priBtn) item.priority = priBtn.getAttribute('data-value');
      if (stageBtn && item.stage !== 'working' && item.stage !== 'review' && item.stage !== 'done') {
        item.stage = stageBtn.getAttribute('data-value');
      }
      state.sheet = null;
      render();
      return;
    }
    if (form.id === 'create-form') {
      event.preventDefault();
      var idea = ticketById(ticketId());
      var name = String(new FormData(form).get('repoName') || '').trim();
      var nameInput = form.querySelector('[name="repoName"]');
      if (!/^[A-Za-z0-9._-]+$/.test(name)) {
        nameInput.setCustomValidity('Use letters, numbers, dots, underscores, or hyphens.');
        nameInput.reportValidity();
        return;
      }
      nameInput.setCustomValidity('');
      var scaffoldId = 't' + state.nextNumber;
      tickets.unshift({
        id: scaffoldId,
        n: state.nextNumber++,
        app: name,
        type: 'feature',
        priority: 'p2',
        stage: 'ready',
        ago: 'just now',
        rules: 'missing',
        isNew: false,
        title: 'Scaffold ' + name,
        body: 'First ticket, created from the idea “' + idea.title + '”.',
        ask: '',
        notes: [],
        pr: null
      });
      idea.stage = 'done';
      idea.repoReady = true;
      idea.clone = 'git clone https://github.com/ZarleyLtd/' + name + '.git C:\\CursorSites\\' + name;
      idea.scaffoldId = scaffoldId;
      idea.ago = 'just now';
      state.sheet = null;
      state.notice = 'Repository ready. Clone it on this PC when you want the folder.';
      render();
    }
  });

  document.body.addEventListener('change', function (event) {
    if (event.target && event.target.name === 'app' && event.target.form && event.target.form.id === 'new-form') {
      readDraftFromSheet();
      if (newDraft.app === 'New app') newDraft.type = 'idea';
      paintSheets();
    }
    if (event.target && event.target.name === 'photo') {
      readDraftFromSheet();
      paintSheets();
    }
  });

  function saveToken() {
    var input = document.getElementById('token');
    var value = input ? input.value.trim() : '';
    if (!value) {
      state.tokenError = true;
      state.tokenMessage = 'Paste the token, then save.';
      paintDetail();
      return;
    }
    state.signedIn = 'mrjoh';
    state.tokenError = false;
    state.tokenMessage = 'Saved. Signed in as mrjoh.';
    paintDetail();
  }

  document.addEventListener('keydown', function (event) {
    var tag = (event.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (event.key === 'Escape') {
      if (state.sheet) closeSheet();
      else if (state.searchOpen) {
        state.searchOpen = false;
        state.query = '';
        document.getElementById('search').value = '';
        render();
      } else if (state.confirmClose) {
        state.confirmClose = false;
        paintDetail();
      }
      return;
    }
    if (typing) return;
    if (event.key === 'n') {
      event.preventDefault();
      state.sheet = 'new';
      paintSheets();
    }
    if (event.key === '/') {
      event.preventDefault();
      state.searchOpen = true;
      applyChrome();
      document.getElementById('search').focus();
    }
  });

  document.getElementById('search').addEventListener('input', function (event) {
    state.query = event.target.value;
    paintList();
  });

  window.addEventListener('hashchange', render);
  window.addEventListener('resize', function () {
    applyChrome();
  });

  if (!location.hash) location.hash = '#/';
  render();
})();
