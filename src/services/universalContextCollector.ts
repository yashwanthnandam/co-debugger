import * as vscode from 'vscode';
import * as os from 'os';
import { EventEmitter } from 'events';
import { DebuggerProtocol } from '../protocols/debuggerProtocol';
import { LanguageHandler, SupportedLanguage } from '../languages/languageHandler';
import { LanguageDetector } from '../detection/languageDetector';
import { DebuggerFactory } from '../factories/debuggerFactory';
import { CoDataStructureHandler } from './universalDatastructureHandler';
import { VariableExpansionService, ExpansionResult } from './variableExpansionService';
import { SymbolicExecutor, SymbolicExecutionContext } from './symbolicExecutor';
import { PathSensitivityAnalyzer, PathSensitivityReport } from './pathSensitivityAnalyzer';

// Import existing interfaces but make them language-agnostic
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
        fullJSONAvailable?: boolean;
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
    type: 'if' | 'for' | 'while' | 'switch' | 'try' | 'async';
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

export interface CoContextData {
    language: SupportedLanguage;
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
        language: SupportedLanguage;
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
            currentDepth: number;
        };
    };
}

export class CoContextCollector extends EventEmitter {
    private debuggerProtocol: DebuggerProtocol;
    private languageHandler: LanguageHandler;
    private language: SupportedLanguage;
    private context: CoContextData;
    private isCollecting = false;
    private dataHandler: CoDataStructureHandler;
    private variableExpansionService: VariableExpansionService;
    private symbolicExecutor: SymbolicExecutor;
    private pathSensitivityAnalyzer: PathSensitivityAnalyzer;
    private sessionId: string;
    private expandedVariables: Map<string, ExpansionResult> = new Map();

    constructor(session: vscode.DebugSession) {
        super();
        
        // Detect language and create appropriate handlers
        this.language = LanguageDetector.detectLanguage(session);
        this.debuggerProtocol = DebuggerFactory.createDebuggerProtocol(this.language);
        this.languageHandler = DebuggerFactory.createLanguageHandler(this.language);
        this.sessionId = this.generateSessionId();
        
        // Initialize services with language handlers
        this.dataHandler = new CoDataStructureHandler(this.languageHandler);
        this.variableExpansionService = new VariableExpansionService();
        this.symbolicExecutor = new SymbolicExecutor(this.sessionId);
        this.pathSensitivityAnalyzer = new PathSensitivityAnalyzer(this.sessionId);
        
        // Initialize context
        this.context = {
            language: this.language,
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
                language: this.language,
                performance: {
                    collectionTime: 0,
                    variableCount: 0,
                    complexStructuresFound: 0,
                    expandedVariablesCount: 0,
                    memoryUsage: '0 MB',
                    currentDepth: this.languageHandler.getDefaultConfig().maxVariableDepth
                }
            }
        };

        this.setupEventListeners();
        
