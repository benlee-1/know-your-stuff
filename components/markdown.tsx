"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            return (
              <code className={`${className ?? ""} font-mono text-xs`} {...rest}>
                {children}
              </code>
            );
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
        pre: (p) => (
          <pre
            className="my-3 overflow-x-auto rounded-md bg-[hsl(var(--muted))] p-3 text-xs"
            {...p}
          />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
