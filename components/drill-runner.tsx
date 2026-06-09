"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  startDrill,
  nextDrillQuestion,
  finishDrill,
  type DrillsState,
} from "@/app/actions/drills";
import type { DrillSession } from "@/lib/schema";

interface Turn {
  question: string;
  answer: string;
}

function msg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export function DrillRunner({
  projectId,
  initial,
}: {
  projectId: string;
  initial: DrillsState;
}) {
  const firstWithBody = initial.sections.find((s) => s.hasBody)?.id ?? "";
  const [sectionId, setSectionId] = useState(firstWithBody);
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [scored, setScored] = useState<DrillSession | null>(null);
  const [past, setPast] = useState<DrillSession[]>(initial.past);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const turns = initial.turns;

  function start() {
    if (!sectionId) return;
    setError(null);
    setTranscript([]);
    setScored(null);
    setAnswer("");
    setQuestion(null);
    startTransition(async () => {
      try {
        const { question: q } = await startDrill(projectId, sectionId);
        setQuestion(q);
      } catch (e) {
        setError(msg(e, "Failed to start drill"));
      }
    });
  }

  function submitAnswer() {
    if (!question || !answer.trim()) return;
    const nextTranscript = [...transcript, { question, answer: answer.trim() }];
    setError(null);
    setTranscript(nextTranscript);
    setAnswer("");
    setQuestion(null);
    startTransition(async () => {
      try {
        if (nextTranscript.length >= turns) {
          const session = await finishDrill(projectId, sectionId, nextTranscript);
          setScored(session);
          setPast((p) => [session, ...p]);
        } else {
          const { question: q } = await nextDrillQuestion(projectId, sectionId, nextTranscript);
          setQuestion(q);
        }
      } catch (e) {
        setError(msg(e, "Failed to continue the drill"));
      }
    });
  }

  if (!initial.hasDossier) {
    return (
      <p className="text-sm text-muted-foreground">
        No dossier yet.{" "}
        <Link className="underline" href={`/chat/${projectId}/dossier`}>Generate the dossier</Link>{" "}
        first — drills are built from it.
      </p>
    );
  }

  const inProgress = question !== null;
  const turnNumber = transcript.length + 1;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-500">{error}</p>}

      {!inProgress && !scored && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Topic section</span>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              disabled={pending}
              className="rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm"
            >
              {initial.sections.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.hasBody}>
                  {s.title}{s.hasBody ? "" : " (empty)"}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={start}
            disabled={pending || !sectionId}
            className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
          >
            {pending ? "…" : "Start drill"}
          </button>
        </div>
      )}

      {transcript.length > 0 && !scored && (
        <ol className="space-y-3">
          {transcript.map((t, i) => (
            <li key={i} className="text-sm">
              <p className="font-medium">Q{i + 1}. {t.question}</p>
              <p className="text-muted-foreground whitespace-pre-wrap">{t.answer}</p>
            </li>
          ))}
        </ol>
      )}

      {inProgress && (
        <div className="space-y-3">
          <p className="text-xs uppercase text-muted-foreground">Question {turnNumber} of {turns}</p>
          <p className="font-medium">{question}</p>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={pending}
            placeholder="Answer as you would in the interview…"
            className="h-40 w-full rounded-md border border-[hsl(var(--border))] bg-transparent p-3 text-sm outline-none focus:border-[hsl(var(--primary))] disabled:opacity-60"
          />
          <button
            onClick={submitAnswer}
            disabled={pending || !answer.trim()}
            className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50"
          >
            {pending ? "…" : turnNumber >= turns ? "Submit & finish" : "Submit answer"}
          </button>
        </div>
      )}

      {scored && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            Scorecard — {Math.round(scored.score * 100)}%
          </h2>
          <Scorecard session={scored} />
          <button
            onClick={start}
            disabled={pending}
            className="rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm disabled:opacity-50"
          >
            New drill (same section)
          </button>
          <button
            onClick={() => { setScored(null); setQuestion(null); setTranscript([]); }}
            disabled={pending}
            className="ml-2 rounded-md border border-[hsl(var(--border))] px-4 py-2 text-sm disabled:opacity-50"
          >
            Pick another section
          </button>
        </div>
      )}

      {past.length > 0 && !inProgress && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Past drills ({past.length})</summary>
          <ul className="mt-2 space-y-1">
            {past.map((s) => (
              <li key={s.id} className="text-muted-foreground">
                {sectionTitle(initial, s.sectionId)} — {Math.round(s.score * 100)}%
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function sectionTitle(state: DrillsState, sectionId: string): string {
  return state.sections.find((s) => s.id === sectionId)?.title ?? sectionId;
}

function Scorecard({ session }: { session: DrillSession }) {
  const strengths: string[] = JSON.parse(session.strengthsJson || "[]");
  const weaknesses: string[] = JSON.parse(session.weaknessesJson || "[]");
  const transcript: { question: string; answer: string }[] = JSON.parse(session.transcriptJson || "[]");
  return (
    <div className="space-y-4">
      {strengths.length > 0 && (
        <div>
          <p className="text-xs uppercase text-muted-foreground">Strengths</p>
          <ul className="list-disc pl-5 text-sm">{strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {weaknesses.length > 0 && (
        <div>
          <p className="text-xs uppercase text-muted-foreground">Weaknesses</p>
          <ul className="list-disc pl-5 text-sm">{weaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Transcript</summary>
        <ol className="mt-2 space-y-2">
          {transcript.map((t, i) => (
            <li key={i}><p className="font-medium">Q{i + 1}. {t.question}</p><p className="text-muted-foreground whitespace-pre-wrap">{t.answer}</p></li>
          ))}
        </ol>
      </details>
    </div>
  );
}
