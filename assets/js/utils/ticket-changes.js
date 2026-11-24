// Remembers tickets opened or changed in this browser tab for a few minutes, so
// the ticket list can show their current state while GitHub search catches up.
// Fires `edison:ticket-changed` on document when a ticket is recorded.
var EdisonChanges = (function () {
  'use strict';

  var KEY = 'edison.changedTickets';
  var TTL_MS = 3 * 60 * 1000;

  function read() {
    try {
      var list = JSON.parse(window.sessionStorage.getItem(KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch (error) {
      return [];
    }
  }

  function write(list) {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(list));
    } catch (error) {
      // Storage full or blocked: the list falls back to search results alone.
    }
  }

  function live(list) {
    var now = Date.now();
    return list.filter(function (entry) {
      return entry && entry.issue && now - entry.at < TTL_MS;
    });
  }

  function record(issue) {
    if (!issue || !issue.repository_url) return;
    var list = live(read()).filter(function (entry) {
      return !(entry.issue.number === issue.number && entry.issue.repository_url === issue.repository_url);
    });
    list.push({ at: Date.now(), issue: issue });
    write(list);
    document.dispatchEvent(new CustomEvent('edison:ticket-changed', { detail: { issue: issue } }));
  }

  function recent() {
    var list = live(read());
    write(list);
    return list.map(function (entry) { return entry.issue; });
  }

  return { record: record, recent: recent };
})();
