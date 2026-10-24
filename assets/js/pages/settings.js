var EdisonSettings = (function () {
  'use strict';

  function init() {
    var input = document.getElementById('token');
    var typedToken = '';
    input.addEventListener('input', function () {
      typedToken = input.value;
    });
    document.getElementById('save-token').addEventListener('click', function () {
      var button = document.getElementById('save-token');
      var value = (input.value || typedToken).trim();
      if (!value) {
        reportToken('Paste the token into the box, then tap Save token.', true);
        return;
      }
      if (!EdisonAuth.setToken(value)) {
        reportToken('This browser blocked saving the token. Leave private mode and try again.', true);
        return;
      }
      button.disabled = true;
      reportToken('Checking the token with GitHub…', false);
      EdisonApi.user().then(function (user) {
        input.value = '';
        typedToken = '';
        reportToken('Signed in as ' + user.login + '.', false);
      }).catch(function (error) {
        EdisonAuth.clearToken();
        reportToken(plainTokenError(error), true);
      }).then(function () {
        button.disabled = false;
      });
    });
    document.getElementById('clear-token').addEventListener('click', function () {
      EdisonAuth.clearToken();
      typedToken = '';
      input.value = '';
      reportToken('Token removed from this browser.', false);
      BriefMessage.show('Token cleared', document.getElementById('clear-token'));
    });
    if (EdisonAuth.getToken()) {
      reportToken('Checking the saved token…', false);
      EdisonApi.user().then(function (user) {
        reportToken('Signed in as ' + user.login + '.', false);
      }).catch(function (error) {
        reportToken(plainTokenError(error), true);
      });
    }

    function reportToken(text, isError) {
      var status = document.getElementById('token-status');
      status.textContent = text;
      status.classList.toggle('is-error', !!isError);
      document.getElementById('who').textContent = text;
      status.scrollIntoView({ block: 'nearest' });
    }

    function plainTokenError(error) {
      var message = error && error.message ? error.message : 'Could not reach GitHub.';
      if (/failed to fetch|networkerror|load failed/i.test(message)) {
        return 'Could not reach GitHub from this browser. Check the connection and tap Save token again.';
      }
      return message;
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
          ? 'Saved. Claude is selected. Copy templates/claude.yml into an app before Deploy Agent will run there.'
          : 'Saved. Cursor is selected. Deploy Agent comments @cursor.';
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
      var signedIn = !!EdisonAuth.getToken();
      apps.filter(function (app) { return app.repo; }).forEach(function (app) {
        var row = document.createElement('div');
        row.className = 'pr';
        row.innerHTML = '<strong>' + EdisonFormat.escapeHtml(app.name) + '</strong><span class="row"></span>';
        var slot = row.querySelector('.row');
        list.appendChild(row);
        if (!signedIn) {
          paintRules(slot, app, { state: 'signed-out' });
          return;
        }
        paintRules(slot, app, { state: 'checking' });
        EdisonSetup.rulesStatus(app.repo).then(function (status) {
          paintRules(slot, app, status);
        }).catch(function (error) {
          paintRules(slot, app, { state: 'error', message: error.message });
        });
      });
    });

    function paintRules(slot, app, status) {
      slot.textContent = '';
      if (status.state === 'checking') {
        slot.appendChild(note('Checking…'));
        return;
      }
      if (status.state === 'signed-out') {
        slot.appendChild(note('Add a token to check rules.'));
        return;
      }
      if (status.state === 'error') {
        slot.appendChild(note(status.message || 'Could not check the rules.'));
        return;
      }
      if (status.state === 'merged') {
        var done = document.createElement('span');
        done.className = 'rules-status';
        done.textContent = '\u2713 Rules merged';
        slot.appendChild(done);
        return;
      }
      if (status.state === 'stale') {
        var stale = document.createElement('span');
        stale.className = 'rules-status';
        stale.textContent = 'Rules need an update';
        slot.appendChild(stale);
        var update = document.createElement('button');
        update.type = 'button';
        update.textContent = 'Update rules';
        update.addEventListener('click', function () {
          update.disabled = true;
          EdisonSetup.proposeRules(app.repo).then(function (pr) {
            paintRules(slot, app, { state: 'open', pull: pr });
            BriefMessage.show('Pull request ready', slot.querySelector('a') || slot);
            window.open(pr.html_url, '_blank', 'noopener');
          }).catch(function (error) {
            update.disabled = false;
            BriefMessage.show(error.message, update, { durationMs: 2800, multiline: true });
          });
        });
        slot.appendChild(update);
        return;
      }
      if (status.state === 'open' && status.pull && status.pull.html_url) {
        var open = document.createElement('a');
        open.className = 'button rules-open';
        open.href = status.pull.html_url;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        open.textContent = 'Pull request open';
        slot.appendChild(open);
        return;
      }
      var rules = document.createElement('button');
      rules.type = 'button';
      rules.textContent = 'Rules PR';
      rules.addEventListener('click', function () {
        rules.disabled = true;
        EdisonSetup.proposeRules(app.repo).then(function (pr) {
          paintRules(slot, app, { state: 'open', pull: pr });
          BriefMessage.show('Pull request ready', slot.querySelector('a') || slot);
          window.open(pr.html_url, '_blank', 'noopener');
        }).catch(function (error) {
          rules.disabled = false;
          BriefMessage.show(error.message, rules, { durationMs: 2800, multiline: true });
        });
      });
      slot.appendChild(rules);
    }

    function note(text) {
      var el = document.createElement('span');
      el.className = 'hint';
      el.textContent = text;
      return el;
    }
  }

  return { init: init };
})();
