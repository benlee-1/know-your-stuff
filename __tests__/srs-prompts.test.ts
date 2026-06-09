import { describe, it, expect } from "vitest";
import { CardBatchSchema, buildCardGenPrompt } from "@/lib/prompts/srs";

describe("CardBatchSchema", () => {
  it("validates cards and defaults to empty", () => {
    expect(CardBatchSchema.parse({}).cards).toEqual([]);
    expect(CardBatchSchema.parse({ cards: [{ front: "q", back: "a" }] }).cards).toHaveLength(1);
    expect(() => CardBatchSchema.parse({ cards: [{ front: "q" }] })).toThrow();
  });
});
describe("buildCardGenPrompt", () => {
  it("includes section title, body, and the requested count", () => {
    const p = buildCardGenPrompt({ sectionTitle: "Data Model", sectionBody: "Entities: User, Plan.", count: 6 });
    expect(p).toContain("Data Model");
    expect(p).toContain("Entities: User, Plan.");
    expect(p).toContain("6");
  });
});
