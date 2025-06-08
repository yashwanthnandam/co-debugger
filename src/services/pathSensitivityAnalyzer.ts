import * as os from 'os';

export interface PathSensitiveVariable {
    name: string;
    type: string;
    pathSpecificStates: PathState[];
    convergencePoints: ConvergencePoint[];
    pathDependencies: string[];
    sensitivityScore: number; // 0-1, how much the variable depends on path
}

export interface PathState {
    pathId: string;
    pathConditions: string[];
    variableValue: any;
    confidence: number; // 0-1, how confident we are about this state
    lastModifiedAt: {
        file: string;
        line: number;
        function: string;
        condition?: string;
    };
    dataFlow: DataFlowNode[];
}

export interface DataFlowNode {
    nodeId: string;
    operation: 'assignment' | 'conditional' | 'loop' | 'function_call' | 'return';
    expression: string;
    inputVariables: string[];
    outputVariable: string;
    location: {
        file: string;
        line: number;
        function: string;
    };
    pathCondition: string;
    timestamp: number;
}

export interface ConvergencePoint {
    location: {
        file: string;
        line: number;
        function: string;
    };
    convergingPaths: string[];
    unifiedValue?: any;
    potentialConflicts: PathConflict[];
}

export interface PathConflict {
    pathA: string;
    pathB: string;
    conflictType: 'value_mismatch' | 'type_mismatch' | 'null_vs_value' | 'bounds_violation';
    expectedValue: any;
    actualValue: any;
    severity: 'low' | 'medium' | 'high' | 'critical';
    resolutionSuggestion: string;
}

export interface ExecutionPathTree {
    rootNode: PathNode;
    currentPath: string[];
    allPaths: Map<string, PathNode>;
    pathHistory: PathTransition[];
    branchingFactor: number;
    maxDepth: number;
}

export interface PathNode {
    id: string;
    parentId?: string;
    children: string[];
    location: {
        file: string;
        line: number;
        function: string;
    };
    condition?: {
        expression: string;
        result: boolean;
        variables: string[];
        probability: number;
    };
    variableStates: Map<string, any>;
    pathProbability: number;
    executionCount: number;
    timestamp: number;
}

export interface PathTransition {
    fromPath: string;
    toPath: string;
    branchCondition: string;
    transitionType: 'conditional_branch' | 'loop_iteration' | 'function_call' | 'function_return';
    timestamp: number;
    variablesAffected: string[];
}

export interface PathSensitivityReport {
    sessionId: string;
    user: string;
    timestamp: string;
    currentPath: string[];
    pathSensitiveVariables: PathSensitiveVariable[];
    executionTree: ExecutionPathTree;
    pathAnalysis: {
        totalPaths: number;
        exploredPaths: number;
        averageBranchingFactor: number;
        maxPathLength: number;
        criticalPaths: CriticalPath[];
        pathCoverage: number;
    };
    sensitivityMetrics: {
        highSensitivityVariables: string[];
        pathDependentOperations: number;
        branchingComplexity: number;
        dataFlowComplexity: number;
    };
    recommendations: PathRecommendation[];
    performance: {
        analysisTime: number;
        pathsAnalyzed: number;
        nodesCreated: number;
    };
}

export interface CriticalPath {
    pathId: string;
    description: string;
    probability: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    keyVariables: string[];
    potentialIssues: string[];
    testSuggestions: string[];
}

export interface PathRecommendation {
    type: 'testing' | 'refactoring' | 'validation' | 'optimization';
    priority: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    affectedPaths: string[];
    implementationSuggestion: string;
    expectedBenefit: string;
}

export class PathSensitivityAnalyzer {
    private executionTree: ExecutionPathTree;
    private pathSensitiveVariables: Map<string, PathSensitiveVariable>;
    private currentPathId: string;
    private sessionId: string;
    private analysisStartTime: number;
    private dataFlowGraph: Map<string, DataFlowNode[]>;

