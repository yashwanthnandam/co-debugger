import * as vscode from 'vscode';
import { ContextCollector } from '../services/contextCollector';
import { LLMService } from '../services/llmService';
import { SupportedLanguage } from '../languages/languageHandler';

export interface QuickContextOptions {
    includeVariables: boolean;
    includeFunctions: boolean;
    includeSymbolic: boolean;
    includePathSensitivity: boolean;
    includePerformance: boolean;
    includeErrorAnalysis: boolean;
    variableCount: number;
    functionDepth: number;
    includeMemoryInfo: boolean;
    includeTypeInfo: boolean;
}

export class CoDebugAIControl {
    private statusBarItem: vscode.StatusBarItem;
    private contextCollector?: ContextCollector;
    private llmService: LLMService;
    private currentLanguage?: SupportedLanguage;
    private isDebugActive = false;
    private isStopped = false;

    constructor(llmService: LLMService) {
        this.llmService = llmService;
        
        // Create status bar item similar to Copilot
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right, 
            100 // High priority, near other important items
        );
        
        this.statusBarItem.command = 'coDebugAI.showQuickMenu';
        this.updateDisplay();
        this.statusBarItem.show();
    }

    setContext(contextCollector: ContextCollector, language: SupportedLanguage) {
        this.contextCollector = contextCollector;
        this.currentLanguage = language;
        this.isDebugActive = true;
        this.updateDisplay();
    }

    setDebugState(isStopped: boolean) {
        this.isStopped = isStopped;
        this.updateDisplay();
    }

    clearContext() {
        this.contextCollector = undefined;
        this.currentLanguage = undefined;
        this.isDebugActive = false;
        this.isStopped = false;
        this.updateDisplay();
    }

    private updateDisplay() {
        const languageIcon = this.getLanguageIcon();
        
        if (!this.isDebugActive) {
            // No debug session
            this.statusBarItem.text = `🤖 Co Debug AI`;
            this.statusBarItem.tooltip = 'Co Debug AI - No active debug session\nClick to configure or start debugging';
            this.statusBarItem.backgroundColor = undefined;
        } else if (this.isStopped) {
            // Debug stopped at breakpoint
            this.statusBarItem.text = `${languageIcon}🛑 Debug AI`;
            this.statusBarItem.tooltip = `Co Debug AI - ${this.currentLanguage?.toUpperCase()} Debug Stopped\nClick for quick context options`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            // Debug running
            this.statusBarItem.text = `${languageIcon}▶️ Debug AI`;
            this.statusBarItem.tooltip = `Co Debug AI - ${this.currentLanguage?.toUpperCase()} Debug Running\nClick for options`;
            this.statusBarItem.backgroundColor = undefined;
        }
    }

    private getLanguageIcon(): string {
        switch (this.currentLanguage) {
            case 'go': return '🐹';
            case 'python': return '🐍';
            case 'javascript': 
            case 'typescript': return '⚡';
            case 'java': return '☕';
            case 'cpp': return '🔧';
            case 'csharp': return '🔷';
            default: return '🌍';
        }
    }

    async showQuickMenu() {
        if (!this.isDebugActive || !this.contextCollector) {
            return this.showSetupMenu();
        }

        if (!this.isStopped) {
            return this.showRunningMenu();
        }

        return this.showStoppedMenu();
    }

    private async showSetupMenu() {
        const options = [
            {
                label: '$(settings-gear) Configure AI',
                description: 'Set up OpenAI, Anthropic, or Azure',
                action: 'configure'
            },
            {
                label: '$(book) Documentation',
                description: 'View setup guide and features',
                action: 'docs'
            },
            {
                label: '$(debug-start) Start Debugging',
                description: 'Begin a debug session to use AI features',
                action: 'startDebug'
            }
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: '🤖 Co Debug AI - Setup & Configuration',
            ignoreFocusOut: true
        });

        if (selected) {
            switch (selected.action) {
                case 'configure':
                    vscode.commands.executeCommand('coDebugger.configureAI');
                    break;
                case 'docs':
                    this.showDocumentation();
                    break;
                case 'startDebug':
                    vscode.commands.executeCommand('workbench.action.debug.start');
                    break;
            }
        }
    }

    private async showRunningMenu() {
        const options = [
            {
                label: '$(debug-pause) Waiting for Breakpoint',
                description: 'Set a breakpoint to analyze context',
                action: 'none'
            },
            {
                label: '$(settings-gear) Configure AI',
                description: 'Update AI provider settings',
                action: 'configure'
            },
            {
                label: '$(graph-line) Open Full Context View',
                description: 'Open detailed debugging interface',
                action: 'openView'
            }
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: `${this.getLanguageIcon()} ${this.currentLanguage?.toUpperCase()} Debug Running`,
            ignoreFocusOut: true
        });

        if (selected) {
            switch (selected.action) {
                case 'configure':
                    vscode.commands.executeCommand('coDebugger.configureAI');
                    break;
                case 'openView':
                    vscode.commands.executeCommand('contextSelector.openView');
                    break;
            }
        }
    }

    private async showStoppedMenu() {
        if (!this.contextCollector) return;

        const context = this.contextCollector.getContext();
        const appVars = this.contextCollector.getApplicationVariables();
        
        const options = [
            {
                label: '$(file-text) Quick Context for Copilot',
                description: `${appVars.length} variables, ${context.functionCalls.length} functions`,
                action: 'quickContext'
            },
            {
                label: '$(robot) Ask AI Assistant',
                description: 'Get AI analysis of current state',
                action: 'askAI'
            },
            {
                label: '$(copy) Copy Essential Context',
                description: 'Copy key debug info to clipboard',
                action: 'copyEssential'
            },
            {
                label: '$(graph-line) Full Context View',
                description: 'Open detailed analysis interface',
                action: 'openView'
            },
            {
                label: '$(refresh) Refresh Context',
                description: 'Update debug information',
                action: 'refresh'
            }
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: `🛑 ${this.currentLanguage?.toUpperCase()} Debug Stopped - Quick Actions`,
            ignoreFocusOut: true
        });

        if (selected) {
            switch (selected.action) {
                case 'quickContext':
                    await this.generateQuickContext();
                    break;
                case 'askAI':
                    await this.quickAIQuery();
                    break;
                case 'copyEssential':
                    await this.copyEssentialContext();
                    break;
                case 'openView':
                    vscode.commands.executeCommand('contextSelector.openView');
                    break;
                case 'refresh':
                    vscode.commands.executeCommand('contextSelector.refreshContext');
                    break;
            }
        }
    }

    private async generateQuickContext() {
        if (!this.contextCollector) return;

        const context = this.contextCollector.getContext();
        const appVars = this.contextCollector.getApplicationVariables();
        const systemVars = this.contextCollector.getSystemVariables();
        const controlFlowVars = this.contextCollector.getControlFlowVariables();
        const complexVars = this.contextCollector.getComplexVariables();

        // Enhanced context selection with more options
        const contextOptions = await vscode.window.showQuickPick([
            {
                label: '$(zap) Quick Fix Context',
                description: 'Just error/issue variables and current function (minimal)',
                picked: true,
                options: { 
                    includeVariables: true, 
                    includeFunctions: true, 
                    includeSymbolic: false, 
                    includePathSensitivity: false,
                    includePerformance: false,
                    includeErrorAnalysis: true,
                    includeMemoryInfo: false,
                    includeTypeInfo: false,
                    variableCount: 3, 
                    functionDepth: 1 
                }
            },
            {
                label: '$(variable) Essential Variables Only',
                description: `Key application variables (${Math.min(appVars.length, 5)} vars)`,
                options: { 
                    includeVariables: true, 
                    includeFunctions: false, 
                    includeSymbolic: false, 
                    includePathSensitivity: false,
                    includePerformance: false,
                    includeErrorAnalysis: false,
                    includeMemoryInfo: false,
                    includeTypeInfo: true,
                    variableCount: 5, 
                    functionDepth: 0 
                }
            },
            {
                label: '$(call-outgoing) Function Stack Focus',
                description: `Call stack and minimal variables (${Math.min(context.functionCalls.length, 5)} functions)`,
                options: { 
                    includeVariables: true, 
                    includeFunctions: true, 
                    includeSymbolic: false, 
                    includePathSensitivity: false,
                    includePerformance: false,
                    includeErrorAnalysis: false,
                    includeMemoryInfo: false,
                    includeTypeInfo: false,
                    variableCount: 3, 
                    functionDepth: 5 
                }
            },
            {
                label: '$(code) Variable Deep Dive',
                description: `Detailed variable analysis with types (${Math.min(appVars.length, 8)} vars)`,
                options: { 
                    includeVariables: true, 
                    includeFunctions: false, 
                    includeSymbolic: false, 
                    includePathSensitivity: false,
                    includePerformance: false,
                    includeErrorAnalysis: false,
                    includeMemoryInfo: true,
                    includeTypeInfo: true,
                    variableCount: 8, 
                    functionDepth: 0 
                }
            },
            {
                label: '$(flow) Control Flow Analysis',
                description: `Control flow variables and path analysis (${controlFlowVars.length} flow vars)`,
                options: { 
                    includeVariables: true, 
                    includeFunctions: true, 
                    includeSymbolic: false, 
                    includePathSensitivity: true,
                    includePerformance: false,
                    includeErrorAnalysis: true,
                    includeMemoryInfo: false,
                    includeTypeInfo: false,
                    variableCount: 6, 
                    functionDepth: 3 
                }
            },
            {
                label: '$(database) Complex Data Structures',
                description: `Focus on complex objects and arrays (${complexVars.length} complex vars)`,
                options: { 
                    includeVariables: true, 
                    includeFunctions: false, 
                    includeSymbolic: false, 
                    includePathSensitivity: false,
                    includePerformance: false,
                    includeErrorAnalysis: false,
                    includeMemoryInfo: true,
                    includeTypeInfo: true,
                    variableCount: 10, 
                    functionDepth: 0 
                }
            },
            {
                label: '$(pulse) Performance Analysis',
                description: `Performance metrics and timing information`,
                options: { 
                    includeVariables: true, 
                    includeFunctions: true, 
                    includeSymbolic: false, 
                    includePathSensitivity: false,
                    includePerformance: true,
                    includeErrorAnalysis: false,
                    includeMemoryInfo: true,
                    includeTypeInfo: false,
                    variableCount: 5, 
                    functionDepth: 3 
                }
            },
            {
                label: '$(bug) Error Investigation',
                description: `Focus on error analysis and troubleshooting`,
                options: { 
                    includeVariables: true, 
                    includeFunctions: true, 
                    includeSymbolic: true, 
                    includePathSensitivity: false,
                    includePerformance: false,
                    includeErrorAnalysis: true,
                    includeMemoryInfo: false,
                    includeTypeInfo: true,
                    variableCount: 6, 
                    functionDepth: 4 
                }
            },
            {
                label: '$(beaker) Full AI Analysis',
                description: 'Complete context with all AI insights',
                options: { 
                    includeVariables: true, 
                    includeFunctions: true, 
                    includeSymbolic: true, 
                    includePathSensitivity: true,
                    includePerformance: true,
                    includeErrorAnalysis: true,
                    includeMemoryInfo: true,
                    includeTypeInfo: true,
                    variableCount: 10, 
                    functionDepth: 5 
                }
            },
            {
                label: '$(gear) Custom Selection',
                description: 'Choose exactly what to include',
                options: null // Will trigger custom selection
            }
        ], {
            placeHolder: 'Select context detail level for Copilot',
            ignoreFocusOut: true
        });

        if (contextOptions) {
            let finalOptions = contextOptions.options;
            
            if (!finalOptions) {
                // Custom selection flow
                finalOptions = await this.showCustomSelection();
                if (!finalOptions) return;
            }

            const quickContext = this.buildQuickContext(finalOptions);
            await this.createCopilotFile(quickContext);
        }
    }

    private async showCustomSelection(): Promise<QuickContextOptions | null> {
        const selections = await vscode.window.showQuickPick([
            { label: '$(check) Include Variables', picked: true, key: 'includeVariables' },
            { label: '$(call-outgoing) Include Function Stack', picked: true, key: 'includeFunctions' },
            { label: '$(beaker) Include AI Symbolic Analysis', picked: false, key: 'includeSymbolic' },
            { label: '$(flow) Include Path Sensitivity', picked: false, key: 'includePathSensitivity' },
            { label: '$(pulse) Include Performance Metrics', picked: false, key: 'includePerformance' },
            { label: '$(bug) Include Error Analysis', picked: false, key: 'includeErrorAnalysis' },
            { label: '$(database) Include Memory Information', picked: false, key: 'includeMemoryInfo' },
            { label: '$(symbol-class) Include Type Information', picked: true, key: 'includeTypeInfo' }
        ], {
            placeHolder: 'Select what to include in context (multi-select)',
            canPickMany: true,
            ignoreFocusOut: true
        });

        if (!selections || selections.length === 0) return null;

        const includeVars = selections.some(s => s.key === 'includeVariables');
        const includeFuncs = selections.some(s => s.key === 'includeFunctions');

        let variableCount = 5;
        let functionDepth = 3;

        if (includeVars) {
            const varCountStr = await vscode.window.showInputBox({
                prompt: 'How many variables to include?',
                value: '5',
                validateInput: (value) => {
                    const num = parseInt(value);
                    if (isNaN(num) || num < 1 || num > 20) {
                        return 'Enter a number between 1 and 20';
                    }
                    return null;
                }
            });
            if (varCountStr) variableCount = parseInt(varCountStr);
        }

        if (includeFuncs) {
            const funcDepthStr = await vscode.window.showInputBox({
                prompt: 'How many functions in call stack?',
                value: '3',
                validateInput: (value) => {
                    const num = parseInt(value);
                    if (isNaN(num) || num < 1 || num > 10) {
                        return 'Enter a number between 1 and 10';
                    }
                    return null;
                }
            });
            if (funcDepthStr) functionDepth = parseInt(funcDepthStr);
        }

        return {
            includeVariables: selections.some(s => s.key === 'includeVariables'),
            includeFunctions: selections.some(s => s.key === 'includeFunctions'),
            includeSymbolic: selections.some(s => s.key === 'includeSymbolic'),
            includePathSensitivity: selections.some(s => s.key === 'includePathSensitivity'),
            includePerformance: selections.some(s => s.key === 'includePerformance'),
            includeErrorAnalysis: selections.some(s => s.key === 'includeErrorAnalysis'),
            includeMemoryInfo: selections.some(s => s.key === 'includeMemoryInfo'),
            includeTypeInfo: selections.some(s => s.key === 'includeTypeInfo'),
            variableCount,
            functionDepth
        };
    }

    private buildQuickContext(options: QuickContextOptions): string {
        if (!this.contextCollector) return '';

        const context = this.contextCollector.getContext();
        const sections: string[] = [];

        // Header with timestamp
        sections.push(`# ${this.currentLanguage?.toUpperCase()} Debug Context - ${new Date().toLocaleString()}`);
        sections.push(`**Location**: ${context.currentLocation?.function || 'Unknown'}`);
        sections.push(`**File**: ${context.currentLocation?.file.split('/').pop() || 'Unknown'}:${context.currentLocation?.line || 0}`);
        sections.push('');

        // Variables with enhanced filtering
        if (options.includeVariables) {
            let vars = this.contextCollector.getApplicationVariables();
            
            // If focusing on complex data structures
            if (options.includeMemoryInfo && !options.includeFunctions) {
                vars = this.contextCollector.getComplexVariables().slice(0, options.variableCount);
                sections.push('## Complex Data Structures');
            } else if (options.includeErrorAnalysis && !options.includeFunctions) {
                // Focus on error-related variables
                vars = vars.filter(v => 
                    v.name.toLowerCase().includes('err') || 
                    v.name.toLowerCase().includes('error') ||
                    v.type.toLowerCase().includes('error') ||
                    v.isControlFlow
                ).slice(0, options.variableCount);
                sections.push('## Error-Related Variables');
            } else {
                vars = vars.slice(0, options.variableCount);
                sections.push('## Key Variables');
            }
            
            if (vars.length > 0) {
                vars.forEach(v => {
                    let value = v.value.length > 100 ? v.value.substring(0, 100) + '...' : v.value;
                    let line = `- **${v.name}**`;
                    
                    if (options.includeTypeInfo) {
                        line += ` (${v.type})`;
                    }
                    
                    line += `: ${value}`;
                    
                    if (options.includeMemoryInfo && v.metadata.memoryUsage) {
                        line += ` [Memory: ${v.metadata.memoryUsage}]`;
                    }
                    
                    if (v.metadata.isPointer) {
                        line += ` [Pointer]`;
                    }
                    
                    if (v.metadata.arrayLength !== undefined) {
                        line += ` [Length: ${v.metadata.arrayLength}]`;
                    }
                    
                    sections.push(line);
                });
                sections.push('');
            }
        }

        // Functions with configurable depth
        if (options.includeFunctions) {
            const calls = context.functionCalls.slice(0, options.functionDepth);
            if (calls.length > 0) {
                sections.push('## Function Call Stack');
                calls.forEach((call, i) => {
                    const funcName = call.name.split('.').pop() || call.name;
                    const fileName = call.file.split('/').pop() || 'unknown';
                    let line = `${i + 1}. **${funcName}** (${fileName}:${call.line})`;
                    
                    if (options.includePerformance && call.endTime && call.startTime) {
                        const duration = call.endTime - call.startTime;
                        line += ` [${duration}ms]`;
                    }
                    
                    sections.push(line);
                    
                    // Include parameters for first few functions if requested
                    if (i < 2 && Object.keys(call.parameters).length > 0) {
                        const paramStr = Object.entries(call.parameters).slice(0, 3)
                            .map(([k, v]) => `${k}: ${String(v).substring(0, 30)}`)
                            .join(', ');
                        sections.push(`   Parameters: {${paramStr}}`);
                    }
                });
                sections.push('');
            }
        }

        // Performance metrics
        if (options.includePerformance) {
            sections.push('## Performance Metrics');
            sections.push(`- **Collection Time**: ${context.debugInfo.performance.collectionTime}ms`);
            sections.push(`- **Variable Expansion**: ${context.debugInfo.performance.variableExpansionTime || 0}ms`);
            sections.push(`- **Memory Usage**: ${context.debugInfo.performance.memoryUsage}`);
            sections.push(`- **Variables Processed**: ${context.debugInfo.performance.variableCount}`);
            sections.push(`- **Complex Structures**: ${context.debugInfo.performance.complexStructuresFound}`);
            
            if (context.debugInfo.performance.symbolicAnalysisTime) {
                sections.push(`- **AI Analysis Time**: ${context.debugInfo.performance.symbolicAnalysisTime}ms`);
            }
            sections.push('');
        }

        // Error analysis
        if (options.includeErrorAnalysis && context.symbolicExecution) {
            const se = context.symbolicExecution;
            sections.push('## Error Analysis');
            
            if (se.executionSummary.potentialIssues.length > 0) {
                sections.push('### Potential Issues:');
                se.executionSummary.potentialIssues.slice(0, 5).forEach((issue, i) => {
                    sections.push(`${i + 1}. **${issue.type}** (${issue.severity}): ${issue.description}`);
                    if (issue.suggestedFix) {
                        sections.push(`   💡 **Fix**: ${issue.suggestedFix}`);
                    }
                });
            } else {
                sections.push('- No immediate issues detected');
            }
            
            if (context.debugInfo.errors.length > 0) {
                sections.push('### Debug Errors:');
                context.debugInfo.errors.forEach(error => {
                    sections.push(`- ${error}`);
                });
            }
            sections.push('');
        }

        // AI Analysis Summary
        if (options.includeSymbolic && context.symbolicExecution) {
            const se = context.symbolicExecution;
            sections.push('## AI Symbolic Analysis');
            sections.push(`- **Path Probability**: ${(se.currentPath.pathProbability * 100).toFixed(1)}%`);
            sections.push(`- **Alternative Paths**: ${se.alternativePaths.length}`);
            sections.push(`- **Active Constraints**: ${se.currentPath.pathConstraints.length}`);
            
            if (se.alternativePaths.length > 0) {
                sections.push('### Alternative Execution Paths:');
                se.alternativePaths.slice(0, 3).forEach((alt, i) => {
                    sections.push(`${i + 1}. ${alt.description} (${alt.probability} probability)`);
                    if (alt.estimatedOutcome) {
                        sections.push(`   Expected: ${alt.estimatedOutcome}`);
                    }
                });
            }
            sections.push('');
        }

        // Path Sensitivity
        if (options.includePathSensitivity && context.pathSensitivity) {
            const ps = context.pathSensitivity;
            sections.push('## Path Sensitivity Analysis');
            sections.push(`- **Path Coverage**: ${(ps.pathAnalysis.pathCoverage * 100).toFixed(1)}%`);
            sections.push(`- **Critical Paths**: ${ps.pathAnalysis.criticalPaths.length}`);
            sections.push(`- **Branching Points**: ${ps.pathAnalysis.branchPointsDetected}`);
            
            if (ps.sensitivityMetrics.highSensitivityVariables.length > 0) {
                sections.push(`- **High-Sensitivity Variables**: ${ps.sensitivityMetrics.highSensitivityVariables.slice(0, 5).join(', ')}`);
            }
            
            if (ps.pathAnalysis.criticalPaths.length > 0) {
                sections.push('### Critical Paths:');
                ps.pathAnalysis.criticalPaths.slice(0, 3).forEach((path, i) => {
                    sections.push(`${i + 1}. ${path.description} (${path.riskLevel} risk)`);
                });
            }
            sections.push('');
        }

        sections.push('---');
        sections.push('*Generated by Co Debug AI for GitHub Copilot analysis*');
        sections.push(`*Context Type: ${this.getContextTypeDescription(options)}*`);

        return sections.join('\n');
    }

    private getContextTypeDescription(options: QuickContextOptions): string {
        const types = [];
        if (options.includeVariables) types.push(`${options.variableCount} variables`);
        if (options.includeFunctions) types.push(`${options.functionDepth} functions`);
        if (options.includeSymbolic) types.push('AI analysis');
        if (options.includePathSensitivity) types.push('path analysis');
        if (options.includePerformance) types.push('performance');
        if (options.includeErrorAnalysis) types.push('error analysis');
        if (options.includeMemoryInfo) types.push('memory info');
        if (options.includeTypeInfo) types.push('type info');
        
        return types.join(', ');
    }

    private async createCopilotFile(content: string) {
        try {
            const doc = await vscode.workspace.openTextDocument({
                content,
                language: 'markdown'
            });

            // Open in side panel without focus
            await vscode.window.showTextDocument(doc, {
                viewColumn: vscode.ViewColumn.Two,
                preview: false,
                preserveFocus: true
            });

            // Show subtle notification
            vscode.window.showInformationMessage(
                '📄 Debug context ready! File opened in side panel for Copilot.',
                'Open Copilot Chat',
                'Copy File Path'
            ).then(selection => {
                if (selection === 'Open Copilot Chat') {
                    vscode.commands.executeCommand('workbench.action.chat.open');
                } else if (selection === 'Copy File Path') {
                    const fileName = `debug-context-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.md`;
                    vscode.env.clipboard.writeText(fileName);
                }
            });

        } catch (error) {
            console.error('Error creating Copilot file:', error);
            vscode.window.showErrorMessage(`Failed to create context file: ${error.message}`);
        }
    }

    private async quickAIQuery() {
        const query = await vscode.window.showInputBox({
            prompt: 'Ask AI about your debug context',
            placeHolder: 'e.g., "What\'s wrong with this code?" or "Explain these variables"',
            ignoreFocusOut: true
        });

        if (query && this.contextCollector) {
            const quickContext = this.buildQuickContext({
                includeVariables: true,
                includeFunctions: true,
                includeSymbolic: false,
                includePathSensitivity: false,
                includePerformance: false,
                includeErrorAnalysis: true,
                includeMemoryInfo: false,
                includeTypeInfo: true,
                variableCount: 8,
                functionDepth: 3
            });

            try {
                const response = await this.llmService.callLLM(quickContext, query, {
                    provider: 'openai',
                    model: 'gpt-4',
                    temperature: 0.3,
                    maxTokens: 1000
                });

                const doc = await vscode.workspace.openTextDocument({
                    content: `# AI Debug Analysis\n\n**Query**: ${query}\n\n## Response\n${response}\n\n---\n*Co Debug AI Analysis*`,
                    language: 'markdown'
                });

                await vscode.window.showTextDocument(doc, {
                    viewColumn: vscode.ViewColumn.Two,
                    preview: false,
                    preserveFocus: true
                });

            } catch (error) {
                vscode.window.showErrorMessage(`AI query failed: ${error.message}`);
            }
        }
    }

    private async copyEssentialContext() {
        if (!this.contextCollector) return;

        const essentialContext = this.buildQuickContext({
            includeVariables: true,
            includeFunctions: true,
            includeSymbolic: false,
            includePathSensitivity: false,
            includePerformance: false,
            includeErrorAnalysis: true,
            includeMemoryInfo: false,
            includeTypeInfo: false,
            variableCount: 5,
            functionDepth: 3
        });

        await vscode.env.clipboard.writeText(essentialContext);
        vscode.window.showInformationMessage('📋 Essential debug context copied to clipboard!');
    }

    private showDocumentation() {
        const doc = `# Co Debug AI - Quick Guide

## 🚀 Quick Start
1. Start a debug session in any supported language
2. Set a breakpoint and trigger execution  
3. Click the "Co Debug AI" status bar item
4. Select "Quick Context for Copilot"

## 🌍 Supported Languages
- 🐹 Go (Delve)
- 🐍 Python (debugpy)
- ⚡ JavaScript/TypeScript (Node, Chrome)
- ☕ Java (JDB)
- 🔧 C++ (GDB, LLDB)
- 🔷 C# (CoreCLR)

## 🎯 Quick Context Options
- **Quick Fix**: Minimal error-focused context
- **Essential Variables**: Key app variables only
- **Function Stack**: Call stack with minimal variables
- **Variable Deep Dive**: Detailed variable analysis
- **Control Flow**: Path and flow analysis
- **Complex Data**: Focus on objects and arrays
- **Performance**: Timing and performance metrics
- **Error Investigation**: Error analysis and troubleshooting
- **Full AI Analysis**: Complete context with all insights
- **Custom Selection**: Choose exactly what to include

## ⌨️ Keyboard Shortcuts
- \`Ctrl+Shift+D Ctrl+Shift+A\` - Open Context View
- \`Ctrl+Shift+D R\` - Refresh Context
- \`Ctrl+Shift+D Ctrl+Shift+C\` - Configure AI

## 💡 Using with GitHub Copilot
1. Generate Quick Context (opens in side panel)
2. Open Copilot Chat (\`Ctrl+Shift+I\`)
3. Attach the debug context file to your conversation
4. Ask Copilot to analyze your debugging scenario

---
*Co Debug AI*`;

        vscode.workspace.openTextDocument({
            content: doc,
            language: 'markdown'
        }).then(document => {
            vscode.window.showTextDocument(document, {
                viewColumn: vscode.ViewColumn.Two,
                preview: false,
                preserveFocus: true
            });
        });
    }

    dispose() {
        this.statusBarItem.dispose();
    }
}