import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { choices, findModel, supportsEffort } from "./catalog";
import { isExpired, type Connection, type MonthlyUsage, type Provider, type RecentRun, type Selection, type Tool } from "./contracts";
import { PersonalAIError, RejectedKeyError } from "./errors";
import { checkProvider, estimateCharge, generate, quoteFor } from "./providers";

function encryptionKey() {
  const value = process.env.PERSONAL_AI_ENCRYPTION_KEY ?? "";
  return /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : null;
}

export function personalAIEnabled() {
  return process.env.AI_ENABLED !== "false" && process.env.PERSONAL_AI_ENABLED === "true" && encryptionKey() !== null;
}

function changeSecret(user: string, provider: Provider, value: string, decrypt = false): string {
  const key = encryptionKey();
  if (!key) throw new PersonalAIError("Personal API Connections are unavailable.");
  const aad = Buffer.from(JSON.stringify([user, provider]));
  if (!decrypt) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return ["v1", iv.toString("hex"), cipher.getAuthTag().toString("hex"), ciphertext.toString("hex")].join(".");
  }
  try {
    const [version, iv, tag, ciphertext] = value.split(".");
    if (version !== "v1" || iv.length !== 24 || tag.length !== 32) throw new Error();
    const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
    cipher.setAAD(aad);
    cipher.setAuthTag(Buffer.from(tag, "hex"));
    return Buffer.concat([cipher.update(Buffer.from(ciphertext, "hex")), cipher.final()]).toString("utf8");
  } catch {
    throw new PersonalAIError("Helios could not read this key. Replace it in API Connections.");
  }
}

type ConnectionRow = {
  provider: Provider; version: string; masked_key: string; model: string; effort: string; model_ids: string[];
  key_rejected: boolean;
  budget_micros: number; expires_at: string | null; provider_expires_at: string | null; last_checked_at: string;
};
const columns = "provider,version,masked_key,key_rejected,model,effort,model_ids,budget_micros,expires_at,provider_expires_at,last_checked_at";

function metadata(row: ConnectionRow): Connection {
  return {
    provider: row.provider, model: row.model, effort: row.effort, maskedKey: row.masked_key, keyRejected: row.key_rejected,
    models: choices(row.provider, row.model_ids), budgetMicros: row.budget_micros, expiresAt: row.expires_at,
    providerExpiresAt: row.provider_expires_at, checkedAt: row.last_checked_at,
  };
}

async function connection(userId: string, provider: Provider) {
  const { data, error } = await createAdminClient().from("personal_ai_connections")
    .select(columns).eq("user_id", userId).eq("provider", provider).maybeSingle();
  if (error) throw new PersonalAIError("API Connections could not be loaded.");
  return data as ConnectionRow | null;
}

export async function personalConnections(userId: string) {
  const { data, error } = await createAdminClient().from("personal_ai_connections")
    .select(columns).eq("user_id", userId).order("provider");
  if (error) throw new PersonalAIError("API Connections could not be loaded.");
  return (data as ConnectionRow[]).map(metadata);
}

export async function connectProvider(userId: string, selection: Selection, budgetMicros: number, expiresAt: string | null, apiKey?: string) {
  const { provider, model, effort } = selection;
  const db = createAdminClient();
  const existing = await connection(userId, provider);
  if (!apiKey && !existing) throw new PersonalAIError("Enter and test an API key first.", 400);
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) throw new PersonalAIError("Choose an expiration time in the future.", 400);
  const verified = apiKey ? await checkProvider(provider, apiKey) : null;
  const next = findModel(provider, model);
  const modelIds = verified ? verified.models.map(entry => entry.id) : existing!.model_ids;
  if (!next || !modelIds.includes(model)) throw new PersonalAIError("Choose a model available to this key.", 400);
  if (!supportsEffort(next, effort)) throw new PersonalAIError("This model does not support the selected effort.", 400);

  const values = {
    version: randomUUID(), model, effort, model_ids: modelIds, budget_micros: budgetMicros, expires_at: expiresAt,
    ...(apiKey && verified ? {
      secret: changeSecret(userId, provider, apiKey), masked_key: "••••" + apiKey.slice(-4), key_rejected: false,
      provider_expires_at: verified.providerExpiresAt, last_checked_at: new Date().toISOString(),
    } : {}),
  };
  const rows = db.from("personal_ai_connections");
  const { data, error } = await (existing
    ? rows.update(values).eq("user_id", userId).eq("provider", provider).eq("version", existing.version)
    : rows.insert({ ...values, user_id: userId, provider })).select(columns).maybeSingle();
  if (error?.code === "23505" || (!data && !error)) throw new PersonalAIError("This connection changed. Reload it and try again.", 409);
  if (error || !data) throw new PersonalAIError("The connection could not be saved.");
  return metadata(data as ConnectionRow);
}

