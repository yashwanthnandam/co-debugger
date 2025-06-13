import * as vscode from 'vscode';
import * as path from 'path';
import { SupportedLanguage } from '../languages/languageHandler';

export class LanguageDetector {
    static detectLanguage(session: vscode.DebugSession): SupportedLanguage {
        const config = session.configuration;
        
        console.log(`🔍 Detecting language for debug session: ${session.name}`);
        console.log(`📋 Session type: ${config.type}, program: ${config.program}`);
        
        // Primary detection: debug session type
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
                    return 'java';
                case '.cs':
                    return 'csharp';
            }
        }
        
        // Tertiary detection: workspace analysis
        const workspaceLanguage = this.detectFromWorkspace();
        if (workspaceLanguage !== 'go') {
            console.log(`🔍 Detected language from workspace: ${workspaceLanguage}`);
            return workspaceLanguage;
        }
        
        // Fallback to Go (original implementation)
        console.log(`⚠️ Could not detect language, defaulting to Go`);
        return 'go';
    }

    private static detectFromWorkspace(): SupportedLanguage {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return 'go';
        }
        
        const rootPath = workspaceFolders[0].uri.fsPath;
        
        // Check for language-specific files
        const languageIndicators = [
            { files: ['package.json', 'node_modules'], language: 'javascript' as SupportedLanguage },
            { files: ['tsconfig.json', '*.ts'], language: 'typescript' as SupportedLanguage },
            { files: ['requirements.txt', '*.py', 'setup.py', 'Pipfile'], language: 'python' as SupportedLanguage },
            { files: ['go.mod', 'go.sum', '*.go'], language: 'go' as SupportedLanguage },
            { files: ['*.java', 'pom.xml', 'build.gradle'], language: 'java' as SupportedLanguage },
            { files: ['*.cs', '*.csproj', '*.sln'], language: 'csharp' as SupportedLanguage }
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
            const glob = require('glob');
            
            for (const pattern of patterns) {
                if (pattern.startsWith('*')) {
                    // Use glob for wildcard patterns
                    const matches = glob.sync(pattern, { cwd: rootPath });
                    if (matches.length > 0) return true;
                } else {
                    // Check for exact file
                    const filePath = path.join(rootPath, pattern);
                    if (fs.existsSync(filePath)) return true;
                }
            }
        } catch (error) {
            console.warn(`Error checking workspace files: ${error.message}`);
        }
        
        return false;
    }

    static getSupportedLanguages(): SupportedLanguage[] {
        return ['go', 'python', 'javascript', 'typescript', 'java', 'csharp'];
    }

    static isLanguageSupported(language: string): boolean {
        return this.getSupportedLanguages().includes(language as SupportedLanguage);
    }
}