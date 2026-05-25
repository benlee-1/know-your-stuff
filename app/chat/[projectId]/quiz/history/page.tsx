import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/app/actions/projects";
import { listProjectHistory } from "@/app/actions/quiz";

const TRUNC = 120;

function truncate(s: string, n = TRUNC): { head: string; rest: string | null } {
  if (s.length <= n) return { head: s, rest: null };
  return { head: s.slice(0, n).trimEnd() + "…", rest: s };
}

function pct(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

export default async function QuizHistoryPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const attempts = await listProjectHistory(projectId);

  const total = attempts.length;
  const avg = total ? attempts.reduce((s, a) => s + a.score, 0) / total : 0;
  const business = attempts.filter((a) => a.focus === "business");
  const technical = attempts.filter((a) => a.focus === "technical");
  const avgBusiness = business.length
    ? business.reduce((s, a) => s + a.score, 0) / business.length
    : null;
  const avgTechnical = technical.length
    ? technical.reduce((s, a) => s + a.score, 0) / technical.length
    : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href={`/chat/${projectId}`}
            className="text-xs text-muted-foreground hover:underline"
          >
            ← back to chat
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Quiz History</h1>
          <p className="text-sm text-muted-foreground">
            {project.name} — {project.rootPath}
          </p>
        </div>
        <Link
          href={`/chat/${projectId}/quiz`}
          className="text-sm text-muted-foreground hover:underline"
        >
          Take a quiz →
        </Link>
      </header>

      {total === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p className="mb-2">No quiz attempts yet.</p>
          <p>
            Head to the{" "}
            <Link href={`/chat/${projectId}/quiz`} className="underline">
              quiz
            </Link>{" "}
            and answer some questions to start tracking your progress.
          </p>
        </div>
      ) : (
        <>
          <section className="mb-6 grid grid-cols-3 gap-3">
            <div className="rounded-md border p-4">
              <div className="text-xs text-muted-foreground">Overall avg</div>
              <div className="text-2xl font-semibold">{pct(avg)}</div>
              <div className="text-xs text-muted-foreground">
                {total} attempt{total === 1 ? "" : "s"}
              </div>
            </div>
            <div className="rounded-md border p-4">
              <div className="text-xs text-muted-foreground">Business avg</div>
              <div className="text-2xl font-semibold">
                {avgBusiness == null ? "—" : pct(avgBusiness)}
              </div>
              <div className="text-xs text-muted-foreground">
                {business.length} attempt{business.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="rounded-md border p-4">
              <div className="text-xs text-muted-foreground">Technical avg</div>
              <div className="text-2xl font-semibold">
                {avgTechnical == null ? "—" : pct(avgTechnical)}
              </div>
              <div className="text-xs text-muted-foreground">
                {technical.length} attempt{technical.length === 1 ? "" : "s"}
              </div>
            </div>
          </section>

          <ul className="space-y-3">
            {attempts.map((a) => {
              const missed: string[] = JSON.parse(a.missedPointsJson || "[]");
              const { head, rest } = truncate(a.prompt);
              return (
                <li key={a.id} className="rounded-md border p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 font-medium " +
                        (a.score >= 0.8
                          ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                          : a.score >= 0.5
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200"
                            : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200")
                      }
                    >
                      {pct(a.score)}
                    </span>
                    <span className="rounded-full border px-2 py-0.5 capitalize text-muted-foreground">
                      {a.focus}
                    </span>
                    <span className="text-muted-foreground">{formatDate(a.createdAt)}</span>
                  </div>

                  {rest ? (
                    <details className="mb-3">
                      <summary className="cursor-pointer text-sm font-medium">
                        {head}{" "}
                        <span className="text-xs font-normal text-muted-foreground underline">
                          expand
                        </span>
                      </summary>
                      <div className="mt-2 whitespace-pre-wrap text-sm">{rest}</div>
                    </details>
                  ) : (
                    <div className="mb-3 text-sm font-medium">{head}</div>
                  )}

                  <div className="mb-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Your answer
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm">{a.userAnswer}</div>
                  </div>

                  <div className="mb-3">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Rationale
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm">{a.rationale}</div>
                  </div>

                  {missed.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Missed points
                      </div>
                      <ul className="mt-1 list-disc pl-5 text-sm">
                        {missed.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
