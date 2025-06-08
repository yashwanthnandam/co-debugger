import * as vscode from 'vscode';
import * as os from 'os';
import { ContextSelectorView } from './views/contextSelectorView';
import { ContextCollector } from './services/contextCollector';
import { DelveClient } from './services/delveClient';
import { LLMService } from './services/llmService';

let contextCollector: ContextCollector;
let delveClient: DelveClient;
let llmService: LLMService;
let contextSelectorView: ContextSelectorView;

// Dynamic user and timestamp utilities
function getCurrentUser(): string {
    return os.userInfo().username || 'unknown-user';
}

function getCurrentTimestamp(): string {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export function activate(context: vscode.ExtensionContext) {
    console.log(`🚀 Context Selector Debugger: Activated at ${getCurrentTimestamp()} by ${getCurrentUser()}`);

    // Initialize services with optimizations
    delveClient = new DelveClient();
    llmService = new LLMService();
    contextCollector = new ContextCollector(delveClient);
    contextSelectorView = new ContextSelectorView(contextCollector, llmService, delveClient);

    // Register commands with better logging
    context.subscriptions.push(
        vscode.commands.registerCommand('contextSelector.openView', () => {
            console.log(`📱 Opening Context Selector view at ${getCurrentTimestamp()}`);
            contextSelectorView.show();
        }),

        vscode.commands.registerCommand('contextSelector.refreshContext', async () => {
            console.log(`🔄 Manual refresh command triggered by ${getCurrentUser()} at ${getCurrentTimestamp()}`);
            try {
                await contextCollector.refreshAll();
                contextSelectorView.refresh();
                vscode.window.showInformationMessage('✅ Context refreshed successfully');
            } catch (error) {
                console.error(`❌ Manual refresh failed at ${getCurrentTimestamp()}:`, error);
                vscode.window.showErrorMessage(`❌ Refresh failed: ${error.message}`);
            }
        }),

        vscode.commands.registerCommand('contextSelector.exportContext', () => {
            console.log(`📋 Exporting context for ${getCurrentUser()} at ${getCurrentTimestamp()}`);
            contextSelectorView.exportContext(); // Fixed method name
        }),

        vscode.commands.registerCommand('contextSelector.checkStopped', async () => {
            console.log(`🔍 Manual check stopped command by ${getCurrentUser()} at ${getCurrentTimestamp()}`);
            if (delveClient.isConnected()) {
                const stopped = await delveClient.forceCheckStopped();
                const message = stopped ? '✅ Debugger is stopped at breakpoint' : '▶️ Debugger is running';
                vscode.window.showInformationMessage(message);
            } else {
                vscode.window.showWarningMessage('❌ No debug session active');
            }
        })
    );

    // WEBHOOK-STYLE: Enhanced VS Code debug event handling
    const debugEventSubscription = vscode.debug.onDidChangeBreakpoints((event) => {
        console.log(`🔄 Breakpoints changed at ${getCurrentTimestamp()}:`, {
            added: event.added.length,
            removed: event.removed.length,
            changed: event.changed.length
        });
    });

    const debugStoppedSubscription = vscode.debug.onDidReceiveDebugSessionCustomEvent((event) => {
        if (event.session.configuration.type === 'go') {
            if (event.event === 'stopped') {
                console.log(`🛑 WEBHOOK EVENT: Debug stopped at ${getCurrentTimestamp()}`, event.body);
                delveClient.notifyStoppedManually(event.body?.threadId || null);
            } else if (event.event === 'continued') {
                console.log(`▶️ WEBHOOK EVENT: Debug continued at ${getCurrentTimestamp()}`);
                delveClient.notifyContinuedManually();
            }
        }
    });

    // Enhanced session management
    vscode.debug.onDidStartDebugSession((session) => {
        if (session.configuration.type === 'go') {
            console.log(`🔧 Go debug session started at ${getCurrentTimestamp()} for ${getCurrentUser()}:`, {
                name: session.name,
                type: session.type,
                configuration: session.configuration.name
            });
            delveClient.attachToSession(session);
            contextCollector.startCollection();
            startIntelligentMonitoring();
            
            // Show notification
            vscode.window.showInformationMessage(
                `🚀 Context Selector connected to Go debugger for ${getCurrentUser()}`,
                'Open Context View'
            ).then(selection => {
                if (selection === 'Open Context View') {
                    vscode.commands.executeCommand('contextSelector.openView');
                }
            });
        }
    });

    vscode.debug.onDidTerminateDebugSession((session) => {
        if (session.configuration.type === 'go') {
            console.log(`🔌 Go debug session terminated at ${getCurrentTimestamp()}:`, session.name);
            delveClient.detachFromSession();
            contextCollector.stopCollection();
            stopIntelligentMonitoring();
            
            vscode.window.showInformationMessage(`🛑 Context Selector disconnected from debugger for ${getCurrentUser()}`);
        }
    });

    vscode.debug.onDidChangeActiveDebugSession((session) => {
        if (session && session.configuration.type === 'go') {
            console.log(`🔄 Active Go debug session changed at ${getCurrentTimestamp()}:`, session.name);
            delveClient.attachToSession(session);
            contextCollector.startCollection();
            startIntelligentMonitoring();
        } else if (!session) {
            console.log(`🔌 No active debug session at ${getCurrentTimestamp()}`);
            stopIntelligentMonitoring();
        }
    });

    // Register subscriptions
    context.subscriptions.push(debugEventSubscription, debugStoppedSubscription);

    // Check for existing debug session
    const activeSession = vscode.debug.activeDebugSession;
    if (activeSession && activeSession.configuration.type === 'go') {
        console.log(`🔍 Found existing Go debug session at ${getCurrentTimestamp()}:`, activeSession.name);
        delveClient.attachToSession(activeSession);
        contextCollector.startCollection();
        startIntelligentMonitoring();
    }

    console.log(`✅ Context Selector Debugger fully activated for ${getCurrentUser()} at ${getCurrentTimestamp()}`);
}

// Intelligent monitoring with adaptive polling
let monitoringInterval: NodeJS.Timeout | null = null;
let lastKnownState = { stopped: false, threadId: null };
let adaptivePollingInterval = 500; // Start with 500ms
let consecutiveNoChanges = 0;
let maxPollingInterval = 5000; // Maximum 5 seconds
let minPollingInterval = 200; // Minimum 200ms

function startIntelligentMonitoring() {
    console.log(`🧠 Starting intelligent monitoring with adaptive polling at ${getCurrentTimestamp()}`);
    
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }
    
    // Reset adaptive values
    adaptivePollingInterval = 500;
    consecutiveNoChanges = 0;
    
    const monitor = async () => {
        if (!delveClient.isConnected()) {
            return;
        }
        
        try {
            const currentState = await delveClient.getCurrentDebugState();
            
            if (currentState.stopped !== lastKnownState.stopped || 
                currentState.threadId !== lastKnownState.threadId) {
                
                console.log(`🔄 State change detected at ${getCurrentTimestamp()}: ${JSON.stringify(lastKnownState)} → ${JSON.stringify(currentState)}`);
                
                if (currentState.stopped && !lastKnownState.stopped) {
                    console.log(`🛑 DETECTED BREAKPOINT HIT at ${getCurrentTimestamp()}!`);
                    delveClient.notifyStoppedManually(currentState.threadId);
                    adaptivePollingInterval = minPollingInterval; // Speed up after change
                } else if (!currentState.stopped && lastKnownState.stopped) {
                    console.log(`▶️ DETECTED DEBUGGER CONTINUED at ${getCurrentTimestamp()}!`);
                    delveClient.notifyContinuedManually();
                    adaptivePollingInterval = minPollingInterval; // Speed up after change
                }
                
                lastKnownState = currentState;
                consecutiveNoChanges = 0;
            } else {
                consecutiveNoChanges++;
                
                // Adaptive polling: slow down if no changes
                if (consecutiveNoChanges > 3) {
                    adaptivePollingInterval = Math.min(
                        adaptivePollingInterval * 1.5, 
                        maxPollingInterval
                    );
                } else if (consecutiveNoChanges > 10) {
                    adaptivePollingInterval = maxPollingInterval;
                }
            }
            
        } catch (error) {
            // Ignore monitoring errors but slow down polling
            adaptivePollingInterval = Math.min(adaptivePollingInterval * 2, maxPollingInterval);
        }
        
        // Schedule next check with adaptive interval
        monitoringInterval = setTimeout(monitor, adaptivePollingInterval);
    };
    
    // Start monitoring
    monitor();
}

function stopIntelligentMonitoring() {
    console.log(`🛑 Stopping intelligent monitoring at ${getCurrentTimestamp()}`);
    if (monitoringInterval) {
        clearTimeout(monitoringInterval);
        monitoringInterval = null;
    }
    lastKnownState = { stopped: false, threadId: null };
    adaptivePollingInterval = 500;
    consecutiveNoChanges = 0;
}

export function deactivate() {
    console.log(`👋 Context Selector Debugger: Deactivated for ${getCurrentUser()} at ${getCurrentTimestamp()}`);
    stopIntelligentMonitoring();
    
    try {
        delveClient?.dispose();
        contextCollector?.dispose();
        console.log(`✅ All resources disposed successfully at ${getCurrentTimestamp()}`);
    } catch (error) {
        console.error(`❌ Error during deactivation at ${getCurrentTimestamp()}:`, error);
    }
}