// Files being sent to the backend 
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
    console.log('response - 123', response);


    // 4. Open backend response in a new editor tab
    const results = response.data.results || response.data; // handle both cases
    const doc = await vscode.workspace.openTextDocument({
      content: JSON.stringify(results, null, 2), // pretty-print JSON
      language: "json"
    });
    await vscode.window.showTextDocument(doc);


    // 5. Also show a small success popup
    vscode.window.showInformationMessage(`Refactor analysis complete for ${selectedFiles.length} file(s).`);

  } catch (error: any) {
    console.error("Request failed:", error);
    vscode.window.showErrorMessage(`Failed to send files to backend: ${error.message}`);
  }
}
