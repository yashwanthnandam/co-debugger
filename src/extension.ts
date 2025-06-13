import * as vscode from 'vscode';
import { ContextSelectorView } from './views/contextSelectorView';
import { ContextCollector } from './services/contextCollector';
import { DelveClient } from './services/delveClient';
import { LLMService } from './services/llmService';
import { ExecutionPathGraphService } from './services/executionPathGraphService';
import { ExecutionPathGraphView } from './views/executionPathGraphView';
import { LanguageDetector } from './detection/languageDetector';
import { DebuggerFactory } from './factories/debuggerFactory';
import { SupportedLanguage } from './languages/languageHandler';

let contextCollector: ContextCollector;
let delveClient: DelveClient;
let llmService: LLMService;
let contextSelectorView: ContextSelectorView;
let executionPathGraphService: ExecutionPathGraphService;
let executionPathGraphView: ExecutionPathGraphView;
let currentLanguage: SupportedLanguage | null = null;

export function activate(context: vscode.ExtensionContext) {

    // Initialize LLM service
    llmService = new LLMService();

    // Register commands (same as before)
    context.subscriptions.push(
        vscode.commands.registerCommand('contextSelector.openView', () => {
            console.log(`📱 Opening Context Selector view at 2025-06-13 04:50:07`);
            contextSelectorView?.show();
        }),

        vscode.commands.registerCommand('contextSelector.showExecutionGraph', () => {
            console.log(`📊 Opening Execution Path Graph at 2025-06-13 04:50:07`);
            executionPathGraphView?.show();
        }),

        vscode.commands.registerCommand('contextSelector.refreshContext', async () => {
            console.log(`🔄 Manual refresh command triggered for ${currentLanguage || 'unknown'}`);
            try {
                await contextCollector?.refreshAll();
                contextSelectorView?.refresh();
                vscode.window.showInformationMessage(`✅ ${currentLanguage || 'Debug'} context refreshed successfully`);
            } catch (error) {
                console.error(`❌ Manual refresh failed`, error);
                vscode.window.showErrorMessage(`❌ Refresh failed: ${error.message}`);
            }
        }),

        vscode.commands.registerCommand('contextSelector.checkStopped', () => {
            if (contextCollector && delveClient) {
                const context = contextCollector.getContext();
                vscode.window.showInformationMessage(
                    `Language: ${currentLanguage?.toUpperCase() || 'Unknown'} | ` +
                    `Connected: ${context.debugInfo.isConnected ? '✅' : '❌'} | ` +
                    `Stopped: ${context.debugInfo.isStopped ? '✅' : '❌'} | ` +
                    `Variables: ${context.variables.length}`
                );
            } else {
                vscode.window.showWarningMessage('No active debug session');
            }
        })
    );

    // VS Code Debug Event Handlers
    const onStackItemChanged = vscode.debug.onDidChangeActiveStackItem((stackItem) => {
        if (stackItem && isLanguageSupported(stackItem.session.configuration.type)) {
            console.log(`🎯 VS Code active stack item changed at 2025-06-13 04:50:07:`, {
                sessionName: stackItem.session.name,
                threadId: stackItem.threadId,
                language: currentLanguage
            });
            
            delveClient?.notifyStoppedFromVSCode();
        } else if (!stackItem) {
            console.log(`🔄 VS Code active stack item cleared at 2025-06-13 04:50:07`);
            delveClient?.notifyContinuedFromVSCode();
        }
    });

    const onDebugSessionStarted = vscode.debug.onDidStartDebugSession((session) => {
        const detectedLanguage = LanguageDetector.detectLanguage(session);
        
        if (isLanguageSupported(session.configuration.type) || LanguageDetector.isLanguageSupported(detectedLanguage)) {
            console.log(`🔧 ${detectedLanguage} debug session started at 2025-06-13 04:50:07`, {
                name: session.name,
                type: session.type,
                configuration: session.configuration.name,
                detectedLanguage
            });
            
            currentLanguage = detectedLanguage;
            
            // Create appropriate DelveClient based on language
            delveClient = createLanguageAwareDelveClient(session, detectedLanguage);
            
            // Use existing ContextCollector unchanged
            contextCollector = new ContextCollector(delveClient);
            contextSelectorView = new ContextSelectorView(contextCollector, llmService, delveClient);
            executionPathGraphService = new ExecutionPathGraphService(contextCollector, delveClient);
            executionPathGraphView = new ExecutionPathGraphView(executionPathGraphService, context);
            
            delveClient.attachToSession(session);
            contextCollector.startCollection();
            
            vscode.window.showInformationMessage(
                `🚀 Universal Debugger AI connected to ${detectedLanguage.toUpperCase()} debugger`,
                'Open Context View',
                'Show Execution Graph'
            ).then(selection => {
                if (selection === 'Open Context View') {
                    vscode.commands.executeCommand('contextSelector.openView');
                } else if (selection === 'Show Execution Graph') {
                    vscode.commands.executeCommand('contextSelector.showExecutionGraph');
                }
            });
        }
    });

    const onDebugSessionTerminated = vscode.debug.onDidTerminateDebugSession((session) => {
        if (currentLanguage && (isLanguageSupported(session.configuration.type) || session === delveClient?.currentSession)) {
            console.log(`🔌 ${currentLanguage} debug session terminated at 2025-06-13 04:50:07:`, session.name);
            
            delveClient?.detachFromSession();
            contextCollector?.stopCollection();
            executionPathGraphService?.dispose();
            executionPathGraphView?.dispose();
            
            vscode.window.showInformationMessage(`🛑 Universal Debugger AI disconnected from ${currentLanguage.toUpperCase()} debugger`);
            
            // Clean up
            currentLanguage = null;
        }
    });

    const onDebugSessionChanged = vscode.debug.onDidChangeActiveDebugSession((session) => {
        if (session) {
            const detectedLanguage = LanguageDetector.detectLanguage(session);
            
            if (isLanguageSupported(session.configuration.type) || LanguageDetector.isLanguageSupported(detectedLanguage)) {
                console.log(`🔄 Active ${detectedLanguage} debug session changed at 2025-06-13 04:50:07:`, session.name);
                
                // If language changed, reinitialize
                if (currentLanguage !== detectedLanguage) {
                    console.log(`🔄 Switching from ${currentLanguage} to ${detectedLanguage} at 2025-06-13 04:50:07`);
                    
                    currentLanguage = detectedLanguage;
                    
                    // Dispose old collectors
                    contextCollector?.dispose();
                    executionPathGraphService?.dispose();
                    executionPathGraphView?.dispose();
                    
                    // Create new collectors for the language
                    delveClient = createLanguageAwareDelveClient(session, detectedLanguage);
                    contextCollector = new ContextCollector(delveClient);
                    contextSelectorView = new ContextSelectorView(contextCollector, llmService, delveClient);
                    executionPathGraphService = new ExecutionPathGraphService(contextCollector, delveClient);
                    executionPathGraphView = new ExecutionPathGraphView(executionPathGraphService, context);
                }
                
                delveClient?.attachToSession(session);
                contextCollector?.startCollection();
            }
        } else if (!session) {
            console.log(`🔌 No active debug session at 2025-06-13 04:50:07`);
        }
    });

    // Register all subscriptions (same as before)
    context.subscriptions.push(
        onStackItemChanged,
        onDebugSessionStarted, 
        onDebugSessionTerminated,
        onDebugSessionChanged
    );

    // Check for existing debug session (same as before)
    const activeSession = vscode.debug.activeDebugSession;
    const activeStackItem = vscode.debug.activeStackItem;
    
    if (activeSession) {
        const detectedLanguage = LanguageDetector.detectLanguage(activeSession);
        
        if (isLanguageSupported(activeSession.configuration.type) || LanguageDetector.isLanguageSupported(detectedLanguage)) {
            console.log(`🔍 Found existing ${detectedLanguage} debug session at 2025-06-13 04:50:07:`, activeSession.name);
            
            currentLanguage = detectedLanguage;
            delveClient = createLanguageAwareDelveClient(activeSession, detectedLanguage);
            contextCollector = new ContextCollector(delveClient);
            contextSelectorView = new ContextSelectorView(contextCollector, llmService, delveClient);
            executionPathGraphService = new ExecutionPathGraphService(contextCollector, delveClient);
            executionPathGraphView = new ExecutionPathGraphView(executionPathGraphService, context);
            
            delveClient.attachToSession(activeSession);
            contextCollector.startCollection();
            
            if (activeStackItem) {
                console.log(`🎯 Found existing active stack item at 2025-06-13 04:50:07:`, {
                    sessionName: activeStackItem.session.name,
                    threadId: activeStackItem.threadId,
                    language: currentLanguage
                });
                delveClient.notifyStoppedFromVSCode();
            }
        }
    }

    console.log(`✅ Universal Debugger AI fully activated with multi-language support at 2025-06-13 04:50:07`);
}

