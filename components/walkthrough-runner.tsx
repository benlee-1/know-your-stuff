"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import {
  generateSectionQuestion,
  submitWalkthroughAnswer,
  type WalkthroughState,
} from "@/app/actions/walkthrough";

type Phase =
  | { kind: "idle" }
  | { kind: "question"; question: string; idealAnswer: string; attempt: number }
  | {
      kind: "feedback";
      question: string;
      idealAnswer: string;
      attempt: number;
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

  const isDone = (sectionId: string): boolean => {
    const row = state.progress.find((p) => p.sectionId === sectionId);
    return !!row && (row.passed || row.attempts >= 2);
  };

  const section = state.sections.find((s) => s.id === currentId) ?? null;

  function statusGlyph(sectionId: string): string {
    if (passedIds.has(sectionId)) return "✓";
    if (isDone(sectionId)) return "~"; // completed with reveal (attempts>=2, not passed)
    if (sectionId === currentId) return "▸";
    return "○";
  }

  function ask() {
    if (!currentId) return;
    setError(null);
    startTransition(async () => {
      try {
        const q = await generateSectionQuestion(projectId, currentId, asked);
        setAsked((a) => [...a, q.question]);
        setPhase({ kind: "question", question: q.question, idealAnswer: q.idealAnswer, attempt: 1 });
        setAnswer("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate a question");
      }
    });
  }

  function submit() {
    if (phase.kind !== "question" || !currentId || !answer.trim()) return;
    const { question, idealAnswer, attempt } = phase;
    setError(null);
    startTransition(async () => {
      try {
        const { grade, decision } = await submitWalkthroughAnswer({
          projectId,
          sectionId: currentId,
          question,
          idealAnswer,
          userAnswer: answer,
          attemptNumber: attempt,
        });
        const rows = state.progress.filter((p) => p.sectionId !== currentId);
        setState({
          ...state,
          progress: [
            ...rows,
            {
              id: "local",
              projectId,
              sectionId: currentId,
              passed: decision.passed || passedIds.has(currentId),
              bestScore: grade.score,
              attempts: attempt,
              updatedAt: Date.now(),
            },
          ],
        });
        setPhase({
          kind: "feedback",
          question,
          idealAnswer,
          attempt,
          grade,
          reveal: decision.reveal,
          advance: decision.advance,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to grade your answer");
      }
    });
  }

  function continueAfterFeedback() {
    if (phase.kind !== "feedback") return;
    if (phase.advance) {
      const order = state.sections.map((s) => s.id);
      const next = order.find((id) => id !== currentId && !isDone(id)) ?? null;
      setCurrentId(next);
      setAsked([]);
      setPhase({ kind: "idle" });
      setAnswer("");
    } else {
      startTransition(async () => {
        try {
          const q = await generateSectionQuestion(projectId, currentId!, asked);
          setAsked((a) => [...a, q.question]);
          setPhase({ kind: "question", question: q.question, idealAnswer: q.idealAnswer, attempt: 2 });
          setAnswer("");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to generate a question");
        }
      });
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

      {error && <p className="text-sm text-red-500">{error}</p>}

      {!currentId ? (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Walkthrough complete 🎉</h2>
          <p className="text-sm text-muted-foreground">
            You worked through all {state.sections.length} sections. Best scores are saved per section.
          </p>
        </div>
      ) : !section ? null : (
        <div className="space-y-4">
          <article>
            <h2 className="mb-2 text-lg font-semibold">{section.title}</h2>
            {section.body ? (
              <Markdown>{section.body}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">
                This section is empty in the dossier.{" "}
                <Link className="underline" href={`/chat/${projectId}/dossier`}>Regenerate it</Link>{" "}
                to walk it.
              </p>
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
