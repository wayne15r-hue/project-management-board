"use client";

import { useEffect, useState } from "react";
import { ExternalLink, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestPersonalAI } from "@/lib/personal-ai/client";
import { isExpired, PROVIDERS, TOOLS, usd, type Connection, type ConnectionCheck, type MonthlyUsage, type Provider, type RecentRun } from "@/lib/personal-ai/contracts";
import { aiField, effortLabel, ModelOptions } from "./run-options";

const path = "/api/personal-ai/connections";
type Report = { connections: Connection[]; month: MonthlyUsage[]; recent: RecentRun[] };

export function ApiConnections({ userId }: { userId: string }) {
  const [data, setData] = useState<Report | null>(null);
  const [provider, setProvider] = useState<Provider>("openai");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    requestPersonalAI<Report>(userId, path + "?usage=1", undefined, controller.signal)
      .then(data => { setData(data); setError(""); })
      .catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [userId, revision]);

  const connection = data?.connections.find(value => value.provider === provider);
  const used = data?.month.filter(row => row.provider === provider).reduce(
    (sum, row) => ({ cost: sum.cost + row.cost_micros, pending: sum.pending + row.pending_micros }),
    { cost: 0, pending: 0 },
  );
  const percent = connection && used ? (used.cost + used.pending) / connection.budgetMicros * 100 : 0;
  return <section id="api-connections" aria-labelledby="api-connections-title" className="scroll-mt-6 space-y-4">
    <h2 id="api-connections-title" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
      <KeyRound className="size-4" aria-hidden="true" /> API Connections
    </h2>
    <div className="space-y-4 rounded-xl border border-border p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="min-w-44 space-y-1 text-sm">
          <span>Provider</span>
          <select className={aiField} value={provider} onChange={event => setProvider(event.target.value as Provider)}>
            {(Object.keys(PROVIDERS) as Provider[]).map(value => <option key={value} value={value}>{PROVIDERS[value].label}</option>)}
          </select>
        </label>
        <a href={PROVIDERS[provider].keys} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 py-2 text-sm font-medium text-primary underline underline-offset-4">
          Get API key <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!data && !error && <p role="status" className="text-sm text-muted-foreground">Loading connections…</p>}
      {data && <>
        {connection && used && <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
          <p className="font-medium">{connection.keyRejected ? "Key rejected" : isExpired(connection) ? "Expired"
            : connection.models.some(model => model.id === connection.model) ? "Connected" : "Choose a new model"} · {connection.maskedKey}</p>
          <p className="text-xs text-muted-foreground">Key checked {new Date(connection.checkedAt).toLocaleString()}</p>
          {connection.providerExpiresAt && <p className="text-xs text-muted-foreground">Provider expiration {new Date(connection.providerExpiresAt).toLocaleString()}</p>}
          <p className="text-xs">Estimated spend {usd(used.cost)} · Reserved {usd(used.pending)} · Monthly limit {usd(connection.budgetMicros)}</p>
          <progress className="h-1.5 w-full accent-primary" max={100} value={Math.min(100, percent)} aria-label="Monthly budget used" />
          {percent >= 80 && <p className="text-xs font-medium">{percent >= 100 ? "Monthly limit reached." : "At least 80% of this month’s limit is spent or reserved."}</p>}
        </div>}
        <ConnectionForm key={provider + ":" + revision} userId={userId} provider={provider} connection={connection}
          onUpdate={() => { setData(null); setRevision(value => value + 1); }} />
      </>}
    </div>
    {data && <UsageReport report={data} onRefresh={() => { setData(null); setRevision(value => value + 1); }} />}
  </section>;
}

