import { anthropic } from "@ai-sdk/anthropic";

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL ?? "claude-sonnet-4-6";

/**
 * Resolve an Anthropic Claude model.
 *
 * Requires ANTHROPIC_API_KEY in the environment. Throws a clear error if missing
 * so the chat UI can surface "configure your API key" rather than a generic 401.
 */
export function getModel(modelId?: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env — see https://console.anthropic.com/settings/keys.",
    );
  }
  return anthropic(modelId ?? DEFAULT_MODEL);
}

export const SUGGESTED_MODELS = [
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-haiku-4-5",
] as const;
