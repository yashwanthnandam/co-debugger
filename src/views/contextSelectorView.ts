import * as vscode from 'vscode';
import * as os from 'os';
import { ContextCollector, ContextData, Variable, FunctionCall } from '../services/contextCollector';
import { LLMService } from '../services/llmService';

export interface ContextSelection {
    functionCalls: {
        includeRuntime: boolean;
        includeCallStack: boolean;
    };
    variables: {
        includeAll: boolean;
        includeControlFlow: boolean;
        showApplicationOnly: boolean;
    };
    display: {
        showMetadata: boolean;
    };
}

export class ContextSelectorView {
    private view: vscode.WebviewPanel | undefined;
    private contextCollector: ContextCollector;
    private llmService: LLMService;
    private currentSelection: ContextSelection;
    private delveClient?: { getConfiguration: () => any };

    constructor(contextCollector: ContextCollector, llmService: LLMService, delveClient?: { getConfiguration: () => any }) {
        this.contextCollector = contextCollector;
        this.llmService = llmService;
        this.delveClient = delveClient;
        
        this.currentSelection = {
            functionCalls: {
                includeRuntime: true,
                includeCallStack: true
            },
            variables: {
                includeAll: false,
                includeControlFlow: true,
                showApplicationOnly: true
            },
            display: {
                showMetadata: true
            }
        };

        this.setupEventListeners();
    }

    private getCurrentUser(): string {
        return os.userInfo().username || 'unknown-user';
    }