export async function retestProvider(userId: string, provider: Provider) {
  const db = createAdminClient();
  const { data: row, error } = await db.from("personal_ai_connections").select(columns + ",secret")
    .eq("user_id", userId).eq("provider", provider).maybeSingle();
  if (error) throw new PersonalAIError("API Connections could not be loaded.");
  if (!row) throw new PersonalAIError("Connect this provider first.", 404);
  const saved = row as unknown as ConnectionRow & { secret: string };
  const checked = await checkProvider(provider, changeSecret(userId, provider, saved.secret, true))
    .catch(async (failure: unknown) => {
      if (failure instanceof RejectedKeyError) {
        const invalid = await flagRejectedKey(userId, provider, saved.version);
        if (invalid) return invalid;
      }
      throw failure;
    });
  if ("keyRejected" in checked) return checked;
  const { data, error: updateError } = await db.from("personal_ai_connections").update({
    model_ids: checked.models.map(model => model.id), version: randomUUID(), key_rejected: false,
    provider_expires_at: checked.providerExpiresAt, last_checked_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("provider", provider).eq("version", saved.version).select(columns).maybeSingle();
  if (updateError) throw new PersonalAIError("The connection could not be updated.");
  if (!data) throw new PersonalAIError("This connection changed. Reload it and try again.", 409);
  return metadata(data as ConnectionRow);
}

async function flagRejectedKey(userId: string, provider: Provider, version: string) {
  const { data } = await createAdminClient().from("personal_ai_connections")
    .update({ key_rejected: true, version: randomUUID(), last_checked_at: new Date().toISOString() })
    .eq("user_id", userId).eq("provider", provider).eq("version", version).select(columns).maybeSingle();
  return data ? metadata(data as ConnectionRow) : null;
}

export async function removeProvider(userId: string, provider: Provider) {
  const { error } = await createAdminClient().from("personal_ai_connections").delete().eq("user_id", userId).eq("provider", provider);
  if (error) throw new PersonalAIError("The connection could not be removed.");
}

export async function personalReport(userId: string) {
  const db = createAdminClient();
  const [month, recent] = await Promise.all([
    db.rpc("personal_ai_month", { p_user: userId }),
    db.from("personal_ai_runs").select("id,provider,model,effort,feature,total_tokens,cost_micros,reserved_micros,status,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(15),
  ]);
  if (month.error || recent.error) throw new PersonalAIError("Usage could not be loaded.");
  return { month: month.data as MonthlyUsage[], recent: recent.data as RecentRun[] };
}

type Prompt = Parameters<typeof quoteFor>[2];
async function prepare(userId: string, selection: Selection, prompt: Prompt) {
  const { provider, model, effort } = selection;
  const row = await connection(userId, provider);
  if (!row) throw new PersonalAIError("Connect this provider in API Connections first.", 404);
  if (row.key_rejected) throw new RejectedKeyError();
  if (isExpired(metadata(row))) throw new PersonalAIError("This connection has expired. Update it in API Connections.", 403);
  const approved = findModel(provider, model);
  if (!approved || !row.model_ids.includes(model)) throw new PersonalAIError("This model is unavailable. Choose another model.", 400);
  if (!supportsEffort(approved, effort)) throw new PersonalAIError("This model does not support the selected effort.", 400);
  return { model: approved, quote: quoteFor(approved, effort, prompt), version: row.version };
}

export async function personalQuote(userId: string, selection: Selection, prompt: Prompt) {
  return (await prepare(userId, selection, prompt)).quote;
}

export async function runPersonalAI(userId: string, selection: Selection, runId: string, feature: Tool | "email_draft", prompt: Prompt) {
  const { provider, effort } = selection;
  const { model, quote, version } = await prepare(userId, selection, prompt);
  const db = createAdminClient();
  const { data: secret, error } = await db.rpc("reserve_personal_ai_run", {
    p_user: userId, p_provider: provider, p_version: version, p_id: runId, p_model: model.id,
    p_effort: effort, p_feature: feature, p_reserve: quote.maxCostMicros,
  });
  if (error || typeof secret !== "string") {
    switch (error?.message) {
      case "budget_exceeded": throw new PersonalAIError("This request would exceed your monthly Helios spend limit.", 429);
      case "duplicate_run": throw new PersonalAIError("This request has already been submitted.", 409);
      case "connection_expired": throw new PersonalAIError("This connection has expired.", 403);
      case "key_rejected": throw new RejectedKeyError();
      case "connection_changed": case "connection_missing": throw new PersonalAIError("The connection changed. Reload it and try again.", 409);
      case "model_unavailable": throw new PersonalAIError("This model is unavailable. Choose another model.", 400);
      default: throw new PersonalAIError("The usage budget could not be checked. Try again.");
    }
  }
  async function settle(values: Record<string, unknown>) {
    const { error: failure } = await db.from("personal_ai_runs").update(values).eq("user_id", userId).eq("id", runId);
    if (failure) throw new PersonalAIError("Usage could not be recorded.", 503, false, heldReceipt);
  }
  const heldReceipt = { usage: null, costMicros: null, reservedMicros: quote.maxCostMicros };
  let key: string;
  try {
    key = changeSecret(userId, provider, secret, true);
  } catch (failure) {
    await settle({ status: "rejected", cost_micros: 0 });
    throw failure;
  }
  let response;
  try {
    response = await generate(provider, key, model, effort, prompt, quote.outputAllowance);
  } catch (failure) {
    const rejected = failure instanceof PersonalAIError && failure.rejected;
    await settle(rejected ? { status: "rejected", cost_micros: 0 } : { status: "unavailable" });
    if (failure instanceof RejectedKeyError) await flagRejectedKey(userId, provider, version);
    if (rejected) throw failure;
    throw new PersonalAIError(
      failure instanceof PersonalAIError ? failure.message : "The provider request could not be confirmed.",
      failure instanceof PersonalAIError ? failure.status : 502, false, heldReceipt,
    );
  }
  const { text, usage, rawUsage } = response;
  const costMicros = usage ? estimateCharge(provider, model, usage, rawUsage) : null;
  await settle(usage ? {
    status: "reported", cost_micros: costMicros, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens,
    total_tokens: usage.totalTokens, reasoning_tokens: usage.reasoningTokens,
  } : { status: "unavailable" });
  return { text, receipt: { usage, costMicros, reservedMicros: quote.maxCostMicros } };
}
