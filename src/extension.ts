import * as vscode from 'vscode';
import * as path from 'path';
import mammoth = require('mammoth');
import * as XLSX from 'xlsx';
import * as fs from 'fs';

const dataFolderName = '.vscode';

function getDataFolderPath(workspaceFolder: vscode.WorkspaceFolder | undefined): string {
    if (workspaceFolder) {
        return path.join(workspaceFolder.uri.fsPath, dataFolderName);
    }
    return '';
}

function getDataFilePath(workspaceFolder: vscode.WorkspaceFolder | undefined): string {
    return path.join(getDataFolderPath(workspaceFolder), 'cm-bookmark.json');
}

function saveData(data: any, workspaceFolder: vscode.WorkspaceFolder | undefined) {
    const dataFolderPath = getDataFolderPath(workspaceFolder);
    if (!fs.existsSync(dataFolderPath)) {
        fs.mkdirSync(dataFolderPath);
    }

    const dataFilePath = getDataFilePath(workspaceFolder);
    fs.writeFileSync(dataFilePath, JSON.stringify(data));
}

function retrieveData(workspaceFolder: vscode.WorkspaceFolder | undefined): any | undefined {
    const dataFilePath = getDataFilePath(workspaceFolder);
    if (fs.existsSync(dataFilePath)) {
        const data = fs.readFileSync(dataFilePath, 'utf-8');
        return JSON.parse(data);
    }
    return {
        groups: []
    };
}

// const pdf2html = require('pdf2html');
// const minify = require('html-minifier').minify;

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

function readXLSXFile(filePath: string): string {
    try {
      // Load the XLSX file
      const workbook = XLSX.readFile(filePath);
  
      // Get the first sheet in the workbook
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
  
      // Convert the sheet data to JSON
      const data = XLSX.utils.sheet_to_json(sheet);
  
      // Create a function to convert JSON data to CSV
      function jsonToCSV(data: any) {
        const csvHeader = Object.keys(data[0]);
        const csvData = data.map((row: any) => csvHeader.map((fieldName) => row[fieldName]));
        const csv = [csvHeader.join(','), ...csvData.map((row: any) => row.join(','))].join('\n');
        return csv;
      }
  
      // Convert JSON data to CSV
      const csv = jsonToCSV(data);
  
      return csv;
    } catch (error) {
      console.error(`Error reading XLSX file at ${filePath}: ${error}`);
      return "";
    }
}

async function processFile(uri: vscode.Uri): Promise<[string, string]> {
    const filename = path.basename(uri.fsPath);
    if (filename.endsWith('.docx')) {
        const html = await mammoth.convertToHtml({path: uri.fsPath}); 
        return [uri.fsPath, html.value]; 
    }
    if (filename.endsWith('.xlsx')) {
        return [uri.fsPath, readXLSXFile(uri.fsPath)]; 
    }
    // if (filename.endsWith('.pdf')) {
    //     return readPDFFile(uri); 
    // }

    const document = await vscode.workspace.openTextDocument(uri);

    let fileContent = document.getText();

    // Remove imports before copying content
    fileContent = removeJavaImports(fileContent);

    return [uri.fsPath, fileContent];
}

async function processFolderRecursively(uri: vscode.Uri): Promise<Map<string, String>> {
    let myMap: Map<string, String> = new Map();
    
    async function processFolder(folderUri: vscode.Uri): Promise<void> {
      const files = await vscode.workspace.fs.readDirectory(folderUri);
  
      for (const [name, fileType] of files) {
        const fileUri = vscode.Uri.joinPath(folderUri, name);
        if (name.startsWith('.')) {
            continue; 
        }
        if (fileType === vscode.FileType.Unknown) {
            continue;
        }
        if (fileType === vscode.FileType.Directory) {
            try {
                await processFolder(fileUri);
            } catch (error) {
                console.log(error)
            }
        } else {
          const fileContent = await processFile(fileUri);
          myMap.set(fileContent[0], fileContent[1]);
        //   folderContent += `=====${name}=====\n${fileContent}\n\n`;
        }
      }
    }

    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.type === vscode.FileType.File) { 
        const fileName = path.basename(uri.fsPath);
        const fileContent = await processFile(uri);
        myMap.set(fileContent[0], fileContent[1]);
        // folderContent += `=====${fileName}=====\n${fileContent}\n\n`;
    } else {
        await processFolder(uri);
    }
    
    return myMap;
}

