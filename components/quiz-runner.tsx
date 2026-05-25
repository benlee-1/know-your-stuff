"use client";

import { useState, useTransition } from "react";
import {
  generateQuizBatch,
  submitQuizAnswer,
} from "@/app/actions/quiz";
import type { QuizAttempt, QuizItem } from "@/lib/schema";

type GradedItem = { item: QuizItem; attempt: QuizAttempt | null };

export function QuizRunner({ projectId }: { projectId: string }) {
  const [focus, setFocus] = useState<"business" | "technical">("technical");
  const [count, setCount] = useState(5);
  const [batch, setBatch] = useState<GradedItem[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function startBatch() {
    setError(null);
    setBatch([]);
    setCurrentIdx(0);
    setAnswer("");
    startTransition(async () => {
      try {
        const items = await generateQuizBatch({ projectId, focus, count });
        setBatch(items.map((item) => ({ item, attempt: null })));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to generate quiz");
      }
    });
  }

  function submit() {
    if (!batch[currentIdx] || !answer.trim()) return;
    setError(null);
    const itemId = batch[currentIdx].item.id;
    startTransition(async () => {
      try {
        const attempt = await submitQuizAnswer({
          quizItemId: itemId,
          userAnswer: answer,
        });
        setBatch((prev) =>
          prev.map((g, i) => (i === currentIdx ? { ...g, attempt } : g)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to grade answer");
      }
    });
  }

  function next() {
    setCurrentIdx((i) => i + 1);
    setAnswer("");
  }

  const current = batch[currentIdx];
  const done = batch.length > 0 && currentIdx >= batch.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-[hsl(var(--border))] p-4">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Focus</label>
          <select
            value={focus}
            onChange={(e) => setFocus(e.target.value as "business" | "technical")}
            className="rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-1.5 text-sm"
          >
            <option value="business">Business</option>
            <option value="technical">Technical</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Questions</label>
          <input
            type="number"
            min={1}
            max={10}
            value={count}
            onChange={(e) => setCount(Number(e.target.value) || 5)}
            className="w-20 rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={startBatch}
          disabled={pending}
          className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
        >
          {pending && batch.length === 0 ? "Generating…" : "New quiz"}
        </button>
        {batch.length > 0 && (
          <span className="text-sm text-muted-foreground">
            Question {Math.min(currentIdx + 1, batch.length)} of {batch.length}
          </span>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {current && !done && (
        <div className="space-y-4">
          <div className="rounded-md border border-[hsl(var(--border))] p-4">
            <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
              Question
            </div>
            <div className="text-base">{current.item.prompt}</div>
          </div>

          {!current.attempt ? (
            <>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer…"
                className="h-32 w-full rounded-md border border-[hsl(var(--border))] bg-transparent p-3 text-sm outline-none focus:border-[hsl(var(--primary))]"
              />
              <button
                onClick={submit}
                disabled={pending || !answer.trim()}
                className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
              >
                {pending ? "Grading…" : "Submit answer"}
              </button>
            </>
          ) : (
            <Grading attempt={current.attempt} idealAnswer={current.item.idealAnswer} onNext={next} />
          )}
        </div>
      )}

      {done && (
        <div className="rounded-md border border-[hsl(var(--border))] p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">Batch complete.</p>
          <p className="text-2xl font-medium">
            Average:{" "}
            {(
              (batch.reduce((s, g) => s + (g.attempt?.score ?? 0), 0) / batch.length) *
              100
            ).toFixed(0)}
            %
          </p>
        </div>
      )}
    </div>
  );
}

function Grading({
  attempt,
  idealAnswer,
  onNext,
}: {
  attempt: QuizAttempt;
  idealAnswer: string;
  onNext: () => void;
}) {
  const missed: string[] = JSON.parse(attempt.missedPointsJson || "[]");
  return (
    <div className="space-y-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4">
      <div className="flex items-center justify-between">
        <div className="text-2xl font-medium">{(attempt.score * 100).toFixed(0)}%</div>
        <button
          onClick={onNext}
          className="rounded-md bg-[hsl(var(--primary))] px-4 py-1.5 text-sm font-medium text-[hsl(var(--primary-foreground))]"
        >
          Next →
        </button>
      </div>
      <p className="text-sm">{attempt.rationale}</p>
      {missed.length > 0 && (
        <div>
          <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
            Missed points
          </div>
          <ul className="list-disc pl-5 text-sm">
            {missed.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-xs uppercase tracking-wider text-muted-foreground">
          Ideal answer
        </summary>
        <p className="mt-2 whitespace-pre-wrap">{idealAnswer}</p>
      </details>
    </div>
  );
}
