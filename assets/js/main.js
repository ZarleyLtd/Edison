(function () {
  'use strict';

  var page = document.body.dataset.page;
  var path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.top nav a').forEach(function (link) {
    if (link.getAttribute('href') === path) link.setAttribute('aria-current', 'page');
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  if (page === 'list' && window.EdisonList) EdisonList.init();
  if (page === 'ticket' && window.EdisonTicketPage) EdisonTicketPage.init();
  if (page === 'settings' && window.EdisonSettings) EdisonSettings.init();
})();
