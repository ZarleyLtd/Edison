var EdisonList = (function () {
  'use strict';

  var urls = [];

  function filters() {
    return {
      app: document.getElementById('filter-app').value,
      type: document.getElementById('filter-type').value,
      stage: document.getElementById('filter-stage').value,
      priority: document.getElementById('filter-priority').value,
      state: document.getElementById('filter-state').value,
      text: document.getElementById('filter-text').value
    };
  }

  function isWide() {
    return window.matchMedia('(min-width: 1100px)').matches;
  }

  function init() {
    var banner = document.getElementById('error');
    EdisonApps.load().then(function (apps) {
      var select = document.getElementById('filter-app');
      var sheetApp = document.getElementById('app');
      apps.forEach(function (app) {
        var option = document.createElement('option');
        option.value = app.isNew ? 'new' : app.repo;
        option.textContent = app.name;
        select.appendChild(option);
        sheetApp.appendChild(option.cloneNode(true));
      });
      if (!EdisonAuth.getToken()) {
        document.getElementById('list').innerHTML = emptySignedOut();
      } else {
        document.getElementById('filters').addEventListener('input', function () {
          window.clearTimeout(init.timer);
          init.timer = window.setTimeout(load, 300);
        });
        document.getElementById('filters').addEventListener('change', load);
        document.getElementById('filters').addEventListener('submit', function (event) {
          event.preventDefault();
          load();
        });
        load();
        openFromQuery();
      }
    }).catch(function (error) {
      banner.hidden = false;
      banner.textContent = error.message;
    });

    document.getElementById('new-ticket').addEventListener('click', openSheet);
    document.getElementById('sheet-cancel').addEventListener('click', closeSheet);
    document.getElementById('sheet').addEventListener('click', function (event) {
      if (event.target.id === 'sheet') closeSheet();
    });
    document.getElementById('add-url').addEventListener('click', function () {
      var input = document.getElementById('url');
      var value = input.value.trim();
      if (!/^https?:\/\//i.test(value)) {
        BriefMessage.show('Paste a full http or https link', input);
        return;
      }
      urls.push(value);
      input.value = '';
      renderUrls();
    });
    document.getElementById('new-form').addEventListener('submit', submitTicket);
    document.getElementById('app').addEventListener('change', function () {
      if (document.getElementById('app').value === 'new') document.getElementById('type').value = 'idea';
    });
    document.addEventListener('keydown', onKey);
    window.addEventListener('popstate', openFromQuery);
  }

  function onKey(event) {
    var tag = (event.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    if (event.key === 'Escape') closeSheet();
    if (typing) return;
    if (event.key === 'n') openSheet();
    if (event.key === '/') {
      event.preventDefault();
      document.getElementById('filter-text').focus();
    }
  }

  function emptySignedOut() {
    return '<div class="empty">' + EdisonFormat.bulb('ready') + '<h2>No lightbulb moments yet</h2><p class="muted">Add a GitHub token in Settings to see and file them.</p></div>';
  }

  function load() {
    var banner = document.getElementById('error');
    banner.hidden = true;
    var chosen = filters();
    var query = EdisonQuery.buildIssueQuery({
      owner: EDISON_CONFIG.OWNER,
      edisonRepo: EDISON_CONFIG.REPO,
      isNew: chosen.app === 'new',
      appRepo: chosen.app && chosen.app !== 'new' ? chosen.app : '',
      type: chosen.type,
      stage: chosen.stage,
      priority: chosen.priority,
      state: chosen.state,
      text: chosen.text
    });
    document.getElementById('list').innerHTML = '<p class="muted">Looking for moments…</p>';
    EdisonApi.searchIssues(query).then(function (result) {
      var items = result.items || [];
      if (!items.length) {
        document.getElementById('list').innerHTML = '<div class="empty">' + EdisonFormat.bulb('inbox') + '<h2>No lightbulb moments yet</h2><p class="muted">File one with New moment.</p></div>';
        return;
      }
      document.getElementById('list').innerHTML = '<div class="cards">' + items.map(function (issue) {
        return EdisonCard.render(issue);
      }).join('') + '</div>';
      document.querySelectorAll('.card').forEach(function (card) {
        card.addEventListener('click', function (event) {
          if (!isWide() || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          var repo = card.getAttribute('data-repo');
          var number = card.getAttribute('data-number');
          history.pushState({}, '', 'index.html?repo=' + encodeURIComponent(repo) + '&n=' + encodeURIComponent(number));
          showDetail(repo, number);
        });
      });
      markSelected();
    }).catch(function (error) {
      banner.hidden = false;
      banner.textContent = error.message;
      document.getElementById('list').innerHTML = '';
    });
  }

  function openFromQuery() {
    if (!isWide() || !EdisonAuth.getToken()) return;
    var params = new URLSearchParams(location.search);
    if (params.get('repo') && params.get('n')) showDetail(params.get('repo'), params.get('n'));
  }

  function showDetail(repo, number) {
    markSelected();
    EdisonTicket.mount(document.getElementById('detail'), repo, number);
  }

  function markSelected() {
    var params = new URLSearchParams(location.search);
    document.querySelectorAll('.card').forEach(function (card) {
      var on = card.getAttribute('data-repo') === params.get('repo') && card.getAttribute('data-number') === params.get('n');
      card.classList.toggle('selected', on);
    });
  }

  function openSheet() {
    document.getElementById('sheet').hidden = false;
    document.body.classList.add('sheet-open');
    document.getElementById('title').focus();
  }

  function closeSheet() {
    document.getElementById('sheet').hidden = true;
    document.body.classList.remove('sheet-open');
  }

  function renderUrls() {
    document.getElementById('urls').innerHTML = urls.map(function (url) {
      return '<li>' + EdisonFormat.escapeHtml(url) + '</li>';
    }).join('');
  }

  function submitTicket(event) {
    event.preventDefault();
    var button = document.getElementById('save-ticket');
    var form = event.target;
    var title = document.getElementById('title').value.trim();
    var app = document.getElementById('app').value;
    var type = document.getElementById('type').value;
    var priority = document.getElementById('priority').value;
    var notes = document.getElementById('notes').value.trim();
    var files = Array.prototype.slice.call(document.getElementById('photos').files || []);
    if (!title || !app) {
      BriefMessage.show('Add a title and an app', button);
      return;
    }
    var repo = app === 'new' ? EDISON_CONFIG.REPO : app;
    var labels = ['edison', 'type:' + type, 'stage:inbox', priority];
    if (app === 'new') labels.push('app:new');
    var body = notes || title;
    if (urls.length) {
      body += '\n\n## Links\n\n' + urls.map(function (url) { return '- ' + url; }).join('\n');
    }
    button.disabled = true;
    button.textContent = 'Filing…';
    EdisonApi.ensureLabels(repo).then(function () {
      return EdisonApi.createIssue(repo, { title: title, body: body, labels: labels });
    }).then(function (issue) {
      return uploadPhotos(repo, issue, files).then(function () {
        return issue;
      });
    }).then(function (issue) {
      BriefMessage.show('Moment filed', button);
      form.reset();
      urls = [];
      renderUrls();
      closeSheet();
      button.disabled = false;
      button.textContent = 'File moment';
      load();
      if (isWide()) {
        history.pushState({}, '', 'index.html?repo=' + encodeURIComponent(repo) + '&n=' + issue.number);
        showDetail(repo, issue.number);
      }
    }).catch(function (error) {
      button.disabled = false;
      button.textContent = 'File moment';
      BriefMessage.show(error.message, button, { durationMs: 3000, multiline: true });
    });
  }

  function uploadPhotos(repo, issue, files) {
    var chain = Promise.resolve(issue.body || '');
    files.forEach(function (file, index) {
      chain = chain.then(function (body) {
        document.getElementById('save-ticket').textContent = 'Photo ' + (index + 1) + ' of ' + files.length;
        return ImageCompress.compressToTarget(file, 100 * 1024).then(function (blob) {
          return ImageCompress.blobToBase64(blob);
        }).then(function (base64) {
          var path = 'attachments/' + repo + '/' + issue.number + '/' + Date.now() + '-' + index + '.jpg';
          return EdisonApi.putContents(EDISON_CONFIG.REPO, path, 'Attach photo to ' + repo + '#' + issue.number, base64).then(function (saved) {
            var url = (saved.content && saved.content.download_url) ||
              ('https://raw.githubusercontent.com/' + EDISON_CONFIG.OWNER + '/' + EDISON_CONFIG.REPO + '/main/' + path);
            return body + '\n\n![' + (file.name || 'photo') + '](' + url + ')';
          });
        });
      });
    });
    return chain.then(function (body) {
      if (!files.length) return issue;
      return EdisonApi.updateIssue(repo, issue.number, { body: body });
    });
  }

  return { init: init };
})();
