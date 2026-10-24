var EdisonSetup = (function () {
  'use strict';

  var BRANCH = 'edison-agent-rules';
  var RULES_PATH = '.cursor/rules/edison.mdc';
  var RULES_PHRASE = 'Do not open another pull request';

  function openRulesPull(repo) {
    return EdisonApi.openPulls(repo, BRANCH).then(function (pulls) {
      return pulls && pulls[0] ? pulls[0] : null;
    });
  }

  function rulesStatus(repo) {
    return EdisonApi.contents(repo, RULES_PATH).then(function (file) {
      var text = EdisonApi.decodeContent(file && file.content);
      if (text.indexOf(RULES_PHRASE) !== -1) return { state: 'merged' };
      return openRulesPull(repo).then(function (pull) {
        if (pull) return { state: 'open', pull: pull };
        return { state: 'stale' };
      });
    }, function (error) {
      if (!error || error.status !== 404) throw error;
      return openRulesPull(repo).then(function (pull) {
        if (pull) return { state: 'open', pull: pull };
        return { state: 'missing' };
      });
    });
  }

  function proposeRules(repo) {
    return EdisonApi.repoMeta(repo).then(function (meta) {
      var base = meta.default_branch || 'main';
      return EdisonApi.contents(repo, RULES_PATH).then(function () {
        return true;
      }, function () {
        return false;
      }).then(function (existed) {
        return EdisonApi.branchSha(repo, base).then(function (sha) {
          return EdisonApi.createBranch(repo, BRANCH, sha).catch(function (error) {
            if (/reference already exists/i.test(error.message)) return null;
            throw error;
          });
        }).then(function () {
          return fetch('templates/edison.mdc').then(function (res) {
            if (!res.ok) throw new Error('Could not read the agent rules template.');
            return res.text();
          });
        }).then(function (template) {
          var message = existed ? 'Update Edison agent rules' : 'Add Edison agent rules';
          return EdisonApi.putText(repo, RULES_PATH, message, template, BRANCH);
        }).then(function () {
          return EdisonApi.openPulls(repo, BRANCH);
        }).then(function (pulls) {
          if (pulls && pulls.length) return pulls[0];
          return EdisonApi.createPull(repo, {
            title: existed ? 'Update Edison agent rules' : 'Add Edison agent rules',
            head: BRANCH,
            base: base,
            body: existed
              ? 'Updates `.cursor/rules/edison.mdc` so a follow-up continues the open pull request instead of opening another.\n\nOpened from Edison.'
              : 'Adds `.cursor/rules/edison.mdc` so a Cursor agent working an Edison ticket opens a pull request and continues on that pull request when you send later notes.\n\nOpened from Edison.'
          });
        });
      });
    });
  }

  return { proposeRules: proposeRules, rulesStatus: rulesStatus };
})();
