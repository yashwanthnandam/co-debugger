import { EventEmitter } from 'events';
import { ContextCollector, ContextData, FunctionCall } from './contextCollector';
import { DelveClient } from './delveClient';
import * as os from 'os';

export interface PathNode {
    id: string;
    functionName: string;
    file: string;
    line: number;
    depth: number;
    status: 'executed' | 'current' | 'possible' | 'error' | 'skipped';
    children: string[];
    parent?: string;
    metadata: {
        probability?: number;
        riskLevel?: string;
        branchCondition?: string;
        executionTime?: number;
        memoryUsage?: string;
        alternativePathType?: string;
    };
}

export interface ExecutionPathGraph {
    actualPath: PathNode[];
    possiblePaths: PathNode[];
    pathStatistics: {
        totalNodes: number;
        executedNodes: number;
        possibleNodes: number;
        pathCoverage: number;
        branchingFactor: number;
        branchPointsDetected: number;
    };
    maxDepth: number;
    timestamp: number;
    user: string;
    sessionId: string;
}

export class ExecutionPathGraphService extends EventEmitter {
    private contextCollector: ContextCollector;
    private delveClient: DelveClient;
    private currentGraph: ExecutionPathGraph;

    constructor(contextCollector: ContextCollector, delveClient: DelveClient) {
        super();
        this.contextCollector = contextCollector;
        this.delveClient = delveClient;
        
        this.currentGraph = this.initializeEmptyGraph();
        this.setupEventListeners();
    }

    private getCurrentUser(): string {
        return os.userInfo().username || 'yashwanthnandam';
    }

    private getCurrentTimestamp(): string {
        return '2025-06-12 02:15:38';
    }

    private getFormattedTime(): string {
        return new Date().toISOString();
    }

    private initializeEmptyGraph(): ExecutionPathGraph {
        return {
            actualPath: [],
            possiblePaths: [],
            pathStatistics: {
                totalNodes: 0,
                executedNodes: 0,
                possibleNodes: 0,
                pathCoverage: 0,
                branchingFactor: 0,
                branchPointsDetected: 0
            },
            maxDepth: 0,
            timestamp: Date.now(),
            user: this.getCurrentUser(),
            sessionId: 'graph-session'
        };
    }

    private setupEventListeners(): void {
        this.contextCollector.on('contextUpdated', (context: ContextData) => {
            this.updateGraph(context);
        });
    }

    private updateGraph(context: ContextData): void {
        console.log(`🔄 Updating execution path graph at ${this.getCurrentTimestamp()}`);
        
        const graph = this.buildExecutionPathGraph(context);
        this.currentGraph = graph;
        
        this.emit('graphUpdated', graph);
    }

    private buildExecutionPathGraph(context: ContextData): ExecutionPathGraph {
        console.log(`📊 Building execution path graph for ${this.getCurrentUser()}`);
        
        // Build actual execution path from function calls
        const actualPath = this.buildActualPath(context.functionCalls);
        console.log(`📊 Built actual path: ${actualPath.length} nodes, depth range: ${actualPath.length > 0 ? Math.min(...actualPath.map(n => n.depth)) : 0} to ${actualPath.length > 0 ? Math.max(...actualPath.map(n => n.depth)) : 0}`);
        
        // Build possible paths from analysis data
        const possiblePaths = this.buildPossiblePaths(context, actualPath);
        console.log(`📊 Built possible paths: ${possiblePaths.length} nodes`);
        
        const allNodes = [...actualPath, ...possiblePaths];
        const maxDepth = allNodes.length > 0 ? Math.max(...allNodes.map(n => n.depth)) : 0;
        
        // Calculate statistics
        const pathStatistics = this.calculatePathStatistics(actualPath, possiblePaths, context);
        
        return {
            actualPath,
            possiblePaths,
            pathStatistics,
            maxDepth,
            timestamp: Date.now(),
            user: this.getCurrentUser(),
            sessionId: context.debugInfo.sessionId
        };
    }

    private buildActualPath(functionCalls: FunctionCall[]): PathNode[] {
        const nodes: PathNode[] = [];
        
        // Reverse the function calls to show call hierarchy (deepest first becomes root)
        const reversedCalls = [...functionCalls].reverse();
        
        reversedCalls.forEach((call, index) => {
            const node: PathNode = {
                id: call.id,
                functionName: this.cleanFunctionName(call.name),
                file: call.file || '',
                line: call.line || 0,
                depth: index,
                status: index === 0 ? 'current' : 'executed', // First node (deepest call) is current
                children: index < reversedCalls.length - 1 ? [reversedCalls[index + 1].id] : [],
                parent: index > 0 ? reversedCalls[index - 1].id : undefined,
                metadata: {
                    executionTime: call.endTime ? call.endTime - call.startTime : undefined,
                    probability: 1.0
                }
            };
            nodes.push(node);
        });
        
        return nodes;
    }

