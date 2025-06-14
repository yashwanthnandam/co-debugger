import * as vscode from 'vscode';
import { LLMService } from './llmService';
import * as os from 'os';

export interface AIProvider {
    label: string;
    value: string;
    description: string;
    models: { label: string; value: string; description?: string }[];
}

export class AIConfigurationService {
    private static readonly providers: AIProvider[] = [
        {
            label: 'OpenAI',
            value: 'openai',
            description: 'GPT-3.5, GPT-4, and latest models',
            models: [
                { label: 'GPT-4', value: 'gpt-4', description: 'Most capable model' },
                { label: 'GPT-4 Turbo', value: 'gpt-4-turbo-preview', description: 'Latest GPT-4 with improvements' },
                { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo', description: 'Fast and cost-effective' },
                { label: 'GPT-4o', value: 'gpt-4o', description: 'Multimodal model' }
            ]
        },
        {
            label: 'Anthropic',
            value: 'anthropic',
            description: 'Claude 3 family models',
            models: [
                { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229', description: 'Most capable Claude model' },
                { label: 'Claude 3 Sonnet', value: 'claude-3-sonnet-20240229', description: 'Balanced performance' },
                { label: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307', description: 'Fast and efficient' }
            ]
        },
        {
            label: 'Azure OpenAI',
            value: 'azure',
            description: 'Enterprise Azure deployment',
            models: [
                { label: 'GPT-4', value: 'gpt-4', description: 'Azure GPT-4 deployment' },
                { label: 'GPT-35-Turbo', value: 'gpt-35-turbo', description: 'Azure GPT-3.5 deployment' }
            ]
        }
    ];

    static async configureAI(llmService: LLMService): Promise<boolean> {
        const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const user = os.userInfo().username || 'unknown-user';
        console.log(`🤖 Starting AI configuration at ${timestamp} (User: ${user})`);

        // Check if API key is already configured
        const config = vscode.workspace.getConfiguration('coDebugger.llm');
        const currentProvider = config.get<string>('provider', 'openai');
        const hasApiKey = this.hasValidApiKey(currentProvider);

        if (hasApiKey) {
            const currentModel = config.get<string>('model', 'gpt-4');
            const action = await vscode.window.showInformationMessage(
                `🤖 AI is already configured!\nProvider: ${currentProvider.toUpperCase()}\nModel: ${currentModel}`,
                'Test Configuration',
                'Reconfigure',
                'Cancel'
            );

            if (action === 'Test Configuration') {
                return await this.testConfiguration(llmService, currentProvider, currentModel);
            } else if (action === 'Reconfigure') {
                return await this.showConfigurationWizard(llmService);
            }
            return false;
        }

        // Show welcome message and start configuration
        const startConfig = await vscode.window.showInformationMessage(
            `🎉 Welcome to Co Debugger AI!\n\nTo get started with AI-powered debugging analysis, let's configure your AI provider.`,
            'Configure AI',
            'Later'
        );

        if (startConfig === 'Configure AI') {
            return await this.showConfigurationWizard(llmService);
        }

        return false;
    }

    private static async showConfigurationWizard(llmService: LLMService): Promise<boolean> {
        try {
            // Step 1: Choose Provider
            const selectedProvider = await vscode.window.showQuickPick(
                this.providers.map(p => ({
                    label: `$(cloud) ${p.label}`,
                    description: p.description,
                    detail: `Models: ${p.models.map(m => m.label).join(', ')}`,
                    provider: p
                })),
                {
                    placeHolder: 'Select your AI provider',
                    title: 'Step 1/3: Choose AI Provider',
                    ignoreFocusOut: true
                }
            );

            if (!selectedProvider) return false;

            // Step 2: Enter API Key
            const apiKeyResult = await this.promptForApiKey(selectedProvider.provider);
            if (!apiKeyResult) return false;

            // Step 3: Choose Model
            const selectedModel = await vscode.window.showQuickPick(
                selectedProvider.provider.models.map(m => ({
                    label: `$(gear) ${m.label}`,
                    description: m.description,
                    detail: m.value,
                    model: m
                })),
                {
                    placeHolder: 'Select AI model',
                    title: 'Step 3/3: Choose Model',
                    ignoreFocusOut: true
                }
            );

            if (!selectedModel) return false;

            // Save configuration
            await this.saveConfiguration(selectedProvider.provider, apiKeyResult, selectedModel.model.value);

            // Test configuration
            const testResult = await this.testConfiguration(llmService, selectedProvider.provider.value, selectedModel.model.value);

            if (testResult) {
                vscode.window.showInformationMessage(
                    `🎉 AI Configuration Complete!\n✅ ${selectedProvider.provider.label} ${selectedModel.model.label} is ready to use.`
                );
                return true;
            }

            return false;

        } catch (error) {
            const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
            console.error(`❌ Configuration wizard failed at ${timestamp}:`, error);
            vscode.window.showErrorMessage(`❌ Configuration failed: ${error.message}`);
            return false;
        }
    }

    private static async promptForApiKey(provider: AIProvider): Promise<string | null> {
        let placeHolder = '';
        let prompt = '';

        switch (provider.value) {
            case 'openai':
                placeHolder = 'sk-...';
                prompt = 'Enter your OpenAI API key';
                break;
            case 'anthropic':
                placeHolder = 'sk-ant-...';
                prompt = 'Enter your Anthropic API key';
                break;
            case 'azure':
                placeHolder = 'Your Azure API key';
                prompt = 'Enter your Azure OpenAI API key';
                break;
        }

        const apiKey = await vscode.window.showInputBox({
            prompt,
            placeHolder,
            password: true,
            ignoreFocusOut: true,
            title: 'Step 2/3: API Key',
            validateInput: (value) => {
                if (!value || value.trim().length < 10) {
                    return 'Please enter a valid API key';
                }
                return null;
            }
        });

        if (!apiKey) return null;

        // For Azure, also get endpoint and deployment
        if (provider.value === 'azure') {
            const endpoint = await vscode.window.showInputBox({
                prompt: 'Enter your Azure OpenAI endpoint',
                placeHolder: 'https://your-resource.openai.azure.com',
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value || !value.startsWith('https://')) {
                        return 'Please enter a valid HTTPS endpoint';
                    }
                    return null;
                }
            });

            if (!endpoint) return null;

            const deployment = await vscode.window.showInputBox({
                prompt: 'Enter your Azure deployment name',
                placeHolder: 'your-deployment-name',
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value || value.trim().length < 3) {
                        return 'Please enter a valid deployment name';
                    }
                    return null;
                }
            });

            if (!deployment) return null;

            // Save Azure-specific settings
            const config = vscode.workspace.getConfiguration('coDebugger.llm');
            await config.update('azureEndpoint', endpoint, vscode.ConfigurationTarget.Global);
            await config.update('azureDeploymentName', deployment, vscode.ConfigurationTarget.Global);
        }

