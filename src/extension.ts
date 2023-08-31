import * as vscode from 'vscode';
import * as path from 'path';

function minifyJavaContent(content: string): string {
    // Remove comments (single-line and multi-line)
    content = content.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');

    // Remove extra whitespace
    content = content.replace(/\s+/g, ' ');

    // Remove spaces around operators, parentheses, and semicolons
    content = content.replace(/\s*([=+\-*/%<>!&|,;()])\s*/g, '$1');

    return content;
}

function removeJavaImports(content: string): string {
    // Remove all import statements
     // Remove import statements
  content = content.replace(/^\s*import\s+[\w.{}\s,*;]+;/gm, '');

  // Remove package statement
  content = content.replace(/^package\s+[a-zA-Z.]+;\n/gm, '');

  content = minifyJavaContent(content);
  return content;
}

async function processFile(uri: vscode.Uri): Promise<string> {
    const document = await vscode.workspace.openTextDocument(uri);
    let fileContent = document.getText();

    // Remove imports before copying content
    fileContent = removeJavaImports(fileContent);

    return fileContent;
}

async function processFolder(uri: vscode.Uri): Promise<string> {
    const files = await vscode.workspace.fs.readDirectory(uri);
    let folderContent = "";

    for (const [name, fileType] of files) {
        if (fileType === vscode.FileType.File) {
            const filePath = path.join(uri.fsPath, name);
            const fileUri = vscode.Uri.file(filePath);
            const fileContent = await processFile(fileUri);

            folderContent += `=====${name}=====\n${fileContent}\n\n`;
        }
    }

    return folderContent;
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.copyFilesContent', async (resourceUris) => {
            if (!Array.isArray(resourceUris[1]) || resourceUris[1].length === 0) {
                vscode.window.showErrorMessage("No files selected.");
                return;
            }

            let copiedContent = "";
            const separator = "=====";

            for (const uri of resourceUris[1]) {
                const stats = await vscode.workspace.fs.stat(uri);

                if (stats.type === vscode.FileType.File) {
                    // Process individual file
                    const fileContent = await processFile(uri);
                    copiedContent += `${separator} ${path.basename(uri.fsPath)} ${separator}\n${fileContent}\n\n`;
                } 
            }

            await vscode.env.clipboard.writeText(copiedContent);
            vscode.window.showInformationMessage("Content copied to clipboard!");
        })
    );

    context.subscriptions.push(
        // vscode.commands.registerCommand('extension.activateContextMenu', () => {
            vscode.commands.registerCommand('extension.openContextMenu', (...resourceUris) => {
                vscode.commands.executeCommand('extension.copyFilesContent', resourceUris);
            })
        //     context.subscriptions.push(disposable);
        // })
    );
}

export function deactivate() {}
