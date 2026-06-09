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

Output rules:
- Return ONLY the Markdown body for this one section. Do NOT include the "# ${ctx.sectionTitle}" header — it is added for you.
- Be concise: tight prose or bullets a senior interviewer would respect. No preamble, no sign-off.

Optional context (business brief):
${ctx.briefMarkdown.trim() ? ctx.briefMarkdown : "(No business brief available — work from the code only.)"}
`.trim();
}