function localTime(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function ConnectionForm({ userId, provider, connection, onUpdate }: {
  userId: string; provider: Provider; connection?: Connection; onUpdate: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [checked, setChecked] = useState<ConnectionCheck | null>(null);
  const [model, setModel] = useState(connection?.model ?? "");
  const [effort, setEffort] = useState(connection?.effort ?? "default");
  const [budget, setBudget] = useState((connection ? connection.budgetMicros / 1_000_000 : 5).toFixed(2));
  const [expiry, setExpiry] = useState(localTime(connection?.expiresAt));
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [replacing, setReplacing] = useState(!connection);
  const models = checked?.models ?? (replacing ? [] : connection?.models ?? []);

  async function act(action: "check" | "save" | "retest" | "remove") {
    if (busy) return;
    setBusy(action);
    setProblem("");
    setNotice("");
    try {
      if (action === "check") {
        const result = await requestPersonalAI<ConnectionCheck>(userId, path, JSON.stringify({ action, provider, apiKey }));
        setChecked(result);
        const matching = result.models.find(choice => choice.id === model);
        setModel(matching?.id ?? "");
        if (!matching?.efforts.includes(effort)) setEffort("default");
        setNotice(result.models.length ? "Key check passed. Generation depends on model and billing permissions."
          : "Key check passed. No supported text models were found for this key.");
        return;
      }
      if (action === "save") {
        const budgetMicros = Math.round(Number(budget) * 1_000_000);
        if (budgetMicros < 10_000 || budgetMicros > 1_000_000_000 || !Number.isFinite(budgetMicros)) {
          throw new Error("Enter a monthly limit between US$0.01 and US$1,000.");
        }
        await requestPersonalAI<Connection>(userId, path, JSON.stringify({
          action, selection: { provider, model, effort }, budgetMicros, expiresAt: expiry ? new Date(expiry).toISOString() : null,
          ...(replacing ? { apiKey } : {}),
        }));
        setApiKey("");
      } else {
        await requestPersonalAI(userId, path, JSON.stringify({ action, provider }));
      }
      onUpdate();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "The connection could not be updated.");
    } finally {
      setBusy("");
    }
  }

  return <fieldset disabled={!!busy} className="space-y-4">
    {replacing && <div className="space-y-2">
      <label className="block space-y-1 text-sm">
        <span>{connection ? "Replacement API key" : "API key"}</span>
        <input className={aiField} type="password" value={apiKey} autoComplete="off" spellCheck={false} maxLength={1024}
          onChange={event => { setApiKey(event.target.value); setChecked(null); setNotice(""); setProblem(""); }} />
      </label>
      <Button type="button" size="sm" variant="outline" disabled={!apiKey.trim()} onClick={() => void act("check")}>Test key</Button>
    </div>}
    {models.length > 0 && <div className="grid gap-3 sm:grid-cols-2">
      <ModelOptions models={models} model={model} effort={effort} onChange={(model, effort) => { setModel(model); setEffort(effort); }} />
      <label className="block space-y-1 text-sm">
        <span>Monthly Helios limit (USD)</span>
        <input className={aiField} type="number" min="0.01" max="1000" step="0.01" value={budget} onChange={event => setBudget(event.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Helios expiration (optional)</span>
        <input className={aiField} type="datetime-local" value={expiry} onChange={event => setExpiry(event.target.value)} />
      </label>
    </div>}
    <div className="flex flex-wrap gap-2">
      {models.length > 0 && <Button type="button" size="sm" disabled={!models.some(value => value.id === model)}
        onClick={() => void act("save")}>{connection ? "Save changes" : "Save connection"}</Button>}
      {connection && !replacing && <>
        <Button type="button" size="sm" variant="outline" onClick={() => void act("retest")}>Retest key</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { setReplacing(true); setConfirmRemoval(false); }}>Replace key</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRemoval(true)}>Remove key</Button>
      </>}
      {connection && replacing && <Button type="button" size="sm" variant="ghost" onClick={() => {
        setReplacing(false); setApiKey(""); setChecked(null); setNotice(""); setProblem("");
        setModel(connection.model); setEffort(connection.effort);
      }}>Cancel replacement</Button>}
      {confirmRemoval && <>
        <Button type="button" size="sm" variant="destructive" onClick={() => void act("remove")}>Confirm removal</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRemoval(false)}>Cancel</Button>
      </>}
    </div>
    {busy && <p role="status" className="text-xs text-muted-foreground">Updating connection…</p>}
    {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
    {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
    <p className="text-xs text-muted-foreground">Limits reset on the first of the month at midnight UTC. Costs are Helios estimates. Check your provider for its bill.</p>
  </fieldset>;
}

const usage = (count: number | null) => count?.toLocaleString() ?? "Unavailable";

function UsageReport({ report, onRefresh }: { report: Report; onRefresh: () => void }) {
  return <div className="space-y-4 rounded-xl border p-4 sm:p-5">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">This month’s personal AI usage</h3>
      <Button type="button" size="sm" variant="outline" onClick={onRefresh}>Refresh</Button>
    </div>
    {!report.month.length && <p className="text-xs text-muted-foreground">No personal AI requests this month.</p>}
    <ul className="space-y-2">
      {report.month.map(row => <li key={row.provider + "/" + row.model} className="space-y-1 rounded-md bg-muted/40 p-3 text-xs">
        <p className="font-medium">{PROVIDERS[row.provider].label} · {row.model}</p>
        <p>{usage(row.input_tokens)} input · {usage(row.output_tokens)} output · {usage(row.total_tokens)} total tokens
          {row.reasoning_tokens !== null && <> (including {usage(row.reasoning_tokens)} reasoning)</>}</p>
        <p className="text-muted-foreground">{row.runs} {row.runs === 1 ? "run" : "runs"} · {usd(row.cost_micros)} estimated
          {row.pending_micros > 0 && <> · {usd(row.pending_micros)} reserved</>}
          {row.unknown_runs > 0 && <> · {row.unknown_runs} with usage unavailable</>}</p>
      </li>)}
    </ul>
    {report.recent.length > 0 && <details className="text-sm">
      <summary className="cursor-pointer font-medium">Recent runs</summary>
      <ul className="mt-2 divide-y">
        {report.recent.map(row => <li key={row.id} className="space-y-1 py-2 text-xs">
          <p className="font-medium">{row.feature === "email_draft" ? "Email draft" : TOOLS[row.feature]?.label} · {PROVIDERS[row.provider].label} · {row.model}</p>
          <p className="text-muted-foreground">{new Date(row.created_at).toLocaleString()} · {effortLabel(row.effort)} · {usage(row.total_tokens)} tokens · {row.cost_micros === null
            ? usd(row.reserved_micros) + " reserved"
            : row.status === "rejected" ? "Rejected" : usd(row.cost_micros) + " estimated"}</p>
        </li>)}
      </ul>
    </details>}
  </div>;
}
