//Files being sent to the backend 
import axios from 'axios';
import * as vscode from 'vscode';

export async function sendFilePathsToBackend(selectedFiles: vscode.Uri[]): Promise<void> {
    try {
    // 1. Read the contents of each selected file
    const fileData = await Promise.all(
      selectedFiles.map(async (uri) => {
        const content = await vscode.workspace.fs.readFile(uri);
        return {
          filename: uri.fsPath,
          code: Buffer.from(content).toString('utf8'),
        };
      })
    );

    // 2. Log the payload before sending
    console.log("📤 Sending payload to backend:", fileData);

    // 3. Send the payload to your backend
    const response = await axios.post('http://localhost:8000/api/analyze', fileData);

    // 4. Show success message
    vscode.window.showInformationMessage(`Refactor response: ${response.data.message || 'Success'}`);
  } catch (error: any) {
    console.error("Request failed:", error);
    vscode.window.showErrorMessage(`Failed to send files to backend: ${error.message}`);
  }
}
