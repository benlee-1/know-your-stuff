"use server";

import { generateText } from "ai";
import { getProjectRaw } from "@/lib/projects";
import {
  buildBriefGenerationPrompt,
  collectBriefSeed,
  loadBriefSync,
  saveBriefSync,
} from "@/lib/brief";
import { getModel } from "@/lib/ai";

export async function loadBrief(projectId: string): Promise<string> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  return loadBriefSync(p.rootPath);
}

export async function saveBrief(projectId: string, markdown: string): Promise<void> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");
  saveBriefSync(p.rootPath, markdown);
}

async function generateBriefMarkdown(rootPath: string, name: string): Promise<string> {
  const seed = collectBriefSeed(rootPath);
  const prompt = buildBriefGenerationPrompt(name, seed);
  const res = await generateText({
    model: getModel(),
    prompt,
  });
  return res.text.trim();
}

export async function generateBrief(
  projectId: string,
  opts: { force?: boolean } = {},
): Promise<string> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");

  const existing = loadBriefSync(p.rootPath);
  if (existing.trim() && !opts.force) return existing;

  const markdown = await generateBriefMarkdown(p.rootPath, p.name);
  saveBriefSync(p.rootPath, markdown);
  return markdown;
}

export async function previewBriefGeneration(
  projectId: string,
): Promise<{ existing: string; generated: string }> {
  const p = getProjectRaw(projectId);
  if (!p) throw new Error("Project not found");

  const existing = loadBriefSync(p.rootPath);
  const generated = await generateBriefMarkdown(p.rootPath, p.name);
  return { existing, generated };
}
