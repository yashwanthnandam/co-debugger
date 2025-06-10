import * as vscode from 'vscode';
import { ContextCollector, ContextData, Variable } from '../services/contextCollector';
import { LLMService } from '../services/llmService';

export interface ContextSelection {
    functionCalls: { includeRuntime: boolean; includeCallStack: boolean; };
    variables: { 
        includeAll: boolean; 
        showApplicationOnly: boolean; 
        enableDeepExpansion: boolean; 
        showAsJSON: boolean;
        expansionDepth: number;
    };
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
            variables: { 
                includeAll: false, 
                showApplicationOnly: true, 
                enableDeepExpansion: true, 
                showAsJSON: false,
                expansionDepth: 6
            },
            display: { showMetadata: true, showMemoryUsage: true }
        };

        this.setupEventListeners();
    }

    private setupEventListeners() {
        this.contextCollector.on('contextUpdated', () => {
            console.log(`📊 Context updated at 2025-06-10 02:21:46`);
            this.updatePreview();
        });
    }

    show(): void {
        if (!this.view) {
            this.view = vscode.window.createWebviewPanel(
                'contextSelector.view',
                `Go Debug Context`,
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
**User**:  | **Time**: 2025-06-10 02:21:46
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
- Expansion Depth: ${this.currentSelection.variables.expansionDepth}

**Session**: ${context.debugInfo.sessionId}
**Errors**: ${context.debugInfo.errors.length > 0 ? context.debugInfo.errors.join(', ') : 'None'}
`);

        if (!context.debugInfo.isStopped) {
            sections.push(`## ⚠️ Set Breakpoint to Analyze
1. **Set breakpoint** in your Go code
2. **Trigger execution** to hit the breakpoint  
3. **Enhanced context** will be automatically collected with full variable expansion to depth ${this.currentSelection.variables.expansionDepth}
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

        // Enhanced Variables with Full JSON Expansion
        if (context.variables.length > 0) {
            const vars = this.currentSelection.variables.showApplicationOnly ? 
                this.contextCollector.getApplicationVariables() : context.variables;
            
            sections.push(`## 📊 Variables (${vars.length} total) - Depth ${this.currentSelection.variables.expansionDepth}\n`);
            vars.slice(0, 8).forEach(variable => {
                sections.push(this.formatEnhancedVariableWithFullJSON(variable));
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

    private formatEnhancedVariableWithFullJSON(variable: Variable): string {
        const badges = [];
        if (variable.isApplicationRelevant) badges.push('📊');
        if (variable.isControlFlow) badges.push('⚡');
        if (variable.metadata.isExpandable) badges.push('📁');
        if (variable.metadata.isPointer) badges.push('→');
        if (variable.metadata.expansionDepth) badges.push(`D${variable.metadata.expansionDepth}`);
        
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
        
        // Get the full expanded JSON structure
        const fullJSON = this.getFullExpandedJSON(variable);
        
        if (this.currentSelection.variables.showAsJSON && fullJSON) {
            return `#### ${variable.name} ${badges.join('')}
**Type**: ${variable.type} | **Scope**: ${variable.scope}${metadataStr}

**Full JSON Structure** (Depth ${this.currentSelection.variables.expansionDepth}):
\`\`\`json
${fullJSON}
\`\`\`

`;
        } else {
            // Show truncated summary with option to expand
            let value = variable.value;
            if (value.length > 120 && !this.currentSelection.variables.showAsJSON) {
                value = value.substring(0, 120) + '... [Click "Show as JSON" to see full structure]';
            }
            
            return `#### ${variable.name} ${badges.join('')}
**Type**: ${variable.type} | **Scope**: ${variable.scope}${metadataStr}
**Value**: \`${value}\`

`;
        }
    }

    private getFullExpandedJSON(variable: Variable): string | null {
        // Try to get the expanded variable data
        const expandedVariables = this.contextCollector.getExpandedVariables();
        const expandedResult = expandedVariables.get(variable.name);
        
        if (expandedResult && expandedResult.success && expandedResult.data) {
            return this.convertSimplifiedValueToJSON(expandedResult.data, 0, this.currentSelection.variables.expansionDepth);
        }
        
        // Fallback: try to parse rawValue as JSON
        if (variable.metadata.rawValue) {
            try {
                const parsed = JSON.parse(variable.metadata.rawValue);
                return JSON.stringify(parsed, null, 2);
            } catch {
                // If not valid JSON, try to create structured representation
                return this.createStructuredJSON(variable.metadata.rawValue);
            }
        }
        
        return null;
    }

    private convertSimplifiedValueToJSON(simplified: any, currentDepth: number, maxDepth: number): string {
        if (currentDepth >= maxDepth) {
            return '"[Max depth reached]"';
        }

        if (typeof simplified === 'string') {
            return JSON.stringify(simplified);
        }

        if (!simplified || typeof simplified !== 'object') {
            return JSON.stringify(simplified);
        }

        // Handle SimplifiedValue objects
        if (simplified.children && typeof simplified.children === 'object') {
            const jsonObj: any = {};
            
            Object.entries(simplified.children).forEach(([key, value]: [string, any]) => {
                try {
                    if (value && typeof value === 'object' && value.displayValue !== undefined) {
                        // This is a SimplifiedValue
                        if (value.children && Object.keys(value.children).length > 0) {
                            jsonObj[key] = JSON.parse(this.convertSimplifiedValueToJSON(value, currentDepth + 1, maxDepth));
                        } else {
                            // Parse the actual display value
                            const parsedValue = this.parseDisplayValue(value.displayValue, value.originalType);
                            jsonObj[key] = parsedValue;
                        }
                    } else {
                        jsonObj[key] = this.parseDisplayValue(String(value), 'unknown');
                    }
                } catch (error) {
                    // Show the raw value instead of just stringifying
                    jsonObj[key] = value?.displayValue || String(value);
                }
            });
            
            return JSON.stringify(jsonObj, null, 2);
        }

        // Handle direct object
        if (simplified.displayValue && !simplified.children) {
            const parsedValue = this.parseDisplayValue(simplified.displayValue, simplified.originalType || 'unknown');
            return JSON.stringify(parsedValue);
        }

        return JSON.stringify(simplified, null, 2);
    }

    private parseDisplayValue(displayValue: string, type: string): any {
        if (!displayValue || displayValue === 'nil' || displayValue === '<nil>') {
            return null;
        }

        // Handle unexpanded Go type references
        if (displayValue.match(/^<[^>]+>$/)) {
            // This is an unexpanded type reference - try to get more info
            const typeMatch = displayValue.match(/^<([^>]+)>$/);
            if (typeMatch) {
                const typeName = typeMatch[1];
                return `[${typeName.split('.').pop()}]`; // Show just the struct name
            }
        }

        // Remove Go type annotations: <Type>(value) -> value
        let cleanValue = displayValue;
        if (cleanValue.match(/^<[^>]+>\([^)]*\)$/)) {
            const match = cleanValue.match(/^<[^>]+>\(([^)]*)\)$/);
            if (match && match[1]) {
                cleanValue = match[1];
            } else {
                return `[${type}]`;
            }
        }

        // Handle complex Go debug strings with embedded values
        if (cleanValue.includes('<') && cleanValue.includes('>')) {
            // Extract any quoted strings or numbers from complex debug output
            const quotedMatch = cleanValue.match(/"([^"]*)"/g);
            if (quotedMatch && quotedMatch.length === 1) {
                return quotedMatch[0].slice(1, -1); // Remove quotes
            }
            
            const numberMatch = cleanValue.match(/\b(\d+(?:\.\d+)?)\b/);
            if (numberMatch) {
                const num = parseFloat(numberMatch[1]);
                return Number.isInteger(num) ? parseInt(numberMatch[1]) : num;
            }
            
            // Return cleaned type info
            return cleanValue.replace(/<[^>]*>/g, '').trim() || `[${type.split('.').pop()}]`;
        }

        // Handle quoted strings
        if (cleanValue.startsWith('"') && cleanValue.endsWith('"')) {
            return cleanValue.slice(1, -1);
        }

        // Handle booleans
        if (cleanValue === 'true' || cleanValue === 'false') {
            return cleanValue === 'true';
        }

        // Handle numbers
        if (/^\d+$/.test(cleanValue)) {
            return parseInt(cleanValue);
        }

        if (/^\d+\.\d+$/.test(cleanValue)) {
            return parseFloat(cleanValue);
        }

        // Handle memory addresses: 0xABCDEF -> "[Pointer]"
        if (/^0x[0-9a-fA-F]+$/.test(cleanValue)) {
            return `[Pointer: ${cleanValue}]`;
        }

        // Handle empty parentheses: () -> null
        if (cleanValue === '()' || cleanValue === '') {
            return null;
        }

        // Handle Go slice/array format: (length: X, cap: Y)
        if (cleanValue.includes('length:') || cleanValue.includes('cap:')) {
            const lengthMatch = cleanValue.match(/length:\s*(\d+)/);
            const capMatch = cleanValue.match(/cap:\s*(\d+)/);
            return {
                length: lengthMatch ? parseInt(lengthMatch[1]) : 0,
                capacity: capMatch ? parseInt(capMatch[1]) : 0
            };
        }

        // Handle nil with type info
        if (cleanValue.includes('nil <') && cleanValue.includes('>')) {
            return null;
        }

        // Extract actual values from Go debug format
        if (cleanValue.includes('"')) {
            const stringMatch = cleanValue.match(/"([^"]*)"/);
            if (stringMatch) {
                return stringMatch[1];
            }
        }

        // Pattern: number values
        const numberMatch = cleanValue.match(/\b(\d+(?:\.\d+)?)\b/);
        if (numberMatch) {
            const num = parseFloat(numberMatch[1]);
            return Number.isInteger(num) ? parseInt(numberMatch[1]) : num;
        }

        // Handle arrays
        if (cleanValue.startsWith('[') && cleanValue.endsWith(']')) {
            try {
                return JSON.parse(cleanValue);
            } catch {
                return cleanValue;
            }
        }

        // Handle objects
        if (cleanValue.startsWith('{') && cleanValue.endsWith('}')) {
            try {
                return JSON.parse(cleanValue);
            } catch {
                return cleanValue;
            }
        }

        // Return the raw value if we can't parse it
        return cleanValue || `[${type.split('.').pop()}]`;
    }

    private createStructuredJSON(rawValue: string): string {
        // Try to extract structured data from Go debug format
        try {
            // Handle Go struct format: {field1: value1, field2: value2}
            if (rawValue.includes(':') && (rawValue.includes('{') || rawValue.includes(','))) {
                const cleanValue = rawValue.replace(/^[^{]*{/, '{').replace(/}[^}]*$/, '}');
                
                // Simple parser for Go struct format
                const obj: any = {};
                const content = cleanValue.slice(1, -1); // Remove outer braces
                
                let current = '';
                let depth = 0;
                let inQuotes = false;
                let isKey = true;
                let currentKey = '';
                
                for (let i = 0; i < content.length; i++) {
                    const char = content[i];
                    
                    if (char === '"' && content[i-1] !== '\\') {
                        inQuotes = !inQuotes;
                    }
                    
                    if (!inQuotes) {
                        if (char === '{' || char === '[') depth++;
                        if (char === '}' || char === ']') depth--;
                        
                        if (char === ':' && depth === 0 && isKey) {
                            currentKey = current.trim();
                            current = '';
                            isKey = false;
                            continue;
                        }
                        
                        if (char === ',' && depth === 0) {
                            if (currentKey) {
                                obj[currentKey] = this.parseDisplayValue(current.trim(), 'unknown');
                            }
                            current = '';
                            currentKey = '';
                            isKey = true;
                            continue;
                        }
                    }
                    
                    current += char;
                }
                
                // Handle last field
                if (currentKey && current.trim()) {
                    obj[currentKey] = this.parseDisplayValue(current.trim(), 'unknown');
                }
                
                return JSON.stringify(obj, null, 2);
            }
            
            return JSON.stringify({ value: rawValue }, null, 2);
        } catch (error) {
            return JSON.stringify({ error: 'Could not parse structure', rawValue: rawValue.substring(0, 200) }, null, 2);
        }
    }

    private async handleMessage(message: any): Promise<void> {
        switch (message.command) {
            case 'updateSelection':
                this.currentSelection = message.selection;
                this.updatePreview();
                break;

            case 'refreshContext':
                console.log(`🔄 Manual refresh with depth ${this.currentSelection.variables.expansionDepth} at 2025-06-10 02:21:46`);
                try {
                    // Update the context collector with new depth
                    this.contextCollector.updateVariableConfig({
                        maxExpansionDepth: this.currentSelection.variables.expansionDepth
                    });
                    
                    await this.contextCollector.refreshAll();
                    this.updateContent();
                    vscode.window.showInformationMessage(`✅ Context refreshed with depth ${this.currentSelection.variables.expansionDepth}`);
                } catch (error) {
                    vscode.window.showErrorMessage(`❌ Refresh failed: ${error.message}`);
                }
                break;

            case 'changeDepth':
                await this.handleDepthChange(message.depth);
                break;

            case 'expandVariable':
                await this.handleVariableExpansion(message.variableName, this.currentSelection.variables.expansionDepth);
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

    private async handleDepthChange(newDepth: number): Promise<void> {
        console.log(`🔍 Changing expansion depth from ${this.currentSelection.variables.expansionDepth} to ${newDepth} at 2025-06-10 02:21:46`);
        
        this.currentSelection.variables.expansionDepth = newDepth;
        
        // Update the context collector configuration
        this.contextCollector.updateVariableConfig({
            maxExpansionDepth: newDepth
        });

        try {
            // Show progress message
            vscode.window.showInformationMessage(`🔄 Expanding variables to depth ${newDepth}...`);
            
            // Refresh with new depth
            await this.contextCollector.refreshAll();
            this.updateContent();
            
            vscode.window.showInformationMessage(`✅ Variables expanded to depth ${newDepth}`);
        } catch (error) {
            vscode.window.showErrorMessage(`❌ Depth change failed: ${error.message}`);
        }
    }

    private async handleVariableExpansion(variableName: string, depth: number): Promise<void> {
        try {
            const expanded = await this.contextCollector.expandSpecificVariable(variableName, depth);
            if (expanded) {
                const fullJSON = this.convertSimplifiedValueToJSON(expanded, 0, depth);
                
                const doc = await vscode.workspace.openTextDocument({
                    content: `# Variable Expansion: ${variableName}
**Expanded at**: 2025-06-10 02:21:46
**User**: 
**Depth**: ${depth}
**Type**: ${expanded.originalType}

## Full JSON Structure
\`\`\`json
${fullJSON}
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
            
            // Build enhanced context with FULL JSON structures
            let enhancedContext = `
USER: 
CURRENT_TIME: 2025-06-10 02:21:46
SESSION_ID: ${context.debugInfo.sessionId}

ENHANCED_CONTEXT_METRICS:
- Collection Time: ${context.debugInfo.performance.collectionTime}ms
- Variable Expansion Time: ${context.debugInfo.performance.variableExpansionTime || 0}ms
- Memory Usage: ${context.debugInfo.performance.memoryUsage}
- Expanded Variables: ${context.debugInfo.performance.expandedVariablesCount}
- Complex Structures: ${context.debugInfo.performance.complexStructuresFound}
- Expansion Depth: ${this.currentSelection.variables.expansionDepth}

CURRENT_LOCATION: ${context.currentLocation?.function || 'Unknown'}
THREAD_FRAME: ${context.debugInfo.currentThreadId}/${context.debugInfo.currentFrameId}

FULL_VARIABLE_DATA (Depth ${this.currentSelection.variables.expansionDepth}):
`;

            // Add full JSON for each expanded variable
            const expandedVariables = this.contextCollector.getExpandedVariables();
            const appVariables = this.contextCollector.getApplicationVariables().slice(0, 5); // Limit for token usage
            
            appVariables.forEach(variable => {
                const fullJSON = this.getFullExpandedJSON(variable);
                if (fullJSON) {
                    enhancedContext += `
## ${variable.name} (${variable.type})
\`\`\`json
${fullJSON}
\`\`\`
`;
                } else {
                    enhancedContext += `
## ${variable.name} (${variable.type})
${variable.value}
`;
                }
            });

            enhancedContext += `
DEBUG_CONTEXT:
${contextText}`;

            const response = await this.llmService.callLLM(enhancedContext, query, {
                provider: 'openai',
                model: 'gpt-4',
                temperature: 0.3,
                maxTokens: 4000
            });

            const doc = await vscode.workspace.openTextDocument({
                content: `# AI Debug Analysis - Full JSON Context (Depth ${this.currentSelection.variables.expansionDepth})
**Generated**: 2025-06-10 02:21:46
**User**: 
**Query**: ${query}

## Enhanced Context Summary
**Location**: ${context.currentLocation?.function || 'Unknown'}
**Variables**: ${context.variables.length} (${context.debugInfo.performance.expandedVariablesCount} expanded)
**Memory Usage**: ${context.debugInfo.performance.memoryUsage}
**Expansion Time**: ${context.debugInfo.performance.variableExpansionTime || 0}ms
**Expansion Depth**: ${this.currentSelection.variables.expansionDepth}

## AI Analysis
${response}

---
*Enhanced Go Debug Context Analyzer with Full JSON Expansion*
*Session: ${context.debugInfo.sessionId}*
*Generated: 2025-06-10 02:21:46*`,
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
**Generated**: 2025-06-10 02:21:46
**User**: 
**Session**: ${context.debugInfo.sessionId}

## Enhanced Performance Metrics
- **Collection Time**: ${context.debugInfo.performance.collectionTime}ms
- **Variable Expansion Time**: ${context.debugInfo.performance.variableExpansionTime || 0}ms
- **Memory Usage**: ${context.debugInfo.performance.memoryUsage}
- **Variables**: ${context.variables.length} (${context.debugInfo.performance.expandedVariablesCount} expanded)
- **Complex Structures**: ${context.debugInfo.performance.complexStructuresFound}
- **Expansion Depth**: ${this.currentSelection.variables.expansionDepth}

${selectedContext}

---
*Enhanced Go Debug Context Analyzer*
*Deep Variable Expansion & Analysis*
*Generated: 2025-06-10 02:21:46*`;
        
        vscode.workspace.openTextDocument({
            content: exportContent,
            language: 'markdown'
        }).then(doc => {
            vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        });
    }

    private estimateExpansionTime(depth: number): number {
        // Rough estimation based on depth
        const baseTime = 100;
        return Math.round(baseTime * Math.pow(1.8, depth - 1));
    }

    private generateHtml(context: ContextData): string {
        const statusIcon = context.debugInfo.isStopped ? '🛑' : '▶️';
        const statusText = context.debugInfo.isStopped ? 'Stopped' : 'Running';
        const config = this.contextCollector.getVariableConfig();
        const currentDepth = this.currentSelection.variables.expansionDepth;
        
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
        .btn.depth { background-color: var(--vscode-list-activeSelectionBackground); padding: 4px 8px; margin: 2px; font-size: 0.8em; }
        .btn.depth.active { background-color: var(--vscode-textLink-foreground); color: white; }
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
        .depth-controls { background: var(--vscode-list-hoverBackground); padding: 10px; border-radius: 4px; margin-bottom: 10px; }
        .depth-slider-container { margin: 10px 0; }
        .depth-slider { width: 100%; margin: 5px 0; }
        .depth-buttons { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
        .depth-display { font-size: 1.1em; font-weight: bold; color: var(--vscode-textLink-foreground); text-align: center; margin: 5px 0; }
        .json-controls { background: var(--vscode-list-hoverBackground); padding: 8px; border-radius: 4px; margin-bottom: 10px; }
        .performance-info { font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-top: 8px; }
        @media (max-width: 1000px) { .container { grid-template-columns: 1fr; height: auto; } }
    </style>
</head>
<body>
    <div class="header">
        <div class="status">${statusIcon} ${statusText} | Full JSON Context | 2025-06-10 02:21:46</div>
        
        <div class="metrics">
            <div class="metric"><div class="metric-value">${context.variables.length}</div><div>Variables</div></div>
            <div class="metric"><div class="metric-value">${context.debugInfo.performance.expandedVariablesCount}</div><div>Expanded</div></div>
            <div class="metric"><div class="metric-value">${context.debugInfo.performance.memoryUsage}</div><div>Memory</div></div>
            <div class="metric"><div class="metric-value">${context.debugInfo.performance.collectionTime}ms</div><div>Collection</div></div>
            <div class="metric"><div class="metric-value">${context.debugInfo.performance.variableExpansionTime || 0}ms</div><div>Expansion</div></div>
            <div class="metric"><div class="metric-value">D${currentDepth}</div><div>Depth</div></div>
        </div>
        
        <div><strong>Location</strong>: ${context.currentLocation ? 
            `${context.currentLocation.function.split('.').pop()} (${context.currentLocation.file.split('/').pop()}:${context.currentLocation.line})` : 
            'None'}</div>
        <div><strong>Thread/Frame</strong>: ${context.debugInfo.currentThreadId}/${context.debugInfo.currentFrameId}</div>
        <div><strong>User</strong>: </div>
        
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
                Deep Expansion (Current: Depth ${currentDepth})</label>
                <label><input type="checkbox" id="showMemoryUsage" checked onchange="updateSelection()">Show Memory Usage</label>
            </div>

            <div class="depth-controls">
                <h4>📏 Expansion Depth Control</h4>
                <div class="depth-display">Current Depth: ${currentDepth}</div>
                
                <div class="depth-slider-container">
                    <input type="range" id="depthSlider" class="depth-slider" 
                           min="1" max="10" value="${currentDepth}" 
                           onchange="changeDepthSlider(this.value)"
                           oninput="updateDepthDisplay(this.value)">
                    <div style="display: flex; justify-content: space-between; font-size: 0.8em; color: var(--vscode-descriptionForeground);">
                        <span>1 (Fast)</span>
                        <span>5 (Balanced)</span>
                        <span>10 (Deep)</span>
                    </div>
                </div>
                
                <div class="depth-buttons">
                    ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(d => 
                        `<button class="btn depth ${d === currentDepth ? 'active' : ''}" onclick="changeDepth(${d})">${d}</button>`
                    ).join('')}
                </div>
                
                <div class="performance-info">
                    <strong>Performance Guide:</strong><br>
                    • Depth 1-3: Fast (< 500ms)<br>
                    • Depth 4-6: Balanced (500-2000ms)<br>
                    • Depth 7-10: Deep (2000ms+)<br>
                    Current: ~${this.estimateExpansionTime(currentDepth)}ms
                </div>
            </div>

            <div class="json-controls">
                <h4>📄 JSON Display Options</h4>
                <label><input type="checkbox" id="showAsJSON" onchange="updateSelection()">Show Full JSON Structure</label>
                <div style="font-size: 0.8em; color: var(--vscode-descriptionForeground); margin-top: 5px;">
                    ⚠️ Large JSON structures may impact performance at depth ${currentDepth}+
                </div>
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
                <h3>💬 AI Debug Assistant (Depth ${currentDepth})</h3>
                <textarea id="queryInput" class="query-textarea" 
                    placeholder="Ask AI about your full JSON debug context (expanded to depth ${currentDepth})...

Examples:
• What's wrong with the current execution?
• Analyze the airline booking data structure at depth ${currentDepth}
• Explain the pricing information
• What are the segment details?
• Why is this function being called?
• Compare the performance at different depths"></textarea>
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="btn primary" onclick="callLLM()">🤖 Ask AI</button>
                    <button class="btn" onclick="clearQuery()">🗑️ Clear</button>
                </div>
                <div style="margin-top: 10px; font-size: 0.8em; color: var(--vscode-descriptionForeground);">
                    💡 <strong>Full JSON Context (D${currentDepth})</strong>: Complete variable expansion, memory tracking, performance metrics
                </div>
            </div>
        </div>
        
        <div class="panel">
            <h2>👀 Enhanced Context Preview (Depth ${currentDepth})</h2>
            <div id="previewContent" class="preview">
                ${context.debugInfo.isStopped ? 'Select options to see enhanced context...' : 'Set breakpoint to see context...'}
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentDepth = ${currentDepth};

        function updateSelection() {
            const selection = {
                functionCalls: { includeRuntime: document.getElementById('includeRuntime').checked },
                variables: { 
                    includeAll: document.getElementById('includeAllVars').checked,
                    showApplicationOnly: document.getElementById('showApplicationOnly').checked,
                    enableDeepExpansion: document.getElementById('enableDeepExpansion').checked,
                    showAsJSON: document.getElementById('showAsJSON').checked,
                    expansionDepth: currentDepth
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

        function changeDepth(depth) {
            console.log('🔍 2025-06-10 02:21:46 - Changing depth to:', depth);
            currentDepth = depth;
            document.getElementById('depthSlider').value = depth;
            updateDepthButtons();
            updateDepthDisplay(depth);
            vscode.postMessage({ command: 'changeDepth', depth: depth });
        }

        function changeDepthSlider(depth) {
            changeDepth(parseInt(depth));
        }

        function updateDepthDisplay(depth) {
            const displays = document.querySelectorAll('.depth-display');
            displays.forEach(display => {
                display.textContent = 'Current Depth: ' + depth;
            });
            
            // Update all depth references in UI
            document.title = 'Enhanced Go Debug Context - Depth ' + depth;
        }

        function updateDepthButtons() {
            document.querySelectorAll('.btn.depth').forEach(btn => {
                btn.classList.remove('active');
                if (parseInt(btn.textContent) === currentDepth) {
                    btn.classList.add('active');
                }
            });
        }

        function refresh() { 
            console.log('🔄 2025-06-10 02:21:46 - Refreshing with depth:', currentDepth);
            vscode.postMessage({ command: 'refreshContext' }); 
        }
        
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

        // Initialize on load
        updateSelection();
        updateDepthButtons();
    </script>
</body>
</html>`;
    }
}