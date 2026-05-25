import { tool, type ToolSet } from "ai";
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

  const list_dir = enable.list_dir
    ? tool({
        description:
          "List directory entries inside the project. Returns name/type/size; skips node_modules, .git, .next, etc.",
        inputSchema: ListDirInput,
        execute: async (input: ListDirInput) => listDir(root, input),
      })
    : undefined;

  const read_file = enable.read_file
    ? tool({
        description:
          "Read a file from the project. Returns content (utf-8) up to maxBytes (default 200KB). Reports truncated:true when the file was longer than maxBytes.",
        inputSchema: ReadFileInput,
        execute: async (input: ReadFileInput) => readFile(root, input),
      })
    : undefined;

  const grepTool = enable.grep
    ? tool({
        description:
          "Search file contents for a substring across the project. Returns hits with path, line number, and preview.",
        inputSchema: GrepInput,
        execute: async (input: GrepInput) => grep(root, input),
      })
    : undefined;

  const out: ToolSet = {};
  if (list_dir) out.list_dir = list_dir as ToolSet[string];
  if (read_file) out.read_file = read_file as ToolSet[string];
  if (grepTool) out.grep = grepTool as ToolSet[string];
  return out;
}

// Re-exported zod input schemas so tests can validate without depending on `ai`.
export { ListDirInput, ReadFileInput, GrepInput };

// Stable shape — useful for typing tool-call rendering on the client.
export const CodebaseToolNameSchema = z.enum(["list_dir", "read_file", "grep"]);
export type CodebaseToolName = z.infer<typeof CodebaseToolNameSchema>;
