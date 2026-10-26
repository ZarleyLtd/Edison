const test = require('node:test');
const assert = require('node:assert/strict');
const labels = require('../assets/js/utils/labels.js');
const query = require('../assets/js/utils/query.js');
const format = require('../assets/js/utils/formatters.js');

test('stage replacement drops the previous stage', function () {
  const next = labels.replaceStage(['edison', 'stage:inbox', 'p2', 'type:bug'], 'ready');
  assert.deepEqual(next.sort(), ['edison', 'p2', 'stage:ready', 'type:bug']);
  assert.equal(labels.stageOf(next), 'ready');
});

test('new-app label is detected from issue labels', function () {
  assert.equal(labels.isNewApp([{ name: 'app:new' }, { name: 'edison' }]), true);
  assert.equal(labels.isNewApp(['edison', 'type:bug']), false);
});

test('query is an allowed type', function () {
  assert.ok(labels.TYPES.includes('query'));
  assert.equal(labels.TYPE_LABEL.query, 'Query');
  assert.equal(labels.ALL.some(function (label) { return label.name === 'type:query'; }), true);
  assert.deepEqual(labels.replaceType(['edison', 'type:idea'], 'query').sort(), ['edison', 'type:query']);
});

test('priority replacement keeps a single priority', function () {
  assert.deepEqual(labels.replacePriority(['p1', 'edison'], 'p3').sort(), ['edison', 'p3']);
});

test('issue search uses user qualifier and quoted stage labels', function () {
  const all = query.buildIssueQuery({ owner: 'ZarleyLtd', state: 'open' });
  assert.match(all, /user:ZarleyLtd/);
  assert.match(all, /label:edison/);
  assert.match(all, /is:open/);
  const idea = query.buildIssueQuery({ owner: 'ZarleyLtd', isNew: true, state: 'open' });
  assert.match(idea, /repo:ZarleyLtd\/Edison/);
  assert.match(idea, /label:app:new/);
  assert.doesNotMatch(idea, /label:edison/);
  const bug = query.buildIssueQuery({ owner: 'ZarleyLtd', appRepo: '4NextBus', type: 'bug', stage: 'ready', priority: 'p1' });
  assert.match(bug, /repo:ZarleyLtd\/4NextBus/);
  assert.match(bug, /label:"type:bug"/);
  assert.match(bug, /label:"stage:ready"/);
  assert.match(bug, /label:p1/);
});

test('pull request query and mention check', function () {
  assert.equal(query.buildPrQuery('ZarleyLtd', 'BGS', 12), 'repo:ZarleyLtd/BGS is:pr #12');
  assert.equal(query.mentionsIssue('Fixes #12 in the header', 12), true);
  assert.equal(query.mentionsIssue('See #120 for context', 12), false);
});

test('review link points at the unmerged commit', function () {
  const url = query.previewPageUrl('ZarleyLtd', 'HelloWorldCursor', 'abc123', 'index.html');
  assert.equal(url, 'https://htmlpreview.github.io/?https://raw.githubusercontent.com/ZarleyLtd/HelloWorldCursor/abc123/index.html');
  const nested = query.previewPageUrl('ZarleyLtd', 'HelloWorldCursor', 'abc123', 'guides/my page.html');
  assert.equal(nested, 'https://htmlpreview.github.io/?https://raw.githubusercontent.com/ZarleyLtd/HelloWorldCursor/abc123/guides/my%20page.html');
  assert.deepEqual(query.previewPages([
    { filename: 'assets/css/style.css', status: 'modified' },
    { filename: 'leagues.html', status: 'modified' },
    { filename: 'old.html', status: 'removed' },
    { filename: 'index.html', status: 'modified' }
  ]), ['index.html', 'leagues.html']);
  assert.deepEqual(query.previewPages([{ filename: 'README.md', status: 'added' }]), ['index.html']);
});

