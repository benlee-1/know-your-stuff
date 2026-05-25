// One-off smoke test. Run: node --env-file=.env scripts/smoke.mjs
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const model = anthropic(process.env.DEFAULT_MODEL ?? "claude-sonnet-4-6");

console.log("→ asking the model a trivial question…");
const r = await generateText({
  model,
  prompt: "In one short sentence, what is 2+2?",
});
console.log("← reply:", r.text);
console.log("✓ key works");
