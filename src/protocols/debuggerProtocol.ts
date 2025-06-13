import * as vscode from 'vscode';

export interface DebugFrame {
    id: number;
    name: string;
    source?: {
        name: string;
        path: string;
    };
    line: number;
    column: number;
}

export interface DebugScope {
    name: string;
    variablesReference: number;
    expensive: boolean;
}

export interface DebugVariable {
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

export interface DebuggerProtocol {
    readonly currentSession: vscode.DebugSession | null;
    
    attachToSession(session: vscode.DebugSession): void;
    detachFromSession(): void;
    isConnected(): boolean;
    isStoppedAtBreakpoint(): boolean;
    
    notifyStoppedFromVSCode(): Promise<void>;
    notifyContinuedFromVSCode(): void;
    
    getCurrentFrame(): Promise<DebugFrame | null>;
    getCurrentDebugState(): Promise<DebugState>;
    getStackTrace(): Promise<DebugFrame[]>;
    getScopes(): Promise<DebugScope[]>;
    getScopeVariables(variablesReference: number): Promise<DebugVariable[]>;
    getFrameVariables(frameId: number): Promise<Record<string, any>>;
    
    getCurrentThreadId(): number | null;
    getCurrentFrameId(): number | null;
    
    dispose(): void;
    
    // Event emitter methods
    on(event: string, listener: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): boolean;
}