    private getCurrentTimestamp(): string {
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    private getFormattedTime(): string {
        return new Date().toISOString();
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
                `Go Debug Context - ${this.getCurrentUser()}`,
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

        // Debug Status
        sections.push(`## 🔧 Debug Status
**User**: ${this.getCurrentUser()} | **Time**: ${this.getCurrentTimestamp()}
**Connected**: ${context.debugInfo.isConnected ? '✅' : '❌'}
**Stopped**: ${context.debugInfo.isStopped ? '✅ At breakpoint' : '❌ Running'}
**Thread**: ${context.debugInfo.threadId || 'None'}
**Location**: ${context.currentLocation ? 
    `${context.currentLocation.function} (${context.currentLocation.file.split('/').pop()}:${context.currentLocation.line})` : 
    'None'}
**Collection**: ${context.debugInfo.performance.collectionTime}ms
**Variables**: ${context.variables.length} (${this.contextCollector.getApplicationVariables().length} application)
**Symbolic**: ${context.debugInfo.performance.symbolicAnalysisTime || 0}ms
**Path Analysis**: ${context.debugInfo.performance.pathSensitivityTime || 0}ms
**Session**: ${context.debugInfo.sessionId}
**Errors**: ${context.debugInfo.errors.length > 0 ? context.debugInfo.errors.join(', ') : 'None'}
`);

        if (!context.debugInfo.isStopped) {
            sections.push(`## ⚠️ Debugger Not Stopped

Set a breakpoint in application logic and trigger execution:
1. **Set breakpoint** in your handler/service/controller code
2. **Make request** to trigger the breakpoint
3. **Context will be automatically collected** when breakpoint hits

**Current status**: Program is executing, waiting for breakpoint...
`);
            return sections.join('\n');
        }

        // Function Calls
        if (this.currentSelection.functionCalls.includeRuntime && context.functionCalls.length > 0) {
            sections.push('## 📞 Function Calls\n');
            
            context.functionCalls.slice(0, 6).forEach((call, index) => {
                const fileName = call.file.split('/').pop() || call.file;
                const isApplicationCode = this.isApplicationCodePath(call.file) || this.isApplicationFunction(call.name);
                const icon = isApplicationCode ? '🎯' : '🔧';
                
                sections.push(`${index + 1}. ${icon} **${call.name}** (${fileName}:${call.line})`);
                
                if (Object.keys(call.parameters).length > 0) {
                    const params = this.formatParameters(call.parameters);
                    sections.push(`   Parameters: ${params}`);
                }
                sections.push('');
            });
        }

        // Variables
        if (context.variables.length > 0) {
            const applicationVars = this.contextCollector.getApplicationVariables();
            
            if (this.currentSelection.variables.showApplicationOnly && applicationVars.length > 0) {
                sections.push('## 📊 Application Variables\n');
                applicationVars.slice(0, 8).forEach(variable => {
                    sections.push(this.formatVariable(variable));
                });
            } else if (this.currentSelection.variables.includeAll) {
                sections.push('## 🔍 All Variables\n');
                context.variables.slice(0, 12).forEach(variable => {
                    sections.push(this.formatVariable(variable));
                });
            }
        }

        // Symbolic Execution Summary
        if (context.symbolicExecution) {
            sections.push('\n## 🧠 Symbolic Analysis\n');
            const se = context.symbolicExecution;
            
            sections.push(`**Current Path**: ${se.currentPath.currentLocation.function}`);
            sections.push(`**Path Probability**: ${(se.currentPath.pathProbability * 100).toFixed(1)}%`);
            sections.push(`**Active Constraints**: ${se.currentPath.pathConstraints.length}`);
            sections.push(`**Alternative Paths**: ${se.alternativePaths.length}`);
            sections.push(`**Potential Issues**: ${se.executionSummary.potentialIssues.length}`);
            
            if (se.symbolicVariables.length > 0) {
                sections.push('\n**Symbolic Variables**:');
                se.symbolicVariables.slice(0, 4).forEach(sv => {
                    sections.push(`- ${sv.name}: ${sv.symbolicValue}`);
                    if (sv.constraints.length > 0) {
                        sections.push(`  Constraints: ${sv.constraints.length} active`);
                    }
                });
                sections.push('');
            }
            
            if (se.alternativePaths.length > 0) {
                sections.push('**Alternative Execution Scenarios**:');
                se.alternativePaths.slice(0, 2).forEach(alt => {
                    sections.push(`- ${alt.description} (${alt.probability} probability)`);
                });
                sections.push('');
            }
            
            if (se.executionSummary.potentialIssues.length > 0) {
                sections.push('**Detected Issues**:');
                se.executionSummary.potentialIssues.slice(0, 2).forEach(issue => {
                    sections.push(`- ${issue.type}: ${issue.description} (${issue.severity})`);
                });
                sections.push('');
            }

            // Add root cause if available and meaningful
            if (se.executionSummary.rootCauseAnalysis && 
                se.executionSummary.rootCauseAnalysis.primaryCause.description !== 'Normal execution - no issues detected') {
                sections.push(`**Root Cause Analysis**: ${se.executionSummary.rootCauseAnalysis.primaryCause.description}`);
                sections.push('');
            }
        }

        // Path Sensitivity Summary
        if (context.pathSensitivity) {
            sections.push('\n## 🛤️ Path Sensitivity Analysis\n');
            const ps = context.pathSensitivity;
            
            sections.push(`**Path Coverage**: ${(ps.pathAnalysis.pathCoverage * 100).toFixed(1)}% (${ps.pathAnalysis.exploredPaths}/${ps.pathAnalysis.totalPaths} paths)`);
            sections.push(`**Execution Depth**: ${ps.currentPath.length} levels`);
            sections.push(`**High-Sensitivity Variables**: ${ps.sensitivityMetrics.highSensitivityVariables.length}`);
            sections.push(`**Critical Paths Identified**: ${ps.pathAnalysis.criticalPaths.length}`);
            sections.push(`**Branching Complexity**: ${ps.sensitivityMetrics.branchingComplexity.toFixed(1)}`);
            sections.push('');
            
            if (ps.pathSensitiveVariables.length > 0) {
                sections.push('**Path-Dependent Variables**:');
                ps.pathSensitiveVariables.slice(0, 3).forEach(v => {
                    const sensitivity = (v.sensitivityScore * 100).toFixed(0);
                    sections.push(`- ${v.name}: ${sensitivity}% path-dependent (${v.pathSpecificStates.length} different states)`);
                });
                sections.push('');
            }

            // Show current execution path if available
            if (ps.currentPath.length > 1) {
                const pathDisplay = ps.currentPath.length > 3 ? 
                    `...${ps.currentPath.slice(-3).join(' → ')}` : 
                    ps.currentPath.join(' → ');
                sections.push(`**Current Execution Path**: ${pathDisplay}`);
                sections.push('');
            }

            // Show high-priority recommendations
            if (ps.recommendations.length > 0) {
                const highPriorityRecs = ps.recommendations.filter(r => r.priority === 'high' || r.priority === 'critical');
                if (highPriorityRecs.length > 0) {
                    sections.push('**High-Priority Recommendations**:');
                    highPriorityRecs.slice(0, 2).forEach(rec => {
                        sections.push(`- ${rec.description} (${rec.priority})`);
                    });
                    sections.push('');
                }
            }
        }

        return sections.join('\n');
    }

    private isApplicationCodePath(filePath: string): boolean {
        const applicationPaths = ['/internal/', '/cmd/', '/pkg/', '/app/', '/src/', '/api/', '/handlers/', '/services/', '/controllers/', '/delivery/', '/usecase/'];
        const systemPaths = ['/go/src/', '/usr/local/go/', '/pkg/mod/', 'vendor/', 'github.com/', 'golang.org/'];
        
        if (systemPaths.some(path => filePath.includes(path))) {
            return false;
        }
        
        return applicationPaths.some(path => filePath.includes(path)) || 
               (filePath.length > 0 && !systemPaths.some(path => filePath.includes(path)));
    }

    private isApplicationFunction(functionName: string): boolean {
        const applicationPatterns = ['Handler)', 'Controller)', 'Service)', 'UseCase)', 'Repository)', 'Manager)', '.Get', '.Post', '.Put', '.Delete', '.Create', '.Update', '.Process'];
        const systemPatterns = ['gin.', 'mux.', 'http.', 'runtime.', 'reflect.', 'syscall.'];
        
        if (systemPatterns.some(pattern => functionName.includes(pattern))) {
            return false;
        }
        
        return applicationPatterns.some(pattern => functionName.includes(pattern));
    }

    private formatParameters(params: Record<string, any>): string {
        const entries = Object.entries(params).slice(0, 3);
        if (entries.length === 0) return 'None';
        
        const formatted = entries.map(([key, value]) => {
            const shortValue = String(value).length > 50 ? String(value).substring(0, 50) + '...' : String(value);
            return `${key}: ${shortValue}`;
        }).join(', ');
        
        return `{${formatted}}`;
    }

    private formatVariable(variable: Variable): string {
        const badges = [];
        if (variable.isApplicationRelevant) badges.push('📊');
        if (variable.isControlFlow) badges.push('⚡');
        if (variable.metadata.isExpandable) badges.push('📁');
        if (variable.metadata.isPointer) badges.push('→');
        
        const value = variable.value.length > 100 ? 
            variable.value.substring(0, 100) + '...' : 
            variable.value;
            
        return `#### ${variable.name} ${badges.join('')}
**Type**: ${variable.type} | **Scope**: ${variable.scope}
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
                console.log(`🔄 Manual refresh at ${this.getCurrentTimestamp()}`);
                try {
                    await this.contextCollector.refreshAll();
                    this.updateContent();
                    vscode.window.showInformationMessage('✅ Context refreshed successfully');
                } catch (error) {
                    console.error(`❌ Refresh failed at ${this.getCurrentTimestamp()}:`, error);
                    vscode.window.showErrorMessage(`❌ Refresh failed: ${error.message}`);
                }
                break;

            case 'callLLM':
                await this.handleLLMCall(message.query, message.context);
                break;

            case 'exportContext':
                this.exportContext();
                break;

            case 'testConnection':
                const context = this.contextCollector.getContext();
                const applicationVars = this.contextCollector.getApplicationVariables().length;
                
                vscode.window.showInformationMessage(
                    `🔗 Connected: ${context.debugInfo.isConnected ? 'Yes' : 'No'} | ` +
                    `🛑 Stopped: ${context.debugInfo.isStopped ? 'Yes' : 'No'} | ` +
                    `📊 Variables: ${context.variables.length} (${applicationVars} application) | ` +
                    `🧠 Symbolic: ${context.symbolicExecution ? 'Active' : 'None'} | ` +
                    `🛤️ Path Analysis: ${context.pathSensitivity?.pathAnalysis.exploredPaths || 0} paths | ` +
                    `⏱️ Collection: ${context.debugInfo.performance.collectionTime}ms`
                );
                break;

            case 'showConfiguration':
                this.showConfigurationInfo();
                break;
        }
    }

    private async handleLLMCall(query: string, contextText: string): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('contextSelector.llm');
            const context = this.contextCollector.getContext();
            
            const enhancedContext = `
USER: ${this.getCurrentUser()}
CURRENT_TIME: ${this.getFormattedTime()}
SESSION_ID: ${context.debugInfo.sessionId}
DEBUG_LOCATION: ${context.currentLocation?.function || 'Unknown'}
THREAD_ID: ${context.debugInfo.threadId}

PERFORMANCE_METRICS:
- Collection Time: ${context.debugInfo.performance.collectionTime}ms
- Symbolic Analysis: ${context.debugInfo.performance.symbolicAnalysisTime || 0}ms
- Path Sensitivity: ${context.debugInfo.performance.pathSensitivityTime || 0}ms
- Variables Found: ${context.variables.length} (${this.contextCollector.getApplicationVariables().length} application-relevant)
- Function Calls: ${context.functionCalls.length}

PROJECT_TYPE: Go Application (Domain-Independent Debug Analysis)
CURRENT_FUNCTION: ${context.currentLocation?.function || 'N/A'}
SOURCE_FILE: ${context.currentLocation?.file?.split('/').pop() || 'N/A'}:${context.currentLocation?.line || 0}

${context.symbolicExecution ? `
SYMBOLIC_EXECUTION_ANALYSIS:
- Current Path: ${context.symbolicExecution.currentPath.currentLocation.function}
- Path Probability: ${(context.symbolicExecution.currentPath.pathProbability * 100).toFixed(1)}%
- Active Constraints: ${context.symbolicExecution.currentPath.pathConstraints.length}
- Alternative Paths: ${context.symbolicExecution.alternativePaths.length}
- Potential Issues: ${context.symbolicExecution.executionSummary.potentialIssues.length}

SYMBOLIC_VARIABLES:
${context.symbolicExecution.symbolicVariables.map(sv => `- ${sv.name}: ${sv.symbolicValue} (${sv.constraints.length} constraints)`).join('\n')}

ALTERNATIVE_SCENARIOS:
${context.symbolicExecution.alternativePaths.map(alt => `- ${alt.description} (${alt.probability})`).join('\n')}
` : 'SYMBOLIC_EXECUTION: Not available'}

${context.pathSensitivity ? `
PATH_SENSITIVITY_ANALYSIS:
- Current Path: ${context.pathSensitivity.currentPath.slice(-3).join(' → ')}
- Path Coverage: ${(context.pathSensitivity.pathAnalysis.pathCoverage * 100).toFixed(1)}%
- High-Sensitivity Variables: ${context.pathSensitivity.sensitivityMetrics.highSensitivityVariables.length}
- Critical Paths: ${context.pathSensitivity.pathAnalysis.criticalPaths.length}
- Branching Complexity: ${context.pathSensitivity.sensitivityMetrics.branchingComplexity.toFixed(1)}

PATH_DEPENDENT_VARIABLES:
${context.pathSensitivity.pathSensitiveVariables.map(v => `- ${v.name}: ${(v.sensitivityScore * 100).toFixed(1)}% path-dependent`).join('\n')}

CRITICAL_PATHS:
${context.pathSensitivity.pathAnalysis.criticalPaths.map(cp => `- ${cp.description} (${cp.riskLevel} risk)`).join('\n')}
` : 'PATH_SENSITIVITY: Not available'}

VARIABLE_SUMMARY:
${context.variables.slice(0, 10).map(v => `- ${v.name} (${v.type}): ${v.value.length > 100 ? v.value.substring(0, 100) + '...' : v.value}`).join('\n')}

DEBUG_CONTEXT:
${contextText}`;

            console.log(`🤖 Enhanced LLM call for ${this.getCurrentUser()} at ${this.getCurrentTimestamp()}`);
            
            const response = await this.llmService.callLLM(enhancedContext, query, {
                provider: config.get('provider') || 'openai',
                model: config.get('model') || 'gpt-4',
                temperature: config.get('temperature') || 0.3,
                maxTokens: config.get('maxTokens') || 4000
            });

            const doc = await vscode.workspace.openTextDocument({
                content: `# AI Debug Analysis - Go Application
**Generated**: ${this.getFormattedTime()}
**User**: ${this.getCurrentUser()}
**Query**: ${query}
**Session**: ${context.debugInfo.sessionId}

## Debug Context Summary
**Location**: ${context.currentLocation?.function || 'Unknown'} (${context.currentLocation?.file?.split('/').pop() || 'N/A'}:${context.currentLocation?.line || 0})
**Thread**: ${context.debugInfo.threadId}
**Variables**: ${context.variables.length} total (${this.contextCollector.getApplicationVariables().length} application-relevant)
**Function Calls**: ${context.functionCalls.length}

## Performance Metrics
- **Collection Time**: ${context.debugInfo.performance.collectionTime}ms
${context.symbolicExecution ? `- **Symbolic Analysis**: ${context.symbolicExecution.performance.analysisTime}ms
- **Symbolic Variables**: ${context.symbolicExecution.symbolicVariables.length}
- **Alternative Paths**: ${context.symbolicExecution.alternativePaths.length}
- **Potential Issues**: ${context.symbolicExecution.executionSummary.potentialIssues.length}` : ''}
${context.pathSensitivity ? `- **Path Analysis**: ${context.pathSensitivity.performance.analysisTime}ms
- **Paths Analyzed**: ${context.pathSensitivity.pathAnalysis.exploredPaths}
- **Path Coverage**: ${(context.pathSensitivity.pathAnalysis.pathCoverage * 100).toFixed(1)}%
- **High-Sensitivity Variables**: ${context.pathSensitivity.sensitivityMetrics.highSensitivityVariables.length}` : ''}

## Current Application State
${context.variables.filter(v => v.isApplicationRelevant).slice(0, 5).map(v => `**${v.name}**: ${v.value.length > 100 ? v.value.substring(0, 100) + '...' : v.value}`).join('\n')}

## AI Analysis

${response}

${context.pathSensitivity && context.pathSensitivity.recommendations.length > 0 ? `
## Path-Sensitivity Recommendations
${context.pathSensitivity.recommendations.slice(0, 3).map(r => `- **${r.type}**: ${r.description} (${r.priority} priority)`).join('\n')}
` : ''}

---
*Go Debug Context Analyzer with Symbolic Execution & Path Sensitivity*
*Domain-Independent Analysis Engine*
*User: ${this.getCurrentUser()} | Session: ${context.debugInfo.sessionId}*
*Generated: ${this.getFormattedTime()}*`,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);

        } catch (error) {
            console.error(`❌ LLM call failed at ${this.getCurrentTimestamp()}:`, error);
            vscode.window.showErrorMessage(`LLM call failed: ${error.message}`);
        }
    }

    public exportContext(): void {
        const selectedContext = this.buildSelectedContext();
        const context = this.contextCollector.getContext();
        
        const exportContent = `# Go Debug Context Export
**Generated**: ${this.getFormattedTime()}
**User**: ${this.getCurrentUser()}
**Session**: ${context.debugInfo.sessionId}
**Location**: ${context.currentLocation?.function || 'Unknown'}
**Thread**: ${context.debugInfo.threadId}

## System Information
- **Debug Session**: ${context.debugInfo.sessionId}
- **Connection Status**: ${context.debugInfo.isConnected ? 'Connected' : 'Disconnected'}
- **Execution Status**: ${context.debugInfo.isStopped ? 'Stopped at breakpoint' : 'Running'}
- **Source File**: ${context.currentLocation?.file?.split('/').pop() || 'N/A'}:${context.currentLocation?.line || 0}

## Performance Metrics
- **Collection Time**: ${context.debugInfo.performance.collectionTime}ms
- **Symbolic Analysis**: ${context.debugInfo.performance.symbolicAnalysisTime || 0}ms
- **Path Sensitivity**: ${context.debugInfo.performance.pathSensitivityTime || 0}ms
- **Variables**: ${context.variables.length} (${this.contextCollector.getApplicationVariables().length} application-relevant)
- **Function Calls**: ${context.functionCalls.length}
${context.symbolicExecution ? `- **Symbolic Variables**: ${context.symbolicExecution.symbolicVariables.length}
- **Alternative Paths**: ${context.symbolicExecution.alternativePaths.length}` : ''}
${context.pathSensitivity ? `- **Paths Analyzed**: ${context.pathSensitivity.pathAnalysis.exploredPaths}
- **Path Coverage**: ${(context.pathSensitivity.pathAnalysis.pathCoverage * 100).toFixed(1)}%` : ''}

## Application Variables
${this.contextCollector.getApplicationVariables().slice(0, 10).map(v => 
    `**${v.name}** (${v.type}): ${v.value.length > 200 ? v.value.substring(0, 200) + '...' : v.value}`
).join('\n')}

${selectedContext}

## Analysis Summary
${context.symbolicExecution ? `
**Symbolic Execution Results**:
- Current Path Probability: ${(context.symbolicExecution.currentPath.pathProbability * 100).toFixed(1)}%
- Active Constraints: ${context.symbolicExecution.currentPath.pathConstraints.length}
- Alternative Scenarios: ${context.symbolicExecution.alternativePaths.length}
- Potential Issues: ${context.symbolicExecution.executionSummary.potentialIssues.length}
` : ''}
${context.pathSensitivity ? `
**Path Sensitivity Results**:
- Path Coverage: ${(context.pathSensitivity.pathAnalysis.pathCoverage * 100).toFixed(1)}%
- High-Sensitivity Variables: ${context.pathSensitivity.sensitivityMetrics.highSensitivityVariables.length}
- Critical Paths: ${context.pathSensitivity.pathAnalysis.criticalPaths.length}
- Branching Complexity: ${context.pathSensitivity.sensitivityMetrics.branchingComplexity.toFixed(1)}
` : ''}

---
*Exported by ${this.getCurrentUser()} at ${this.getFormattedTime()}*
*Go Debug Context Analyzer - Domain-Independent Analysis*`;
        
        vscode.workspace.openTextDocument({
            content: exportContent,
            language: 'markdown'
        }).then(doc => {
            vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        });
    }

    private showConfigurationInfo(): void {
        const delveConfig = this.delveClient?.getConfiguration();
        const variableConfig = this.contextCollector.getVariableConfig();
        
        const configContent = `# Debug Context Configuration
**User**: ${this.getCurrentUser()}
**Time**: ${this.getCurrentTimestamp()}

## DelveClient Configuration
**Business Logic Detection**: ${delveConfig?.enableDetection ? 'Enabled' : 'Disabled'}
**Application Patterns**: ${delveConfig?.applicationPatterns?.join(', ') || 'None'}
**Infrastructure Patterns**: ${delveConfig?.infrastructurePatterns?.join(', ') || 'None'}
**Path Inclusions**: ${delveConfig?.pathInclusions?.join(', ') || 'None'}
**Path Exclusions**: ${delveConfig?.pathExclusions?.join(', ') || 'None'}

## Variable Analysis Configuration
**Control Flow Patterns**: ${variableConfig?.controlFlowPatterns?.join(', ') || 'None'}
**Application Variable Patterns**: ${variableConfig?.applicationVariablePatterns?.join(', ') || 'None'}
**System Variable Patterns**: ${variableConfig?.systemVariablePatterns?.join(', ') || 'None'}
**Max Variable Length**: ${variableConfig?.maxVariableValueLength || 'Default'}
**Max Parameter Count**: ${variableConfig?.maxParameterCount || 'Default'}
**Type Inference**: ${variableConfig?.enableTypeInference ? 'Enabled' : 'Disabled'}

## VS Code Settings
To customize these patterns, update your VS Code settings:
\`\`\`json
{
  "goDebugger.businessLogic.applicationPatterns": [...],
  "goDebugger.variableAnalysis.controlFlowPatterns": [...],
  "goDebugger.variableAnalysis.applicationVariablePatterns": [...]
}
\`\`\`
`;

        vscode.workspace.openTextDocument({
            content: configContent,
            language: 'markdown'
        }).then(doc => {
            vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
        });
    }

    private generateHtml(context: ContextData): string {
        const statusIcon = context.debugInfo.isStopped ? '🛑' : '▶️';
        const statusText = context.debugInfo.isStopped ? 'Stopped' : 'Running';
        const applicationVars = this.contextCollector.getApplicationVariables().length;
        const currentUser = this.getCurrentUser();
        const currentTime = this.getCurrentTimestamp();
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Go Debug Context - ${currentUser}</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    color: var(--vscode-foreground);
                    padding: 20px;
                    margin: 0;
                    background-color: var(--vscode-editor-background);
                }
                
                .header {
                    background: var(--vscode-textCodeBlock-background);
                    padding: 15px;
                    margin-bottom: 20px;
                    border-radius: 6px;
                    border: 1px solid var(--vscode-panel-border);
                }
                
                .status {
                    font-size: 1.1em;
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: ${context.debugInfo.isStopped ? 'var(--vscode-gitDecoration-addedResourceForeground)' : 'var(--vscode-gitDecoration-modifiedResourceForeground)'};
                }
                
                .metrics {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                    gap: 10px;
                    margin: 10px 0;
                }
                
                .metric {
                    background: var(--vscode-input-background);
                    padding: 8px;
                    border-radius: 4px;
                    text-align: center;
                    border: 1px solid var(--vscode-input-border);
                }
                
                .metric-value {
                    font-size: 1.1em;
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                }
                
                .actions {
                    display: flex;
                    gap: 10px;
                    margin-top: 15px;
                    flex-wrap: wrap;
                }
                
                .btn {
                    padding: 6px 14px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 0.9em;
                }
                
                .btn:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .btn.primary {
                    background-color: var(--vscode-textLink-foreground);
                    color: white;
                }
                
                .container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    height: calc(100vh - 200px);
                }
                
