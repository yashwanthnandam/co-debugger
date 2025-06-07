import * as vscode from 'vscode';
import { ContextSelectorView } from './views/contextSelectorView';
import { ContextCollector } from './services/contextCollector';
import { DelveClient } from './services/delveClient';
import { LLMService } from './services/llmService';

let contextCollector: ContextCollector;
let delveClient: DelveClient;
let llmService: LLMService;
let contextSelectorView: ContextSelectorView;

export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 Context Selector Debugger: Activated');

    // Initialize services
    delveClient = new DelveClient();
    llmService = new LLMService();
    contextCollector = new ContextCollector(delveClient);
    contextSelectorView = new ContextSelectorView(contextCollector, llmService);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('contextSelector.openView', () => {
            contextSelectorView.show();
        }),

        vscode.commands.registerCommand('contextSelector.refreshContext', async () => {
            console.log('🔄 Manual refresh command triggered');
            await contextCollector.refreshAll();
            contextSelectorView.refresh();
        }),

        vscode.commands.registerCommand('contextSelector.exportContext', () => {
            contextSelectorView.exportSelectedContext();
        }),

        // Add command to manually check if stopped
        vscode.commands.registerCommand('contextSelector.checkStopped', async () => {
            console.log('🔍 Manual check stopped command');
            if (delveClient.isConnected()) {
                const stopped = await delveClient.forceCheckStopped();
                vscode.window.showInformationMessage(
                    stopped ? '✅ Debugger is stopped' : '▶️ Debugger is running'
                );
            } else {
                vscode.window.showWarningMessage('❌ No debug session active');
            }
        })
    );

    // Debug session handling with enhanced event monitoring
    vscode.debug.onDidStartDebugSession((session) => {
        console.log('🎬 Debug session started:', session.name, 'type:', session.configuration.type);
        if (session.configuration.type === 'go') {
            console.log('🔧 Go debug session detected - attaching and starting collection');
            delveClient.attachToSession(session);
            contextCollector.startCollection();
            
            // Start monitoring for breakpoint stops
            startBreakpointMonitoring();
        }
    });

    vscode.debug.onDidTerminateDebugSession((session) => {
        console.log('🛑 Debug session terminated:', session.name);
        if (session.configuration.type === 'go') {
            console.log('🔌 Go debug session ended - cleaning up');
            delveClient.detachFromSession();
            contextCollector.stopCollection();
            stopBreakpointMonitoring();
        }
    });

    vscode.debug.onDidChangeActiveDebugSession((session) => {
        if (session && session.configuration.type === 'go') {
            console.log('🔄 Active Go debug session changed - ensuring attachment');
            delveClient.attachToSession(session);
            contextCollector.startCollection();
            startBreakpointMonitoring();
        } else if (!session) {
            console.log('🔌 No active debug session');
            stopBreakpointMonitoring();
        }
    });

    // Check if there's already an active debug session
    const activeSession = vscode.debug.activeDebugSession;
    if (activeSession && activeSession.configuration.type === 'go') {
        console.log('🔍 Found existing active Go debug session - attaching');
        delveClient.attachToSession(activeSession);
        contextCollector.startCollection();
        startBreakpointMonitoring();
    }
}

let breakpointMonitorInterval: NodeJS.Timeout | null = null;
let lastKnownState = { stopped: false, threadId: null };

function startBreakpointMonitoring() {
    console.log('👀 Starting breakpoint monitoring...');
    
    if (breakpointMonitorInterval) {
        clearInterval(breakpointMonitorInterval);
    }
    
    // Poll every 500ms to check if debugger state changed
    breakpointMonitorInterval = setInterval(async () => {
        if (!delveClient.isConnected()) {
            return;
        }
        
        try {
            const currentState = await delveClient.getCurrentDebugState();
            
            // Check if state changed
            if (currentState.stopped !== lastKnownState.stopped) {
                console.log(`🔄 Debugger state changed: ${lastKnownState.stopped ? 'stopped' : 'running'} → ${currentState.stopped ? 'stopped' : 'running'}`);
                
                if (currentState.stopped && !lastKnownState.stopped) {
                    console.log('🛑 DETECTED BREAKPOINT HIT!');
                    delveClient.notifyStoppedManually(currentState.threadId);
                } else if (!currentState.stopped && lastKnownState.stopped) {
                    console.log('▶️ DETECTED DEBUGGER CONTINUED!');
                    delveClient.notifyContinuedManually();
                }
                
                lastKnownState = currentState;
            }
        } catch (error) {
            // Ignore errors during monitoring
        }
    }, 500);
}

function stopBreakpointMonitoring() {
    console.log('🛑 Stopping breakpoint monitoring...');
    if (breakpointMonitorInterval) {
        clearInterval(breakpointMonitorInterval);
        breakpointMonitorInterval = null;
    }
    lastKnownState = { stopped: false, threadId: null };
}

export function deactivate() {
    console.log('👋 Context Selector Debugger: Deactivated');
    stopBreakpointMonitoring();
    if (delveClient) {
        delveClient.dispose();
    }
    if (contextCollector) {
        contextCollector.dispose();
    }
}