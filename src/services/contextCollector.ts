import { EventEmitter } from 'events';
import { DelveClient } from './delveClient';

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
    changeHistory: VariableChange[];
    dependencies: string[];
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
    debugInfo: {
        isConnected: boolean;
        isStopped: boolean;
        lastCollection: number;
        totalFrames: number;
        totalScopes: number;
        errors: string[];
        threadId: number | null;
    };
}

export class ContextCollector extends EventEmitter {
    private delveClient: DelveClient;
    private context: ContextData;
    private isCollecting = false;

    constructor(delveClient: DelveClient) {
        super();
        this.delveClient = delveClient;
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
                threadId: null
            }
        };

        this.setupEventListeners();
    }

    private setupEventListeners() {
        this.delveClient.on('attached', () => {
            console.log('🔗 DelveClient attached - waiting for stopped event');
            this.context.debugInfo.isConnected = true;
            this.context.debugInfo.isStopped = false;
            this.emit('collectionStarted');
        });

        this.delveClient.on('stopped', (eventBody) => {
            console.log('🛑 Debug stopped - collecting context immediately');
            this.context.debugInfo.isStopped = true;
            this.context.debugInfo.threadId = eventBody.threadId;
            this.collectCurrentContext();
        });

        this.delveClient.on('continued', () => {
            console.log('▶️ Debug continued - clearing context');
            this.context.debugInfo.isStopped = false;
            this.context.debugInfo.threadId = null;
            this.clearContext();
        });

        this.delveClient.on('detached', () => {
            console.log('🔌 DelveClient detached');
            this.context.debugInfo.isConnected = false;
            this.context.debugInfo.isStopped = false;
            this.clearContext();
            this.emit('collectionStopped');
        });
    }

    private clearContext() {
        this.context.functionCalls = [];
        this.context.variables = [];
        this.context.executionPaths = [];
        this.context.currentLocation = null;
        this.context.debugInfo.totalFrames = 0;
        this.context.debugInfo.totalScopes = 0;
        this.emit('contextUpdated', this.context);
    }

    startCollection() {
        this.isCollecting = true;
        console.log('📊 Context collection enabled');
    }

    stopCollection() {
        this.isCollecting = false;
        this.clearContext();
        console.log('⏹️ Context collection disabled');
    }

    async refreshAll() {
        if (!this.isCollecting) {
            console.log('❌ Collection not enabled');
            return;
        }

        if (!this.delveClient.isStoppedAtBreakpoint()) {
            console.log('❌ Cannot collect - debugger not stopped at breakpoint');
            this.context.debugInfo.errors = ['Debugger must be stopped at a breakpoint'];
            this.emit('contextUpdated', this.context);
            return;
        }

        const now = Date.now();
        this.context.debugInfo.lastCollection = now;
        this.context.debugInfo.errors = [];

        try {
            console.log('🔄 Starting context collection...');
            
            await this.collectFunctionCalls();
            await this.collectVariables();
            await this.collectExecutionPaths();

            console.log('✅ Context collection complete:', {
                functionCalls: this.context.functionCalls.length,
                variables: this.context.variables.length,
                currentLocation: this.context.currentLocation
            });
            
            this.emit('contextUpdated', this.context);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error('❌ Error during context collection:', errorMsg);
            this.context.debugInfo.errors.push(errorMsg);
            this.emit('contextUpdated', this.context);
        }
    }

    private async collectCurrentContext() {
        if (!this.delveClient.isStoppedAtBreakpoint()) {
            console.log('⚠️ Not collecting - debugger not stopped');
            return;
        }

        try {
            console.log('🎯 Collecting context at breakpoint...');
            
            // Get current location first
            const currentFrame = await this.delveClient.getCurrentFrame();
            if (currentFrame) {
                this.context.currentLocation = {
                    file: currentFrame.source?.path || '',
                    line: currentFrame.line,
                    function: currentFrame.name
                };
                console.log('📍 Current location:', this.context.currentLocation);
            }

            await this.refreshAll();
        } catch (error) {
            console.error('❌ Error collecting current context:', error);
            this.context.debugInfo.errors.push(`collectCurrentContext: ${error.message}`);
        }
    }

    private async collectFunctionCalls() {
        try {
            const stackTrace = await this.delveClient.getStackTrace();
            this.context.debugInfo.totalFrames = stackTrace.length;
            
            if (stackTrace.length === 0) {
                console.log('⚠️ No stack trace available');
                return;
            }

            const allCalls: FunctionCall[] = [];

            for (let i = 0; i < Math.min(stackTrace.length, 15); i++) {
                const frame = stackTrace[i];
                
                try {
                    const parameters = await this.delveClient.getFrameVariables(frame.id);
                    
                    const call: FunctionCall = {
                        id: `frame-${frame.id}`,
                        name: frame.name,
                        file: frame.source?.path || '',
                        line: frame.line,
                        parameters: this.simplifyParameters(parameters),
                        startTime: Date.now(),
                        children: []
                    };
                    allCalls.push(call);
                } catch (error) {
                    console.log(`⚠️ Could not get variables for frame ${i}: ${error.message}`);
                    // Still add the call without parameters
                    const call: FunctionCall = {
                        id: `frame-${frame.id}`,
                        name: frame.name,
                        file: frame.source?.path || '',
                        line: frame.line,
                        parameters: {},
                        startTime: Date.now(),
                        children: []
                    };
                    allCalls.push(call);
                }
            }

            // Build relationships
            for (let i = 0; i < allCalls.length - 1; i++) {
                allCalls[i].parentId = allCalls[i + 1].id;
                allCalls[i + 1].children.push(allCalls[i].id);
            }

            this.context.functionCalls = allCalls;
            console.log(`✅ Collected ${allCalls.length} function calls`);
            
        } catch (error) {
            console.error('❌ Error collecting function calls:', error);
            this.context.debugInfo.errors.push(`collectFunctionCalls: ${error.message}`);
        }
    }

    private async collectVariables() {
        try {
            const scopes = await this.delveClient.getScopes();
            this.context.debugInfo.totalScopes = scopes.length;
            
            if (scopes.length === 0) {
                console.log('⚠️ No scopes available');
                return;
            }

            const allVariables: Variable[] = [];

            for (const scope of scopes) {
                try {
                    const scopeVars = await this.delveClient.getScopeVariables(scope.variablesReference);
                    
                    for (const variable of scopeVars) {
                        const newVar: Variable = {
                            name: variable.name,
                            value: this.simplifyValue(variable.value),
                            type: variable.type,
                            scope: scope.name,
                            isControlFlow: this.isControlFlowVariable(variable.name),
                            changeHistory: [],
                            dependencies: []
                        };
                        allVariables.push(newVar);
                    }
                } catch (error) {
                    console.log(`⚠️ Error getting variables for scope ${scope.name}: ${error.message}`);
                }
            }

            this.context.variables = allVariables;
            console.log(`✅ Collected ${allVariables.length} variables`);
            
        } catch (error) {
            console.error('❌ Error collecting variables:', error);
            this.context.debugInfo.errors.push(`collectVariables: ${error.message}`);
        }
    }

    private async collectExecutionPaths() {
        const paths: ExecutionPath[] = [];

        for (const call of this.context.functionCalls.slice(0, 5)) {
            const path: ExecutionPath = {
                id: `path-${call.id}`,
                functionName: call.name,
                conditions: [],
                branches: [],
                variables: this.context.variables
                    .filter(v => v.scope === 'Local' || v.scope === 'Arguments')
                    .slice(0, 5)
                    .map(v => v.name)
            };
            paths.push(path);
        }

        this.context.executionPaths = paths;
        console.log(`✅ Created ${paths.length} execution paths`);
    }

    private simplifyParameters(params: Record<string, any>): Record<string, any> {
        const simplified: Record<string, any> = {};
        let count = 0;

        for (const [key, value] of Object.entries(params)) {
            if (count >= 10) break;
            simplified[key] = this.simplifyValue(value);
            count++;
        }

        return simplified;
    }

    private simplifyValue(value: any): any {
        if (typeof value === 'string' && value.length > 200) {
            return value.substring(0, 200) + '...';
        }
        return value;
    }

    private isControlFlowVariable(varName: string): boolean {
        const controlPatterns = ['err', 'error', 'ok', 'found', 'valid', 'success', 'flag'];
        return controlPatterns.some(pattern => varName.toLowerCase().includes(pattern));
    }

    getContext(): ContextData {
        return { ...this.context };
    }

    searchVariables(query: string): Variable[] {
        const lowerQuery = query.toLowerCase();
        return this.context.variables.filter(v => 
            v.name.toLowerCase().includes(lowerQuery) ||
            v.value.toString().toLowerCase().includes(lowerQuery)
        );
    }

    getControlFlowVariables(): Variable[] {
        return this.context.variables.filter(v => v.isControlFlow);
    }

    getVariablesWithHistory(): Variable[] {
        return this.context.variables.filter(v => v.changeHistory.length > 0);
    }

    dispose() {
        this.stopCollection();
        this.removeAllListeners();
    }
}