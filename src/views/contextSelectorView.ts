import * as vscode from 'vscode';
import { ContextCollector, ContextData, Variable } from '../services/contextCollector';
import { LLMService } from '../services/llmService';

export interface ContextSelection {
    functionCalls: { includeRuntime: boolean; includeCallStack: boolean; };
    variables: { includeAll: boolean; showApplicationOnly: boolean; enableDeepExpansion: boolean; };
    display: { showMetadata: boolean; showMemoryUsage: boolean; };
}

export class ContextSelectorView {
    private view: vscode.WebviewPanel | undefined;
    private contextCollector: ContextCollector;
    private llmService: LLMService;
    private currentSelection: ContextSelection;
    private delveClient?: { getCurrentThreadId: () => number | null; getCurrentFrameId: () => number | null };

    constructor(contextCollector: ContextCollector, llmService: LLMService, delveClient?: any) {
        this.contextCollector = contextCollector;
        this.llmService = llmService;
        this.delveClient = delveClient;
        
        this.currentSelection = {
            functionCalls: { includeRuntime: true, includeCallStack: true },
            variables: { includeAll: false, showApplicationOnly: true, enableDeepExpansion: true },
            display: { showMetadata: true, showMemoryUsage: true }
        };

        this.setupEventListeners();
    }

    private setupEventListeners() {
        this.contextCollector.on('contextUpdated', () => {
            console.log(`📊 Context updated at 2025-06-09 04:20:54`);
            this.updatePreview();
        });
    }

    show(): void {
        if (!this.view) {
            this.view = vscode.window.createWebviewPanel(
                'contextSelector.view',
                `Go Debug Context - yashwanthnandam`,
                vscode.ViewColumn.One,
                { enableScripts: true, retainContextWhenHidden: true }
            );

            this.view.onDidDispose(() => { this.view = undefined; });
            this.view.webview.onDidReceiveMessage(async (message) => {
                await this.handleMessage(message);
            });
        }

        this.updateContent();
        this.view.reveal();
    }

    refresh(): void {
        if (this.view) this.updateContent();
    }

    private updateContent(): void {
        if (!this.view) return;
        const context = this.contextCollector.getContext();
        this.view.webview.html = this.generateHtml(context);
    }

    private updatePreview(): void {
        if (!this.view) return;
        const selectedContext = this.buildSelectedContext();
        this.view.webview.postMessage({ command: 'updatePreview', context: selectedContext });
    }

