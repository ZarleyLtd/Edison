var EdisonTicketPage = (function () {
  'use strict';

  function init() {
    var params = new URLSearchParams(location.search);
    var repo = params.get('repo');
    var number = params.get('n');
    var root = document.getElementById('ticket');
    if (!EdisonAuth.getToken()) {
      root.innerHTML = '<p class="muted">Add a GitHub token in Settings to open this moment.</p>';
      return;
    }
    if (!repo || !number) {
      root.innerHTML = '<p class="muted">This link is missing a ticket.</p>';
      return;
    }
    EdisonTicket.mount(root, repo, number);
  }

  return { init: init };
})();
