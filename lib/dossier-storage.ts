import fs from "node:fs";
import path from "node:path";

export const DOSSIER_DIR = ".know-your-stuff";
export const DOSSIER_FILENAME = "dossier.md";

export function dossierPath(projectRoot: string): string {
  return path.join(projectRoot, DOSSIER_DIR, DOSSIER_FILENAME);
}

export function loadDossierSync(projectRoot: string): string {
  try {
    return fs.readFileSync(dossierPath(projectRoot), "utf8");
  } catch {
    return "";
  }
}

export function saveDossierSync(projectRoot: string, markdown: string): void {
  // Refuse to write through a pre-existing symlink at the dir. An untrusted
  // interview-prep repo could ship `.know-your-stuff -> ~/.config` and turn
  // dossier saves into an arbitrary-write primitive. lstat detects the symlink
  // without following it. (Mirrors saveBriefSync.)
  const dir = path.join(projectRoot, DOSSIER_DIR);
  try {
    if (fs.lstatSync(dir).isSymbolicLink()) {
      throw new Error(
        `Refusing to write through symlink at ${DOSSIER_DIR}/. Delete or replace it before saving the dossier.`,
      );
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dossierPath(projectRoot), markdown, "utf8");
}