                .panel {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 15px;
                    background-color: var(--vscode-sideBar-background);
                    overflow-y: auto;
                }
                
                .section {
                    margin-bottom: 20px;
                    padding: 12px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    background-color: var(--vscode-input-background);
                }
                
                .section h3 {
                    margin-top: 0;
                    color: var(--vscode-textLink-foreground);
                }
                
                .checkbox-group label {
                    display: block;
                    margin-bottom: 6px;
                    cursor: pointer;
                }
                
                .query-section {
                    margin-top: 20px;
                    padding: 15px;
                    border: 2px solid var(--vscode-textLink-foreground);
                    border-radius: 6px;
                }
                
                .query-textarea {
                    width: 100%;
                    min-height: 70px;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 3px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    font-family: var(--vscode-font-family);
                    resize: vertical;
                }
                
                .preview {
                    font-family: var(--vscode-editor-font-family);
                    font-size: 0.9em;
                    line-height: 1.5;
                    white-space: pre-wrap;
                    background-color: var(--vscode-textCodeBlock-background);
                    padding: 15px;
                    border-radius: 4px;
                    border: 1px solid var(--vscode-panel-border);
                    overflow-x: auto;
                }
                
                @media (max-width: 1000px) {
                    .container {
                        grid-template-columns: 1fr;
                        height: auto;
                    }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="status">
                    ${statusIcon} ${statusText} | User: ${currentUser} | ${currentTime}
                </div>
                
                <div class="metrics">
                    <div class="metric">
                        <div class="metric-value">${context.functionCalls.length}</div>
                        <div>Functions</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${context.variables.length}</div>
                        <div>Variables</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${applicationVars}</div>
                        <div>Application</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${context.debugInfo.performance.collectionTime}ms</div>
                        <div>Collection</div>
                    </div>
                    ${context.symbolicExecution ? `
                    <div class="metric">
                        <div class="metric-value">${context.symbolicExecution.alternativePaths.length}</div>
                        <div>Alt Paths</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${context.symbolicExecution.executionSummary.potentialIssues.length}</div>
                        <div>Issues</div>
                    </div>
                    ` : ''}
                    ${context.pathSensitivity ? `
                    <div class="metric">
                        <div class="metric-value">${context.pathSensitivity.pathAnalysis.exploredPaths}</div>
                        <div>Paths</div>
                    </div>
                    <div class="metric">
                        <div class="metric-value">${(context.pathSensitivity.pathAnalysis.pathCoverage * 100).toFixed(0)}%</div>
                        <div>Coverage</div>
                    </div>
                    ` : ''}
                </div>
                
                <div>
                    <strong>Location</strong>: ${context.currentLocation ? 
                        `${context.currentLocation.function} (${context.currentLocation.file.split('/').pop()}:${context.currentLocation.line})` : 
                        'None'}
                </div>
                <div>
                    <strong>Session</strong>: ${context.debugInfo.sessionId} | 
                    <strong>Thread</strong>: ${context.debugInfo.threadId || 'None'}
                </div>
                ${context.debugInfo.errors.length > 0 ? 
                    `<div style="color: var(--vscode-errorForeground); margin-top: 5px;">⚠️ ${context.debugInfo.errors.join(', ')}</div>` : ''}
                
                <div class="actions">
                    <button class="btn primary" onclick="refresh()">🔄 Refresh</button>
                    <button class="btn" onclick="testConnection()">🔗 Status</button>
                    <button class="btn" onclick="exportContext()">📋 Export</button>
                    <button class="btn" onclick="showConfig()">⚙️ Config</button>
                </div>
            </div>
            
            <div class="container">
                <div class="panel">
                    <h2>🎯 Context Selector</h2>
                    
                    <div class="section">
                        <h3>📞 Function Calls</h3>
                        <div class="checkbox-group">
                            <label>
                                <input type="checkbox" id="includeRuntime" checked onchange="updateSelection()">
                                Runtime Calls (${context.functionCalls.length})
                            </label>
                            <label>
                                <input type="checkbox" id="includeCallStack" checked onchange="updateSelection()">
                                Call Stack Analysis
                            </label>
                        </div>
                    </div>
                    
                    <div class="section">
                        <h3>🔍 Variables</h3>
                        <div class="checkbox-group">
                            <label>
                                <input type="checkbox" id="showApplicationOnly" checked onchange="updateSelection()">
                                Application Variables (${applicationVars})
                            </label>
                            <label>
                                <input type="checkbox" id="includeControlFlow" checked onchange="updateSelection()">
                                Control Flow Variables
                            </label>
                            <label>
                                <input type="checkbox" id="includeAllVars" onchange="updateSelection()">
                                All Variables (${context.variables.length})
                            </label>
                            <label>
                                <input type="checkbox" id="showMetadata" checked onchange="updateSelection()">
                                Show Metadata & Types
                            </label>
                        </div>
                    </div>
                    
                    <div class="query-section">
                        <h3>💬 AI Debug Assistant</h3>
                        <textarea 
                            id="queryInput" 
                            class="query-textarea"
                            placeholder="Ask AI about your debug context...

Examples:
• What's the issue in current execution?
• Explain these variable values
• What test scenarios should I consider?
• Analyze the execution path
• Why did this function get called?
• What are the alternative execution paths?"
                        ></textarea>
                        <div style="display: flex; gap: 10px; margin-top: 10px;">
                            <button class="btn primary" onclick="callLLM()">🤖 Ask AI</button>
                            <button class="btn" onclick="clearQuery()">🗑️ Clear</button>
                        </div>
                        
                        <div style="margin-top: 10px; font-size: 0.8em; color: var(--vscode-descriptionForeground);">
                            💡 <strong>Enhanced with:</strong> Symbolic execution analysis, path sensitivity, domain-independent patterns
                        </div>
                    </div>
                </div>
                
                <div class="panel">
                    <h2>👀 Context Preview</h2>
                    <div id="previewContent" class="preview">
                        ${context.debugInfo.isStopped ? 'Select options to see context...' : 'Set breakpoint to see context...'}
                    </div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                function updateSelection() {
                    const selection = {
                        functionCalls: {
                            includeRuntime: document.getElementById('includeRuntime').checked,
                            includeCallStack: document.getElementById('includeCallStack').checked
                        },
                        variables: {
                            includeAll: document.getElementById('includeAllVars').checked,
                            includeControlFlow: document.getElementById('includeControlFlow').checked,
                            showApplicationOnly: document.getElementById('showApplicationOnly').checked
                        },
                        display: {
                            showMetadata: document.getElementById('showMetadata').checked
                        }
                    };

                    vscode.postMessage({
                        command: 'updateSelection',
                        selection: selection
                    });
                }

                function refresh() {
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

                    const context = document.getElementById('previewContent').textContent;
                    vscode.postMessage({
                        command: 'callLLM',
                        query: query,
                        context: context
                    });
                }

                function clearQuery() {
                    document.getElementById('queryInput').value = '';
                }

                function exportContext() {
                    vscode.postMessage({ command: 'exportContext' });
                }

                function showConfig() {
                    vscode.postMessage({ command: 'showConfiguration' });
                }

                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    if (message.command === 'updatePreview') {
                        document.getElementById('previewContent').textContent = message.context;
                    }
                });

                // Initialize
                updateSelection();
            </script>
        </body>
        </html>`;
    }
}