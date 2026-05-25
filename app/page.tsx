import Link from "next/link";
import { listProjects } from "./actions/projects";
import { AddProjectForm } from "@/components/add-project-form";

export default async function HomePage() {
  const projects = await listProjects();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Know Your Stuff</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Point at a local codebase. Build business + technical fluency. Quiz yourself.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Your projects
        </h2>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet. Add one below.</p>
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
            {projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/chat/${p.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-[hsl(var(--muted))]"
                >
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.rootPath}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Add a project
        </h2>
        <AddProjectForm />
      </section>
    </main>
  );
}
