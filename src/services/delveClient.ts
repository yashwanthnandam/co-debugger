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

export class DelveClient extends EventEmitter {
    private currentSession: vscode.DebugSession | null = null;
    private isAttached = false;
    private isStopped = false;
    private currentThreadId: number | null = null;
    private stoppedFrameId: number | null = null;
    private applicationFrame: DelveFrame | null = null;
    
    // Optimization: Cache and debouncing
    private businessThreadsCache: Map<number, DelveFrame> = new Map();
    private lastBusinessLogicCheck = 0;
    private businessLogicCacheTimeout = 5000; // 5 seconds
    
    // Optimization: Rate limiting
    private lastStateCheck = 0;
    private minStateCheckInterval = 200; // Minimum 200ms between checks
    
    // Optimization: Debounced notification
    private notificationTimeout: NodeJS.Timeout | null = null;

    constructor() {
        super();
    }

    attachToSession(session: vscode.DebugSession) {
        console.log('🔗 DelveClient: Attaching to session:', session.name);
        this.currentSession = session;
        this.isAttached = true;
        this.isStopped = false;
        this.currentThreadId = null;
        this.stoppedFrameId = null;
        this.applicationFrame = null;
        this.clearCaches();
        
        this.emit('attached', session);
        console.log('✅ DelveClient: Attached successfully');
    }

    detachFromSession() {
        console.log('🔌 DelveClient: Detaching from session');
        this.currentSession = null;
        this.isAttached = false;
        this.isStopped = false;
        this.currentThreadId = null;
        this.stoppedFrameId = null;
        this.applicationFrame = null;
        this.clearCaches();
        this.emit('detached');
    }

    private clearCaches() {
        this.businessThreadsCache.clear();
        this.lastBusinessLogicCheck = 0;
        this.lastStateCheck = 0;
    }

    isConnected(): boolean {
        return this.isAttached && this.currentSession !== null;
    }

    isStoppedAtBreakpoint(): boolean {
        return this.isStopped && this.currentThreadId !== null;
    }

    private isBusinessLogicFrame(frame: DelveFrame): boolean {
        const framePath = frame.source?.path || '';
        const frameName = frame.name || '';
        
        // Optimized pattern matching with early returns
        if (frameName.includes('Handler).')) return true;
        if (frameName.includes('UseCase).')) return true;
        if (frameName.includes('Service).')) return true;
        if (framePath.includes('astrology-services/internal/')) return true;
        
        // More specific patterns for exact matching
        const businessPatterns = [
            '.(*ReportHandler).GetPlanetaryReport',
            '.(*ReportHandler).GetGeneralReport', 
            '.(*ReportHandler).GetVimshottariReport',
            '.(*ReportHandler).GetYogaReport',
            '.(*KundaliHandler).GetKundali',
            '.(*DashaHandler).GetDasha',
            '.(*RemedyHandler).GetRudrakshaSuggestion',
            '.(*RemedyHandler).GetGemstoneSuggestion',
            '.(*DoshaHandler).GetDoshaAnalysis',
            '.(*MatchHandler).GetKundaliMatching',
            '.(*AshtakvargaHandler).GetAshtakvarga'
        ];
        
        return businessPatterns.some(pattern => frameName.includes(pattern));
    }

    private async findAllThreadsWithBusinessLogic(): Promise<{threadId: number, frame: DelveFrame}[]> {
        const now = Date.now();
        
        // Optimization: Use cache if recent
        if (now - this.lastBusinessLogicCheck < this.businessLogicCacheTimeout && this.businessThreadsCache.size > 0) {
            const cached = Array.from(this.businessThreadsCache.entries()).map(([threadId, frame]) => ({threadId, frame}));
            console.log(`🚀 Using cached business threads: ${cached.length} found`);
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

            const businessThreads: {threadId: number, frame: DelveFrame}[] = [];
            this.businessThreadsCache.clear();

            // Optimization: Parallel thread checking with Promise.allSettled
            const threadChecks = threadsResponse.threads.map(async (thread: any) => {
                try {
                    const stackTrace = await this.currentSession!.customRequest('stackTrace', {
                        threadId: thread.id,
                        startFrame: 0,
                        levels: 5 // Reduced from 10 for performance
                    });

                    if (stackTrace.stackFrames) {
                        const frames = stackTrace.stackFrames.map((frame: any) => ({
                            id: frame.id,
                            name: frame.name,
                            source: frame.source,
                            line: frame.line,
                            column: frame.column
                        }));

                        // Find first business logic frame
                        for (const frame of frames) {
                            if (this.isBusinessLogicFrame(frame)) {
                                const result = { threadId: thread.id, frame };
                                this.businessThreadsCache.set(thread.id, frame);
                                return result;
                            }
                        }
                    }
                } catch (error) {
                    // Thread not stopped, ignore
                }
                return null;
            });

            const results = await Promise.allSettled(threadChecks);
            results.forEach(result => {
                if (result.status === 'fulfilled' && result.value) {
                    businessThreads.push(result.value);
                }
            });

            this.lastBusinessLogicCheck = now;
            
            if (businessThreads.length > 0) {
                console.log(`✅ Found ${businessThreads.length} business logic threads`);
            }

            return businessThreads;
        } catch (error) {
            console.error('❌ Error finding business logic threads:', error);
            return [];
        }
    }

