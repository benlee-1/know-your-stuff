"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import {
  loadWalkthroughState,
  generateSectionQuestion,
  submitWalkthroughAnswer,
  type WalkthroughState,
} from "@/app/actions/walkthrough";

type Phase =
  | { kind: "idle" }
  | { kind: "question"; question: string; idealAnswer: string }
  | {
      kind: "feedback";
      question: string;
      idealAnswer: string;
      grade: { score: number; rationale: string; missedPoints: string[] };
      reveal: boolean;
      advance: boolean;
    };

export function WalkthroughRunner({
  projectId,
  initial,
}: {
  projectId: string;
  initial: WalkthroughState;
}) {
  const [state, setState] = useState(initial);
  const [currentId, setCurrentId] = useState(initial.currentSectionId);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [answer, setAnswer] = useState("");
  const [asked, setAsked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const passedIds = new Set(state.progress.filter((p) => p.passed).map((p) => p.sectionId));
  const missingIds = new Set(state.missingSectionIds);
  const section = state.sections.find((s) => s.id === currentId) ?? null;

  function isDone(id: string): boolean {
    const r = state.progress.find((p) => p.sectionId === id);
    return !!r && (r.passed || r.attempts >= 2);
  }
  function statusGlyph(id: string): string {
    if (missingIds.has(id)) return "—";
    if (passedIds.has(id)) return "✓";
    if (isDone(id)) return "~";
    if (id === currentId) return "▸";
    return "○";
  }

  function ask() {
    if (!currentId) return;
    setError(null);
    startTransition(async () => {
      try {
        const q = await generateSectionQuestion(projectId, currentId, asked);
        setAsked((a) => [...a, q.question]);
        setPhase({ kind: "question", question: q.question, idealAnswer: q.idealAnswer });
        setAnswer("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate a question");
      }
    });
  }

  function submit() {
    if (phase.kind !== "question" || !currentId || !answer.trim()) return;
    const { question, idealAnswer } = phase;
    setError(null);
    startTransition(async () => {
      try {
        const { grade, decision } = await submitWalkthroughAnswer({
          projectId,
          sectionId: currentId,
          question,
          idealAnswer,
          userAnswer: answer,
        });
        setPhase({ kind: "feedback", question, idealAnswer, grade, reveal: decision.reveal, advance: decision.advance });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to grade your answer");
      }
    });
  }

  function continueAfterFeedback() {
    if (phase.kind !== "feedback") return;
    setError(null);
    if (phase.advance) {
      startTransition(async () => {
        try {
          const fresh = await loadWalkthroughState(projectId); // server-authoritative
          setState(fresh);
          setCurrentId(fresh.currentSectionId);
          setAsked([]);
          setPhase({ kind: "idle" });
          setAnswer("");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to load the next section");
        }
      });
    } else {
      // reveal path: ask the confirming question (server treats the next submit as attempt 2)
      ask();
    }
  }

  if (!state.hasDossier) {
    return (
      <p className="text-sm text-muted-foreground">
        No dossier yet.{" "}
        <Link className="underline" href={`/chat/${projectId}/dossier`}>Generate the dossier</Link>{" "}
        first — the walkthrough is built from it.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2 text-xs">
        {state.sections.map((s) => (
          <li key={s.id} className="rounded border border-[hsl(var(--border))] px-2 py-1">
            {statusGlyph(s.id)} {s.title}
          </li>
        ))}
      </ol>
      {missingIds.size > 0 && (
        <p className="text-xs text-muted-foreground">
          Sections marked — are empty in the dossier and are skipped.{" "}
          <Link className="underline" href={`/chat/${projectId}/dossier`}>Regenerate them</Link> to walk them.
        </p>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {!currentId ? (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Walkthrough complete 🎉</h2>
          <p className="text-sm text-muted-foreground">
            You worked through every walkable section. Best scores are saved per section.
          </p>
        </div>
      ) : !section ? null : (
        <div className="space-y-4">
          <article>
            <h2 className="mb-2 text-lg font-semibold">{section.title}</h2>
            {section.body ? (
              <Markdown>{section.body}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">This section is empty in the dossier.</p>
            )}
          </article>

          {section.body && phase.kind === "idle" && (
            <button onClick={ask} disabled={pending}
              className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50">
              {pending ? "…" : "Check my understanding"}
            </button>
          )}

          {phase.kind === "question" && (
            <div className="space-y-3">
              <p className="font-medium">{phase.question}</p>
              <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={pending}
                className="h-40 w-full rounded-md border border-[hsl(var(--border))] bg-transparent p-3 text-sm outline-none focus:border-[hsl(var(--primary))] disabled:opacity-60"
                placeholder="Answer in your own words…" />
              <button onClick={submit} disabled={pending || !answer.trim()}
                className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50">
                {pending ? "Grading…" : "Submit"}
              </button>
            </div>
          )}

          {phase.kind === "feedback" && (
            <div className="space-y-3">
              <p className="text-sm">Score: <strong>{Math.round(phase.grade.score * 100)}%</strong></p>
              <p className="text-sm text-muted-foreground">{phase.grade.rationale}</p>
              {phase.grade.missedPoints.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-muted-foreground">
                  {phase.grade.missedPoints.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              )}
              {phase.reveal && (
                <div className="rounded-md border border-[hsl(var(--border))] p-3">
                  <p className="text-xs uppercase text-muted-foreground">Ideal answer</p>
                  <p className="text-sm">{phase.idealAnswer}</p>
                </div>
              )}
              <button onClick={continueAfterFeedback} disabled={pending}
                className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50">
                {pending ? "…" : phase.advance ? "Continue →" : "Try the confirming question"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
