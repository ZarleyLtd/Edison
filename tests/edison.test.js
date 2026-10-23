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