        console.log(`🌍 Co Context Collector initialized for ${this.language} at 2025-06-13 04:05:26 (User: ${this.getCurrentUser()})`);
    }

    private getCurrentUser(): string {
        return os.userInfo().username || 'unknown-user';
    }

    private getCurrentTimestamp(): string {
        return '2025-06-13 04:05:26';
    }

    private generateSessionId(): string {
        return `universal-debug-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    private setupEventListeners(): void {
        this.debuggerProtocol.on('attached', () => {
            console.log(`🔗 ${this.language} debugger attached - ready for universal context at ${this.getCurrentTimestamp()}`);
            this.context.debugInfo.isConnected = true;
            this.context.debugInfo.isStopped = false;
            this.context.debugInfo.timestamp = this.getCurrentTimestamp();
            this.emit('collectionStarted', { language: this.language });
        });

        this.debuggerProtocol.on('stopped', (eventBody) => {
            console.log(`🛑 ${this.language} debug stopped - collecting universal context at ${this.getCurrentTimestamp()}`);
            this.context.debugInfo.isStopped = true;
            this.context.debugInfo.currentThreadId = eventBody.threadId;
            this.context.debugInfo.currentFrameId = eventBody.frameId;
            this.context.debugInfo.timestamp = this.getCurrentTimestamp();
            this.collectCurrentContext();
        });

        this.debuggerProtocol.on('continued', () => {
            console.log(`▶️ ${this.language} debug continued - clearing universal context at ${this.getCurrentTimestamp()}`);
            this.context.debugInfo.isStopped = false;
            this.context.debugInfo.currentThreadId = null;
            this.context.debugInfo.currentFrameId = null;
            this.context.debugInfo.timestamp = this.getCurrentTimestamp();
            this.clearContext();
        });

        this.debuggerProtocol.on('detached', () => {
            console.log(`🔌 ${this.language} debugger detached at ${this.getCurrentTimestamp()}`);
            this.context.debugInfo.isConnected = false;
            this.context.debugInfo.isStopped = false;
            this.context.debugInfo.timestamp = this.getCurrentTimestamp();
            this.clearContext();
            this.emit('collectionStopped', { language: this.language });
        });
    }

    attachToSession(session: vscode.DebugSession): void {
        this.debuggerProtocol.attachToSession(session);
    }

    startCollection(): void {
        this.isCollecting = true;
        console.log(`📊 Co context collection enabled for ${this.language} at ${this.getCurrentTimestamp()} (User: ${this.getCurrentUser()})`);
    }

    stopCollection(): void {
        this.isCollecting = false;
        this.clearContext();
        console.log(`⏹️ Co context collection disabled for ${this.language} at ${this.getCurrentTimestamp()}`);
    }

    async notifyStoppedFromVSCode(): Promise<void> {
        await this.debuggerProtocol.notifyStoppedFromVSCode();
    }

    notifyContinuedFromVSCode(): void {
        this.debuggerProtocol.notifyContinuedFromVSCode();
    }

    private clearContext(): void {
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
            memoryUsage: '0 MB',
            currentDepth: this.languageHandler.getDefaultConfig().maxVariableDepth
        };
        this.context.debugInfo.timestamp = this.getCurrentTimestamp();
        
        this.expandedVariables.clear();
        this.variableExpansionService.clearHistory();
        
        this.emit('contextUpdated', this.context);
    }

    private async collectCurrentContext(): Promise<void> {
        if (!this.debuggerProtocol.isStoppedAtBreakpoint()) {
            console.log(`⚠️ Not collecting ${this.language} context - debugger not stopped at ${this.getCurrentTimestamp()}`);
            return;
        }

        try {
            console.log(`🎯 Collecting universal ${this.language} context at ${this.getCurrentTimestamp()} (User: ${this.getCurrentUser()})`);
            await this.refreshAll();
        } catch (error) {
            console.error(`❌ Error collecting ${this.language} context at ${this.getCurrentTimestamp()}:`, error);
            this.context.debugInfo.errors.push(`collectCurrentContext: ${error.message}`);
        }
    }

    async refreshAll(): Promise<void> {
        if (!this.isCollecting) {
            console.log(`❌ ${this.language} collection not enabled at ${this.getCurrentTimestamp()}`);
            return;
        }

        if (!this.debuggerProtocol.isStoppedAtBreakpoint()) {
            console.log(`❌ Cannot collect ${this.language} context - debugger not stopped at ${this.getCurrentTimestamp()}`);
            this.context.debugInfo.errors = ['Debugger must be stopped at a breakpoint'];
            this.emit('contextUpdated', this.context);
            return;
        }

        const collectionStartTime = Date.now();
        this.context.debugInfo.lastCollection = collectionStartTime;
        this.context.debugInfo.timestamp = this.getCurrentTimestamp();
        this.context.debugInfo.errors = [];
        this.context.debugInfo.currentThreadId = this.debuggerProtocol.getCurrentThreadId();
        this.context.debugInfo.currentFrameId = this.debuggerProtocol.getCurrentFrameId();

        try {
            const config = this.languageHandler.getDefaultConfig();
            console.log(`🔄 Starting universal ${this.language} context collection with depth ${config.maxVariableDepth} at ${this.getCurrentTimestamp()}`);
            
            // Get current frame using language-agnostic protocol
            const currentFrame = await this.debuggerProtocol.getCurrentFrame();
            if (currentFrame) {
                this.context.currentLocation = {
                    file: currentFrame.source?.path || '',
                    line: currentFrame.line,
                    function: this.languageHandler.extractFunctionName(currentFrame.name)
                };
                
                console.log(`📍 Current ${this.language} location at ${this.getCurrentTimestamp()}:`, this.context.currentLocation);
                
                // Co context collection
                await Promise.all([
                    this.collectFunctionCalls(),
                    this.collectVariables(),
                    this.collectExecutionPaths()
                ]);

                // Language-agnostic symbolic execution
                console.log(`🧠 Starting ${this.language} symbolic execution at ${this.getCurrentTimestamp()}`);
                const symbolicStartTime = Date.now();
                
                this.context.symbolicExecution = this.symbolicExecutor.analyzeExecutionContext(
                    this.context.variables,
                    this.context.functionCalls,
                    this.context.currentLocation
                );
                
                const symbolicAnalysisTime = Date.now() - symbolicStartTime;

                // Language-agnostic path sensitivity
                console.log(`🛤️ Starting ${this.language} path-sensitivity analysis at ${this.getCurrentTimestamp()}`);
                const pathSensitivityStartTime = Date.now();
                
                this.context.pathSensitivity = this.pathSensitivityAnalyzer.analyzePathSensitivity(
                    this.context.variables,
                    this.context.functionCalls,
                    this.context.currentLocation,
                    this.context.symbolicExecution
                );
                
                const pathSensitivityTime = Date.now() - pathSensitivityStartTime;
                
                // Performance metrics
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
                    variableExpansionTime: Array.from(this.expandedVariables.values()).reduce((sum, r) => sum + r.expansionTime, 0),
                    currentDepth: config.maxVariableDepth
                };
                
                console.log(`✅ Co ${this.language} context collection complete at ${this.getCurrentTimestamp()}:`, {
                    functionCalls: this.context.functionCalls.length,
                    variables: this.context.variables.length,
                    expandedVariables: this.expandedVariables.size,
                    memoryUsage: this.context.debugInfo.performance.memoryUsage,
                    collectionTime: `${collectionTime}ms`,
                    language: this.language
                });
                
            } else {
                console.log(`⚠️ No current frame available for ${this.language} at ${this.getCurrentTimestamp()}`);
                this.context.debugInfo.errors.push(`No current frame available for ${this.language}`);
            }
            
            this.emit('contextUpdated', this.context);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`❌ Error during ${this.language} context collection at ${this.getCurrentTimestamp()}:`, errorMsg);
            this.context.debugInfo.errors.push(errorMsg);
            this.emit('contextUpdated', this.context);
        }
    }

    private async collectFunctionCalls(): Promise<void> {
        const stackTrace = await this.debuggerProtocol.getStackTrace();
        this.context.debugInfo.totalFrames = stackTrace.length;
        
        if (stackTrace.length === 0) {
            console.log(`⚠️ No ${this.language} stack trace at ${this.getCurrentTimestamp()}`);
            return;
        }

        const allCalls: FunctionCall[] = [];
        
        console.log(`📊 Processing ${stackTrace.length} ${this.language} frames at ${this.getCurrentTimestamp()}`);

        // Process frames with language-aware parameter extraction
        const framePromises = stackTrace.slice(0, 20).map(async (frame, index) => {
            try {
                const parameters = await this.debuggerProtocol.getFrameVariables(frame.id);
                
                return {
                    id: `frame-${frame.id}`,
                    name: this.languageHandler.extractFunctionName(frame.name),
                    file: frame.source?.path || '',
                    line: frame.line,
                    parameters: this.simplifyParameters(parameters),
                    startTime: Date.now(),
                    children: [] as string[]
                };
            } catch (error) {
                console.log(`⚠️ Could not get ${this.language} variables for frame ${index}: ${error.message}`);
                return {
                    id: `frame-${frame.id}`,
                    name: this.languageHandler.extractFunctionName(frame.name),
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
        console.log(`✅ Collected ${allCalls.length} ${this.language} function calls at ${this.getCurrentTimestamp()}`);
    }

    private async collectVariables(): Promise<void> {
        const config = this.languageHandler.getDefaultConfig();
        
        if (!config.enableDeepExpansion) {
            console.log(`📝 Deep expansion disabled for ${this.language} - using basic collection at ${this.getCurrentTimestamp()}`);
            await this.collectBasicVariables();
        }

        try {
            const frameId = this.debuggerProtocol.getCurrentFrameId();
            if (!frameId) {
                console.log(`⚠️ No frame ID available for ${this.language} variable expansion at ${this.getCurrentTimestamp()}`);
                return;
            }

            console.log(`🔍 Starting ${this.language} variable expansion with depth ${config.maxVariableDepth} at ${this.getCurrentTimestamp()}`);

            const scopes = await this.debuggerProtocol.getScopes();
            this.context.debugInfo.totalScopes = scopes.length;
            
            if (scopes.length === 0) {
                console.log(`⚠️ No ${this.language} scopes at ${this.getCurrentTimestamp()}`);
                return;
            }

            const variableExpansionStartTime = Date.now();
            const safeMaxVariables = Math.max(8, Math.min(40, Math.ceil(60 / config.maxVariableDepth)));
            
            console.log(`📊 Expanding max ${safeMaxVariables} ${this.language} variables to depth ${config.maxVariableDepth} at ${this.getCurrentTimestamp()}`);

            // Expand variables using language-agnostic expansion service
            const expansionResults = await this.variableExpansionService.expandAllVariablesInScope(
                this.debuggerProtocol.currentSession,
                frameId,
                config.maxVariableDepth,
                safeMaxVariables
            );

            this.expandedVariables = new Map(Object.entries(expansionResults));

            const allVariables: Variable[] = [];
            let complexStructureCount = 0;

            // Process expansion results using language handler
            for (const [varName, result] of this.expandedVariables) {
                if (result.success && result.data) {
                    const variable = this.convertExpandedToVariable(varName, result.data, result);
                    allVariables.push(variable);
                    
                    if (variable.metadata.isExpandable) {
                        complexStructureCount++;
                    }
                }
            }

            // Also collect basic variables and merge
            const basicVariables = await this.collectBasicVariables(scopes);
            
            // Merge variables
            const variableMap = new Map<string, Variable>();
            allVariables.forEach(v => variableMap.set(v.name, v));
            basicVariables.forEach(basicVar => {
                if (variableMap.has(basicVar.name)) {
                    const existingVar = variableMap.get(basicVar.name)!;
                    existingVar.scope = basicVar.scope;
                    variableMap.set(basicVar.name, existingVar);
                } else {
                    variableMap.set(basicVar.name, basicVar);
                }
            });

            this.context.variables = Array.from(variableMap.values());
            
            console.log(`✅ ${this.language} variable collection complete at depth ${config.maxVariableDepth} at ${this.getCurrentTimestamp()}:`, {
                totalVariables: this.context.variables.length,
                expandedVariables: this.expandedVariables.size,
                complexStructures: complexStructureCount,
                memoryUsage: this.variableExpansionService.getMemoryUsage(),
                expansionTime: `${Date.now() - variableExpansionStartTime}ms`,
                language: this.language
            });
            
        } catch (error) {
            console.error(`❌ Error in ${this.language} variable collection at ${this.getCurrentTimestamp()}:`, error);
            this.context.debugInfo.errors.push(`${this.language}VariableCollection: ${error.message}`);
            await this.collectBasicVariables();
        }
    }

    private async collectBasicVariables(scopes?: any[]): Promise<Variable[]> {
        if (!scopes) {
            scopes = await this.debuggerProtocol.getScopes();
            this.context.debugInfo.totalScopes = scopes.length;
        }
        
        if (scopes.length === 0) {
            console.log(`⚠️ No ${this.language} scopes for basic collection at ${this.getCurrentTimestamp()}`);
            return [];
        }

        const allVariables: Variable[] = [];

        for (const scope of scopes) {
            try {
                const scopeVars = await this.debuggerProtocol.getScopeVariables(scope.variablesReference);
                
                scopeVars.forEach(variable => {
                    const parsedValue = this.languageHandler.parseVariableValue(variable.value, variable.type);
                    
                    allVariables.push({
                        name: variable.name,
                        value: parsedValue.displayValue,
                        type: this.languageHandler.inferType(variable.name, variable.value, { variableName: variable.name }),
                        scope: scope.name,
                        isControlFlow: this.languageHandler.isControlFlowVariable(variable.name),
                        isApplicationRelevant: this.languageHandler.isApplicationRelevant(variable.name, variable.value),
                        changeHistory: [],
                        dependencies: [],
                        metadata: {
                            isPointer: parsedValue.isPointer,
                            isNil: parsedValue.isNil,
                            memoryAddress: parsedValue.memoryAddress,
                            arrayLength: parsedValue.arrayLength,
                            objectKeyCount: parsedValue.objectKeyCount,
                            isExpandable: parsedValue.isExpandable,
                            rawValue: variable.value,
                            fullJSONAvailable: false
                        }
                    });
                });
            } catch (error) {
                console.log(`⚠️ Error getting ${this.language} basic variables for scope ${scope.name}: ${error.message}`);
            }
        }

        console.log(`✅ Basic ${this.language} variable collection complete at ${this.getCurrentTimestamp()}: ${allVariables.length} variables`);
        return allVariables;
    }

    private async collectExecutionPaths(): Promise<void> {
        const paths: ExecutionPath[] = [];

        for (const call of this.context.functionCalls.slice(0, 10)) {
            const path: ExecutionPath = {
                id: `path-${call.id}`,
                functionName: call.name,
                conditions: [],
                branches: [],
                variables: this.context.variables
                    .filter(v => (v.scope === 'Local' || v.scope === 'Arguments' || v.scope === 'Locals') && v.isApplicationRelevant)
                    .slice(0, 25)
                    .map(v => v.name)
            };
            paths.push(path);
        }

        this.context.executionPaths = paths;
        console.log(`✅ Created ${paths.length} ${this.language} execution paths at ${this.getCurrentTimestamp()}`);
    }

    private simplifyParameters(params: Record<string, any>): Record<string, any> {
        const simplified: Record<string, any> = {};
        const config = this.languageHandler.getDefaultConfig();
        let count = 0;

        // Sort parameters by importance using language handler
        const sortedParams = Object.entries(params)
            .sort(([a, aVal], [b, bVal]) => {
                const aScore = this.languageHandler.calculateVariableImportance(a, String(aVal));
                const bScore = this.languageHandler.calculateVariableImportance(b, String(bVal));
                return bScore - aScore;
            });

        for (const [key, value] of sortedParams) {
            if (count >= config.maxParameterCount) break;
            
            const parsedValue = this.languageHandler.parseVariableValue(String(value), 'unknown');
            simplified[key] = parsedValue.displayValue;
            count++;
        }

        return simplified;
    }

    private convertExpandedToVariable(name: string, expanded: any, result: ExpansionResult): Variable {
        const parsedValue = this.languageHandler.parseVariableValue(
            expanded.displayValue || String(expanded), 
            expanded.originalType || 'unknown'
        );
        
        return {
            name,
            value: parsedValue.displayValue,
            type: expanded.originalType || this.languageHandler.inferType(name, parsedValue.displayValue, { variableName: name }),
            scope: 'Local',
            isControlFlow: this.languageHandler.isControlFlowVariable(name),
            isApplicationRelevant: this.languageHandler.isApplicationRelevant(name, parsedValue.displayValue),
            changeHistory: [],
            dependencies: [],
            metadata: {
                isPointer: parsedValue.isPointer,
                isNil: parsedValue.isNil,
                memoryAddress: parsedValue.memoryAddress,
                arrayLength: parsedValue.arrayLength,
                objectKeyCount: parsedValue.objectKeyCount,
                isExpandable: parsedValue.isExpandable,
                rawValue: expanded.displayValue || String(expanded),
                expansionDepth: this.calculateExpansionDepth(expanded),
                memoryUsage: result.memoryUsed,
                fullJSONAvailable: result.fullJSONAvailable || false
            }
        };
    }

    private calculateExpansionDepth(expanded: any, currentDepth: number = 0): number {
        if (!expanded.children || Object.keys(expanded.children).length === 0) {
            return currentDepth;
        }
        
        let maxChildDepth = currentDepth;
        Object.values(expanded.children).forEach((child: any) => {
            const childDepth = this.calculateExpansionDepth(child, currentDepth + 1);
            maxChildDepth = Math.max(maxChildDepth, childDepth);
        });
        
        return maxChildDepth;
    }

    // Public API methods
    getContext(): CoContextData {
        return { 
            ...this.context,
            debugInfo: {
                ...this.context.debugInfo,
                timestamp: this.getCurrentTimestamp(),
                user: this.getCurrentUser(),
                currentThreadId: this.debuggerProtocol.getCurrentThreadId(),
                currentFrameId: this.debuggerProtocol.getCurrentFrameId()
            }
        };
    }

    getLanguage(): SupportedLanguage {
        return this.language;
    }

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

    getExpandedVariables(): Map<string, ExpansionResult> {
        return this.expandedVariables;
    }

    async expandSpecificVariable(variableName: string, maxDepth?: number, forceFullExpansion: boolean = false): Promise<any> {
        const frameId = this.debuggerProtocol.getCurrentFrameId();
        if (!frameId) {
            console.log(`❌ No frame ID available for expanding ${variableName} in ${this.language} at ${this.getCurrentTimestamp()}`);
            return null;
        }

        const config = this.languageHandler.getDefaultConfig();
        const depth = maxDepth || config.maxVariableDepth;
        console.log(`🔍 Expanding ${this.language} variable: ${variableName} with depth ${depth} at ${this.getCurrentTimestamp()}`);

        const result = await this.variableExpansionService.expandVariable(
            this.debuggerProtocol.currentSession,
            frameId,
            variableName,
            depth,
            forceFullExpansion
        );

        if (result.success && result.data) {
            console.log(`✅ Successfully expanded ${this.language} variable ${variableName} in ${result.expansionTime}ms at ${this.getCurrentTimestamp()}`);
            return result.data;
        } else {
            console.error(`❌ Failed to expand ${this.language} variable ${variableName}: ${result.error} at ${this.getCurrentTimestamp()}`);
            return null;
        }
    }

    getContextSummary(): string {
        const context = this.getContext();
        
        return `# Co Context Summary (${this.language.toUpperCase()})

**Generated**: ${this.getCurrentTimestamp()}
**User**: ${this.getCurrentUser()}
**Language**: ${this.language}
**Session**: ${context.debugInfo.sessionId}

## Current State
- **Connected**: ${context.debugInfo.isConnected ? '✅' : '❌'}
- **Stopped**: ${context.debugInfo.isStopped ? '✅' : '❌'}
- **Thread ID**: ${context.debugInfo.currentThreadId || 'N/A'}
- **Frame ID**: ${context.debugInfo.currentFrameId || 'N/A'}

## Collection Statistics
- **Function Calls**: ${context.functionCalls.length}
- **Variables**: ${context.variables.length}
- **Application Variables**: ${this.getApplicationVariables().length}
- **System Variables**: ${this.getSystemVariables().length}
- **Control Flow Variables**: ${this.getControlFlowVariables().length}
- **Complex Variables**: ${this.getComplexVariables().length}
- **Expanded Variables**: ${this.expandedVariables.size}

## Performance Metrics
- **Collection Time**: ${context.debugInfo.performance.collectionTime}ms
- **Memory Usage**: ${context.debugInfo.performance.memoryUsage}
- **Variable Expansion Time**: ${context.debugInfo.performance.variableExpansionTime || 0}ms
- **Symbolic Analysis Time**: ${context.debugInfo.performance.symbolicAnalysisTime || 0}ms
- **Path Sensitivity Time**: ${context.debugInfo.performance.pathSensitivityTime || 0}ms

## Current Location
${context.currentLocation ? `- **Function**: ${context.currentLocation.function}
- **File**: ${context.currentLocation.file}
- **Line**: ${context.currentLocation.line}` : 'No current location available'}

## Language-Specific Configuration
- **Max Variable Depth**: ${this.languageHandler.getDefaultConfig().maxVariableDepth}
- **Type Inference**: ${this.languageHandler.getDefaultConfig().enableTypeInference ? 'Enabled' : 'Disabled'}
- **Deep Expansion**: ${this.languageHandler.getDefaultConfig().enableDeepExpansion ? 'Enabled' : 'Disabled'}
- **Memory Limit**: ${this.languageHandler.getDefaultConfig().memoryLimitMB}MB

## Function Call Stack (Top 10)
${context.functionCalls.slice(0, 10).map((call, i) => 
    `${i + 1}. **${call.name}** (${call.file}:${call.line})`
).join('\n') || 'No function calls available'}

## Application Variables (Top 10)
${this.getApplicationVariables().slice(0, 10).map((v, i) => 
    `${i + 1}. **${v.name}** (${v.type}): ${v.value.substring(0, 100)}${v.value.length > 100 ? '...' : ''}`
).join('\n') || 'No application variables available'}

---
*Generated by Co Multi-Language Debug Context Analyzer*
*Language: ${this.language} | Timestamp: ${this.getCurrentTimestamp()}*
`;
    }

    dispose(): void {
        console.log(`🧹 Disposing Co Context Collector for ${this.language} at ${this.getCurrentTimestamp()}`);
        
        this.stopCollection();
        this.variableExpansionService?.clearHistory();
        this.expandedVariables.clear();
        this.symbolicExecutor?.dispose();
        this.pathSensitivityAnalyzer?.dispose();
        this.debuggerProtocol?.dispose();
        this.removeAllListeners();
        
        console.log(`📊 Final ${this.language} Stats - Variables: ${this.context.variables.length}, Memory: ${this.context.debugInfo.performance.memoryUsage}`);
    }
}