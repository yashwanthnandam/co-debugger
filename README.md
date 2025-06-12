# Go Debug Context Analyzer

🚀 **AI-powered Go debugging with advanced execution path visualization and symbolic analysis**

*Last Updated: 2025-06-12 03:49:24 UTC by yashwanthnandam*

---

## Features

### 🧠 **Intelligent Context Analysis**

- **Symbolic Execution**: Analyzes execution paths and constraints with configurable depth (up to 6 levels)
- **Path Sensitivity**: Identifies path-dependent variable states with enhanced file resolution
- **Smart Variable Expansion**: Deep inspection of complex data structures with JSON export
- **Business Logic Detection**: Automatically identifies application code vs infrastructure
- **Memory-Safe Analysis**: Configurable limits and safety mechanisms

### 📊 **Advanced Execution Path Graph**

- **Interactive Graph Visualization**: Vis.js-powered network diagrams with force-directed layouts
- **Clickable Navigation**: Direct navigation to source code from graph nodes
- **Multi-Layout Support**: Hierarchical (tree/flow) and force-directed layouts
- **Real-time Updates**: Automatic graph refresh on breakpoint changes
- **Alternative Path Analysis**: Visualizes possible execution scenarios (error paths, middleware bypasses)

### 🤖 **AI-Powered Insights**

- **Multiple AI Providers**: OpenAI GPT, Anthropic Claude, Azure OpenAI
- **Enhanced Context**: Deep variable expansion with full JSON context
- **Execution Flow Analysis**: Complete call stack and alternative path analysis
- **Root Cause Analysis**: Identifies potential issues with path-specific recommendations
- **Test Case Generation**: Suggests test scenarios for alternative execution paths

### 🔍 **Advanced Debug Features**

- **Enhanced Variable Expansion**: 6-level deep expansion with caching and memory limits
- **Workspace File Resolution**: Automatic file path resolution for all graph nodes
- **Go Framework Support**: Special handling for Gin, HTTP handlers, and middleware
- **Performance Monitoring**: Collection time, memory usage, expansion metrics
- **Safety Limits**: Circular reference detection and emergency stops

---

## Quick Start

1. **Install the extension**
2. **Configure AI provider** in settings (OpenAI API key recommended)
3. **Start Go debugging** with Delve
4. **Set breakpoint** in your application code
5. **Open Context Analyzer** and **Execution Path Graph** from debug toolbar

---

## Usage

### 1. Start Debugging

```bash
# Launch your Go application with Delve
dlv debug main.go
```

### 2. Set Breakpoints

Place breakpoints in your application handlers, services, or business logic functions.

### 3. Analyze Context

- **Context Analyzer**: Click in debug toolbar or use `Go Debug: Open Context Analyzer`
- **Execution Path Graph**: Click in debug toolbar or use `Go Debug: Show Execution Graph`

### 4. Interactive Graph Navigation

- Click any node to navigate to source code
- Zoom and pan to explore execution paths
- Switch layouts between hierarchical and force-directed
- Export graph summary for documentation

### 5. AI Analysis

Ask questions like:

- "Analyze the current execution path and variable states"
- "What are the possible error scenarios from this point?"
- "Explain the middleware execution flow"
- "What test cases should cover these alternative paths?"

---

## Configuration

### AI Provider Setup

#### OpenAI (Recommended)

```json
{
  "contextSelector.llm.provider": "openai",
  "contextSelector.llm.openaiApiKey": "your-api-key",
  "contextSelector.llm.model": "gpt-4"
}
```

#### Anthropic Claude

```json
{
  "contextSelector.llm.provider": "anthropic",
  "contextSelector.llm.anthropicApiKey": "your-api-key",
  "contextSelector.llm.model": "claude-3-sonnet-20240229"
}
```

### Enhanced Variable Analysis

```json
{
  "goDebugger.variableAnalysis.enableDeepExpansion": true,
  "goDebugger.variableAnalysis.maxExpansionDepth": 6,
  "goDebugger.variableAnalysis.memoryLimitMB": 50,
  "goDebugger.variableAnalysis.enableTypeInference": true
}
```

### Business Logic Detection

