"use client";

import { useState } from "react";
import { ClipboardList, FileText, ListChecks, Languages, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestPersonalAI, PersonalAIRequestError, usePersonalConnections, usePersonalQuote } from "@/lib/personal-ai/client";
import { PROVIDERS, REWRITE_MODES, TOOLS, TOOL_INPUT_LIMIT, type Receipt, type Selection, type Tool } from "@/lib/personal-ai/contracts";
import { aiField, ConnectionsLink, QuotePreview, RunOptions, RunReceipt } from "./run-options";

const path = "/api/personal-ai/tools";
const icons = { notes_to_tasks: ListChecks, meeting_recap: FileText, status_update: ClipboardList, ticket_triage: Ticket, rewrite_translate: Languages };

export function WorkspaceTools({ userId }: { userId: string }) {
  const state = usePersonalConnections(userId, true);
  const [tool, setTool] = useState<Tool>("notes_to_tasks");
  return <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 md:px-10 md:py-10">
    <div>
      <h1 className="text-[28px] font-bold tracking-tight">Tools</h1>
      <p className="mt-1 text-sm text-muted-foreground">Use your own AI connection for everyday workspace tasks.</p>
    </div>
    <div aria-label="Workspace tools" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {(Object.entries(TOOLS) as [Tool, typeof TOOLS[Tool]][]).map(([id, item]) => {
        const Icon = icons[id];
        return <button key={id} type="button" aria-pressed={tool === id} onClick={() => setTool(id)}
          className="flex flex-col items-start gap-2 rounded-xl border bg-card px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-accent aria-pressed:border-primary aria-pressed:bg-primary/10">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          {item.label}
        </button>;
      })}
    </div>
    {!state ? <p role="status" className="text-sm text-muted-foreground">Loading your connections…</p>
      : state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p>
      : <ToolForm key={tool} userId={userId} tool={tool} connections={state.connections} />}
  </div>;
}

function ToolForm({ userId, tool, connections }: { userId: string; tool: Tool; connections: NonNullable<ReturnType<typeof usePersonalConnections>>["connections"] }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [text, setText] = useState("");
  const [rewriteMode, setRewriteMode] = useState<typeof REWRITE_MODES[number]>("clearer");
  const [language, setLanguage] = useState("");
  const [result, setResult] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [copied, setCopied] = useState(false);
  const rewrite = tool === "rewrite_translate";
  const translating = rewrite && rewriteMode === "translate";
  const input = { tool, text, ...(rewrite ? { rewriteMode } : {}), ...(translating ? { language } : {}) };
  const body = selection && text.trim() && (!translating || language.trim()) ? JSON.stringify({ selection, input }) : null;
  const estimate = usePersonalQuote(userId, path, body);

  async function run() {
    if (!body || !estimate?.quote || busy) return;
    setBusy(true);
    setProblem("");
    setResult("");
    setReceipt(null);
    setCopied(false);
    try {
      const data = await requestPersonalAI<{ text: string; receipt: Receipt }>(userId, path,
        JSON.stringify({ selection, input, runId: crypto.randomUUID() }));
      setResult(data.text);
      setReceipt(data.receipt);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "Could not generate a result.");
      if (error instanceof PersonalAIRequestError && error.receipt) setReceipt(error.receipt);
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
    <div>
      <h2 className="text-xl font-semibold">{TOOLS[tool].label}</h2>
      <p className="text-sm text-muted-foreground">{TOOLS[tool].description}</p>
    </div>
    {connections.length > 0 ? <RunOptions connections={connections} selection={selection} onChange={setSelection} disabled={busy} />
      : <p className="text-sm text-muted-foreground">Connect a provider in <ConnectionsLink /> to use this tool.</p>}
    {selection && <p className="text-xs text-muted-foreground">Your text will be sent to {PROVIDERS[selection.provider].label} for this run.</p>}
    {rewrite && <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1 text-sm">
        <span>Operation</span>
        <select className={aiField} disabled={busy} value={rewriteMode}
          onChange={event => setRewriteMode(event.target.value as typeof rewriteMode)}>
          {REWRITE_MODES.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
        </select>
      </label>
      {translating && <label className="space-y-1 text-sm">
        <span>Target language</span>
        <input className={aiField} disabled={busy} maxLength={80} value={language} onChange={event => setLanguage(event.target.value)} />
      </label>}
    </div>}
    <label className="block space-y-1 text-sm">
      <span>Source text</span>
      <textarea className={aiField} disabled={busy} rows={7} maxLength={TOOL_INPUT_LIMIT} value={text}
        onChange={event => setText(event.target.value)} />
    </label>
    {body && (estimate?.quote ? <QuotePreview quote={estimate.quote} />
      : estimate?.error ? <p role="alert" className="text-sm text-destructive">{estimate.error}</p>
      : <p role="status" className="text-xs text-muted-foreground">Estimating usage…</p>)}
    <Button type="button" disabled={!estimate?.quote || busy} onClick={() => void run()}>{busy ? "Generating…" : "Generate"}</Button>
    {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
    {receipt && <RunReceipt receipt={receipt} />}
    {result && <div className="space-y-2">
      <label className="block space-y-1 text-sm">
        <span>Result</span>
        <textarea className={aiField} rows={8} value={result} onChange={event => { setResult(event.target.value); setCopied(false); }} />
      </label>
      <Button type="button" variant="outline" onClick={async () => {
        try { await navigator.clipboard.writeText(result); setCopied(true); }
        catch { setProblem("Clipboard access failed. Select and copy the result manually."); }
      }}>{copied ? "Copied" : "Copy result"}</Button>
    </div>}
  </section>;
}
