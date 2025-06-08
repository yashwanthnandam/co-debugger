import * as vscode from 'vscode';
import * as os from 'os';
import fetch from 'node-fetch';

export interface LLMOptions {
    provider: 'openai' | 'anthropic' | 'azure' | 'custom';
    model: string;
    temperature?: number;
    maxTokens?: number;
    apiEndpoint?: string;
}

export interface LLMResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    model?: string;
    timestamp: string;
}

export class LLMService {
    private requestCache = new Map<string, { response: LLMResponse; timestamp: number }>();
    private cacheTimeout = 300000; // 5 minutes

    private getCurrentUser(): string {
        return os.userInfo().username || 'unknown-user';
    }

    private getCurrentTimestamp(): string {
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    private getFormattedTime(): string {
        return new Date().toISOString();
    }

    async callLLM(context: string, query: string, options: LLMOptions): Promise<string> {
        // Check cache first
        const cacheKey = this.generateCacheKey(context, query, options);
        const cached = this.getCachedResponse(cacheKey);
        if (cached) {
            console.log(`🚀 Using cached LLM response for ${this.getCurrentUser()} at ${this.getCurrentTimestamp()}`);
            return cached.content;
        }

        let response: LLMResponse;
        
        try {
            switch (options.provider) {
                case 'openai':
                    response = await this.callOpenAI(context, query, options);
                    break;
                case 'anthropic':
                    response = await this.callAnthropic(context, query, options);
                    break;
                case 'azure':
                    response = await this.callAzureOpenAI(context, query, options);
                    break;
                case 'custom':
                    response = await this.callCustomEndpoint(context, query, options);
                    break;
                default:
                    throw new Error(`Unsupported provider: ${options.provider}`);
            }

            // Cache the response
            this.cacheResponse(cacheKey, response);
            return response.content;
            
        } catch (error) {
            console.error(`❌ LLM call failed for ${this.getCurrentUser()} at ${this.getCurrentTimestamp()}:`, error);
            throw error;
        }
    }

    private generateCacheKey(context: string, query: string, options: LLMOptions): string {
        const contextHash = this.simpleHash(context.substring(0, 1000)); // Use first 1000 chars
        const queryHash = this.simpleHash(query);
        return `${options.provider}-${options.model}-${contextHash}-${queryHash}`;
    }

    private simpleHash(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    private getCachedResponse(cacheKey: string): LLMResponse | null {
        const cached = this.requestCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.response;
        }
        if (cached) {
            this.requestCache.delete(cacheKey); // Remove expired cache
        }
        return null;
    }

    private cacheResponse(cacheKey: string, response: LLMResponse): void {
        this.requestCache.set(cacheKey, {
            response,
            timestamp: Date.now()
        });

        // Clean up old cache entries periodically
        if (this.requestCache.size > 100) {
            const now = Date.now();
            for (const [key, value] of this.requestCache.entries()) {
                if (now - value.timestamp > this.cacheTimeout) {
                    this.requestCache.delete(key);
                }
            }
        }
    }

    private async callOpenAI(context: string, query: string, options: LLMOptions): Promise<LLMResponse> {
        const config = vscode.workspace.getConfiguration('contextSelector.llm');
        const apiKey = config.get<string>('openaiApiKey');
        
        if (!apiKey) {
            throw new Error('OpenAI API key not configured. Please set contextSelector.llm.openaiApiKey in settings.');
        }

        const systemPrompt = `You are an expert Go debugger assistant for user "${this.getCurrentUser()}". 

Current context: You're analyzing a Go application that provides web services and APIs.

Analyze the provided debugging context and provide specific, actionable insights about:
1. Variable values and their application meaning
2. Function execution flow
3. Potential issues or bugs
4. Suggestions for debugging steps

Be concise but thorough. Focus on application logic rather than infrastructure code.

Current time: ${this.getFormattedTime()}`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': 'VSCode-ContextSelector/1.0'
            },
            body: JSON.stringify({
                model: options.model || 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: `${query}\n\n--- Debug Context ---\n${context}`
                    }
                ],
                temperature: options.temperature ?? 0.3,
                max_tokens: options.maxTokens || 2000,
                user: this.getCurrentUser()
            })
        });

        const data = await response.json() as any;
        
        if (!response.ok) {
            throw new Error(data.error?.message || `OpenAI API error: ${response.status}`);
        }

        return {
            content: data.choices[0].message.content,
            usage: data.usage,
            model: data.model,
            timestamp: this.getFormattedTime()
        };
    }

    private async callAnthropic(context: string, query: string, options: LLMOptions): Promise<LLMResponse> {
        const config = vscode.workspace.getConfiguration('contextSelector.llm');
        const apiKey = config.get<string>('anthropicApiKey');
        
        if (!apiKey) {
            throw new Error('Anthropic API key not configured. Please set contextSelector.llm.anthropicApiKey in settings.');
        }

        const systemPrompt = `You are an expert Go debugger assistant for user "${this.getCurrentUser()}".

Current context: You're analyzing a Go application that provides web services and APIs.

Analyze the provided debugging context and provide specific, actionable insights about:
1. Variable values and their application meaning  
2. Function execution flow
3. Potential issues or bugs
4. Suggestions for debugging steps

Be concise but thorough. Focus on application logic rather than infrastructure code.

Current time: ${this.getFormattedTime()}`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'User-Agent': 'VSCode-ContextSelector/1.0'
            },
            body: JSON.stringify({
                model: options.model || 'claude-3-sonnet-20240229',
                system: systemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: `${query}\n\n--- Debug Context ---\n${context}`
                    }
                ],
                temperature: options.temperature ?? 0.3,
                max_tokens: options.maxTokens || 2000
            })
        });

        const data = await response.json() as any;
        
        if (!response.ok) {
            throw new Error(data.error?.message || `Anthropic API error: ${response.status}`);
        }

        return {
            content: data.content[0].text,
            usage: data.usage,
            model: data.model,
            timestamp: this.getFormattedTime()
        };
    }

    private async callAzureOpenAI(context: string, query: string, options: LLMOptions): Promise<LLMResponse> {
        const config = vscode.workspace.getConfiguration('contextSelector.llm');
        const apiKey = config.get<string>('azureApiKey');
        const endpoint = config.get<string>('azureEndpoint');
        const deploymentName = config.get<string>('azureDeploymentName');
        
        if (!apiKey || !endpoint || !deploymentName) {
            throw new Error('Azure OpenAI configuration incomplete. Please set azureApiKey, azureEndpoint, and azureDeploymentName.');
        }

        const url = `${endpoint}/openai/deployments/${deploymentName}/chat/completions?api-version=2023-12-01-preview`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey,
                'User-Agent': 'VSCode-ContextSelector/1.0'
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'system',
                        content: `You are a Go debugging expert for user "${this.getCurrentUser()}". Analyze the provided debugging context and answer questions about code execution, variable changes, and function calls. Focus on application logic and provide actionable insights.`
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
            throw new Error(data.error?.message || `Azure OpenAI API error: ${response.status}`);
        }

        return {
            content: data.choices[0].message.content,
            usage: data.usage,
            model: deploymentName,
            timestamp: this.getFormattedTime()
        };
    }

    private async callCustomEndpoint(context: string, query: string, options: LLMOptions): Promise<LLMResponse> {
        const config = vscode.workspace.getConfiguration('contextSelector.llm');
        const endpoint = options.apiEndpoint || config.get<string>('customEndpoint');
        const apiKey = config.get<string>('customApiKey');
        
        if (!endpoint) {
            throw new Error('Custom endpoint not configured');
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'VSCode-ContextSelector/1.0'
        };

        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: options.model || 'default',
                prompt: `User: ${this.getCurrentUser()}\nQuery: ${query}\n\nContext: ${context}`,
                temperature: options.temperature ?? 0.3,
                max_tokens: options.maxTokens || 2000
            })
        });

        const data = await response.json() as any;
        
        if (!response.ok) {
            throw new Error(data.error?.message || `Custom API error: ${response.status}`);
        }

        return {
            content: data.response || data.content || data.text,
            timestamp: this.getFormattedTime()
        };
    }

    dispose() {
        this.requestCache.clear();
    }
}