export function deactivate() {
    console.log(`👋 Universal Debugger AI: Deactivated at 2025-06-13 04:50:07`);
    
    try {
        delveClient?.dispose();
        contextCollector?.dispose();
        executionPathGraphService?.dispose();
        executionPathGraphView?.dispose();
        console.log(`✅ All resources disposed successfully at 2025-06-13 04:50:07`);
    } catch (error) {
        console.error(`❌ Error during deactivation at 2025-06-13 04:50:07:`, error);
    }
}

// Helper function to check if a debug type is supported
function isLanguageSupported(debugType: string): boolean {
    const supportedTypes = ['go', 'python', 'debugpy', 'node', 'chrome', 'msedge', 'typescript'];
    return supportedTypes.includes(debugType);
}

// Create a language-aware DelveClient (either real DelveClient for Go or wrapped protocol for others)
function createLanguageAwareDelveClient(session: vscode.DebugSession, language: SupportedLanguage): DelveClient {
    if (language === 'go') {
        // For Go, use the original DelveClient unchanged
        console.log(`🐹 Creating original DelveClient for Go at 2025-06-13 04:50:07`);
        return new DelveClient();
    } else {
        // For other languages, create a DelveClient that wraps the universal protocol
        console.log(`🌍 Creating wrapped DelveClient for ${language} at 2025-06-13 04:50:07`);
        
        try {
            const protocol = DebuggerFactory.createDebuggerProtocol(language);
            return createDelveClientWrapper(protocol, language);
        } catch (error) {
            console.warn(`⚠️ Could not create ${language} protocol, falling back to Go DelveClient: ${error.message}`);
            return new DelveClient(); // Fallback to original for compatibility
        }
    }
}

