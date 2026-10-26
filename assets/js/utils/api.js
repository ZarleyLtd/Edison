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
      body: options.body || undefined,
      cache: 'no-store'
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

  function updateComment(repo, commentId, body) {
    return request(repoPath(repo, '/issues/comments/' + commentId), {
      method: 'PATCH',
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

  function decodeGitHubContent(content) {
    if (!content) return '';
    try {
      return decodeURIComponent(escape(atob(String(content).replace(/\s/g, ''))));
    } catch (e) {
      return '';
    }
  }

  function unchangedFile(error) {
    return error && error.status === 409 && /identical|not changed|no change/i.test(error.message || '');
  }

  function putText(repo, path, message, text, branch) {
    var normalized = String(text).replace(/\r\n/g, '\n');
    var encoded = EdisonFormat.toBase64Text(normalized);
    return contents(repo, path, branch).then(function (file) {
      var existing = decodeGitHubContent(file && file.content).replace(/\r\n/g, '\n');
      if (existing === normalized) return { unchanged: true };
      return putContents(repo, path, message, encoded, branch, file && file.sha).catch(function (error) {
        if (unchangedFile(error)) return { unchanged: true };
        throw error;
      });
    }, function (error) {
      if (error.status === 404) return putContents(repo, path, message, encoded, branch, null);
      throw error;
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

  function pull(repo, number) {
    return request(repoPath(repo, '/pulls/' + number));
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

  function mergePull(repo, number) {
    return request(repoPath(repo, '/pulls/' + number + '/merge'), {
      method: 'PUT',
      body: JSON.stringify({ merge_method: 'squash' })
    });
  }

  function closePull(repo, number) {
    return request(repoPath(repo, '/pulls/' + number), {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' })
    });
  }

  function missingRef(error) {
    if (!error) return false;
    if (error.status === 404) return true;
    return error.status === 422 && /reference does not exist|not found/i.test(error.message || '');
  }

  function deleteBranch(repo, branch) {
    return request(repoPath(repo, '/git/refs/heads/' + encodeURIComponent(branch)), {
      method: 'DELETE'
    }).catch(function (error) {
      if (missingRef(error)) return null;
      throw error;
    });
  }

  function checkRuns(repo, sha) {
    return request(repoPath(repo, '/commits/' + sha + '/check-runs?per_page=20'));
  }

  function listOpenPulls(repo) {
    return request(repoPath(repo, '/pulls?state=open&per_page=100'));
  }

  function refExists(error) {
    return !!(error && /reference already exists|already exists/i.test(error.message || ''));
  }

  function photoResult(repo, saved, branch, path) {
    var sha = (saved.commit && saved.commit.sha) || branch || 'main';
    var direct = !branch && saved.content && saved.content.download_url;
    return { url: direct || EdisonQuery.photoFileUrl(owner(), repo, sha, path), branch: branch || '' };
  }

  function openTicketPull(repo, number, branch, base) {
    return createPull(repo, {
      title: EdisonQuery.photoPullTitle(number),
      head: branch,
      base: base,
      body: EdisonQuery.photoPullBody(number)
    }).catch(function (error) {
      if (refExists(error)) return null;
      throw error;
    });
  }

  function storeTicketPhoto(repo, number, path, base64, message, hold, isNew) {
    if (isNew) {
      return putContents(repo, path, message, base64).then(function (saved) {
        return photoResult(repo, saved, '', path);
      });
    }
    if (hold && hold.branch) {
      return putContents(repo, path, message, base64, hold.branch).then(function (saved) {
        return photoResult(repo, saved, hold.branch, path);
      });
    }
    return listOpenPulls(repo).then(function (pulls) {
      var existing = EdisonQuery.ticketPulls(pulls, owner(), repo, number)[0];
      if (existing && existing.head && existing.head.ref) {
        if (hold) hold.branch = existing.head.ref;
        return putContents(repo, path, message, base64, existing.head.ref).then(function (saved) {
          return photoResult(repo, saved, existing.head.ref, path);
        });
      }
      return repoMeta(repo).then(function (meta) {
        var base = (meta && meta.default_branch) || 'main';
        var branch = EdisonQuery.photoBranch(number);
        return branchSha(repo, base).then(function (sha) {
          return createBranch(repo, branch, sha).catch(function (error) {
            if (refExists(error)) return null;
            throw error;
          });
        }).then(function () {
          return putContents(repo, path, message, base64, branch);
        }).then(function (saved) {
          if (hold) hold.branch = branch;
          return openTicketPull(repo, number, branch, base).then(function () {
            return photoResult(repo, saved, branch, path);
          });
        });
      });
    });
  }

  function keepHead(repo, branch) {
    return branchSha(repo, branch).then(function (sha) {
      return request(repoPath(repo, '/git/refs'), {
        method: 'POST',
        body: JSON.stringify({ ref: 'refs/tags/edison-kept/' + branch, sha: sha })
      });
    }).catch(function () {
      return null;
    });
  }

  function combinePulls(groups) {
    var seen = {};
    var out = [];
    groups.forEach(function (group) {
      (group || []).forEach(function (item) {
        if (!item || seen[item.number]) return;
        seen[item.number] = true;
        out.push(item);
      });
    });
    return out;
  }

  function searchPulls(repo, number) {
    var query = EdisonQuery.buildPrQuery(owner(), repo, number);
    var searched = request('/search/issues?per_page=20&q=' + encodeURIComponent(query)).then(function (result) {
      return (result.items || []).filter(function (item) {
        if (!item.pull_request) return false;
        return EdisonQuery.mentionsIssue((item.title || '') + '\n' + (item.body || ''), number);
      });
    });
    var listed = listOpenPulls(repo).then(function (pulls) {
      return EdisonQuery.ticketPulls(pulls, owner(), repo, number);
    }).catch(function () { return []; });
    return searched.then(function (found) {
      return listed.then(function (open) {
        return combinePulls([found, open]);
      });
    }, function (error) {
      return listed.then(function (open) {
        if (open.length) return open;
        throw error;
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
    updateComment: updateComment,
    ensureLabels: ensureLabels,
    repoMeta: repoMeta,
    createRepo: createRepo,
    contents: contents,
    putContents: putContents,
    putText: putText,
    createBranch: createBranch,
    branchSha: branchSha,
    pull: pull,
    decodeContent: decodeGitHubContent,
    openPulls: openPulls,
    createPull: createPull,
    mergePull: mergePull,
    closePull: closePull,
    deleteBranch: deleteBranch,
    keepHead: keepHead,
    storeTicketPhoto: storeTicketPhoto,
    checkRuns: checkRuns,
    searchPulls: searchPulls
  };
})();
