/**
 * CommandAgent tests — verifies trigger patterns and prompt building.
 */

import { CommandAgent } from "../../src/agent/CommandAgent";

describe("CommandAgent", () => {
  let agent: CommandAgent;

  beforeEach(() => {
    agent = new CommandAgent();
  });

  describe("shouldHandle", () => {
    describe("git commands", () => {
      it.each([
        "git command to check status",
        "how to git status",
        "git log command",
        "git diff how to use",
        "git branch command please",
        "git stash how to",
        "git pull command",
        "git push how to",
        "git fetch command",
        "git reset how",
        "git checkout command",
        "git merge how to",
        "git clone command",
        "git add how",
        "git commit command",
      ])("returns true for: %s", (input) => {
        expect(agent.shouldHandle(input)).toBe(true);
      });
    });

    describe("version checks", () => {
      it.each([
        "node version",
        "npm version",
        "java version",
        "python version",
        "python3 version",
        "docker version",
        "go version",
        "rust version",
        "rustc version",
        "ruby version",
        "php version",
        "check node version",
        "version of npm",
        "what is java --version",
      ])("returns true for: %s", (input) => {
        expect(agent.shouldHandle(input)).toBe(true);
      });
    });

    describe("npm commands", () => {
      it.each([
        "npm command to install",
        "npm install how to",
        "npm outdated command",
        "npm list command",
        "npm run how to",
        "npm update command",
        "npm audit how",
      ])("returns true for: %s", (input) => {
        expect(agent.shouldHandle(input)).toBe(true);
      });
    });

    describe("docker commands", () => {
      it.each([
        "docker command to list",
        "docker ps how to",
        "docker images command",
        "docker logs how",
        "docker stop command",
        "docker start how to",
        "docker run command",
      ])("returns true for: %s", (input) => {
        expect(agent.shouldHandle(input)).toBe(true);
      });
    });

    describe("terminal/shell commands", () => {
      it.each([
        "terminal command to run",
        "shell command how to",
        "bash command execute",
        "cmd command to run",
        "run command in terminal",
        "execute shell script",
      ])("returns true for: %s", (input) => {
        expect(agent.shouldHandle(input)).toBe(true);
      });
    });

    describe("file operations", () => {
      it.each([
        "list files",
        "find file",
        "disk usage",
        "folder size",
        "large files",
        "pwd",
        "current directory",
      ])("returns true for: %s", (input) => {
        expect(agent.shouldHandle(input)).toBe(true);
      });
    });

    describe("process operations", () => {
      it.each([
        "running processes",
        "kill process",
        "port in use",
        "what's on port",
        "memory usage",
        "disk space",
      ])("returns true for: %s", (input) => {
        expect(agent.shouldHandle(input)).toBe(true);
      });
    });

    describe("non-command queries (should NOT handle)", () => {
      it.each([
        "explain this code",
        "what is a promise",
        "how does React work",
        "fix this bug",
        "refactor this function",
        "write a test",
        "create a new component",
        "git", // just "git" without action word
        "npm", // just "npm" without action word
      ])("returns false for: %s", (input) => {
        expect(agent.shouldHandle(input)).toBe(false);
      });
    });
  });

  describe("buildMessages", () => {
    it("returns array with system and user messages", () => {
      const messages = agent.buildMessages("git command to check status");
      
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("user");
      expect(messages[1].content).toBe("git command to check status");
    });

    it("includes BASE_PROMPT rules in system message", () => {
      const messages = agent.buildMessages("git status");
      const systemPrompt = messages[0].content;
      
      expect(systemPrompt).toContain("terminal command assistant");
      expect(systemPrompt).toContain("```bash");
      expect(systemPrompt).toContain("RULES");
    });

    it("includes EXPECTED_OUTPUT at end of system message", () => {
      const messages = agent.buildMessages("git status");
      const systemPrompt = messages[0].content;
      
      expect(systemPrompt).toContain("Example:");
      expect(systemPrompt).toContain("Follow this format exactly");
    });

    describe("category-specific examples", () => {
      it("includes GIT_EXAMPLES for git queries", () => {
        const messages = agent.buildMessages("git command to check status");
        const systemPrompt = messages[0].content;
        
        expect(systemPrompt).toContain("GIT REFERENCE");
        expect(systemPrompt).toContain("status");
        expect(systemPrompt).toContain("log --oneline");
      });

      it("includes VERSION_EXAMPLES for version queries", () => {
        const messages = agent.buildMessages("node version");
        const systemPrompt = messages[0].content;
        
        expect(systemPrompt).toContain("VERSION REFERENCE");
        expect(systemPrompt).toContain("node --version");
      });

      it("includes NPM_EXAMPLES for npm queries", () => {
        const messages = agent.buildMessages("npm command to install");
        const systemPrompt = messages[0].content;
        
        expect(systemPrompt).toContain("NPM REFERENCE");
        expect(systemPrompt).toContain("install");
        expect(systemPrompt).toContain("outdated");
      });

      it("includes DOCKER_EXAMPLES for docker queries", () => {
        const messages = agent.buildMessages("docker command to list containers");
        const systemPrompt = messages[0].content;
        
        expect(systemPrompt).toContain("DOCKER REFERENCE");
        expect(systemPrompt).toContain("ps");
        expect(systemPrompt).toContain("images");
      });

      it("includes FILE_EXAMPLES for file operation queries", () => {
        const messages = agent.buildMessages("list files in directory");
        const systemPrompt = messages[0].content;
        
        expect(systemPrompt).toContain("FILE REFERENCE");
        expect(systemPrompt).toContain("ls -la");
        expect(systemPrompt).toContain("find");
      });

      it("includes PROCESS_EXAMPLES for process queries", () => {
        const messages = agent.buildMessages("kill process");
        const systemPrompt = messages[0].content;
        
        expect(systemPrompt).toContain("PROCESS REFERENCE");
        expect(systemPrompt).toContain("ps aux");
        expect(systemPrompt).toContain("kill");
      });
    });

    it("prompt ends with expected output format (recency effect)", () => {
      const messages = agent.buildMessages("git status");
      const systemPrompt = messages[0].content;
      
      // EXPECTED_OUTPUT should be at the end
      const lastSection = systemPrompt.slice(-200);
      expect(lastSection).toContain("Follow this format exactly");
    });
  });
});