    private buildSelectedContext(): string {
        const context = this.contextCollector.getContext();
        const sections: string[] = [];

        // Enhanced Debug Status
        sections.push(`## 🔧 Debug Status (Enhanced Context)
**User**: yashwanthnandam | **Time**: 2025-06-09 04:20:54
**Connected**: ${context.debugInfo.isConnected ? '✅' : '❌'}
**Stopped**: ${context.debugInfo.isStopped ? '✅ At breakpoint' : '❌ Running'}
**Thread**: ${context.debugInfo.currentThreadId || 'None'} | **Frame**: ${context.debugInfo.currentFrameId || 'None'}
**Location**: ${context.currentLocation ? 
    `${context.currentLocation.function.split('.').pop()} (${context.currentLocation.file.split('/').pop()}:${context.currentLocation.line})` : 
    'None'}

**Performance Metrics**:
- Collection: ${context.debugInfo.performance.collectionTime}ms
- Variable Expansion: ${context.debugInfo.performance.variableExpansionTime || 0}ms  
- Memory Usage: ${context.debugInfo.performance.memoryUsage}
- Variables: ${context.variables.length} (${context.debugInfo.performance.expandedVariablesCount} expanded)
- Complex Structures: ${context.debugInfo.performance.complexStructuresFound}

**Session**: ${context.debugInfo.sessionId}
**Errors**: ${context.debugInfo.errors.length > 0 ? context.debugInfo.errors.join(', ') : 'None'}
`);

        if (!context.debugInfo.isStopped) {
            sections.push(`## ⚠️ Set Breakpoint to Analyze
1. **Set breakpoint** in your Go code
2. **Trigger execution** to hit the breakpoint  
3. **Enhanced context** will be automatically collected with full variable expansion
`);
            return sections.join('\n');
        }

        // Enhanced Function Calls
        if (this.currentSelection.functionCalls.includeRuntime && context.functionCalls.length > 0) {
            sections.push('## 📞 Function Calls\n');
            context.functionCalls.slice(0, 5).forEach((call, index) => {
                const fileName = call.file.split('/').pop() || 'unknown';
                const funcName = call.name.split('.').pop() || call.name;
                sections.push(`${index + 1}. **${funcName}** (${fileName}:${call.line})`);
                
                if (Object.keys(call.parameters).length > 0) {
                    const paramStr = Object.entries(call.parameters).slice(0, 2)
                        .map(([k, v]) => `${k}: ${String(v).length > 40 ? String(v).substring(0, 40) + '...' : v}`)
                        .join(', ');
                    sections.push(`   {${paramStr}}`);
                }
                sections.push('');
            });
        }

        // Enhanced Variables with Expansion Info
        if (context.variables.length > 0) {
            const vars = this.currentSelection.variables.showApplicationOnly ? 
                this.contextCollector.getApplicationVariables() : context.variables;
            
            sections.push(`## 📊 Variables (${vars.length} total)\n`);
            vars.slice(0, 8).forEach(variable => {
                sections.push(this.formatEnhancedVariable(variable));
            });
        }

        // Enhanced Analysis Summary
        if (context.symbolicExecution || context.pathSensitivity) {
            sections.push('\n## 🧠 Analysis Summary\n');
            
            if (context.symbolicExecution) {
                const se = context.symbolicExecution;
                sections.push(`**Symbolic Execution**:`);
                sections.push(`- Path Probability: ${(se.currentPath.pathProbability * 100).toFixed(1)}%`);
                sections.push(`- Alternative Paths: ${se.alternativePaths.length}`);
                sections.push(`- Potential Issues: ${se.executionSummary.potentialIssues.length}`);
                sections.push('');
            }
            
            if (context.pathSensitivity) {
                const ps = context.pathSensitivity;
                sections.push(`**Path Sensitivity**:`);
                sections.push(`- Path Coverage: ${(ps.pathAnalysis.pathCoverage * 100).toFixed(1)}%`);
                sections.push(`- High-Sensitivity Variables: ${ps.sensitivityMetrics.highSensitivityVariables.length}`);
                sections.push(`- Critical Paths: ${ps.pathAnalysis.criticalPaths.length}`);
            }
        }

        return sections.join('\n');
    }

    private formatEnhancedVariable(variable: Variable): string {
        const badges = [];
        if (variable.isApplicationRelevant) badges.push('📊');
        if (variable.isControlFlow) badges.push('⚡');
        if (variable.metadata.isExpandable) badges.push('📁');
        if (variable.metadata.isPointer) badges.push('→');
        if (variable.metadata.expansionDepth) badges.push(`D${variable.metadata.expansionDepth}`);
        
        let value = variable.value;
        if (value.length > 120) {
            value = value.substring(0, 120) + '...';
        }
        
        const metadata = [];
        if (variable.metadata.memoryUsage && this.currentSelection.display.showMemoryUsage) {
            metadata.push(`Memory: ${variable.metadata.memoryUsage}`);
        }
        if (variable.metadata.objectKeyCount) {
            metadata.push(`${variable.metadata.objectKeyCount} fields`);
        }
        if (variable.metadata.arrayLength !== undefined) {
            metadata.push(`${variable.metadata.arrayLength} items`);
        }
        
        const metadataStr = metadata.length > 0 ? ` | ${metadata.join(' | ')}` : '';
        
        return `#### ${variable.name} ${badges.join('')}
**Type**: ${variable.type} | **Scope**: ${variable.scope}${metadataStr}
**Value**: \`${value}\`

`;
    }

    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'updateSelection':
                this.currentSelection = message.selection;
                this.updatePreview();
                break;

            case 'refreshContext':
                console.log(`🔄 Manual refresh at 2025-06-09 04:20:54`);
                try {
                    await this.contextCollector.refreshAll();
                    this.updateContent();
                    vscode.window.showInformationMessage('✅ Enhanced context refreshed');
                } catch (error) {
                    vscode.window.showErrorMessage(`❌ Refresh failed: ${error.message}`);
                }
                break;

            case 'expandVariable':
                await this.handleVariableExpansion(message.variableName, message.depth || 6);
                break;

            case 'toggleDeepExpansion':
                const config = this.contextCollector.getVariableConfig();
                this.contextCollector.updateVariableConfig({
                    enableDeepExpansion: !config.enableDeepExpansion
                });
                vscode.window.showInformationMessage(
                    `Deep expansion ${!config.enableDeepExpansion ? 'enabled' : 'disabled'}`
                );
                break;

