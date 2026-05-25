"use client";

import { cn } from "@/lib/utils";
import type { ChatMode } from "@/lib/schema";

const MODES: { value: ChatMode; label: string; hint: string }[] = [
  { value: "business", label: "Business", hint: "Lingo, users, value" },
  { value: "technical", label: "Technical", hint: "Architecture, code, trade-offs" },
  { value: "quiz", label: "Quiz", hint: "Test yourself" },
];

export function ModeToggle({
  value,
  onChange,
}: {
  value: ChatMode;
  onChange: (m: ChatMode) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-[hsl(var(--border))] p-0.5">
      {MODES.map((m) => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          title={m.hint}
          className={cn(
            "rounded px-3 py-1.5 text-sm transition",
            value === m.value
              ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
