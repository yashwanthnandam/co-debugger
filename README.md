# Go Debug Context Analyzer

🚀 **AI-powered Go debugging with symbolic execution and path-sensitivity analysis**

## Features

### 🧠 **Intelligent Context Analysis**
- **Symbolic Execution**: Analyzes execution paths and constraints
- **Path Sensitivity**: Identifies path-dependent variable states  
- **Smart Variable Filtering**: Focuses on application-relevant variables
- **Business Logic Detection**: Automatically identifies application code vs infrastructure

### 🤖 **AI-Powered Insights**
- **Multiple AI Providers**: OpenAI GPT, Anthropic Claude, Azure OpenAI
- **Context-Aware Analysis**: Understands your specific debugging scenario
- **Actionable Recommendations**: Suggests test cases and debugging steps
- **Root Cause Analysis**: Identifies potential issues and their origins

### 📊 **Advanced Debug Features**
- **Real-time Context Collection**: Automatic breakpoint detection
- **Alternative Path Generation**: "What if" scenarios for different inputs
- **Constraint Solving**: Analyzes variable constraints and dependencies
- **Performance Metrics**: Collection time, analysis depth, path coverage

## Quick Start

1. **Install the extension**
2. **Configure AI provider** in settings (OpenAI API key recommended)
3. **Start Go debugging** with Delve
4. **Set breakpoint** in your application code
5. **Open Context Analyzer** from the debug toolbar

## Usage

### 1. Start Debugging
```bash
# Launch your Go application with Delve
dlv debug main.go
```

### 2. Set Breakpoints
Place breakpoints in your application handlers, services, or business logic functions.

### 3. Analyze Context
- Click the **Context Analyzer** button in the debug toolbar
- Or use Command Palette: `Go Debug: Open Context Analyzer`

### 4. AI Analysis
Ask questions like:
- "What's the issue in current execution?"
- "Explain these variable values"
- "What test scenarios should I consider?"
- "Analyze the execution path"

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

### Business Logic Detection
```json
{
  "goDebugger.businessLogic.enableDetection": true,
  "goDebugger.businessLogic.applicationPatterns": [
    "Handler)", "Service)", "Controller)", ".Process"
  ]
}
```

## Examples

### Web API Debugging
```go
func (h *UserHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
    // Set breakpoint here
    var user User
    if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
        // Context analyzer will show request parsing analysis
    }
}
```

### Business Logic Analysis
The extension automatically identifies:
- Request/response handling patterns
- Validation logic flows
- Database operations
- Error handling paths

## Advanced Features

### Symbolic Execution
- Analyzes execution constraints
- Generates alternative execution paths  
- Identifies potential null pointer issues
- Suggests boundary condition tests

### Path Sensitivity
- Tracks variable states across execution paths
- Detects path-dependent behavior
- Identifies convergence points with conflicts
- Recommends path-specific test cases

## Requirements

- **VS Code** 1.60.0 or higher
- **Go** 1.16 or higher  
- **Delve** debugger
- **AI API Key** (OpenAI, Anthropic, or Azure)

## Known Issues

- Works best with structured Go applications (handlers, services, etc.)
- Requires breakpoints in application logic (not infrastructure code)
- AI analysis requires internet connection

## Release Notes

### 1.0.0
- Initial release
- Symbolic execution analysis
- Path-sensitivity analysis  
- Multi-provider AI integration
- Smart context filtering

## Contributing

Found a bug or want to contribute? Visit our [GitHub repository](https://github.com/yashwanthnandam/go-debugger-ai).

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Happy Debugging!** 🐛➡️✨