    constructor(sessionId: string) {
        this.sessionId = sessionId;
        this.analysisStartTime = Date.now();
        this.currentPathId = 'root';
        this.pathSensitiveVariables = new Map();
        this.dataFlowGraph = new Map();
        
        this.executionTree = {
            rootNode: this.createRootNode(),
            currentPath: ['root'],
            allPaths: new Map(),
            pathHistory: [],
            branchingFactor: 0,
            maxDepth: 0
        };
        
        this.executionTree.allPaths.set('root', this.executionTree.rootNode);
    }

    private getCurrentUser(): string {
        return os.userInfo().username || 'unknown-user';
    }

    private getCurrentTimestamp(): string {
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    private getFormattedTime(): string {
        return new Date().toISOString();
    }

    private createRootNode(): PathNode {
        return {
            id: 'root',
            children: [],
            location: { file: '', line: 0, function: 'program_start' },
            variableStates: new Map(),
            pathProbability: 1.0,
            executionCount: 1,
            timestamp: Date.now()
        };
    }

    analyzePathSensitivity(
        variables: any[],
        functionCalls: any[],
        currentLocation: any,
        symbolicExecution?: any
    ): PathSensitivityReport {
        console.log(`🛤️ Starting path-sensitivity analysis for ${this.getCurrentUser()} at ${this.getCurrentTimestamp()}...`);
        
        const startTime = Date.now();

        // Update current path based on location
        this.updateCurrentPath(currentLocation, functionCalls);

        // Analyze each variable for path sensitivity
        this.analyzeVariablePathSensitivity(variables);

        // Build data flow graph
        this.buildDataFlowGraph(variables, functionCalls);

        // Detect path convergence points
        this.detectConvergencePoints();

        // Generate alternative paths
        const criticalPaths = this.generateCriticalPaths();

        // Calculate sensitivity metrics
        const sensitivityMetrics = this.calculateSensitivityMetrics();

        // Generate recommendations
        const recommendations = this.generateRecommendations();

        const analysisTime = Date.now() - startTime;

        console.log(`✅ Path-sensitivity analysis complete for ${this.getCurrentUser()}: ${analysisTime}ms, ${this.executionTree.allPaths.size} paths analyzed`);

        return {
            sessionId: this.sessionId,
            user: this.getCurrentUser(),
            timestamp: this.getCurrentTimestamp(),
            currentPath: this.executionTree.currentPath,
            pathSensitiveVariables: Array.from(this.pathSensitiveVariables.values()),
            executionTree: this.executionTree,
            pathAnalysis: {
                totalPaths: this.estimateTotalPaths(),
                exploredPaths: this.executionTree.allPaths.size,
                averageBranchingFactor: this.calculateAverageBranchingFactor(),
                maxPathLength: this.executionTree.maxDepth,
                criticalPaths,
                pathCoverage: this.calculatePathCoverage()
            },
            sensitivityMetrics,
            recommendations,
            performance: {
                analysisTime,
                pathsAnalyzed: this.executionTree.allPaths.size,
                nodesCreated: this.executionTree.allPaths.size
            }
        };
    }

    private updateCurrentPath(currentLocation: any, functionCalls: any[]): void {
        if (!currentLocation) return;

        const pathSignature = `${currentLocation.function}:${currentLocation.line}`;
        
        // Create new path node if not exists
        if (!this.executionTree.allPaths.has(pathSignature)) {
            const newNode: PathNode = {
                id: pathSignature,
                parentId: this.currentPathId,
                children: [],
                location: currentLocation,
                variableStates: new Map(),
                pathProbability: this.calculatePathProbability(currentLocation, functionCalls),
                executionCount: 1,
                timestamp: Date.now()
            };

            // Add to parent's children
            const parent = this.executionTree.allPaths.get(this.currentPathId);
            if (parent) {
                parent.children.push(pathSignature);
            }

            this.executionTree.allPaths.set(pathSignature, newNode);
        }

        // Update current path
        this.currentPathId = pathSignature;
        this.updatePathHistory(pathSignature);
    }

    private updatePathHistory(newPathId: string): void {
        const lastPath = this.executionTree.currentPath[this.executionTree.currentPath.length - 1];
        
        if (lastPath !== newPathId) {
            this.executionTree.currentPath.push(newPathId);
            
            this.executionTree.pathHistory.push({
                fromPath: lastPath,
                toPath: newPathId,
                branchCondition: this.inferBranchCondition(lastPath, newPathId),
                transitionType: 'function_call',
                timestamp: Date.now(),
                variablesAffected: []
            });
        }

        // Update max depth
        this.executionTree.maxDepth = Math.max(
            this.executionTree.maxDepth, 
            this.executionTree.currentPath.length
        );
    }

    private analyzeVariablePathSensitivity(variables: any[]): void {
        for (const variable of variables) {
            const pathSensitiveVar = this.createOrUpdatePathSensitiveVariable(variable);
            this.pathSensitiveVariables.set(variable.name, pathSensitiveVar);
        }
    }

    private createOrUpdatePathSensitiveVariable(variable: any): PathSensitiveVariable {
        const existing = this.pathSensitiveVariables.get(variable.name);
        
        const currentPathState: PathState = {
            pathId: this.currentPathId,
            pathConditions: this.getCurrentPathConditions(),
            variableValue: variable.value,
            confidence: this.calculateStateConfidence(variable),
            lastModifiedAt: {
                file: this.getCurrentLocation().file,
                line: this.getCurrentLocation().line,
                function: this.getCurrentLocation().function
            },
            dataFlow: this.buildVariableDataFlow(variable)
        };

        if (existing) {
            // Update existing variable
            existing.pathSpecificStates.push(currentPathState);
            existing.sensitivityScore = this.calculateSensitivityScore(existing);
            return existing;
        } else {
            // Create new path-sensitive variable
            return {
                name: variable.name,
                type: variable.type,
                pathSpecificStates: [currentPathState],
                convergencePoints: [],
                pathDependencies: this.analyzePathDependencies(variable),
                sensitivityScore: this.calculateInitialSensitivityScore(variable)
            };
        }
    }

    private buildDataFlowGraph(variables: any[], functionCalls: any[]): void {
        console.log(`🔄 Building data flow graph for ${this.getCurrentUser()}...`);
        
        // Initialize data flow for each variable
        for (const variable of variables) {
            const dataFlowNodes = this.createDataFlowNodes(variable, functionCalls);
            this.dataFlowGraph.set(variable.name, dataFlowNodes);
        }

        // Analyze inter-variable dependencies
        this.analyzeDataFlowDependencies(variables);
        
        console.log(`✅ Data flow graph built: ${this.dataFlowGraph.size} variables, ${this.getTotalDataFlowNodes()} nodes`);
    }

    private createDataFlowNodes(variable: any, functionCalls: any[]): DataFlowNode[] {
        const nodes: DataFlowNode[] = [];
        const timestamp = Date.now();
        
        // Create assignment node for current variable state
        const assignmentNode: DataFlowNode = {
            nodeId: `${variable.name}_assign_${timestamp}`,
            operation: 'assignment',
            expression: `${variable.name} = ${this.getSimplifiedValue(variable.value)}`,
            inputVariables: this.findInputVariablesForAssignment(variable, functionCalls),
            outputVariable: variable.name,
            location: this.getCurrentLocation(),
            pathCondition: this.getCurrentPathConditions().join(' && ') || 'true',
            timestamp
        };
        nodes.push(assignmentNode);

        // Create function call nodes if variable is used in function calls
        for (const funcCall of functionCalls.slice(0, 5)) {
            if (this.isVariableUsedInFunctionCall(variable.name, funcCall)) {
                const funcCallNode: DataFlowNode = {
                    nodeId: `${variable.name}_func_${funcCall.name}_${timestamp}`,
                    operation: 'function_call',
                    expression: `${funcCall.name}(${variable.name}, ...)`,
                    inputVariables: [variable.name],
                    outputVariable: `${funcCall.name}_result`,
                    location: {
                        file: funcCall.file || '',
                        line: funcCall.line || 0,
                        function: funcCall.name || 'unknown'
                    },
                    pathCondition: this.getCurrentPathConditions().join(' && ') || 'true',
                    timestamp
                };
                nodes.push(funcCallNode);
            }
        }

        return nodes;
    }

    private analyzeDataFlowDependencies(variables: any[]): void {
        // Analyze how variables depend on each other
        for (const variable of variables) {
            const dependencies = this.findVariableDependencies(variable, variables);
            
            // Update path dependencies in path-sensitive variables
            const pathSensitiveVar = this.pathSensitiveVariables.get(variable.name);
            if (pathSensitiveVar) {
                pathSensitiveVar.pathDependencies = dependencies;
            }
        }
    }

    private findVariableDependencies(variable: any, allVariables: any[]): string[] {
        const dependencies: string[] = [];
        const varValue = String(variable.value).toLowerCase();
        
        // Simple heuristic: if variable value contains another variable name
        for (const otherVar of allVariables) {
            if (otherVar.name !== variable.name && varValue.includes(otherVar.name.toLowerCase())) {
                dependencies.push(otherVar.name);
            }
        }
        
        // Generic application dependencies (domain-independent)
        if (variable.name.toLowerCase().includes('result') || variable.name.toLowerCase().includes('output')) {
            const inputVars = allVariables.filter(v => 
                ['input', 'param', 'data', 'value', 'config', 'settings'].some(input => 
                    v.name.toLowerCase().includes(input)
                )
            );
            dependencies.push(...inputVars.map(v => v.name));
        }
        
        // Handler/Service dependencies
        if (variable.name.toLowerCase().includes('handler') || variable.name.toLowerCase().includes('service')) {
            const contextVars = allVariables.filter(v => 
                ['ctx', 'context', 'req', 'request', 'resp', 'response'].some(ctx => 
                    v.name.toLowerCase().includes(ctx)
                )
            );
            dependencies.push(...contextVars.map(v => v.name));
        }
        
        return [...new Set(dependencies)]; // Remove duplicates
    }

    private getCurrentPathConditions(): string[] {
        const conditions: string[] = [];
        
        // Traverse current path to collect conditions
        for (const pathId of this.executionTree.currentPath) {
            const node = this.executionTree.allPaths.get(pathId);
            if (node?.condition) {
                conditions.push(node.condition.expression);
            }
        }
        
        return conditions;
    }

    private buildVariableDataFlow(variable: any): DataFlowNode[] {
        const dataFlow: DataFlowNode[] = [];
        
        // Analyze how this variable was assigned/modified
        const assignment: DataFlowNode = {
            nodeId: `${variable.name}_assignment_${Date.now()}`,
            operation: 'assignment',
            expression: `${variable.name} = ${this.getSimplifiedValue(variable.value)}`,
            inputVariables: this.findInputVariables(variable),
            outputVariable: variable.name,
            location: this.getCurrentLocation(),
            pathCondition: this.getCurrentPathConditions().join(' && ') || 'true',
            timestamp: Date.now()
        };
        
        dataFlow.push(assignment);
        return dataFlow;
    }

    private detectConvergencePoints(): void {
        // Find points where multiple paths converge
        for (const [varName, pathVar] of this.pathSensitiveVariables) {
            const convergencePoints = this.findVariableConvergencePoints(pathVar);
            pathVar.convergencePoints = convergencePoints;
        }
    }

    private findVariableConvergencePoints(pathVar: PathSensitiveVariable): ConvergencePoint[] {
        const convergencePoints: ConvergencePoint[] = [];
        
        // Group path states by location to find convergence
        const locationGroups = new Map<string, PathState[]>();
        
        for (const state of pathVar.pathSpecificStates) {
            const locationKey = `${state.lastModifiedAt.file}:${state.lastModifiedAt.line}`;
            if (!locationGroups.has(locationKey)) {
                locationGroups.set(locationKey, []);
            }
            locationGroups.get(locationKey)!.push(state);
        }

        // Find locations with multiple path states (convergence points)
        for (const [locationKey, states] of locationGroups) {
            if (states.length > 1) {
                const conflicts = this.detectPathConflicts(states);
                
                convergencePoints.push({
                    location: states[0].lastModifiedAt,
                    convergingPaths: states.map(s => s.pathId),
                    unifiedValue: this.unifyValues(states),
                    potentialConflicts: conflicts
                });
            }
        }

        return convergencePoints;
    }

    private detectPathConflicts(states: PathState[]): PathConflict[] {
        const conflicts: PathConflict[] = [];
        
        for (let i = 0; i < states.length; i++) {
            for (let j = i + 1; j < states.length; j++) {
                const stateA = states[i];
                const stateB = states[j];
                
                const conflict = this.analyzeValueConflict(stateA, stateB);
                if (conflict) {
                    conflicts.push(conflict);
                }
            }
        }
        
        return conflicts;
    }

    private analyzeValueConflict(stateA: PathState, stateB: PathState): PathConflict | null {
        const valueA = stateA.variableValue;
        const valueB = stateB.variableValue;
        
        // Check for different types of conflicts
        if (valueA === null && valueB !== null) {
            return {
                pathA: stateA.pathId,
                pathB: stateB.pathId,
                conflictType: 'null_vs_value',
                expectedValue: valueB,
                actualValue: valueA,
                severity: 'high',
                resolutionSuggestion: 'Add null check before using the variable'
            };
        }
        
        if (typeof valueA !== typeof valueB) {
            return {
                pathA: stateA.pathId,
                pathB: stateB.pathId,
                conflictType: 'type_mismatch',
                expectedValue: typeof valueB,
                actualValue: typeof valueA,
                severity: 'critical',
                resolutionSuggestion: 'Ensure consistent type handling across all paths'
            };
        }
        
        if (valueA !== valueB && this.isSignificantDifference(valueA, valueB)) {
            return {
                pathA: stateA.pathId,
                pathB: stateB.pathId,
                conflictType: 'value_mismatch',
                expectedValue: valueB,
                actualValue: valueA,
                severity: 'medium',
                resolutionSuggestion: 'Verify logic consistency across execution paths'
            };
        }
        
        return null;
    }

    private generateCriticalPaths(): CriticalPath[] {
        const criticalPaths: CriticalPath[] = [];
        
        // Identify paths with high sensitivity variables
        for (const [pathId, node] of this.executionTree.allPaths) {
            const pathVariables = this.getPathVariables(pathId);
            const highSensitivityVars = pathVariables.filter(v => 
                this.pathSensitiveVariables.get(v)?.sensitivityScore > 0.7
            );
            
            if (highSensitivityVars.length > 0 || node.pathProbability < 0.1) {
                criticalPaths.push({
                    pathId,
                    description: this.generatePathDescription(node),
                    probability: node.pathProbability,
                    riskLevel: this.assessPathRisk(node, highSensitivityVars),
                    keyVariables: highSensitivityVars,
                    potentialIssues: this.identifyPathIssues(node),
                    testSuggestions: this.generatePathTestSuggestions(node)
                });
            }
        }
        
        return criticalPaths.sort((a, b) => this.compareRiskLevel(b.riskLevel) - this.compareRiskLevel(a.riskLevel));
    }

    private calculateSensitivityMetrics(): PathSensitivityReport['sensitivityMetrics'] {
        const highSensitivityVariables = Array.from(this.pathSensitiveVariables.values())
            .filter(v => v.sensitivityScore > 0.7)
            .map(v => v.name);

        const pathDependentOperations = this.countPathDependentOperations();
        const branchingComplexity = this.calculateBranchingComplexity();
        const dataFlowComplexity = this.calculateDataFlowComplexity();

        return {
            highSensitivityVariables,
            pathDependentOperations,
            branchingComplexity,
            dataFlowComplexity
        };
    }

    private generateRecommendations(): PathRecommendation[] {
        const recommendations: PathRecommendation[] = [];
        
        // High sensitivity variable recommendations
        const highSensVars = Array.from(this.pathSensitiveVariables.values())
            .filter(v => v.sensitivityScore > 0.8);
            
        if (highSensVars.length > 0) {
            recommendations.push({
                type: 'testing',
                priority: 'high',
                description: `Test high path-sensitivity variables: ${highSensVars.map(v => v.name).join(', ')}`,
                affectedPaths: highSensVars.flatMap(v => v.pathSpecificStates.map(s => s.pathId)),
                implementationSuggestion: 'Create targeted test cases for each execution path affecting these variables',
                expectedBenefit: 'Improved coverage of path-dependent behavior'
            });
        }

        // Convergence point recommendations
        const convergenceIssues = Array.from(this.pathSensitiveVariables.values())
            .filter(v => v.convergencePoints.some(cp => cp.potentialConflicts.length > 0));
            
        if (convergenceIssues.length > 0) {
            recommendations.push({
                type: 'validation',
                priority: 'critical',
                description: 'Add validation at path convergence points with conflicts',
                affectedPaths: convergenceIssues.flatMap(v => v.convergencePoints.map(cp => cp.convergingPaths).flat()),
                implementationSuggestion: 'Add runtime checks and assertions at convergence points',
                expectedBenefit: 'Prevention of path-dependent runtime errors'
            });
        }

        // Data flow complexity recommendations
        if (this.calculateDataFlowComplexity() > 50) {
            recommendations.push({
                type: 'refactoring',
                priority: 'medium',
                description: 'Consider refactoring to reduce data flow complexity',
                affectedPaths: Array.from(this.executionTree.allPaths.keys()),
                implementationSuggestion: 'Split complex functions and reduce variable interdependencies',
                expectedBenefit: 'Improved maintainability and debugging capability'
            });
        }

        return recommendations;
    }

    // Helper methods
    private calculatePathProbability(location: any, functionCalls: any[]): number {
        // Simple heuristic based on function depth and branching
        const depth = this.executionTree.currentPath.length;
        const baseProbability = 1.0 / Math.pow(2, Math.max(0, depth - 3));
        return Math.max(0.01, baseProbability);
    }

    private inferBranchCondition(fromPath: string, toPath: string): string {
        // Infer the condition that led to this path transition
        return `transition_from_${fromPath.split(':')[0]}_to_${toPath.split(':')[0]}`;
    }

    private calculateStateConfidence(variable: any): number {
        // Calculate confidence based on variable type and source
        if (variable.metadata?.isPointer) return 0.7;
        if (variable.isApplicationRelevant) return 0.9;
        return 0.8;
    }

    private calculateSensitivityScore(pathVar: PathSensitiveVariable): number {
        const numPaths = pathVar.pathSpecificStates.length;
        const hasConflicts = pathVar.convergencePoints.some(cp => cp.potentialConflicts.length > 0);
        
        let score = Math.min(1.0, numPaths / 5.0); // More paths = higher sensitivity
        if (hasConflicts) score += 0.3;
        
        return Math.min(1.0, score);
    }

    private calculateInitialSensitivityScore(variable: any): number {
        if (variable.isControlFlow) return 0.8;
        if (variable.isApplicationRelevant) return 0.6;
        return 0.3;
    }

    private analyzePathDependencies(variable: any): string[] {
        // Domain-independent analysis - variables with similar names might be related
        const dependencies: string[] = [];
        const varName = variable.name.toLowerCase();
        
        // Generic dependencies based on common patterns
        if (varName.includes('result') || varName.includes('output')) {
            dependencies.push('input', 'params', 'config', 'data');
        }
        
        if (varName.includes('handler') || varName.includes('service')) {
            dependencies.push('context', 'request', 'response');
        }
        
        if (varName.includes('error') || varName.includes('err')) {
            dependencies.push('result', 'status', 'validation');
        }
        
        return dependencies;
    }

    private findInputVariables(variable: any): string[] {
        // Find variables that contributed to this variable's value
        return []; // Simplified for now
    }

    private findInputVariablesForAssignment(variable: any, functionCalls: any[]): string[] {
        const inputs: string[] = [];
        
        // Look for variables that might have contributed to this assignment
        const varName = variable.name.toLowerCase();
        
        if (varName.includes('result') || varName.includes('output') || varName.includes('response')) {
            // Result variables likely depend on input parameters
            for (const funcCall of functionCalls.slice(0, 3)) {
                const params = Object.keys(funcCall.parameters || {});
                inputs.push(...params.slice(0, 3));
            }
        }
        
        return [...new Set(inputs)]; // Remove duplicates
    }

    private isVariableUsedInFunctionCall(variableName: string, functionCall: any): boolean {
        const params = Object.keys(functionCall.parameters || {});
        return params.includes(variableName);
    }

    private getCurrentLocation(): { file: string; line: number; function: string } {
        const currentNode = this.executionTree.allPaths.get(this.currentPathId);
        return currentNode?.location || { file: '', line: 0, function: 'unknown' };
    }

    private getSimplifiedValue(value: any): string {
        const str = String(value);
        return str.length > 50 ? str.substring(0, 50) + '...' : str;
    }

    private unifyValues(states: PathState[]): any {
        // Attempt to unify values from different paths
        const values = states.map(s => s.variableValue);
        return values[0]; // Simplified - return first value
    }

    private isSignificantDifference(valueA: any, valueB: any): boolean {
        if (typeof valueA === 'number' && typeof valueB === 'number') {
            return Math.abs(valueA - valueB) > 0.001;
        }
        return String(valueA) !== String(valueB);
    }

    private getPathVariables(pathId: string): string[] {
        return Array.from(this.pathSensitiveVariables.keys());
    }

    private generatePathDescription(node: PathNode): string {
        return `Path through ${node.location.function} at line ${node.location.line}`;
    }

    private assessPathRisk(node: PathNode, highSensVars: string[]): CriticalPath['riskLevel'] {
        if (highSensVars.length > 2) return 'critical';
        if (node.pathProbability < 0.05) return 'high';
        if (highSensVars.length > 0) return 'medium';
        return 'low';
    }

    private identifyPathIssues(node: PathNode): string[] {
        const issues: string[] = [];
        if (node.pathProbability < 0.01) issues.push('Extremely rare execution path');
        if (node.children.length > 5) issues.push('High branching complexity');
        return issues;
    }

    private generatePathTestSuggestions(node: PathNode): string[] {
        return [
            `Test path conditions leading to ${node.location.function}`,
            `Verify variable states at line ${node.location.line}`,
            'Add unit tests for this specific execution path'
        ];
    }

    private compareRiskLevel(risk: string): number {
        const levels = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
        return levels[risk] || 0;
    }

    private estimateTotalPaths(): number {
        // Estimate total possible paths based on branching factor
        return Math.pow(2, this.executionTree.maxDepth);
    }

    private calculateAverageBranchingFactor(): number {
        const nodes = Array.from(this.executionTree.allPaths.values());
        const totalChildren = nodes.reduce((sum, node) => sum + node.children.length, 0);
        return totalChildren / Math.max(1, nodes.length);
    }

    private calculatePathCoverage(): number {
        const explored = this.executionTree.allPaths.size;
        const estimated = this.estimateTotalPaths();
        return Math.min(1.0, explored / estimated);
    }

    private countPathDependentOperations(): number {
        return Array.from(this.pathSensitiveVariables.values())
            .reduce((sum, v) => sum + v.pathSpecificStates.length, 0);
    }

    private calculateBranchingComplexity(): number {
        return this.calculateAverageBranchingFactor() * this.executionTree.maxDepth;
    }

    private calculateDataFlowComplexity(): number {
        return this.getTotalDataFlowNodes();
    }

    private getTotalDataFlowNodes(): number {
        let total = 0;
        for (const nodes of this.dataFlowGraph.values()) {
            total += nodes.length;
        }
        return total;
    }

    dispose(): void {
        this.pathSensitiveVariables.clear();
        this.executionTree.allPaths.clear();
        this.executionTree.pathHistory = [];
        this.dataFlowGraph.clear();
    }
}