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
import { AIConfigurationService } from './services/aiConfigurationService';
import { CoDebugAIControl } from './views/coDebugAIControl';
import { trackEvent } from './analytics';
import * as os from 'os';

let contextCollector: ContextCollector;
let delveClient: DelveClient;
let llmService: LLMService;
let contextSelectorView: ContextSelectorView;
let executionPathGraphService: ExecutionPathGraphService;
let executionPathGraphView: ExecutionPathGraphView;
let coDebugAIControl: CoDebugAIControl;
let currentLanguage: SupportedLanguage | null = null;

// Helper functions
function getCurrentUser(): string {
    return os.userInfo().username || 'unknown-user';
}

function getCurrentTimestamp(): string {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

// For DAU tracking
let lastActiveEventDate: string | null = null;
function sendDailyActiveEvent() {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    if (lastActiveEventDate !== today) {
        trackEvent('daily_active_user', { client_id: getCurrentUser(), date: today });
        lastActiveEventDate = today;
    }
}

export function activate(context: vscode.ExtensionContext) {
    trackEvent('extension_activated', { client_id: getCurrentUser() }); // Analytics: extension activated
    sendDailyActiveEvent(); 

    console.log(`✅ Co Debugger AI: Activated at ${getCurrentTimestamp()} (User: ${getCurrentUser()})`);

    // Initialize services
    llmService = new LLMService();
    coDebugAIControl = new CoDebugAIControl(llmService);
    context.subscriptions.push(coDebugAIControl);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('contextSelector.openView', () => {
            sendDailyActiveEvent();
            console.log(`📱 Opening Context Selector view at ${getCurrentTimestamp()}`);
            contextSelectorView?.show();
        }),

        vscode.commands.registerCommand('contextSelector.showExecutionGraph', () => {
            sendDailyActiveEvent();
            console.log(`📊 Opening Execution Path Graph at ${getCurrentTimestamp()}`);
            executionPathGraphView?.show();
        }),

        vscode.commands.registerCommand('contextSelector.refreshContext', async () => {
            sendDailyActiveEvent();
            console.log(`🔄 Manual refresh command triggered for ${currentLanguage || 'unknown'} at ${getCurrentTimestamp()}`);
            try {
                await contextCollector?.refreshAll();
                contextSelectorView?.refresh();
                vscode.window.showInformationMessage(`✅ ${currentLanguage || 'Debug'} context refreshed successfully`);
            } catch (error) {
                console.error(`❌ Manual refresh failed at ${getCurrentTimestamp()}:`, error);
                vscode.window.showErrorMessage(`❌ Refresh failed: ${error.message}`);
            }
        }),

        vscode.commands.registerCommand('contextSelector.checkStopped', () => {
            sendDailyActiveEvent();
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
        }),

        vscode.commands.registerCommand('coDebugger.configureAI', async () => {
            sendDailyActiveEvent();
            trackEvent('command_used', { command: 'coDebugger.configureAI', client_id: getCurrentUser() }); // Analytics: command used
            await AIConfigurationService.configureAI(llmService);
        }),

        vscode.commands.registerCommand('coDebugAI.showQuickMenu', async () => {
            sendDailyActiveEvent();
            await coDebugAIControl.showQuickMenu();
        })
    );

    // VS Code Debug Event Handlers
    const onStackItemChanged = vscode.debug.onDidChangeActiveStackItem((stackItem) => {
        sendDailyActiveEvent();
        if (stackItem && isLanguageSupported(stackItem.session.configuration.type)) {
            console.log(`🎯 VS Code active stack item changed at ${getCurrentTimestamp()}:`, {
                sessionName: stackItem.session.name,
                threadId: stackItem.threadId,
                language: currentLanguage,
                user: getCurrentUser()
            });
            
            // Notify Co Debug AI Control
            coDebugAIControl.setDebugState(true);
            
            delveClient?.notifyStoppedFromVSCode();
        } else if (!stackItem) {
            console.log(`🔄 VS Code active stack item cleared at ${getCurrentTimestamp()}`);
            
            // Notify Co Debug AI Control
            coDebugAIControl.setDebugState(false);
            
            delveClient?.notifyContinuedFromVSCode();
        }
    });

    const onDebugSessionStarted = vscode.debug.onDidStartDebugSession((session) => {
        sendDailyActiveEvent();
        const detectedLanguage = LanguageDetector.detectLanguage(session);
        
        if (isLanguageSupported(session.configuration.type) || LanguageDetector.isLanguageSupported(detectedLanguage)) {
            console.log(`🔧 ${detectedLanguage} debug session started at ${getCurrentTimestamp()}`, {
                name: session.name,
                type: session.type,
                configuration: session.configuration.name,
                detectedLanguage,
                user: getCurrentUser()
            });
            
            currentLanguage = detectedLanguage;
            
            // Create appropriate DelveClient based on language
            delveClient = createLanguageAwareDelveClient(session, detectedLanguage);
            
            // Initialize collectors
            contextCollector = new ContextCollector(delveClient);
            contextSelectorView = new ContextSelectorView(contextCollector, llmService, delveClient);
            executionPathGraphService = new ExecutionPathGraphService(contextCollector, delveClient);
            executionPathGraphView = new ExecutionPathGraphView(executionPathGraphService, context);
            
            delveClient.attachToSession(session);
            contextCollector.startCollection();
            
            // Notify Co Debug AI Control
            coDebugAIControl.setContext(contextCollector, detectedLanguage);
            
            vscode.window.showInformationMessage(
                `🚀 Co Debugger AI connected to ${detectedLanguage.toUpperCase()} debugger`,
                'Open Context View',
                'Show Execution Graph',
                'Configure AI'
            ).then(selection => {
                if (selection === 'Open Context View') {
                    vscode.commands.executeCommand('contextSelector.openView');
                } else if (selection === 'Show Execution Graph') {
                    vscode.commands.executeCommand('contextSelector.showExecutionGraph');
                } else if (selection === 'Configure AI') {
                    vscode.commands.executeCommand('coDebugger.configureAI');
                }
            });
        }
    });

    const onDebugSessionTerminated = vscode.debug.onDidTerminateDebugSession((session) => {
        sendDailyActiveEvent();
        if (currentLanguage && (isLanguageSupported(session.configuration.type) || session === delveClient?.currentSession)) {
            console.log(`🔌 ${currentLanguage} debug session terminated at ${getCurrentTimestamp()}:`, {
                sessionName: session.name,
                user: getCurrentUser()
            });
            
            delveClient?.detachFromSession();
            contextCollector?.stopCollection();
            executionPathGraphService?.dispose();
            executionPathGraphView?.dispose();
            
            // Clear Co Debug AI Control
            coDebugAIControl.clearContext();
            
            vscode.window.showInformationMessage(`🛑 Co Debugger AI disconnected from ${currentLanguage.toUpperCase()} debugger`);
            
            // Clean up
            currentLanguage = null;
        }
    });

    const onDebugSessionChanged = vscode.debug.onDidChangeActiveDebugSession((session) => {
        sendDailyActiveEvent();
        if (session) {
            const detectedLanguage = LanguageDetector.detectLanguage(session);
            
            if (isLanguageSupported(session.configuration.type) || LanguageDetector.isLanguageSupported(detectedLanguage)) {
                console.log(`🔄 Active ${detectedLanguage} debug session changed at ${getCurrentTimestamp()}:`, {
                    sessionName: session.name,
                    user: getCurrentUser()
                });
                
                // If language changed, reinitialize
                if (currentLanguage !== detectedLanguage) {
                    console.log(`🔄 Switching from ${currentLanguage} to ${detectedLanguage} at ${getCurrentTimestamp()}`);
                    
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
                    
                    // Update Co Debug AI Control
                    coDebugAIControl.setContext(contextCollector, detectedLanguage);
                }
                
                delveClient?.attachToSession(session);
                contextCollector?.startCollection();
            }
        } else if (!session) {
            console.log(`🔌 No active debug session at ${getCurrentTimestamp()}`);
            coDebugAIControl.clearContext();
        }
    });

    // Register all subscriptions
    context.subscriptions.push(
        onStackItemChanged,
        onDebugSessionStarted, 
        onDebugSessionTerminated,
        onDebugSessionChanged
    );

    // Check for existing debug session
    const activeSession = vscode.debug.activeDebugSession;
    const activeStackItem = vscode.debug.activeStackItem;
    
    if (activeSession) {
        sendDailyActiveEvent();
        const detectedLanguage = LanguageDetector.detectLanguage(activeSession);
        
        if (isLanguageSupported(activeSession.configuration.type) || LanguageDetector.isLanguageSupported(detectedLanguage)) {
            console.log(`🔍 Found existing ${detectedLanguage} debug session at ${getCurrentTimestamp()}:`, {
                sessionName: activeSession.name,
                user: getCurrentUser()
            });
            
            currentLanguage = detectedLanguage;
            delveClient = createLanguageAwareDelveClient(activeSession, detectedLanguage);
            contextCollector = new ContextCollector(delveClient);
            contextSelectorView = new ContextSelectorView(contextCollector, llmService, delveClient);
            executionPathGraphService = new ExecutionPathGraphService(contextCollector, delveClient);
            executionPathGraphView = new ExecutionPathGraphView(executionPathGraphService, context);
            
            delveClient.attachToSession(activeSession);
            contextCollector.startCollection();
            
            // Set Co Debug AI Control
            coDebugAIControl.setContext(contextCollector, detectedLanguage);
            
            if (activeStackItem) {
                console.log(`🎯 Found existing active stack item at ${getCurrentTimestamp()}:`, {
                    sessionName: activeStackItem.session.name,
                    threadId: activeStackItem.threadId,
                    language: currentLanguage,
                    user: getCurrentUser()
                });
                coDebugAIControl.setDebugState(true);
                delveClient.notifyStoppedFromVSCode();
            } else {
                coDebugAIControl.setDebugState(false);
            }
        }
    } else {
        // Show welcome configuration on first activation
        setTimeout(() => {
            AIConfigurationService.quickConfigure();
        }, 2000);
    }

    console.log(`✅ Co Debugger AI fully activated with multi-language support at ${getCurrentTimestamp()} (User: ${getCurrentUser()})`);
}

