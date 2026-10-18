var EdisonAuth = (function () {
  'use strict';

  var KEY = 'edison.pat';

  function getToken() {
    try {
      return localStorage.getItem(KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function setToken(token) {
    try {
      localStorage.setItem(KEY, String(token || '').trim());
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearToken() {
    localStorage.removeItem(KEY);
  }

  return { getToken: getToken, setToken: setToken, clearToken: clearToken };
})();
