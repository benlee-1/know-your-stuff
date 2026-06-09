// Extension allowlist keeps prose tokens (e.g. "e.g", "1/2.5", "version 1.2")
// out while catching real source/config files — including root-level files with
// no slash and paths wrapped in markdown emphasis (since we scan tokens globally
// rather than anchoring on a leading boundary char).
const CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|java|kt|kts|gradle|xml|json|ya?ml|md|sql|properties|sh|rb|go|rs|py|toml|css|scss|html|prisma|proto|lock|gitignore|dockerignore)$/i;

/**
 * Extract file-path-looking tokens from prose/markdown for the acceptance gate.
 * Bias: avoid false positives (which would spuriously fail a valid run) while
 * still catching the path forms an LLM emits — bold-wrapped and root-level files.
 */
export function citedPaths(markdown: string): string[] {
  const out = new Set<string>();
  for (const raw of markdown.match(/[\w./-]+/g) ?? []) {
    const p = raw.replace(/^_+/, "").replace(/[_./-]+$/, ""); // strip markdown emphasis underscores + trailing punctuation
    if (CODE_EXT.test(p)) out.add(p);
  }
  return [...out];
}
