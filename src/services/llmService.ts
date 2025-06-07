import * as vscode from 'vscode';
import fetch from 'node-fetch';

export interface LLMOptions {
    provider: 'openai' | 'anthropic' | 'azure' | 'custom';
    model: string;
    temperature?: number;
    maxTokens?: number;
    apiEndpoint?: string;
}

export class LLMService {
    async callLLM(context: string, query: string, options: LLMOptions): Promise<string> {
        switch (options.provider) {
            case 'openai':
                return this.callOpenAI(context, query, options);
            case 'anthropic':
                return this.callAnthropic(context, query, options);
            case 'azure':
                return this.callAzureOpenAI(context, query, options);
            case 'custom':
                return this.callCustomEndpoint(context, query, options);
            default:
                throw new Error(`Unsupported provider: ${options.provider}`);
        }
    }

    private async callOpenAI(context: string, query: string, options: LLMOptions): Promise<string> {
        const config = vscode.workspace.getConfiguration('contextSelector.llm');
        const apiKey = config.get<string>('openaiApiKey');
        
        if (!apiKey) {
            throw new Error('OpenAI API key not configured');
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: options.model || 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a Go debugging expert. Analyze the provided debugging context and answer questions about code execution, variable changes, and function calls. Be specific and actionable in your responses.'
                    },
                    {
                        role: 'user',
                        content: `${query}\n\nDebugging Context:\n${context}`
                    }
                ],
                temperature: options.temperature ?? 0.3,
                max_tokens: options.maxTokens || 2000
            })
        });

        const data = await response.json() as any;
        
        if (!response.ok) {
            throw new Error(data.error?.message || `API error: ${response.status}`);
        }

        return data.choices[0].message.content;
    }

    private async callAnthropic(context: string, query: string, options: LLMOptions): Promise<string> {
        const config = vscode.workspace.getConfiguration('contextSelector.llm');
        const apiKey = config.get<string>('anthropicApiKey');
        
        if (!apiKey) {
            throw new Error('Anthropic API key not configured');
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: options.model || 'claude-3-opus-20240229',
                system: 'You are a Go debugging expert. Analyze the provided debugging context and answer questions about code execution, variable changes, and function calls. Be specific and actionable in your responses.',
                messages: [
                    {
                        role: 'user',
                        content: `${query}\n\nDebugging Context:\n${context}`
                    }
                ],
                temperature: options.temperature ?? 0.3,
                max_tokens: options.maxTokens || 2000
            })
        });

        const data = await response.json() as any;
        
        if (!response.ok) {
            throw new Error(data.error?.message || `API error: ${response.status}`);
        }

        return data.content[0].text;
    }

    private async callAzureOpenAI(context: string, query: string, options: LLMOptions): Promise<string> {
        // Similar implementation for Azure OpenAI
        throw new Error('Azure OpenAI not implemented yet');
    }

    private async callCustomEndpoint(context: string, query: string, options: LLMOptions): Promise<string> {
        // Custom endpoint implementation
        throw new Error('Custom endpoint not implemented yet');
    }
}