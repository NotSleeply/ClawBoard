const AutoCategorize = require('./auto-categorize');
const HotkeyTemplates = require('./hotkey-templates');
const IgnoreRules = require('./ignore-rules');
const LRUCache = require('./LRUCache');
const PasteModeManager = require('./PasteModeManager');
const Platform = require('./platform');
const SecureUtils = require('./SecureUtils');
const SessionManager = require('./SessionManager');
const SmartPaste = require('./smart-paste');
const SnippetsManager = require('./SnippetsManager');
const TextFormatter = require('./TextFormatter');
const TextTransform = require('./text-transform');
const TriggerEngine = require('./TriggerEngine');

module.exports = {
  AutoCategorize,
  HotkeyTemplates,
  IgnoreRules,
  LRUCache,
  PasteModeManager,
  Platform,
  SecureUtils,
  SessionManager,
  SmartPaste,
  SnippetsManager,
  TextFormatter,
  TextTransform,
  TriggerEngine
};