class MyTreeItem {
    constructor(public label: string, public children?: MyTreeItem[]) {}
}

class MyTreeDataProvider implements vscode.TreeDataProvider<MyTreeItem> {
    getTreeItem(element: MyTreeItem): vscode.TreeItem {
        return new vscode.TreeItem(element.label);
    }

    getChildren(element?: MyTreeItem): MyTreeItem[] | Thenable<MyTreeItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        let data = retrieveData(workspaceFolder);
        let groups = data.groups;
        console.log(groups);
        if (!element) {
            const groupNodes: MyTreeItem[] = [];
            const childNodes: MyTreeItem[] = [];
            for (let key of Object.keys(groups)) {
                console.log(key);
                const value = groups[key].files;
                value.forEach((v: string) => {
                    console.log(v)
                    childNodes.push(new MyTreeItem(v));
                })
                groupNodes.push(new MyTreeItem(key, childNodes));
            }
            // Return the root nodes
            return groupNodes;
        }

        // Return children of the provided element
        return element.children || [];
    }
}

function loadTree() {
    
}

export function activate(context: vscode.ExtensionContext) {
    const treeDataProvider = new MyTreeDataProvider();
    const treeView = vscode.window.createTreeView('myTreeView', {
        treeDataProvider
    });
    vscode.window.registerTreeDataProvider('myTreeView', treeDataProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.copyFilesContent', async (resourceUris) => {
            if (!Array.isArray(resourceUris[1]) || resourceUris[1].length === 0) {
                vscode.window.showErrorMessage("No files selected.");
                return;
            }

            let copiedContent = "";
            const separator = "=====";

            for (const uri of resourceUris[1]) {
                try {
                    for (const [key, value] of (await processFolderRecursively(uri)).entries()) {
                        copiedContent += `=====${key}=====\n${value}\n\n`;
                    }
                    // const folderContent = await processFolderRecursively(uri);
                    // copiedContent += folderContent;
                } catch (error) {
                    console.log(error)
                }
            }

            await vscode.env.clipboard.writeText(copiedContent);
            vscode.window.showInformationMessage("Content copied to clipboard!");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.copyFilesContentBook', async ([inputText, ...resourceUris]) => {
            console.log("testing book ", inputText)
            console.log("testing book ", resourceUris)
            if (!Array.isArray(resourceUris[1]) || resourceUris[1].length === 0) {
                vscode.window.showErrorMessage("No files selected.");
                return;
            }

            let copiedContent = "";
            const separator = "=====";
            let files: String[] = [];
            for (const uri of resourceUris[1]) {
                try {
                    for (const [key, value] of (await processFolderRecursively(uri)).entries()) {
                        copiedContent += `=====${key}=====\n${value}\n\n`;
                        files = [...files, key];
                    }
                    // const folderContent = await processFolderRecursively(uri);
                    // copiedContent += folderContent;
                } catch (error) {
                    console.log(error)
                }
            }
            copiedContent = inputText;

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            let data = retrieveData(workspaceFolder);
            data.groups = {
                ...data.groups,
                [inputText]: {
                    "files": files
                }
            };
            console.log(data, files);
            saveData(data, workspaceFolder);
            loadTree();
            await vscode.env.clipboard.writeText(copiedContent);
            vscode.window.showInformationMessage("Content copied to clipboard!");
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.openContextMenu', (...resourceUris) => {
            console.log("test1", resourceUris)
            vscode.commands.executeCommand('extension.copyFilesContent', resourceUris);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.openContextMenuBook', (...resourceUris) => {
            vscode.window.showInputBox({
                prompt: 'Enter some text',
                placeHolder: 'Text input',
                value: '', // Default value if any
            }).then((inputText) => {
                console.log("test2", resourceUris)
                vscode.commands.executeCommand('extension.copyFilesContentBook', [inputText, ...resourceUris]);
            })
        })
    );
}

export function deactivate() {}
