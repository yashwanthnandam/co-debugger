# Universal Debugger AI

**AI-powered multi-language debugging extension with advanced symbolic execution and path-sensitivity analysis for Visual Studio Code.**

---

## 🌟 Features

### 🔍 Multi-Language Support

* **Go**: Full Delve debugger integration with advanced context analysis
* **Python**: Complete debugpy support with async/await analysis
* **JavaScript/TypeScript**: Node.js and browser debugging with closure analysis
* **Automatic Detection**: Seamlessly switches between languages based on debug session

### 🧠 Advanced AI Analysis

* **Symbolic Execution**: Analyze execution paths and constraints
* **Path-Sensitivity Analysis**: Track variable states across different execution paths
* **Context-Aware Variable Expansion**: Deep inspection of complex data structures
* **Business Logic Detection**: Automatically identifies application-relevant code

### 📊 Rich Debugging Context

* Enhanced Variable Analysis
* Execution Path Graphs
* Performance Metrics
* Memory Usage Tracking

### 🤖 AI Integration

* **OpenAI GPT Support**: GPT-3.5, GPT-4, and custom models
* **Anthropic Claude Support**
* **Azure OpenAI Integration**
* **Custom Endpoints**

---

## 🚀 Quick Start

### Installation

**From Marketplace**:

```sh
ext install NandamYashwanth.go-debugger-ai
```

**From VSIX**:

1. Download latest `.vsix` from releases
2. Install via VS Code: Extensions > `...` > Install from VSIX

### Initial Setup

**Configure AI Provider (optional)**:

```json
{
  "contextSelector.llm.provider": "openai",
  "contextSelector.llm.openaiApiKey": "your-api-key-here",
  "contextSelector.llm.model": "gpt-4"
}
```

**Enable Multi-Language Support**:

```json
{
  "universalDebugger.multiLanguage.enabled": true,
  "universalDebugger.multiLanguage.autoDetection": true
}
```

### First Debug Session

1. Open project (Go, Python, JS, or TS)
2. Set breakpoints
3. Start debugging
4. Open Context Analyzer:

   * Command Palette: `Universal Debug: Open Context Analyzer`
   * Or use debug toolbar icon

---

## 📋 Language Support

### 🐹 Go

* **Debugger**: Delve
* **Features**: Goroutine analysis, pointer dereferencing
* **Files**: `.go`

### 🐍 Python

* **Debugger**: debugpy
* **Features**: Async/await analysis, module tracking
* **Files**: `.py`, `.pyw`

### ⚡ JavaScript/TypeScript

* **Debugger**: Node.js, Chrome
* **Features**: Closure & prototype chain analysis
* **Files**: `.js`, `.ts`, `.mjs`, `.tsx`, `.cjs`

---

## 🎛️ Configuration

### Multi-Language

```json
{
  "universalDebugger.multiLanguage.enabled": true,
  "universalDebugger.multiLanguage.autoDetection": true,
  "universalDebugger.variableAnalysis.maxDepth": 6,
  "universalDebugger.variableAnalysis.memoryLimitMB": 50
}
```

### Language-Specific

```json
{
  "goDebugger.variableAnalysis.maxVariableValueLength": 500,
  "goDebugger.variableAnalysis.enableTypeInference": true,
  "goDebugger.businessLogic.applicationPatterns": [
    "Handler)", "Controller)", "Service)", "Repository)",
    ".Get", ".Post", ".Put", ".Delete", ".Create", ".Update"
  ]
}
```

### AI Provider

```json
{
  "contextSelector.llm.provider": "openai",
  "contextSelector.llm.openaiApiKey": "sk-...",
  "contextSelector.llm.model": "gpt-4",
  "contextSelector.llm.temperature": 0.3,
  "contextSelector.llm.maxTokens": 4000
}
```

---

## 🎮 Commands

| Command                                      | Description                  |
| -------------------------------------------- | ---------------------------- |
| `Universal Debug: Open Context Analyzer`     | Opens debugging context view |
| `Universal Debug: Refresh Debug Context`     | Manually refresh context     |
| `Universal Debug: Show Execution Path Graph` | Show execution flow          |
| `Universal Debug: Check Debugger Status`     | Show language + connection   |
| `Universal Debug: Export Debug Analysis`     | Save context data to file    |

---

## 📱 User Interface

### Context Analyzer

* Variable Inspector
* Function Call Stack
* Execution Paths
* AI Analysis

### Execution Path Graph

* Visual Flow
* Alternative Paths
* Risk Analysis
* Performance Metrics

---

