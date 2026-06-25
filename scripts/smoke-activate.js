/* Diagnostic: load the bundled extension with a mocked `vscode` and run activate(). */
const Module = require('module');
const path = require('path');

const makeDisposable = () => ({ dispose() {} });

class EventEmitter {
  constructor() {
    this.event = () => makeDisposable();
  }
  fire() {}
  dispose() {}
}

const vscode = {
  EventEmitter,
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { Active: -1 },
  ProgressLocation: { Notification: 15 },
  FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
  Uri: {
    file: (p) => ({ fsPath: p, scheme: 'file', path: p, toString: () => 'file://' + p }),
    joinPath: (base, ...segs) => ({ fsPath: base.fsPath + '/' + segs.join('/'), path: (base.path || '') + '/' + segs.join('/'), toString: () => 'file://' + base.fsPath }),
    from: (o) => ({ ...o, toString: () => o.scheme + ':' + o.path }),
  },
  window: {
    createStatusBarItem: () => ({ text: '', tooltip: '', command: '', show() {}, hide() {}, dispose() {} }),
    createOutputChannel: () => ({ appendLine() {}, append() {}, show() {}, dispose() {} }),
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    setStatusBarMessage: () => makeDisposable(),
    withProgress: async (_o, task) => task({ report() {} }, { isCancellationRequested: false }),
    createWebviewPanel: () => ({
      webview: { html: '', cspSource: '', onDidReceiveMessage: () => makeDisposable(), postMessage: async () => true },
      onDidDispose: () => makeDisposable(),
      reveal() {},
      dispose() {},
    }),
    showOpenDialog: async () => undefined,
    showQuickPick: async () => undefined,
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({ get: (_k, d) => d }),
    registerTextDocumentContentProvider: () => makeDisposable(),
    fs: { readFile: async () => new Uint8Array(), writeFile: async () => {}, readDirectory: async () => [], stat: async () => ({ size: 0 }) },
  },
  commands: { registerCommand: () => makeDisposable(), getCommands: async () => [], executeCommand: async () => undefined },
  CancellationTokenSource: class {
    constructor() {
      this.token = { isCancellationRequested: false };
    }
  },
  LanguageModelChatMessage: { User: (s) => ({ role: 'user', content: s }) },
  lm: { selectChatModels: async () => [] },
};

const orig = Module._load;
Module._load = function (request) {
  if (request === 'vscode') {
    return vscode;
  }
  // eslint-disable-next-line prefer-rest-params
  return orig.apply(this, arguments);
};

try {
  const ext = require(path.resolve('dist/extension.js'));
  if (typeof ext.activate !== 'function') {
    console.error('NO_ACTIVATE_EXPORT keys=' + Object.keys(ext).join(','));
    process.exit(3);
  }
  const ctx = { subscriptions: [] };
  ext.activate(ctx);
  console.log('ACTIVATE_OK subscriptions=' + ctx.subscriptions.length);
} catch (e) {
  console.error('ACTIVATE_FAILED\n' + (e && e.stack ? e.stack : e));
  process.exit(2);
}
