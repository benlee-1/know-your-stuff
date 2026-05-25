"use server";

import { revalidatePath } from "next/cache";
import {
  addProjectRaw,
  deleteProjectRaw,
  getProjectRaw,
  listProjectsRaw,
  setActiveProjectRaw,
} from "@/lib/projects";
import type { Project } from "@/lib/schema";

export async function listProjects(): Promise<Project[]> {
  return listProjectsRaw();
}

export async function getProject(id: string): Promise<Project | null> {
  return getProjectRaw(id);
}

export async function addProject(input: { name: string; rootPath: string }): Promise<Project> {
  const p = addProjectRaw(input);
  revalidatePath("/");
  return p;
}

export async function deleteProject(id: string): Promise<void> {
  deleteProjectRaw(id);
  revalidatePath("/");
}

export async function setActiveProject(id: string): Promise<void> {
  setActiveProjectRaw(id);
}
