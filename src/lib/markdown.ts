import React from "react";

type Node = React.ReactNode;

function escapeHtml(input: string) {
  return input;
}

const TOKEN_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;

function renderInline(line: string, key: string): Node {
  const parts = line.split(TOKEN_RE);
  return parts.map((part, i) => {
    const k = `${key}-${i}`;
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) {
      return React.createElement(
        "strong",
        { key: k, className: "font-semibold" },
        escapeHtml(part.slice(2, -2))
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return React.createElement(
        "em",
        { key: k, className: "italic" },
        escapeHtml(part.slice(1, -1))
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return React.createElement(
        "code",
        {
          key: k,
          className:
            "rounded bg-muted px-1 py-[1px] font-mono text-[12px] text-foreground",
        },
        part.slice(1, -1)
      );
    }
    return React.createElement(React.Fragment, { key: k }, escapeHtml(part));
  });
}

export function renderMarkdown(text: string): Node {
  const lines = text.split("\n");
  return lines.map((line, i) =>
    React.createElement(
      React.Fragment,
      { key: i },
      renderInline(line, String(i)),
      i < lines.length - 1
        ? React.createElement("br", { key: `br-${i}` })
        : null
    )
  );
}