// Create a DelveClient wrapper that delegates to universal protocols
function createDelveClientWrapper(protocol: any, language: SupportedLanguage): DelveClient {
    // Extend DelveClient to delegate method calls to the universal protocol
    class LanguageDelveClientWrapper extends DelveClient {
        constructor() {
            super();
            console.log(`🔗 Creating ${language} DelveClient wrapper at 2025-06-13 04:50:07`);
        }

        attachToSession(session: vscode.DebugSession): void {
            console.log(`🔗 ${language} wrapper: Attaching to session: ${session.name} at 2025-06-13 04:50:07`);
            protocol.attachToSession(session);
            this.currentSession = session;
            this['isAttached'] = true;
            this.emit('attached', session);
        }

        detachFromSession(): void {
            console.log(`🔌 ${language} wrapper: Detaching from session at 2025-06-13 04:50:07`);
            protocol.detachFromSession();
            this.currentSession = null;
            this['isAttached'] = false;
            this.emit('detached');
        }

        isConnected(): boolean {
            return protocol.isConnected();
        }

        isStoppedAtBreakpoint(): boolean {
            return protocol.isStoppedAtBreakpoint();
        }

        async notifyStoppedFromVSCode(): Promise<void> {
            console.log(`🛑 ${language} wrapper: Debug stopped at 2025-06-13 04:50:07`);
            await protocol.notifyStoppedFromVSCode();
            this['currentThreadId'] = protocol.getCurrentThreadId();
            this['currentFrameId'] = protocol.getCurrentFrameId();
            this.emit('stopped', {
                threadId: this['currentThreadId'],
                frameId: this['currentFrameId'],
                reason: `${language}-breakpoint`
            });
        }

        notifyContinuedFromVSCode(): void {
            console.log(`▶️ ${language} wrapper: Debug continued at 2025-06-13 04:50:07`);
            protocol.notifyContinuedFromVSCode();
            this['currentThreadId'] = null;
            this['currentFrameId'] = null;
            this.emit('continued', { reason: `${language}-continue` });
        }

        async getCurrentFrame() {
            return protocol.getCurrentFrame();
        }

        async getCurrentDebugState() {
            return protocol.getCurrentDebugState();
        }

        async getStackTrace() {
            return protocol.getStackTrace();
        }

        async getScopes() {
            return protocol.getScopes();
        }

        async getScopeVariables(variablesReference: number) {
            return protocol.getScopeVariables(variablesReference);
        }

        async getFrameVariables(frameId: number) {
            return protocol.getFrameVariables(frameId);
        }

        getCurrentThreadId(): number | null {
            return protocol.getCurrentThreadId();
        }

        getCurrentFrameId(): number | null {
            return protocol.getCurrentFrameId();
        }

        dispose(): void {
            protocol.dispose?.();
            super.dispose();
        }
    }

    return new LanguageDelveClientWrapper();
}