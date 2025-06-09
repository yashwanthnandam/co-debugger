import * as vscode from 'vscode';
import * as os from 'os';
import { EventEmitter } from 'events';
import { DelveClient } from './delveClient';
import { DataStructureHandler, SimplificationOptions, SimplifiedValue } from './dataStructureHandler';
import { VariableExpansionService, ExpansionResult } from './variableExpansionService';
import { SymbolicExecutor, SymbolicExecutionContext } from './symbolicExecutor';
import { PathSensitivityAnalyzer, PathSensitivityReport } from './pathSensitivityAnalyzer';

export interface FunctionCall {
    id: string;
    name: string;
    file: string;
    line: number;
    parameters: Record<string, any>;
    returnValues?: any;
    startTime: number;
    endTime?: number;
    parentId?: string;
    children: string[];
}

export interface Variable {
    name: string;
    value: string;
    type: string;
    scope: string;
    isControlFlow: boolean;
    isApplicationRelevant: boolean;
    changeHistory: VariableChange[];
    dependencies: string[];
    metadata: {
        isPointer: boolean;
        isNil: boolean;
        memoryAddress?: string;
        arrayLength?: number;
        objectKeyCount?: number;
        truncatedAt?: number;
        isExpandable: boolean;
        rawValue?: string;
        expansionDepth?: number;
        memoryUsage?: string;
    };
}

export interface VariableChange {
    timestamp: number;
    oldValue: string;
    newValue: string;
    location: string;
}

export interface ExecutionPath {
    id: string;
    functionName: string;
    conditions: Condition[];
    branches: Branch[];
    variables: string[];
}

export interface Condition {
    expression: string;
    result: boolean;
    variables: string[];
    location: string;
    timestamp: number;
}

export interface Branch {
    type: 'if' | 'for' | 'switch' | 'select';
    condition: string;
    taken: boolean;
    location: string;
}

export interface CallGraphNode {
    name: string;
    file: string;
    line: number;
    callers: string[];
    callees: string[];
    isStatic: boolean;
}

export interface VariableAnalysisConfig {
    controlFlowPatterns: string[];
    systemVariablePatterns: string[];
    applicationVariablePatterns: string[];
    maxVariableValueLength: number;
    maxParameterCount: number;
    enableTypeInference: boolean;
    enableDeepExpansion: boolean;
    maxExpansionDepth: number;
    memoryLimitMB: number;
}

export interface ContextData {
    functionCalls: FunctionCall[];
    variables: Variable[];
    executionPaths: ExecutionPath[];
    callGraph: Map<string, CallGraphNode>;
    currentLocation: {
        file: string;
        line: number;
        function: string;
    } | null;
    symbolicExecution?: SymbolicExecutionContext;
    pathSensitivity?: PathSensitivityReport;
    debugInfo: {
        isConnected: boolean;
        isStopped: boolean;
        lastCollection: number;
        totalFrames: number;
        totalScopes: number;
        errors: string[];
        currentThreadId: number | null;
        currentFrameId: number | null;
        timestamp: string;
        user: string;
        sessionId: string;
        performance: {
            collectionTime: number;
            variableCount: number;
            complexStructuresFound: number;
            expandedVariablesCount: number;
            memoryUsage: string;
            symbolicAnalysisTime?: number;
            constraintsSolved?: number;
            alternativePathsFound?: number;
            pathSensitivityTime?: number;
            pathsAnalyzed?: number;
            variableExpansionTime?: number;
        };
    };
}

export class ContextCollector extends EventEmitter {
    private delveClient: DelveClient;
    private context: ContextData;
    private isCollecting = false;
    private dataHandler: DataStructureHandler;
    private variableExpansionService: VariableExpansionService;
    private symbolicExecutor: SymbolicExecutor;
    private pathSensitivityAnalyzer: PathSensitivityAnalyzer;
    private variableConfig: VariableAnalysisConfig;
    private sessionId: string;

    // Enhanced variable expansion results
    private expandedVariables: Map<string, ExpansionResult> = new Map();

    constructor(delveClient: DelveClient) {
        super();
        this.delveClient = delveClient;
        this.dataHandler = new DataStructureHandler();
        this.variableExpansionService = new VariableExpansionService();
        this.sessionId = this.generateSessionId();
        this.symbolicExecutor = new SymbolicExecutor(this.sessionId);
        this.pathSensitivityAnalyzer = new PathSensitivityAnalyzer(this.sessionId);
        this.variableConfig = this.loadVariableConfig();
        
        this.context = {
            functionCalls: [],
            variables: [],
            executionPaths: [],
            callGraph: new Map(),
            currentLocation: null,
            debugInfo: {
                isConnected: false,
                isStopped: false,
                lastCollection: 0,
                totalFrames: 0,
                totalScopes: 0,
                errors: [],
                currentThreadId: null,
                currentFrameId: null,
                timestamp: this.getCurrentTimestamp(),
                user: this.getCurrentUser(),
                sessionId: this.sessionId,
                performance: {
                    collectionTime: 0,
                    variableCount: 0,
                    complexStructuresFound: 0,
                    expandedVariablesCount: 0,
                    memoryUsage: '0 MB'
                }
            }
        };

        this.setupEventListeners();
    }

    private getCurrentUser(): string {
        return os.userInfo().username || 'unknown-user';
    }

    private getCurrentTimestamp(): string {
        return '2025-06-09 04:02:46';
    }

    private getFormattedTime(): string {
        return new Date().toISOString();
    }

