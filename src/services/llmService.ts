import * as vscode from 'vscode';
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

    async callLLM(context: string, query: string, options: LLMOptions): Promise<string> {
        // Extract only the clean context preview that users see
        const cleanContext = this.extractCleanContext(context);
        
        // Check cache first
        const cacheKey = this.generateCacheKey(cleanContext, query, options);
        const cached = this.getCachedResponse(cacheKey);
        if (cached) {
            console.log(`🚀 Using cached LLM response`);
            return cached.content;
        }

        let response: LLMResponse;
        
        try {
            switch (options.provider) {
                case 'openai':
                    response = await this.callOpenAI(cleanContext, query, options);
                    break;
                case 'anthropic':
                    response = await this.callAnthropic(cleanContext, query, options);
                    break;
                case 'azure':
                    response = await this.callAzureOpenAI(cleanContext, query, options);
                    break;
                case 'custom':
                    response = await this.callCustomEndpoint(cleanContext, query, options);
                    break;
                default:
                    throw new Error(`Unsupported provider: ${options.provider}`);
            }

            // Cache the response
            this.cacheResponse(cacheKey, response);
            return response.content;
            
        } catch (error) {
            console.error(`❌ LLM call failed:`, error);
            throw error;
        }
    }

    private extractCleanContext(rawContext: string): string {
        // Remove timestamp lines
        let cleaned = rawContext.replace(/\*\*Generated\*\*: [^\n]+\n/g, '');
        
        // Remove user lines
        cleaned = cleaned.replace(/\*\*User\*\*: [^\n]+\n/g, '');
        
        // Remove session lines
        cleaned = cleaned.replace(/\*\*Session\*\*: [^\n]+\n/g, '');
        
        // Remove language lines
        cleaned = cleaned.replace(/\*\*Language\*\*: [^\n]+\n/g, '');
        
        // Remove timestamp references in content
        cleaned = cleaned.replace(/at \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/g, '');
        
        // Remove user references in content
        cleaned = cleaned.replace(/\(User: [^)]+\)/g, '');
        
        // Remove internal threading/frame info that's not relevant for AI
        cleaned = cleaned.replace(/- \*\*Thread ID\*\*: [^\n]+\n/g, '');
        cleaned = cleaned.replace(/- \*\*Frame ID\*\*: [^\n]+\n/g, '');
        
        // Remove performance metrics that clutter context
        cleaned = cleaned.replace(/## Performance Metrics[\s\S]*?(?=##|\n\n|$)/g, '');
        
        // Remove internal debugging timestamps from log entries
        cleaned = cleaned.replace(/🎯[^:]*: [^\n]*at \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[^\n]*\n/g, '');
        
        // Clean up extra whitespace
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
        cleaned = cleaned.trim();
        
        return cleaned;
    }

    private generateCacheKey(context: string, query: string, options: LLMOptions): string {
        const contextHash = this.simpleHash(context.substring(0, 1000));
        const queryHash = this.simpleHash(query);
        return `${options.provider}-${options.model}-${contextHash}-${queryHash}`;
    }

    private simpleHash(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    private getCachedResponse(cacheKey: string): LLMResponse | null {
        const cached = this.requestCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.response;
        }
        if (cached) {
            this.requestCache.delete(cacheKey);
        }
        return null;
    }

    private cacheResponse(cacheKey: string, response: LLMResponse): void {
        this.requestCache.set(cacheKey, {
            response,
            timestamp: Date.now()
        });

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

        const systemPrompt = `You are an expert debugging assistant. 

Analyze the provided debugging context and provide specific, actionable insights about:
1. Variable values and their application meaning
2. Function execution flow and call stack
3. Potential issues, bugs, or anomalies
4. Suggestions for next debugging steps
5. Code logic analysis and recommendations

Be concise but thorough. Focus on application logic rather than infrastructure code.
Provide practical debugging advice based on the current execution state.`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': 'VSCode-CoDebugger/2.0'
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
                max_tokens: options.maxTokens || 2000
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
            timestamp: new Date().toISOString()
        };
    }

    private async callAnthropic(context: string, query: string, options: LLMOptions): Promise<LLMResponse> {
        const config = vscode.workspace.getConfiguration('contextSelector.llm');
        const apiKey = config.get<string>('anthropicApiKey');
        
        if (!apiKey) {
            throw new Error('Anthropic API key not configured. Please set contextSelector.llm.anthropicApiKey in settings.');
        }

        const systemPrompt = `You are an expert debugging assistant.

Analyze the provided debugging context and provide specific, actionable insights about:
1. Variable values and their application meaning  
2. Function execution flow and call stack
3. Potential issues, bugs, or anomalies
4. Suggestions for next debugging steps
5. Code logic analysis and recommendations

Be concise but thorough. Focus on application logic rather than infrastructure code.
Provide practical debugging advice based on the current execution state.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'User-Agent': 'VSCode-CoDebugger/2.0'
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
            timestamp: new Date().toISOString()
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
                'User-Agent': 'VSCode-CoDebugger/2.0'
            },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'system',
                        content: `You are a debugging expert. Analyze the provided debugging context and answer questions about code execution, variable changes, and function calls. Focus on application logic and provide actionable insights.`
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
            timestamp: new Date().toISOString()
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
            'User-Agent': 'VSCode-CoDebugger/2.0'
        };

        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: options.model || 'default',
                prompt: `Query: ${query}\n\nContext: ${context}`,
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
            timestamp: new Date().toISOString()
        };
    }

    dispose() {
        this.requestCache.clear();
    }
}