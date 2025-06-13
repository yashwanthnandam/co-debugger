import * as vscode from 'vscode';
import { DebuggerProtocol } from '../protocols/debuggerProtocol';
import { LanguageHandler, SupportedLanguage } from '../languages/languageHandler';
import { DelveClient } from '../services/delveClient';
import { GoLanguageHandler } from '../languages/goHandler';
import { PythonLanguageHandler } from '../languages/pythonHandler';
import { JavaScriptLanguageHandler } from '../languages/javaScriptHandler';
import { PythonDebuggerProtocol } from '../protocols/pythonDebuggerProtocol';
import { JavaScriptDebuggerProtocol } from '../protocols/javaScriptDebuggerProtocol';

export class DebuggerFactory {
    private static protocolInstances = new Map<SupportedLanguage, DebuggerProtocol>();
    private static handlerInstances = new Map<SupportedLanguage, LanguageHandler>();

    static createDebuggerProtocol(language: SupportedLanguage): DebuggerProtocol {
        // Reuse instances for performance
        if (this.protocolInstances.has(language)) {
            return this.protocolInstances.get(language)!;
        }

        let protocol: DebuggerProtocol;

        switch (language) {
            case 'go':
                protocol = new DelveClient();
                break;
            case 'python':
                protocol = new PythonDebuggerProtocol();
                break;
            case 'javascript':
            case 'typescript':
                protocol = new JavaScriptDebuggerProtocol();
                break;
            case 'java':
                // TODO: Implement Java debugger protocol
                throw new Error(`Java debugger protocol not yet implemented`);
            case 'csharp':
                // TODO: Implement C# debugger protocol
                throw new Error(`C# debugger protocol not yet implemented`);
            default:
                throw new Error(`Unsupported language: ${language}`);
        }

        this.protocolInstances.set(language, protocol);
        console.log(`🏭 Created debugger protocol for ${language}`);
        return protocol;
    }

    static createLanguageHandler(language: SupportedLanguage): LanguageHandler {
        // Reuse instances for performance
        if (this.handlerInstances.has(language)) {
            return this.handlerInstances.get(language)!;
        }

        let handler: LanguageHandler;

        switch (language) {
            case 'go':
                handler = new GoLanguageHandler();
                break;
            case 'python':
                handler = new PythonLanguageHandler();
                break;
            case 'javascript':
            case 'typescript':
                handler = new JavaScriptLanguageHandler();
                break;
            case 'java':
                // TODO: Implement Java language handler
                throw new Error(`Java language handler not yet implemented`);
            case 'csharp':
                // TODO: Implement C# language handler
                throw new Error(`C# language handler not yet implemented`);
            default:
                throw new Error(`Unsupported language: ${language}`);
        }

        this.handlerInstances.set(language, handler);
        console.log(`🏭 Created language handler for ${language}`);
        return handler;
    }

    static getSupportedLanguages(): SupportedLanguage[] {
        return ['go', 'python', 'javascript', 'typescript'];
    }

    static isLanguageSupported(language: SupportedLanguage): boolean {
        return this.getSupportedLanguages().includes(language);
    }

    static clearInstances(): void {
        // Dispose of existing instances
        this.protocolInstances.forEach((protocol) => {
            if (protocol.dispose) {
                protocol.dispose();
            }
        });

        this.protocolInstances.clear();
        this.handlerInstances.clear();
        console.log(`🧹 Cleared all factory instances`);
    }

    static getActiveLanguages(): SupportedLanguage[] {
        return Array.from(this.protocolInstances.keys());
    }

    static getDebuggerProtocolStats(): Record<SupportedLanguage, any> {
        const stats: Record<string, any> = {};
        
        this.protocolInstances.forEach((protocol, language) => {
            stats[language] = {
                isConnected: protocol.isConnected(),
                isStoppedAtBreakpoint: protocol.isStoppedAtBreakpoint(),
                currentThreadId: protocol.getCurrentThreadId(),
                currentFrameId: protocol.getCurrentFrameId()
            };
        });

        return stats;
    }
}