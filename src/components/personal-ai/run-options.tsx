"use client";

import Link from "next/link";
import { isExpired, PROVIDERS, usd, type Connection, type ModelChoice, type Quote, type Receipt, type Selection } from "@/lib/personal-ai/contracts";

export const aiField = "block w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm";
export const effortLabel = (effort: string) => ({
  default: "Model default", none: "None", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Maximum",
})[effort] ?? effort;

export function ModelOptions({ models, model, effort, onChange }: {
  models: ModelChoice[]; model: string; effort: string; onChange: (model: string, effort: string) => void;
}) {
  const choices = models.find(choice => choice.id === model)?.efforts ?? [];
  return <>
    <label className="block space-y-1 text-sm">
      <span>Model</span>
      <select className={aiField} value={model} onChange={event => {
        const next = models.find(choice => choice.id === event.target.value);
        onChange(event.target.value, next?.efforts.includes(effort) ? effort : "default");
      }}>
        {!models.some(choice => choice.id === model) && <option value={model}>{model ? "Choose an available model" : "Choose a model"}</option>}
        {models.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
      </select>
    </label>
    <label className="block space-y-1 text-sm">
      <span>Effort</span>
      <select className={aiField} disabled={!choices.length} value={choices.includes(effort) ? effort : "default"}
        onChange={event => onChange(model, event.target.value)}>
        <option value="default">{choices.length ? "Model default" : "Effort unavailable"}</option>
        {choices.map(value => <option key={value} value={value}>{effortLabel(value)}</option>)}
      </select>
    </label>
  </>;
}

export function RunOptions({ connections, selection, onChange, shared, disabled }: {
  connections: Connection[]; selection: Selection | null; onChange: (selection: Selection | null) => void;
  shared?: boolean; disabled?: boolean;
}) {
  const connection = connections.find(value => value.provider === selection?.provider);
  return <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-3">
    <label className="block space-y-1 text-sm">
      <span>Provider</span>
      <select className={aiField} value={selection?.provider ?? ""} onChange={event => {
        const next = connections.find(value => value.provider === event.target.value);
        onChange(next ? { provider: next.provider, model: next.model, effort: next.effort } : null);
      }}>
        <option value="">{shared ? "Shared Groq" : "Choose a provider"}</option>
        {connections.map(value => {
          const status = value.keyRejected ? " (key rejected)" : isExpired(value) ? " (expired)" : "";
          return <option key={value.provider} value={value.provider} disabled={!!status}>{PROVIDERS[value.provider].label}{status}</option>;
        })}
      </select>
    </label>
    {selection && connection && <ModelOptions models={connection.models} model={selection.model} effort={selection.effort}
      onChange={(model, effort) => onChange({ provider: selection.provider, model, effort })} />}
  </fieldset>;
}

export function ConnectionsLink() {
  return <Link href="/dashboard/settings#api-connections" className="font-medium text-primary underline underline-offset-4">API Connections</Link>;
}

export function QuotePreview({ quote }: { quote: Quote }) {
  return <p className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
    Estimated input {quote.inputTokens.toLocaleString()} tokens · Output allowance {quote.outputAllowance.toLocaleString()} tokens ·
    {" "}Estimated maximum {usd(quote.maxCostMicros)}
  </p>;
}

export function RunReceipt({ receipt }: { receipt: Receipt }) {
  const usage = receipt.usage;
  return <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground" aria-label="Run usage">
    {usage
      ? <p>{usage.inputTokens.toLocaleString()} input · {usage.outputTokens.toLocaleString()} output · <strong>{usage.totalTokens.toLocaleString()} total tokens</strong>{usage.reasoningTokens !== null && <> (including {usage.reasoningTokens.toLocaleString()} reasoning)</>}</p>
      : <p>Token usage unavailable</p>}
    <p>{receipt.costMicros === null ? "Estimated charge unavailable. Budget reservation " + usd(receipt.reservedMicros) : "Estimated charge " + usd(receipt.costMicros)}</p>
  </div>;
}
