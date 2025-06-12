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
    operation: 'assignment' | 'conditional' | 'loop' | 'function_call' | 'return' | 'error_handling';
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
    branchType?: 'success' | 'error' | 'middleware' | 'routing' | 'validation';
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
    actualNodes: PathNode[];
    possibleNodes: PathNode[];
    branchPoints: BranchPoint[];
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
    nodeType: 'executed' | 'possible' | 'branch_point' | 'convergence';
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
    depth: number;
    branchType?: 'middleware' | 'routing' | 'error_handling' | 'business_logic' | 'validation';
}

export interface BranchPoint {
    id: string;
    location: {
        file: string;
        line: number;
        function: string;
    };
    branchType: 'middleware' | 'routing' | 'error_handling' | 'business_logic' | 'validation';
    condition: string;
    alternatives: AlternativePath[];
    probability: number;
    variables: string[];
}

export interface AlternativePath {
    id: string;
    description: string;
    pathType: 'error_scenario' | 'alternative_route' | 'middleware_bypass' | 'business_logic_branch' | 'validation_failure';
    probability: number;
    requiredConditions: string[];
    affectedVariables: string[];
    expectedOutcome: string;
    testSuggestion: string;
    depth: number;
}

export interface PathTransition {
    fromPath: string;
    toPath: string;
    branchCondition: string;
    transitionType: 'conditional_branch' | 'loop_iteration' | 'function_call' | 'function_return' | 'error_path' | 'middleware_chain';
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
        actualExecutedNodes: number;
        possibleAlternativeNodes: number;
        branchPointsDetected: number;
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
            maxDepth: 0,
            actualNodes: [],
            possibleNodes: [],
            branchPoints: []
        };
        
        this.executionTree.allPaths.set('root', this.executionTree.rootNode);
        this.executionTree.actualNodes.push(this.executionTree.rootNode);
    }

    private getCurrentUser(): string {
        return os.userInfo().username || 'unknown-user';
    }

    private getCurrentTimestamp(): string {
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    private createRootNode(): PathNode {
        return {
            id: 'root',
            children: [],
            location: { file: '', line: 0, function: 'program_start' },
            nodeType: 'executed',
            variableStates: new Map(),
            pathProbability: 1.0,
            executionCount: 1,
            timestamp: Date.now(),
            depth: 0
        };
    }

    analyzePathSensitivity(
        variables: any[],
        functionCalls: any[],
        currentLocation: any,
        symbolicExecution?: any
    ): PathSensitivityReport {
        console.log(`🛤️ Starting enhanced path-sensitivity analysis for ${this.getCurrentUser()} at ${this.getCurrentTimestamp()}...`);
        
        const startTime = Date.now();

        // Build execution tree from function calls
        this.buildExecutionTreeFromFunctionCalls(functionCalls, currentLocation);

        // Detect branch points and generate alternatives
        this.detectBranchPoints(functionCalls);

        // Generate realistic alternative paths
        this.generateRealisticAlternativePaths(functionCalls);

        // Analyze each variable for path sensitivity
        this.analyzeVariablePathSensitivity(variables);

        // Build data flow graph
        this.buildDataFlowGraph(variables, functionCalls);

        // Detect path convergence points
        this.detectConvergencePoints();

        // Generate critical paths
        const criticalPaths = this.generateCriticalPaths();

        // Calculate sensitivity metrics
        const sensitivityMetrics = this.calculateSensitivityMetrics();

        // Generate recommendations
        const recommendations = this.generateRecommendations();

        const analysisTime = Date.now() - startTime;

        console.log(`✅ Enhanced path-sensitivity analysis complete for ${this.getCurrentUser()}: ${analysisTime}ms, ${this.executionTree.actualNodes.length} actual nodes, ${this.executionTree.possibleNodes.length} possible nodes, ${this.executionTree.branchPoints.length} branch points`);

        return {
            sessionId: this.sessionId,
            user: this.getCurrentUser(),
            timestamp: this.getCurrentTimestamp(),
            currentPath: this.executionTree.currentPath,
            pathSensitiveVariables: Array.from(this.pathSensitiveVariables.values()),
            executionTree: this.executionTree,
            pathAnalysis: {
                totalPaths: this.executionTree.actualNodes.length + this.executionTree.possibleNodes.length,
                exploredPaths: this.executionTree.actualNodes.length,
                averageBranchingFactor: this.calculateAverageBranchingFactor(),
                maxPathLength: this.executionTree.maxDepth,
                criticalPaths,
                pathCoverage: this.calculatePathCoverage(),
                actualExecutedNodes: this.executionTree.actualNodes.length,
                possibleAlternativeNodes: this.executionTree.possibleNodes.length,
                branchPointsDetected: this.executionTree.branchPoints.length
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

    private buildExecutionTreeFromFunctionCalls(functionCalls: any[], currentLocation: any): void {
        console.log(`🏗️ Building execution tree from ${functionCalls.length} function calls...`);

        // Clear previous state
        this.executionTree.actualNodes = [];
        this.executionTree.currentPath = [];

        // Build actual execution path from function calls
        functionCalls.forEach((funcCall, index) => {
            const nodeId = `frame-${funcCall.id || index}`;
            const depth = index;

            const pathNode: PathNode = {
                id: nodeId,
                parentId: index > 0 ? `frame-${functionCalls[index - 1].id || (index - 1)}` : undefined,
                children: [],
                location: {
                    file: funcCall.file || '',
                    line: funcCall.line || 0,
                    function: funcCall.name || 'unknown'
                },
                nodeType: 'executed',
                variableStates: new Map(),
                pathProbability: 1.0,
                executionCount: 1,
                timestamp: funcCall.startTime || Date.now(),
                depth: depth,
                branchType: this.determineBranchType(funcCall.name)
            };

            // Add to parent's children
            if (pathNode.parentId) {
                const parent = this.executionTree.allPaths.get(pathNode.parentId);
                if (parent) {
                    parent.children.push(nodeId);
                }
            }

            this.executionTree.allPaths.set(nodeId, pathNode);
            this.executionTree.actualNodes.push(pathNode);
            this.executionTree.currentPath.push(nodeId);

            // Update max depth
            this.executionTree.maxDepth = Math.max(this.executionTree.maxDepth, depth);
        });

        console.log(`✅ Built execution tree with ${this.executionTree.actualNodes.length} actual nodes, max depth: ${this.executionTree.maxDepth}`);
    }

    private determineBranchType(functionName: string): PathNode['branchType'] {
        const name = functionName.toLowerCase();
        
        if (name.includes('middleware') || name.includes('logger') || name.includes('recovery') || name.includes('cors')) {
            return 'middleware';
        }
        if (name.includes('serve') || name.includes('route') || name.includes('handle') || name.includes('dispatch')) {
            return 'routing';
        }
        if (name.includes('validate') || name.includes('check') || name.includes('verify')) {
            return 'validation';
        }
        if (name.includes('handler') || name.includes('controller') || name.includes('service')) {
            return 'business_logic';
        }
        if (name.includes('error') || name.includes('panic') || name.includes('recover')) {
            return 'error_handling';
        }
        
        return 'business_logic';
    }

    private detectBranchPoints(functionCalls: any[]): void {
        console.log(`🔍 Detecting branch points in execution...`);

        this.executionTree.branchPoints = [];

        functionCalls.forEach((funcCall, index) => {
            const branchPoints = this.identifyBranchPointsInFunction(funcCall, index);
            this.executionTree.branchPoints.push(...branchPoints);
        });

        console.log(`✅ Detected ${this.executionTree.branchPoints.length} branch points`);
    }

    private identifyBranchPointsInFunction(funcCall: any, index: number): BranchPoint[] {
        const branchPoints: BranchPoint[] = [];
        const functionName = funcCall.name || '';
        const location = {
            file: funcCall.file || '',
            line: funcCall.line || 0,
            function: functionName
        };

        // Middleware branch points
        if (this.isMiddlewareFunction(functionName)) {
            branchPoints.push({
                id: `branch-middleware-${index}`,
                location,
                branchType: 'middleware',
                condition: `${functionName} execution path`,
                alternatives: this.generateMiddlewareAlternatives(functionName, index),
                probability: 0.95, // High probability of success
                variables: this.extractVariablesFromParameters(funcCall.parameters)
            });
        }

        // Routing branch points
        if (this.isRoutingFunction(functionName)) {
            branchPoints.push({
                id: `branch-routing-${index}`,
                location,
                branchType: 'routing',
                condition: `Route matching for ${functionName}`,
                alternatives: this.generateRoutingAlternatives(functionName, index),
                probability: 0.90, // High probability for matched route
                variables: ['request', 'path', 'method']
            });
        }

        // Business logic branch points
        if (this.isBusinessLogicFunction(functionName)) {
            branchPoints.push({
                id: `branch-business-${index}`,
                location,
                branchType: 'business_logic',
                condition: `Business logic execution in ${functionName}`,
                alternatives: this.generateBusinessLogicAlternatives(functionName, index),
                probability: 0.80, // Moderate probability
                variables: this.extractBusinessVariables(funcCall.parameters)
            });
        }

        // Validation branch points
        if (this.isValidationFunction(functionName)) {
            branchPoints.push({
                id: `branch-validation-${index}`,
                location,
                branchType: 'validation',
                condition: `Validation logic in ${functionName}`,
                alternatives: this.generateValidationAlternatives(functionName, index),
                probability: 0.85, // High probability of validation success
                variables: this.extractValidationVariables(funcCall.parameters)
            });
        }

        return branchPoints;
    }

    private generateRealisticAlternativePaths(functionCalls: any[]): void {
        console.log(`🎯 Generating realistic alternative paths...`);

        this.executionTree.possibleNodes = [];

        // Generate alternatives for each branch point
        this.executionTree.branchPoints.forEach(branchPoint => {
            branchPoint.alternatives.forEach(alternative => {
                const alternativeNode: PathNode = {
                    id: alternative.id,
                    parentId: this.findParentForAlternative(branchPoint, functionCalls),
                    children: [],
                    location: branchPoint.location,
                    nodeType: 'possible',
                    condition: {
                        expression: alternative.requiredConditions.join(' && '),
                        result: false, // Alternative path not taken
                        variables: alternative.affectedVariables,
                        probability: alternative.probability
                    },
                    variableStates: new Map(),
                    pathProbability: alternative.probability,
                    executionCount: 0,
                    timestamp: Date.now(),
                    depth: alternative.depth,
                    branchType: branchPoint.branchType
                };

                this.executionTree.allPaths.set(alternative.id, alternativeNode);
                this.executionTree.possibleNodes.push(alternativeNode);
            });
        });

        console.log(`✅ Generated ${this.executionTree.possibleNodes.length} realistic alternative paths`);
    }

    private generateMiddlewareAlternatives(functionName: string, index: number): AlternativePath[] {
        const alternatives: AlternativePath[] = [];
        const baseDepth = index + this.executionTree.actualNodes.length;

        if (functionName.includes('Logger')) {
            alternatives.push({
                id: `middleware-logger-skip-${index}`,
                description: 'Logger middleware bypassed',
                pathType: 'middleware_bypass',
                probability: 0.05,
                requiredConditions: ['logger.enabled = false'],
                affectedVariables: ['logEntry', 'responseTime'],
                expectedOutcome: 'Request processed without logging',
                testSuggestion: 'Test with logging disabled',
                depth: baseDepth + 1
            });
        }

        if (functionName.includes('Recovery')) {
            alternatives.push({
                id: `middleware-panic-${index}`,
                description: 'Panic recovery triggered',
                pathType: 'error_scenario',
                probability: 0.01,
                requiredConditions: ['panic occurs in handler'],
                affectedVariables: ['error', 'stackTrace', 'response'],
                expectedOutcome: 'Internal server error response',
                testSuggestion: 'Test with panic in handler',
                depth: baseDepth + 1
            });
        }

        return alternatives;
    }

    private generateRoutingAlternatives(functionName: string, index: number): AlternativePath[] {
        const alternatives: AlternativePath[] = [];
        const baseDepth = index + this.executionTree.actualNodes.length;

        alternatives.push({
            id: `routing-404-${index}`,
            description: 'Route not found (404)',
            pathType: 'alternative_route',
            probability: 0.10,
            requiredConditions: ['request.path not in routes'],
            affectedVariables: ['statusCode', 'response'],
            expectedOutcome: '404 Not Found response',
            testSuggestion: 'Test with invalid route path',
            depth: baseDepth + 1
        });

        alternatives.push({
            id: `routing-method-not-allowed-${index}`,
            description: 'Method not allowed (405)',
            pathType: 'alternative_route',
            probability: 0.05,
            requiredConditions: ['request.method not supported'],
            affectedVariables: ['statusCode', 'allowedMethods'],
            expectedOutcome: '405 Method Not Allowed response',
            testSuggestion: 'Test with unsupported HTTP method',
            depth: baseDepth + 1
        });

        return alternatives;
    }

    private generateBusinessLogicAlternatives(functionName: string, index: number): AlternativePath[] {
        const alternatives: AlternativePath[] = [];
        const baseDepth = index + this.executionTree.actualNodes.length;

        alternatives.push({
            id: `business-validation-error-${index}`,
            description: 'Business validation failure',
            pathType: 'validation_failure',
            probability: 0.15,
            requiredConditions: ['input validation fails'],
            affectedVariables: ['validationErrors', 'statusCode'],
            expectedOutcome: '400 Bad Request with validation errors',
            testSuggestion: 'Test with invalid input data',
            depth: baseDepth + 1
        });

        alternatives.push({
            id: `business-database-error-${index}`,
            description: 'Database operation failure',
            pathType: 'error_scenario',
            probability: 0.05,
            requiredConditions: ['database connection fails'],
            affectedVariables: ['dbError', 'statusCode'],
            expectedOutcome: '500 Internal Server Error',
            testSuggestion: 'Test with database unavailable',
            depth: baseDepth + 1
        });

        alternatives.push({
            id: `business-auth-error-${index}`,
            description: 'Authentication/Authorization failure',
            pathType: 'error_scenario',
            probability: 0.10,
            requiredConditions: ['invalid credentials or insufficient permissions'],
            affectedVariables: ['authError', 'statusCode'],
            expectedOutcome: '401 Unauthorized or 403 Forbidden',
            testSuggestion: 'Test with invalid credentials',
            depth: baseDepth + 1
        });

        return alternatives;
    }

    private generateValidationAlternatives(functionName: string, index: number): AlternativePath[] {
        const alternatives: AlternativePath[] = [];
        const baseDepth = index + this.executionTree.actualNodes.length;

        alternatives.push({
            id: `validation-required-field-${index}`,
            description: 'Required field missing',
            pathType: 'validation_failure',
            probability: 0.20,
            requiredConditions: ['required field is empty or null'],
            affectedVariables: ['fieldErrors', 'statusCode'],
            expectedOutcome: '400 Bad Request with field errors',
            testSuggestion: 'Test with missing required fields',
            depth: baseDepth + 1
        });

        alternatives.push({
            id: `validation-format-error-${index}`,
            description: 'Field format validation failure',
            pathType: 'validation_failure',
            probability: 0.15,
            requiredConditions: ['field format is invalid'],
            affectedVariables: ['formatErrors', 'statusCode'],
            expectedOutcome: '400 Bad Request with format errors',
            testSuggestion: 'Test with incorrectly formatted data',
            depth: baseDepth + 1
        });

        return alternatives;
    }

    // Helper methods for function type detection
    private isMiddlewareFunction(functionName: string): boolean {
        const name = functionName.toLowerCase();
        return name.includes('middleware') || name.includes('logger') || name.includes('recovery') || 
               name.includes('cors') || name.includes('auth') || name.includes('next');
    }

    private isRoutingFunction(functionName: string): boolean {
        const name = functionName.toLowerCase();
        return name.includes('serve') || name.includes('route') || name.includes('handle') || 
               name.includes('dispatch') || name.includes('engine') || name.includes('router');
    }

    private isBusinessLogicFunction(functionName: string): boolean {
        const name = functionName.toLowerCase();
        return name.includes('handler') || name.includes('controller') || name.includes('service') ||
               name.includes('get') || name.includes('post') || name.includes('put') || name.includes('delete') ||
               name.includes('create') || name.includes('update') || name.includes('process');
    }

    private isValidationFunction(functionName: string): boolean {
        const name = functionName.toLowerCase();
        return name.includes('validate') || name.includes('check') || name.includes('verify') ||
               name.includes('sanitize') || name.includes('bind') || name.includes('parse');
    }

    private findParentForAlternative(branchPoint: BranchPoint, functionCalls: any[]): string {
        // Find the function call that corresponds to this branch point
        const matchingCall = functionCalls.find(call => call.name === branchPoint.location.function);
        if (matchingCall) {
            return `frame-${matchingCall.id}`;
        }
        return 'root';
    }

    private extractVariablesFromParameters(parameters: any): string[] {
        if (!parameters) return [];
        return Object.keys(parameters).slice(0, 5); // Limit to 5 variables
    }

    private extractBusinessVariables(parameters: any): string[] {
        if (!parameters) return [];
        const businessVars = Object.keys(parameters).filter(key => {
            const keyLower = key.toLowerCase();
            return keyLower.includes('id') || keyLower.includes('data') || keyLower.includes('request') ||
                   keyLower.includes('user') || keyLower.includes('config') || keyLower.includes('params');
        });
        return businessVars.slice(0, 5);
    }

    private extractValidationVariables(parameters: any): string[] {
        if (!parameters) return [];
        const validationVars = Object.keys(parameters).filter(key => {
            const keyLower = key.toLowerCase();
            return keyLower.includes('input') || keyLower.includes('form') || keyLower.includes('body') ||
                   keyLower.includes('query') || keyLower.includes('param');
        });
        return validationVars.slice(0, 5);
    }

    // Keep existing methods but fix their implementation
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
            existing.pathSpecificStates.push(currentPathState);
            existing.sensitivityScore = this.calculateSensitivityScore(existing);
            return existing;
        } else {
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
        // Enhanced data flow graph building
        for (const variable of variables) {
            const dataFlowNodes = this.createDataFlowNodes(variable, functionCalls);
            this.dataFlowGraph.set(variable.name, dataFlowNodes);
        }
        this.analyzeDataFlowDependencies(variables);
    }

    private createDataFlowNodes(variable: any, functionCalls: any[]): DataFlowNode[] {
        const nodes: DataFlowNode[] = [];
        const timestamp = Date.now();
        
        const assignmentNode: DataFlowNode = {
            nodeId: `${variable.name}_assign_${timestamp}`,
            operation: 'assignment',
            expression: `${variable.name} = ${this.getSimplifiedValue(variable.value)}`,
            inputVariables: this.findInputVariablesForAssignment(variable, functionCalls),
            outputVariable: variable.name,
            location: this.getCurrentLocation(),
            pathCondition: this.getCurrentPathConditions().join(' && ') || 'true',
            timestamp,
            branchType: 'success'
        };
        nodes.push(assignmentNode);

        return nodes;
    }

    private detectConvergencePoints(): void {
        for (const [varName, pathVar] of this.pathSensitiveVariables) {
            const convergencePoints = this.findVariableConvergencePoints(pathVar);
            pathVar.convergencePoints = convergencePoints;
        }
    }

    private findVariableConvergencePoints(pathVar: PathSensitiveVariable): ConvergencePoint[] {
        const convergencePoints: ConvergencePoint[] = [];
        
        const locationGroups = new Map<string, PathState[]>();
        
        for (const state of pathVar.pathSpecificStates) {
            const locationKey = `${state.lastModifiedAt.file}:${state.lastModifiedAt.line}`;
            if (!locationGroups.has(locationKey)) {
                locationGroups.set(locationKey, []);
            }
            locationGroups.get(locationKey)!.push(state);
        }

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
    
    for (const [pathId, node] of this.executionTree.allPaths) {
        const pathVariables = this.getPathVariables(pathId);
        const highSensitivityVars = pathVariables.filter(v => 
            this.pathSensitiveVariables.get(v)?.sensitivityScore > 0.7
        );
        
        if (highSensitivityVars.length > 0 || node.pathProbability < 0.1) {
            // FIX: Add actual file path for critical paths
            const criticalPath: CriticalPath = {
                pathId,
                description: this.generatePathDescriptionWithFile(node), // CHANGED: Use new method
                probability: node.pathProbability,
                riskLevel: this.assessPathRisk(node, highSensitivityVars),
                keyVariables: highSensitivityVars,
                potentialIssues: this.identifyPathIssues(node),
                testSuggestions: this.generatePathTestSuggestions(node)
            };
            
            criticalPaths.push(criticalPath);
        }
    }
    
    return criticalPaths.sort((a, b) => this.compareRiskLevel(b.riskLevel) - this.compareRiskLevel(a.riskLevel));
}
private generatePathDescriptionWithFile(node: PathNode): string {
    const functionName = node.location.function;
    const line = node.location.line;
    
    let filePath = node.location.file;
    
    return `${node.nodeType} path through ${functionName} at line ${line} (${filePath})`;
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

        if (this.executionTree.branchPoints.length > 10) {
            recommendations.push({
                type: 'refactoring',
                priority: 'medium',
                description: 'Consider refactoring to reduce execution path complexity',
                affectedPaths: Array.from(this.executionTree.allPaths.keys()),
                implementationSuggestion: 'Split complex functions and reduce branching complexity',
                expectedBenefit: 'Improved maintainability and testing efficiency'
            });
        }

        return recommendations;
    }

    // Helper methods
    private getCurrentPathConditions(): string[] {
        const conditions: string[] = [];
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
        
        const assignment: DataFlowNode = {
            nodeId: `${variable.name}_assignment_${Date.now()}`,
            operation: 'assignment',
            expression: `${variable.name} = ${this.getSimplifiedValue(variable.value)}`,
            inputVariables: this.findInputVariables(variable),
            outputVariable: variable.name,
            location: this.getCurrentLocation(),
            pathCondition: this.getCurrentPathConditions().join(' && ') || 'true',
            timestamp: Date.now(),
            branchType: 'success'
        };
        
        dataFlow.push(assignment);
        return dataFlow;
    }

    private calculateStateConfidence(variable: any): number {
        if (variable.metadata?.isPointer) return 0.7;
        if (variable.isApplicationRelevant) return 0.9;
        return 0.8;
    }

    private calculateSensitivityScore(pathVar: PathSensitiveVariable): number {
        const numPaths = pathVar.pathSpecificStates.length;
        const hasConflicts = pathVar.convergencePoints.some(cp => cp.potentialConflicts.length > 0);
        
        let score = Math.min(1.0, numPaths / 5.0);
        if (hasConflicts) score += 0.3;
        
        return Math.min(1.0, score);
    }

    private calculateInitialSensitivityScore(variable: any): number {
        if (variable.isControlFlow) return 0.8;
        if (variable.isApplicationRelevant) return 0.6;
        return 0.3;
    }

    private analyzePathDependencies(variable: any): string[] {
        const dependencies: string[] = [];
        const varName = variable.name.toLowerCase();
        
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
        return [];
    }

    private findInputVariablesForAssignment(variable: any, functionCalls: any[]): string[] {
        const inputs: string[] = [];
        const varName = variable.name.toLowerCase();
        
        if (varName.includes('result') || varName.includes('output') || varName.includes('response')) {
            for (const funcCall of functionCalls.slice(0, 3)) {
                const params = Object.keys(funcCall.parameters || {});
                inputs.push(...params.slice(0, 3));
            }
        }
        
        return [...new Set(inputs)];
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
        const values = states.map(s => s.variableValue);
        return values[0];
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
        return `${node.nodeType} path through ${node.location.function} at line ${node.location.line}`;
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
        if (node.nodeType === 'possible') issues.push('Alternative path not executed');
        return issues;
    }

    private generatePathTestSuggestions(node: PathNode): string[] {
        const suggestions = [
            `Test path conditions leading to ${node.location.function}`,
            `Verify variable states at line ${node.location.line}`
        ];
        
        if (node.nodeType === 'possible') {
            suggestions.push(`Create test case to trigger this alternative path`);
        }
        
        return suggestions;
    }

    private compareRiskLevel(risk: string): number {
        const levels = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
        return levels[risk] || 0;
    }

    private calculateAverageBranchingFactor(): number {
        const nodes = Array.from(this.executionTree.allPaths.values());
        const totalChildren = nodes.reduce((sum, node) => sum + node.children.length, 0);
        return totalChildren / Math.max(1, nodes.length);
    }

    private calculatePathCoverage(): number {
        const total = this.executionTree.actualNodes.length + this.executionTree.possibleNodes.length;
        const executed = this.executionTree.actualNodes.length;
        return total > 0 ? executed / total : 0;
    }

    private countPathDependentOperations(): number {
        return Array.from(this.pathSensitiveVariables.values())
            .reduce((sum, v) => sum + v.pathSpecificStates.length, 0);
    }

    private calculateBranchingComplexity(): number {
        return this.executionTree.branchPoints.length * this.calculateAverageBranchingFactor();
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

    private analyzeDataFlowDependencies(variables: any[]): void {
        for (const variable of variables) {
            const dependencies = this.findVariableDependencies(variable, variables);
            const pathSensitiveVar = this.pathSensitiveVariables.get(variable.name);
            if (pathSensitiveVar) {
                pathSensitiveVar.pathDependencies = dependencies;
            }
        }
    }

    private findVariableDependencies(variable: any, allVariables: any[]): string[] {
        const dependencies: string[] = [];
        const varValue = String(variable.value).toLowerCase();
        
        for (const otherVar of allVariables) {
            if (otherVar.name !== variable.name && varValue.includes(otherVar.name.toLowerCase())) {
                dependencies.push(otherVar.name);
            }
        }
        
        if (variable.name.toLowerCase().includes('result') || variable.name.toLowerCase().includes('output')) {
            const inputVars = allVariables.filter(v => 
                ['input', 'param', 'data', 'value', 'config', 'settings'].some(input => 
                    v.name.toLowerCase().includes(input)
                )
            );
            dependencies.push(...inputVars.map(v => v.name));
        }
        
        if (variable.name.toLowerCase().includes('handler') || variable.name.toLowerCase().includes('service')) {
            const contextVars = allVariables.filter(v => 
                ['ctx', 'context', 'req', 'request', 'resp', 'response'].some(ctx => 
                    v.name.toLowerCase().includes(ctx)
                )
            );
            dependencies.push(...contextVars.map(v => v.name));
        }
        
        return [...new Set(dependencies)];
    }

    dispose(): void {
        this.pathSensitiveVariables.clear();
        this.executionTree.allPaths.clear();
        this.executionTree.pathHistory = [];
        this.dataFlowGraph.clear();
    }
}