import { tool } from "ai";
import { z } from "zod";
import {
  GrepInput,
  ListDirInput,
  ReadFileInput,
  grep,
  listDir,
  readFile,
} from "./codebase-tools";

/**
 * Build AI SDK v6 tool definitions scoped to a single project root.
 *
 * Pass the resulting object as `tools` to `streamText` / `generateText`.
 * `enable` chooses which tools the model sees — Business mode usually omits `grep`.
 */
export function makeCodebaseTools(
  root: string,
  opts: { enable?: { list_dir?: boolean; read_file?: boolean; grep?: boolean } } = {},
) {
  const enable = {
    list_dir: opts.enable?.list_dir ?? true,
    read_file: opts.enable?.read_file ?? true,
    grep: opts.enable?.grep ?? true,
  };

  const tools: Record<string, ReturnType<typeof tool>> = {};

  if (enable.list_dir) {
    tools.list_dir = tool({
      description:
        "List directory entries inside the project. Returns name/type/size; skips node_modules, .git, .next, etc.",
      inputSchema: ListDirInput,
      execute: async (input) => listDir(root, input),
    });
  }

  if (enable.read_file) {
    tools.read_file = tool({
      description:
        "Read a file from the project. Returns content (utf-8) up to maxBytes (default 200KB). Reports truncated:true when the file was longer than maxBytes.",
      inputSchema: ReadFileInput,
      execute: async (input) => readFile(root, input),
    });
  }

  if (enable.grep) {
    tools.grep = tool({
      description:
        "Search file contents for a substring across the project. Returns hits with path, line number, and preview.",
      inputSchema: GrepInput,
      execute: async (input) => grep(root, input),
    });
  }

  return tools;
}

// Re-exported zod input schemas so tests can validate without depending on `ai`.
export { ListDirInput, ReadFileInput, GrepInput };

// Stable shape — useful for typing tool-call rendering on the client.
export const CodebaseToolNameSchema = z.enum(["list_dir", "read_file", "grep"]);
export type CodebaseToolName = z.infer<typeof CodebaseToolNameSchema>;
