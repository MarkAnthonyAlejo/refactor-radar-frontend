//Ignore OpenDiff.ts for now and can be implemented later 
import * as vscode from "vscode";

export async function openDiffInVSCode(
  filePath: string,
  originalCode: string,   // you may not actually need this since left side = real file
  refactoredCode: string,
  language: string
) {
  const fileUri = vscode.Uri.file(filePath);

  // Left side = actual file on disk (opened normally)
  const leftDoc = await vscode.workspace.openTextDocument(fileUri);

  // Right side = refactored, kept in-memory only
  const rightDoc = await vscode.workspace.openTextDocument({
    content: refactoredCode,
    language
  });

  await vscode.commands.executeCommand(
    "vscode.diff",
    leftDoc.uri,
    rightDoc.uri,
    `${filePath} (Original ↔ Refactored)`
  );
}
