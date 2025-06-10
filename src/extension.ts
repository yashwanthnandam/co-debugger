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
    console.log(`🚀 Context Selector Debugger: Activated `);

    // Initialize services
    delveClient = new DelveClient();
    llmService = new LLMService();
    contextCollector = new ContextCollector(delveClient);
    contextSelectorView = new ContextSelectorView(contextCollector, llmService, delveClient);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('contextSelector.openView', () => {
            console.log(`📱 Opening Context Selector view at 2025-06-09 03:05:14`);
            contextSelectorView.show();
        }),

        vscode.commands.registerCommand('contextSelector.refreshContext', async () => {
            console.log(`🔄 Manual refresh command triggered`);
            try {
                await contextCollector.refreshAll();
                contextSelectorView.refresh();
                vscode.window.showInformationMessage('✅ Context refreshed successfully');
            } catch (error) {
                console.error(`❌ Manual refresh failed`, error);
                vscode.window.showErrorMessage(`❌ Refresh failed: ${error.message}`);
            }
        }),

        vscode.commands.registerCommand('contextSelector.exportContext', () => {
            console.log(`📋 Exporting context`);
            contextSelectorView.exportContext();
        })
    );

    // Correct VS Code Debug Event Handlers
    const onStackItemChanged = vscode.debug.onDidChangeActiveStackItem((stackItem) => {
        if (stackItem && stackItem.session.configuration.type === 'go') {
            console.log(`🎯 VS Code active stack item changed at 2025-06-09 03:05:14:`, {
                sessionName: stackItem.session.name,
                threadId: stackItem.threadId
            });
            
            // This means debugger stopped and VS Code has selected a thread/stack item
            delveClient.notifyStoppedFromVSCode();
        } else if (!stackItem) {
            console.log(`🔄 VS Code active stack item cleared at 2025-06-09 03:05:14`);
            // This typically means debugger continued
            delveClient.notifyContinuedFromVSCode();
        }
    });

    const onDebugSessionStarted = vscode.debug.onDidStartDebugSession((session) => {
        if (session.configuration.type === 'go') {
            console.log(`🔧 Go debug session started`, {
                name: session.name,
                type: session.type,
                configuration: session.configuration.name
            });
            
            delveClient.attachToSession(session);
            contextCollector.startCollection();
            
            vscode.window.showInformationMessage(
                `🚀 Context Selector connected to Go debugger`,
                'Open Context View'
            ).then(selection => {
                if (selection === 'Open Context View') {
                    vscode.commands.executeCommand('contextSelector.openView');
                }
            });
        }
    });

    const onDebugSessionTerminated = vscode.debug.onDidTerminateDebugSession((session) => {
        if (session.configuration.type === 'go') {
            console.log(`🔌 Go debug session terminated at 2025-06-09 03:05:14:`, session.name);
            delveClient.detachFromSession();
            contextCollector.stopCollection();
            
            vscode.window.showInformationMessage(`🛑 Context Selector disconnected from debugger`);
        }
    });

    const onDebugSessionChanged = vscode.debug.onDidChangeActiveDebugSession((session) => {
        if (session && session.configuration.type === 'go') {
            console.log(`🔄 Active Go debug session changed at 2025-06-09 03:05:14:`, session.name);
            delveClient.attachToSession(session);
            contextCollector.startCollection();
        } else if (!session) {
            console.log(`🔌 No active debug session at 2025-06-09 03:05:14`);
        }
    });

    // Register all subscriptions
    context.subscriptions.push(
        onStackItemChanged,
        onDebugSessionStarted, 
        onDebugSessionTerminated,
        onDebugSessionChanged
    );

    // Check for existing debug session and active stack item
    const activeSession = vscode.debug.activeDebugSession;
    const activeStackItem = vscode.debug.activeStackItem;
    
    if (activeSession && activeSession.configuration.type === 'go') {
        console.log(`🔍 Found existing Go debug session at 2025-06-09 03:05:14:`, activeSession.name);
        delveClient.attachToSession(activeSession);
        contextCollector.startCollection();
        
        if (activeStackItem) {
            console.log(`🎯 Found existing active stack item at 2025-06-09 03:05:14:`, {
                sessionName: activeStackItem.session.name,
                threadId: activeStackItem.threadId
            });
            delveClient.notifyStoppedFromVSCode();
        }
    }

    console.log(`✅ Context Selector Debugger fully activated`);
}

export function deactivate() {
    console.log(`👋 Context Selector Debugger: Deactivated`);
    
    try {
        delveClient?.dispose();
        contextCollector?.dispose();
        console.log(`✅ All resources disposed successfully at 2025-06-09 03:05:14`);
    } catch (error) {
        console.error(`❌ Error during deactivation at 2025-06-09 03:05:14:`, error);
    }
}