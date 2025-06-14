import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { DebuggerProtocol, DebugFrame, DebugScope, DebugVariable, DebugState } from './debuggerProtocol';

export class CppDebuggerProtocol extends EventEmitter implements DebuggerProtocol {
    public currentSession: vscode.DebugSession | null = null;
    private isAttached = false;
    private currentThreadId: number | null = null;
    private currentFrameId: number | null = null;

    constructor() {
        super();
        console.log(`🔧 CppDebuggerProtocol initialized at 2025-06-14 09:29:38`);
    }

    attachToSession(session: vscode.DebugSession): void {
        console.log(`🔗 C++ debugger: Attaching to session: ${session.name} at 2025-06-14 09:29:38`);
        this.currentSession = session;
        this.isAttached = true;
        this.currentThreadId = null;
        this.currentFrameId = null;
        this.emit('attached', session);
        console.log(`✅ C++ debugger: Attached successfully at 2025-06-14 09:29:38`);
    }

    detachFromSession(): void {
        console.log(`🔌 C++ debugger: Detaching from session at 2025-06-14 09:29:38`);
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

    async notifyStoppedFromVSCode(): Promise<void> {
        console.log(`🛑 C++ debug stopped - detecting context at 2025-06-14 09:29:38`);
        
        const activeStackItem = vscode.debug.activeStackItem;
        
        if (activeStackItem && activeStackItem.session === this.currentSession) {
            this.currentThreadId = activeStackItem.threadId;
            
            console.log(`🎯 Using C++ active thread: ${this.currentThreadId} at 2025-06-14 09:29:38`);
            
            try {
                const stackTrace = await this.currentSession!.customRequest('stackTrace', {
                    threadId: this.currentThreadId,
                    startFrame: 0,
                    levels: 1
                });
                
                if (stackTrace.stackFrames && stackTrace.stackFrames.length > 0) {
                    this.currentFrameId = stackTrace.stackFrames[0].id;
                    console.log(`🎯 C++ current frame ID: ${this.currentFrameId}, frame: ${stackTrace.stackFrames[0].name}`);
                }
            } catch (error) {
                console.error(`❌ Error getting C++ current frame at 2025-06-14 09:29:38:`, error);
            }
        } else {
            await this.detectStoppedThread();
        }
        
        this.emit('stopped', { 
            threadId: this.currentThreadId,
            frameId: this.currentFrameId,
            reason: 'cpp-breakpoint' 
        });
    }

    notifyContinuedFromVSCode(): void {
        console.log(`▶️ C++ debug continued at 2025-06-14 09:29:38`);
        this.currentThreadId = null;
        this.currentFrameId = null;
        this.emit('continued', { reason: 'cpp-continue' });
    }

    async getCurrentFrame(): Promise<DebugFrame | null> {
        if (!this.currentThreadId || !this.currentSession) {
            console.log(`❌ No C++ current thread or session at 2025-06-14 09:29:38`);
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
                
                console.log(`✅ C++ current frame at 2025-06-14 09:29:38: ${frame.name}`);
                
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
            console.error(`❌ Error getting C++ current frame at 2025-06-14 09:29:38:`, error);
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

    async getStackTrace(): Promise<DebugFrame[]> {
        if (!this.currentThreadId || !this.currentSession) {
            console.log(`❌ Cannot get C++ stack trace - no current thread at 2025-06-14 09:29:38`);
            return [];
        }

        try {
            const stackTrace = await this.currentSession.customRequest('stackTrace', {
                threadId: this.currentThreadId,
                startFrame: 0,
                levels: 25
            });

            if (stackTrace.stackFrames) {
                const frames = stackTrace.stackFrames.map((frame: any) => ({
                    id: frame.id,
                    name: frame.name || 'unknown',
                    source: frame.source,
                    line: frame.line,
                    column: frame.column
                }));
                console.log(`✅ Got ${frames.length} C++ stack frames for thread ${this.currentThreadId} at 2025-06-14 09:29:38`);
                return frames;
            }
        } catch (error) {
            console.error(`❌ Error getting C++ stack trace at 2025-06-14 09:29:38:`, error.message);
        }

        return [];
    }

    async getScopes(): Promise<DebugScope[]> {
        if (!this.currentFrameId || !this.currentSession) {
            console.log(`❌ Cannot get C++ scopes - no current frame at 2025-06-14 09:29:38`);
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
                console.log(`✅ Got ${scopeList.length} C++ scopes at 2025-06-14 09:29:38:`, scopeList.map(s => s.name));
                return scopeList;
            }
        } catch (error) {
            console.error(`❌ Error getting C++ scopes at 2025-06-14 09:29:38:`, error.message);
        }

        return [];
    }

    async getScopeVariables(variablesReference: number): Promise<DebugVariable[]> {
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
                console.log(`✅ Got ${varList.length} C++ variables at 2025-06-14 09:29:38`);
                return varList;
            }
        } catch (error) {
            console.error(`❌ Error getting C++ variables at 2025-06-14 09:29:38:`, error.message);
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
                    // Skip registers and other system scopes in C++
                    if (scope.name === 'Registers' || scope.name === 'Disassembly') {
                        continue;
                    }

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

            console.log(`✅ Got C++ frame variables at 2025-06-14 09:29:38:`, Object.keys(variables));
            return variables;
        } catch (error) {
            console.error(`❌ Error getting C++ frame variables at 2025-06-14 09:29:38:`, error.message);
            return {};
        }
    }

    getCurrentThreadId(): number | null {
        return this.currentThreadId;
    }

    getCurrentFrameId(): number | null {
        return this.currentFrameId;
    }

    private async detectStoppedThread(): Promise<void> {
        if (!this.currentSession) return;
        
        try {
            const threadsResponse = await this.currentSession.customRequest('threads');
            
            if (threadsResponse.threads && threadsResponse.threads.length > 0) {
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
                            console.log(`🔍 Detected C++ stopped thread: ${this.currentThreadId}, frame: ${stackTrace.stackFrames[0].name}`);
                            break;
                        }
                    } catch (error) {
                        // Continue to next thread
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Error detecting C++ stopped thread at 2025-06-14 09:29:38:`, error);
        }
    }

    dispose(): void {
        console.log(`🧹 Disposing CppDebuggerProtocol at 2025-06-14 09:29:38`);
        this.detachFromSession();
        this.removeAllListeners();
    }
}