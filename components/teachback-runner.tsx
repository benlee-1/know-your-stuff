"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  analyzeExplanation,
  submitSocraticResponse,
  type TeachbackState,
} from "@/app/actions/teachback";
import type { Analysis } from "@/lib/prompts/teachback";
import type { TeachbackSession } from "@/lib/schema";

function msg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export function TeachbackRunner({
  projectId,
  initial,
}: {
  projectId: string;
  initial: TeachbackState;
}) {
  const firstWithBody = initial.sections.find((s) => s.hasBody)?.id ?? "";
  const [sectionId, setSectionId] = useState(firstWithBody);
  const [explanation, setExplanation] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [response, setResponse] = useState("");
  const [closing, setClosing] = useState<TeachbackSession | null>(null);
  const [past, setPast] = useState<TeachbackSession[]>(initial.past);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function analyze() {
    if (!sectionId || !explanation.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const a = await analyzeExplanation(projectId, sectionId, explanation);
        setAnalysis(a);
        setResponse("");
      } catch (e) {
        setError(msg(e, "Failed to analyze your explanation"));
      }
    });
  }

  function submit() {
    if (!analysis || !response.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const session = await submitSocraticResponse({ projectId, sectionId, explanation, analysis, response });
        setClosing(session);
        setPast((p) => [session, ...p]);
      } catch (e) {
        setError(msg(e, "Failed to close out the teach-back"));
      }
    });
  }

  function reset() {
    setAnalysis(null);
    setClosing(null);
    setExplanation("");
    setResponse("");
    setError(null);
  }

  function sectionTitle(id: string): string {
    return initial.sections.find((s) => s.id === id)?.title ?? id;
  }

  if (!initial.hasDossier) {
    return (
      <p className="text-sm text-muted-foreground">
        No dossier yet.{" "}
        <Link className="underline" href={`/chat/${projectId}/dossier`}>Generate the dossier</Link>{" "}
        first — teach-back is built from it.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-500">{error}</p>}

      {closing ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Teach-back complete</h2>
          <p className="text-sm text-muted-foreground">Explanation coverage: {Math.round(closing.coverageScore * 100)}%</p>
          <p className="text-sm text-muted-foreground">{closing.summary}</p>
          {JSON.parse(closing.masteredPointsJson || "[]").length > 0 && (
            <div>
              <p className="text-xs uppercase text-muted-foreground">What you've got</p>
              <ul className="list-disc pl-5 text-sm">
                {(JSON.parse(closing.masteredPointsJson) as string[]).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
          {JSON.parse(closing.stillMissingJson || "[]").length > 0 && (
            <div>
              <p className="text-xs uppercase text-muted-foreground">Still to review</p>
              <ul className="list-disc pl-5 text-sm">
                {(JSON.parse(closing.stillMissingJson) as string[]).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
          <button onClick={reset} disabled={pending}
            className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50">
            Teach back another section
          </button>
        </div>
      ) : analysis ? (
        <div className="space-y-4">
          <p className="text-sm">Coverage so far: <strong>{Math.round(analysis.coverageScore * 100)}%</strong></p>
          {analysis.gaps.length > 0 && (
            <div>
              <p className="text-xs uppercase text-muted-foreground">Gaps</p>
              <ul className="list-disc pl-5 text-sm text-muted-foreground">{analysis.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
            </div>
          )}
          {analysis.misconceptions.length > 0 && (
            <div>
              <p className="text-xs uppercase text-muted-foreground">Misconceptions</p>
              <ul className="list-disc pl-5 text-sm text-muted-foreground">{analysis.misconceptions.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}
          <div className="space-y-2">
            <p className="font-medium">{analysis.socraticQuestion}</p>
            <textarea value={response} onChange={(e) => setResponse(e.target.value)} disabled={pending}
              placeholder="Reason it out…"
              className="h-40 w-full rounded-md border border-[hsl(var(--border))] bg-transparent p-3 text-sm outline-none focus:border-[hsl(var(--primary))] disabled:opacity-60" />
            <button onClick={submit} disabled={pending || !response.trim()}
              className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50">
              {pending ? "…" : "Submit"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">Section to teach back</span>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={pending}
              className="rounded-md border border-[hsl(var(--border))] bg-transparent px-3 py-2 text-sm">
              {initial.sections.map((s) => (
                <option key={s.id} value={s.id} disabled={!s.hasBody}>{s.title}{s.hasBody ? "" : " (empty)"}</option>
              ))}
            </select>
          </label>
          <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} disabled={pending}
            placeholder="Explain this section in your own words, as if teaching it…"
            className="h-48 w-full rounded-md border border-[hsl(var(--border))] bg-transparent p-3 text-sm outline-none focus:border-[hsl(var(--primary))] disabled:opacity-60" />
          <button onClick={analyze} disabled={pending || !sectionId || !explanation.trim()}
            className="rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-50">
            {pending ? "Analyzing…" : "Analyze my explanation"}
          </button>
        </div>
      )}

      {!analysis && !closing && past.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Past teach-backs ({past.length})</summary>
          <ul className="mt-2 space-y-1">
            {past.map((s) => (
              <li key={s.id} className="text-muted-foreground">{sectionTitle(s.sectionId)} — {Math.round(s.coverageScore * 100)}%</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