    private buildPossiblePaths(context: ContextData, actualPath: PathNode[]): PathNode[] {
        const possibleNodes: PathNode[] = [];
        const maxActualDepth = actualPath.length > 0 ? Math.max(...actualPath.map(n => n.depth)) : 0;
        
        console.log(`🔍 Building possible paths, maxActualDepth: ${maxActualDepth}`);
        
        // Process symbolic execution alternatives
        if (context.symbolicExecution) {
            console.log(`🔍 Symbolic execution data: present`);
            const symbolicAlternatives = this.processSymbolicExecutionAlternatives(
                context.symbolicExecution.alternativePaths,
                actualPath,
                maxActualDepth
            );
            possibleNodes.push(...symbolicAlternatives);
        }
        
        // Process path sensitivity critical paths
        if (context.pathSensitivity) {
            console.log(`🔍 Path sensitivity data: present`);
            const criticalPathNodes = this.processPathSensitivityPaths(
                context.pathSensitivity.pathAnalysis.criticalPaths,
                actualPath,
                maxActualDepth
            );
            possibleNodes.push(...criticalPathNodes);
        }
        
        return possibleNodes;
    }

    private processSymbolicExecutionAlternatives(
        alternatives: any[],
        actualPath: PathNode[],
        maxActualDepth: number
    ): PathNode[] {
        const nodes: PathNode[] = [];
        
        console.log(`🔍 Processing ${alternatives.length} alternative paths from symbolic execution`);
        
        alternatives.forEach((alt, index) => {
            // Extract proper function name from alternative description
            const functionName = this.extractFunctionNameFromDescription(alt.description);
            
            if (this.isValidFunctionName(functionName)) {
                // Find the best parent node from actual path
                const parentNode = this.findBestParentNode(functionName, actualPath);
                const depth = parentNode ? parentNode.depth + 1 : maxActualDepth + 1;
                
                const node: PathNode = {
                    id: `alt-${alt.id}`,
                    functionName: functionName,
                    file: this.extractFileFromDescription(alt.description),
                    line: this.extractLineFromDescription(alt.description),
                    depth: depth,
                    status: 'possible',
                    children: [],
                    parent: parentNode?.id,
                    metadata: {
                        probability: this.convertProbabilityToNumber(alt.probability),
                        alternativePathType: 'symbolic_execution',
                        branchCondition: alt.requiredInputChanges?.[0]?.reasoning || alt.description
                    }
                };
                
                // Add to parent's children
                if (parentNode) {
                    if (!parentNode.children.includes(node.id)) {
                        parentNode.children.push(node.id);
                    }
                }
                
                nodes.push(node);
                console.log(`✅ Added symbolic alternative: ${functionName} at depth ${depth}`);
            } else {
                console.log(`⚠️ Skipping alternative with invalid function name: "${functionName}" from description: "${alt.description}"`);
            }
        });
        
        return nodes;
    }

    private processPathSensitivityPaths(
        criticalPaths: any[],
        actualPath: PathNode[],
        maxActualDepth: number
    ): PathNode[] {
        const nodes: PathNode[] = [];
        
        console.log(`🔍 Processing ${criticalPaths.length} critical paths from path sensitivity`);
        
        criticalPaths.forEach((path, index) => {
            const functionName = this.extractFunctionNameFromDescription(path.description);
            
            if (this.isValidFunctionName(functionName)) {
                // Find the best parent node from actual path
                const parentNode = this.findBestParentNode(functionName, actualPath);
                const depth = parentNode ? parentNode.depth + 1 : maxActualDepth + 1;
                
                const node: PathNode = {
                    id: `critical-${path.pathId}`,
                    functionName: functionName,
                    file: this.extractFileFromDescription(path.description),
                    line: this.extractLineFromDescription(path.description),
                    depth: depth,
                    status: this.determineStatusFromPath(path),
                    children: [],
                    parent: parentNode?.id,
                    metadata: {
                        probability: path.probability || 0.5,
                        riskLevel: path.riskLevel,
                        alternativePathType: 'critical_path'
                    }
                };
                
                // Add to parent's children
                if (parentNode) {
                    if (!parentNode.children.includes(node.id)) {
                        parentNode.children.push(node.id);
                    }
                }
                
                nodes.push(node);
                console.log(`✅ Added critical path: ${functionName} at depth ${depth} (${path.riskLevel} risk)`);
            }
        });
        
        return nodes;
    }

