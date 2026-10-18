var EdisonApps = (function () {
  'use strict';

  var cache = null;

  function remember(list) {
    cache = list;
    try {
      localStorage.setItem('edison.apps', JSON.stringify(list));
    } catch (e) {
      /* private mode */
    }
    return list;
  }

  function load() {
    if (cache) return Promise.resolve(cache);
    return fetch('apps.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('Could not load the app list.');
        return res.json();
      })
      .then(remember)
      .catch(function (error) {
        try {
          var saved = localStorage.getItem('edison.apps');
          if (saved) {
            cache = JSON.parse(saved);
            return cache;
          }
        } catch (e) {
          /* ignore broken cache */
        }
        throw error;
      });
  }

  function save(list) {
    var text = JSON.stringify(list, null, 2) + '\n';
    return EdisonApi.putText(EDISON_CONFIG.REPO, 'apps.json', 'Update Edison app registry', text).then(function () {
      return remember(list);
    });
  }

  function byRepo(list, repo) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].repo === repo) return list[i];
    }
    return null;
  }

  return { load: load, save: save, byRepo: byRepo };
})();
