# Greedant

A local-first AI coding assistant for VS Code, powered by Ollama and local LLMs.

Greedant lives in your sidebar and lets you chat with a local AI model — no cloud, no API keys, no data leaving your machine.

## Features (v0.1)

- Sidebar chat panel in VS Code
- Real-time streaming responses from Ollama
- Session-persistent conversation history
- Clean, theme-aware UI
- Helpful error messages when Ollama is unreachable

## Prerequisites

- [VS Code](https://code.visualstudio.com/) 1.85+
- [Ollama](https://ollama.ai/) installed and running locally
- Node.js 18+ (for development)

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
npm install

# Compile TypeScript
npm run compile
```

Then press **F5** in VS Code to launch the Extension Development Host.

### 4. Open Greedant

Click the Greedant icon in the Activity Bar (sidebar) or run:

```
Ctrl+Shift+P → Greedant: Open Chat
```

## Configuration

Open VS Code Settings and search for "Greedant":

| Setting | Default | Description |
|---------|---------|-------------|
| `greedant.provider` | `ollama` | LLM provider |
| `greedant.ollama.baseUrl` | `http://localhost:11434` | Ollama server URL |
| `greedant.ollama.model` | `qwen2.5-coder:3b` | Model to use |
| `greedant.systemPrompt` | (built-in) | System prompt for conversations |

### Changing the model

```bash
# Pull a different model
ollama pull codellama:7b

# Then update settings
# greedant.ollama.model → codellama:7b
```

Popular coding models for Ollama:
- `qwen2.5-coder:3b` (default, fast, good quality)
- `qwen2.5-coder:7b` (better quality, more RAM)
- `codellama:7b`
- `deepseek-coder:6.7b`
- `starcoder2:3b`

## Architecture

```
src/
├── extension.ts              # Entry point, wiring
├── constants.ts              # IDs, defaults, message types
├── config/
│   └── GreedantConfig.ts     # Centralized VS Code settings reader
├── chat/
│   ├── ChatController.ts     # Request lifecycle management
│   ├── ChatService.ts        # Chat orchestration, history
│   └── ChatTypes.ts          # Message/request/response types
├── llm/
│   ├── LLMProvider.ts        # Provider interface (abstract)
│   ├── LLMTypes.ts           # Shared LLM types
│   └── OllamaProvider.ts     # Ollama API implementation
└── webview/
    ├── GreedantViewProvider.ts  # WebviewViewProvider
    └── getWebviewContent.ts     # HTML/CSS/JS for chat UI
```

The architecture is designed for extensibility:

- **Provider abstraction**: Add new LLM backends by implementing `LLMProvider`
- **Service layer**: ChatService is provider-agnostic, ready for context enrichment and tool calling
- **Controller pattern**: ChatController manages request lifecycle, loading states, and error handling
- **Message passing**: Clean protocol between webview and extension host

## Development

```bash
# Watch mode (recompiles on save)
npm run watch

# Lint
npm run lint
```

## Troubleshooting

### "Cannot connect to Ollama"

Make sure Ollama is running:

```bash
ollama serve
```

### "Model not found"

Pull the configured model:

```bash
ollama pull qwen2.5-coder:3b
```

### Extension not appearing in sidebar

1. Make sure compilation succeeded: `npm run compile`
2. Press F5 to open Extension Development Host
3. Look for the Greedant icon in the Activity Bar

## Roadmap

- [ ] Streaming response improvements
- [ ] Code block syntax highlighting in chat
- [ ] Active file context awareness
- [ ] Selected text explanation
- [ ] OpenAI / Anthropic / OpenRouter providers
- [ ] LM Studio support
- [ ] Repository indexing and RAG
- [ ] Inline code suggestions
- [ ] Terminal command explanation
- [ ] Tool calling and agent workflows
- [ ] Multi-step code generation
- [ ] Diff preview and apply
- [ ] Conversation persistence
- [ ] Request cancellation

## License

MIT
# Greedant-copilot
