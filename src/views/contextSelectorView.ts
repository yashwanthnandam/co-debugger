import * as vscode from 'vscode';
import { ContextCollector, ContextData, Variable } from '../services/contextCollector';
import { LLMService } from '../services/llmService';
import * as os from 'os';

export interface ContextSelection {
    functionCalls: { includeRuntime: boolean; includeCallStack: boolean; };
    variables: { 
        includeAll: boolean; 
        showApplicationOnly: boolean; 
        enableDeepExpansion: boolean; 
        showAsJSON: boolean;
        expansionDepth: number;
    };
    display: { 
        showMetadata: boolean; 
        showMemoryUsage: boolean; 
    };
    analysis: {
        includeSymbolicExecution: boolean;
        includePathSensitivity: boolean;
        includeVariableExpansion: boolean;
        includePerformanceMetrics: boolean;
    };
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
            display: { showMetadata: true, showMemoryUsage: true },
            analysis: {
                includeSymbolicExecution: true,
                includePathSensitivity: true,
                includeVariableExpansion: true,
                includePerformanceMetrics: true
            }
        };

        this.setupEventListeners();
    }

    private setupEventListeners() {
        this.contextCollector.on('contextUpdated', () => {
            console.log(`📊 Context updated at ${this.getCurrentTimestamp()}`);
            this.updatePreview();
        });
    }

    show(): void {
        if (!this.view) {
            this.view = vscode.window.createWebviewPanel(
                'contextSelector.view',
                `Co Debug Context`,
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

        // Clean Debug Status (no user/timestamp metadata)
        sections.push(`## Debug Status
Connected: ${context.debugInfo.isConnected ? 'YES' : 'NO'}
Stopped: ${context.debugInfo.isStopped ? 'YES - At breakpoint' : 'NO - Running'}
Location: ${context.currentLocation ? 
    `${context.currentLocation.function.split('.').pop()} (${context.currentLocation.file.split('/').pop()}:${context.currentLocation.line})` : 
    'None'}

Performance:
- Collection: ${context.debugInfo.performance.collectionTime}ms
- Variable Expansion: ${context.debugInfo.performance.variableExpansionTime || 0}ms  
- Memory Usage: ${context.debugInfo.performance.memoryUsage}
- Variables: ${context.variables.length} (${context.debugInfo.performance.expandedVariablesCount} expanded)
- Complex Structures: ${context.debugInfo.performance.complexStructuresFound}
- Expansion Depth: ${this.currentSelection.variables.expansionDepth}

${context.debugInfo.errors.length > 0 ? `Errors: ${context.debugInfo.errors.join(', ')}` : 'No errors'}
`);

        if (!context.debugInfo.isStopped) {
            sections.push(`## Set Breakpoint to Analyze
1. Set breakpoint in your code
2. Trigger execution to hit the breakpoint  
3. Context will be automatically collected with variable expansion to depth ${this.currentSelection.variables.expansionDepth}
`);
            return sections.join('\n');
        }

        // Function Calls (clean)
        if (this.currentSelection.functionCalls.includeRuntime && context.functionCalls.length > 0) {
            sections.push('## Function Calls\n');
            context.functionCalls.slice(0, 5).forEach((call, index) => {
                const fileName = call.file.split('/').pop() || 'unknown';
                const funcName = call.name.split('.').pop() || call.name;
                sections.push(`${index + 1}. ${funcName} (${fileName}:${call.line})`);
                
                if (Object.keys(call.parameters).length > 0) {
                    const paramStr = Object.entries(call.parameters).slice(0, 2)
                        .map(([k, v]) => `${k}: ${String(v).length > 40 ? String(v).substring(0, 40) + '...' : v}`)
                        .join(', ');
                    sections.push(`   {${paramStr}}`);
                }
                sections.push('');
            });
        }

        // Variables (clean)
        if (context.variables.length > 0) {
            const vars = this.currentSelection.variables.showApplicationOnly ? 
                this.contextCollector.getApplicationVariables() : context.variables;
            
            sections.push(`## Variables (${vars.length} total) - Depth ${this.currentSelection.variables.expansionDepth}\n`);
            vars.slice(0, 8).forEach(variable => {
                sections.push(this.formatCleanVariable(variable));
            });
        }

        // Analysis sections (clean)
        if (this.currentSelection.analysis.includeSymbolicExecution && context.symbolicExecution) {
            sections.push('\n## Symbolic Execution Analysis\n');
            const se = context.symbolicExecution;
            sections.push(`Path Probability: ${(se.currentPath.pathProbability * 100).toFixed(1)}%`);
            sections.push(`Alternative Paths: ${se.alternativePaths.length}`);
            sections.push(`Potential Issues: ${se.executionSummary.potentialIssues.length}`);
            sections.push(`Constraints: ${se.currentPath.pathConstraints.length} active`);
            
            if (se.executionSummary.potentialIssues.length > 0) {
                sections.push(`\nTop Issues:`);
                se.executionSummary.potentialIssues.slice(0, 3).forEach((issue, i) => {
                    sections.push(`${i + 1}. ${issue.type}: ${issue.description} (${issue.severity})`);
                    if (issue.suggestedFix) {
                        sections.push(`   Fix: ${issue.suggestedFix}`);
                    }
                });
            }

            if (se.alternativePaths.length > 0) {
                sections.push(`\nAlternative Execution Paths:`);
                se.alternativePaths.slice(0, 3).forEach((alt, i) => {
                    sections.push(`${i + 1}. ${alt.description} (${alt.probability} probability)`);
                    if (alt.estimatedOutcome) {
                        sections.push(`   Expected: ${alt.estimatedOutcome}`);
                    }
                    if (alt.testSuggestion) {
                        sections.push(`   Test: ${alt.testSuggestion}`);
                    }
                });
            }

            if (se.currentPath.pathConstraints.length > 0) {
                sections.push(`\nPath Constraints:`);
                se.currentPath.pathConstraints.slice(0, 3).forEach((constraint, i) => {
                    sections.push(`${i + 1}. ${constraint.expression} (${constraint.isSatisfied ? 'satisfied' : 'unsatisfied'})`);
                });
            }
            sections.push('');
        }
        
        if (this.currentSelection.analysis.includePathSensitivity && context.pathSensitivity) {
            sections.push(`## Path Sensitivity Analysis\n`);
            const ps = context.pathSensitivity;
            sections.push(`Path Coverage: ${(ps.pathAnalysis.pathCoverage * 100).toFixed(1)}%`);
            sections.push(`High-Sensitivity Variables: ${ps.sensitivityMetrics.highSensitivityVariables.length}`);
            sections.push(`Critical Paths: ${ps.pathAnalysis.criticalPaths.length}`);
            sections.push(`Branch Points: ${ps.pathAnalysis.branchPointsDetected}`);
            
            if (ps.sensitivityMetrics.highSensitivityVariables.length > 0) {
                sections.push(`\nHigh-Sensitivity Variables:`);
                ps.sensitivityMetrics.highSensitivityVariables.forEach((varName, i) => {
                    const pathVar = ps.pathSensitiveVariables.find(v => v.name === varName);
                    const score = pathVar ? (pathVar.sensitivityScore * 100).toFixed(1) : 'N/A';
                    const pathCount = pathVar ? pathVar.pathSpecificStates.length : 0;
                    sections.push(`${i + 1}. ${varName} (${score}% sensitivity, ${pathCount} path states)`);
                });
            }
            
            if (ps.pathAnalysis.criticalPaths.length > 0) {
                sections.push(`\nCritical Paths (Top 5):`);
                ps.pathAnalysis.criticalPaths.slice(0, 5).forEach((path, i) => {
                    sections.push(`${i + 1}. ${path.description} (${path.riskLevel} risk)`);
                    if (path.keyVariables && path.keyVariables.length > 0) {
                        sections.push(`   Variables: ${path.keyVariables.slice(0, 3).join(', ')}`);
                    }
                });
            }
            
            if (ps.recommendations.length > 0) {
                sections.push(`\nRecommendations:`);
                ps.recommendations.slice(0, 3).forEach((rec, i) => {
                    sections.push(`${i + 1}. ${rec.type}: ${rec.description} (${rec.priority} priority)`);
                });
            }
            sections.push('');
        }

        return sections.join('\n');
    }

    private formatCleanVariable(variable: Variable): string {
        const badges = [];
        if (variable.isApplicationRelevant) badges.push('APP');
        if (variable.isControlFlow) badges.push('CTRL');
        if (variable.metadata.isExpandable) badges.push('EXP');
        if (variable.metadata.isPointer) badges.push('PTR');
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
        
        if (this.currentSelection.variables.showAsJSON) {
            const fullJSON = this.getFullExpandedJSON(variable);
            
            if (fullJSON && fullJSON.trim() !== '{}') {
                return `### ${variable.name} [${badges.join(',')}]
Type: ${variable.type} | Scope: ${variable.scope}${metadataStr}

JSON Structure:
${fullJSON}

`;
            } else {
                return `### ${variable.name} [${badges.join(',')}]
Type: ${variable.type} | Scope: ${variable.scope}${metadataStr}

Value: ${this.formatSimpleValue(variable)}

`;
            }
        } else {
            let value = variable.value;
            if (value.length > 120) {
                value = value.substring(0, 120) + '... [Enable "Show as JSON" to see full structure]';
            }
            
            return `### ${variable.name} [${badges.join(',')}]
Type: ${variable.type} | Scope: ${variable.scope}${metadataStr}
Value: ${value}

`;
        }
    }

    private formatSimpleValue(variable: Variable): string {
        if (variable.type === 'string') {
            let cleanValue = variable.value;
            if (cleanValue.startsWith('"') && cleanValue.endsWith('"')) {
                cleanValue = cleanValue.slice(1, -1);
            }
            return `"${cleanValue}"`;
        }
        
        if (variable.type === 'error') {
            if (variable.value === 'error nil' || variable.value === 'nil' || variable.value === '<nil>') {
                return 'nil';
            }
            return variable.value;
        }
        
        if (variable.type.includes('int') || variable.type.includes('float')) {
            return variable.value;
        }
        
        if (variable.type === 'bool') {
            return variable.value;
        }
        
        return variable.value;
    }

    private getFullExpandedJSON(variable: Variable): string | null {
        const expandedVariables = this.contextCollector.getExpandedVariables();
        const expandedResult = expandedVariables.get(variable.name);
        
        if (expandedResult && expandedResult.success && expandedResult.data) {
            const jsonResult = this.convertSimplifiedValueToJSON(expandedResult.data, 0, this.currentSelection.variables.expansionDepth);
            
            if (jsonResult && jsonResult.trim() !== '{}' && jsonResult.trim() !== 'null' && jsonResult.trim() !== '""') {
                return jsonResult;
            }
        }
        
        if (variable.metadata.rawValue) {
            try {
                const parsed = JSON.parse(variable.metadata.rawValue);
                const result = JSON.stringify(parsed, null, 2);
                if (result && result.trim() !== '{}') {
                    return result;
                }
            } catch {
                const structured = this.createStructuredJSON(variable.metadata.rawValue);
                if (structured && structured.trim() !== '{}') {
                    return structured;
                }
            }
        }
        
        if (this.isSimpleType(variable.type)) {
            return this.createSimpleValueJSON(variable);
        }
        
        return null;
    }

    private isSimpleType(type: string): boolean {
        return type === 'string' || 
               type === 'error' || 
               type.includes('int') || 
               type.includes('float') || 
               type === 'bool' ||
               type === 'byte' ||
               type === 'rune';
    }

    private createSimpleValueJSON(variable: Variable): string {
        try {
            if (variable.type === 'string') {
                let stringValue = variable.value;
                if (stringValue.startsWith('"') && stringValue.endsWith('"')) {
                    stringValue = stringValue.slice(1, -1);
                }
                return JSON.stringify(stringValue, null, 2);
            }
            
            if (variable.type === 'error') {
                if (variable.value === 'error nil' || variable.value === 'nil' || variable.value === '<nil>') {
                    return 'null';
                }
                return JSON.stringify(variable.value, null, 2);
            }
            
            if (variable.type.includes('int') || variable.type.includes('float')) {
                const numValue = parseFloat(variable.value);
                return isNaN(numValue) ? JSON.stringify(variable.value, null, 2) : JSON.stringify(numValue, null, 2);
            }
            
            if (variable.type === 'bool') {
                return variable.value === 'true' ? 'true' : 'false';
            }
            
            return JSON.stringify(variable.value, null, 2);
        } catch (error) {
            return JSON.stringify(variable.value, null, 2);
        }
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

        if (simplified.children && typeof simplified.children === 'object') {
            const jsonObj: any = {};
            
            Object.entries(simplified.children).forEach(([key, value]: [string, any]) => {
                try {
                    if (value && typeof value === 'object' && value.displayValue !== undefined) {
                        if (value.children && Object.keys(value.children).length > 0) {
                            jsonObj[key] = JSON.parse(this.convertSimplifiedValueToJSON(value, currentDepth + 1, maxDepth));
                        } else {
                            const parsedValue = this.parseDisplayValue(value.displayValue, value.originalType);
                            jsonObj[key] = parsedValue;
                        }
                    } else {
                        jsonObj[key] = this.parseDisplayValue(String(value), 'unknown');
                    }
                } catch (error) {
                    jsonObj[key] = value?.displayValue || String(value);
                }
            });
            
            return JSON.stringify(jsonObj, null, 2);
        }

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

        if (displayValue.match(/^<[^>]+>$/)) {
            const typeMatch = displayValue.match(/^<([^>]+)>$/);
            if (typeMatch) {
                const typeName = typeMatch[1];
                return `[${typeName.split('.').pop()}]`;
            }
        }

        let cleanValue = displayValue;
        if (cleanValue.match(/^<[^>]+>\([^)]*\)$/)) {
            const match = cleanValue.match(/^<[^>]+>\(([^)]*)\)$/);
            if (match && match[1]) {
                cleanValue = match[1];
            } else {
                return `[${type}]`;
            }
        }

        if (cleanValue.includes('<') && cleanValue.includes('>')) {
            const quotedMatch = cleanValue.match(/"([^"]*)"/g);
            if (quotedMatch && quotedMatch.length === 1) {
                return quotedMatch[0].slice(1, -1);
            }
            
            const numberMatch = cleanValue.match(/\b(\d+(?:\.\d+)?)\b/);
            if (numberMatch) {
                const num = parseFloat(numberMatch[1]);
                return Number.isInteger(num) ? parseInt(numberMatch[1]) : num;
            }
            
            return cleanValue.replace(/<[^>]*>/g, '').trim() || `[${type.split('.').pop()}]`;
        }

        if (cleanValue.startsWith('"') && cleanValue.endsWith('"')) {
            return cleanValue.slice(1, -1);
        }

        if (cleanValue === 'true' || cleanValue === 'false') {
            return cleanValue === 'true';
        }

        if (/^\d+$/.test(cleanValue)) {
            return parseInt(cleanValue);
        }

        if (/^\d+\.\d+$/.test(cleanValue)) {
            return parseFloat(cleanValue);
        }

        if (/^0x[0-9a-fA-F]+$/.test(cleanValue)) {
            return `[Pointer: ${cleanValue}]`;
        }

        if (cleanValue === '()' || cleanValue === '') {
            return null;
        }

        if (cleanValue.includes('length:') || cleanValue.includes('cap:')) {
            const lengthMatch = cleanValue.match(/length:\s*(\d+)/);
            const capMatch = cleanValue.match(/cap:\s*(\d+)/);
            return {
                length: lengthMatch ? parseInt(lengthMatch[1]) : 0,
                capacity: capMatch ? parseInt(capMatch[1]) : 0
            };
        }

        if (cleanValue.includes('nil <') && cleanValue.includes('>')) {
            return null;
        }

        if (cleanValue.includes('"')) {
            const stringMatch = cleanValue.match(/"([^"]*)"/);
            if (stringMatch) {
                return stringMatch[1];
            }
        }

        const numberMatch = cleanValue.match(/\b(\d+(?:\.\d+)?)\b/);
        if (numberMatch) {
            const num = parseFloat(numberMatch[1]);
            return Number.isInteger(num) ? parseInt(numberMatch[1]) : num;
        }

        if (cleanValue.startsWith('[') && cleanValue.endsWith(']')) {
            try {
                return JSON.parse(cleanValue);
            } catch {
                return cleanValue;
            }
        }

        if (cleanValue.startsWith('{') && cleanValue.endsWith('}')) {
            try {
                return JSON.parse(cleanValue);
            } catch {
                return cleanValue;
            }
        }

        return cleanValue || `[${type.split('.').pop()}]`;
    }

    private createStructuredJSON(rawValue: string): string {
        try {
            if (rawValue.includes(':') && (rawValue.includes('{') || rawValue.includes(','))) {
                const cleanValue = rawValue.replace(/^[^{]*{/, '{').replace(/}[^}]*$/, '}');
                
                const obj: any = {};
                const content = cleanValue.slice(1, -1);
                
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
                console.log(`🔄 Manual refresh with depth ${this.currentSelection.variables.expansionDepth} at ${this.getCurrentTimestamp()}`);
                try {
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

            case 'callLLM':
                await this.handleCleanLLMCall(message.query, message.context);
                break;

            case 'copyContext':
                this.copyContext();
                break;

            case 'showFullAnalysis':
                this.showFullAnalysis();
                break;
        }
    }

    private async handleCleanLLMCall(query: string, contextText: string): Promise<void> {
        try {
            const cleanContext = this.buildSelectedContext();
            
            console.log(`🤖 LLM call with clean context (${cleanContext.length} chars)`);
            
            const response = await this.llmService.callLLM(cleanContext, query, {
                provider: 'openai',
                model: 'gpt-4',
                temperature: 0.3,
                maxTokens: 4000
            });

            const doc = await vscode.workspace.openTextDocument({
                content: `# AI Debug Analysis
Query: ${query}

## AI Analysis
${response}

---
*Analysis based on clean debug context without internal metadata*`,
                language: 'plaintext'
            });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        } catch (error) {
            vscode.window.showErrorMessage(`LLM call failed: ${error.message}`);
        }
    }

    private async handleDepthChange(newDepth: number): Promise<void> {
        console.log(`🔍 Changing expansion depth from ${this.currentSelection.variables.expansionDepth} to ${newDepth} at ${this.getCurrentTimestamp()}`);
        
        this.currentSelection.variables.expansionDepth = newDepth;
        
        this.contextCollector.updateVariableConfig({
            maxExpansionDepth: newDepth
        });

        try {
            vscode.window.showInformationMessage(`🔄 Expanding variables to depth ${newDepth}...`);
            
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
Depth: ${depth}
Type: ${expanded.originalType}

## JSON Structure
${fullJSON}

## Display Value
${expanded.displayValue}

${expanded.children ? `## Children (${Object.keys(expanded.children).length})
${Object.entries(expanded.children).map(([key, value]) => 
    `${key}: ${value.displayValue}`
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

    private showFullAnalysis(): void {
        const selectedContext = this.buildSelectedContext();
        
        vscode.workspace.openTextDocument({
            content: `# Debug Analysis - Clean Context
${selectedContext}

---
*This clean context can be safely shared with AI assistants*
*No internal metadata, timestamps, or user information included*`,
            language: 'plaintext'
        }).then(doc => {
            vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            vscode.window.showInformationMessage('📄 Clean analysis ready - you can now attach this to any AI assistant');
        });
    }

    copyContext(): void {
        const selectedContext = this.buildSelectedContext();
        
        vscode.env.clipboard.writeText(selectedContext).then(() => {
            vscode.window.showInformationMessage('📋 Clean context copied to clipboard!');
        });
    }


    private getCurrentUser(): string {
        return os.userInfo().username || 'unknown-user';
    }
    private getCurrentTimestamp(): string {
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    private generateHtml(context: ContextData): string {
        const statusIcon = context.debugInfo.isStopped ? '🛑' : '▶️';
        const statusText = context.debugInfo.isStopped ? 'Stopped' : 'Running';
        const currentDepth = this.currentSelection.variables.expansionDepth;
        
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Co Debug Context</title>
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
        .depth-controls { background: var(--vscode-list-hoverBackground); padding: 10px; border-radius: 4px; margin-bottom: 10px; }
        .depth-input { width: 60px; padding: 4px; margin: 0 10px; text-align: center; border: 1px solid var(--vscode-input-border); 
                       border-radius: 3px; background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); }
        @media (max-width: 1000px) { .container { grid-template-columns: 1fr; height: auto; } }
    </style>
</head>
<body>
    <div class="header">
        <div class="status">${statusIcon} ${statusText} | Clean Context | ${this.getCurrentTimestamp()}</div>
        
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
        
        <div class="actions">
            <button class="btn primary" onclick="refresh()">🔄 Refresh</button>
            <button class="btn" onclick="showFullAnalysis()">📄 Full Analysis</button>
            <button class="btn" onclick="copyContext()">📋 Copy Clean Context</button>
        </div>
    </div>
    
    <div class="container">
        <div class="panel">
            <h2>🎯 Context Selector</h2>
            
            <div class="depth-controls">
                <h4>📏 Expansion Depth</h4>
                <div style="display: flex; align-items: center; margin: 10px 0;">
                    <span>Depth:</span>
                    <input type="number" id="depthInput" class="depth-input" 
                           min="1" max="10" value="${currentDepth}" 
                           onchange="changeDepth(parseInt(this.value))"
                           onkeypress="if(event.key==='Enter') changeDepth(parseInt(this.value))">
                    <button class="btn" onclick="changeDepth(parseInt(document.getElementById('depthInput').value))">Apply</button>
                </div>
            </div>

            <div class="section">
                <h3>📄 JSON Display Options</h3>
                <label><input type="checkbox" id="showAsJSON" onchange="updateSelection()">Show Full JSON Structure</label>
                <label><input type="checkbox" id="showMemoryUsage" checked onchange="updateSelection()">Show Memory Usage</label>
            </div>

            <div class="section">
                <h3>🧠 Analysis Options</h3>
                <label><input type="checkbox" id="includeSymbolicExecution" ${this.currentSelection.analysis.includeSymbolicExecution ? 'checked' : ''} onchange="updateSelection()">Include Symbolic Execution</label>
                <label><input type="checkbox" id="includePathSensitivity" ${this.currentSelection.analysis.includePathSensitivity ? 'checked' : ''} onchange="updateSelection()">Include Path Sensitivity</label>
                <label><input type="checkbox" id="includeVariableExpansion" ${this.currentSelection.analysis.includeVariableExpansion ? 'checked' : ''} onchange="updateSelection()">Include Variable Expansion Details</label>
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
                <h3>💬 AI Debug Assistant (Clean Context)</h3>
                <textarea id="queryInput" class="query-textarea" 
                    placeholder="Ask AI about your debug context...

Examples:
• What's wrong with the current execution?
• Analyze the data structures
• Explain the variable relationships
• What are the critical paths showing?
• Why is this function being called?"></textarea>
                <div style="display: flex; gap: 10px; margin-top: 10px;">
                    <button class="btn primary" onclick="callLLM()">🤖 Ask AI</button>
                    <button class="btn" onclick="clearQuery()">🗑️ Clear</button>
                </div>
                <div style="margin-top: 10px; font-size: 0.8em; color: var(--vscode-descriptionForeground);">
                    💡 <strong>Clean Context</strong>: No timestamps, user info, or internal metadata sent to AI
                </div>
            </div>
        </div>
        
        <div class="panel">
            <h2>👀 Enhanced Context Preview (Clean)</h2>
            <div id="previewContent" class="preview">
                ${context.debugInfo.isStopped ? 'Select options to see clean context...' : 'Set breakpoint to see context...'}
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
                    enableDeepExpansion: true,
                    showAsJSON: document.getElementById('showAsJSON').checked,
                    expansionDepth: currentDepth
                },
                display: { 
                    showMetadata: document.getElementById('showMetadata').checked,
                    showMemoryUsage: document.getElementById('showMemoryUsage').checked
                },
                analysis: {
                    includeSymbolicExecution: document.getElementById('includeSymbolicExecution').checked,
                    includePathSensitivity: document.getElementById('includePathSensitivity').checked,
                    includeVariableExpansion: document.getElementById('includeVariableExpansion').checked,
                    includePerformanceMetrics: false
                }
            };
            vscode.postMessage({ command: 'updateSelection', selection: selection });
        }

        function changeDepth(depth) {
            if (depth >= 1 && depth <= 10) {
                currentDepth = depth;
                document.getElementById('depthInput').value = depth;
                vscode.postMessage({ command: 'changeDepth', depth: depth });
            }
        }

        function refresh() { 
            vscode.postMessage({ command: 'refreshContext' }); 
        }
        
        function showFullAnalysis() { vscode.postMessage({ command: 'showFullAnalysis' }); }
        function copyContext() { vscode.postMessage({ command: 'copyContext' }); }
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