    // FIXED: Proper function name extraction
    private extractFunctionNameFromDescription(description: string): string {
        if (!description) return 'unknown';
        
        // Pattern 1: "possible path through FUNCTION_NAME at line LINE"
        // Pattern 2: "executed path through FUNCTION_NAME at line LINE"
        const throughPattern = /(?:possible|executed)\s+path\s+through\s+([^\s]+(?:\.[^\s]+)*)\s+at\s+line/i;
        const throughMatch = description.match(throughPattern);
        if (throughMatch && throughMatch[1]) {
            return this.cleanFunctionName(throughMatch[1]);
        }
        
        // Pattern 3: "FUNCTION_NAME at line LINE"
        const atLinePattern = /([^\s]+(?:\.[^\s]+)*)\s+at\s+line\s+\d+/i;
        const atLineMatch = description.match(atLinePattern);
        if (atLineMatch && atLineMatch[1]) {
            return this.cleanFunctionName(atLineMatch[1]);
        }
        
        // Pattern 4: Extract Go function patterns
        const goFunctionPattern = /([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_*\-]*)+)/;
        const goMatch = description.match(goFunctionPattern);
        if (goMatch && goMatch[1]) {
            return this.cleanFunctionName(goMatch[1]);
        }
        
        // Fallback: Take the description itself if it looks like a function name
        const cleanDesc = description.trim();
        if (cleanDesc.includes('.') && !cleanDesc.includes(' ')) {
            return this.cleanFunctionName(cleanDesc);
        }
        