        return apiKey;
    }

    private static async saveConfiguration(provider: AIProvider, apiKey: string, model: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('coDebugger.llm');
        const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const user = os.userInfo().username || 'unknown-user';

        await config.update('provider', provider.value, vscode.ConfigurationTarget.Global);
        await config.update('model', model, vscode.ConfigurationTarget.Global);

        // Save provider-specific API key
        const apiKeyField = this.getApiKeyField(provider.value);
        await config.update(apiKeyField, apiKey, vscode.ConfigurationTarget.Global);

        console.log(`✅ Configuration saved at ${timestamp}: ${provider.value}/${model} (User: ${user})`);
    }

    private static async testConfiguration(llmService: LLMService, provider: string, model: string): Promise<boolean> {
        const progressOptions = {
            location: vscode.ProgressLocation.Notification,
            title: 'Testing AI Configuration',
            cancellable: false
        };

        return vscode.window.withProgress(progressOptions, async (progress) => {
            try {
                progress.report({ message: 'Connecting to AI service...' });

                const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
                const user = os.userInfo().username || 'unknown-user';

                const testContext = `## Test Debug Context
Function: main.testFunction
Variables:
- message: "Hello from Co Debugger AI"
- status: "testing"
- timestamp: "${timestamp}"
- user: "${user}"

This is a configuration test for the Co Debugger AI extension.`;

                const testQuery = 'Please confirm that the AI integration is working by analyzing this test context.';

                const response = await llmService.callLLM(testContext, testQuery, {
                    provider: provider as any,
                    model: model,
                    temperature: 0.3,
                    maxTokens: 300
                });

                progress.report({ message: 'Configuration test successful!' });

                // Show test results
                const doc = await vscode.workspace.openTextDocument({
                    content: `# AI Configuration Test - SUCCESS ✅
**Provider**: ${provider.toUpperCase()}
**Model**: ${model}
**Timestamp**: ${timestamp}
**User**: ${user}

## Test Query
${testQuery}

## AI Response
${response}

---
🎉 **Configuration is working correctly!**
You can now use the AI debug assistant with your ${provider.toUpperCase()} ${model} setup.

💡 **Next Steps:**
1. Start a debug session in any supported language
2. Set a breakpoint and trigger execution
3. Use the AI assistant in the debug context view or Quick Debug AI panel`,
                    language: 'markdown'
                });

                await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
                return true;

            } catch (error) {
                const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
                console.error(`❌ Configuration test failed at ${timestamp}:`, error);
                
                const retry = await vscode.window.showErrorMessage(
                    `❌ AI Configuration Test Failed\n\n${error.message}\n\nThis might be due to an invalid API key or network issues.`,
                    'Retry Configuration',
                    'Check Settings',
                    'Continue Anyway'
                );

                if (retry === 'Retry Configuration') {
                    return await this.configureAI(llmService);
                } else if (retry === 'Check Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'coDebugger.llm');
                }

                return retry === 'Continue Anyway';
            }
        });
    }

    private static hasValidApiKey(provider: string): boolean {
        const config = vscode.workspace.getConfiguration('coDebugger.llm');
        const apiKeyField = this.getApiKeyField(provider);
        const apiKey = config.get<string>(apiKeyField, '');
        return apiKey.length > 10;
    }

    private static getApiKeyField(provider: string): string {
        switch (provider) {
            case 'openai': return 'openaiApiKey';
            case 'anthropic': return 'anthropicApiKey';
            case 'azure': return 'azureApiKey';
            default: return 'openaiApiKey';
        }
    }

    static async quickConfigure(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('coDebugger.llm');
        const hasAnyKey = this.hasValidApiKey('openai') || this.hasValidApiKey('anthropic') || this.hasValidApiKey('azure');

        if (hasAnyKey) {
            vscode.window.showInformationMessage('✅ AI is already configured! You can use the AI assistant in debug sessions.');
            return true;
        }

        return vscode.window.showInformationMessage(
            '🤖 AI Assistant not configured. Would you like to set it up now?',
            'Configure AI',
            'Later'
        ).then(selection => {
            if (selection === 'Configure AI') {
                vscode.commands.executeCommand('coDebugger.configureAI');
                return true;
            }
            return false;
        });
    }
}