## 🔧 Advanced Features

### Variable Expansion

```json
{
  "universalDebugger.languageSpecific.go.maxVariableDepth": 6,
  "universalDebugger.languageSpecific.python.maxVariableDepth": 4,
  "universalDebugger.languageSpecific.javascript.maxVariableDepth": 5,
  "universalDebugger.languageSpecific.javascript.analyzeClosures": true,
  "universalDebugger.languageSpecific.python.enableAsyncAnalysis": true
}
```

### Symbolic Execution & Path Analysis

* Constraint Tracking
* Root Cause Analysis
* Conflict Detection
* Performance Monitoring

---

## 🎯 Use Cases

### 🐛 Bug Investigation

1. Set breakpoint
2. Start debug session
3. Open Context Analyzer
4. Inspect AI insights
5. Review alternative paths

### 🔍 Code Understanding

1. Set breakpoints in key functions
2. Debug with sample input
3. View Execution Path Graph
4. Export context data

### ⚡ Performance Analysis

1. Enable memory tracking
2. Set breakpoints
3. Monitor variable + execution cost

---

## 🤝 Language-Specific Examples

### Go

```go
func processUser(ctx context.Context, userID int64) (*User, error) {
    user, err := userRepo.GetByID(ctx, userID)
    if err != nil {
        return nil, fmt.Errorf("failed to get user: %w", err)
    }
    return user, nil
}
```

### Python

```python
async def process_data(data_source: str) -> Dict[str, Any]:
    async with aiohttp.ClientSession() as session:
        response = await session.get(data_source)
        data = await response.json()
        return data
```

### JavaScript

```js
function processApiResponse(response) {
    const { data, status, headers } = response;
    return data.map(item => ({ id: item.id, name: item.name, processed: true }));
}
```

---

## 🔧 Troubleshooting

### Extension Not Activating

```sh
# Ensure session type is go, python, debugpy, node, chrome
```

### Language Detection Issues

```json
{
  "type": "go",
  "request": "launch",
  "program": "${workspaceFolder}"
}
```

### AI Issues

* Verify API key
* Check connectivity
* Inspect output panel

### Performance Tweaks

```json
{
  "universalDebugger.variableAnalysis.maxDepth": 3,
  "universalDebugger.variableAnalysis.memoryLimitMB": 25
}
```

---

## 📊 Performance Metrics

* Collection Time
* Variable Count
* Memory Usage
* Symbolic Analysis Time
* Path Sensitivity Time
* Language

---

## 🛠️ Development

### Build From Source

```sh
git clone https://github.com/yashwanthnandam/go-debugger-ai.git
cd go-debugger-ai/extension
npm install
npm run compile
npm run package
```

### Contributing

1. Fork & branch
2. Develop & test
3. PR with description

### Architecture

```
src/
├── extension.ts
├── detection/languageDetector.ts
├── factories/debuggerFactory.ts
├── languages/{go,python,javascript}Handler.ts
├── protocols/*Protocol.ts
├── services/{contextCollector,llmService,...}.ts
├── views/{contextSelectorView,executionPathGraphView}.ts
```

---

## 📚 API Documentation

### LanguageHandler Interface

```ts
interface LanguageHandler {
  inferType(...): string;
  parseVariableValue(...): ParsedValue;
  extractFunctionName(...): string;
  isSystemVariable(...): boolean;
  isApplicationRelevant(...): boolean;
}
```

### DebuggerProtocol Interface

```ts
interface DebuggerProtocol {
  attachToSession(...): void;
  getStackTrace(): Promise<DebugFrame[]>;
  getCurrentFrame(): Promise<DebugFrame | null>;
}
```

---

## 🔗 Links

* **GitHub**: [go-debugger-ai](https://github.com/yashwanthnandam/go-debugger-ai)
* **VS Code Marketplace**: Universal Debugger AI
* **Issues**: Report bugs / request features
* **Discussions**: Community forum

---

## 📜 License

MIT License – See LICENSE file

## 🙏 Acknowledgments

* VS Code Team
* Delve / Go Team
* Python debugpy
* OpenAI & Anthropic
* Community Contributors

---

## 📈 Changelog

### v2.0.0 (2025-06-13)

* Multi-Language: Python, JS, TS
* Enhanced AI Context Analysis
* Universal Variable Inspection
* Performance & Speed Optimizations
* Seamless Language Switching

### v1.0.4

* Symbolic Execution
* Path Sensitivity
* Deep Variable Expansion
* AI Code Analysis

---

> Happy Debugging! 🐛➡️✨
