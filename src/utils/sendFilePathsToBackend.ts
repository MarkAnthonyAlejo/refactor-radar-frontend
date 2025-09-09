import * as vscode from "vscode";
import axios from "axios";

export async function sendFilePathsToBackend(
  selectedFiles: vscode.Uri[]
): Promise<any[]> { // ⬅️ note return type is now array of results
  try {
    // 1. Prepare files
    const fileData = await Promise.all(
      selectedFiles.map(async (uri) => {
        const content = await vscode.workspace.fs.readFile(uri);
        return {
          filename: uri.fsPath,
          code: Buffer.from(content).toString("utf8"),
        };
      })
    );

    // 2. Call backend
    console.log("Sending files to backend:", fileData.map(f => f.filename));
    const response = await axios.post(
      "http://localhost:8000/api/analyze",
      fileData
    );

    console.log("Backend response:", response.data);

    // 3. Just return results (no UI, no editors)
    return response.data.results || response.data;
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Failed to send files to backend: ${error.message}`
    );
    console.error(error);
    return [];
  }
}
