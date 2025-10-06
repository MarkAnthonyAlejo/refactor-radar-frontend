import * as vscode from "vscode";
import axios from "axios";
import * as path from "path";
import * as fs from "fs";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BACKEND_URL = process.env.BACKEND_URL;

export async function sendFilePathsToBackend(
  selectedFiles: vscode.Uri[]
): Promise<any[]> {
  if (!BACKEND_URL) {
    vscode.window.showErrorMessage("Backend URL not set in .env");
    return [];
  }

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

    // 2. Call backend using environment variable
    console.log("Sending files to backend:", fileData.map(f => f.filename));
    const response = await axios.post(
      `${BACKEND_URL}/api/analyze`,
      fileData
    );

    console.log("Backend response:", response.data);

    // 3. Return results
    return response.data.results || response.data;
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Failed to send files to backend: ${error.message}`
    );
    console.error(error);
    return [];
  }
}
