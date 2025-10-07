import * as vscode from 'vscode';
import * as prettier from 'prettier';
import { sendFilePathsToBackend } from './utils/sendFilePathsToBackend';
import { diffLines, Change } from 'diff';

// =======================================================
// ------------------ Classes ---------------------------
// =======================================================

class FileNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly uri: vscode.Uri,
    private selected: boolean
  ) {
    super(label);
    this.resourceUri = uri;
    this.description = selected ? '✓ Selected' : '';
    this.contextValue = 'fileNode';
    this.iconPath = new vscode.ThemeIcon(selected ? 'check' : 'circle-outline');
    this.command = {
      command: 'refactor-radartest.toggleFileSelect',
      title: 'Toggle File Selection',
      arguments: [uri],
    };
  }
}

class FileTreeProvider implements vscode.TreeDataProvider<FileNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<FileNode | undefined> =
    new vscode.EventEmitter<FileNode | undefined>();
  readonly onDidChangeTreeData: vscode.Event<FileNode | undefined> =
    this._onDidChangeTreeData.event;

  private selectedFiles = new Set<string>();

  async getChildren(): Promise<FileNode[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return [];
    const files = await vscode.workspace.findFiles(
      '**/*.{ts,js,tsx,jsx,html,css,json}',
      '**/node_modules/**'
    );
    return files.map((file) => {
      const label = vscode.workspace.asRelativePath(file);
      const isSelected = this.selectedFiles.has(file.fsPath);
      return new FileNode(label, file, isSelected);
    });
  }

  getTreeItem(element: FileNode): vscode.TreeItem {
    return element;
  }

  toggleSelection(uri: vscode.Uri) {
    if (this.selectedFiles.has(uri.fsPath)) {
      this.selectedFiles.delete(uri.fsPath);
    } else {
      this.selectedFiles.add(uri.fsPath);
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  getSelectedFiles(): vscode.Uri[] {
    return Array.from(this.selectedFiles).map((path) => vscode.Uri.file(path));
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}

// =======================================================
// ------------------ Utility / HTML Helpers -----------
// =======================================================

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getTechDebtColor(score: number): string {
  if (score <= 30) return '#41B445';
  if (score <= 70) return 'orange';
  return '#FB5E55';
}

function getLanguageFromFilename(filename: string): string {
  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return 'ts';
  if (filename.endsWith('.js') || filename.endsWith('.jsx')) return 'js';
  if (filename.endsWith('.json')) return 'json';
  if (filename.endsWith('.css')) return 'css';
  if (filename.endsWith('.html')) return 'html';
  return 'js';
}

async function formatCode(code: string, filename: string): Promise<string> {
  try {
    return await prettier.format(code, {
      parser:
        filename.endsWith('.ts') || filename.endsWith('.tsx')
          ? 'typescript'
          : filename.endsWith('.js') || filename.endsWith('.jsx')
          ? 'babel'
          : filename.endsWith('.json')
          ? 'json'
          : filename.endsWith('.css')
          ? 'css'
          : filename.endsWith('.html')
          ? 'html'
          : 'babel',
      singleQuote: true,
      semi: true,
      tabWidth: 2,
      trailingComma: 'all',
    });
  } catch {
    return code;
  }
}

// =======================================================
// ------------------ Diff HTML Builder -----------------
// =======================================================

function buildPrettyDiffHtml(original: string, refactored: string): string {
  const diff = diffLines(original, refactored)
    .map((part: Change) => {
      const lines = part.value.split('\n');
      if (part.added)
        return lines
          .map((l: string) => `<div class="added">${escapeHtml(l)}</div>`)
          .join('');
      if (part.removed)
        return lines
          .map((l: string) => `<div class="removed">${escapeHtml(l)}</div>`)
          .join('');
      return lines
        .map((l: string) => `<div class="unchanged">${escapeHtml(l)}</div>`)
        .join('');
    })
    .join('');

  return `
    <div style="
      font-family: monospace;
      font-size: 0.85rem;
      line-height: 1.3;
      white-space: pre;
      background: #0C1117;
      border: 1px solid #3D444D;
      border-radius: 6px;
      padding: 1rem;
      overflow-x: auto;
    ">
      ${diff}
    </div>

    <style>
      .added { background-color: #113A1B; color: #a8ff9e; padding: 0 0.5rem; }
      .removed { background-color: #450D0F; color: #ff9e9e; padding: 0 0.5rem; }
      .unchanged { color: #ccc; padding: 0 0.5rem; }
    </style>
  `;
}

// =======================================================
// ------------------ Webview Builders -----------------
// =======================================================

async function getWebviewContent(result: any): Promise<string> {
  const { filename, techDebtScore, explanation, suggestions, refactoredCode, originalCode } = result;
  const lang = getLanguageFromFilename(filename);
  const formattedOriginal = await formatCode(originalCode || '', filename);
  const formattedRefactored = await formatCode(refactoredCode || '', filename);
  const diffHtml = buildPrettyDiffHtml(formattedOriginal, formattedRefactored);

  return `
    <section>
      <h1 style="color:#4493F8;">Refactor Report – ${filename}</h1>
      <p>
        <b>Tech Debt Score:</b>
        <span style="color:${getTechDebtColor(techDebtScore)};">${techDebtScore}/100</span>
      </p>
      <p><b>Explanation:</b> ${explanation}</p>

      <h2>Suggestions</h2>
      <ul>${(suggestions || []).map((s: string) => `<li>${s}</li>`).join('')}</ul>

      <h2 style="color:#F0F6FD;">Original Code</h2>
      <pre style="
        background:#0C1117;
        border:1px solid #3D444D;
        border-radius:6px;
        padding:1rem;
        overflow-x:auto;
      ">
        <code class="language-${lang}">${escapeHtml(formattedOriginal)}</code>
      </pre>

      <h2 style="display:flex; align-items:center; gap:0.5rem; color:#228736; font-weight:600;">
        Refactored Code
        <span style="
          background:#228736;
          color:#fff;
          font-size:0.75rem;
          padding:2px 8px;
          border-radius:12px;
          text-transform:uppercase;
          letter-spacing:0.5px;
        ">New</span>
      </h2>
      <div style="border-left:3px solid #228736; padding-left:0.75rem; margin-top:0.5rem;">
        <pre style="
          background:#0C1117;
          border:1px solid #333;
          border-radius:6px;
          padding:1rem;
          font-size:0.85rem;
          overflow-x:auto;
        ">
<code class="language-${lang}">${escapeHtml(formattedRefactored)}</code>
        </pre>
      </div>

      <h2>Diff</h2>
      ${diffHtml}

      <button id="accept" data-filename="${filename}" data-code="${encodeURIComponent(refactoredCode || '')}">Refactor</button>
      <button id="reject" data-filename="${filename}">Reject</button>
    </section>

    <script>
      const vscode = acquireVsCodeApi();
      document.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
          const btn = e.target;
          const filename = btn.dataset.filename;
          if (btn.id === 'accept') {
            const refactoredCode = decodeURIComponent(btn.dataset.code || '');
            vscode.postMessage({ command: 'accept', filename, refactoredCode });
          }
          if (btn.id === 'reject') {
            vscode.postMessage({ command: 'reject', filename });
          }
        }
      });
    </script>
    <script>Prism.highlightAll();</script>
  `;
}

async function getFullWebviewContent(results: any[]): Promise<string> {
  const sections = await Promise.all(results.map((r) => getWebviewContent(r)));
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <link href="https://cdn.jsdelivr.net/npm/prismjs@1.30.0/themes/prism-tomorrow.css" rel="stylesheet" />
        <script src="https://cdn.jsdelivr.net/npm/prismjs@1.30.0/prism.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/prismjs@1.30.0/components/prism-typescript.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/prismjs@1.30.0/components/prism-javascript.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/prismjs@1.30.0/components/prism-json.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/prismjs@1.30.0/components/prism-css.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/prismjs@1.30.0/components/prism-markup.min.js"></script>
        <meta charset="UTF-8" />
        <style>
          body { background:#0C1117; color:white; font-family:sans-serif; padding:1rem; }
          section { margin-bottom:2rem; padding:1rem; background:#0C1117; border-radius:8px; }
          pre { background:#111; color:#bbb; padding:1rem; border-radius:6px; white-space:pre-wrap; }
          button { margin-top:1rem; margin-right:1rem; padding:.5rem 1rem; border:none; border-radius:4px; cursor:pointer; }
          button#accept { background:#228736; color:white; }
          button#reject { background:#E34D27; color:white; }
        </style>
      </head>
      <body>
        ${sections.join('<hr/>')}
      </body>
    </html>
  `;
}

// =======================================================
// ------------------ Extension Activation -----------------
// =======================================================

export function activate(context: vscode.ExtensionContext) {
  const fileTreeProvider = new FileTreeProvider();
  vscode.window.registerTreeDataProvider('refactorFileView', fileTreeProvider);

  // Refresh tree when workspace folders change
  vscode.workspace.onDidChangeWorkspaceFolders(() => fileTreeProvider.refresh());

  // Refresh tree when files are created/changed/deleted
  const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,js,tsx,jsx,html,css,json}');
  fileWatcher.onDidCreate(() => fileTreeProvider.refresh());
  fileWatcher.onDidDelete(() => fileTreeProvider.refresh());
  fileWatcher.onDidChange(() => fileTreeProvider.refresh());
  context.subscriptions.push(fileWatcher);

  // Toggle File Selection
  const toggleFileSelectCommand = vscode.commands.registerCommand(
    'refactor-radartest.toggleFileSelect',
    (uri: vscode.Uri) => fileTreeProvider.toggleSelection(uri)
  );
  context.subscriptions.push(toggleFileSelectCommand);

  // Run Refactor & Show Webview
  const runRefactorCommand = vscode.commands.registerCommand(
    'refactor-radartest.runRefactor',
    async () => {
      const selectedFiles = fileTreeProvider.getSelectedFiles();
      if (!selectedFiles.length) {
        vscode.window.showWarningMessage('No files selected to refactor.');
        return;
      }

      const panel = vscode.window.createWebviewPanel(
        'refactorRadarReport',
        'Refactor Report',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );

      panel.webview.html = `
        <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1e1e1e;color:#fff;flex-direction:column;">
          <div style="border:4px solid #444;border-top:4px solid #007acc;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;"></div>
          <p style="margin-top:1rem;">Analyzing, please wait...</p>
          <style>@keyframes spin {0% { transform: rotate(0deg);} 100% { transform: rotate(360deg);}}</style>
        </div>
      `;

      try {
        const results: any[] = await sendFilePathsToBackend(selectedFiles);
        if (!results.length) {
          panel.webview.html = '<p style="color:white;padding:1rem;">⚠️ No results from backend.</p>';
          return;
        }

        const originalContents = new Map<string, Uint8Array>();
        for (const file of selectedFiles) {
          originalContents.set(file.fsPath, await vscode.workspace.fs.readFile(file));
        }

        const mergedResults: Record<string, any> = {};
        for (const message of results) {
          if (!mergedResults[message.filename]) {
            mergedResults[message.filename] = {
              ...message,
              suggestions: [...(message.suggestions || [])],
              refactoredCode: message.refactoredCode || message.originalCode,
            };
          } else {
            const existing = mergedResults[message.filename];
            existing.suggestions.push(...(message.suggestions || []));
            if (message.refactoredCode && message.refactoredCode.length > (existing.refactoredCode?.length || 0)) {
              existing.refactoredCode = message.refactoredCode;
            }
          }
        }

        const displayResults = Object.values(mergedResults);
        panel.webview.html = await getFullWebviewContent(displayResults);

        panel.webview.onDidReceiveMessage(async (message) => {
          const fileUri = vscode.Uri.file(message.filename);
          if (message.command === 'accept') {
            try {
              const formattedCode = await prettier.format(message.refactoredCode, {
                parser: message.filename.endsWith('.ts') || message.filename.endsWith('.tsx') ? 'typescript' : 'babel',
                singleQuote: true,
                semi: true,
                tabWidth: 2,
                trailingComma: 'all',
              });
              await vscode.workspace.fs.writeFile(fileUri, Buffer.from(formattedCode, 'utf8'));
              vscode.window.showInformationMessage(`✅ Refactored ${message.filename}`);
            } catch (err) {
              vscode.window.showErrorMessage(`Failed to refactor ${message.filename}: ${err instanceof Error ? err.message : String(err)}`);
            }
          } else if (message.command === 'reject') {
            const original = originalContents.get(message.filename);
            if (original) {
              await vscode.workspace.fs.writeFile(fileUri, original);
              vscode.window.showInformationMessage(`❌ Reverted changes for ${message.filename}`);
            }
          }
        });
      } catch (error) {
        panel.webview.html = `<p style="color:red;padding:1rem;">❌ Refactor failed: ${error instanceof Error ? error.message : String(error)}</p>`;
      }
    }
  );

  context.subscriptions.push(runRefactorCommand);

  // Initial refresh so sidebar shows files immediately
  fileTreeProvider.refresh();
}

// =======================================================
// ------------------ Deactivation ----------------------
// =======================================================

export function deactivate() {}
