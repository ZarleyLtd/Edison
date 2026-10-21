var EdisonTicketPage = (function () {
  'use strict';

  function syncWide() {
    document.body.dataset.wide = window.matchMedia('(min-width: 1100px)').matches ? 'true' : 'false';
  }

  function init() {
    syncWide();
    window.addEventListener('resize', syncWide);
    var params = new URLSearchParams(location.search);
    var repo = params.get('repo');
    var number = params.get('n');
    var root = document.getElementById('ticket');
    if (!EdisonAuth.getToken()) {
      root.innerHTML = '<div class="empty">' + EdisonFormat.bulb('ready', 'xl') +
        '<h2>No ticket yet</h2><p class="lede">Add a GitHub token in <a href="settings.html">Settings</a> to open this ticket.</p></div>';
      return;
    }
    if (!repo || !number) {
      root.innerHTML = '<div class="empty"><h2>That link is missing a ticket.</h2><p class="lede"><a href="index.html">Back to tickets</a></p></div>';
      return;
    }
    EdisonTicket.mount(root, repo, number);
  }

  return { init: init };
})();