    async getCurrentDebugState(): Promise<DebugState> {
        const now = Date.now();
        
        // Optimization: Rate limiting
        if (now - this.lastStateCheck < this.minStateCheckInterval) {
            return { stopped: this.isStopped, threadId: this.currentThreadId };
        }
        this.lastStateCheck = now;

        if (!this.currentSession) {
            return { stopped: false, threadId: null };
        }

        try {
            // Optimization: Check business logic threads first
            const businessThreads = await this.findAllThreadsWithBusinessLogic();
            
            if (businessThreads.length > 0) {
                const bestThread = businessThreads[0];
                return { 
                    stopped: true, 
                    threadId: bestThread.threadId,
                    reason: 'breakpoint-in-business-logic'
                };
            }

            // Fallback: Quick check for any stopped thread
            const threadsResponse = await this.currentSession.customRequest('threads');
            if (!threadsResponse.threads || threadsResponse.threads.length === 0) {
                return { stopped: false, threadId: null };
            }

            // Optimization: Check only first few threads for stopped state
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

    notifyStoppedManually(threadId: number | null) {
        // Clear any pending notification
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }

        // Debounce rapid notifications
        this.notificationTimeout = setTimeout(async () => {
            console.log('🛑 Processing stop notification:', threadId);
            this.isStopped = true;
            this.currentThreadId = threadId;
            
            const businessThreads = await this.findAllThreadsWithBusinessLogic();
            if (businessThreads.length > 0) {
                const bestThread = businessThreads[0];
                if (bestThread.threadId !== threadId) {
                    console.log(`🔄 Switching to business logic thread ${bestThread.threadId}`);
                    this.currentThreadId = bestThread.threadId;
                }
                this.applicationFrame = bestThread.frame;
                this.stoppedFrameId = bestThread.frame.id;
            }
            
            this.emit('stopped', { threadId: this.currentThreadId, reason: 'manual-detection' });
        }, 100); // 100ms debounce
    }

    notifyContinuedManually() {
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
            this.notificationTimeout = null;
        }
        
        console.log('▶️ Manual continue notification');
        this.isStopped = false;
        this.currentThreadId = null;
        this.stoppedFrameId = null;
        this.applicationFrame = null;
        this.clearCaches();
        this.emit('continued', { reason: 'manual-detection' });
    }

    async getCurrentFrame(): Promise<DelveFrame | null> {
        if (!this.isStoppedAtBreakpoint()) {
            console.log('❌ Cannot get current frame - debugger not stopped');
            return null;
        }

        if (this.applicationFrame) {
            console.log('✅ Using cached application frame:', this.applicationFrame.name);
            return this.applicationFrame;
        }

        const businessThreads = await this.findAllThreadsWithBusinessLogic();
        if (businessThreads.length > 0) {
            const bestThread = businessThreads[0];
            console.log(`🔄 Switching to business logic thread ${bestThread.threadId}`);
            this.currentThreadId = bestThread.threadId;
            this.applicationFrame = bestThread.frame;
            this.stoppedFrameId = bestThread.frame.id;
            return bestThread.frame;
        }

        console.log('⚠️ No application frame available');
        return null;
    }

    async getStackTrace(): Promise<DelveFrame[]> {
        if (!this.isStoppedAtBreakpoint()) {
            console.log('❌ Cannot get stack trace - debugger not stopped');
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
                console.log(`✅ Got ${frames.length} stack frames for thread ${this.currentThreadId}`);
                return frames;
            }
        } catch (error) {
            console.error('❌ Error getting stack trace:', error.message);
        }

        return [];
    }

    async getScopes(): Promise<DelveScope[]> {
        if (!this.isStoppedAtBreakpoint()) {
            console.log('❌ Cannot get scopes - no valid frame');
            return [];
        }

        const frameId = this.applicationFrame?.id;
        if (!frameId) {
            console.log('❌ No business logic frame available for scopes');
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
                console.log(`✅ Got ${scopeList.length} scopes:`, scopeList.map(s => s.name));
                return scopeList;
            }
        } catch (error) {
            console.error('❌ Error getting scopes:', error.message);
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
                console.log(`✅ Got ${varList.length} variables`);
                return varList;
            }
        } catch (error) {
            console.error('❌ Error getting variables:', error.message);
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

            console.log(`✅ Got frame variables:`, Object.keys(variables));
            return variables;
        } catch (error) {
            console.error('❌ Error getting frame variables:', error.message);
            return {};
        }
    }

    async forceCheckStopped(): Promise<boolean> {
        console.log('🔍 Force checking if debugger is stopped...');
        
        const state = await this.getCurrentDebugState();
        
        if (state.stopped) {
            console.log('✅ Force check: We ARE stopped');
            this.isStopped = true;
            this.currentThreadId = state.threadId;
            
            const businessThreads = await this.findAllThreadsWithBusinessLogic();
            if (businessThreads.length > 0) {
                const bestThread = businessThreads[0];
                this.currentThreadId = bestThread.threadId;
                this.applicationFrame = bestThread.frame;
                this.stoppedFrameId = bestThread.frame.id;
                console.log(`🎯 Found business logic in thread ${bestThread.threadId}: ${bestThread.frame.name}`);
            }
            
            this.emit('stopped', { threadId: state.threadId, reason: 'forced-check' });
            return true;
        } else {
            console.log('❌ Force check: We are NOT stopped');
            this.isStopped = false;
            this.currentThreadId = null;
            this.stoppedFrameId = null;
            this.applicationFrame = null;
            return false;
        }
    }

    dispose() {
        console.log('🧹 Disposing DelveClient');
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
            this.notificationTimeout = null;
        }
        this.clearCaches();
        this.detachFromSession();
        this.removeAllListeners();
    }
}