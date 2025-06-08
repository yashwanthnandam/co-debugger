import * as vscode from 'vscode';
import { EventEmitter } from 'events';

export interface DelveFrame {
    id: number;
    name: string;
    source?: {
        name: string;
        path: string;
    };
    line: number;
    column: number;
}

export interface DelveScope {
    name: string;
    variablesReference: number;
    expensive: boolean;
}

export interface DelveVariable {
    name: string;
    value: string;
    type: string;
    variablesReference: number;
    evaluateName?: string;
}

export interface DebugState {
    stopped: boolean;
    threadId: number | null;
    reason?: string;
}

export interface BusinessLogicConfig {
    enableDetection: boolean;
    applicationPatterns: string[];
    infrastructurePatterns: string[];
    frameworkPatterns: string[];
    pathExclusions: string[];
    pathInclusions: string[];
    minimumStackDepth: number;
    cacheTimeout: number;
}

export class DelveClient extends EventEmitter {
    private currentSession: vscode.DebugSession | null = null;
    private isAttached = false;
    private isStopped = false;
    private currentThreadId: number | null = null;
    private stoppedFrameId: number | null = null;
    private applicationFrame: DelveFrame | null = null;
    private config: BusinessLogicConfig;
    
    // Optimization: Cache and debouncing
    private applicationThreadsCache: Map<number, DelveFrame> = new Map();
    private lastApplicationLogicCheck = 0;
    
    // Optimization: Rate limiting
    private lastStateCheck = 0;
    private minStateCheckInterval = 200;
    
    // Optimization: Debounced notification
    private notificationTimeout: NodeJS.Timeout | null = null;
    
    // Fix oscillation issue
    private lastDetectedThreadId: number | null = null;
    private threadStabilityTimeout: NodeJS.Timeout | null = null;

    constructor() {
        super();
        this.config = this.loadConfiguration();
    }

    private loadConfiguration(): BusinessLogicConfig {
        const workspaceConfig = vscode.workspace.getConfiguration('goDebugger.businessLogic');
        
        return {
            enableDetection: workspaceConfig.get('enableDetection', true),
            applicationPatterns: workspaceConfig.get('applicationPatterns', [
                'Handler)',
                'Controller)',
                'Service)',
                'UseCase)',
                'Repository)',
                'Manager)',
                'Processor)',
                'Worker)',
                'Job)',
                'Task)',
                '.Get',
                '.Post',
                '.Put',
                '.Delete',
                '.Create',
                '.Update',
                '.Process'
            ]),
            infrastructurePatterns: workspaceConfig.get('infrastructurePatterns', [
                'gin.',
                'mux.',
                'http.',
                'sql.',
                'gorm.',
                'redis.',
                'mongo.',
                'grpc.',
                'runtime.',
                'reflect.',
                'crypto.',
                'encoding.',
                'net.',
                'syscall.',
                'os.'
            ]),
            frameworkPatterns: workspaceConfig.get('frameworkPatterns', [
                '/go/src/',
                '/usr/local/go/',
                '/pkg/mod/',
                'vendor/',
                '.mod/cache/',
                'github.com/gin-gonic',
                'github.com/gorilla',
                'golang.org/',
                'google.golang.org/'
            ]),
            pathExclusions: workspaceConfig.get('pathExclusions', [
                'test',
                'mock',
                'stub',
                'fixture',
                '_test.go',
                'main.go'
            ]),
            pathInclusions: workspaceConfig.get('pathInclusions', [
                '/internal/',
                '/cmd/',
                '/pkg/',
                '/app/',
                '/src/',
                '/api/',
                '/handlers/',
                '/services/',
                '/controllers/',
                '/delivery/',
                '/usecase/'
            ]),
            minimumStackDepth: workspaceConfig.get('minimumStackDepth', 0),
            cacheTimeout: workspaceConfig.get('cacheTimeout', 3000)
        };
    }

    private refreshConfiguration(): void {
        this.config = this.loadConfiguration();
        this.clearCaches();
        console.log('🔧 DelveClient: Configuration refreshed at 2025-06-08 06:20:12');
    }

