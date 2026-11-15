"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadEmailAttachment, emailError, emailPost, emailRequest, EmailRequestError } from "@/lib/email/client";
import { EMAIL_KINDS, type EmailAttachment, type EmailDraft, type EmailKind, type EmailPerson } from "@/lib/email/types";

type ComposeDraft = EmailDraft & { forwardSource?: string };

const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
const kinds = { to: "To", cc: "Cc", bcc: "Bcc" };

export function EmailCompose({ userId, initial, onClose, onSaved, onSent }: {
  userId: string;
  initial: ComposeDraft;
  onClose: () => void;
  onSaved: () => void;
  onSent: () => void;
}) {
  const subjectId = useId();
  const bodyId = useId();
  const [draft, setDraft] = useState(initial);
  const liveDraft = useRef(initial);
  const revision = useRef(initial.version);
  const dirty = useRef(initial.version === 0);
  const activeSave = useRef<Promise<boolean> | null>(null);
  const conflict = useRef(false);
  const [hasConflict, setHasConflict] = useState(false);
  const [status, setStatus] = useState(initial.version ? "Draft saved" : "");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [retrySend, setRetrySend] = useState(false);
  const [kind, setKind] = useState<EmailKind>("to");
  const [term, setTerm] = useState("");
  const [matches, setMatches] = useState<EmailPerson[]>([]);
  const [directoryError, setDirectoryError] = useState("");
  const mounted = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    mounted.current = true;
    heading.current?.focus();
    return () => { mounted.current = false; };
  }, []);

  function update(values: Partial<ComposeDraft>, changeText = true) {
    liveDraft.current = { ...liveDraft.current, ...values };
    if (changeText) dirty.current = true;
    setDraft(liveDraft.current);
  }

  const save = useRef(async (): Promise<boolean> => true);
  useEffect(() => {
    save.current = async () => {
      while (activeSave.current) {
        if (!await activeSave.current) return false;
      }
      if (!dirty.current) return true;
      if (conflict.current || !mounted.current) return false;
      const snapshot = liveDraft.current;
      dirty.current = false;
      setStatus("Saving draft…");
      const pending = (async () => {
        try {
          const result = await emailPost<{ version: number }>(userId, {
            action: "save-draft", id: snapshot.id, version: revision.current,
            subject: snapshot.subject, body: snapshot.body,
            recipients: snapshot.recipients.map(({ id, kind }) => ({ id, kind })),
          });
          revision.current = result.version;
          if (mounted.current) {
            setStatus(dirty.current ? "Changes pending" : "Draft saved");
            setProblem("");
            onSaved();
          }
          return true;
        } catch (error) {
          dirty.current = true;
          conflict.current = error instanceof EmailRequestError && error.status === 409;
          if (mounted.current) {
            setHasConflict(conflict.current);
            setStatus("Draft has unsaved changes");
            setProblem(emailError(error));
          }
          return false;
        }
      })();
      activeSave.current = pending;
      try { return await pending; }
      finally { if (activeSave.current === pending) activeSave.current = null; }
    };
  }, [onSaved, userId]);

  useEffect(() => {
    if (busy || retrySend || !dirty.current) return;
    const timer = setTimeout(() => { void save.current(); }, 650);
    return () => clearTimeout(timer);
  }, [draft, busy, retrySend]);

  useEffect(() => {
    const query = term.trim();
    if (query.length < 2) return;
    const request = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const people = await emailRequest<EmailPerson[]>(userId, { view: "directory", q: query }, { signal: request.signal });
        if (!request.signal.aborted) { setMatches(people); setDirectoryError(""); }
      } catch (error) {
        if (!request.signal.aborted) setDirectoryError(emailError(error));
      }
    }, 240);
    return () => { clearTimeout(timer); request.abort(); };
  }, [term, userId]);

  async function run(task: () => Promise<void>, sending = false) {
    setBusy(true);
    setProblem("");
    try {
      await task();
    } catch (error) {
      if (sending && (!(error instanceof EmailRequestError) || error.status >= 500)) {
        setRetrySend(true);
        setProblem("Send status is uncertain. Retry Send to confirm delivery.");
      } else {
        setRetrySend(false);
        setProblem(emailError(error));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function persistForward() {
    const { id, forwardSource } = liveDraft.current;
    if (!forwardSource) return;
    const { attachments, version } = await emailPost<{ attachments: EmailAttachment[]; version: number }>(userId, {
      action: "forward-files", draft: id, source: forwardSource, version: revision.current,
    });
    revision.current = version;
    update({ attachments, forwardSource: undefined }, false);
  }

  useEffect(() => {
    if (!initial.forwardSource) return;
    const timer = setTimeout(() => {
      if (!mounted.current) return;
      void run(async () => {
        if (await save.current()) await persistForward();
      });
    });
    return () => clearTimeout(timer);
    // The initial source is used once when this compose view mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.forwardSource]);

  const selected = draft.recipients.filter((person) => person.kind === kind);
  const results = matches.filter((person) => !draft.recipients.some((selected) => selected.id === person.id));

  return <section aria-label="Compose email" className="min-h-0 flex-1 overflow-auto bg-card">
    <form className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6" onSubmit={(event) => {
      event.preventDefault();
      void run(async () => {
        if (!retrySend) {
          if (!await save.current()) return;
          await persistForward();
        }
        await emailPost(userId, { action: "send", id: draft.id, version: revision.current });
        onSent();
      }, true);
    }}>
      <div className="flex items-center justify-between gap-2">
        <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold">Compose</h2>
        <Button type="button" variant="ghost" size="icon" aria-label="Close compose" disabled={busy || retrySend}
          onClick={() => void run(async () => {
            if (!await save.current()) return;
            await persistForward();
            onClose();
          })}><X /></Button>
      </div>

      {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      {hasConflict && <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void run(async () => {
          const saved = await emailRequest<EmailDraft>(userId, { view: "draft", id: draft.id });
          conflict.current = false;
          setHasConflict(false);
          revision.current = saved.version;
          dirty.current = false;
          update(saved, false);
          setStatus("Draft reloaded");
        })}>Reload saved draft</Button>
        <Button type="button" variant="outline" onClick={() => void run(async () => {
          conflict.current = false;
          setHasConflict(false);
          revision.current = 0;
          update({ id: crypto.randomUUID(), version: 0, attachments: [] });
          await save.current();
        })}>Save text as a new draft</Button>
      </div>}

      <fieldset disabled={busy || retrySend} className="flex flex-col gap-4 disabled:opacity-80">
        <legend className="sr-only">Message fields</legend>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2" aria-label="Recipient type">
            {EMAIL_KINDS.map((value) => <Button key={value} type="button" size="sm"
              variant={kind === value ? "default" : "outline"} aria-pressed={kind === value}
              onClick={() => setKind(value)}>{kinds[value]}{draft.recipients.some((person) => person.kind === value)
                ? " (" + draft.recipients.filter((person) => person.kind === value).length + ")" : ""}</Button>)}
          </div>
          {selected.length > 0 && <ul className="flex flex-wrap gap-2">
            {selected.map((person) => <li key={person.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm">
              {person.name}
              <button type="button" className="rounded-full p-1 hover:bg-background" aria-label={"Remove " + person.name}
                onClick={() => update({ recipients: draft.recipients.filter(({ id }) => id !== person.id) })}>
                <X className="size-3.5" />
              </button>
            </li>)}
          </ul>}
          <input className={field} placeholder="Search by name or exact email" aria-label={"Find " + kinds[kind] + " recipients"}
            value={term} maxLength={254} onChange={(event) => {
              setTerm(event.target.value);
              setMatches([]);
              setDirectoryError("");
            }} />
          {directoryError && <p role="alert" className="text-sm text-destructive">{directoryError}</p>}
          {term.trim().length >= 2 && results.length > 0 && <ul className="max-h-40 overflow-auto rounded-md border">
            {results.map((person) => <li key={person.id}>
              <button type="button" disabled={draft.recipients.length >= 20} className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => { update({ recipients: [...draft.recipients, { ...person, kind }] }); setTerm(""); setMatches([]); }}>
                {person.name}{person.email ? " · " + person.email : ""}
              </button>
            </li>)}
          </ul>}
        </div>

        <div className="space-y-1">
          <label htmlFor={subjectId} className="text-sm font-medium">Subject</label>
          <input id={subjectId} className={field} value={draft.subject} maxLength={200}
            onChange={(event) => update({ subject: event.target.value })} />
        </div>
        <div className="space-y-1">
          <label htmlFor={bodyId} className="text-sm font-medium">Message</label>
          <textarea id={bodyId} className={field + " min-h-52 resize-y"} value={draft.body} maxLength={50_000}
            onChange={(event) => update({ body: event.target.value })} />
        </div>

        {draft.attachments.length > 0 && <ul className="space-y-1">
          {draft.attachments.map((item) => <li key={item.id} className="flex items-center gap-2">
            <button type="button" className="truncate text-sm underline" onClick={() => void run(() => downloadEmailAttachment(userId, item.id))}>{item.name}</button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={"Remove attachment " + item.name}
              onClick={() => void run(async () => {
                if (!await save.current()) return;
                revision.current = await emailPost<number>(userId, {
                  action: "remove-file", draft: draft.id, attachment: item.id, version: revision.current,
                });
                update({ attachments: liveDraft.current.attachments.filter(({ id }) => id !== item.id) }, false);
              })}><X /></Button>
          </li>)}
        </ul>}
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring">
          <Paperclip className="size-4" /> Attach files
          <input type="file" className="sr-only" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt"
            disabled={draft.attachments.length >= 3}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (!files.length) return;
              void run(async () => {
                if (!await save.current()) return;
                await persistForward();
                if (liveDraft.current.attachments.length + files.length > 3) {
                  throw new EmailRequestError("Attach up to three files.", 400);
                }
                for (const file of files) {
                  if (file.size > 3_000_000) throw new EmailRequestError("Each file must be 3 MB or smaller.", 413);
                  const { item, version } = await emailRequest<{ item: EmailAttachment; version: number }>(
                    userId,
                    { upload: draft.id, version: String(revision.current) },
                    { method: "POST", headers: { "X-Email-Filename": encodeURIComponent(file.name) }, body: file },
                  );
                  revision.current = version;
                  update({ attachments: [...liveDraft.current.attachments, item] }, false);
                }
              });
            }} />
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button type="submit" disabled={busy || (!retrySend && (!draft.recipients.length || hasConflict))}>
          <Send /> {retrySend ? "Retry Send" : "Send"}
        </Button>
        <Button type="button" variant="ghost" disabled={busy || retrySend || hasConflict} onClick={() => void run(async () => {
          if (!window.confirm("Discard this draft?")) return;
          while (activeSave.current) await activeSave.current;
          if (revision.current) await emailPost(userId, { action: "delete-draft", id: draft.id, version: revision.current });
          onClose();
        })}>Discard draft</Button>
        <span role="status" className="text-sm text-muted-foreground">{status}</span>
      </div>
    </form>
  </section>;
}
