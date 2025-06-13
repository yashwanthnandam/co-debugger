import * as vscode from 'vscode';
import { ExecutionPathGraphService, ExecutionPathGraph, PathNode } from '../services/executionPathGraphService';

export class ExecutionPathGraphView {
    private panel: vscode.WebviewPanel | undefined;
    private graphService: ExecutionPathGraphService;
    private context: vscode.ExtensionContext;

    constructor(graphService: ExecutionPathGraphService, context: vscode.ExtensionContext) {
        this.graphService = graphService;
        this.context = context;
        
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        this.graphService.on('graphUpdated', (graph: ExecutionPathGraph) => {
            this.updateWebview(graph);
        });
    }

    show(): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'executionPathGraph',
            '🔄 Execution Path Graph',
            vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.context.extensionUri]
            }
        );

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });

        this.panel.webview.onDidReceiveMessage(
            message => this.handleWebviewMessage(message),
            undefined,
            this.context.subscriptions
        );

        // Initial load
        const currentGraph = this.graphService.getCurrentGraph();
        this.updateWebview(currentGraph);
    }

    private updateWebview(graph: ExecutionPathGraph): void {
        if (!this.panel) return;

        this.panel.webview.html = this.getWebviewContent(graph);
    }

    private handleWebviewMessage(message: any): void {
        switch (message.command) {
            case 'nodeClicked':
                this.handleNodeClick(message.nodeId, message.nodeData);
                break;
            case 'exportGraph':
                this.exportGraph();
                break;
            case 'refreshGraph':
                this.refreshGraph();
                break;
        }
    }

    private handleNodeClick(nodeId: string, nodeData?: any): void {
        console.log(`🔍 Node clicked: ${nodeId} at 2025-06-12 02:20:35`);
        
        const graph = this.graphService.getCurrentGraph();
        const allNodes = [...graph.actualPath, ...graph.possiblePaths];
        const node = allNodes.find(n => n.id === nodeId);
        
        if (!node) {
            console.log(`⚠️ Node not found: ${nodeId}`);
            vscode.window.showWarningMessage(`Node ${nodeId} not found in graph data`);
            return;
        }

        console.log(`📍 Node details:`, {
            id: node.id,
            functionName: node.functionName,
            file: node.file,
            line: node.line,
            status: node.status
        });

        // Try multiple strategies to navigate to the code
        this.navigateToCode(node);
    }

    private async navigateToCode(node: PathNode): Promise<void> {
            if (node.functionName.endsWith('-fm')) {
        const realMethodName = node.functionName.replace('-fm', '');
        console.log(`🔧 Detected Go wrapper function, navigating to real method: ${realMethodName}`);
        
        try {
            await this.searchForRealMethod(realMethodName, node.line);
            return;
        } catch (error) {
            console.log(`⚠️ Could not find real method, falling back to original navigation`);
        }
    }
        // Strategy 1: Direct file path (for actual execution path)
        if (node.file && node.file.length > 0 && !node.file.includes('unknown')) {
            try {
                console.log(`🎯 Opening file: ${node.file}:${node.line}`);
                
                const uri = vscode.Uri.file(node.file);
                const doc = await vscode.workspace.openTextDocument(uri);
                
                const line = Math.max(0, (node.line || 1) - 1); // VS Code is 0-indexed
                const selection = new vscode.Range(line, 0, line, 0);
                
                await vscode.window.showTextDocument(doc, {
                    selection: selection,
                    viewColumn: vscode.ViewColumn.One
                });
                
                vscode.window.showInformationMessage(
                    `📍 Navigated to ${node.functionName} at line ${node.line}`
                );
                return;
            } catch (error) {
                console.log(`⚠️ Could not open file directly: ${error.message}`);
            }
        }

        // Strategy 2: Search for function name in workspace
        if (node.functionName && node.functionName !== 'unknown_function') {
            try {
                console.log(`🔍 Searching for function: ${node.functionName}`);
                await this.searchForFunction(node.functionName, node.line);
                return;
            } catch (error) {
                console.log(`⚠️ Could not find function in workspace: ${error.message}`);
            }
        }

        // Strategy 3: Use current debug session location
        if (node.status === 'current' || node.status === 'executed') {
            try {
                console.log(`🎯 Using debug session context for: ${node.functionName}`);
                await this.navigateViaDebugSession(node);
                return;
            } catch (error) {
                console.log(`⚠️ Could not navigate via debug session: ${error.message}`);
            }
        }

        // Strategy 4: Show information about the node
        this.showNodeInformation(node);
    }

