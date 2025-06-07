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
        this.emit('detached');
    }

    isConnected(): boolean {
        return this.isAttached && this.currentSession !== null;
    }

    isStoppedAtBreakpoint(): boolean {
        const stopped = this.isStopped && this.currentThreadId !== null;
        return stopped;
    }

    // NEW: Get current debug state by probing the DAP
    async getCurrentDebugState(): Promise<DebugState> {
        if (!this.currentSession) {
            return { stopped: false, threadId: null };
        }

        try {
            // Get threads first
            const threadsResponse = await this.currentSession.customRequest('threads');
            if (!threadsResponse.threads || threadsResponse.threads.length === 0) {
                return { stopped: false, threadId: null };
            }

            const thread = threadsResponse.threads[0];
            
            // Try to get stack trace - this will fail if running
            try {
                const stackTrace = await this.currentSession.customRequest('stackTrace', {
                    threadId: thread.id,
                    startFrame: 0,
                    levels: 1
                });
                
                // If we get stack frames, we're stopped
                if (stackTrace.stackFrames && stackTrace.stackFrames.length > 0) {
                    return { 
                        stopped: true, 
                        threadId: thread.id,
                        reason: 'breakpoint'
                    };
                }
            } catch (error) {
                // Stack trace failed = we're running
                return { stopped: false, threadId: null };
            }
            
            return { stopped: false, threadId: null };
        } catch (error) {
            return { stopped: false, threadId: null };
        }
    }

    // NEW: Manually notify that we detected a stop
    notifyStoppedManually(threadId: number | null) {
        console.log('🛑 Manual stop notification:', threadId);
        this.isStopped = true;
        this.currentThreadId = threadId;
        this.emit('stopped', { threadId, reason: 'manual-detection' });
    }

    // NEW: Manually notify that we detected continuation
    notifyContinuedManually() {
        console.log('▶️ Manual continue notification');
        this.isStopped = false;
        this.currentThreadId = null;
        this.stoppedFrameId = null;
        this.emit('continued', { reason: 'manual-detection' });
    }

    async getCurrentFrame(): Promise<DelveFrame | null> {
        if (!this.isStoppedAtBreakpoint()) {
            console.log('❌ Cannot get current frame - debugger not stopped');
            return null;
        }

        try {
            const stackTrace = await this.currentSession!.customRequest('stackTrace', {
                threadId: this.currentThreadId,
                startFrame: 0,
                levels: 1
            });

            if (stackTrace.stackFrames && stackTrace.stackFrames.length > 0) {
                const frame = stackTrace.stackFrames[0];
                this.stoppedFrameId = frame.id;
                console.log('✅ Got current frame:', frame.name);
                return {
                    id: frame.id,
                    name: frame.name,
                    source: frame.source,
                    line: frame.line,
                    column: frame.column
                };
            }
        } catch (error) {
            console.error('❌ Error getting current frame:', error.message);
        }

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
                console.log(`✅ Got ${frames.length} stack frames`);
                return frames;
            }
        } catch (error) {
            console.error('❌ Error getting stack trace:', error.message);
        }

        return [];
    }

    async getScopes(): Promise<DelveScope[]> {
        if (!this.isStoppedAtBreakpoint() || !this.stoppedFrameId) {
            console.log('❌ Cannot get scopes - no valid frame');
            return [];
        }

        try {
            const scopes = await this.currentSession!.customRequest('scopes', {
                frameId: this.stoppedFrameId
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

    // Keep the original forceCheckStopped for manual testing
    async forceCheckStopped(): Promise<boolean> {
        console.log('🔍 Force checking if debugger is stopped...');
        
        const state = await this.getCurrentDebugState();
        
        if (state.stopped) {
            console.log('✅ Force check: We ARE stopped');
            this.isStopped = true;
            this.currentThreadId = state.threadId;
            this.emit('stopped', { threadId: state.threadId, reason: 'forced-check' });
            return true;
        } else {
            console.log('❌ Force check: We are NOT stopped');
            this.isStopped = false;
            this.currentThreadId = null;
            this.stoppedFrameId = null;
            return false;
        }
    }

    dispose() {
        console.log('🧹 Disposing DelveClient');
        this.detachFromSession();
        this.removeAllListeners();
    }
}