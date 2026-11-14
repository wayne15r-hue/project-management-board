"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ChevronLeft, ChevronRight, FilePenLine, Inbox, Mail, Plus, Search, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEmailMailbox } from "./mailbox-state";
import { EmailCompose } from "./compose";
import { downloadEmailAttachment, emailError, emailPost, emailRequest, EmailRequestError } from "@/lib/email/client";
import { replyRecipients, replySubject } from "@/lib/email/reply";
import type { EmailAction, EmailDraft, EmailFolder, EmailList, EmailMessage, EmailRow } from "@/lib/email/types";
import { cn } from "@/lib/utils";

const folders = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FilePenLine },
  { id: "archive", label: "Archive", icon: Archive },
  { id: "trash", label: "Trash", icon: Trash2 },
] as const;

const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

type ComposeDraft = EmailDraft & { forwardSource?: string };

export function EmailMailbox({ userId }: { userId: string }) {
  const { refresh, revision } = useEmailMailbox();
  const [folder, setFolder] = useState<EmailFolder>("inbox");
  const [search, setSearch] = useState("");
  const [unread, setUnread] = useState(false);
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState<EmailList>({ items: [], nextOffset: null });
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<ComposeDraft | null>(null);
  const [message, setMessage] = useState<EmailMessage | null>(null);
  const [selectedRead, setSelectedRead] = useState(true);
  const [issue, setIssue] = useState("");
  const [busy, setBusy] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const readingHeading = useRef<HTMLHeadingElement>(null);
  const openedRow = useRef<HTMLButtonElement>(null);
  const composeButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const onSaved = useCallback(() => setListVersion((v) => v + 1), []);

  useEffect(() => {
    if (draft) return;
    if (restoreFocus.current) {
      restoreFocus.current = false;
      const target = openedRow.current?.isConnected ? openedRow.current : composeButton.current;
      target?.focus();
    } else if (message) {
      readingHeading.current?.focus();
    }
  }, [draft, message]);

  useEffect(() => {
    const request = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await emailRequest<EmailList>(userId, {
          folder, q: search, unread: unread && folder !== "drafts" ? "1" : "0", offset: String(offset),
        }, { signal: request.signal });
        if (!request.signal.aborted) setList(result);
      } catch (error) {
        if (!request.signal.aborted) {
          setList({ items: [], nextOffset: null });
          if (error instanceof EmailRequestError && [401, 403, 409].includes(error.status)) {
            setDraft(null);
            setMessage(null);
          }
          setIssue(emailError(error));
        }
      } finally {
        if (!request.signal.aborted) setLoading(false);
      }
    }, search ? 220 : 0);
    return () => { clearTimeout(timer); request.abort(); };
  }, [folder, search, unread, offset, listVersion, revision, userId]);

  function switchFolder(next: EmailFolder) {
    setFolder(next);
    setOffset(0);
    setUnread(false);
    setMessage(null);
    setIssue("");
    if (next !== folder) {
      setLoading(true);
      setList({ items: [], nextOffset: null });
    }
  }

  async function perform(task: () => Promise<void>) {
    setBusy(true);
    setIssue("");
    try { await task(); }
    catch (error) { setIssue(emailError(error)); }
    finally { setBusy(false); }
  }

  function open(row: EmailRow, element: HTMLButtonElement) {
    openedRow.current = element;
    void perform(async () => {
      if (folder === "drafts") {
        setDraft(await emailRequest<EmailDraft>(userId, { view: "draft", id: row.id }));
      } else {
        const opened = await emailPost<EmailMessage>(userId, { action: "open", id: row.id });
        setMessage(opened);
        setSelectedRead(true);
        refresh();
      }
    });
  }

  function compose(mode?: "reply" | "all" | "forward") {
    const original = message && mode ? message : null;
    if (!original) openedRow.current = null;
    setDraft({
      id: crypto.randomUUID(), version: 0,
      subject: original ? replySubject(original.subject, mode === "forward" ? "Fwd" : "Re") : "",
      body: original && mode === "forward"
        ? Array.from("\n\n---------- Forwarded message ----------\nFrom: " + original.sender.name + "\nDate: " +
            date(original.sentAt) + "\nSubject: " + original.subject + "\n\n" + original.body).slice(0, 50_000).join("")
        : "",
      recipients: original && mode !== "forward" ? replyRecipients(original, userId, mode === "all") : [],
      attachments: [],
      forwardSource: mode === "forward" && original?.attachments.length ? original.id : undefined,
    });
  }

  function change(action: EmailAction) {
    void perform(async () => {
      await emailPost(userId, { action: "mailbox", id: action === "read_all" ? null : message?.id, change: action });
      if (action === "read" || action === "unread" || action === "read_all") setSelectedRead(action !== "unread");
      else setMessage(null);
      refresh();
    });
  }

  return <div className="flex min-h-0 flex-1 flex-col">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 md:px-6">
      <div className="flex items-center gap-2"><Mail className="size-5 text-muted-foreground" /><h1 className="text-xl font-semibold">Email</h1></div>
      {!draft && <Button ref={composeButton} onClick={() => compose()} disabled={busy}><Plus /> Compose</Button>}
    </header>
    {issue && <p role="alert" className="border-b px-4 py-2 text-sm text-destructive">{issue}</p>}
    {draft ? <EmailCompose userId={userId} key={draft.id} initial={draft} onSaved={onSaved} onClose={() => { restoreFocus.current = !message; setDraft(null); onSaved(); }}
      onSent={() => { setDraft(null); switchFolder("sent"); refresh(); }} />
      : <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav aria-label="Mail folders" className={cn("flex shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-36 md:flex-col md:border-r md:border-b-0", message && "hidden md:flex")}>
          {folders.map(({ id, label, icon: Icon }) => <Button key={id} variant={folder === id ? "secondary" : "ghost"}
            size="sm" aria-current={folder === id ? "page" : undefined} className="justify-start" disabled={busy}
            onClick={() => switchFolder(id)}><Icon /> {label}</Button>)}
        </nav>

        <section aria-label={folder + " messages"} className={cn("flex min-h-0 min-w-0 flex-1 flex-col border-r bg-card",
          message ? "hidden md:flex md:max-w-88" : "md:max-w-100")}>
          <div className="flex flex-col gap-2 border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <input type="search" aria-label="Search mail" placeholder="Search mail" maxLength={254} value={search}
                className="w-full rounded-md border bg-background py-2 pl-8 pr-2 text-sm" onChange={(event) => {
                  setSearch(event.target.value);
                  setOffset(0);
                }} />
            </div>
            {folder !== "drafts" && <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={unread}
                onChange={(event) => { setUnread(event.target.checked); setOffset(0); }} /> Unread</label>
              {folder === "inbox" && <Button size="sm" variant="ghost" disabled={busy} onClick={() => change("read_all")}>Mark all read</Button>}
            </div>}
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {list.items.length === 0 && <p className="p-4 text-sm text-muted-foreground" role="status">
              {loading ? "Loading mail…" : search ? "No matching messages." : "This folder is empty."}
            </p>}
            <ul className="divide-y">
              {list.items.map((row) => <li key={row.id}>
                <button type="button" disabled={busy} aria-current={message?.id === row.id ? "true" : undefined}
                  className={cn("w-full px-4 py-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-ring",
                    message?.id === row.id && "bg-muted", row.isRead === false && "bg-sidebar-accent/60")}
                  onClick={(event) => open(row, event.currentTarget)}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{row.recipients ? "To: " + row.recipients : row.sender || "Draft"}</span>
                    <time className="shrink-0 text-xs text-muted-foreground" dateTime={row.sentAt}>{date(row.sentAt)}</time>
                  </span>
                  <span className={cn("mt-1 block truncate text-sm", row.isRead === false && "font-semibold")}>
                    {row.isRead === false && <span className="sr-only">Unread. </span>}{row.subject || "(No subject)"}
                  </span>
                </button>
              </li>)}
            </ul>
          </div>
          {(offset > 0 || list.nextOffset !== null) && <div className="flex justify-between border-t p-2">
            <Button size="sm" variant="ghost" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 25))}><ChevronLeft /> Previous</Button>
            <Button size="sm" variant="ghost" disabled={list.nextOffset === null || loading}
              onClick={() => { if (list.nextOffset !== null) setOffset(list.nextOffset); }}>Next <ChevronRight /></Button>
          </div>}
        </section>

        {message ? <section aria-label="Message" className="min-w-0 flex-1 overflow-auto p-4 md:p-6">
          <Button size="sm" variant="ghost" className="-ml-2 mb-2 md:hidden" onClick={() => { restoreFocus.current = true; setMessage(null); }}><ChevronLeft /> Back to {folder}</Button>
          <h2 ref={readingHeading} tabIndex={-1} className="break-words text-xl font-semibold">{message.subject || "(No subject)"}</h2>
          <div className="mt-3 space-y-1 border-b pb-4 text-sm">
            <p><strong>From:</strong> {message.sender.name}</p>
            {(["to", "cc", "bcc"] as const).map((kind) => {
              const names = message.recipients.filter((recipient) => recipient.kind === kind).map(({ name }) => name);
              if (!names.length) return null;
              return <p key={kind} className="break-words"><strong>{{ to: "To", cc: "Cc", bcc: "Bcc" }[kind]}:</strong> {names.join(", ")}</p>;
            })}
            <time className="text-muted-foreground" dateTime={message.sentAt}>{date(message.sentAt)}</time>
          </div>
          <p className="min-h-20 whitespace-pre-wrap break-words py-4 text-sm leading-relaxed">{message.body}</p>
          {message.attachments.length > 0 && <ul aria-label="Attachments" className="mb-4 flex flex-wrap gap-2">
            {message.attachments.map((item) => <li key={item.id}>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void perform(() => downloadEmailAttachment(userId, item.id))}>
                {item.name}
              </Button>
            </li>)}
          </ul>}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {replyRecipients(message, userId, false).length > 0 && <Button size="sm" variant="outline" disabled={busy} onClick={() => compose("reply")}>Reply</Button>}
            {!message.isBcc && replyRecipients(message, userId, true).length > 1 &&
              <Button size="sm" variant="outline" disabled={busy} onClick={() => compose("all")}>Reply all</Button>}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => compose("forward")}>Forward</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => change(selectedRead ? "unread" : "read")}>
              {selectedRead ? "Mark unread" : "Mark read"}
            </Button>
            {message.folder === "trash" ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => change("restore")}>Restore</Button>
              : <>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => change(message.folder === "archive" ? "unarchive" : "archive")}>
                  {message.folder === "archive" ? "Move out of Archive" : "Archive"}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => change("trash")}>Move to Trash</Button>
              </>}
          </div>
        </section> : <div className="hidden flex-1 place-content-center text-sm text-muted-foreground md:grid">Select a message to read it.</div>}
      </div>}
  </div>;
}