        console.log(`⚠️ Could not extract function name from: "${description}"`);
        return 'unknown_function';
    }

    private extractFileFromDescription(description: string): string {
        // Try to extract file name from common patterns
        const filePattern = /([a-zA-Z_][a-zA-Z0-9_]*\.go)/;
        const match = description.match(filePattern);
        return match ? match[1] : '';
    }

    private extractLineFromDescription(description: string): number {
        const linePattern = /at\s+line\s+(\d+)/i;
        const match = description.match(linePattern);
        return match ? parseInt(match[1]) : 0;
    }

    private cleanFunctionName(name: string): string {
        if (!name) return 'unknown';
        
        // Remove common prefixes and clean up
        let cleaned = name.trim();
        
        // Remove package paths but keep the meaningful part
        if (cleaned.includes('/')) {
            const parts = cleaned.split('/');
            cleaned = parts[parts.length - 1];
        }
        
        // Keep function names readable
        if (cleaned.length > 50) {
            const parts = cleaned.split('.');
            if (parts.length > 1) {
                // Keep last 2 parts for readability
                cleaned = parts.slice(-2).join('.');
            } else {
                cleaned = cleaned.substring(0, 47) + '...';
            }
        }
        
        return cleaned;
    }

    private isValidFunctionName(name: string): boolean {
        if (!name || name.length < 2) return false;
        if (name === 'unknown' || name === 'unknown_function') return false;
        if (['possible', 'executed', 'path', 'through', 'at', 'line'].includes(name.toLowerCase())) return false;
        
        // Must contain at least one letter
        return /[a-zA-Z]/.test(name);
    }

    private findBestParentNode(functionName: string, actualPath: PathNode[]): PathNode | null {
        if (actualPath.length === 0) return null;
        
        // Try to find a logical parent based on function name patterns
        const lowerFuncName = functionName.toLowerCase();
        
        // Look for related functions in the actual path
        for (let i = actualPath.length - 1; i >= 0; i--) {
            const node = actualPath[i];
            const nodeFuncName = node.functionName.toLowerCase();
            
            // Same package/module
            if (functionName.includes('.') && nodeFuncName.includes('.')) {
                const funcParts = functionName.split('.');
                const nodeParts = node.functionName.split('.');
                
                // Same package
                if (funcParts.length > 1 && nodeParts.length > 1 && 
                    funcParts[0] === nodeParts[0]) {
                    return node;
                }
            }
            
            // Handler functions often relate to the main handler
            if (lowerFuncName.includes('handler') && nodeFuncName.includes('handler')) {
                return node;
            }
            
            // Middleware functions relate to context/next
            if ((lowerFuncName.includes('middleware') || lowerFuncName.includes('func1')) && 
                (nodeFuncName.includes('context') || nodeFuncName.includes('next'))) {
                return node;
            }
        }
        
        // Default: attach to the current/deepest function
        const currentNode = actualPath.find(n => n.status === 'current');
        return currentNode || actualPath[0];
    }

    private determineStatusFromPath(path: any): PathNode['status'] {
        if (path.riskLevel === 'critical' || path.riskLevel === 'high') {
            return 'error';
        }
        if (path.description?.includes('executed path')) {
            return 'executed';
        }
        return 'possible';
    }

    private convertProbabilityToNumber(probability: any): number {
        if (typeof probability === 'number') return probability;
        if (typeof probability === 'string') {
            switch (probability.toLowerCase()) {
                case 'very-high': return 0.9;
                case 'high': return 0.7;
                case 'medium': return 0.5;
                case 'low': return 0.3;
                case 'very-low': return 0.1;
                default: return 0.5;
            }
        }
        return 0.5;
    }

    private calculatePathStatistics(
        actualPath: PathNode[],
        possiblePaths: PathNode[],
        context: ContextData
    ): ExecutionPathGraph['pathStatistics'] {
        const totalNodes = actualPath.length + possiblePaths.length;
        const executedNodes = actualPath.filter(n => n.status === 'executed').length;
        const possibleNodes = possiblePaths.length;
        
        const pathCoverage = totalNodes > 0 ? executedNodes / totalNodes : 0;
        
        // Calculate branching factor
        const nodesWithChildren = [...actualPath, ...possiblePaths].filter(n => n.children.length > 0);
        const branchingFactor = nodesWithChildren.length > 0 ? 
            nodesWithChildren.reduce((sum, n) => sum + n.children.length, 0) / nodesWithChildren.length : 0;
        
        const branchPointsDetected = context.pathSensitivity?.pathAnalysis?.branchPointsDetected || 0;
        
        return {
            totalNodes,
            executedNodes,
            possibleNodes,
            pathCoverage,
            branchingFactor,
            branchPointsDetected
        };
    }

    getCurrentGraph(): ExecutionPathGraph {
        return this.currentGraph;
    }

    getGraphSummary(): string {
        const graph = this.currentGraph;
        
        return `# Execution Path Graph Summary
**Generated**: ${this.getCurrentTimestamp()}
**User**: ${this.getCurrentUser()}
**Session**: ${graph.sessionId}

## Statistics
- **Total Nodes**: ${graph.pathStatistics.totalNodes}
- **Executed Nodes**: ${graph.pathStatistics.executedNodes}
- **Possible Paths**: ${graph.pathStatistics.possibleNodes}
- **Path Coverage**: ${(graph.pathStatistics.pathCoverage * 100).toFixed(1)}%
- **Branching Factor**: ${graph.pathStatistics.branchingFactor.toFixed(2)}
- **Max Depth**: ${graph.maxDepth}
- **Branch Points**: ${graph.pathStatistics.branchPointsDetected}

## Actual Execution Path
${graph.actualPath.map((node, i) => 
    `${i + 1}. **${node.functionName}** (${node.file}:${node.line}) - Depth ${node.depth} [${node.status}]`
).join('\n')}

## Possible Alternative Paths (Top 10)
${graph.possiblePaths.slice(0, 10).map((node, i) => 
    `${i + 1}. **${node.functionName}** (${node.file}:${node.line}) - Depth ${node.depth} [${node.status}]${node.metadata.riskLevel ? ` - ${node.metadata.riskLevel} risk` : ''}`
).join('\n')}

## Analysis
- **Current Location**: ${graph.actualPath.find(n => n.status === 'current')?.functionName || 'Unknown'}
- **High Risk Paths**: ${graph.possiblePaths.filter(n => n.metadata.riskLevel === 'high' || n.metadata.riskLevel === 'critical').length}
- **Error Scenarios**: ${graph.possiblePaths.filter(n => n.status === 'error').length}

---
*Generated by Enhanced Go Debug Context Analyzer*
*Timestamp: ${this.getCurrentTimestamp()}*
`;
    }

    dispose(): void {
        this.removeAllListeners();
        console.log(`🧹 Disposing ExecutionPathGraphService at ${this.getCurrentTimestamp()}`);
    }
}