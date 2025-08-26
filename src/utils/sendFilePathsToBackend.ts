import * as vscode from "vscode";
import axios from "axios";

export async function sendFilePathsToBackend(
  selectedFiles: vscode.Uri[]
): Promise<void> {
  try {
    const fileData = await Promise.all(
      selectedFiles.map(async (uri) => {
        const content = await vscode.workspace.fs.readFile(uri);
        return {
          filename: uri.fsPath,
          code: Buffer.from(content).toString("utf8"),
        };
      })
    );

    const response = await axios.post(
      "http://localhost:8000/api/analyze",
      fileData
    );

    const results = response.data.results || response.data;
    console.log("sendFilePath - ", response.data);

    // 🔥 REPLACE your existing loop with this one:
    for (const result of results) {
      const {
        filename,
        originalCode,
        refactoredCode,
        language,
        diff,
        explanation,
        issues,
        suggestions,
        techDebtScore,
      } = result;

      // 1. Open code in editors (your existing behavior)
      const originalDoc = await vscode.workspace.openTextDocument({
        content: originalCode,
        language: language || "typescript",
      });
      await vscode.window.showTextDocument(originalDoc, {
        preview: false,
        viewColumn: vscode.ViewColumn.One,
      });

      const refactoredDoc = await vscode.workspace.openTextDocument({
        content: refactoredCode,
        language: language || "typescript",
      });
      await vscode.window.showTextDocument(refactoredDoc, {
        preview: false,
        viewColumn: vscode.ViewColumn.Two,
      });

      // 2. Optionally display extra metadata
      vscode.window.showInformationMessage(
        `💡 ${filename}\nTech Debt Score: ${techDebtScore}\n\n${explanation}`
      );

      console.log("Issues:", issues);
      console.log("Suggestions:", suggestions);
      console.log("Diff:", diff);
    }

    vscode.window.showInformationMessage(
      `✅ Refactor analysis complete for ${selectedFiles.length} file(s).`
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Failed to send files to backend: ${error.message}`
    );
    console.error(error);
  }
}
