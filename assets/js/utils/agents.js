var EdisonAgents = (function () {
  'use strict';

  var KEY = 'edison.vendor';
  var cache = null;

  function load() {
    if (cache) return Promise.resolve(cache);
    return fetch('agents.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('Could not load agent settings.');
        return res.json();
      })
      .then(function (data) {
        cache = data;
        return data;
      });
  }

  function current() {
    return load().then(function (config) {
      var stored = '';
      try {
        stored = localStorage.getItem(KEY) || '';
      } catch (e) {
        stored = '';
      }
      var id = stored || config.vendor || 'cursor';
      if (!config.vendors[id]) id = 'cursor';
      var vendor = config.vendors[id];
      return {
        id: id,
        mention: vendor.mention,
        label: vendor.label,
        brief: config.brief,
        config: config
      };
    });
  }

  function saveVendor(id) {
    return load().then(function (config) {
      if (!config.vendors[id]) throw new Error('Choose an agent first.');
      config.vendor = id;
      cache = config;
      try {
        localStorage.setItem(KEY, id);
      } catch (e) {
        /* private mode */
      }
      var text = JSON.stringify(config, null, 2) + '\n';
      return EdisonApi.putText(EDISON_CONFIG.REPO, 'agents.json', 'Switch Edison agent to ' + id, text).then(function () {
        return config;
      });
    });
  }

  function commentBody(agent, repo, issue) {
    return (
      agent.mention +
      '\n\n' +
      agent.brief +
      '\n\n' +
      'Edison ticket: ' +
      issue.title +
      '\n' +
      'Repository: ' +
      EDISON_CONFIG.OWNER +
      '/' +
      repo +
      '\n' +
      'Issue: #' +
      issue.number
    );
  }

  return { load: load, current: current, saveVendor: saveVendor, commentBody: commentBody };
})();