export function deactivate() {
    console.log(`👋 Co Debugger AI: Deactivated at ${getCurrentTimestamp()} (User: ${getCurrentUser()})`);
    
    try {
        coDebugAIControl?.dispose();
        delveClient?.dispose();
        contextCollector?.dispose();
        executionPathGraphService?.dispose();
        executionPathGraphView?.dispose();
        console.log(`✅ All resources disposed successfully at ${getCurrentTimestamp()}`);
    } catch (error) {
        console.error(`❌ Error during deactivation at ${getCurrentTimestamp()}:`, error);
    }
}

// Helper function to check if a debug type is supported
function isLanguageSupported(debugType: string): boolean {
    const supportedTypes = [
        'go', 'python', 'debugpy', 'node', 'chrome', 'msedge', 'typescript',
        'java', 'cppdbg', 'cppvsdbg', 'lldb', 'gdb', 'csharp', 'coreclr'
    ];
    return supportedTypes.includes(debugType);
}

// Create a language-aware DelveClient
function createLanguageAwareDelveClient(session: vscode.DebugSession, language: SupportedLanguage): DelveClient {
    if (language === 'go') {
        console.log(`🐹 Creating original DelveClient for Go at ${getCurrentTimestamp()} (User: ${getCurrentUser()})`);
        return new DelveClient();
    } else {
        console.log(`🌍 Creating wrapped DelveClient for ${language} at ${getCurrentTimestamp()} (User: ${getCurrentUser()})`);
        
        try {
            const protocol = DebuggerFactory.createDebuggerProtocol(language);
            return createDelveClientWrapper(protocol, language);
        } catch (error) {
            console.warn(`⚠️ Could not create ${language} protocol, falling back to Go DelveClient: ${error.message}`);
            return new DelveClient();
        }
    }
}

// Create a DelveClient wrapper that delegates to universal protocols
function createDelveClientWrapper(protocol: any, language: SupportedLanguage): DelveClient {
    class LanguageDelveClientWrapper extends DelveClient {
        constructor() {
            super();
            console.log(`🔗 Creating ${language} DelveClient wrapper at ${getCurrentTimestamp()} (User: ${getCurrentUser()})`);
        }

        attachToSession(session: vscode.DebugSession): void {
            console.log(`🔗 ${language} wrapper: Attaching to session: ${session.name} at ${getCurrentTimestamp()}`);
            protocol.attachToSession(session);
            this.currentSession = session;
            this['isAttached'] = true;
            this.emit('attached', session);
        }

        detachFromSession(): void {
            console.log(`🔌 ${language} wrapper: Detaching from session at ${getCurrentTimestamp()}`);
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
            console.log(`🛑 ${language} wrapper: Debug stopped at ${getCurrentTimestamp()}`);
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
            console.log(`▶️ ${language} wrapper: Debug continued at ${getCurrentTimestamp()}`);
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