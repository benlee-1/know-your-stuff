export interface DossierSectionPromptContext {
  projectName: string;
  sectionTitle: string;
  sectionPrompt: string;
  briefMarkdown: string;
}

export function buildDossierSectionPrompt(ctx: DossierSectionPromptContext): string {
  return `
You are writing ONE section of an interview-prep "dossier" for the project "${ctx.projectName}". The section is: **${ctx.sectionTitle}**.

Section objective:
${ctx.sectionPrompt}

Ground every claim in the actual codebase:
1. Use \`list_dir\` to orient yourself.
2. Use \`grep\` to locate symbols, patterns, configuration.
3. Use \`read_file\` to confirm specifics before stating them.
4. **Cite file paths** (and line numbers when relevant) for every substantive claim.
5. If the codebase does not provide evidence for part of this section, write "not demonstrated in this repo" for that part. NEVER guess or invent facts, architecture, or scale that the code does not show.

Process (follow exactly):
1. Use list_dir/grep/read_file to gather the evidence you need for THIS section.
2. When you have enough, STOP calling tools and end your turn by writing the section body as plain Markdown.

Output rules:
- Your FINAL message must be ONLY the Markdown body for this one section — explore first, then write it as your last step. Do not end on a tool call.
- Do NOT include the "# ${ctx.sectionTitle}" header — it is added for you.
- Do NOT prefix the body with any narration about your process (no "I now have enough evidence", no "Here it is", no "Let me compile..."). Start directly with the section content.
- Be concise: tight prose or bullets a senior interviewer would respect. No preamble, no sign-off.
- If the codebase lacks evidence for part of this section, write "not demonstrated in this repo" for that part. Never invent.

Optional context (business brief):
${ctx.briefMarkdown.trim() ? ctx.briefMarkdown : "(No business brief available — work from the code only.)"}
`.trim();
}
