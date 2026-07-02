<p align="center">
  <img src="assets/greedant-logo.svg" width="80" alt="Greedant Logo" />
</p>

<h1 align="center">Greedant</h1>

<p align="center">
  <strong>A local-first AI coding assistant for VS Code</strong><br/>
  Powered by Ollama and local LLMs. No cloud. No API keys. No data leaving your machine.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0-blue" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/badge/VS%20Code-1.85%2B-blue?logo=visualstudiocode" alt="VS Code" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="Platform" />
</p>

---

## What is Greedant?

Greedant is a VS Code extension that gives you an AI coding assistant running entirely on your local machine. It lives in your sidebar and lets you chat with a local LLM through Ollama — keeping your code private and your workflow fast.

### Highlights

- **Completely local** — your code never leaves your machine
- **Sidebar chat panel** with a clean, theme-aware UI
- **Real-time streaming** responses from Ollama
- **Session-persistent** conversation history
- **Zero configuration** needed to get started (just install Ollama)
- **Helpful error messages** when something goes wrong

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| [VS Code](https://code.visualstudio.com/) | 1.85+ |
| [Ollama](https://ollama.ai/) | Latest |
| [Node.js](https://nodejs.org/) (for development) | 18+ |

---

## Quick Start

### 1. Install and start Ollama

```bash
# macOS (via Homebrew)
brew install ollama

# Or download from https://ollama.ai/

# Start the Ollama server
ollama serve
```

### 2. Pull the default model

```bash
ollama pull qwen2.5-coder:3b
```

### 3. Run the extension

```bash
# Clone and install dependencies
git clone <repo-url>
cd Greedant-copilot
npm install

# Compile TypeScript
npm run compile
```

Then press **F5** in VS Code to launch the Extension Development Host.

### 4. Open Greedant

Click the Greedant icon in the Activity Bar (sidebar), or use the command palette:

```
Ctrl+Shift+P → Greedant: Open Chat
```

---

## Configuration

Open **Settings** (`Ctrl+,`) and search for "Greedant":

| Setting | Default | Description |
|---------|---------|-------------|
| `greedant.provider` | `ollama` | LLM provider to use |
| `greedant.ollama.baseUrl` | `http://localhost:11434` | Ollama server URL |
| `greedant.ollama.model` | `qwen2.5-coder:3b` | Model to use for completions |
| `greedant.systemPrompt` | *(built-in)* | System prompt for conversations |

### Recommended Models

| Model | Size | Notes |
|-------|------|-------|
| `qwen2.5-coder:3b` | ~2 GB | Default. Fast, good quality |
| `qwen2.5-coder:7b` | ~4.5 GB | Better quality, needs more RAM |
| `codellama:7b` | ~4 GB | Meta's code-focused model |
| `deepseek-coder:6.7b` | ~4 GB | Strong at code generation |
| `starcoder2:3b` | ~2 GB | Lightweight alternative |

To switch models:

```bash
ollama pull codellama:7b
```

Then update the `greedant.ollama.model` setting in VS Code.

---

## Architecture

```
src/
├── extension.ts                 # Entry point, activation wiring
├── constants.ts                 # IDs, defaults, message types
├── config/
│   └── GreedantConfig.ts        # Centralized VS Code settings reader
├── chat/
│   ├── ChatController.ts        # Request lifecycle management
│   ├── ChatService.ts           # Chat orchestration, history
│   └── ChatTypes.ts             # Message/request/response types
├── llm/
│   ├── LLMProvider.ts           # Provider interface (abstract)
│   ├── LLMTypes.ts              # Shared LLM types
│   └── OllamaProvider.ts        # Ollama API implementation
└── webview/
    ├── GreedantViewProvider.ts   # WebviewViewProvider
    └── getWebviewContent.ts      # HTML/CSS/JS for chat UI
```

**Design principles:**

- **Provider abstraction** — add new LLM backends by implementing `LLMProvider`
- **Service layer** — ChatService is provider-agnostic, ready for context enrichment
- **Controller pattern** — ChatController manages request lifecycle and error handling
- **Message passing** — clean protocol between webview and extension host

---

## Development

```bash
# Watch mode (recompiles on file save)
npm run watch

# Lint the source
npm run lint

# One-time compile
npm run compile
```

---

## Troubleshooting

<details>
<summary><strong>"Cannot connect to Ollama"</strong></summary>

Make sure Ollama is running:

```bash
ollama serve
```

Check that the configured URL matches where Ollama is listening (default: `http://localhost:11434`).
</details>

<details>
<summary><strong>"Model not found"</strong></summary>

Pull the model configured in your settings:

```bash
ollama pull qwen2.5-coder:3b
```
</details>

<details>
<summary><strong>Extension not appearing in sidebar</strong></summary>

1. Verify compilation succeeded: `npm run compile`
2. Press **F5** to open the Extension Development Host
3. Look for the Greedant icon in the Activity Bar (left sidebar)
</details>

---

## Roadmap

**Coming soon:**

- [ ] Code block syntax highlighting in chat
- [ ] Active file context awareness
- [ ] Selected text explanation
- [ ] Request cancellation

**Planned:**

- [ ] OpenAI / Anthropic / OpenRouter providers
- [ ] LM Studio support
- [ ] Repository indexing and RAG
- [ ] Inline code suggestions
- [ ] Terminal command explanation

**Future:**

- [ ] Tool calling and agent workflows
- [ ] Multi-step code generation
- [ ] Diff preview and apply
- [ ] Conversation persistence across sessions

---

## Contributing

Contributions are welcome! To get started:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and ensure `npm run lint` passes
4. Submit a pull request

---

## License

[MIT](LICENSE)