    private generateSessionId(): string {
        return `debug-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private loadVariableConfig(): VariableAnalysisConfig {
        const workspaceConfig = vscode.workspace.getConfiguration('goDebugger.variableAnalysis');
        
        return {
            controlFlowPatterns: workspaceConfig.get('controlFlowPatterns', [
                'err', 'error', 'ok', 'found', 'valid', 'success', 'fail', 'failed',
                'result', 'status', 'state', 'flag', 'enabled', 'disabled', 'response',
                'resp', 'req', 'request', 'ctx', 'context', 'done', 'finished',
                'complete', 'ready', 'active', 'running', 'stopped'
            ]),
            systemVariablePatterns: workspaceConfig.get('systemVariablePatterns', [
                '~', '.', '_internal', '_system', '_runtime', '_debug',
                'autotmp', 'goroutine', 'stack', 'heap', 'gc', 'sync',
                'mutex', 'lock', 'once', 'pool', 'buffer', 'cache'
            ]),
            applicationVariablePatterns: workspaceConfig.get('applicationVariablePatterns', [
                'id', 'name', 'user', 'client', 'data', 'value', 'content',
                'config', 'params', 'handler', 'service', 'manager', 'request',
                'response', 'message', 'body', 'payload', 'result', 'output',
                'input', 'query', 'command', 'event', 'notification'
            ]),
            maxVariableValueLength: workspaceConfig.get('maxVariableValueLength', 1000),
            maxParameterCount: workspaceConfig.get('maxParameterCount', 30),
            enableTypeInference: workspaceConfig.get('enableTypeInference', true),
            enableDeepExpansion: workspaceConfig.get('enableDeepExpansion', true),
            maxExpansionDepth: workspaceConfig.get('maxExpansionDepth', 6),
            memoryLimitMB: workspaceConfig.get('memoryLimitMB', 50)
        };
    }

    private setupEventListeners() {
        this.delveClient.on('attached', () => {
            console.log(`🔗 DelveClient attached - ready for VS Code context at ${this.getCurrentTimestamp()}`);
            this.context.debugInfo.isConnected = true;
            this.context.debugInfo.isStopped = false;
            this.context.debugInfo.timestamp = this.getCurrentTimestamp();
            this.emit('collectionStarted');
        });

        this.delveClient.on('stopped', (eventBody) => {
            console.log(`🛑 Debug stopped - collecting enhanced context at ${this.getCurrentTimestamp()}`);
            this.context.debugInfo.isStopped = true;
            this.context.debugInfo.currentThreadId = eventBody.threadId;
            this.context.debugInfo.currentFrameId = eventBody.frameId;
            this.context.debugInfo.timestamp = this.getCurrentTimestamp();
            this.collectCurrentContext();
        });

        this.delveClient.on('continued', () => {
            console.log(`▶️ Debug continued - clearing context at ${this.getCurrentTimestamp()}`);
            this.context.debugInfo.isStopped = false;
            this.context.debugInfo.currentThreadId = null;
            this.context.debugInfo.currentFrameId = null;
            this.context.debugInfo.timestamp = this.getCurrentTimestamp();
            this.clearContext();
        });

        this.delveClient.on('detached', () => {
            console.log(`🔌 DelveClient detached at ${this.getCurrentTimestamp()}`);
            this.context.debugInfo.isConnected = false;
            this.context.debugInfo.isStopped = false;
            this.context.debugInfo.timestamp = this.getCurrentTimestamp();
            this.clearContext();
            this.emit('collectionStopped');
        });
    }

    private clearContext() {
        this.context.functionCalls = [];
        this.context.variables = [];
        this.context.executionPaths = [];
        this.context.currentLocation = null;
        this.context.symbolicExecution = undefined;
        this.context.pathSensitivity = undefined;
        this.context.debugInfo.totalFrames = 0;
        this.context.debugInfo.totalScopes = 0;
        this.context.debugInfo.currentThreadId = null;
        this.context.debugInfo.currentFrameId = null;
        this.context.debugInfo.performance = {
            collectionTime: 0,
            variableCount: 0,
            complexStructuresFound: 0,
            expandedVariablesCount: 0,
            memoryUsage: '0 MB'
        };
        this.context.debugInfo.timestamp = this.getCurrentTimestamp();
        
        // Clear expansion caches
        this.expandedVariables.clear();
        this.variableExpansionService.clearHistory();
        
        this.emit('contextUpdated', this.context);
    }

    startCollection() {
        this.isCollecting = true;
        console.log(`📊 Enhanced context collection enabled - using VS Code context at ${this.getCurrentTimestamp()}`);
    }

    stopCollection() {
        this.isCollecting = false;
        this.clearContext();
        console.log(`⏹️ Enhanced context collection disabled at ${this.getCurrentTimestamp()}`);
    }

    private async collectCurrentContext() {
        if (!this.delveClient.isStoppedAtBreakpoint()) {
            console.log(`⚠️ Not collecting - debugger not stopped at ${this.getCurrentTimestamp()}`);
            return;
        }

        try {
            console.log(`🎯 Collecting enhanced context using VS Code's thread ${this.delveClient.getCurrentThreadId()} at ${this.getCurrentTimestamp()}`);
            await this.refreshAll();
        } catch (error) {
            console.error(`❌ Error collecting current context at ${this.getCurrentTimestamp()}:`, error);
            this.context.debugInfo.errors.push(`collectCurrentContext: ${error.message}`);
        }
    }

    async refreshAll() {
        if (!this.isCollecting) {
            console.log(`❌ Collection not enabled at ${this.getCurrentTimestamp()}`);
            return;
        }

        if (!this.delveClient.isStoppedAtBreakpoint()) {
            console.log(`❌ Cannot collect - debugger not stopped at ${this.getCurrentTimestamp()}`);
            this.context.debugInfo.errors = ['Debugger must be stopped at a breakpoint'];
            this.emit('contextUpdated', this.context);
            return;
        }

        const collectionStartTime = Date.now();
        this.context.debugInfo.lastCollection = collectionStartTime;
        this.context.debugInfo.timestamp = this.getCurrentTimestamp();
        this.context.debugInfo.errors = [];
        this.context.debugInfo.currentThreadId = this.delveClient.getCurrentThreadId();
        this.context.debugInfo.currentFrameId = this.delveClient.getCurrentFrameId();

        try {
            console.log(`🔄 Starting enhanced context collection with full variable expansion at ${this.getCurrentTimestamp()}`);
            console.log(`📊 Configuration: Deep expansion: ${this.variableConfig.enableDeepExpansion}, Max depth: ${this.variableConfig.maxExpansionDepth}, Memory limit: ${this.variableConfig.memoryLimitMB}MB`);
            
            // Get current frame from VS Code's context
            const currentFrame = await this.delveClient.getCurrentFrame();
            if (currentFrame) {
                this.context.currentLocation = {
                    file: currentFrame.source?.path || '',
                    line: currentFrame.line,
                    function: currentFrame.name
                };
                
                console.log(`📍 Current location from VS Code context at ${this.getCurrentTimestamp()}:`, this.context.currentLocation);
                
                // Enhanced context collection with full variable expansion
                await Promise.all([
                    this.collectFunctionCallsFromVSCode(),
                    this.collectVariablesFromVSCodeWithFullExpansion(),
                    this.collectExecutionPathsFromVSCode()
                ]);

                // Enhanced symbolic execution with expanded variables
                console.log(`🧠 Starting symbolic execution with expanded variables at ${this.getCurrentTimestamp()}`);
                const symbolicStartTime = Date.now();
                
                this.context.symbolicExecution = this.symbolicExecutor.analyzeExecutionContext(
                    this.context.variables,
                    this.context.functionCalls,
                    this.context.currentLocation
                );
                
                const symbolicAnalysisTime = Date.now() - symbolicStartTime;

                // Path sensitivity with enhanced variable context
                console.log(`🛤️ Starting path-sensitivity with enhanced context at ${this.getCurrentTimestamp()}`);
                const pathSensitivityStartTime = Date.now();
                
                this.context.pathSensitivity = this.pathSensitivityAnalyzer.analyzePathSensitivity(
                    this.context.variables,
                    this.context.functionCalls,
                    this.context.currentLocation,
                    this.context.symbolicExecution
                );
                
                const pathSensitivityTime = Date.now() - pathSensitivityStartTime;
                
                // Performance metrics with memory usage
                const collectionTime = Date.now() - collectionStartTime;
                this.context.debugInfo.performance = {
                    collectionTime,
                    variableCount: this.context.variables.length,
                    complexStructuresFound: this.context.variables.filter(v => v.metadata.isExpandable).length,
                    expandedVariablesCount: this.expandedVariables.size,
                    memoryUsage: this.variableExpansionService.getMemoryUsage(),
                    symbolicAnalysisTime,
                    constraintsSolved: this.context.symbolicExecution.performance.constraintsSolved,
                    alternativePathsFound: this.context.symbolicExecution.alternativePaths.length,
                    pathSensitivityTime,
                    pathsAnalyzed: this.context.pathSensitivity.pathAnalysis.exploredPaths,
                    variableExpansionTime: Array.from(this.expandedVariables.values()).reduce((sum, r) => sum + r.expansionTime, 0)
                };
                
                console.log(`✅ Enhanced context collection complete at ${this.getCurrentTimestamp()}:`, {
                    functionCalls: this.context.functionCalls.length,
                    variables: this.context.variables.length,
                    expandedVariables: this.expandedVariables.size,
                    memoryUsage: this.context.debugInfo.performance.memoryUsage,
                    collectionTime: `${collectionTime}ms`,
                    variableExpansionTime: `${this.context.debugInfo.performance.variableExpansionTime}ms`,
                    symbolicAnalysisTime: `${symbolicAnalysisTime}ms`,
                    pathSensitivityTime: `${pathSensitivityTime}ms`,
                    currentLocation: this.context.currentLocation,
                    threadId: this.context.debugInfo.currentThreadId,
                    frameId: this.context.debugInfo.currentFrameId
                });
                
            } else {
                console.log(`⚠️ No current frame available from VS Code context at ${this.getCurrentTimestamp()}`);
                this.context.debugInfo.errors.push('No current frame available from VS Code debug context');
                this.context.currentLocation = {
                    file: '',
                    line: 0,
                    function: 'Unknown Frame'
                };
            }
            
            this.emit('contextUpdated', this.context);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`❌ Error during enhanced context collection at ${this.getCurrentTimestamp()}:`, errorMsg);
            this.context.debugInfo.errors.push(errorMsg);
            this.emit('contextUpdated', this.context);
        }
    }

    private async collectFunctionCallsFromVSCode() {
        const stackTrace = await this.delveClient.getStackTrace();
        this.context.debugInfo.totalFrames = stackTrace.length;
        
        if (stackTrace.length === 0) {
            console.log(`⚠️ No stack trace from VS Code context at ${this.getCurrentTimestamp()}`);
            return;
        }

        const allCalls: FunctionCall[] = [];
        
        console.log(`📊 Processing ${stackTrace.length} frames from VS Code context at ${this.getCurrentTimestamp()}`);

        // Process frames in parallel with enhanced parameter expansion
        const framePromises = stackTrace.slice(0, 20).map(async (frame, index) => {
            try {
                const parameters = await this.delveClient.getFrameVariables(frame.id);
                
                return {
                    id: `frame-${frame.id}`,
                    name: frame.name,
                    file: frame.source?.path || '',
                    line: frame.line,
                    parameters: this.enhancedParameterSimplification(parameters),
                    startTime: Date.now(),
                    children: [] as string[]
                };
            } catch (error) {
                console.log(`⚠️ Could not get variables for frame ${index} at ${this.getCurrentTimestamp()}: ${error.message}`);
                return {
                    id: `frame-${frame.id}`,
                    name: frame.name,
                    file: frame.source?.path || '',
                    line: frame.line,
                    parameters: {},
                    startTime: Date.now(),
                    children: [] as string[]
                };
            }
        });

        const frameResults = await Promise.allSettled(framePromises);
        frameResults.forEach(result => {
            if (result.status === 'fulfilled') {
                allCalls.push(result.value);
            }
        });

        // Build relationships
        for (let i = 0; i < allCalls.length - 1; i++) {
            allCalls[i].parentId = allCalls[i + 1].id;
            allCalls[i + 1].children.push(allCalls[i].id);
        }

        this.context.functionCalls = allCalls;
        console.log(`✅ Collected ${allCalls.length} function calls from VS Code context at ${this.getCurrentTimestamp()}`);
    }

    private async collectVariablesFromVSCodeWithFullExpansion() {
        if (!this.variableConfig.enableDeepExpansion) {
            console.log(`📝 Deep expansion disabled - using standard collection at ${this.getCurrentTimestamp()}`);
            return await this.collectBasicVariablesFromVSCode();
        }

        try {
            const frameId = this.delveClient.getCurrentFrameId();
            if (!frameId) {
                console.log(`⚠️ No frame ID available for enhanced variable expansion at ${this.getCurrentTimestamp()}`);
                return;
            }

            console.log(`🔍 Starting enhanced variable expansion for frame ${frameId} at ${this.getCurrentTimestamp()}`);

            // Get basic scopes first
            const scopes = await this.delveClient.getScopes();
            this.context.debugInfo.totalScopes = scopes.length;
            
            if (scopes.length === 0) {
                console.log(`⚠️ No scopes from VS Code context at ${this.getCurrentTimestamp()}`);
                return;
            }

            const variableExpansionStartTime = Date.now();

            // Expand all variables with full depth
            const expansionResults = await this.variableExpansionService.expandAllVariablesInScope(
                this.delveClient.currentSession,
                frameId,
                this.variableConfig.maxExpansionDepth,
                40  // More variables for comprehensive analysis
            );

            this.expandedVariables = new Map(Object.entries(expansionResults));

            const allVariables: Variable[] = [];
            let complexStructureCount = 0;

            // Process expansion results into our Variable format
            for (const [varName, result] of this.expandedVariables) {
                if (result.success && result.data) {
                    const variable = this.convertExpandedToVariable(varName, result.data, result);
                    allVariables.push(variable);
                    
                    if (variable.metadata.isExpandable) {
                        complexStructureCount++;
                    }
                }
            }

            // Also collect basic variables for any we missed and merge scopes
            const basicVariables = await this.collectBasicVariables(scopes);
            
            // Merge, avoiding duplicates and updating scope information
            const variableMap = new Map<string, Variable>();
            
            // First add expanded variables
            allVariables.forEach(v => variableMap.set(v.name, v));
            
            // Then add basic variables, updating scope info for expanded ones
            basicVariables.forEach(basicVar => {
                if (variableMap.has(basicVar.name)) {
                    // Update scope information for expanded variable
                    const existingVar = variableMap.get(basicVar.name)!;
                    existingVar.scope = basicVar.scope;
                    variableMap.set(basicVar.name, existingVar);
                } else {
                    // Add new basic variable
                    variableMap.set(basicVar.name, basicVar);
                }
            });

            this.context.variables = Array.from(variableMap.values());
            
            console.log(`✅ Enhanced variable collection complete at ${this.getCurrentTimestamp()}:`, {
                totalVariables: this.context.variables.length,
                expandedVariables: this.expandedVariables.size,
                complexStructures: complexStructureCount,
                memoryUsage: this.variableExpansionService.getMemoryUsage(),
                expansionTime: `${Date.now() - variableExpansionStartTime}ms`
            });
            
        } catch (error) {
            console.error(`❌ Error in enhanced variable collection at ${this.getCurrentTimestamp()}:`, error);
            this.context.debugInfo.errors.push(`enhancedVariableCollection: ${error.message}`);
            
            // Fallback to basic collection
            console.log(`🔄 Falling back to basic variable collection at ${this.getCurrentTimestamp()}`);
            await this.collectBasicVariablesFromVSCode();
        }
    }

    private async collectBasicVariablesFromVSCode() {
        try {
            const scopes = await this.delveClient.getScopes();
            this.context.debugInfo.totalScopes = scopes.length;
            
            if (scopes.length === 0) {
                console.log(`⚠️ No scopes from VS Code context at ${this.getCurrentTimestamp()}`);
                return;
            }

            const allVariables = await this.collectBasicVariables(scopes);
            this.context.variables = allVariables;
            
            console.log(`✅ Basic variable collection complete at ${this.getCurrentTimestamp()}: ${allVariables.length} variables`);
            
        } catch (error) {
            console.error(`❌ Error in basic variable collection at ${this.getCurrentTimestamp()}:`, error);
            this.context.debugInfo.errors.push(`basicVariableCollection: ${error.message}`);
        }
    }

    private convertExpandedToVariable(name: string, expanded: SimplifiedValue, result: ExpansionResult): Variable {
        // Convert our expanded format to the Variable interface
        const displayValue = this.createDisplayValueFromExpanded(expanded);
        
        return {
            name,
            value: displayValue,
            type: expanded.originalType,
            scope: 'Local', // Will be updated when we merge with basic variables
            isControlFlow: this.isControlFlowVariable(name),
            isApplicationRelevant: this.isApplicationRelevantVariable(name, displayValue),
            changeHistory: [],
            dependencies: this.extractDependencies(expanded),
            metadata: {
                isPointer: expanded.metadata.isPointer,
                isNil: expanded.metadata.isNil,
                memoryAddress: expanded.metadata.memoryAddress,
                arrayLength: expanded.metadata.arrayLength,
                objectKeyCount: expanded.metadata.objectKeyCount,
                truncatedAt: expanded.metadata.truncatedAt,
                isExpandable: expanded.hasMore || !!expanded.children,
                rawValue: expanded.children ? JSON.stringify(expanded.children, null, 2) : expanded.displayValue,
                expansionDepth: this.calculateExpansionDepth(expanded),
                memoryUsage: result.memoryUsed
            }
        };
    }

    private extractDependencies(expanded: SimplifiedValue): string[] {
        const dependencies: string[] = [];
        
        if (expanded.children) {
            Object.keys(expanded.children).forEach(key => {
                // Extract variable names that this variable depends on
                if (key.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
                    dependencies.push(key);
                }
            });
        }
        
        return dependencies.slice(0, 10); // Limit dependencies
    }

    private calculateExpansionDepth(expanded: SimplifiedValue, currentDepth: number = 0): number {
        if (!expanded.children || Object.keys(expanded.children).length === 0) {
            return currentDepth;
        }
        
        let maxChildDepth = currentDepth;
        Object.values(expanded.children).forEach(child => {
            const childDepth = this.calculateExpansionDepth(child, currentDepth + 1);
            maxChildDepth = Math.max(maxChildDepth, childDepth);
        });
        
        return maxChildDepth;
    }

    private createDisplayValueFromExpanded(expanded: SimplifiedValue): string {
        if (!expanded.children || Object.keys(expanded.children).length === 0) {
            return expanded.displayValue;
        }

        // Create a readable representation of the expanded structure
        const entries = Object.entries(expanded.children).slice(0, 8);
        const preview = entries.map(([key, value]) => {
            let shortValue = value.displayValue;
            
            // Smart truncation based on content type
            if (shortValue.length > 80) {
                if (shortValue.includes('{') || shortValue.includes('[')) {
                    // For structured data, show just the type and size
                    shortValue = `${value.originalType}${value.metadata.objectKeyCount ? ` (${value.metadata.objectKeyCount} fields)` : ''}`;
                } else {
                    shortValue = shortValue.substring(0, 80) + '...';
                }
            }
            
            return `${key}: ${shortValue}`;
        }).join(', ');

        const hasMore = Object.keys(expanded.children).length > 8 ? '...' : '';
        const objectInfo = expanded.metadata.objectKeyCount ? ` (${expanded.metadata.objectKeyCount} fields)` : '';
        
        return `{${preview}${hasMore}}${objectInfo}`;
    }

    private async collectBasicVariables(scopes: any[]): Promise<Variable[]> {
        const basicVariables: Variable[] = [];

        for (const scope of scopes) {
            try {
                const scopeVars = await this.delveClient.getScopeVariables(scope.variablesReference);
                
                scopeVars.forEach(variable => {
                    const simplified = this.smartSimplifyVariable(variable, scope.name);
                    
                    basicVariables.push({
                        name: variable.name,
                        value: simplified.displayValue,
                        type: variable.type,
                        scope: scope.name,
                        isControlFlow: this.isControlFlowVariable(variable.name),
                        isApplicationRelevant: this.isApplicationRelevantVariable(variable.name, variable.value),
                        changeHistory: [],
                        dependencies: [],
                        metadata: {
                            isPointer: simplified.metadata.isPointer,
                            isNil: simplified.metadata.isNil,
                            memoryAddress: simplified.metadata.memoryAddress,
                            arrayLength: simplified.metadata.arrayLength,
                            objectKeyCount: simplified.metadata.objectKeyCount,
                            truncatedAt: simplified.metadata.truncatedAt,
                            isExpandable: simplified.hasMore,
                            rawValue: variable.value
                        }
                    });
                });
            } catch (error) {
                console.log(`⚠️ Error getting basic variables for scope ${scope.name}: ${error.message}`);
            }
        }

        return basicVariables;
    }

    private async collectExecutionPathsFromVSCode() {
        const paths: ExecutionPath[] = [];

        for (const call of this.context.functionCalls.slice(0, 10)) {
            const path: ExecutionPath = {
                id: `path-${call.id}`,
                functionName: call.name,
                conditions: [],
                branches: [],
                variables: this.context.variables
                    .filter(v => (v.scope === 'Local' || v.scope === 'Arguments') && v.isApplicationRelevant)
                    .slice(0, 25)
                    .map(v => v.name)
            };
            paths.push(path);
        }

        this.context.executionPaths = paths;
        console.log(`✅ Created ${paths.length} execution paths from VS Code context at ${this.getCurrentTimestamp()}`);
    }

    // Enhanced parameter simplification with smart data structure handling
    private enhancedParameterSimplification(params: Record<string, any>): Record<string, any> {
        const simplified: Record<string, any> = {};
        let count = 0;

        const applicationFields = this.detectApplicationFields(params);
        const simplificationOptions: Partial<SimplificationOptions> = {
            maxDepth: 4,
            maxArrayLength: 8,
            maxStringLength: this.variableConfig.maxVariableValueLength,
            maxObjectKeys: 12,
            showPointerAddresses: false,
            preserveBusinessFields: applicationFields,
            expandKnownTypes: ['Context', 'Request', 'Response', 'User', 'Config', 'Handler', 'Service', 'Manager']
        };

        // Prioritize application-relevant parameters
        const sortedParams = this.prioritizeParameters(params, applicationFields);

        for (const [key, value] of Object.entries(sortedParams)) {
            if (count >= this.variableConfig.maxParameterCount) break;
            
            simplified[key] = this.smartSimplifyParameterValue(key, value, simplificationOptions);
            count++;
        }

        return simplified;
    }

    private smartSimplifyVariable(variable: any, scopeName: string): SimplifiedValue {
        const typeName = this.inferSmartType(variable.name, variable.value, variable.type);
        
        const options: Partial<SimplificationOptions> = {
            maxDepth: scopeName === 'Local' ? 5 : 3,
            maxArrayLength: 10,
            maxStringLength: this.variableConfig.maxVariableValueLength,
            maxObjectKeys: 15,
            showPointerAddresses: false,
            preserveBusinessFields: this.getContextualApplicationFields(variable.name),
            expandKnownTypes: ['Context', 'Request', 'Response', 'Handler', 'User', 'Service', 'Manager']
        };

        return this.dataHandler.simplifyValue(variable.value, typeName, options);
    }

    private smartSimplifyParameterValue(
        key: string, 
        rawValue: any, 
        options: Partial<SimplificationOptions>
    ): string {
        if (rawValue === null || rawValue === undefined) {
            return String(rawValue);
        }

        const rawString = String(rawValue);
        const typeName = this.inferSmartType(key, rawString, 'unknown');
        
        // Use enhanced data structure handler for complex types
        if (this.isComplexDataStructure(rawString)) {
            const simplified = this.dataHandler.simplifyValue(rawString, typeName, options);
            return this.convertToDisplayFormat(simplified);
        }

        // Handle simple values with context-aware truncation
        return this.contextAwareSimpleValue(key, rawString);
    }

    private detectApplicationFields(params: Record<string, any>): string[] {
        const keys = Object.keys(params);
        const applicationFields: string[] = [];

        // Use configured application variable patterns
        keys.forEach(key => {
            const keyLower = key.toLowerCase();
            if (this.variableConfig.applicationVariablePatterns.some(pattern => 
                keyLower.includes(pattern) || 
                pattern.includes(keyLower) ||
                keyLower.endsWith(pattern)
            )) {
                applicationFields.push(key);
            }
        });

        return applicationFields;
    }

    private prioritizeParameters(
        params: Record<string, any>,
        applicationFields: string[]
    ): Record<string, any> {
        const prioritized: Record<string, any> = {};
        
        // First: critical application fields
        applicationFields.forEach(field => {
            if (field in params) {
                prioritized[field] = params[field];
            }
        });

        // Second: remaining fields sorted by importance
        const remainingEntries = Object.entries(params)
            .filter(([key]) => !(key in prioritized))
            .sort(([a], [b]) => {
                const aScore = this.calculateFieldImportance(a);
                const bScore = this.calculateFieldImportance(b);
                return bScore - aScore;
            });

        remainingEntries.forEach(([key, value]) => {
            prioritized[key] = value;
        });

        return prioritized;
    }

    private calculateFieldImportance(fieldName: string): number {
        let score = 0;
        const nameLower = fieldName.toLowerCase();
        
        // High importance patterns
        const highPatterns = ['data', 'request', 'response', 'result', 'error', 'id', 'name'];
        if (highPatterns.some(p => nameLower.includes(p))) score += 100;
        
        // Medium importance patterns
        const mediumPatterns = ['context', 'config', 'params', 'value', 'message'];
        if (mediumPatterns.some(p => nameLower.includes(p))) score += 50;
        
        // Low importance patterns (negative score)
        const lowPatterns = ['internal', 'temp', 'debug', 'cache'];
        if (lowPatterns.some(p => nameLower.includes(p))) score -= 50;
        
        return score;
    }

    private inferSmartType(key: string, value: string, originalType: string): string {
        if (!this.variableConfig.enableTypeInference) {
            return originalType || 'interface{}';
        }

        const keyLower = key.toLowerCase();
        
        // Generic type inference patterns
        if (keyLower.includes('time') || keyLower.includes('date') || keyLower.includes('timestamp')) {
            return 'time.Time';
        }
        if (keyLower.includes('id') && /^\d+$/.test(value)) return 'int64';
        if (keyLower.includes('count') || keyLower.includes('total') || keyLower.includes('quantity')) {
            return 'int';
        }
        if (keyLower.includes('price') || keyLower.includes('amount') || keyLower.includes('cost') || keyLower.includes('value')) {
            return 'float64';
        }
        if (keyLower.includes('flag') || keyLower.includes('enabled') || keyLower.includes('valid')) {
            return 'bool';
        }
        if (keyLower.includes('email') || keyLower.includes('url') || keyLower.includes('address')) {
            return 'string';
        }
        if (keyLower.includes('config') || keyLower.includes('settings') || keyLower.includes('options')) {
            return 'Config';
        }
        if (keyLower.includes('request') || keyLower === 'req') return 'Request';
        if (keyLower.includes('response') || keyLower === 'resp') return 'Response';
        if (keyLower.includes('context') || keyLower === 'ctx') return 'Context';
        if (keyLower.includes('user') || keyLower.includes('account')) return 'User';
        if (keyLower.includes('handler')) return 'Handler';
        if (keyLower.includes('service')) return 'Service';
        if (keyLower.includes('manager')) return 'Manager';
        
        // Use original type if available and meaningful
        if (originalType && originalType !== 'unknown' && !originalType.includes('interface{}')) {
            return originalType;
        }
        
        // Value-based inference
        if (value.startsWith('*')) return '*struct';
        if (value.includes('{') && value.includes('}')) return 'struct';
        if (value.startsWith('[') && value.endsWith(']')) return 'slice';
        if (value.includes('0x')) return 'pointer';
        
        return 'interface{}';
    }

    private getContextualApplicationFields(variableName: string): string[] {
        const base = ['id', 'name', 'value', 'data', 'status', 'type'];
        const varLower = variableName.toLowerCase();
        
        // Add contextual fields based on variable name
        if (varLower.includes('user')) {
            base.push('email', 'username', 'account', 'profile');
        }
        if (varLower.includes('request') || varLower.includes('req')) {
            base.push('method', 'url', 'headers', 'body', 'params');
        }
        if (varLower.includes('response') || varLower.includes('resp')) {
            base.push('code', 'message', 'headers', 'body');
        }
        if (varLower.includes('config')) {
            base.push('host', 'port', 'timeout', 'enabled');
        }
        
        return base;
    }

    private isComplexDataStructure(value: string): boolean {
        return (
            value.includes('{') ||
            value.includes('[') ||
            value.includes('*{') ||
            value.includes('0x') ||
            value.length > 300 ||
            (value.includes(':') && value.includes(',') && value.length > 50) ||
            value.match(/\w+\s*\{.*\}/s) !== null
        );
    }

    private convertToDisplayFormat(simplified: SimplifiedValue): string {
        if (typeof simplified === 'string') {
            return simplified;
        }

        let display = simplified.displayValue || String(simplified);
        
        // Add helpful metadata
        if (simplified.metadata?.arrayLength !== undefined) {
            display += ` (${simplified.metadata.arrayLength} items)`;
        }
        
        if (simplified.metadata?.objectKeyCount !== undefined) {
            display += ` (${simplified.metadata.objectKeyCount} fields)`;
        }
        
        if (simplified.hasMore) {
            display += ' [expandable]';
        }
        
        if (simplified.metadata?.isPointer && !simplified.metadata?.memoryAddress) {
            display = `→ ${display}`;
        }
        
        return display;
    }

    private contextAwareSimpleValue(key: string, value: string): string {
        // Context-aware truncation based on key importance
        const keyLower = key.toLowerCase();
        let maxLength = this.variableConfig.maxVariableValueLength;
        
        // Important fields get more space
        if (this.variableConfig.applicationVariablePatterns.some(pattern => 
            keyLower.includes(pattern))) {
            maxLength = Math.min(maxLength * 1.5, 1500);
        }
        
        // System fields get less space
        if (this.variableConfig.systemVariablePatterns.some(pattern => 
            key.startsWith(pattern) || keyLower.includes(pattern))) {
            maxLength = Math.min(maxLength * 0.5, 200);
        }
        
        if (value.length > maxLength) {
            return value.substring(0, maxLength) + '... [truncated]';
        }
        
        return value;
    }

    private isControlFlowVariable(varName: string): boolean {
        const nameLower = varName.toLowerCase();
        return this.variableConfig.controlFlowPatterns.some(pattern => 
            nameLower.includes(pattern));
    }

    private isApplicationRelevantVariable(varName: string, value: string): boolean {
        // Exclude system/internal variables
        if (this.variableConfig.systemVariablePatterns.some(pattern => 
            varName.startsWith(pattern) || varName.includes(pattern))) {
            return false;
        }
        
        const nameLower = varName.toLowerCase();
        
        // Check if variable name contains application keywords
        const hasApplicationKeyword = this.variableConfig.applicationVariablePatterns.some(keyword => 
            nameLower.includes(keyword) || keyword.includes(nameLower)
        );
        
        // Check if it's a meaningful value (not just pointers or internal stuff)
        const hasMeaningfulValue = value && 
            !value.includes('0x') && 
            value !== 'nil' && 
            value.length > 1;
        
        return hasApplicationKeyword || hasMeaningfulValue;
    }

    // Enhanced variable expansion method for specific variables
    async expandSpecificVariable(variableName: string, maxDepth: number = 6): Promise<SimplifiedValue | null> {
        const frameId = this.delveClient.getCurrentFrameId();
        if (!frameId) {
            console.log(`❌ No frame ID available for expanding ${variableName}`);
            return null;
        }

        console.log(`🔍 Expanding specific variable: ${variableName} with depth ${maxDepth} at ${this.getCurrentTimestamp()}`);

        const result = await this.variableExpansionService.expandVariable(
            this.delveClient.currentSession,
            frameId,
            variableName,
            maxDepth
        );

        if (result.success && result.data) {
            console.log(`✅ Successfully expanded ${variableName} in ${result.expansionTime}ms, memory: ${result.memoryUsed}`);
            return result.data;
        } else {
            console.error(`❌ Failed to expand ${variableName}: ${result.error}`);
            return null;
        }
    }

    // Enhanced search with better filtering
    searchVariables(query: string): Variable[] {
        const lowerQuery = query.toLowerCase();
        return this.context.variables.filter(v => 
            v.name.toLowerCase().includes(lowerQuery) ||
            v.value.toString().toLowerCase().includes(lowerQuery) ||
            v.type.toLowerCase().includes(lowerQuery)
        );
    }

    getApplicationVariables(): Variable[] {
        return this.context.variables.filter(v => v.isApplicationRelevant);
    }

    getSystemVariables(): Variable[] {
        return this.context.variables.filter(v => !v.isApplicationRelevant);
    }

    getControlFlowVariables(): Variable[] {
        return this.context.variables.filter(v => v.isControlFlow);
    }

    getComplexVariables(): Variable[] {
        return this.context.variables.filter(v => v.metadata.isExpandable);
    }

    getVariablesWithHistory(): Variable[] {
        return this.context.variables.filter(v => v.changeHistory.length > 0);
    }

    getExpandedVariables(): Map<string, ExpansionResult> {
        return this.expandedVariables;
    }

    expandVariable(variableName: string): SimplifiedValue | null {
        const variable = this.context.variables.find(v => v.name === variableName);
        if (!variable || !variable.metadata.rawValue) {
            return null;
        }

        const options: Partial<SimplificationOptions> = {
            maxDepth: 8,
            maxArrayLength: 20,
            maxStringLength: 2000,
            maxObjectKeys: 30,
            showPointerAddresses: true,
            preserveBusinessFields: this.getContextualApplicationFields(variableName)
        };

        return this.dataHandler.simplifyValue(variable.metadata.rawValue, variable.type, options);
    }

    // Get symbolic execution summary for AI
    getSymbolicExecutionSummary(): string {
        if (!this.context.symbolicExecution) {
            return 'No symbolic execution analysis available';
        }

        const se = this.context.symbolicExecution;
        
        return `## 🧠 Symbolic Execution Analysis (Enhanced Context)

**Current Execution Context:**
- Thread ID: ${this.context.debugInfo.currentThreadId}
- Frame ID: ${this.context.debugInfo.currentFrameId}
- Function: ${se.currentPath.currentLocation.function}
- Path Probability: ${(se.currentPath.pathProbability * 100).toFixed(1)}%
- Constraints: ${se.currentPath.pathConstraints.length} active
- Branches Taken: ${se.currentPath.branchesTaken.length}

**Enhanced Variable Context:**
- Total Variables: ${this.context.variables.length}
- Expanded Variables: ${this.expandedVariables.size}
- Memory Usage: ${this.context.debugInfo.performance.memoryUsage}

**Path Constraints:**
${se.currentPath.pathConstraints.map(c => `- ${c.expression} (${c.isSatisfied ? '✅' : '❌'})`).join('\n')}

**Symbolic Variables:**
${se.symbolicVariables.map(v => `- ${v.name}: ${v.symbolicValue}`).join('\n')}

**Alternative Execution Paths (${se.alternativePaths.length}):**
${se.alternativePaths.map(alt => `- ${alt.description} (${alt.probability} probability)`).join('\n')}

**Root Cause Analysis:**
${se.executionSummary.rootCauseAnalysis.primaryCause.description}

**Potential Issues Found (${se.executionSummary.potentialIssues.length}):**
${se.executionSummary.potentialIssues.map(issue => `- ${issue.type}: ${issue.description} (${issue.severity})`).join('\n')}

**Performance:**
- Analysis Time: ${se.performance.analysisTime}ms
- Constraints Solved: ${se.performance.constraintsSolved}
- Paths Explored: ${se.performance.pathsExplored}
`;
    }

    // Get path sensitivity summary for AI
    getPathSensitivitySummary(): string {
        if (!this.context.pathSensitivity) {
            return 'No path sensitivity analysis available';
        }

        const ps = this.context.pathSensitivity;
        
        return `## 🛤️ Path-Sensitivity Analysis (Enhanced Context)

**Current Execution Path**: ${ps.currentPath.slice(-3).join(' → ')}
**Paths Analyzed**: ${ps.pathAnalysis.exploredPaths} / ${ps.pathAnalysis.totalPaths} (${(ps.pathAnalysis.pathCoverage * 100).toFixed(1)}% coverage)
**Branching Complexity**: ${ps.sensitivityMetrics.branchingComplexity.toFixed(1)}
**High-Sensitivity Variables**: ${ps.sensitivityMetrics.highSensitivityVariables.length}

**Enhanced Context:**
- Thread: ${this.context.debugInfo.currentThreadId}
- Frame: ${this.context.debugInfo.currentFrameId}
- Expanded Variables: ${this.expandedVariables.size}
- Memory Usage: ${this.context.debugInfo.performance.memoryUsage}

**Path-Sensitive Variables**:
${ps.pathSensitiveVariables.map(v => `- ${v.name}: ${(v.sensitivityScore * 100).toFixed(1)}% path-dependent (${v.pathSpecificStates.length} states)`).join('\n')}

**Critical Execution Paths (${ps.pathAnalysis.criticalPaths.length})**:
${ps.pathAnalysis.criticalPaths.map(cp => `- ${cp.description} (${cp.riskLevel} risk, ${(cp.probability * 100).toFixed(1)}% probability)`).join('\n')}

**Path Convergence Issues**:
${ps.pathSensitiveVariables.filter(v => v.convergencePoints.some(cp => cp.potentialConflicts.length > 0)).map(v => 
    `- ${v.name}: ${v.convergencePoints.reduce((sum, cp) => sum + cp.potentialConflicts.length, 0)} conflicts at convergence points`
).join('\n')}

**Recommendations (${ps.recommendations.length})**:
${ps.recommendations.map(r => `- ${r.type}: ${r.description} (${r.priority} priority)`).join('\n')}

**Performance**:
- Analysis Time: ${ps.performance.analysisTime}ms
- Paths Analyzed: ${ps.performance.pathsAnalyzed}
- Nodes Created: ${ps.performance.nodesCreated}
`;
    }

    getVariableExpansionSummary(): string {
        const memoryUsage = this.variableExpansionService.getMemoryUsage();
        const expandedCount = this.expandedVariables.size;
        const successfulExpansions = Array.from(this.expandedVariables.values()).filter(r => r.success).length;

        return `## 🔍 Variable Expansion Summary

**Enhanced Context Collection**: ${this.getCurrentTimestamp()}
**User**: ${this.getCurrentUser()}
**Session**: ${this.sessionId}

**Expansion Configuration**:
- Deep Expansion: ${this.variableConfig.enableDeepExpansion ? 'Enabled' : 'Disabled'}
- Max Depth: ${this.variableConfig.maxExpansionDepth}
- Memory Limit: ${this.variableConfig.memoryLimitMB}MB

**Expansion Results**:
- Total Variables Processed: ${expandedCount}
- Successful Expansions: ${successfulExpansions}
- Memory Usage: ${memoryUsage}
- Complex Structures Found: ${this.context.variables.filter(v => v.metadata.isExpandable).length}
- Variable Expansion Time: ${this.context.debugInfo.performance.variableExpansionTime || 0}ms

**Variable Details**:
${Array.from(this.expandedVariables.entries()).slice(0, 10).map(([name, result]) => 
    `- ${name}: ${result.success ? '✅' : '❌'} (${result.expansionTime}ms)${result.success ? ` - ${result.memoryUsed}` : ` - ${result.error}`}`
).join('\n')}

**Business-Agnostic Analysis**:
- Application-Relevant Variables: ${this.getApplicationVariables().length}
- Control Flow Variables: ${this.getControlFlowVariables().length}
- Expandable Structures: ${this.getComplexVariables().length}
- System Variables: ${this.getSystemVariables().length}
`;
    }

    getContext(): ContextData {
        return { 
            ...this.context,
            debugInfo: {
                ...this.context.debugInfo,
                timestamp: this.getCurrentTimestamp(),
                user: this.getCurrentUser(),
                currentThreadId: this.delveClient.getCurrentThreadId(),
                currentFrameId: this.delveClient.getCurrentFrameId()
            }
        };
    }

    getPerformanceMetrics() {
        return {
            sessionId: this.sessionId,
            user: this.getCurrentUser(),
            timestamp: this.getCurrentTimestamp(),
            ...this.context.debugInfo.performance,
            expandedVariablesDetails: Array.from(this.expandedVariables.entries()).map(([name, result]) => ({
                name,
                success: result.success,
                expansionTime: result.expansionTime,
                memoryUsed: result.memoryUsed,
                error: result.error
            }))
        };
    }

    getVariableConfig(): VariableAnalysisConfig {
        return { ...this.variableConfig };
    }

    updateVariableConfig(newConfig: Partial<VariableAnalysisConfig>): void {
        this.variableConfig = { ...this.variableConfig, ...newConfig };
        console.log(`🔧 ContextCollector: Variable configuration updated at ${this.getCurrentTimestamp()}`);
    }

    dispose() {
        this.stopCollection();
        this.dataHandler = null as any;
        this.variableExpansionService?.clearHistory();
        this.expandedVariables.clear();
        this.symbolicExecutor?.dispose();
        this.pathSensitivityAnalyzer?.dispose();
        this.removeAllListeners();
    }
}