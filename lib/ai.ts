import { gateway } from "@ai-sdk/gateway";

export const DEFAULT_MODEL = process.env.DEFAULT_MODEL ?? "anthropic/claude-sonnet-4-6";

/**
 * Resolve a Vercel AI Gateway model.
 *
 * Requires AI_GATEWAY_API_KEY in the environment. Throws a clear error if missing
 * so the chat UI can surface "configure your gateway key" rather than a generic 401.
 */
export function getModel(modelId?: string) {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new Error(
      "AI_GATEWAY_API_KEY is not set. Add it to .env.local — see https://vercel.com/dashboard (AI Gateway).",
    );
  }
  return gateway(modelId ?? DEFAULT_MODEL);
}

export const SUGGESTED_MODELS = [
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-opus-4-7",
  "anthropic/claude-haiku-4-5",
  "openai/gpt-4o",
  "openai/gpt-4o-mini",
] as const;
