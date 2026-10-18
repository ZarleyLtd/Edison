var EdisonSettings = (function () {
  'use strict';

  function init() {
    var input = document.getElementById('token');
    document.getElementById('save-token').addEventListener('click', function () {
      var button = document.getElementById('save-token');
      var value = input.value.trim();
      if (!value) {
        BriefMessage.show('Paste a token first', button);
        return;
      }
      EdisonAuth.setToken(value);
      input.value = '';
      button.disabled = true;
      EdisonApi.user().then(function (user) {
        document.getElementById('who').textContent = 'Signed in as ' + user.login;
        BriefMessage.show('Token saved', button);
      }).catch(function (error) {
        EdisonAuth.clearToken();
        document.getElementById('who').textContent = error.message;
      }).then(function () {
        button.disabled = false;
      });
    });
    document.getElementById('clear-token').addEventListener('click', function () {
      EdisonAuth.clearToken();
      document.getElementById('who').textContent = 'Token removed from this device.';
      BriefMessage.show('Token cleared', document.getElementById('clear-token'));
    });
    if (EdisonAuth.getToken()) {
      EdisonApi.user().then(function (user) {
        document.getElementById('who').textContent = 'Signed in as ' + user.login;
      }).catch(function (error) {
        document.getElementById('who').textContent = error.message;
      });
    }

    EdisonAgents.load().then(function (config) {
      var select = document.getElementById('vendor');
      Object.keys(config.vendors).forEach(function (id) {
        var option = document.createElement('option');
        option.value = id;
        option.textContent = config.vendors[id].label;
        select.appendChild(option);
      });
      return EdisonAgents.current();
    }).then(function (agent) {
      document.getElementById('vendor').value = agent.id;
    }).catch(function (error) {
      document.getElementById('vendor-status').textContent = error.message;
    });

    document.getElementById('save-vendor').addEventListener('click', function () {
      var button = document.getElementById('save-vendor');
      var status = document.getElementById('vendor-status');
      var id = document.getElementById('vendor').value;
      if (!id) {
        status.textContent = 'Choose an agent first.';
        BriefMessage.show('Choose an agent first', button, { durationMs: 2200 });
        return;
      }
      button.disabled = true;
      status.textContent = 'Saving…';
      EdisonAgents.saveVendor(id).then(function () {
        status.textContent = id === 'claude'
          ? 'Saved. Claude is selected. Copy templates/claude.yml into an app before Switch on will run there.'
          : 'Saved. Cursor is selected. Switch on comments @cursor.';
        BriefMessage.show('Agent saved', button, { durationMs: 2200 });
      }).catch(function (error) {
        status.textContent = error.message;
        BriefMessage.show(error.message, button, { durationMs: 3500, multiline: true });
      }).then(function () {
        button.disabled = false;
      });
    });

    EdisonApps.load().then(function (apps) {
      var list = document.getElementById('repos');
      apps.filter(function (app) { return app.repo; }).forEach(function (app) {
        var row = document.createElement('div');
        row.className = 'pr';
        row.innerHTML = '<strong>' + EdisonFormat.escapeHtml(app.name) + '</strong><span class="row"></span>';
        var labels = document.createElement('button');
        labels.type = 'button';
        labels.textContent = 'Labels';
        labels.addEventListener('click', function () {
          labels.disabled = true;
          EdisonApi.ensureLabels(app.repo).then(function () {
            BriefMessage.show('Labels ready', labels);
          }).catch(function (error) {
            BriefMessage.show(error.message, labels, { durationMs: 2500, multiline: true });
          }).then(function () { labels.disabled = false; });
        });
        var rules = document.createElement('button');
        rules.type = 'button';
        rules.textContent = 'Rules PR';
        rules.addEventListener('click', function () {
          rules.disabled = true;
          EdisonSetup.proposeRules(app.repo).then(function (pr) {
            BriefMessage.show('Pull request ready', rules);
            rules.textContent = 'PR open';
            window.open(pr.html_url, '_blank', 'noopener');
          }).catch(function (error) {
            BriefMessage.show(error.message, rules, { durationMs: 2800, multiline: true });
            rules.disabled = false;
          });
        });
        row.querySelector('.row').appendChild(labels);
        row.querySelector('.row').appendChild(rules);
        list.appendChild(row);
      });
    });

    document.getElementById('setup-all').addEventListener('click', function () {
      var button = document.getElementById('setup-all');
      var status = document.getElementById('setup-status');
      button.disabled = true;
      EdisonApps.load().then(function (apps) {
        var repos = apps.filter(function (app) { return app.repo; });
        var failures = [];
        return repos.reduce(function (chain, app, index) {
          return chain.then(function () {
            status.textContent = (index + 1) + ' of ' + repos.length + ': ' + app.name;
            return EdisonApi.ensureLabels(app.repo).catch(function (error) {
              failures.push(app.name + ': ' + error.message);
            });
          });
        }, Promise.resolve()).then(function () {
          status.textContent = failures.length ? failures.join(' ') : 'Labels are ready on every app.';
          BriefMessage.show(failures.length ? 'Finished with errors' : 'All apps set up', button);
        });
      }).catch(function (error) {
        status.textContent = error.message;
      }).then(function () {
        button.disabled = false;
      });
    });
  }

  return { init: init };
})();
