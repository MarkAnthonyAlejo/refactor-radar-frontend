// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { sendFilePathsToBackend } from './utils/sendFilePathsToBackend';

//Classes go here 

// A TreeItem representing a single file with selection toggle logic
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
			arguments: [uri]
		};
	}
}

// Provides the tree data (file nodes) to the sidebar
class FileTreeProvider implements vscode.TreeDataProvider<FileNode> {
	private _onDidChangeTreeData: vscode.EventEmitter<FileNode | undefined> = new vscode.EventEmitter<FileNode | undefined>();
	readonly onDidChangeTreeData: vscode.Event<FileNode | undefined> = this._onDidChangeTreeData.event;

	private selectedFiles = new Set<string>();

	async getChildren(): Promise<FileNode[]> {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders) return [];

		const files = await vscode.workspace.findFiles('**/*.{ts,js,tsx,jsx,html,css,json}', '**/node_modules/**');

		return files.map(file => {
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
		this._onDidChangeTreeData.fire(undefined); // Refresh UI
	}

	getSelectedFiles(): vscode.Uri[] {
		return Array.from(this.selectedFiles).map(path => vscode.Uri.file(path));
	}
}

//Classes go here 


export function activate(context: vscode.ExtensionContext) {
	// Hello World command (optional)
	const helloCommand = vscode.commands.registerCommand(
		'refactor-radartest.helloWorld',
		() => {
			vscode.window.showInformationMessage('Hello World from Refactor-Radar!');
		}
	);
	context.subscriptions.push(helloCommand);

	// Refactor Command Will add a side bar to select the files we want refactor 
	const refactorCommand = vscode.commands.registerCommand(
		'refactor-radartest.refactorCode',
		() => { //Pop up shows up 
			vscode.window.showInformationMessage('Refactor Radar opened. Check the sidebar!');
			// TODO: Add refactoring logic here
		}
	);
	context.subscriptions.push(refactorCommand);
	5
	// Status Bar Button
	const statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		100
	);
	statusBarItem.text = '$(rocket) Refactor Radar'; // Icon + label
	statusBarItem.tooltip = 'Click to refactor your code';
	statusBarItem.command = 'refactor-radartest.refactorCode'; // Links to the command above
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	//Sidebar PLEASE NOTE 
	const fileTreeProvider = new FileTreeProvider();
	vscode.window.registerTreeDataProvider('refactorFileView', fileTreeProvider);

	// Toggle File Selection Command
	const toggleFileSelectCommand = vscode.commands.registerCommand(
		'refactor-radartest.toggleFileSelect',
		(uri: vscode.Uri) => {
			fileTreeProvider.toggleSelection(uri);
		}
	);
	context.subscriptions.push(toggleFileSelectCommand);

	//Register Button for Run Refactor 
	const runRefactorCommand = vscode.commands.registerCommand(
		'refactor-radartest.runRefactor',
		async () => {
			const selectedFiles = fileTreeProvider.getSelectedFiles();
			if (selectedFiles.length === 0) {
				vscode.window.showWarningMessage('No files selected to refactor.');
				return;
			}

			// Stub: Replace this with your actual refactor logic
			vscode.window.showInformationMessage(`Running refactor on ${selectedFiles.length} files...`);

			try {
				// 🔁 Send files to backend
				const response: any = await sendFilePathsToBackend(selectedFiles);

				// ✅ Safe handling
				if (typeof response === 'object' && response !== null && 'message' in response && typeof response.message === 'string') {
					vscode.window.showInformationMessage(`Refactor response: ${response.message}`);
				} else {
					vscode.window.showErrorMessage('Unexpected response from backend.');
				}

			} catch (error) {
				vscode.window.showErrorMessage(`Refactor failed: ${error instanceof Error ? error.message : String(error)}`);
			}

		}
	);
	context.subscriptions.push(runRefactorCommand);


}

export function deactivate() { }
