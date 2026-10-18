var EdisonApi = (function () {
  'use strict';

  function owner() {
    return EDISON_CONFIG.OWNER;
  }

  function encodePath(path) {
    return String(path)
      .split('/')
      .map(function (segment) {
        return encodeURIComponent(segment);
      })
      .join('/');
  }

  function request(path, options) {
    options = options || {};
    var token = EdisonAuth.getToken();
    if (!token) {
      return Promise.reject(new Error('Add a GitHub token in Settings.'));
    }
    var headers = {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (options.body) headers['Content-Type'] = 'application/json';
    return fetch(EDISON_CONFIG.API + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body || undefined
    }).then(function (res) {
      var remaining = res.headers.get('X-RateLimit-Remaining');
      var reset = res.headers.get('X-RateLimit-Reset');
      return res.text().then(function (text) {
        var data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (e) {
            data = null;
          }
        }
        if (res.status === 403 && remaining === '0') {
          var when = reset ? new Date(Number(reset) * 1000).toLocaleTimeString() : 'later';
          throw new Error('GitHub rate limit reached. Try again at ' + when + '.');
        }
        if (res.status === 401) {
          throw new Error('GitHub rejected the token. Check it in Settings.');
        }
        if (res.status === 403 && data && /rate limit/i.test(data.message || '')) {
          throw new Error('GitHub asked us to slow down. Wait a minute and try again.');
        }
        if (!res.ok) {
          var message = (data && (data.message || (data.errors && data.errors[0] && data.errors[0].message))) || res.statusText;
          var error = new Error(message || 'GitHub request failed');
          error.status = res.status;
          throw error;
        }
        return data;
      });
    });
  }

  function repoPath(repo, rest) {
    return '/repos/' + owner() + '/' + encodeURIComponent(repo) + rest;
  }

  function user() {
    return request('/user');
  }

  function searchIssues(query) {
    return request('/search/issues?per_page=50&sort=updated&order=desc&q=' + encodeURIComponent(query));
  }

  function issue(repo, number) {
    return request(repoPath(repo, '/issues/' + number));
  }

  function createIssue(repo, fields) {
    return request(repoPath(repo, '/issues'), {
      method: 'POST',
      body: JSON.stringify(fields)
    });
  }

  function updateIssue(repo, number, fields) {
    return request(repoPath(repo, '/issues/' + number), {
      method: 'PATCH',
      body: JSON.stringify(fields)
    });
  }

  function comments(repo, number) {
    return request(repoPath(repo, '/issues/' + number + '/comments?per_page=100'));
  }

  function createComment(repo, number, body) {
    return request(repoPath(repo, '/issues/' + number + '/comments'), {
      method: 'POST',
      body: JSON.stringify({ body: body })
    });
  }

  function listLabels(repo) {
    return request(repoPath(repo, '/labels?per_page=100'));
  }

  function ensureLabels(repo) {
    return listLabels(repo).then(function (existing) {
      var have = {};
      (existing || []).forEach(function (label) {
        have[label.name] = true;
      });
      var missing = EdisonLabels.ALL.filter(function (label) {
        return !have[label.name];
      });
      return missing.reduce(function (chain, label) {
        return chain.then(function () {
          return request(repoPath(repo, '/labels'), {
            method: 'POST',
            body: JSON.stringify(label)
          }).catch(function (error) {
            if (error.status === 422) return null;
            throw error;
          });
        });
      }, Promise.resolve());
    });
  }

  function repoMeta(repo) {
    return request(repoPath(repo, ''));
  }

  function createRepo(name, description) {
    return request('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name: name,
        description: description || 'Created from an Edison idea',
        private: false,
        auto_init: false,
        has_issues: true
      })
    });
  }

  function contents(repo, path, ref) {
    var suffix = ref ? '?ref=' + encodeURIComponent(ref) : '';
    return request(repoPath(repo, '/contents/' + encodePath(path) + suffix));
  }

  function putContents(repo, path, message, base64, branch, sha) {
    var payload = { message: message, content: base64 };
    if (branch) payload.branch = branch;
    if (sha) payload.sha = sha;
    return request(repoPath(repo, '/contents/' + encodePath(path)), {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  }

  function putText(repo, path, message, text, branch) {
    var lookup = contents(repo, path, branch).then(
      function (file) {
        return file.sha;
      },
      function (error) {
        if (error.status === 404) return null;
        throw error;
      }
    );
    return lookup.then(function (sha) {
      return putContents(repo, path, message, EdisonFormat.toBase64Text(text), branch, sha);
    });
  }

  function createBranch(repo, branch, sha) {
    return request(repoPath(repo, '/git/refs'), {
      method: 'POST',
      body: JSON.stringify({ ref: 'refs/heads/' + branch, sha: sha })
    });
  }

  function branchSha(repo, branch) {
    return request(repoPath(repo, '/git/ref/heads/' + encodeURIComponent(branch))).then(function (ref) {
      return ref.object.sha;
    });
  }

  function openPulls(repo, head) {
    return request(repoPath(repo, '/pulls?state=open&head=' + encodeURIComponent(owner() + ':' + head)));
  }

  function createPull(repo, fields) {
    return request(repoPath(repo, '/pulls'), {
      method: 'POST',
      body: JSON.stringify(fields)
    });
  }

  function checkRuns(repo, sha) {
    return request(repoPath(repo, '/commits/' + sha + '/check-runs?per_page=20'));
  }

  function searchPulls(repo, number) {
    var query = EdisonQuery.buildPrQuery(owner(), repo, number);
    return request('/search/issues?per_page=20&q=' + encodeURIComponent(query)).then(function (result) {
      return (result.items || []).filter(function (item) {
        if (!item.pull_request) return false;
        return EdisonQuery.mentionsIssue((item.title || '') + '\n' + (item.body || ''), number);
      });
    });
  }

  return {
    request: request,
    user: user,
    searchIssues: searchIssues,
    issue: issue,
    createIssue: createIssue,
    updateIssue: updateIssue,
    comments: comments,
    createComment: createComment,
    ensureLabels: ensureLabels,
    repoMeta: repoMeta,
    createRepo: createRepo,
    contents: contents,
    putContents: putContents,
    putText: putText,
    createBranch: createBranch,
    branchSha: branchSha,
    openPulls: openPulls,
    createPull: createPull,
    checkRuns: checkRuns,
    searchPulls: searchPulls
  };
})();
