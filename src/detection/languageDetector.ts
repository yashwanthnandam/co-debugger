import * as vscode from 'vscode';
import * as path from 'path';
import { SupportedLanguage } from '../languages/languageHandler';

export class LanguageDetector {
    static detectLanguage(session: vscode.DebugSession): SupportedLanguage {
        const config = session.configuration;
        
        console.log(`🔍 Detecting language for debug session: ${session.name}`);
        console.log(`📋 Session type: ${config.type}, program: ${config.program}`);
        
        switch (config.type) {
            case 'go':
            case 'dlv':
                return 'go';
            case 'python':
            case 'debugpy':
                return 'python';
            case 'node':
            case 'node2':
            case 'chrome':
            case 'msedge':
                return 'javascript';
            case 'typescript':
                return 'typescript';
            case 'java':
                return 'java';
            case 'cppdbg':
            case 'cppvsdbg':
            case 'lldb':
            case 'gdb':
                return 'cpp';
            case 'csharp':
            case 'coreclr':
                return 'csharp';
        }
        
        // Secondary detection: program file extension
        if (config.program) {
            const ext = path.extname(config.program).toLowerCase();
            switch (ext) {
                case '.go':
                    return 'go';
                case '.py':
                case '.pyw':
                    return 'python';
                case '.js':
                case '.mjs':
                case '.cjs':
                    return 'javascript';
                case '.ts':
                case '.tsx':
                    return 'typescript';
                case '.java':
                case '.class':
                case '.jar':
                    return 'java';
                case '.cpp':
                case '.cc':
                case '.cxx':
                case '.c++':
                case '.c':
                case '.h':
                case '.hpp':
                case '.hxx':
                case '.exe':
                    return 'cpp';
                case '.cs':
                case '.dll':
                    return 'csharp';
            }
        }
        
        // Tertiary detection: current active file
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const ext = path.extname(activeEditor.document.fileName).toLowerCase();
            switch (ext) {
                case '.go':
                    return 'go';
                case '.py':
                case '.pyw':
                    return 'python';
                case '.js':
                case '.mjs':
                case '.cjs':
                    return 'javascript';
                case '.ts':
                case '.tsx':
                    return 'typescript';
                case '.java':
                    return 'java';
                case '.cpp':
                case '.cc':
                case '.cxx':
                case '.c++':
                case '.c':
                case '.h':
                case '.hpp':
                case '.hxx':
                    return 'cpp';
                case '.cs':
                    return 'csharp';
            }
        }
        
        const workspaceLanguage = this.detectFromWorkspace();
        if (workspaceLanguage !== 'go') {
            console.log(`🔍 Detected language from workspace: ${workspaceLanguage} at 2025-06-14 09:37:29`);
            return workspaceLanguage;
        }
        
        console.log(`⚠️ Could not detect language, defaulting to Go at 2025-06-14 09:37:29`);
        return 'go';
    }

    private static detectFromWorkspace(): SupportedLanguage {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return 'go';
        }
        
        const rootPath = workspaceFolders[0].uri.fsPath;
        
        // Language indicators with priority order
        const languageIndicators = [
            // Java indicators
            { files: ['pom.xml', 'build.gradle', 'gradle.properties'], language: 'java' as SupportedLanguage },
            { files: ['*.java'], language: 'java' as SupportedLanguage },
            
            // C++ indicators  
            { files: ['CMakeLists.txt', 'Makefile', 'makefile'], language: 'cpp' as SupportedLanguage },
            { files: ['*.cpp', '*.cc', '*.cxx'], language: 'cpp' as SupportedLanguage },
            
            // JavaScript/TypeScript indicators
            { files: ['package.json'], language: 'javascript' as SupportedLanguage },
            { files: ['tsconfig.json'], language: 'typescript' as SupportedLanguage },
            
            // Python indicators
            { files: ['requirements.txt', 'setup.py', 'Pipfile', 'pyproject.toml'], language: 'python' as SupportedLanguage },
            { files: ['*.py'], language: 'python' as SupportedLanguage },
            
            // Go indicators
            { files: ['go.mod', 'go.sum'], language: 'go' as SupportedLanguage },
            { files: ['*.go'], language: 'go' as SupportedLanguage },
            
            // C# indicators
            { files: ['*.csproj', '*.sln'], language: 'csharp' as SupportedLanguage }
        ];
        
        for (const indicator of languageIndicators) {
            if (this.hasAnyFile(rootPath, indicator.files)) {
                return indicator.language;
            }
        }
        
        return 'go';
    }

    private static hasAnyFile(rootPath: string, patterns: string[]): boolean {
        try {
            const fs = require('fs');
            const path = require('path');
            
            for (const pattern of patterns) {
                if (pattern.startsWith('*')) {
                    // Simple wildcard check
                    const extension = pattern.substring(1);
                    try {
                        const files = fs.readdirSync(rootPath);
                        const found = files.some((file: string) => file.endsWith(extension));
                        if (found) return true;
                    } catch (error) {
                        // Continue to next pattern
                    }
                } else {
                    // Check for exact file
                    const filePath = path.join(rootPath, pattern);
                    if (fs.existsSync(filePath)) return true;
                }
            }
        } catch (error) {
            console.warn(`⚠️ Error checking workspace files at 2025-06-14 09:37:29: ${error.message}`);
        }
        
        return false;
    }

    static getSupportedLanguages(): SupportedLanguage[] {
        return ['go', 'python', 'javascript', 'typescript', 'java', 'cpp', 'csharp'];
    }

    static isLanguageSupported(language: string): boolean {
        return this.getSupportedLanguages().includes(language as SupportedLanguage);
    }
}