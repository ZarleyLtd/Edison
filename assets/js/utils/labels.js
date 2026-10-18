(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EdisonLabels = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ALL = [
    { name: 'edison', color: 'f5c518', description: 'Tracked by Edison' },
    { name: 'type:bug', color: 'd73a4a', description: 'Bug' },
    { name: 'type:change', color: 'fbca04', description: 'Change to something that exists' },
    { name: 'type:feature', color: '0e8a16', description: 'New feature' },
    { name: 'type:idea', color: 'c5def5', description: 'Idea' },
    { name: 'stage:inbox', color: 'ededed', description: 'Captured, not ready for an agent' },
    { name: 'stage:ready', color: 'fef2c0', description: 'Ready for an agent' },
    { name: 'stage:working', color: 'f9d0c4', description: 'Agent is working' },
    { name: 'stage:needs-input', color: 'd4c5f9', description: 'Agent needs a decision' },
    { name: 'stage:review', color: 'bfdadc', description: 'Pull request ready to review' },
    { name: 'stage:parked', color: 'cfd3d7', description: 'Parked' },
    { name: 'p1', color: 'b60205', description: 'Priority 1' },
    { name: 'p2', color: 'fbca04', description: 'Priority 2' },
    { name: 'p3', color: '0e8a16', description: 'Priority 3' },
    { name: 'app:new', color: 'f5c518', description: 'New app idea, no repository yet' }
  ];

  var STAGES = ['inbox', 'ready', 'working', 'needs-input', 'review', 'parked'];
  var TYPES = ['bug', 'change', 'feature', 'idea'];
  var PRIORITIES = ['p1', 'p2', 'p3'];

  var STAGE_LABEL = {
    inbox: 'Inbox',
    ready: 'Ready',
    working: 'Working',
    'needs-input': 'Needs you',
    review: 'In review',
    parked: 'Parked',
    done: 'Done'
  };

  var TYPE_LABEL = {
    bug: 'Bug',
    change: 'Change',
    feature: 'Feature',
    idea: 'Idea'
  };

  function names(labels) {
    return (labels || []).map(function (label) {
      return typeof label === 'string' ? label : label.name;
    });
  }

  function prefixed(labels, prefix) {
    var list = names(labels);
    for (var i = 0; i < list.length; i++) {
      if (list[i].indexOf(prefix) === 0) return list[i].slice(prefix.length);
    }
    return '';
  }

  function stageOf(labels) {
    return prefixed(labels, 'stage:') || 'inbox';
  }

  function typeOf(labels) {
    return prefixed(labels, 'type:');
  }

  function priorityOf(labels) {
    var list = names(labels);
    for (var i = 0; i < PRIORITIES.length; i++) {
      if (list.indexOf(PRIORITIES[i]) !== -1) return PRIORITIES[i];
    }
    return '';
  }

  function isNewApp(labels) {
    return names(labels).indexOf('app:new') !== -1;
  }

  function replacePrefixed(labels, prefix, value) {
    var next = names(labels).filter(function (name) {
      return name.indexOf(prefix) !== 0;
    });
    if (value) next.push(value);
    return next;
  }

  function replaceStage(labels, stage) {
    return replacePrefixed(labels, 'stage:', stage ? 'stage:' + stage : '');
  }

  function replaceType(labels, type) {
    return replacePrefixed(labels, 'type:', type ? 'type:' + type : '');
  }

  function replacePriority(labels, priority) {
    var next = names(labels).filter(function (name) {
      return PRIORITIES.indexOf(name) === -1;
    });
    if (priority) next.push(priority);
    return next;
  }

  return {
    ALL: ALL,
    STAGES: STAGES,
    TYPES: TYPES,
    PRIORITIES: PRIORITIES,
    STAGE_LABEL: STAGE_LABEL,
    TYPE_LABEL: TYPE_LABEL,
    names: names,
    stageOf: stageOf,
    typeOf: typeOf,
    priorityOf: priorityOf,
    isNewApp: isNewApp,
    replaceStage: replaceStage,
    replaceType: replaceType,
    replacePriority: replacePriority
  };
});
