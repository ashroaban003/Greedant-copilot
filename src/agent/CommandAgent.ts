/**
 * CommandAgent - Fast path for terminal/shell command requests.
 * 
 * Bypasses context gathering when user asks for terminal commands.
 * Returns pre-built messages with category-based prompts.
 */

import { LLMMessage } from "../llm/LLMTypes";

// ─── Prompt Components ────────────────────────────────────────────

const BASE_PROMPT = `You are a terminal command assistant.

RULES:
- Always wrap commands in \`\`\`bash blocks
- One command per block
- Brief description before each block (max 10 words)
- No extra explanations`;

const GIT_EXAMPLES = `
GIT REFERENCE:
status, log --oneline, diff, branch -a, stash, stash pop, pull, push, fetch, reset --soft HEAD~1, checkout, checkout -b, merge, clone, add, commit -m, remote -v`;

const VERSION_EXAMPLES = `
VERSION REFERENCE:
node --version, npm --version, java --version, python3 --version, docker --version, go version, rustc --version, ruby --version`;

const NPM_EXAMPLES = `
NPM REFERENCE:
install, outdated, list --depth=0, audit, update, run, init, uninstall`;

const DOCKER_EXAMPLES = `
DOCKER REFERENCE:
ps, ps -a, images, logs <container>, stop <container>, start <container>, run, exec -it, build, pull`;

const FILE_EXAMPLES = `
FILE REFERENCE:
ls -la, find . -name "<file>", du -sh *, pwd, cat, head, tail, grep -r "<pattern>", mkdir -p, rm, cp, mv`;

const PROCESS_EXAMPLES = `
PROCESS REFERENCE:
ps aux, kill -9 <pid>, lsof -i :<port>, top, htop, free -h, df -h`;

// This goes LAST - model remembers last info best
const EXPECTED_OUTPUT = `
EXPECTED OUTPUT FORMAT:

Brief description:
\`\`\`bash
command
\`\`\`
Another task:
\`\`\`bash
another command
\`\`\`

Example:
User : Give command to check git status and see recent commits
Response:
Check working directory status:
\`\`\`bash
git status
\`\`\`

View recent commits:
\`\`\`bash
git log --oneline -5
\`\`\`

Follow this format exactly.`;

// ─── Category Detection ───────────────────────────────────────────

type CommandCategory = "git" | "version" | "npm" | "docker" | "file" | "process" | "general";

const CATEGORY_PATTERNS: Record<CommandCategory, RegExp> = {
  git: /\bgit\b/i,
  version: /\b(version|--version|-v)\b.*\b(node|npm|java|python|docker|go|rust|ruby|php)\b|\b(node|npm|java|python|docker|go|rust|ruby|php)\b.*\b(version|--version|-v)\b/i,
  npm: /\bnpm\b/i,
  docker: /\bdocker\b/i,
  file: /\b(list files|find file|disk usage|folder size|large files|pwd|directory|ls|cat|grep|mkdir|rm\b|cp\b|mv\b)/i,
  process: /\b(process|kill|port|pid|memory|disk space|top|htop)\b/i,
  general: /.*/,
};

const CATEGORY_EXAMPLES: Record<CommandCategory, string> = {
  git: GIT_EXAMPLES,
  version: VERSION_EXAMPLES,
  npm: NPM_EXAMPLES,
  docker: DOCKER_EXAMPLES,
  file: FILE_EXAMPLES,
  process: PROCESS_EXAMPLES,
  general: "",
};

/** Trigger patterns for shouldHandle() */
const TRIGGER_PATTERNS = [
  /\bgit\b.*\b(command|how|to|status|log|diff|branch|stash|pull|push|fetch|reset|check|checkout|merge|clone|add|commit)\b/i,
  /\b(terminal|shell|bash|cmd)\b.*\b(command|run|execute|how|to)\b/i,
  /\b(run|execute)\b.*\b(command|script|terminal|shell)\b/i,
  /\b(node|npm|java|python|python3|docker|go|rust|rustc|ruby|php|pip)\b.*\b(version|--version|-v)\b/i,
  /\bversion\b.*\b(node|npm|java|python|docker|go|rust|ruby|php)\b/i,
  /\bcheck\b.*\b(node|npm|java|python|docker|go|rust|ruby|php)\b/i,
  /\bnpm\b.*\b(command|install|outdated|list|run|update|audit|how|to)\b/i,
  /\b(docker|ollama)\b.*\b(command|ps|images|logs|stop|start|run|how|to)\b/i,
  /\b(list files|find file|disk usage|folder size|large files|pwd|current directory)\b/i,
  /\b(running processes|kill process|port in use|what's on port|memory usage|disk space)\b/i,
];

// ─── CommandAgent Class ───────────────────────────────────────────

export class CommandAgent {

  shouldHandle(userMessage: string): boolean {
    for (const pattern of TRIGGER_PATTERNS) {
      if (pattern.test(userMessage)) {
        return true;
      }
    }
    return false;
  }

  buildMessages(userMessage: string): LLMMessage[] {
    const systemPrompt = this.buildPrompt(userMessage);
    return [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];
  }


  private detectCategory(userMessage: string): CommandCategory {
    const msg = userMessage.toLowerCase();
    
    // Check in priority order (more specific first)
    if (CATEGORY_PATTERNS.version.test(msg)) return "version";
    if (CATEGORY_PATTERNS.git.test(msg)) return "git";
    if (CATEGORY_PATTERNS.npm.test(msg)) return "npm";
    if (CATEGORY_PATTERNS.docker.test(msg)) return "docker";
    if (CATEGORY_PATTERNS.file.test(msg)) return "file";
    if (CATEGORY_PATTERNS.process.test(msg)) return "process";
    
    return "general";
  }

  private buildPrompt(userMessage: string): string {
    const category = this.detectCategory(userMessage);
    const categoryExamples = CATEGORY_EXAMPLES[category];
    
    // Order matters: rules → reference → expected format (LAST)
    return `${BASE_PROMPT}
            ${categoryExamples}
            ${EXPECTED_OUTPUT}`;
  }
}
