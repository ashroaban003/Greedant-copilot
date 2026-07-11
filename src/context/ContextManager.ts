/**
 * ContextManager - Central hub for gathering context from various providers.
 *
 * Currently supports:
 * - SelectionProvider: Editor selection/cursor context
 *
 * Future providers can be added here (e.g., FileProvider, WorkspaceProvider, etc.)
 */

import { SelectionProvider } from './providers/SelectionProvider';

/** General instructions for code assistance (concise for local models) */
const CODE_ASSISTANT_INSTRUCTIONS = `## Instructions
- No overtalk or unnecessary or line-by-line explanations.
- Dont repeat selected code back to user
- Show only changed lines or minimal diffs for code fixes
- Explain/Edit should be provided with core code snippet.
- If context is insufficient, report what's missing`;

export class ContextManager {
  private selectionProvider: SelectionProvider;

  constructor(selectionProvider: SelectionProvider) {
    this.selectionProvider = selectionProvider;
  }

  /**
   * Get the current editor selection context.
   */
  getSelectionContext(): string | null {
    return this.selectionProvider.getContext();
  }

  /**
   * Build enhanced system prompt with instructions and context.
   */
  buildPromptWithContext(basePrompt: string): string {
    const selectionContext = this.getSelectionContext();

    let prompt = `${basePrompt}\n\n${CODE_ASSISTANT_INSTRUCTIONS}`;

    if (selectionContext) {
      prompt += `\n\n---\n\n${selectionContext}`;
    }

    return prompt;
  }
}
