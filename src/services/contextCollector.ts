import * as vscode from 'vscode';
import * as os from 'os';
import { EventEmitter } from 'events';
import { DelveClient } from './delveClient';
import { DataStructureHandler, SimplificationOptions, SimplifiedValue } from './dataStructureHandler';
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
        threadId: number | null;
        timestamp: string;
        user: string;
        sessionId: string;
        performance: {
            collectionTime: number;
            variableCount: number;
            complexStructuresFound: number;
            symbolicAnalysisTime?: number;
            constraintsSolved?: number;
            alternativePathsFound?: number;
            pathSensitivityTime?: number;
            pathsAnalyzed?: number;
        };
    };
}

export class ContextCollector extends EventEmitter {
    private delveClient: DelveClient;
    private context: ContextData;
    private isCollecting = false;
    private dataHandler: DataStructureHandler;
    private symbolicExecutor: SymbolicExecutor;
    private pathSensitivityAnalyzer: PathSensitivityAnalyzer;
    private variableConfig: VariableAnalysisConfig;
    
    // Optimization: Debounced collection
    private collectionTimeout: NodeJS.Timeout | null = null;
    private lastCollectionTime = 0;
    private minCollectionInterval = 300;
    private sessionId: string;

    constructor(delveClient: DelveClient) {
        super();
        this.delveClient = delveClient;
        this.dataHandler = new DataStructureHandler();
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
                threadId: null,
                timestamp: this.getCurrentTimestamp(),
                user: this.getCurrentUser(),
                sessionId: this.sessionId,
                performance: {
                    collectionTime: 0,
                    variableCount: 0,
                    complexStructuresFound: 0
                }
            }
        };

        this.setupEventListeners();
    }

    private getCurrentUser(): string {
        try {
            return os.userInfo().username || 'unknown-user';
        } catch (error) {
            return 'unknown-user';
        }
    }

    private getCurrentTimestamp(): string {
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
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
                'result', 'status', 'state', 'flag', 'enabled', 'disabled',
                'response', 'resp', 'req', 'request', 'ctx', 'context',
                'done', 'finished', 'complete', 'ready', 'active', 'running'
            ]),
            systemVariablePatterns: workspaceConfig.get('systemVariablePatterns', [
                '~', '.', '_internal', '_system', '_runtime', '_debug',
                'autotmp', 'goroutine', 'stack', 'heap', 'gc'
            ]),
            applicationVariablePatterns: workspaceConfig.get('applicationVariablePatterns', [
                'id', 'name', 'user', 'client', 'customer', 'account',
                'data', 'value', 'content', 'payload', 'body', 'message',
                'config', 'settings', 'params', 'options', 'args',
                'handler', 'service', 'manager', 'processor', 'worker'
            ]),
            maxVariableValueLength: workspaceConfig.get('maxVariableValueLength', 500),
            maxParameterCount: workspaceConfig.get('maxParameterCount', 25),
            enableTypeInference: workspaceConfig.get('enableTypeInference', true)
        };
    }

    private setupEventListeners() {
        this.delveClient.on('attached', () => {
            console.log(`🔗 DelveClient attached - ready for debugging at ${this.getCurrentTimestamp()}`);
            this.context.debugInfo.isConnected = true;
            this.context.debugInfo.isStopped = false;
            this.context.debugInfo.timestamp = this.getCurrentTimestamp();
            this.emit('collectionStarted');
        });

        this.delveClient.on('stopped', (eventBody) => {
            console.log(`🛑 Debug stopped - initiating enhanced context collection at ${this.getCurrentTimestamp()}`);
            this.context.debugInfo.isStopped = true;
            this.context.debugInfo.threadId = eventBody.threadId;
            this.context.debugInfo.timestamp = this.getCurrentTimestamp();
            this.debouncedCollectCurrentContext();
        });

        this.delveClient.on('continued', () => {
            console.log(`▶️ Debug continued - clearing context at ${this.getCurrentTimestamp()}`);
            this.context.debugInfo.isStopped = false;
            this.context.debugInfo.threadId = null;
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
        this.context.debugInfo.performance = {
            collectionTime: 0,
            variableCount: 0,
            complexStructuresFound: 0
        };
        this.context.debugInfo.timestamp = this.getCurrentTimestamp();
        this.emit('contextUpdated', this.context);
    }

    startCollection() {
        this.isCollecting = true;
        console.log(`📊 Enhanced context collection enabled at ${this.getCurrentTimestamp()}`);
    }

    stopCollection() {
        this.isCollecting = false;
        if (this.collectionTimeout) {
            clearTimeout(this.collectionTimeout);
            this.collectionTimeout = null;
        }
        this.clearContext();
        console.log(`⏹️ Enhanced context collection disabled at ${this.getCurrentTimestamp()}`);
    }

    private debouncedCollectCurrentContext() {
        if (this.collectionTimeout) {
            clearTimeout(this.collectionTimeout);
        }

        const now = Date.now();
        const timeSinceLastCollection = now - this.lastCollectionTime;
        
        if (timeSinceLastCollection < this.minCollectionInterval) {
            this.collectionTimeout = setTimeout(() => {
                this.collectCurrentContext();
            }, this.minCollectionInterval - timeSinceLastCollection);
        } else {
            this.collectCurrentContext();
        }
    }

    async refreshAll() {
        if (!this.isCollecting) {
            console.log(`❌ Collection not enabled at ${this.getCurrentTimestamp()}`);
            return;
        }

        if (!this.delveClient.isStoppedAtBreakpoint()) {
            console.log(`❌ Cannot collect - debugger not stopped at breakpoint at ${this.getCurrentTimestamp()}`);
            this.context.debugInfo.errors = ['Debugger must be stopped at a breakpoint'];
            this.emit('contextUpdated', this.context);
            return;
        }

        const collectionStartTime = Date.now();
        const now = Date.now();
        this.context.debugInfo.lastCollection = now;
        this.context.debugInfo.timestamp = this.getCurrentTimestamp();
        this.context.debugInfo.errors = [];
        this.lastCollectionTime = now;

        try {
            console.log(`🔄 Starting enhanced context collection with symbolic execution and path sensitivity at ${this.getCurrentTimestamp()}...`);
            
            // Get current location first
            const currentFrame = await this.delveClient.getCurrentFrame();
            if (currentFrame) {
                this.context.currentLocation = {
                    file: currentFrame.source?.path || '',
                    line: currentFrame.line,
                    function: currentFrame.name
                };
                console.log(`📍 Current location at ${this.getCurrentTimestamp()}:`, this.context.currentLocation);
                
                // Parallel collection for better performance
                await Promise.all([
                    this.collectFunctionCalls(),
                    this.collectVariablesWithSmartHandling(),
                    this.collectExecutionPaths()
                ]);

                // Symbolic execution analysis
                console.log(`🧠 Starting symbolic execution analysis at ${this.getCurrentTimestamp()}...`);
                const symbolicStartTime = Date.now();
                
                this.context.symbolicExecution = this.symbolicExecutor.analyzeExecutionContext(
                    this.context.variables,
                    this.context.functionCalls,
                    this.context.currentLocation
                );
                
                const symbolicAnalysisTime = Date.now() - symbolicStartTime;

                // Path sensitivity analysis
                console.log(`🛤️ Starting path-sensitivity analysis at ${this.getCurrentTimestamp()}...`);
                const pathSensitivityStartTime = Date.now();
                
                this.context.pathSensitivity = this.pathSensitivityAnalyzer.analyzePathSensitivity(
                    this.context.variables,
                    this.context.functionCalls,
                    this.context.currentLocation,
                    this.context.symbolicExecution
                );
                
                const pathSensitivityTime = Date.now() - pathSensitivityStartTime;
                
                // Calculate performance metrics
                const collectionTime = Date.now() - collectionStartTime;
                this.context.debugInfo.performance = {
                    collectionTime,
                    variableCount: this.context.variables.length,
                    complexStructuresFound: this.context.variables.filter(v => v.metadata.isExpandable).length,
                    symbolicAnalysisTime,
                    constraintsSolved: this.context.symbolicExecution.performance.constraintsSolved,
                    alternativePathsFound: this.context.symbolicExecution.alternativePaths.length,
                    pathSensitivityTime,
                    pathsAnalyzed: this.context.pathSensitivity.pathAnalysis.exploredPaths
                };
                
                console.log(`✅ Enhanced context collection with symbolic execution and path sensitivity complete at ${this.getCurrentTimestamp()}:`, {
                    functionCalls: this.context.functionCalls.length,
                    variables: this.context.variables.length,
                    complexStructures: this.context.debugInfo.performance.complexStructuresFound,
                    collectionTime: `${collectionTime}ms`,
                    symbolicAnalysisTime: `${symbolicAnalysisTime}ms`,
                    pathSensitivityTime: `${pathSensitivityTime}ms`,
                    pathsAnalyzed: this.context.pathSensitivity.pathAnalysis.exploredPaths,
                    constraints: this.context.symbolicExecution.performance.constraintsSolved,
                    alternativePaths: this.context.symbolicExecution.alternativePaths.length,
                    currentLocation: this.context.currentLocation,
                    user: this.getCurrentUser()
                });
            } else {
                console.log(`⚠️ No application logic frame found - limited context available at ${this.getCurrentTimestamp()}`);
                this.context.debugInfo.errors.push('Debugger stopped in infrastructure code. Set breakpoint in application handler and trigger execution.');
                this.context.currentLocation = {
                    file: '',
                    line: 0,
                    function: 'Infrastructure Code (Not Application Logic)'
                };
            }
            
            this.emit('contextUpdated', this.context);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`❌ Error during context collection at ${this.getCurrentTimestamp()}:`, errorMsg);
            this.context.debugInfo.errors.push(errorMsg);
            this.emit('contextUpdated', this.context);
        }
    }

    private async collectCurrentContext() {
        if (!this.delveClient.isStoppedAtBreakpoint()) {
            console.log(`⚠️ Not collecting - debugger not stopped at ${this.getCurrentTimestamp()}`);
            return;
        }

        try {
            console.log(`🎯 Collecting enhanced context at breakpoint at ${this.getCurrentTimestamp()}...`);
            await this.refreshAll();
        } catch (error) {
            console.error(`❌ Error collecting current context at ${this.getCurrentTimestamp()}:`, error);
            this.context.debugInfo.errors.push(`collectCurrentContext: ${error.message}`);
        }
    }

    private async collectFunctionCalls() {
        const currentFrame = await this.delveClient.getCurrentFrame();
        if (!currentFrame) {
            console.log(`⚠️ No application logic frame - skipping function call collection at ${this.getCurrentTimestamp()}`);
            return;
        }

        try {
            const stackTrace = await this.delveClient.getStackTrace();
            this.context.debugInfo.totalFrames = stackTrace.length;
            
            if (stackTrace.length === 0) {
                console.log(`⚠️ No stack trace available at ${this.getCurrentTimestamp()}`);
                return;
            }

            const allCalls: FunctionCall[] = [];
            
            // Enhanced application logic detection - domain independent
            const applicationFrames = stackTrace.filter(frame => {
                return this.isApplicationLogicFrame(frame);
            }).slice(0, 15);
            
            console.log(`📊 Processing ${applicationFrames.length} application logic frames (filtered from ${stackTrace.length} total) at ${this.getCurrentTimestamp()}`);

            // Parallel frame variable collection with enhanced handling
            const framePromises = applicationFrames.map(async (frame, index) => {
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
            console.log(`✅ Collected ${allCalls.length} application logic function calls at ${this.getCurrentTimestamp()}`);
            
        } catch (error) {
            console.error(`❌ Error collecting function calls at ${this.getCurrentTimestamp()}:`, error);
            this.context.debugInfo.errors.push(`collectFunctionCalls: ${error.message}`);
        }
    }

    private isApplicationLogicFrame(frame: any): boolean {
        const framePath = frame.source?.path || '';
        const frameName = frame.name || '';
        
        // Get DelveClient configuration for consistency
        const delveConfig = this.delveClient.getConfiguration();
        
        // Use DelveClient's business logic detection logic
        // Check if not framework code
        if (delveConfig.frameworkPatterns.some(pattern => 
            framePath.includes(pattern) || frameName.includes(pattern))) {
            return false;
        }

        // Check if in included paths
        if (delveConfig.pathInclusions.some(pattern => framePath.includes(pattern))) {
            return true;
        }

        // Check if matches application patterns
        if (delveConfig.applicationPatterns.some(pattern => frameName.includes(pattern))) {
            return true;
        }

        // Check if not excluded
        if (delveConfig.pathExclusions.some(pattern => framePath.includes(pattern))) {
            return false;
        }

        // Check if not infrastructure
        if (delveConfig.infrastructurePatterns.some(pattern => frameName.includes(pattern))) {
            return false;
        }

        // Default: If in project directory and not obviously infrastructure
        const standardGoPaths = ['/go/src/', '/usr/local/go/', '/pkg/mod/', 'vendor/'];
        return !standardGoPaths.some(path => framePath.includes(path)) && framePath.length > 0;
    }

    private async collectVariablesWithSmartHandling() {
        try {
            const scopes = await this.delveClient.getScopes();
            this.context.debugInfo.totalScopes = scopes.length;
            
            if (scopes.length === 0) {
                console.log(`⚠️ No scopes available at ${this.getCurrentTimestamp()}`);
                return;
            }

            const allVariables: Variable[] = [];
            let complexStructureCount = 0;

            // Enhanced scope processing with smart data handling
            const scopePromises = scopes.map(async (scope) => {
                try {
                    const scopeVars = await this.delveClient.getScopeVariables(scope.variablesReference);
                    
                    return scopeVars.map(variable => {
                        const isComplex = this.isComplexDataStructure(variable.value);
                        if (isComplex) complexStructureCount++;

                        const simplified = this.smartSimplifyVariable(variable, scope.name);
                        
                        return {
                            name: variable.name,
                            value: simplified.displayValue,
                            type: variable.type,
                            scope: scope.name,
                            isControlFlow: this.isControlFlowVariable(variable.name),
                            isApplicationRelevant: this.isApplicationRelevantVariable(variable.name, variable.value),
                            changeHistory: [] as VariableChange[],
                            dependencies: [] as string[],
                            metadata: {
                                isPointer: simplified.metadata.isPointer,
                                isNil: simplified.metadata.isNil,
                                memoryAddress: simplified.metadata.memoryAddress,
                                arrayLength: simplified.metadata.arrayLength,
                                objectKeyCount: simplified.metadata.objectKeyCount,
                                truncatedAt: simplified.metadata.truncatedAt,
                                isExpandable: simplified.hasMore || isComplex,
                                rawValue: isComplex ? variable.value : undefined
                            }
                        };
                    });
                } catch (error) {
                    console.log(`⚠️ Error getting variables for scope ${scope.name} at ${this.getCurrentTimestamp()}: ${error.message}`);
                    return [];
                }
            });

            const scopeResults = await Promise.allSettled(scopePromises);
            scopeResults.forEach(result => {
                if (result.status === 'fulfilled') {
                    allVariables.push(...result.value);
                }
            });

            this.context.variables = allVariables;
            console.log(`✅ Collected ${allVariables.length} variables with smart data handling at ${this.getCurrentTimestamp()} (${complexStructureCount} complex structures)`);
            
        } catch (error) {
            console.error(`❌ Error collecting variables at ${this.getCurrentTimestamp()}:`, error);
            this.context.debugInfo.errors.push(`collectVariables: ${error.message}`);
        }
    }

    private async collectExecutionPaths() {
        const paths: ExecutionPath[] = [];

        for (const call of this.context.functionCalls.slice(0, 8)) {
            const path: ExecutionPath = {
                id: `path-${call.id}`,
                functionName: call.name,
                conditions: [],
                branches: [],
                variables: this.context.variables
                    .filter(v => (v.scope === 'Local' || v.scope === 'Arguments') && v.isApplicationRelevant)
                    .slice(0, 20)
                    .map(v => v.name)
            };
            paths.push(path);
        }

        this.context.executionPaths = paths;
        console.log(`✅ Created ${paths.length} execution paths with application-relevant variables at ${this.getCurrentTimestamp()}`);
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

        // Second: remaining fields
        Object.entries(params).forEach(([key, value]) => {
            if (!(key in prioritized)) {
                prioritized[key] = value;
            }
        });

        return prioritized;
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
            maxLength = Math.min(maxLength * 1.5, 750);
        }
        
        // System fields get less space
        if (this.variableConfig.systemVariablePatterns.some(pattern => 
            key.startsWith(pattern) || keyLower.includes(pattern))) {
            maxLength = Math.min(maxLength * 0.5, 150);
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

    expandVariable(variableName: string): SimplifiedValue | null {
        const variable = this.context.variables.find(v => v.name === variableName);
        if (!variable || !variable.metadata.rawValue) {
            return null;
        }

        const options: Partial<SimplificationOptions> = {
            maxDepth: 8,
            maxArrayLength: 20,
            maxStringLength: 1000,
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
        
        return `## 🧠 Symbolic Execution Analysis

**Current Execution Path:**
- Function: ${se.currentPath.currentLocation.function}
- Path Probability: ${(se.currentPath.pathProbability * 100).toFixed(1)}%
- Constraints: ${se.currentPath.pathConstraints.length} active
- Branches Taken: ${se.currentPath.branchesTaken.length}

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
        
        return `## 🛤️ Path-Sensitivity Analysis

**Current Execution Path**: ${ps.currentPath.slice(-3).join(' → ')}
**Paths Analyzed**: ${ps.pathAnalysis.exploredPaths} / ${ps.pathAnalysis.totalPaths} (${(ps.pathAnalysis.pathCoverage * 100).toFixed(1)}% coverage)
**Branching Complexity**: ${ps.sensitivityMetrics.branchingComplexity.toFixed(1)}
**High-Sensitivity Variables**: ${ps.sensitivityMetrics.highSensitivityVariables.length}

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

    getContext(): ContextData {
        return { 
            ...this.context,
            debugInfo: {
                ...this.context.debugInfo,
                timestamp: this.getCurrentTimestamp(),
                user: this.getCurrentUser()
            }
        };
    }

    getPerformanceMetrics() {
        return {
            sessionId: this.sessionId,
            user: this.getCurrentUser(),
            ...this.context.debugInfo.performance,
            timestamp: this.getCurrentTimestamp()
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
        if (this.collectionTimeout) {
            clearTimeout(this.collectionTimeout);
            this.collectionTimeout = null;
        }
        this.dataHandler = null as any;
        this.symbolicExecutor?.dispose();
        this.pathSensitivityAnalyzer?.dispose();
        this.removeAllListeners();
    }
}