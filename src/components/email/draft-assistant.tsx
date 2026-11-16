"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EMAIL_DRAFT_CONTEXT_LIMIT, EMAIL_DRAFT_RETRY_MESSAGE, type EmailDraftAIInput, type EmailDraftPreview,
} from "@/lib/email/ai-draft";
import { EmailRequestError, requestEmailDraft } from "@/lib/email/client";
import { ConnectionsLink, QuotePreview, RunOptions, RunReceipt } from "@/components/personal-ai/run-options";
import { PersonalAIRequestError, requestPersonalAI, usePersonalConnections, usePersonalQuote } from "@/lib/personal-ai/client";
import { PROVIDERS, type Receipt, type Selection } from "@/lib/personal-ai/contracts";

const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const path = "/api/email/ai-draft";

export function EmailDraftAssistant({ userId, mode, hasSubject, hasBody, onApply, sharedAI = true, personalAI = false }: {
  userId: string;
  mode: EmailDraftAIInput["mode"];
  hasSubject: boolean;
  hasBody: boolean;
  onApply: (preview: EmailDraftPreview) => void;
  sharedAI?: boolean;
  personalAI?: boolean;
}) {
  const id = useId();
  const contextField = useRef<HTMLTextAreaElement>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState("");
  const [tone, setTone] = useState<EmailDraftAIInput["tone"]>("professional");
  const [length, setLength] = useState<EmailDraftAIInput["length"]>("short");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<EmailDraftPreview | null>(null);
  const [problem, setProblem] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const connections = usePersonalConnections(userId, open && personalAI);
  const draftInput = { context, mode, tone, length };
  const estimate = usePersonalQuote(userId, path, open && selection && context.trim()
    ? JSON.stringify({ ...draftInput, personal: { selection } }) : null);

  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => {
    if (open) contextField.current?.focus();
  }, [open]);

  function clearPreview() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setLoading(false);
    setPreview(null);
    setReceipt(null);
    setProblem("");
  }

  async function generate() {
    if (!context.trim() || activeRequest.current || (selection ? !estimate?.quote : !sharedAI)) return;
    const request = new AbortController();
    activeRequest.current = request;
    setLoading(true);
    setPreview(null);
    setReceipt(null);
    setProblem("");
    try {
      const draft = selection
        ? await requestPersonalAI<EmailDraftPreview & { receipt: Receipt }>(userId, path,
          JSON.stringify({ ...draftInput, personal: { selection, runId: crypto.randomUUID() } }), request.signal)
        : await requestEmailDraft(userId, draftInput, request.signal);
      if (!request.signal.aborted) {
        setPreview({ subject: draft.subject, body: draft.body });
        if ("receipt" in draft) setReceipt(draft.receipt as Receipt);
      }
    } catch (error) {
      if (!request.signal.aborted) {
        setProblem(error instanceof EmailRequestError || error instanceof PersonalAIRequestError ? error.message : EMAIL_DRAFT_RETRY_MESSAGE);
        if (error instanceof PersonalAIRequestError && error.receipt) setReceipt(error.receipt);
      }
    } finally {
      if (activeRequest.current === request && !request.signal.aborted) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }

  const applyLabel = mode === "new" && (hasSubject || hasBody)
    ? "Replace subject and message" : hasBody ? "Replace message" : "Use draft";

  return <div className="space-y-2">
    <Button type="button" variant="outline" size="sm" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => {
        if (open) { clearPreview(); setSelection(null); }
        setOpen(!open);
      }}><Sparkles aria-hidden="true" /> Draft with AI</Button>
    {open && <div id={id} className="space-y-3 rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
      {personalAI && <>
        <RunOptions connections={connections?.connections ?? []} selection={selection} shared={sharedAI} disabled={loading}
          onChange={value => { clearPreview(); setSelection(value); }} />
        {connections?.error ? <p role="alert" className="text-sm text-destructive">{connections.error}</p>
          : !connections ? <p role="status" className="text-xs text-muted-foreground">Loading personal connections…</p>
          : !connections.connections.length && <p className="text-xs text-muted-foreground">Add a personal provider in <ConnectionsLink />.</p>}
      </>}
      <div className="space-y-1">
        <label htmlFor={`${id}-context`} className="text-sm font-medium">Context</label>
        <p id={`${id}-notice`} className="text-xs text-muted-foreground">Only the context you enter here and your drafting choices are sent to {selection ? PROVIDERS[selection.provider].label : sharedAI ? "Groq" : "the selected provider"}.</p>
        <textarea ref={contextField} id={`${id}-context`} aria-describedby={`${id}-notice`} rows={3}
          className={`${field} resize-y`} maxLength={EMAIL_DRAFT_CONTEXT_LIMIT} value={context}
          placeholder="Example: Thank my team for covering Monday."
          onChange={(event) => { clearPreview(); setContext(event.target.value); }} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
        <label className="space-y-1 text-sm font-medium">
          <span>Tone</span>
          <select className={field} value={tone} onChange={(event) => {
            clearPreview();
            setTone(event.target.value as EmailDraftAIInput["tone"]);
          }}>
            <option value="friendly">Friendly</option>
            <option value="professional">Professional</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>Length</span>
          <select className={field} value={length} onChange={(event) => {
            clearPreview();
            setLength(event.target.value as EmailDraftAIInput["length"]);
          }}>
            <option value="short">Short</option>
            <option value="long">Long</option>
          </select>
        </label>
      </div>
      {selection && context.trim() && (estimate?.quote ? <QuotePreview quote={estimate.quote} />
        : estimate?.error ? <p role="alert" className="text-sm text-destructive">{estimate.error}</p>
        : <p role="status" className="text-xs text-muted-foreground">Estimating usage…</p>)}
      <Button type="button" size="sm" disabled={loading || !context.trim() || (selection ? !estimate?.quote : !sharedAI)}
        onClick={() => void generate()}>Generate draft</Button>
      {loading && <p role="status" className="text-sm text-muted-foreground">Generating draft…</p>}
      {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      {receipt && <RunReceipt receipt={receipt} />}
      {preview && <section aria-labelledby={`${id}-preview`} className="space-y-2 rounded-md border bg-background p-3 text-sm">
        <h3 id={`${id}-preview`} className="font-medium">Draft preview</h3>
        {preview.subject && <p className="font-medium wrap-break-word">{preview.subject}</p>}
        <p className="whitespace-pre-wrap wrap-break-word">{preview.body}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => {
          onApply(preview);
          clearPreview();
          setSelection(null);
          setContext("");
          setOpen(false);
        }}>{applyLabel}</Button>
      </section>}
    </div>}
  </div>;
}
