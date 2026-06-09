import { describe, it, expect } from "vitest";
import { citedPaths } from "@/lib/cited-paths";

describe("citedPaths", () => {
  it("extracts slashed source paths, with or without :line", () => {
    expect(citedPaths("see `src/db/schema.ts:42` and lib/ai.ts")).toEqual(
      expect.arrayContaining(["src/db/schema.ts", "lib/ai.ts"]),
    );
  });

  it("extracts root-level build/config files with no slash", () => {
    const got = citedPaths("defined in build.gradle and pom.xml and package.json");
    expect(got).toEqual(expect.arrayContaining(["build.gradle", "pom.xml", "package.json"]));
  });

  it("extracts paths wrapped in markdown emphasis", () => {
    expect(citedPaths("**src/main/App.java** and _config.yml_")).toEqual(
      expect.arrayContaining(["src/main/App.java", "config.yml"]),
    );
  });

  it("strips trailing sentence punctuation", () => {
    expect(citedPaths("It lives in config.json.")).toContain("config.json");
  });

  it("ignores prose that is not a real source/config file", () => {
    const got = citedPaths("for example, e.g. a ratio like 1/2.5 or version 1.2");
    expect(got).not.toContain("e.g");
    expect(got).not.toContain("1/2.5");
    expect(got).not.toContain("1.2");
  });

  it("dedupes", () => {
    expect(citedPaths("lib/ai.ts and again lib/ai.ts")).toEqual(["lib/ai.ts"]);
  });
});