    attachToSession(session: vscode.DebugSession) {
        console.log('🔗 DelveClient: Attaching to session:', session.name, 'at 2025-06-08 06:20:12');
        this.currentSession = session;
        this.isAttached = true;
        this.isStopped = false;
        this.currentThreadId = null;
        this.stoppedFrameId = null;
        this.applicationFrame = null;
        this.lastDetectedThreadId = null;
        this.refreshConfiguration();
        this.clearCaches();
        
        this.emit('attached', session);
        console.log('✅ DelveClient: Attached successfully at 2025-06-08 06:20:12');
    }

    detachFromSession() {
        console.log('🔌 DelveClient: Detaching from session at 2025-06-08 06:20:12');
        this.currentSession = null;
        this.isAttached = false;
        this.isStopped = false;
        this.currentThreadId = null;
        this.stoppedFrameId = null;
        this.applicationFrame = null;
        this.lastDetectedThreadId = null;
        this.clearCaches();
        this.clearTimeouts();
        this.emit('detached');
    }

    private clearCaches() {
        this.applicationThreadsCache.clear();
        this.lastApplicationLogicCheck = 0;
        this.lastStateCheck = 0;
    }

    private clearTimeouts() {
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
            this.notificationTimeout = null;
        }
        if (this.threadStabilityTimeout) {
            clearTimeout(this.threadStabilityTimeout);
            this.threadStabilityTimeout = null;
        }
    }

    isConnected(): boolean {
        return this.isAttached && this.currentSession !== null;
    }

    isStoppedAtBreakpoint(): boolean {
        return this.isStopped && this.currentThreadId !== null;
    }

    private isApplicationLogicFrame(frame: DelveFrame): boolean {
        if (!this.config.enableDetection) {
            return true;
        }

        const framePath = frame.source?.path || '';
        const frameName = frame.name || '';
        
        // Debug logging for analysis
        console.log(`🔍 Analyzing frame: ${frameName} in ${framePath}`);

        // Early exclusion: Skip obvious framework/infrastructure code
        if (this.isFrameworkCode(framePath, frameName)) {
            console.log(`❌ Framework code detected: ${frameName}`);
            return false;
        }

        // Priority 1: Check if path is in included directories
        if (this.isInIncludedPath(framePath)) {
            console.log(`✅ Included path detected: ${framePath}`);
            return true;
        }

        // Priority 2: Check if function name matches application patterns
        if (this.matchesApplicationPatterns(frameName)) {
            console.log(`✅ Application pattern matched: ${frameName}`);
            return true;
        }

        // Priority 3: Check if not in excluded paths
        if (this.isInExcludedPath(framePath)) {
            console.log(`❌ Excluded path detected: ${framePath}`);
            return false;
        }

        // Priority 4: Check if not infrastructure code
        if (this.isInfrastructureCode(frameName)) {
            console.log(`❌ Infrastructure code detected: ${frameName}`);
            return false;
        }

        // Default: If in project directory and not obviously infrastructure, consider it application logic
        const isProject = this.isProjectCode(framePath);
        console.log(`${isProject ? '✅' : '❌'} Project code check: ${framePath}`);
        return isProject;
    }

    private isFrameworkCode(framePath: string, frameName: string): boolean {
        return this.config.frameworkPatterns.some(pattern => 
            framePath.includes(pattern) || frameName.includes(pattern)
        );
    }

    private isInIncludedPath(framePath: string): boolean {
        return this.config.pathInclusions.some(pattern => 
            framePath.includes(pattern)
        );
    }

    private matchesApplicationPatterns(frameName: string): boolean {
        return this.config.applicationPatterns.some(pattern => 
            frameName.includes(pattern)
        );
    }

    private isInExcludedPath(framePath: string): boolean {
        return this.config.pathExclusions.some(pattern => 
            framePath.includes(pattern)
        );
    }

    private isInfrastructureCode(frameName: string): boolean {
        return this.config.infrastructurePatterns.some(pattern => 
            frameName.includes(pattern)
        );
    }

    private isProjectCode(framePath: string): boolean {
        // Consider it project code if it's not in standard Go directories
        const standardGoPaths = ['/go/src/', '/usr/local/go/', '/pkg/mod/', 'vendor/'];
        const isNotStandard = !standardGoPaths.some(path => framePath.includes(path));
        const hasPath = framePath.length > 0;
        const isLocalProject = framePath.includes('/Users/') || framePath.includes('/home/');
        
        return isNotStandard && hasPath && isLocalProject;
    }

    private async findAllThreadsWithApplicationLogic(): Promise<{threadId: number, frame: DelveFrame}[]> {
        const now = Date.now();
        
        // Optimization: Use cache if recent
        if (now - this.lastApplicationLogicCheck < this.config.cacheTimeout && this.applicationThreadsCache.size > 0) {
            const cached = Array.from(this.applicationThreadsCache.entries()).map(([threadId, frame]) => ({threadId, frame}));
            console.log(`🚀 Using cached application threads: ${cached.length} found`);
            return cached;
        }

        if (!this.currentSession) {
            return [];
        }

        try {
            const threadsResponse = await this.currentSession.customRequest('threads');
            if (!threadsResponse.threads) {
                return [];
            }

            const applicationThreads: {threadId: number, frame: DelveFrame}[] = [];
            this.applicationThreadsCache.clear();

            console.log(`🔍 Checking ${threadsResponse.threads.length} threads for application logic...`);

            // Check each thread for application logic
            for (const thread of threadsResponse.threads) {
                try {
                    const stackTrace = await this.currentSession.customRequest('stackTrace', {
                        threadId: thread.id,
                        startFrame: 0,
                        levels: 10
                    });

                    if (stackTrace.stackFrames && stackTrace.stackFrames.length > 0) {
                        const frames = stackTrace.stackFrames.map((frame: any) => ({
                            id: frame.id,
                            name: frame.name,
                            source: frame.source,
                            line: frame.line,
                            column: frame.column
                        }));

                        console.log(`🔍 Thread ${thread.id} stack trace (${frames.length} frames):`);
                        frames.slice(0, 5).forEach((frame, index) => {
                            console.log(`  ${index}: ${frame.name} (${frame.source?.path || 'no-path'}:${frame.line})`);
                        });

                        // Find first application logic frame
                        for (const frame of frames) {
                            if (this.isApplicationLogicFrame(frame)) {
                                console.log(`✅ Found application logic in thread ${thread.id}: ${frame.name}`);
                                const result = { threadId: thread.id, frame };
                                this.applicationThreadsCache.set(thread.id, frame);
                                applicationThreads.push(result);
                                break; // Only take the first application frame per thread
                            }
                        }
                    }
                } catch (error) {
                    console.log(`⚠️ Could not analyze thread ${thread.id}: ${error.message}`);
                }
            }

            this.lastApplicationLogicCheck = now;
            
            console.log(`✅ Found ${applicationThreads.length} application logic threads at 2025-06-08 06:20:12`);
            return applicationThreads;
        } catch (error) {
            console.error('❌ Error finding application logic threads at 2025-06-08 06:20:12:', error);
            return [];
        }
    }

    notifyStoppedManually(threadId: number | null) {
        // Clear any pending notifications
        this.clearTimeouts();

        // Debounce rapid notifications and prevent oscillation
        this.notificationTimeout = setTimeout(async () => {
            console.log('🛑 Processing stop notification at 2025-06-08 06:20:12:', threadId);
            this.isStopped = true;
            
            // Find application logic threads
            const applicationThreads = await this.findAllThreadsWithApplicationLogic();
            
            if (applicationThreads.length > 0) {
                const bestThread = applicationThreads[0];
                
                // Prevent oscillation by sticking with a thread for a minimum time
                if (this.lastDetectedThreadId === bestThread.threadId || !this.lastDetectedThreadId) {
                    this.currentThreadId = bestThread.threadId;
                    this.lastDetectedThreadId = bestThread.threadId;
                    this.applicationFrame = bestThread.frame;
                    this.stoppedFrameId = bestThread.frame.id;
                    
                    console.log(`🎯 Using application logic thread ${bestThread.threadId}: ${bestThread.frame.name}`);
                    
                    // Set stability timeout to prevent immediate switching
                    this.threadStabilityTimeout = setTimeout(() => {
                        this.lastDetectedThreadId = null;
                    }, 2000); // 2 seconds stability
                    
                } else {
                    // Keep current thread for stability
                    this.currentThreadId = threadId;
                    console.log(`🔒 Keeping current thread ${threadId} for stability`);
                }
            } else {
                // No application logic found, use provided thread
                this.currentThreadId = threadId;
                this.applicationFrame = null;
                this.stoppedFrameId = null;
                console.log(`⚠️ No application logic found, using thread ${threadId}`);
            }
            
            this.emit('stopped', { threadId: this.currentThreadId, reason: 'manual-detection' });
        }, 100); // 100ms debounce
    }

    notifyContinuedManually() {
        this.clearTimeouts();
        
        console.log('▶️ Manual continue notification at 2025-06-08 06:20:12');
        this.isStopped = false;
        this.currentThreadId = null;
        this.stoppedFrameId = null;
        this.applicationFrame = null;
        this.lastDetectedThreadId = null;
        this.clearCaches();
        this.emit('continued', { reason: 'manual-detection' });
    }

    async getCurrentFrame(): Promise<DelveFrame | null> {
        if (!this.isStoppedAtBreakpoint()) {
            console.log('❌ Cannot get current frame - debugger not stopped at 2025-06-08 06:20:12');
            return null;
        }

        if (this.applicationFrame) {
            console.log('✅ Using cached application frame at 2025-06-08 06:20:12:', this.applicationFrame.name);
            return this.applicationFrame;
        }

        // Force refresh application threads
        this.lastApplicationLogicCheck = 0;
        const applicationThreads = await this.findAllThreadsWithApplicationLogic();
        
        if (applicationThreads.length > 0) {
            const bestThread = applicationThreads[0];
            console.log(`🔄 Switching to application logic thread ${bestThread.threadId} at 2025-06-08 06:20:12`);
            this.currentThreadId = bestThread.threadId;
            this.applicationFrame = bestThread.frame;
            this.stoppedFrameId = bestThread.frame.id;
            return bestThread.frame;
        }

        console.log('⚠️ No application frame available at 2025-06-08 06:20:12');
        return null;
    }

    async getCurrentDebugState(): Promise<DebugState> {
        const now = Date.now();
        
        // Rate limiting
        if (now - this.lastStateCheck < this.minStateCheckInterval) {
            return { stopped: this.isStopped, threadId: this.currentThreadId };
        }
        this.lastStateCheck = now;

        if (!this.currentSession) {
            return { stopped: false, threadId: null };
        }

        try {
            // Check application logic threads first
            const applicationThreads = await this.findAllThreadsWithApplicationLogic();
            
            if (applicationThreads.length > 0) {
                const bestThread = applicationThreads[0];
                return { 
                    stopped: true, 
                    threadId: bestThread.threadId,
                    reason: 'breakpoint-in-application-logic'
                };
            }

            // Fallback: Check for any stopped thread
            const threadsResponse = await this.currentSession.customRequest('threads');
            if (!threadsResponse.threads || threadsResponse.threads.length === 0) {
                return { stopped: false, threadId: null };
            }

            // Check first few threads for stopped state
            for (const thread of threadsResponse.threads.slice(0, 3)) {
                try {
                    const stackTrace = await this.currentSession.customRequest('stackTrace', {
                        threadId: thread.id,
                        startFrame: 0,
                        levels: 1
                    });
                    
                    if (stackTrace.stackFrames && stackTrace.stackFrames.length > 0) {
                        return { 
                            stopped: true, 
                            threadId: thread.id,
                            reason: 'infrastructure-breakpoint'
                        };
                    }
                } catch (error) {
                    // Continue to next thread
                }
            }
            
            return { stopped: false, threadId: null };
        } catch (error) {
            return { stopped: false, threadId: null };
        }
    }

    async getStackTrace(): Promise<DelveFrame[]> {
        if (!this.isStoppedAtBreakpoint()) {
            console.log('❌ Cannot get stack trace - debugger not stopped at 2025-06-08 06:20:12');
            return [];
        }

        try {
            const stackTrace = await this.currentSession!.customRequest('stackTrace', {
                threadId: this.currentThreadId,
                startFrame: 0,
                levels: 20
            });

            if (stackTrace.stackFrames) {
                const frames = stackTrace.stackFrames.map((frame: any) => ({
                    id: frame.id,
                    name: frame.name,
                    source: frame.source,
                    line: frame.line,
                    column: frame.column
                }));
                console.log(`✅ Got ${frames.length} stack frames for thread ${this.currentThreadId} at 2025-06-08 06:20:12`);
                return frames;
            }
        } catch (error) {
            console.error('❌ Error getting stack trace at 2025-06-08 06:20:12:', error.message);
        }

        return [];
    }

    async getScopes(): Promise<DelveScope[]> {
        if (!this.isStoppedAtBreakpoint()) {
            console.log('❌ Cannot get scopes - no valid frame at 2025-06-08 06:20:12');
            return [];
        }

        const frameId = this.applicationFrame?.id;
        if (!frameId) {
            console.log('❌ No application logic frame available for scopes at 2025-06-08 06:20:12');
            return [];
        }

        try {
            const scopes = await this.currentSession!.customRequest('scopes', {
                frameId: frameId
            });

            if (scopes.scopes) {
                const scopeList = scopes.scopes.map((scope: any) => ({
                    name: scope.name,
                    variablesReference: scope.variablesReference,
                    expensive: scope.expensive || false
                }));
                console.log(`✅ Got ${scopeList.length} scopes at 2025-06-08 06:20:12:`, scopeList.map(s => s.name));
                return scopeList;
            }
        } catch (error) {
            console.error('❌ Error getting scopes at 2025-06-08 06:20:12:', error.message);
        }

        return [];
    }

    async getScopeVariables(variablesReference: number): Promise<DelveVariable[]> {
        if (!this.isStoppedAtBreakpoint() || variablesReference === 0) {
            return [];
        }

        try {
            const variables = await this.currentSession!.customRequest('variables', {
                variablesReference
            });

            if (variables.variables) {
                const varList = variables.variables.map((variable: any) => ({
                    name: variable.name,
                    value: variable.value,
                    type: variable.type,
                    variablesReference: variable.variablesReference,
                    evaluateName: variable.evaluateName
                }));
                console.log(`✅ Got ${varList.length} variables at 2025-06-08 06:20:12`);
                return varList;
            }
        } catch (error) {
            console.error('❌ Error getting variables at 2025-06-08 06:20:12:', error.message);
        }

        return [];
    }

    async getFrameVariables(frameId: number): Promise<Record<string, any>> {
        if (!this.isStoppedAtBreakpoint()) {
            return {};
        }

        try {
            const scopes = await this.currentSession!.customRequest('scopes', { frameId });
            const variables: Record<string, any> = {};

            if (scopes.scopes) {
                for (const scope of scopes.scopes) {
                    const scopeVars = await this.currentSession!.customRequest('variables', {
                        variablesReference: scope.variablesReference
                    });

                    if (scopeVars.variables) {
                        for (const variable of scopeVars.variables) {
                            variables[variable.name] = variable.value;
                        }
                    }
                }
            }

            console.log(`✅ Got frame variables at 2025-06-08 06:20:12:`, Object.keys(variables));
            return variables;
        } catch (error) {
            console.error('❌ Error getting frame variables at 2025-06-08 06:20:12:', error.message);
            return {};
        }
    }

    async forceCheckStopped(): Promise<boolean> {
        console.log('🔍 Force checking if debugger is stopped at 2025-06-08 06:20:12...');
        
        // Clear caches to force fresh detection
        this.clearCaches();
        
        const state = await this.getCurrentDebugState();
        
        if (state.stopped) {
            console.log('✅ Force check: We ARE stopped at 2025-06-08 06:20:12');
            this.isStopped = true;
            this.currentThreadId = state.threadId;
            
            const applicationThreads = await this.findAllThreadsWithApplicationLogic();
            if (applicationThreads.length > 0) {
                const bestThread = applicationThreads[0];
                this.currentThreadId = bestThread.threadId;
                this.applicationFrame = bestThread.frame;
                this.stoppedFrameId = bestThread.frame.id;
                console.log(`🎯 Found application logic in thread ${bestThread.threadId} at 2025-06-08 06:20:12: ${bestThread.frame.name}`);
            }
            
            this.emit('stopped', { threadId: state.threadId, reason: 'forced-check' });
            return true;
        } else {
            console.log('❌ Force check: We are NOT stopped at 2025-06-08 06:20:12');
            this.isStopped = false;
            this.currentThreadId = null;
            this.stoppedFrameId = null;
            this.applicationFrame = null;
            return false;
        }
    }

    getConfiguration(): BusinessLogicConfig {
        return { ...this.config };
    }

    updateConfiguration(newConfig: Partial<BusinessLogicConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.clearCaches();
        console.log('🔧 DelveClient: Configuration updated at 2025-06-08 06:20:12');
    }

    dispose() {
        console.log('🧹 Disposing DelveClient at 2025-06-08 06:20:12');
        this.clearTimeouts();
        this.clearCaches();
        this.detachFromSession();
        this.removeAllListeners();
    }
}