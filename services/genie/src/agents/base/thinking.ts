import { BuiltInPlanner } from '@iqai/adk'

// Gemini 2.5 Flash supports thinking budgets up to 24,576 tokens.
// DevDrop intentionally uses the maximum budget for every agent so
// generation favors deeper planning, self-review, and code quality over speed.
export const MAX_GEMINI_THINKING_BUDGET = 24576

export const createHighThinkingPlanner = () =>
  new BuiltInPlanner({
    thinkingConfig: {
      thinkingBudget: MAX_GEMINI_THINKING_BUDGET,
      includeThinking: false,
    },
  })
