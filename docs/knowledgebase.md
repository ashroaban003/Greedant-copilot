# Greedant Copilot - Knowledgebase

VS Code extension providing AI-powered coding assistance using local LLMs (Ollama).

## Architecture

```
extension.ts (entry)
    ├── ChatConfig (VS Code settings reader)
    ├── ProviderFactory → OllamaProvider | MockProvider
    ├── ContextManager (orchestrates context gathering)
    │     ├── SelectionProvider, ActiveFileProvider, OpenFilesProvider
    │     ├── GrepProvider (workspace search)
    │     └── SmartKeywordExtractor (LLM-powered keyword extraction)
    ├── ChatService (LLM orchestration + history)
    └── ChatController → GreedantViewProvider (Webview UI)
```

## Core Files

| File | Purpose |
|------|---------|
| `src/extension.ts` | Entry point, wires all dependencies |
| `src/chat/ChatService.ts` | Orchestrates LLM calls, manages history, builds prompts |
| `src/chat/ChatController.ts` | Bridges webview UI and ChatService, handles streaming |
| `src/context/ContextManager.ts` | Central context gathering, token budgeting, function extraction |
| `src/agent/SmartKeywordExtractor.ts` | LLM-powered keyword extraction with tier1/tier2 system |
| `src/agent/CommandAgent.ts` | Fast path for terminal commands, category-based prompts |
| `src/context/providers/GrepProvider.ts` | Workspace-wide file search by filename/content |
| `src/llm/providers/OllamaProvider.ts` | Ollama API integration (chat, stream, models) |
| `src/llm/ProviderFactory.ts` | Creates LLMProvider based on config |
| `src/context/types.ts` | Core types: FileCandidate, SmartKeywordResult, FILE_SCORING |
| `src/terminal/TerminalService.ts` | Manages VS Code terminal, executes commands |

## Key Abstractions

### LLMProvider Interface (`src/llm/LLMProvider.ts`)
```typescript
interface LLMProvider {
  chat(request): Promise<LLMResponse>
  streamChat(request): AsyncGenerator<LLMStreamChunk>
  isAvailable(): Promise<ProviderStatus>
  listModels?(): Promise<string[]>
  getContextWindowSize?(model?: string): Promise<number>
  dispose(): void
}
```

### SmartKeywordResult (`src/context/types.ts`)
```typescript
interface SmartKeywordResult {
  tier1: Tier1Keyword[]  // File-level: classes, interfaces, types (score: 100)
  tier2: Tier2Keyword[]  // Function-level: methods, properties (score: 50-90)
}
```

### FILE_SCORING Constants
```typescript
TIER1_FILENAME_EXACT: 1600    // Filename matches keyword exactly
TIER1_FILENAME_CONTAINS: 100  // Filename contains keyword
TIER1_CONTENT_MATCH: 30       // File content matches
ACTIVE_FILE: 69               // Currently open editor
OPEN_FILES: 13                // Open in tabs
OTHER_FILES: 0                // Found via grep
```

## Message Flow

1. User sends message → ChatController.handleUserMessage()
2. ChatService.sendMessageStreaming() called
3. ContextManager.buildPromptWithContext():
   - SmartKeywordExtractor extracts tier1/tier2 keywords (LLM call)
   - Gathers candidates: active file, open files, grep results
   - Scores/merges files using FILE_SCORING + keyword matching
   - Extracts functions via AST (`functionExtractor.ts`)
   - Assembles context within token budget
4. OllamaProvider.streamChat() sends to Ollama
5. Chunks stream back to UI via MessageProtocol

## Context Providers

| Provider | Source | Priority |
|----------|--------|----------|
| SelectionProvider | Editor selection | Highest (1) |
| ActiveFileProvider | Current file | High (2) |
| OpenFilesProvider | Open editor tabs | Medium (3) |
| GrepProvider | Workspace search | Lower (4) |

## Utility Functions

| File | Key Functions |
|------|--------------|
| `keywordExtractor.ts` | `extractKeywordsStructured()` - regex-based fallback extraction |
| `keywordMatcher.ts` | `scoreFilenameAgainstKeywords()`, `shouldSkipTestFile()` |
| `functionExtractor.ts` | `extractFunctionsFromFile()`, `extractAllMatchedFunctions()` |
| `fileDiscoveryUtils.ts` | `getActiveEditorSnapshot()`, `getFileInfo()` |
| `ASTLite.ts` | Lightweight AST parsing for function extraction |

## Configuration (ChatConfig)

```typescript
provider: "ollama" | "mock"
ollamaBaseUrl: string        // default: "http://localhost:11434"
ollamaModel: string          // e.g., "qwen2.5-coder:7b"
ollamaContextSize: number    // fallback context window
systemPrompt: string         // base instructions
```

## Testing

- Tests in `test/` directory
- Run: `npm test`
- Key test files: `keywordExtractor.test.ts`, `keywordMatcher.test.ts`

## Terminal Execution

Greedant can execute terminal commands from chat responses.

### CommandAgent (Fast Path)

When user asks for terminal/command help, `CommandAgent` bypasses context gathering for faster responses.

**Triggers:**
- "git" + action words (command, how, status, log, diff, etc.)
- "terminal/shell/bash" + action
- "run/execute" + command context  
- Version checks: "node version", "java version", etc.
- "npm" + action words
- "docker" + action words

**Flow:**
```
User: "git command to see status"
    │
    ├─► CommandAgent.shouldHandle() = true
    │
    └─► CommandAgent.stream() → Direct to LLM with specialized prompt
        (no context gathering)
```

**Key file:** `src/agent/CommandAgent.ts`

### Run Button Flow
1. LLM response contains ```bash or ```sh code block
2. message.js detects runnable language, renders "Run" button
3. User clicks Run → `runCommand` message sent to extension
4. ChatController.handleRunCommand() → TerminalService.runCommand()
5. Command executes in VS Code terminal named "Greedant"

### Key Files
| File | Purpose |
|------|---------|
| `src/agent/CommandAgent.ts` | Fast path for command requests, specialized prompt |
| `src/terminal/TerminalService.ts` | Creates/manages terminal, sends commands |
| `src/frontend/components/message/message.js` | Detects runnable code blocks, renders Run button |

### Supported Languages for Run Button
bash, sh, shell, zsh, powershell, cmd, terminal

## Adding New LLM Provider

1. Create `src/llm/providers/NewProvider.ts` implementing `LLMProvider`
2. Add case in `ProviderFactory.createProvider()`
3. Add config options in `ChatConfig` if needed
