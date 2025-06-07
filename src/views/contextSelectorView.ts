import * as vscode from 'vscode';
import { ContextCollector, ContextData, Variable, FunctionCall } from '../services/contextCollector';
import { LLMService } from '../services/llmService';

export interface ContextSelection {
    functionCalls: {
        includeRuntime: boolean;
        includeStatic: boolean;
        includeCallStack: boolean;
        showHierarchy: boolean;
    };
    variables: {
        includeAll: boolean;
        includeControlFlow: boolean;
        includeHistory: boolean;
        selectedVariables: string[];
        searchQuery: string;
    };
    executionPaths: {
        includePaths: boolean;
        includeConditions: boolean;
    };
}

export class ContextSelectorView {
    private view: vscode.WebviewPanel | undefined;
    private contextCollector: ContextCollector;
    private llmService: LLMService;
    private currentSelection: ContextSelection;

    constructor(contextCollector: ContextCollector, llmService: LLMService) {
        this.contextCollector = contextCollector;
        this.llmService = llmService;
        
        this.currentSelection = {
            functionCalls: {
                includeRuntime: true,
                includeStatic: false,
                includeCallStack: true,
                showHierarchy: false
            },
            variables: {
                includeAll: true,
                includeControlFlow: true,
                includeHistory: false,
                selectedVariables: [],
                searchQuery: ''
            },
            executionPaths: {
                includePaths: false,
                includeConditions: false
            }
        };

        this.setupEventListeners();
    }

    private setupEventListeners() {
        this.contextCollector.on('contextUpdated', () => {
            console.log('📊 Context updated in view');
            this.updatePreview();
        });
    }

    show(): void {
        if (!this.view) {
            this.view = vscode.window.createWebviewPanel(
                'contextSelector.view',
                'Context Selector',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.view.onDidDispose(() => {
                this.view = undefined;
            });

            this.view.webview.onDidReceiveMessage(async (message) => {
                await this.handleMessage(message);
            });
        }

        this.updateContent();
        this.view.reveal();
    }

    refresh(): void {
        if (this.view) {
            this.updateContent();
        }
    }

    private updateContent(): void {
        if (!this.view) return;

        const context = this.contextCollector.getContext();
        this.view.webview.html = this.generateHtml(context);
    }

    private updatePreview(): void {
        if (!this.view) return;

        const selectedContext = this.buildSelectedContext();
        this.view.webview.postMessage({
            command: 'updatePreview',
            context: selectedContext
        });
    }

    private buildSelectedContext(): string {
        const context = this.contextCollector.getContext();
        const sections: string[] = [];

        // Debug status
        sections.push(`## 🔧 Debug Status
**Connected**: ${context.debugInfo.isConnected ? '✅' : '❌'}
**Stopped**: ${context.debugInfo.isStopped ? '✅ At breakpoint' : '❌ Program running'}
**Thread ID**: ${context.debugInfo.threadId || 'None'}
**Last Collection**: ${context.debugInfo.lastCollection ? new Date(context.debugInfo.lastCollection).toLocaleTimeString() : 'Never'}
**Current Location**: ${context.currentLocation ? 
    `${context.currentLocation.function} (${context.currentLocation.file.split('/').pop()}:${context.currentLocation.line})` : 
    'None'}
**Errors**: ${context.debugInfo.errors.length > 0 ? context.debugInfo.errors.join(', ') : 'None'}
`);

        if (!context.debugInfo.isStopped) {
            sections.push(`## ⚠️ Debugger Status

The debugger is currently running. To collect context:

1. **Set a breakpoint** in your Go code
2. **Trigger the code path** that hits the breakpoint
3. **Context will be automatically collected** when the breakpoint is hit

**Current status**: Program is executing, waiting for breakpoint...`);
            return sections.join('\n');
        }

        // Function Calls Section
        if (this.currentSelection.functionCalls.includeRuntime && context.functionCalls.length > 0) {
            sections.push('## 📞 Function Call Context\n');
            sections.push('### Runtime Function Calls\n');
            
            context.functionCalls.forEach(call => {
                const fileName = call.file.split('/').pop() || call.file;
                sections.push(`- **${call.name}** (${fileName}:${call.line})`);
                if (Object.keys(call.parameters).length > 0) {
                    sections.push(`  Parameters: ${JSON.stringify(call.parameters, null, 2)}`);
                }
            });

            if (this.currentSelection.functionCalls.includeCallStack) {
                sections.push('\n### Call Stack\n');
                context.functionCalls.forEach((call, index) => {
                    const fileName = call.file.split('/').pop() || call.file;
                    sections.push(`${index + 1}. ${call.name} (${fileName}:${call.line})`);
                });
            }
        }

        // Variables Section
        if (context.variables.length > 0) {
            sections.push('\n## 🔍 Variables Context\n');
            
            let variables = context.variables;
            
            if (!this.currentSelection.variables.includeAll) {
                variables = variables.filter(v => {
                    if (this.currentSelection.variables.includeControlFlow && v.isControlFlow) {
                        return true;
                    }
                    if (this.currentSelection.variables.selectedVariables.includes(v.name)) {
                        return true;
                    }
                    return false;
                });
            }

            variables.forEach(variable => {
                sections.push(`### ${variable.name} (${variable.type})`);
                sections.push(`**Value**: ${variable.value}`);
                sections.push(`**Scope**: ${variable.scope}`);
                
                if (variable.isControlFlow) {
                    sections.push(`**Control Flow**: ⚡ Yes`);
                }
                sections.push('');
            });
        }

        return sections.join('\n');
    }

   private async handleMessage(message: any): Promise<void> {
    switch (message.command) {
        case 'updateSelection':
            this.currentSelection = message.selection;
            this.updatePreview();
            break;

        case 'refreshContext':
            console.log('🔄 Manual refresh requested from UI');
            await this.contextCollector.refreshAll();
            this.updateContent();
            break;

        case 'forceCheckStopped':
            console.log('🔍 Force checking if stopped...');
            // Access the delveClient through contextCollector
            const delveClient = (this.contextCollector as any).delveClient;
            if (delveClient && delveClient.forceCheckStopped) {
                const isStopped = await delveClient.forceCheckStopped();
                vscode.window.showInformationMessage(
                    isStopped ? 'Debugger is stopped - context should be available' : 'Debugger is still running'
                );
                if (isStopped) {
                    await this.contextCollector.refreshAll();
                    this.updateContent();
                }
            }
            break;

        case 'testConnection':
            const context = this.contextCollector.getContext();
            const status = `Connection: ${context.debugInfo.isConnected ? 'Connected' : 'Disconnected'}\n` +
                          `Stopped: ${context.debugInfo.isStopped ? 'Yes' : 'No'}\n` +
                          `Functions: ${context.functionCalls.length}\n` +
                          `Variables: ${context.variables.length}`;
            vscode.window.showInformationMessage(status);
            break;

        case 'callLLM':
            await this.handleLLMCall(message.query, message.context);
            break;

        case 'exportContext':
            this.exportSelectedContext();
            break;
    }
}

    private async handleLLMCall(query: string, contextText: string): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('contextSelector.llm');
            const response = await this.llmService.callLLM(contextText, query, {
                provider: config.get('provider') || 'openai',
                model: config.get('model') || 'gpt-4',
                temperature: config.get('temperature') || 0.3,
                maxTokens: config.get('maxTokens') || 2000
            });

            const doc = await vscode.workspace.openTextDocument({
                content: `# AI Analysis\n\n**Query:** ${query}\n\n**Response:**\n\n${response}`,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);

        } catch (error) {
            vscode.window.showErrorMessage(`LLM call failed: ${error.message}`);
        }
    }