test('a follow-up waits for a new commit and then catches up on later notes', function () {
  const before = { body: 'Look at the header' };
  const marker = { body: query.deployMarker(18, 'aaa111') };
  const bot = { body: 'Opened the pull request.', user: { type: 'Bot' } };
  const first = { body: 'Make the button larger' };
  const second = { body: 'And the empty state' };
  const comments = [before, marker, bot, first, second];
  assert.deepEqual(query.pendingNotes(comments, ''), ['Make the button larger', 'And the empty state']);
  assert.deepEqual(query.pendingNotes(comments, 'Also the heading'), [
    'Make the button larger',
    'And the empty state',
    'Also the heading'
  ]);
  assert.deepEqual(query.pendingNotes([before, marker, bot], ''), []);
  assert.equal(query.noteText(marker.body), '');
  assert.equal(query.roundLanded(comments, 'aaa111'), false);
  assert.equal(query.roundLanded(comments, 'bbb222'), true);
  assert.equal(query.roundLanded([{ body: query.deployMarker() }], 'bbb222'), true);
  assert.equal(query.roundLanded([], 'bbb222'), true);
  const pulls = [
    { number: 20, state: 'open', created_at: '2026-02-02T00:00:00Z' },
    { number: 18, state: 'open', created_at: '2026-01-01T00:00:00Z' },
    { number: 9, state: 'closed', created_at: '2025-01-01T00:00:00Z' }
  ];
  assert.equal(query.oldestOpenPull(pulls).number, 18);
  const sameRepo = {
    head: { ref: 'cursor/beaverstown-pars-report-c258', repo: { full_name: 'ZarleyLtd/BGS' } },
    base: { ref: 'main' }
  };
  assert.equal(query.discardBranch(sameRepo, 'ZarleyLtd', 'BGS'), 'cursor/beaverstown-pars-report-c258');
  assert.equal(query.discardBranch({
    head: { ref: 'main', repo: { full_name: 'ZarleyLtd/BGS' } },
    base: { ref: 'main' }
  }, 'ZarleyLtd', 'BGS'), '');
  assert.equal(query.discardBranch({
    head: { ref: 'topic', repo: { full_name: 'other/BGS' } },
    base: { ref: 'main' }
  }, 'ZarleyLtd', 'BGS'), '');
  assert.equal(query.discardBranch({ head: { ref: 'topic' }, base: { ref: 'main' } }, 'ZarleyLtd', 'BGS'), '');
  const comment = query.followUpComment({
    mention: '@cursor',
    notes: ['Make the button larger', 'And the empty state'],
    pr: 18,
    branch: 'saturday',
    issue: 31,
    title: 'Saturday timetable',
    repo: 'BGS',
    owner: 'ZarleyLtd'
  });
  assert.match(comment, /branch `saturday`/);
  assert.match(comment, /Do not open another pull request/);
  assert.match(comment, /1\. Make the button larger/);
  assert.match(comment, /2\. And the empty state/);
  assert.ok(comment.indexOf('1. Make the button larger') < comment.indexOf('2. And the empty state'));
});

test('agent updates on the pull request join the ticket notes after the send', function () {
  const issueComments = [
    { body: 'I added a centered Hello button.', user: { login: 'cursor[bot]', type: 'Bot' }, created_at: '2026-10-22T22:39:39Z' },
    { body: 'Show Hello Clicked when the button is pressed.', user: { login: 'ZarleyLtd', type: 'User' }, created_at: '2026-10-24T19:05:08Z' },
    { body: query.deployMarker(7, 'c9cf722'), user: { login: 'ZarleyLtd', type: 'User' }, created_at: '2026-10-24T19:05:26Z' }
  ];
  const prComments = [
    { body: 'Added a centered Hello button on the homepage.', user: { login: 'cursor[bot]', type: 'Bot' }, created_at: '2026-10-22T22:55:46Z' },
    { body: '@cursor\n\nContinue from the commits already on branch `feature`.', user: { login: 'ZarleyLtd', type: 'User' }, created_at: '2026-10-24T19:05:25Z' },
    { body: 'Clicking the homepage Hello button now shows Hello Clicked.', user: { login: 'cursor[bot]', type: 'Bot' }, created_at: '2026-10-24T19:09:13Z' }
  ];
  const notes = query.withAgentUpdates(issueComments, prComments).map(function (comment) {
    return query.noteText(comment.body);
  }).filter(Boolean);
  assert.deepEqual(notes, [
    'I added a centered Hello button.',
    'Show Hello Clicked when the button is pressed.',
    'Clicking the homepage Hello button now shows Hello Clicked.'
  ]);
  assert.deepEqual(query.pendingNotes(query.withAgentUpdates(issueComments, prComments), ''), []);
});

test('repo names suggested from a title stay valid', function () {
  assert.equal(query.suggestRepoName('bus times widget'), 'BusTimesWidget');
  assert.equal(query.validRepoName(query.suggestRepoName('bus times widget')), true);
  assert.equal(query.validRepoName('has spaces'), false);
});

test('a new app is inserted once and sorted after New app', function () {
  const apps = [
    { name: 'New app', repo: null, isNew: true },
    { name: 'BGS', repo: 'BGS' }
  ];
  const next = query.insertApp(apps, { name: 'Amber', repo: 'Amber' });
  assert.equal(next[0].isNew, true);
  assert.deepEqual(next.map(function (app) { return app.repo; }), [null, 'Amber', 'BGS']);
  const again = query.insertApp(next, { name: 'Amber', repo: 'Amber', pagesUrl: 'x' });
  assert.equal(again.filter(function (app) { return app.repo === 'Amber'; }).length, 1);
  assert.equal(again.filter(function (app) { return app.repo === 'Amber'; })[0].pagesUrl, 'x');
});

test('markdown escapes html and keeps images', function () {
  const html = format.renderMarkdown('Hello <script>\n\n![shot](https://example.com/a.jpg)');
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<img alt="shot" src="https:\/\/example.com\/a.jpg" \/>/);
});
