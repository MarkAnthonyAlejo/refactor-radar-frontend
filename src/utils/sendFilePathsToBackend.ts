//Files being sent to the backend 
import * as vscode from 'vscode';

export async function sendFilePathsToBackend(selectedFiles: vscode.Uri[]): Promise<void> {
  const filePaths: string[] = selectedFiles.map(uri => uri.fsPath);

  const payload: { files: string[] } = { files: filePaths };

  try {
    const response = await fetch('http://localhost:3000/refactor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json() as { message: string };

    vscode.window.showInformationMessage(`Refactor response: ${data.message}`);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to send files to backend: ${error}`);
  }
}
