"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Highlighter, BundledLanguage, BundledTheme } from "shiki";

/**
 * Languages we eagerly support. Anything else falls back to plaintext.
 */
const SUPPORTED_LANGS: BundledLanguage[] = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "bash",
  "sh",
  "sql",
  "md",
  "html",
  "css",
  "python",
  "ruby",
  "go",
  "rust",
];

const LIGHT_THEME: BundledTheme = "github-light";
const DARK_THEME: BundledTheme = "github-dark-dimmed";

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((shiki) =>
      shiki.createHighlighter({
        themes: [LIGHT_THEME, DARK_THEME],
        langs: SUPPORTED_LANGS,
      }),
    );
  }
  return highlighterPromise;
}

function extractLang(className: string | undefined): string | null {
  if (!className) return null;
  const match = /language-([\w-]+)/.exec(className);
  return match ? match[1] : null;
}

function childrenToString(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(childrenToString).join("");
  if (children == null || typeof children === "boolean") return "";
  if (typeof children === "number") return String(children);
  if (
    typeof children === "object" &&
    "props" in (children as unknown as Record<string, unknown>)
  ) {
    const props = (children as { props?: { children?: React.ReactNode } })
      .props;
    return childrenToString(props?.children);
  }
  return "";
}

function HighlightedCode({
  code,
  lang,
}: {
  code: string;
  lang: string;
}) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supported = (SUPPORTED_LANGS as string[]).includes(lang)
      ? lang
      : "plaintext";

    getHighlighter()
      .then((highlighter) => {
        if (cancelled) return;
        try {
          const out = highlighter.codeToHtml(code, {
            lang: supported,
            themes: { light: LIGHT_THEME, dark: DARK_THEME },
            defaultColor: false,
          });
          setHtml(out);
        } catch {
          // Unknown lang or partial token during streaming — leave fallback.
        }
      })
      .catch(() => {
        // Highlighter failed to load — leave fallback.
      });

    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  if (html) {
    return (
      <div
        className="my-3 overflow-x-auto rounded-md text-xs [&>pre]:!bg-[hsl(var(--muted))] [&>pre]:p-3 [&>pre]:overflow-x-auto"
        // shiki output is sanitized html generated from our own source
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // Fallback while loading or on failure.
  return (
    <pre className="my-3 overflow-x-auto rounded-md bg-[hsl(var(--muted))] p-3 text-xs">
      <code className={`language-${lang} font-mono text-xs`}>{code}</code>
    </pre>
  );
}

/**
 * Renders assistant messages. Styles each element directly with Tailwind so
 * the look stays consistent across light/dark and there's no plugin coupling.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: (p) => <h1 className="mt-4 mb-2 text-lg font-semibold" {...p} />,
        h2: (p) => <h2 className="mt-4 mb-2 text-base font-semibold" {...p} />,
        h3: (p) => <h3 className="mt-3 mb-1 text-sm font-semibold" {...p} />,
        p: (p) => <p className="my-2 leading-relaxed" {...p} />,
        ul: (p) => <ul className="my-2 list-disc pl-5 space-y-1" {...p} />,
        ol: (p) => <ol className="my-2 list-decimal pl-5 space-y-1" {...p} />,
        li: (p) => <li className="leading-relaxed" {...p} />,
        strong: (p) => <strong className="font-semibold" {...p} />,
        em: (p) => <em className="italic" {...p} />,
        a: ({ href, children, ...rest }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-blue-500 underline underline-offset-2 hover:text-blue-400"
            {...rest}
          >
            {children}
          </a>
        ),
        blockquote: (p) => (
          <blockquote
            className="my-2 border-l-2 border-[hsl(var(--border))] pl-3 italic text-muted-foreground"
            {...p}
          />
        ),
        hr: () => <hr className="my-4 border-[hsl(var(--border))]" />,
        table: (p) => (
          <div className="my-3 overflow-x-auto">
            <table
              className="w-full border-collapse text-xs"
              {...p}
            />
          </div>
        ),
        thead: (p) => <thead className="bg-[hsl(var(--muted))]" {...p} />,
        th: (p) => (
          <th
            className="border border-[hsl(var(--border))] px-2 py-1 text-left font-semibold"
            {...p}
          />
        ),
        td: (p) => (
          <td className="border border-[hsl(var(--border))] px-2 py-1 align-top" {...p} />
        ),
        code: ({ className, children, ...rest }) => {
          const lang = extractLang(className);
          if (lang) {
            const code = childrenToString(children).replace(/\n$/, "");
            return <HighlightedCode code={code} lang={lang} />;
          }
          return (
            <code
              className="rounded bg-[hsl(var(--muted))] px-1 py-0.5 font-mono text-[0.85em]"
              {...rest}
            >
              {children}
            </code>
          );
        },
        pre: ({ children, ...rest }) => {
          // If our highlighted block is inside, the child already provides its
          // own wrapper — render children without an extra <pre>.
          const onlyChild = Array.isArray(children) ? children[0] : children;
          if (
            onlyChild &&
            typeof onlyChild === "object" &&
            "props" in (onlyChild as unknown as Record<string, unknown>)
          ) {
            const cls = (
              onlyChild as { props?: { className?: string } }
            ).props?.className;
            if (extractLang(cls)) {
              return <>{children}</>;
            }
          }
          return (
            <pre
              className="my-3 overflow-x-auto rounded-md bg-[hsl(var(--muted))] p-3 text-xs"
              {...rest}
            >
              {children}
            </pre>
          );
        },
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
