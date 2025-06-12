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
    currentThreadId: number | null;
    currentFrameId: number | null;
    session: vscode.DebugSession | null;
}

export class DelveClient extends EventEmitter {
    public currentSession: vscode.DebugSession | null = null;
    private isAttached = false;
    private currentThreadId: number | null = null;
    private currentFrameId: number | null = null;

    constructor() {
        super();
        console.log(`🚀 DelveClient initialized`);
    }

    attachToSession(session: vscode.DebugSession) {
        console.log(`🔗 DelveClient: Attaching to session: ${session.name} at 2025-06-09 03:05:14`);
        this.currentSession = session;
        this.isAttached = true;
        this.currentThreadId = null;
        this.currentFrameId = null;
        this.emit('attached', session);
        console.log(`✅ DelveClient: Attached successfully at 2025-06-09 03:05:14`);
    }

    detachFromSession() {
        console.log(`🔌 DelveClient: Detaching from session at 2025-06-09 03:05:14`);
        this.currentSession = null;
        this.isAttached = false;
        this.currentThreadId = null;
        this.currentFrameId = null;
        this.emit('detached');
    }

    isConnected(): boolean {
        return this.isAttached && this.currentSession !== null;
    }

    isStoppedAtBreakpoint(): boolean {
        return this.isConnected() && this.currentThreadId !== null;
    }

    async notifyStoppedFromVSCode() {
        console.log(`🛑 Debug stopped - detecting VS Code context at 2025-06-09 03:05:14`);
        
        // Use VS Code's active debug context to get current thread
        const activeStackItem = vscode.debug.activeStackItem;
        
        if (activeStackItem && activeStackItem.session === this.currentSession) {
            this.currentThreadId = activeStackItem.threadId;
            
            console.log(`🎯 Using VS Code's active thread: ${this.currentThreadId} at 2025-06-09 03:05:14`);
            
            // Get the current frame from the thread
            try {
                const stackTrace = await this.currentSession!.customRequest('stackTrace', {
                    threadId: this.currentThreadId,
                    startFrame: 0,
                    levels: 1
                });
                
                if (stackTrace.stackFrames && stackTrace.stackFrames.length > 0) {
                    this.currentFrameId = stackTrace.stackFrames[0].id;
                    console.log(`🎯 Current frame ID: ${this.currentFrameId}, frame: ${stackTrace.stackFrames[0].name}`);
                }
            } catch (error) {
                console.error(`❌ Error getting current frame at 2025-06-09 03:05:14:`, error);
            }
        } else {
            console.log(`⚠️ No active stack item or session mismatch at 2025-06-09 03:05:14`);
            // Fallback: try to detect stopped thread
            await this.detectStoppedThread();
        }
        
        this.emit('stopped', { 
            threadId: this.currentThreadId,
            frameId: this.currentFrameId,
            reason: 'vscode-context' 
        });
    }

