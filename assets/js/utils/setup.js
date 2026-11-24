var EdisonSetup = (function () {
  'use strict';

  // What each agent needs on an app's default branch before Deploy Agent runs.
  var SPECS = {
    cursor: {
      branch: 'edison-agent-rules',
      path: '.cursor/rules/edison.mdc',
      template: 'templates/edison.mdc',
      phrase: 'Do not open another pull request',
      addTitle: 'Add Edison agent rules',
      updateTitle: 'Update Edison agent rules',
      addBody: 'Adds `.cursor/rules/edison.mdc` so a Cursor agent working an Edison ticket opens a pull request and continues on that pull request when you send later notes.\n\nOpened from Edison.',
      updateBody: 'Updates `.cursor/rules/edison.mdc` so a follow-up continues the open pull request instead of opening another.\n\nOpened from Edison.'
    },
    claude: {
      branch: 'edison-claude-setup',
      path: '.github/workflows/claude.yml',
      template: 'templates/claude.yml',
      phrase: 'edison-claude-workflow v3',
      addTitle: 'Add Claude workflow for Edison',
      updateTitle: 'Update Claude workflow for Edison',
      addBody: 'Adds `.github/workflows/claude.yml` so Deploy Agent in Edison (`@claude`) starts Claude Code on this repository. Claude opens a pull request for the ticket and continues on it when you send later notes.\n\nThe repository also needs a `CLAUDE_CODE_OAUTH_TOKEN` Actions secret.\n\nOpened from Edison.',
      updateBody: 'Updates `.github/workflows/claude.yml` to the current Edison version.\n\nOpened from Edison.'
    }
  };

  function spec() {
    return EdisonAgents.current().then(function (agent) {
      return SPECS[agent.id] || SPECS.cursor;
    }, function () {
      return SPECS.cursor;
    });
  }

  function openRulesPull(repo, s) {
    return EdisonApi.openPulls(repo, s.branch).then(function (pulls) {
      return pulls && pulls[0] ? pulls[0] : null;
    });
  }

  function rulesStatus(repo) {
    return spec().then(function (s) {
      return EdisonApi.contents(repo, s.path).then(function (file) {
        var text = EdisonApi.decodeContent(file && file.content);
        if (text.indexOf(s.phrase) !== -1) return { state: 'merged' };
        return openRulesPull(repo, s).then(function (pull) {
          if (pull) return { state: 'open', pull: pull };
          return { state: 'stale' };
        });
      }, function (error) {
        if (!error || error.status !== 404) throw error;
        return openRulesPull(repo, s).then(function (pull) {
          if (pull) return { state: 'open', pull: pull };
          return { state: 'missing' };
        });
      });
    });
  }

  function proposeRules(repo) {
    return spec().then(function (s) {
      return EdisonApi.repoMeta(repo).then(function (meta) {
        var base = meta.default_branch || 'main';
        return EdisonApi.contents(repo, s.path).then(function () {
          return true;
        }, function () {
          return false;
        }).then(function (existed) {
          return EdisonApi.branchSha(repo, base).then(function (sha) {
            return EdisonApi.createBranch(repo, s.branch, sha).catch(function (error) {
              if (/reference already exists/i.test(error.message)) return null;
              throw error;
            });
          }).then(function () {
            return fetch(s.template).then(function (res) {
              if (!res.ok) throw new Error('Could not read the agent setup template.');
              return res.text();
            });
          }).then(function (template) {
            var message = existed ? s.updateTitle : s.addTitle;
            return EdisonApi.putText(repo, s.path, message, template, s.branch).catch(function (error) {
              if (/workflow/i.test(error.message)) {
                throw new Error('Your GitHub token needs the workflow scope to add the Claude workflow.');
              }
              throw error;
            });
          }).then(function () {
            return EdisonApi.openPulls(repo, s.branch);
          }).then(function (pulls) {
            if (pulls && pulls.length) return pulls[0];
            return EdisonApi.createPull(repo, {
              title: existed ? s.updateTitle : s.addTitle,
              head: s.branch,
              base: base,
              body: existed ? s.updateBody : s.addBody
            });
          });
        });
      });
    });
  }

  return { proposeRules: proposeRules, rulesStatus: rulesStatus };
})();
