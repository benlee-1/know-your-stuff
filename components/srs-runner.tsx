"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  loadSrsState,
  generateCards,
  getDueCards,
  rateCard,
  type SrsState,
  type Rating,
} from "@/app/actions/srs";
import type { Flashcard } from "@/lib/schema";

const RATINGS: { key: Rating; label: string }[] = [
  { key: "again", label: "Again" },
  { key: "hard", label: "Hard" },
  { key: "good", label: "Good" },
  { key: "easy", label: "Easy" },
];

function msg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export function SrsRunner({
  projectId,
  initial,
}: {
  projectId: string;
  initial: SrsState;
}) {
  const [state, setState] = useState(initial);
  const [genSection, setGenSection] = useState(initial.sections.find((s) => s.hasBody)?.id ?? "");
  const [genCount, setGenCount] = useState(8);
  const [queue, setQueue] = useState<Flashcard[] | null>(null); // null = deck mode
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    if (!genSection) return;
    setError(null);
    startTransition(async () => {
      try {
        await generateCards(projectId, genSection, genCount);
        setState(await loadSrsState(projectId));
      } catch (e) {
        setError(msg(e, "Failed to generate cards"));
      }
    });
  }

  function startReview() {
    setError(null);
    startTransition(async () => {
      try {
        const due = await getDueCards(projectId);
        setQueue(due);
        setIndex(0);
        setRevealed(false);
      } catch (e) {
        setError(msg(e, "Failed to load due cards"));
      }
    });
  }

  function rate(rating: Rating) {
    if (!queue) return;
    const card = queue[index];
    if (!card) return;
    setError(null);
    startTransition(async () => {
      try {
        await rateCard(projectId, card.id, rating);
        setIndex(index + 1);
        setRevealed(false);
      } catch (e) {
        setError(msg(e, "Failed to record your rating"));
      }
    });
  }

  function backToDeck() {
    setQueue(null);
    setIndex(0);
    setRevealed(false);
    setError(null);
    startTransition(async () => {
      try {
        setState(await loadSrsState(projectId));
      } catch (e) {
        setError(msg(e, "Failed to refresh deck"));
      }
    });
  }

  if (!state.hasDossier) {
    return (
      <p className="text-sm text-muted-foreground">
        No dossier yet.{" "}
        <Link className="underline" href={`/chat/${projectId}/dossier`}>Generate the dossier</Link>{" "}
        first — cards are built from it.
      </p>
    );
  }

  // Review mode
  if (queue !== null) {
    const done = index >= queue.length;
    const card = queue[index];
    return (
      <div className="space-y-5">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {done ? (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Review complete</h2>
            <p className="text-sm text-muted-foreground">You reviewed {queue.length} card{queue.length === 1 ? "" : "s"}.</p>
            <button onClick={backToDeck} disabled={pending}
              className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50">
              Back to deck
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs uppercase text-muted-foreground">Card {index + 1} of {queue.length}</p>
            <div className="rounded-md border border-[hsl(var(--border))] p-4">
              <p className="font-medium">{card.front}</p>
              {revealed && <p className="mt-3 border-t border-[hsl(var(--border))] pt-3 text-sm whitespace-pre-wrap">{card.back}</p>}
            </div>
            {!revealed ? (
              <button onClick={() => setRevealed(true)} disabled={pending}
                className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50">
                Show answer
              </button>
            ) : (
              <div className="flex flex-wrap gap-2">
                {RATINGS.map((r) => (
                  <button key={r.key} onClick={() => rate(r.key)} disabled={pending}
                    className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm disabled:opacity-50">
                    {r.label}
                  </button>
                ))}
              </div>
            )}
            <button onClick={backToDeck} disabled={pending} className="text-xs text-muted-foreground hover:underline">
              End review
            </button>
          </div>
        )}
      </div>
    );
  }

  // Deck mode
  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <button onClick={startReview} disabled={pending || state.totalDue === 0}
          className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50">
          {state.totalDue > 0 ? `Review ${state.totalDue} due` : "Nothing due"}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Generate cards for</span>
          <select value={genSection} onChange={(e) => setGenSection(e.target.value)} disabled={pending}
            className="rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm">
            {state.sections.map((s) => (
              <option key={s.id} value={s.id} disabled={!s.hasBody}>{s.title}{s.hasBody ? "" : " (empty)"}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Count</span>
          <input type="number" min={1} max={20} value={genCount}
            onChange={(e) => setGenCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            disabled={pending}
            className="w-20 rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm" />
        </label>
        <button onClick={generate} disabled={pending || !genSection}
          className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm disabled:opacity-50">
          {pending ? "…" : "Generate"}
        </button>
      </div>

      <ul className="space-y-1 text-sm">
        {state.sections.map((s) => (
          <li key={s.id} className="flex justify-between border-b border-[hsl(var(--border))] py-1">
            <span>{s.title}</span>
            <span className="text-muted-foreground">{s.cardCount} card{s.cardCount === 1 ? "" : "s"}{s.dueCount > 0 ? ` · ${s.dueCount} due` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