```json
{
  "goDebugger.businessLogic.enableDetection": true,
  "goDebugger.businessLogic.applicationPatterns": [
    "Handler", "Service", "Controller", "Manager", "Usecase"
  ],
  "goDebugger.businessLogic.systemPatterns": [
    "middleware", "logger", "recovery", "cors"
  ]
}
```

---

## Examples

### Web API Debugging with Path Visualization

```go
func (h *ReportHandler) GetPlanetaryReport(c *gin.Context) {
    // Set breakpoint here
    name := c.Param("name")
    dob := c.Query("dob")

    // Execution Path Graph will show:
    // - Current execution: GetPlanetaryReport
    // - Possible paths: validation errors, database failures
    // - Alternative routes: 404, method not allowed
    // - Middleware chain: logger, recovery, authentication

    report, err := h.usecase.GenerateReport(name, dob)
    if err != nil {
        // Graph shows error handling paths
        c.JSON(500, gin.H{"error": err.Error()})
        return
    }

    c.JSON(200, report)
}
```

---

## Advanced Features

### Execution Path Graph

- **Interactive Visualization**: Click nodes to navigate to source code
- **Layout Options**: Tree view (hierarchical) or force-directed layouts
- **Path Types:**
  - 🟢 Executed Path
  - 🔵 Current Location
  - ⚪ Possible Path
  - 🔴 Error Path
- **Smart Navigation**: Automatic file resolution for Go framework functions

### Enhanced Variable Expansion

- **Configurable Depth**: Up to 6 levels deep with safety limits
- **JSON Export**: Full structure export for complex data
- **Caching System**: Efficient re-expansion with memory management
- **Type Inference**: Smart Go type detection and formatting

### Symbolic Execution

- **Constraint Analysis**: Identifies variable constraints and dependencies
- **Alternative Path Generation**: "What if" scenarios with probability scoring
- **Null Pointer Detection**: Identifies potential nil reference issues
- **Boundary Condition Analysis**: Suggests edge case test scenarios

### Path Sensitivity

- **Variable State Tracking**: Monitors how variables change across paths
- **Convergence Analysis**: Detects where execution paths merge
- **Conflict Detection**: Identifies inconsistent variable states
- **Risk Assessment**: Prioritizes paths by complexity and error probability

### Graph Navigation Features

- **File Resolution Strategies**:
  - Direct File Path
  - Workspace Search
  - Package Resolution
  - Framework Mapping
  - Fallback Information

### Supported Patterns

- Gin Framework
- HTTP Handlers
- Business Logic
- Go Internal Runtime Functions

---

## Requirements

- VS Code 1.60.0 or higher
- Go 1.16 or higher
- Delve debugger
- AI API Key (OpenAI, Anthropic, or Azure)

---

## Performance

- **Memory Management**: Configurable limits (default: 50MB)
- **Safety Mechanisms**: Circular reference detection, emergency stops
- **Caching**: Intelligent variable expansion caching
- **Metrics**: Real-time performance monitoring

---

## Known Issues

- Works best with structured Go applications
- Requires breakpoints in application logic
- AI analysis requires internet connection
- Framework internal functions navigate to method definitions when possible

---

## Troubleshooting

- **Graph Not Visible**: Try "🔧 Redraw" or open in a new window
- **Non-Clickable Nodes**: Use call stack view or method definition resolution

---

## Release Notes

### 1.2.0 (2025-06-12)

- Execution Path Graph: Interactive visualization with Vis.js
- Enhanced Variable Expansion: Configurable depth up to 6 levels
- Smart File Resolution: Automatic navigation for framework functions
- Performance Optimization: Memory limits and caching system
- UI Improvements: Better layout and responsive design

### 1.1.0

- Path Sensitivity Analysis: Enhanced with realistic alternative paths
- Business Logic Detection: Improved pattern recognition
- AI Context Enhancement: Deeper variable inspection

### 1.0.0

- Initial release
- Symbolic execution analysis
- Multi-provider AI integration
- Smart context filtering

---

## Contributing

Found a bug or want to contribute? Visit our GitHub repository.

---

## License

MIT License - see LICENSE for details.

---

Happy Debugging with Enhanced Path Visualization! 🐛➡️📊✨

Built with ❤️ for the Go community
