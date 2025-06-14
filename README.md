# Co Debugger AI 🤖

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://marketplace.visualstudio.com/items?itemName=NandamYashwanth.go-debugger-ai)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.60.0+-orange.svg)](https://code.visualstudio.com/)

**AI-powered multi-language debugging with symbolic execution and path-sensitivity analysis**

Transform your debugging experience with intelligent context analysis, GitHub Copilot integration, and multi-language support. Co Debugger AI provides instant access to comprehensive debugging insights without leaving your editor.


---

## ✨ Features

### 🚀 Universal Language Support

* 🐹 Go (Delve)
* 🐍 Python (debugpy)
* ⚡ JavaScript/TypeScript (Node, Chrome, Edge)
* ☕ Java (JDB)
* 🔧 C/C++ (GDB, LLDB)
* 🔷 C# (.NET Core)

### 🤖 AI-Powered Analysis

* **Symbolic Execution** - Predict alternative execution paths
* **Path Sensitivity** - Analyze variable dependencies
* **Smart Variable Classification** - Highlight business logic vs system variables
* **Error Prediction** - AI-driven root cause detection

### 🎯 GitHub Copilot Integration

* 10+ specialized context types
* One-click status bar control
* Side panel export
* Multiple format outputs

### ⚡ Smart Context Collection

* Deep object inspection
* Memory usage tracking
* Type inference
* Business logic focus

---

## 📅 Installation

### From Marketplace

```bash
ext install NandamYashwanth.go-debugger-ai
```

### From Command Palette

* `Ctrl+Shift+P` / `Cmd+Shift+P`
* `Extensions: Install Extensions`
* Search for `Co Debugger AI`

### Manual Installation

```bash
git clone https://github.com/yashwanthnandam/go-debugger-ai.git
cd go-debugger-ai
npm install
npm run package
code --install-extension co-debugger-ai-2.0.0.vsix
```

---

## 🚀 Quick Start

### 1. Configure AI Provider

```bash
> Co Debug: Configure AI Assistant
```

Supported:

* OpenAI (GPT-3.5/4/4 Turbo)
* Anthropic (Claude 3)
* Azure OpenAI
* Custom endpoints

### 2. Start Debugging

* Set breakpoints
* Hit `F5` to start session
* Click Co Debug AI in the status bar

### 3. Generate Context

| Context Type      | Description           | Use Case        |
| ----------------- | --------------------- | --------------- |
| 🔧 Quick Fix      | Minimal error context | Troubleshooting |
| 📊 Essential Vars | Key variables         | Debugging vars  |
| 📞 Function Stack | Call hierarchy        | Flow tracing    |
| 🔍 Deep Dive      | Variable analysis     | Data structures |
| 🌊 Control Flow   | Logic paths           | Debugging flow  |
| 📃 Complex Data   | Nested structures     | Data modeling   |
| ⚡ Performance     | Metrics               | Speed tuning    |
| 🐛 Error Invest.  | Root cause            | Bug hunting     |
| 🤖 Full AI        | Everything            | Deep dive       |
| ⚙ Custom          | Tailored              | Your way        |

---

## ⌨️ Keyboard Shortcuts

| Shortcut                  | Action                 |
| ------------------------- | ---------------------- |
| Ctrl+Shift+D Ctrl+Shift+A | Open Context Analyzer  |
| Ctrl+Shift+D R            | Refresh Debug Context  |
| Ctrl+Shift+D Ctrl+Shift+C | Configure AI Assistant |
| Ctrl+Shift+D Ctrl+Shift+G | Show Execution Graph   |

---

## 🎯 Usage Examples

### Example 1: Quick Bug Fix (Go)

```go
func processOrder(order *Order) error {
    if order == nil { // 🚩 Breakpoint
        return errors.New("order is nil")
    }
    // ...
}
```

> Select "Quick Fix Context" → Open side panel → Ask Copilot: *Why is my order nil?*

### Example 2: Complex Data (Python)

```python
def analyze_data(dataset):
    results = {}
    for item in dataset:  # 🚩
        results[item.id] = transform(item)
    return results
```

> Select "Complex Data" → Ask Copilot: *Optimize this loop*

### Example 3: Performance (TypeScript)

```ts
async function fetchUserData(userId: string) {
    const start = performance.now();
    const user = await db.findUser(userId);  // 🚩
    const end = performance.now();
    console.log(`Query took ${end - start}ms`);
    return user;
}
```

> Select "Performance" → Ask Copilot: *Optimize DB call*

---

## 🔧 Configuration

### AI Provider

```json
{
  "coDebugger.llm.provider": "openai",
  "coDebugger.llm.model": "gpt-4",
  "coDebugger.llm.temperature": 0.3,
  "coDebugger.llm.maxTokens": 4000
}
```

### Variable Analysis

```json
{
  "coDebugger.variableAnalysis.maxVariableValueLength": 500,
  "coDebugger.variableAnalysis.enableTypeInference": true,
  "coDebugger.businessLogic.enableDetection": true
}
```

### Language-Specific

```json
{
  "coDebugger.languageSpecific.java.maxVariableDepth": 4,
  "coDebugger.languageSpecific.cpp.analyzeSTLContainers": true,
  "coDebugger.languageSpecific.cpp.memoryLimitMB": 60
}
```

---

## 🌟 Advanced Features

### Symbolic Execution

* Branch prediction
* Constraint solving
* Alternate path analysis

### Path Sensitivity

* Variable flow
* Critical path detection
* Convergence analysis

### Variable Expansion

* Configurable depth
* Type-aware expansion
* JSON export

---

## 🛠️ Development

```bash
git clone https://github.com/yashwanthnandam/go-debugger-ai.git
cd go-debugger-ai
npm install
npm run watch
npm run package
```

---

## 🤝 Contributing

We welcome contributions! See `CONTRIBUTING.md`

**Ideas:**

* 🌍 New language support (Rust, Kotlin, Swift)
* 🤖 More AI models (Gemini, Cohere, local LLMs)
* 🔍 Improved symbolic engine
* 📊 Graph/Chart visualizations
* 🧪 Tests
* 📖 Docs

---

## 📚 Documentation

* User Guide
* Configuration Reference
* AI Integration Guide
* Multi-language Support
* API Docs
* Troubleshooting

---

## 🚑 Troubleshooting

**"Not appearing"**

* Ensure you're in a supported debug session
* Hit a breakpoint
* Restart VS Code

**"AI config failed"**

* Check key/credits/network
* Try other provider

**"Slow context gen"**

* Reduce depth
* Fewer variables
* Check memory limit

**"Copilot can't find file"**

* File should be in Column 2
* Reopen if closed accidentally

**Logs:**

```bash
# Developer tools
> Reload Window → Output → Co Debugger AI
```

---

## 📄 License

[MIT License](LICENSE)

---

## 🙏 Acknowledgments

* VS Code team
* Delve project
* OpenAI/Anthropic
* GitHub Copilot

---
---

Made with ❤️ by Yashwanth Nandam

**Co Debugger AI - Intelligent debugging for the modern developer**
