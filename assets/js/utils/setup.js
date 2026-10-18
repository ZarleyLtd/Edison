var EdisonSetup = (function () {
  'use strict';

  var BRANCH = 'edison-agent-rules';

  function proposeRules(repo) {
    return EdisonApi.repoMeta(repo).then(function (meta) {
      var base = meta.default_branch || 'main';
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
        return EdisonApi.putText(repo, '.cursor/rules/edison.mdc', 'Add Edison agent rules', template, BRANCH);
      }).then(function () {
        return EdisonApi.openPulls(repo, BRANCH);
      }).then(function (pulls) {
        if (pulls && pulls.length) return pulls[0];
        return EdisonApi.createPull(repo, {
          title: 'Add Edison agent rules',
          head: BRANCH,
          base: base,
          body: 'Adds `.cursor/rules/edison.mdc` so a Cursor agent working an Edison ticket opens a pull request and waits for review.\n\nOpened from Edison.'
        });
      });
    });
  }

  return { proposeRules: proposeRules };
})();