    private async detectStoppedThread() {
        if (!this.currentSession) return;
        
        try {
            const threadsResponse = await this.currentSession.customRequest('threads');
            
            if (threadsResponse.threads && threadsResponse.threads.length > 0) {
                // Try first thread that has a stack trace
                for (const thread of threadsResponse.threads) {
                    try {
                        const stackTrace = await this.currentSession.customRequest('stackTrace', {
                            threadId: thread.id,
                            startFrame: 0,
                            levels: 1
                        });
                        
                        if (stackTrace.stackFrames && stackTrace.stackFrames.length > 0) {
                            this.currentThreadId = thread.id;
                            this.currentFrameId = stackTrace.stackFrames[0].id;
                            console.log(`🔍 Detected stopped thread: ${this.currentThreadId}, frame: ${stackTrace.stackFrames[0].name}`);
                            break;
                        }
                    } catch (error) {
                        // Continue to next thread
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Error detecting stopped thread at 2025-06-09 03:05:14:`, error);
        }
    }

    notifyContinuedFromVSCode() {
        console.log(`▶️ Debug continued at 2025-06-09 03:05:14`);
        this.currentThreadId = null;
        this.currentFrameId = null;
        this.emit('continued', { reason: 'vscode-context' });
    }

    async getCurrentFrame(): Promise<DelveFrame | null> {
        if (!this.currentThreadId || !this.currentSession) {
            console.log(`❌ No current thread or session at 2025-06-09 03:05:14`);
            return null;
        }

        try {
            const stackTrace = await this.currentSession.customRequest('stackTrace', {
                threadId: this.currentThreadId,
                startFrame: 0,
                levels: 1
            });

            if (stackTrace.stackFrames && stackTrace.stackFrames.length > 0) {
                const frame = stackTrace.stackFrames[0];
                this.currentFrameId = frame.id;
                
                console.log(`✅ Current frame at 2025-06-09 03:05:14: ${frame.name}`);
                
                return {
                    id: frame.id,
                    name: frame.name,
                    source: frame.source ? {
                        name: frame.source.name,
                        path: frame.source.path
                    } : undefined,
                    line: frame.line,
                    column: frame.column
                };
            }
        } catch (error) {
            console.error(`❌ Error getting current frame at 2025-06-09 03:05:14:`, error);
        }

        return null;
    }

    async getCurrentDebugState(): Promise<DebugState> {
        return {
            stopped: this.isStoppedAtBreakpoint(),
            currentThreadId: this.currentThreadId,
            currentFrameId: this.currentFrameId,
            session: this.currentSession
        };
    }

    async getStackTrace(): Promise<DelveFrame[]> {
        if (!this.currentThreadId || !this.currentSession) {
            console.log(`❌ Cannot get stack trace - no current thread at 2025-06-09 03:05:14`);
            return [];
        }

        try {
            const stackTrace = await this.currentSession.customRequest('stackTrace', {
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
                console.log(`✅ Got ${frames.length} stack frames for thread ${this.currentThreadId} at 2025-06-09 03:05:14`);
                return frames;
            }
        } catch (error) {
            console.error(`❌ Error getting stack trace at 2025-06-09 03:05:14:`, error.message);
        }

        return [];
    }

    async getScopes(): Promise<DelveScope[]> {
        if (!this.currentFrameId || !this.currentSession) {
            console.log(`❌ Cannot get scopes - no current frame at 2025-06-09 03:05:14`);
            return [];
        }

        try {
            const scopes = await this.currentSession.customRequest('scopes', {
                frameId: this.currentFrameId
            });

            if (scopes.scopes) {
                const scopeList = scopes.scopes.map((scope: any) => ({
                    name: scope.name,
                    variablesReference: scope.variablesReference,
                    expensive: scope.expensive || false
                }));
                console.log(`✅ Got ${scopeList.length} scopes at 2025-06-09 03:05:14:`, scopeList.map(s => s.name));
                return scopeList;
            }
        } catch (error) {
            console.error(`❌ Error getting scopes at 2025-06-09 03:05:14:`, error.message);
        }

        return [];
    }

    async getScopeVariables(variablesReference: number): Promise<DelveVariable[]> {
        if (!this.currentSession || variablesReference === 0) {
            return [];
        }

        try {
            const variables = await this.currentSession.customRequest('variables', {
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
                console.log(`✅ Got ${varList.length} variables at 2025-06-09 03:05:14`);
                return varList;
            }
        } catch (error) {
            console.error(`❌ Error getting variables at 2025-06-09 03:05:14:`, error.message);
        }

        return [];
    }

    async getFrameVariables(frameId: number): Promise<Record<string, any>> {
        if (!this.currentSession) {
            return {};
        }

        try {
            const scopes = await this.currentSession.customRequest('scopes', { frameId });
            const variables: Record<string, any> = {};

            if (scopes.scopes) {
                for (const scope of scopes.scopes) {
                    const scopeVars = await this.currentSession.customRequest('variables', {
                        variablesReference: scope.variablesReference
                    });

                    if (scopeVars.variables) {
                        for (const variable of scopeVars.variables) {
                            variables[variable.name] = variable.value;
                        }
                    }
                }
            }

            console.log(`✅ Got frame variables at 2025-06-09 03:05:14:`, Object.keys(variables));
            return variables;
        } catch (error) {
            console.error(`❌ Error getting frame variables at 2025-06-09 03:05:14:`, error.message);
            return {};
        }
    }

    getCurrentThreadId(): number | null {
        return this.currentThreadId;
    }

    getCurrentFrameId(): number | null {
        return this.currentFrameId;
    }

    getConfiguration() {
        return {
            useVSCodeContext: true,
            maxStackDepth: 20,
            maxVariablesPerScope: 100
        };
    }

    dispose() {
        console.log(`🧹 Disposing DelveClient at 2025-06-09 03:05:14`);
        this.detachFromSession();
        this.removeAllListeners();
    }
}