            case 'callLLM':
                await this.handleLLMCall(message.query, message.context);
                break;

            case 'exportContext':
                this.exportContext();
                break;

            case 'showExpansionDetails':
                this.showExpansionDetails();
                break;
        }
    }

    private async handleVariableExpansion(variableName: string, depth: number): Promise<void> {
        try {
            const expanded = await this.contextCollector.expandSpecificVariable(variableName, depth);
            if (expanded) {
                const doc = await vscode.workspace.openTextDocument({
                    content: `# Variable Expansion: ${variableName}
**Expanded at**: 2025-06-09 04:20:54
**Depth**: ${depth}
**Type**: ${expanded.originalType}

## Structure
\`\`\`json
${JSON.stringify(expanded, null, 2)}
\`\`\`

## Display Value
${expanded.displayValue}

${expanded.children ? `## Children (${Object.keys(expanded.children).length})
${Object.entries(expanded.children).map(([key, value]) => 
    `**${key}**: ${value.displayValue}`
).join('\n')}` : ''}
`,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to expand ${variableName}: ${error.message}`);
        }
    }

    private showExpansionDetails(): void {
        const expansionSummary = this.contextCollector.getVariableExpansionSummary();
        vscode.workspace.openTextDocument({
            content: expansionSummary,
            language: 'markdown'
        }).then(doc => {
            vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        });
    }

    private async handleLLMCall(query: string, contextText: string): Promise<void> {
        try {
            const context = this.contextCollector.getContext();
            const enhancedContext = `
USER: yashwanthnandam
CURRENT_TIME: 2025-06-09 04:20:54
SESSION_ID: ${context.debugInfo.sessionId}

ENHANCED_CONTEXT_METRICS:
- Collection Time: ${context.debugInfo.performance.collectionTime}ms
- Variable Expansion Time: ${context.debugInfo.performance.variableExpansionTime || 0}ms
- Memory Usage: ${context.debugInfo.performance.memoryUsage}
- Expanded Variables: ${context.debugInfo.performance.expandedVariablesCount}
- Complex Structures: ${context.debugInfo.performance.complexStructuresFound}

CURRENT_LOCATION: ${context.currentLocation?.function || 'Unknown'}
THREAD_FRAME: ${context.debugInfo.currentThreadId}/${context.debugInfo.currentFrameId}

VARIABLE_SUMMARY:
${context.variables.slice(0, 8).map(v => 
    `- ${v.name} (${v.type}): ${v.value.substring(0, 100)}${v.value.length > 100 ? '...' : ''}`
).join('\n')}

DEBUG_CONTEXT:
${contextText}`;

            const response = await this.llmService.callLLM(enhancedContext, query, {
                provider: 'openai',
                model: 'gpt-4',
                temperature: 0.3,
                maxTokens: 4000
            });

            const doc = await vscode.workspace.openTextDocument({
                content: `# AI Debug Analysis - Enhanced Context
**Generated**: 2025-06-09 04:20:54
**User**: yashwanthnandam
**Query**: ${query}

## Enhanced Context Summary
**Location**: ${context.currentLocation?.function || 'Unknown'}
**Variables**: ${context.variables.length} (${context.debugInfo.performance.expandedVariablesCount} expanded)
**Memory Usage**: ${context.debugInfo.performance.memoryUsage}
**Expansion Time**: ${context.debugInfo.performance.variableExpansionTime || 0}ms

## AI Analysis
${response}

---
*Enhanced Go Debug Context Analyzer*
*Session: ${context.debugInfo.sessionId}*
*Generated: 2025-06-09 04:20:54*`,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        } catch (error) {
            vscode.window.showErrorMessage(`LLM call failed: ${error.message}`);
        }
    }

    exportContext(): void {
        const context = this.contextCollector.getContext();
        const selectedContext = this.buildSelectedContext();
        
        const exportContent = `# Enhanced Go Debug Context Export
**Generated**: 2025-06-09 04:20:54
**User**: yashwanthnandam
**Session**: ${context.debugInfo.sessionId}

## Enhanced Performance Metrics
- **Collection Time**: ${context.debugInfo.performance.collectionTime}ms
- **Variable Expansion Time**: ${context.debugInfo.performance.variableExpansionTime || 0}ms
- **Memory Usage**: ${context.debugInfo.performance.memoryUsage}
- **Variables**: ${context.variables.length} (${context.debugInfo.performance.expandedVariablesCount} expanded)
- **Complex Structures**: ${context.debugInfo.performance.complexStructuresFound}

${selectedContext}

---
*Enhanced Go Debug Context Analyzer*
*Deep Variable Expansion & Analysis*
*Generated: 2025-06-09 04:20:54*`;
        
        vscode.workspace.openTextDocument({
            content: exportContent,
            language: 'markdown'
        }).then(doc => {
            vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        });
    }

    private generateHtml(context: ContextData): string {
        const statusIcon = context.debugInfo.isStopped ? '🛑' : '▶️';
        const statusText = context.debugInfo.isStopped ? 'Stopped' : 'Running';
        const config = this.contextCollector.getVariableConfig();
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Enhanced Go Debug Context</title>
    <style>
        body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 20px; margin: 0; }
        .header { background: var(--vscode-textCodeBlock-background); padding: 15px; margin-bottom: 20px; border-radius: 6px; }
        .status { font-size: 1.1em; font-weight: bold; margin-bottom: 10px; 
                 color: ${context.debugInfo.isStopped ? 'var(--vscode-gitDecoration-addedResourceForeground)' : 'var(--vscode-gitDecoration-modifiedResourceForeground)'}; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 10px 0; }
        .metric { background: var(--vscode-input-background); padding: 8px; border-radius: 4px; text-align: center; }
        .metric-value { font-size: 1.1em; font-weight: bold; color: var(--vscode-textLink-foreground); }
        .actions { display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap; }
        .btn { padding: 6px 14px; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); 
               border: none; border-radius: 3px; cursor: pointer; font-size: 0.9em; }
        .btn:hover { background-color: var(--vscode-button-hoverBackground); }
        .btn.primary { background-color: var(--vscode-textLink-foreground); color: white; }
        .container { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; height: calc(100vh - 200px); }
        .panel { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 15px; 
                 background-color: var(--vscode-sideBar-background); overflow-y: auto; }
        .section { margin-bottom: 20px; padding: 12px; border: 1px solid var(--vscode-panel-border); 
                   border-radius: 4px; background-color: var(--vscode-input-background); }
        .section h3 { margin-top: 0; color: var(--vscode-textLink-foreground); }
        .checkbox-group label { display: block; margin-bottom: 6px; cursor: pointer; }
        .query-section { margin-top: 20px; padding: 15px; border: 2px solid var(--vscode-textLink-foreground); border-radius: 6px; }
        .query-textarea { width: 100%; min-height: 70px; padding: 8px; border: 1px solid var(--vscode-input-border); 
                          border-radius: 3px; background-color: var(--vscode-input-background); 
                          color: var(--vscode-input-foreground); font-family: var(--vscode-font-family); resize: vertical; }
        .preview { font-family: var(--vscode-editor-font-family); font-size: 0.9em; line-height: 1.5; white-space: pre-wrap; 
                   background-color: var(--vscode-textCodeBlock-background); padding: 15px; border-radius: 4px; 
                   border: 1px solid var(--vscode-panel-border); overflow-x: auto; }
        .expansion-controls { background: var(--vscode-list-activeSelectionBackground); padding: 10px; border-radius: 4px; margin-bottom: 10px; }
        @media (max-width: 1000px) { .container { grid-template-columns: 1fr; height: auto; } }
    </style>
</head>
<body>
    <div class="header">
        <div class="status">${statusIcon} ${statusText} | Enhanced Context | 2025-06-09 04:20:54</div>
        
        <div class="metrics">
            <div class="metric"><div class="metric-value">${context.variables.length}</div><div>Variables</div></div>
            <div class="metric"><div class="metric-value">${context.debugInfo.performance.expandedVariablesCount}</div><div>Expanded</div></div>
            <div class="metric"><div class="metric-value">${context.debugInfo.performance.memoryUsage}</div><div>Memory</div></div>
            <div class="metric"><div class="metric-value">${context.debugInfo.performance.collectionTime}ms</div><div>Collection</div></div>
            <div class="metric"><div class="metric-value">${context.debugInfo.performance.variableExpansionTime || 0}ms</div><div>Expansion</div></div>
        </div>
        
        <div><strong>Location</strong>: ${context.currentLocation ? 
            `${context.currentLocation.function.split('.').pop()} (${context.currentLocation.file.split('/').pop()}:${context.currentLocation.line})` : 
            'None'}</div>
        <div><strong>Thread/Frame</strong>: ${context.debugInfo.currentThreadId}/${context.debugInfo.currentFrameId}</div>
        
        <div class="actions">
            <button class="btn primary" onclick="refresh()">🔄 Refresh</button>
            <button class="btn" onclick="toggleDeepExpansion()">
                ${config.enableDeepExpansion ? '🔍 Disable Deep' : '🔍 Enable Deep'}
            </button>
            <button class="btn" onclick="showExpansionDetails()">📊 Expansion Details</button>
            <button class="btn" onclick="exportContext()">📋 Export</button>
        </div>
    </div>
    
    <div class="container">
        <div class="panel">
            <h2>🎯 Enhanced Context Selector</h2>
            
            <div class="expansion-controls">
                <h4>🔍 Variable Expansion</h4>
                <label><input type="checkbox" id="enableDeepExpansion" ${config.enableDeepExpansion ? 'checked' : ''} onchange="updateExpansion()">
                Deep Expansion (Max Depth: ${config.maxExpansionDepth})</label>
                <label><input type="checkbox" id="showMemoryUsage" checked onchange="updateSelection()">Show Memory Usage</label>
            </div>
            
            <div class="section">
                <h3>📞 Function Calls</h3>
                <label><input type="checkbox" id="includeRuntime" checked onchange="updateSelection()">
                Runtime Calls (${context.functionCalls.length})</label>
            </div>
            
            <div class="section">
                <h3>🔍 Variables</h3>
                <label><input type="checkbox" id="showApplicationOnly" checked onchange="updateSelection()">
                Application Variables (${this.contextCollector.getApplicationVariables().length})</label>
                <label><input type="checkbox" id="includeAllVars" onchange="updateSelection()">
                All Variables (${context.variables.length})</label>
                <label><input type="checkbox" id="showMetadata" checked onchange="updateSelection()">Show Metadata</label>
            </div>
            
            <div class="query-section">
                <h3>💬 AI Debug Assistant</h3>
                <textarea id="queryInput" class="query-textarea" 
                    placeholder="Ask AI about your enhanced debug context...

Examples:
• What's wrong with the current execution?
• Explain these variable values
• Analyze the expanded data structures
• What are the memory usage patterns?
• Why is this function being called?"></textarea>
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="btn primary" onclick="callLLM()">🤖 Ask AI</button>
                    <button class="btn" onclick="clearQuery()">🗑️ Clear</button>
                </div>
                <div style="margin-top: 10px; font-size: 0.8em; color: var(--vscode-descriptionForeground);">
                    💡 <strong>Enhanced with</strong>: Deep variable expansion, memory tracking, performance metrics
                </div>
            </div>
        </div>
        
        <div class="panel">
            <h2>👀 Enhanced Context Preview</h2>
            <div id="previewContent" class="preview">
                ${context.debugInfo.isStopped ? 'Select options to see enhanced context...' : 'Set breakpoint to see context...'}
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function updateSelection() {
            const selection = {
                functionCalls: { includeRuntime: document.getElementById('includeRuntime').checked },
                variables: { 
                    includeAll: document.getElementById('includeAllVars').checked,
                    showApplicationOnly: document.getElementById('showApplicationOnly').checked,
                    enableDeepExpansion: document.getElementById('enableDeepExpansion').checked
                },
                display: { 
                    showMetadata: document.getElementById('showMetadata').checked,
                    showMemoryUsage: document.getElementById('showMemoryUsage').checked
                }
            };
            vscode.postMessage({ command: 'updateSelection', selection: selection });
        }

        function updateExpansion() {
            updateSelection();
        }

        function refresh() { vscode.postMessage({ command: 'refreshContext' }); }
        function toggleDeepExpansion() { vscode.postMessage({ command: 'toggleDeepExpansion' }); }
        function showExpansionDetails() { vscode.postMessage({ command: 'showExpansionDetails' }); }
        function exportContext() { vscode.postMessage({ command: 'exportContext' }); }
        function callLLM() {
            const query = document.getElementById('queryInput').value.trim();
            if (!query) { alert('Please enter a query first.'); return; }
            const context = document.getElementById('previewContent').textContent;
            vscode.postMessage({ command: 'callLLM', query: query, context: context });
        }
        function clearQuery() { document.getElementById('queryInput').value = ''; }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updatePreview') {
                document.getElementById('previewContent').textContent = message.context;
            }
        });

        updateSelection();
    </script>
</body>
</html>`;
    }
}