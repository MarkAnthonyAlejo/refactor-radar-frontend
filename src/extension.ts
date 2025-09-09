import * as vscode from 'vscode';
import * as prettier from 'prettier';
import { sendFilePathsToBackend } from './utils/sendFilePathsToBackend';

// ------------------ Classes ------------------ //

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
}

// ------------------ HTML Helpers ------------------ //

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getWebviewContent(result: any): string {
  const {
    filename,
    techDebtScore,
    explanation,
    suggestions,
    diff,
    refactoredCode,
    originalCode,
  } = result;

  return `
    <section>
      <h1 style="color:#007acc;">Refactor Report – ${filename}</h1>
      <p><b>Tech Debt Score:</b> ${techDebtScore}/100</p>
      
      <p><b>Explanation:</b> ${explanation}</p>
      
      <h2>Suggestions</h2>
      <ul>${(suggestions || []).map((s: string) => `<li>${s}</li>`).join('')}</ul>
      
      <h2>Original Code</h2>
      <pre>${escapeHtml(originalCode || '')}</pre>
      
      <h2>Refactored Code</h2>
      <pre>${escapeHtml(refactoredCode || '')}</pre>
      
      <h2>Diff</h2>
      <pre>${escapeHtml(diff || '')}</pre>

      <button 
        id="accept" 
        data-filename="${filename}" 
        data-code="${encodeURIComponent(refactoredCode || '')}">
        Refactor
      </button>
      <button 
        id="reject" 
        data-filename="${filename}">
        Reject
      </button>
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
  `;
}

function getFullWebviewContent(results: any[]): string {
  return /*html*/ `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <style>
        body { background:#1e1e1e; color:white; font-family:sans-serif; padding:1rem; }
        section { margin-bottom:2rem; padding:1rem; background:black; border-radius:8px; }
        pre { background:#111; color:#bbb; padding:1rem; border-radius:6px; white-space:pre-wrap; }
        button { margin-top:1rem; margin-right:1rem; padding:.5rem 1rem; border:none; border-radius:4px; cursor:pointer; }
        button#accept { background:#6B9956; color:white; }
        button#reject { background:#C94F4F; color:white; }
      </style>
    </head>
    <body>
      ${results.map(r => getWebviewContent(r)).join('<hr/>')}
    </body>
    </html>
  `;
}

// ------------------ Extension Activation ------------------ //

export function activate(context: vscode.ExtensionContext) {
  const fileTreeProvider = new FileTreeProvider();
  vscode.window.registerTreeDataProvider('refactorFileView', fileTreeProvider);

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
      if (selectedFiles.length === 0) {
        vscode.window.showWarningMessage('No files selected to refactor.');
        return;
      }

      const panel = vscode.window.createWebviewPanel(
        'refactorRadarReport',
        'Refactor Report',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );

      // Loading screen
      panel.webview.html = `
        <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1e1e1e;color:#fff;flex-direction:column;">
          <div style="border:4px solid #444;border-top:4px solid #007acc;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;"></div>
          <p style="margin-top:1rem;">Analyzing, please wait...</p>
          <style>@keyframes spin {0% { transform: rotate(0deg);} 100% { transform: rotate(360deg);}}</style>
        </div>
      `;

      try {
        const results: any[] = await sendFilePathsToBackend(selectedFiles);
        if (!results || results.length === 0) {
          panel.webview.html = `<p style="color:white;padding:1rem;">⚠️ No results from backend.</p>`;
          return;
        }

        // Save original contents
        const originalContents = new Map<string, Uint8Array>();
        for (const file of selectedFiles) {
          originalContents.set(file.fsPath, await vscode.workspace.fs.readFile(file));
        }

        // Merge results per file
        const mergedResults: Record<string, any> = {};
        for (const message of results) {
          if (!mergedResults[message.filename]) {
            mergedResults[message.filename] = {
              ...message,
              suggestions: [...(message.suggestions || [])],
              diff: message.diff || "",
              refactoredCode: message.refactoredCode || message.originalCode,
            };
          } else {
            const existing = mergedResults[message.filename];
            existing.suggestions.push(...(message.suggestions || []));
            existing.diff += "\n" + (message.diff || "");
            if (
              message.refactoredCode &&
              message.refactoredCode.length > (existing.refactoredCode?.length || 0)
            ) {
              existing.refactoredCode = message.refactoredCode;
            }
          }
        }

        const displayResults = Object.values(mergedResults);

        // ✅ Use single HTML shell
        panel.webview.html = getFullWebviewContent(displayResults);

        // ✅ Accept/Reject message handler with Prettier formatting
        panel.webview.onDidReceiveMessage(async (message) => {
          const fileUri = vscode.Uri.file(message.filename);

          if (message.command === 'accept') {
            try {
              // Format code with Prettier
              const formattedCode = await prettier.format(message.refactoredCode, {
                parser:
                  message.filename.endsWith('.ts') || message.filename.endsWith('.tsx')
                    ? 'typescript'
                    : 'babel',
                singleQuote: true,
                semi: true,
                tabWidth: 2,
                trailingComma: 'all',
              });

              await vscode.workspace.fs.writeFile(
                fileUri,
                Buffer.from(formattedCode, 'utf8')
              );

              vscode.window.showInformationMessage(`✅ Refactored ${message.filename}`);
            } catch (err) {
              vscode.window.showErrorMessage(
                `Failed to refactor ${message.filename}: ${
                  err instanceof Error ? err.message : String(err)
                }`
              );
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
        panel.webview.html = `<p style="color:red;padding:1rem;">❌ Refactor failed: ${
          error instanceof Error ? error.message : String(error)
        }</p>`;
      }
    }
  );

  context.subscriptions.push(runRefactorCommand);
}

// ------------------ Deactivation ------------------ //
export function deactivate() {}