private async searchForRealMethod(methodName: string, line?: number): Promise<void> {
    // Extract the actual method name from patterns like "http.(*ReportHandler).GetPlanetaryReport"
    const methodMatch = methodName.match(/\(\*?([A-Za-z]+)\)\.([A-Za-z]+)/);
    
    if (methodMatch) {
        const structName = methodMatch[1]; // ReportHandler
        const methodNameOnly = methodMatch[2]; // GetPlanetaryReport
        
        console.log(`🔍 Searching for method ${methodNameOnly} in struct ${structName}`);
        
        // Search for the actual method definition
        const results = await vscode.workspace.findFiles(
            '**/*.go',
            '**/node_modules/**',
            50
        );

        for (const fileUri of results) {
            try {
                const document = await vscode.workspace.openTextDocument(fileUri);
                const text = document.getText();
                
                // Look for method definition pattern: func (r *ReportHandler) GetPlanetaryReport
                const methodPattern = new RegExp(
                    `func\\s+\\([^)]*\\*?${structName}[^)]*\\)\\s+${methodNameOnly}`,
                    'i'
                );
                
                const match = text.match(methodPattern);
                if (match) {
                    const matchIndex = text.indexOf(match[0]);
                    const lineNumber = text.substring(0, matchIndex).split('\n').length - 1;
                    
                    console.log(`✅ Found real method in: ${fileUri.fsPath}:${lineNumber + 1}`);
                    
                    const selection = new vscode.Range(lineNumber, 0, lineNumber, 0);
                    await vscode.window.showTextDocument(document, {
                        selection: selection,
                        viewColumn: vscode.ViewColumn.One
                    });
                    
                    vscode.window.showInformationMessage(
                        `📍 Navigated to real method: ${methodNameOnly} in ${structName}`
                    );
                    return;
                }
            } catch (fileError) {
                continue;
            }
        }
    }
    
    throw new Error(`Real method ${methodName} not found`);
}
    private async searchForFunction(functionName: string, line?: number): Promise<void> {
        // Clean up function name for search
        const searchTerms = this.generateSearchTerms(functionName);
        
        for (const searchTerm of searchTerms) {
            console.log(`🔍 Searching workspace for: "${searchTerm}"`);
            
            try {
                // Use VS Code's search API
                const results = await vscode.workspace.findFiles(
                    '**/*.go', // Only search Go files
                    '**/node_modules/**', // Exclude node_modules
                    100 // Limit results
                );

                for (const fileUri of results) {
                    try {
                        const document = await vscode.workspace.openTextDocument(fileUri);
                        const text = document.getText();
                        
                        // Search for function definition
                        const functionPattern = new RegExp(`func\\s+.*${this.escapeRegex(searchTerm)}`, 'i');
                        const match = text.match(functionPattern);
                        
                        if (match) {
                            const matchIndex = text.indexOf(match[0]);
                            const lineNumber = text.substring(0, matchIndex).split('\n').length - 1;
                            
                            console.log(`✅ Found function in: ${fileUri.fsPath}:${lineNumber + 1}`);
                            
                            const selection = new vscode.Range(lineNumber, 0, lineNumber, 0);
                            await vscode.window.showTextDocument(document, {
                                selection: selection,
                                viewColumn: vscode.ViewColumn.One
                            });
                            
                            vscode.window.showInformationMessage(
                                `📍 Found ${searchTerm} in ${fileUri.fsPath.split('/').pop()}`
                            );
                            return;
                        }
                    } catch (fileError) {
                        // Continue to next file
                        continue;
                    }
                }
            } catch (searchError) {
                console.log(`⚠️ Search failed for term: ${searchTerm}`);
                continue;
            }
        }
        
        throw new Error(`Function ${functionName} not found in workspace`);
    }

    private generateSearchTerms(functionName: string): string[] {
        const terms: string[] = [];
        
        // Add the full function name
        terms.push(functionName);
        
        // Add just the function part (after last dot)
        if (functionName.includes('.')) {
            const parts = functionName.split('.');
            terms.push(parts[parts.length - 1]);
            
            // Add the struct/type part if it looks like Type.Method
            if (parts.length >= 2) {
                terms.push(parts[parts.length - 2]);
                terms.push(`${parts[parts.length - 2]}.${parts[parts.length - 1]}`);
            }
        }
        
        // Clean up common Go patterns
        const cleanedName = functionName
            .replace(/\([^)]*\)/g, '') // Remove parameter lists
            .replace(/\*/g, '') // Remove pointer indicators
            .replace(/func\d+/g, '') // Remove func1, func2, etc.
            .trim();
            
        if (cleanedName !== functionName) {
            terms.push(cleanedName);
        }
        
        return [...new Set(terms)]; // Remove duplicates
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

   private async navigateViaDebugSession(node: PathNode): Promise<void> {
    const activeSession = vscode.debug.activeDebugSession;
    if (!activeSession || activeSession.configuration.type !== 'go') {
        throw new Error('No active Go debug session');
    }

    if (node.status === 'current') {
        vscode.window.showInformationMessage(
            `📍 Currently debugging ${node.functionName} - you're already here!`
        );
        return;
    }

    // Enhanced message for -fm functions
    if (node.functionName.endsWith('-fm')) {
        const realMethod = node.functionName.replace('-fm', '');
        vscode.window.showInformationMessage(
            `🔧 This is a Go wrapper function for ${realMethod}. The actual method is in your call stack. Use the debug stack view to navigate to the real implementation.`,
            'Open Call Stack'
        ).then(selection => {
            if (selection === 'Open Call Stack') {
                vscode.commands.executeCommand('workbench.debug.action.openCallStackView');
            }
        });
        return;
    }

    vscode.window.showInformationMessage(
        `📚 This is from the call stack: ${node.functionName}. Use debug controls to navigate the stack.`
    );
}


    private showNodeInformation(node: PathNode): void {
        const info = [
            `**Function**: ${node.functionName}`,
            `**Status**: ${node.status}`,
            `**Depth**: ${node.depth}`,
            node.file ? `**File**: ${node.file}` : null,
            node.line ? `**Line**: ${node.line}` : null,
            node.metadata.riskLevel ? `**Risk Level**: ${node.metadata.riskLevel}` : null,
            node.metadata.probability ? `**Probability**: ${(node.metadata.probability * 100).toFixed(1)}%` : null,
            node.metadata.alternativePathType ? `**Type**: ${node.metadata.alternativePathType}` : null
        ].filter(Boolean).join('\n');

        const action = node.status === 'possible' ? 'This represents a possible execution path.' :
                      node.status === 'error' ? 'This represents an error scenario.' :
                      'This is part of the actual execution path.';

        vscode.window.showInformationMessage(
            `📊 **${node.functionName}**\n\n${info}\n\n${action}`,
            { modal: false }
        );
    }

    private exportGraph(): void {
        const graph = this.graphService.getCurrentGraph();
        const summary = this.graphService.getGraphSummary();
        
        vscode.workspace.openTextDocument({
            content: summary,
            language: 'markdown'
        }).then(doc => {
            vscode.window.showTextDocument(doc);
        });
    }

    private refreshGraph(): void {
        console.log('🔄 Refreshing execution path graph at 2025-06-12 02:20:35');
        vscode.commands.executeCommand('contextSelector.refreshContext');
    }

    private getWebviewContent(graph: ExecutionPathGraph): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Execution Path Graph</title>
    <script src="https://unpkg.com/vis-network@latest/dist/vis-network.min.js"></script>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        
        html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
        
        body {
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            display: flex;
            flex-direction: column;
            min-height: 100vh; /* FIXED: Ensure minimum height */
        }
        
        .header {
            flex-shrink: 0;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding: 12px;
            max-height: 40vh; /* FIXED: Limit header height */
            overflow-y: auto; /* FIXED: Allow header scrolling if needed */
        }
        
        .title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--vscode-sideBarTitle-foreground);
        }
        
        .controls {
            display: flex;
            gap: 6px;
            margin-bottom: 10px;
            flex-wrap: wrap;
        }
        
        .btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border, transparent);
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-family: inherit;
            transition: all 0.2s ease;
            white-space: nowrap;
        }
        
        .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .btn.primary {
            background-color: var(--vscode-textLink-foreground);
            color: white;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
            gap: 8px;
            margin-bottom: 10px;
        }
        
        .stat-card {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 8px;
            text-align: center;
            font-size: 11px;
        }
        
        .stat-value {
            font-size: 16px;
            font-weight: 600;
            color: var(--vscode-textLink-foreground);
            display: block;
        }
        
        .stat-label {
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
        }
        
        .legend {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            font-size: 10px;
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }
        
        .legend-color {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            border: 1px solid;
            flex-shrink: 0;
        }
        
        .legend-color.executed { background-color: #4CAF50; border-color: #2E7D32; }
        .legend-color.current { background-color: #2196F3; border-color: #1565C0; }
        .legend-color.possible { background-color: #9E9E9E; border-color: #616161; }
        .legend-color.error { background-color: #F44336; border-color: #C62828; }
        
        .graph-container {
            flex: 1; /* FIXED: Take remaining space */
            position: relative;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin: 8px;
            background: var(--vscode-editor-background);
            overflow: hidden;
            min-height: 400px; /* FIXED: Minimum height for visibility */
            height: calc(100vh - 300px); /* FIXED: Calculate available height */
        }
        
        #network {
            width: 100% !important; /* FIXED: Force full width */
            height: 100% !important; /* FIXED: Force full height */
            min-height: 400px; /* FIXED: Minimum height */
        }
        
        /* FIXED: Force visibility when embedded */
        .graph-container canvas {
            display: block !important;
            visibility: visible !important;
        }
        
        .controls-overlay {
            position: absolute;
            top: 12px;
            right: 12px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            z-index: 1000;
        }
        
        .control-btn {
            background: var(--vscode-button-background);
            border: 1px solid var(--vscode-button-border, transparent);
            color: var(--vscode-button-foreground);
            padding: 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .control-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        
        .empty-state {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
        
        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.6;
        }
        
        .clickable-indicator {
            position: absolute;
            bottom: 12px;
            left: 12px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 6px 10px;
            font-size: 10px;
            opacity: 0.8;
            z-index: 1000;
        }
        
        /* FIXED: Loading indicator */
        .loading-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--vscode-editor-background);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
        }
        
        .loading-spinner {
            width: 32px;
            height: 32px;
            border: 3px solid var(--vscode-progressBar-background);
            border-top: 3px solid var(--vscode-textLink-foreground);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        /* FIXED: Responsive adjustments */
        @media (max-width: 600px) {
            .header { padding: 8px; max-height: 50vh; }
            .stats-grid { grid-template-columns: repeat(2, 1fr); }
            .legend { display: none; }
            .graph-container { height: calc(100vh - 200px); }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">
            🔄 Execution Path Graph
            <span style="font-size: 11px; font-weight: normal; color: var(--vscode-descriptionForeground);">
                Updated: ${new Date(graph.timestamp).toLocaleTimeString()} 
            </span>
        </div>
        
        <div class="controls">
            <button class="btn primary" onclick="refreshGraph()">🔄 Refresh</button>
            <button class="btn" onclick="exportGraph()">📋 Export</button>
            <button class="btn" onclick="fitGraph()">🔍 Fit</button>
            <button class="btn" onclick="resetView()">🎯 Reset</button>
            <button class="btn" onclick="forceRedraw()">🔧 Redraw</button>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <span class="stat-value">${graph.pathStatistics.totalNodes}</span>
                <div class="stat-label">Nodes</div>
            </div>
            <div class="stat-card">
                <span class="stat-value">${graph.pathStatistics.executedNodes}</span>
                <div class="stat-label">Executed</div>
            </div>
            <div class="stat-card">
                <span class="stat-value">${graph.pathStatistics.possibleNodes}</span>
                <div class="stat-label">Possible</div>
            </div>
            <div class="stat-card">
                <span class="stat-value">${(graph.pathStatistics.pathCoverage * 100).toFixed(1)}%</span>
                <div class="stat-label">Coverage</div>
            </div>
        </div>
        
        <div class="legend">
            <div class="legend-item">
                <div class="legend-color executed"></div>
                <span>Executed</span>
            </div>
            <div class="legend-item">
                <div class="legend-color current"></div>
                <span>Current</span>
            </div>
            <div class="legend-item">
                <div class="legend-color possible"></div>
                <span>Possible</span>
            </div>
            <div class="legend-item">
                <div class="legend-color error"></div>
                <span>Error</span>
            </div>
        </div>
    </div>
    
    <div class="graph-container">
        ${graph.pathStatistics.totalNodes === 0 ? `
        <div class="empty-state">
            <div class="empty-state-icon">📊</div>
            <h3>No Execution Paths Available</h3>
            <p>Start debugging to see execution paths.</p>
            <button class="btn primary" onclick="refreshGraph()">🔄 Refresh</button>
        </div>
        ` : `
        <div id="loading" class="loading-overlay">
            <div class="loading-spinner"></div>
        </div>
        <div id="network"></div>
        <div class="controls-overlay">
            <button class="control-btn" onclick="zoomIn()">+</button>
            <button class="control-btn" onclick="zoomOut()">-</button>
            <button class="control-btn" onclick="fitGraph()">⌂</button>
        </div>
        <div class="clickable-indicator">
            💡 Click nodes to navigate
        </div>
        `}
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const graphData = ${JSON.stringify(graph)};
        let network;
        let isInitialized = false;
        
        // FIXED: Force initialization and visibility
        function initializeGraph() {
            if (graphData.pathStatistics.totalNodes === 0) {
                return;
            }
            
            console.log('🚀 Initializing graph at 2025-06-12 03:38:04');
            
            const container = document.getElementById('network');
            if (!container) {
                console.error('❌ Network container not found!');
                return;
            }
            
            // FIXED: Ensure container has dimensions
            const containerRect = container.getBoundingClientRect();
            console.log('📏 Container dimensions:', containerRect);
            
            if (containerRect.width === 0 || containerRect.height === 0) {
                console.warn('⚠️ Container has zero dimensions, forcing resize');
                container.style.width = '100%';
                container.style.height = '400px';
                container.style.minHeight = '400px';
            }
            
            const nodes = new vis.DataSet();
            const edges = new vis.DataSet();
            
            const allNodes = [...graphData.actualPath, ...graphData.possiblePaths];
            console.log(\`📊 Processing \${allNodes.length} nodes\`);
            
            // Add nodes
            allNodes.forEach((node, index) => {
                const nodeData = {
                    id: node.id,
                    label: truncateText(node.functionName, 15),
                    title: createTooltipText(node),
                    group: node.status,
                    level: node.depth,
                    physics: true,
                    font: { size: 11, color: '#ffffff' },
                    nodeData: node
                };
                
                switch(node.status) {
                    case 'executed':
                        nodeData.color = { background: '#4CAF50', border: '#2E7D32' };
                        nodeData.size = 20;
                        break;
                    case 'current':
                        nodeData.color = { background: '#2196F3', border: '#1565C0' };
                        nodeData.size = 25;
                        break;
                    case 'possible':
                        nodeData.color = { background: '#9E9E9E', border: '#616161' };
                        nodeData.size = 16;
                        break;
                    case 'error':
                        nodeData.color = { background: '#F44336', border: '#C62828' };
                        nodeData.size = 22;
                        break;
                }
                
                nodes.add(nodeData);
            });
            
            // Add edges
            allNodes.forEach(node => {
                if (node.children && node.children.length > 0) {
                    node.children.forEach(childId => {
                        const child = allNodes.find(n => n.id === childId);
                        if (child) {
                            edges.add({
                                from: node.id,
                                to: child.id,
                                arrows: { to: { enabled: true } },
                                color: { color: '#666666' },
                                width: 2
                            });
                        }
                    });
                }
            });
            
            console.log(\`📊 Created \${nodes.length} nodes and \${edges.length} edges\`);
            
            // FIXED: Network options for better visibility
            const options = {
                layout: {
                    hierarchical: {
                        enabled: true,
                        direction: 'UD',
                        sortMethod: 'directed',
                        levelSeparation: 100,
                        nodeSpacing: 150,
                        treeSpacing: 200
                    }
                },
                physics: {
                    enabled: true,
                    stabilization: { enabled: true, iterations: 200, fit: true }
                },
                interaction: {
                    dragNodes: true,
                    dragView: true,
                    zoomView: true,
                    hover: true
                },
                nodes: {
                    shape: 'dot',
                    borderWidth: 2,
                    shadow: true
                },
                edges: {
                    shadow: true,
                    smooth: { enabled: true, type: 'dynamic' }
                },
                // FIXED: Force canvas to be visible
                configure: {
                    enabled: false
                }
            };
            
            try {
                // Create network
                network = new vis.Network(container, { nodes: nodes, edges: edges }, options);
                
                // FIXED: Event handlers
                network.on('click', function(params) {
                    if (params.nodes.length > 0) {
                        const nodeId = params.nodes[0];
                        const nodeData = nodes.get(nodeId);
                        console.log(\`🔍 Node clicked: \${nodeId} at 2025-06-12 03:38:04\`);
                        
                        vscode.postMessage({
                            command: 'nodeClicked',
                            nodeId: nodeId,
                            nodeData: nodeData.nodeData
                        });
                    }
                });
                
                network.on('stabilizationIterationsDone', function() {
                    console.log('✅ Graph stabilization complete at 2025-06-12 03:38:04');
                    hideLoading();
                    
                    // FIXED: Force fit and redraw
                    setTimeout(() => {
                        network.fit({ animation: { duration: 1000 } });
                        network.redraw();
                    }, 100);
                });
                
                network.on('afterDrawing', function() {
                    if (!isInitialized) {
                        console.log('🎨 Graph rendered successfully');
                        isInitialized = true;
                        hideLoading();
                    }
                });
                
                // FIXED: Force initial redraw
                setTimeout(() => {
                    if (network) {
                        network.redraw();
                        network.fit();
                    }
                }, 200);
                
            } catch (error) {
                console.error('❌ Error creating network:', error);
                hideLoading();
            }
        }
        
        function hideLoading() {
            const loading = document.getElementById('loading');
            if (loading) {
                loading.style.display = 'none';
            }
        }
        
        function truncateText(text, maxLength) {
            return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
        }
        
        function createTooltipText(node) {
            return \`<strong>\${node.functionName}</strong><br>Status: \${node.status}<br>Line: \${node.line}<br>Click to navigate\`;
        }
        
        // Control functions
        function refreshGraph() {
            vscode.postMessage({ command: 'refreshGraph' });
        }
        
        function exportGraph() {
            vscode.postMessage({ command: 'exportGraph' });
        }
        
        function fitGraph() {
            if (network) {
                network.fit({ animation: { duration: 1000 } });
            }
        }
        
        function resetView() {
            if (network) {
                network.moveTo({ position: { x: 0, y: 0 }, scale: 1 });
            }
        }
        
        function zoomIn() {
            if (network) {
                const scale = network.getScale() * 1.2;
                network.moveTo({ scale: scale });
            }
        }
        
        function zoomOut() {
            if (network) {
                const scale = network.getScale() * 0.8;
                network.moveTo({ scale: scale });
            }
        }
        
        // FIXED: Force redraw function
        function forceRedraw() {
            console.log('🔧 Forcing graph redraw at 2025-06-12 03:38:04');
            if (network) {
                network.redraw();
                network.fit();
            } else {
                initializeGraph();
            }
        }
        
        // FIXED: Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeGraph);
        } else {
            initializeGraph();
        }
        
        // FIXED: Handle window resize
        window.addEventListener('resize', () => {
            setTimeout(() => {
                if (network) {
                    network.redraw();
                    network.fit();
                }
            }, 100);
        });
        
    </script>
</body>
</html>`;
}

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }
    }
}