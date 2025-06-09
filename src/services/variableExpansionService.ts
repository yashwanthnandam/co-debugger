import { DataStructureHandler, SimplifiedValue, VariableExpansionRequest } from './dataStructureHandler';

export interface ExpansionResult {
    success: boolean;
    data?: SimplifiedValue;
    error?: string;
    memoryUsed: string;
    expansionTime: number;
}

export class VariableExpansionService {
    private dataHandler: DataStructureHandler;
    private expansionHistory: Map<string, ExpansionResult> = new Map();

    constructor() {
        this.dataHandler = new DataStructureHandler();
    }

    async expandVariable(
        session: any,
        frameId: number,
        variableName: string,
        maxDepth: number = 4
    ): Promise<ExpansionResult> {
        const startTime = Date.now();
        const cacheKey = `${frameId}-${variableName}-${maxDepth}`;

        try {
            console.log(`🔍 2025-06-09 03:58:47 - Expanding variable: ${variableName} with depth: ${maxDepth}`);

            const expanded = await this.dataHandler.expandVariableOnDemand(
                session,
                frameId,
                variableName,
                [],
                maxDepth
            );

            const expansionTime = Date.now() - startTime;
            const memoryUsed = this.dataHandler.getMemoryUsageFormatted();

            const result: ExpansionResult = {
                success: !!expanded,
                data: expanded || undefined,
                memoryUsed,
                expansionTime
            };

            this.expansionHistory.set(cacheKey, result);
            
            console.log(`✅ 2025-06-09 03:58:47 - Variable ${variableName} expanded in ${expansionTime}ms, memory: ${memoryUsed}`);
            
            return result;

        } catch (error) {
            const expansionTime = Date.now() - startTime;
            const result: ExpansionResult = {
                success: false,
                error: error.message,
                memoryUsed: this.dataHandler.getMemoryUsageFormatted(),
                expansionTime
            };

            console.error(`❌ 2025-06-09 03:58:47 - Error expanding ${variableName}:`, error);
            return result;
        }
    }

    async expandAllVariablesInScope(
        session: any,
        frameId: number,
        maxDepth: number = 3,
        maxVariables: number = 20
    ): Promise<Record<string, ExpansionResult>> {
        console.log(`🔄 2025-06-09 03:58:47 - Expanding all variables in frame ${frameId}`);

        const results: Record<string, ExpansionResult> = {};

        try {
            // Get scopes for the frame
            const scopes = await session.customRequest('scopes', { frameId });

            for (const scope of scopes.scopes) {
                console.log(`📂 2025-06-09 03:58:47 - Expanding scope: ${scope.name}`);
                
                const variables = await session.customRequest('variables', {
                    variablesReference: scope.variablesReference
                });

                if (variables.variables) {
                    // Sort variables by importance and take top N
                    const sortedVars = this.sortVariablesByImportance(variables.variables)
                        .slice(0, maxVariables);

                    for (const variable of sortedVars) {
                        const result = await this.expandVariable(
                            session,
                            frameId,
                            variable.name,
                            maxDepth
                        );
                        
                        results[variable.name] = result;
                        
                        // Small delay to prevent overwhelming the debug adapter
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }
                }
            }

            console.log(`✅ 2025-06-09 03:58:47 - Expanded ${Object.keys(results).length} variables`);
            return results;

        } catch (error) {
            console.error(`❌ 2025-06-09 03:58:47 - Error expanding all variables:`, error);
            return results;
        }
    }

    private sortVariablesByImportance(variables: any[]): any[] {
        return variables.sort((a, b) => {
            const aScore = this.calculateVariableImportance(a);
            const bScore = this.calculateVariableImportance(b);
            return bScore - aScore;
        });
    }

    private calculateVariableImportance(variable: any): number {
        let score = 0;
        const name = variable.name.toLowerCase();
        const value = variable.value || '';

        // Business-agnostic importance scoring
        const highImportancePatterns = [
            'data', 'request', 'response', 'result', 'error', 'status',
            'id', 'name', 'type', 'code', 'message', 'value'
        ];

        const mediumImportancePatterns = [
            'context', 'ctx', 'config', 'params', 'options', 'settings',
            'time', 'timestamp', 'count', 'length', 'size'
        ];

        const lowImportancePatterns = [
            'internal', 'private', 'temp', 'tmp', 'cache', 'mutex',
            'lock', 'sync', 'once', 'pool', 'debug'
        ];

        // High importance
        if (highImportancePatterns.some(pattern => name.includes(pattern))) {
            score += 100;
        }

        // Medium importance
        if (mediumImportancePatterns.some(pattern => name.includes(pattern))) {
            score += 50;
        }

        // Low importance (negative)
        if (lowImportancePatterns.some(pattern => name.includes(pattern))) {
            score -= 50;
        }

        // Boost for non-nil values
        if (value && value !== 'nil' && value !== '<nil>' && value !== '0') {
            score += 25;
        }

        // Boost for structured data
        if (value.includes('{') || value.includes('[')) {
            score += 20;
        }

        // Boost for variables with children (variablesReference > 0)
        if (variable.variablesReference && variable.variablesReference > 0) {
            score += 30;
        }

        // Penalty for very long names (often generated)
        if (name.length > 20) {
            score -= 10;
        }

        // Penalty for autogenerated names
        if (name.includes('autotmp') || name.includes('~r') || name.startsWith('.')) {
            score -= 100;
        }

        return score;
    }

    getExpansionHistory(): Map<string, ExpansionResult> {
        return this.expansionHistory;
    }

    clearHistory(): void {
        this.expansionHistory.clear();
        this.dataHandler.clearCache();
    }

    getMemoryUsage(): string {
        return this.dataHandler.getMemoryUsageFormatted();
    }
}