    exportSelectedContext(): void {
        const selectedContext = this.buildSelectedContext();
        
        vscode.workspace.openTextDocument({
            content: selectedContext,
            language: 'markdown'
        }).then(doc => {
            vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        });
    }

    private generateHtml(context: ContextData): string {
        const statusIcon = context.debugInfo.isStopped ? '🛑' : '▶️';
        const statusText = context.debugInfo.isStopped ? 'Stopped at breakpoint' : 'Running';
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Context Selector</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    padding: 20px;
                    margin: 0;
                    background-color: var(--vscode-editor-background);
                }
                
                .debug-panel {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 15px;
                    margin-bottom: 20px;
                    border-radius: 4px;
                    border: 1px solid var(--vscode-panel-border);
                }
                
                .status-indicator {
                    font-size: 1.1em;
                    font-weight: bold;
                    margin-bottom: 10px;
                }
                
                .status-running {
                    color: var(--vscode-gitDecoration-modifiedResourceForeground);
                }
                
                .status-stopped {
                    color: var(--vscode-gitDecoration-addedResourceForeground);
                }
                
                .debug-actions {
                    margin-top: 10px;
                }
                
                .debug-button {
                    padding: 6px 12px;
                    margin-right: 10px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 0.9em;
                }
                
                .debug-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    height: calc(100vh - 180px);
                }
                
                .selector-panel, .preview-panel {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 15px;
                    background-color: var(--vscode-sideBar-background);
                    overflow-y: auto;
                }
                
                .section {
                    margin-bottom: 25px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    padding: 15px;
                    background-color: var(--vscode-input-background);
                }
                
                .checkbox-group label {
                    display: block;
                    margin-bottom: 8px;
                }
            </style>
        </head>
        <body>
            <!-- Debug Status Panel -->
            <div class="debug-panel">
                <div class="status-indicator ${context.debugInfo.isStopped ? 'status-stopped' : 'status-running'}">
                    ${statusIcon} ${statusText}
                </div>
                <div>Connected: ${context.debugInfo.isConnected ? '✅' : '❌'} | 
                     Functions: ${context.functionCalls.length} | 
                     Variables: ${context.variables.length} | 
                     Thread: ${context.debugInfo.threadId || 'None'}</div>
                <div>Location: ${context.currentLocation ? 
                    `${context.currentLocation.function} (${context.currentLocation.file.split('/').pop()}:${context.currentLocation.line})` : 
                    'None'}</div>
                ${context.debugInfo.errors.length > 0 ? 
                    `<div style="color: var(--vscode-errorForeground); margin-top: 5px;">⚠️ ${context.debugInfo.errors.join(', ')}</div>` : ''}
                
                <div class="debug-actions">
                    <button class="debug-button" onclick="manualRefresh()">🔄 Force Refresh</button>
                    <button class="debug-button" onclick="testConnection()">🔗 Test Status</button>
                </div>
            </div>
            
            <div class="container">
                <div class="selector-panel">
                    <h2>🎯 Context Selector</h2>
                    
                    <!-- Function Call Context -->
                    <div class="section">
                        <h3>📞 Function Call Context</h3>
                        <div class="checkbox-group">
                            <label>
                                <input type="checkbox" id="includeRuntime" checked>
                                Include Runtime Function Calls (${context.functionCalls.length})
                            </label>
                            <label>
                                <input type="checkbox" id="includeCallStack" checked>
                                Include Call Stack
                            </label>
                            <label>
                                <input type="checkbox" id="showHierarchy">
                                Show Call Hierarchy
                            </label>
                        </div>
                    </div>
                    
                    <!-- Variables -->
                    <div class="section">
                        <h3>🔍 Variables</h3>
                        <div class="checkbox-group">
                            <label>
                                <input type="checkbox" id="includeAllVars" checked>
                                Include All Variables (${context.variables.length})
                            </label>
                            <label>
                                <input type="checkbox" id="includeControlFlow" checked>
                                Include Control Flow Variables
                            </label>
                        </div>
                    </div>
                    
                    <!-- Query Section -->
                    <div style="margin-top: 20px; padding: 15px; border: 2px solid var(--vscode-textLink-foreground); border-radius: 6px;">
                        <h3>💬 Your Query</h3>
                        <textarea 
                            id="queryInput" 
                            style="width: 100%; min-height: 80px; padding: 10px; border: 1px solid var(--vscode-input-border); border-radius: 3px; background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); font-family: var(--vscode-font-family); resize: vertical;"
                            placeholder="What would you like to know about the current execution?"
                        ></textarea>
                        <div style="display: flex; gap: 10px; margin-top: 15px;">
                            <button style="padding: 8px 16px; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 3px; cursor: pointer;" onclick="callLLM()">
                                🤖 Ask AI
                            </button>
                            <button style="padding: 8px 16px; background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 3px; cursor: pointer;" onclick="exportContext()">
                                📋 Copy Context
                            </button>
                        </div>
                    </div>
                </div>
                
                <div class="preview-panel">
                    <h2>👀 Context Preview</h2>
                    <div id="previewContent" style="font-family: var(--vscode-editor-font-family); font-size: 0.9em; line-height: 1.6; white-space: pre-wrap; background-color: var(--vscode-textCodeBlock-background); padding: 15px; border-radius: 4px; border: 1px solid var(--vscode-panel-border);">
                        ${context.debugInfo.isStopped ? 'Select context options to see preview...' : 'Set a breakpoint and trigger it to see context...'}
                    </div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                document.addEventListener('DOMContentLoaded', function() {
                    setupEventListeners();
                    updateSelection();
                });

                function setupEventListeners() {
                    document.getElementById('includeRuntime').addEventListener('change', updateSelection);
                    document.getElementById('includeCallStack').addEventListener('change', updateSelection);
                    document.getElementById('showHierarchy').addEventListener('change', updateSelection);
                    document.getElementById('includeAllVars').addEventListener('change', updateSelection);
                    document.getElementById('includeControlFlow').addEventListener('change', updateSelection);
                }

                function updateSelection() {
                    const selection = {
                        functionCalls: {
                            includeRuntime: document.getElementById('includeRuntime').checked,
                            includeStatic: false,
                            includeCallStack: document.getElementById('includeCallStack').checked,
                            showHierarchy: document.getElementById('showHierarchy').checked
                        },
                        variables: {
                            includeAll: document.getElementById('includeAllVars').checked,
                            includeControlFlow: document.getElementById('includeControlFlow').checked,
                            includeHistory: false,
                            selectedVariables: [],
                            searchQuery: ''
                        },
                        executionPaths: {
                            includePaths: false,
                            includeConditions: false
                        }
                    };

                    vscode.postMessage({
                        command: 'updateSelection',
                        selection: selection
                    });
                }

                function manualRefresh() {
                    vscode.postMessage({ command: 'refreshContext' });
                }

                function testConnection() {
                    vscode.postMessage({ command: 'testConnection' });
                }

                function callLLM() {
                    const query = document.getElementById('queryInput').value.trim();
                    if (!query) {
                        alert('Please enter a query first.');
                        return;
                    }

                    const previewContent = document.getElementById('previewContent').textContent;
                    vscode.postMessage({
                        command: 'callLLM',
                        query: query,
                        context: previewContent
                    });
                }

                function exportContext() {
                    vscode.postMessage({ command: 'exportContext' });
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.command) {
                        case 'updatePreview':
                            document.getElementById('previewContent').textContent = message.context;
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
    }
}