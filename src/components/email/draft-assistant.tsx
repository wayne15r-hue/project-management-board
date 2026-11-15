"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EMAIL_DRAFT_CONTEXT_LIMIT, EMAIL_DRAFT_RETRY_MESSAGE, type EmailDraftAIInput, type EmailDraftPreview,
} from "@/lib/email/ai-draft";
import { EmailRequestError, requestEmailDraft } from "@/lib/email/client";

const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

export function EmailDraftAssistant({ userId, mode, hasSubject, hasBody, onApply }: {
  userId: string;
  mode: EmailDraftAIInput["mode"];
  hasSubject: boolean;
  hasBody: boolean;
  onApply: (preview: EmailDraftPreview) => void;
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

  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => {
    if (open) contextField.current?.focus();
  }, [open]);

  function clearPreview() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setLoading(false);
    setPreview(null);
    setProblem("");
  }

  async function generate() {
    if (!context.trim() || activeRequest.current) return;
    const request = new AbortController();
    activeRequest.current = request;
    setLoading(true);
    setPreview(null);
    setProblem("");
    try {
      const draft = await requestEmailDraft(userId, { context, mode, tone, length }, request.signal);
      if (!request.signal.aborted) setPreview(draft);
    } catch (error) {
      if (!request.signal.aborted) {
        setProblem(error instanceof EmailRequestError ? error.message : EMAIL_DRAFT_RETRY_MESSAGE);
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
        if (open) clearPreview();
        setOpen(!open);
      }}><Sparkles aria-hidden="true" /> Draft with AI</Button>
    {open && <div id={id} className="space-y-3 rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
      <div className="space-y-1">
        <label htmlFor={`${id}-context`} className="text-sm font-medium">Context</label>
        <p id={`${id}-notice`} className="text-xs text-muted-foreground">Only the context you enter here and your drafting choices are sent to Groq.</p>
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
      <Button type="button" size="sm" disabled={loading || !context.trim()} onClick={() => void generate()}>Generate draft</Button>
      {loading && <p role="status" className="text-sm text-muted-foreground">Generating draft…</p>}
      {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      {preview && <section aria-labelledby={`${id}-preview`} className="space-y-2 rounded-md border bg-background p-3 text-sm">
        <h3 id={`${id}-preview`} className="font-medium">Draft preview</h3>
        {preview.subject && <p className="font-medium wrap-break-word">{preview.subject}</p>}
        <p className="whitespace-pre-wrap wrap-break-word">{preview.body}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => {
          onApply(preview);
          clearPreview();
          setContext("");
          setOpen(false);
        }}>{applyLabel}</Button>
      </section>}
    </div>}
  </div>;
}
