import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { normalizeUsage } from "@/lib/personal-ai/usage";

it("counts Gemini thoughts once and keeps missing provider counts unknown", () => {
  expect(normalizeUsage("gemini", { promptTokenCount: 300, candidatesTokenCount: 50, thoughtsTokenCount: 70, totalTokenCount: 420 }))
    .toMatchObject({ inputTokens: 300, outputTokens: 120, reasoningTokens: 70, totalTokens: 420 });
  expect(normalizeUsage("openai", { input_tokens: 300, output_tokens: 120, output_tokens_details: { reasoning_tokens: 70 } }))
    .toMatchObject({ inputTokens: 300, outputTokens: 120, reasoningTokens: 70, totalTokens: 420 });
  expect(normalizeUsage("groq", null)).toBeNull();
  expect(normalizeUsage("gemini", { promptTokenCount: 300, thoughtsTokenCount: 90, totalTokenCount: 390 }))
    .toEqual({ inputTokens: 300, outputTokens: 90, reasoningTokens: 90, totalTokens: 390 });
});

it("enforces private ownership, idempotency, expiry and an atomic provider budget", async () => {
  const db = new PGlite();
  const owner = "10000000-0000-4000-8000-000000000001";
  const other = "10000000-0000-4000-8000-000000000002";
  const version = "10000000-0000-4000-8000-000000000003";
  const first = "10000000-0000-4000-8000-000000000004";
  const second = "10000000-0000-4000-8000-000000000005";
  const reserve = (user: string, id: string) => db.query("select * from reserve_personal_ai_run($1,'groq',$2,$3,'openai/gpt-oss-20b','low','notes_to_tasks',3000000)", [user, version, id]);
  try {
    await db.exec("create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role bypassrls;");
    await db.query("insert into auth.users values ($1),($2)", [owner, other]);
    await db.exec(readFileSync("supabase/migrations/20261116_personal_ai.sql", "utf8"));
    await db.query("insert into personal_ai_connections(user_id,provider,version,secret,model,model_ids,budget_micros,last_checked_at) values($1,'groq',$2,'encrypted','openai/gpt-oss-20b','{openai/gpt-oss-20b}',5000000,now())", [owner, version]);
    await db.exec("set role authenticated");
    await expect(db.query("select secret from personal_ai_connections")).rejects.toThrow(/permission denied/i);
    await expect(reserve(owner, first)).rejects.toThrow(/permission denied/i);
    await db.exec("set role service_role");
    await expect(reserve(other, first)).rejects.toThrow(/connection_missing/);
    const results = await Promise.allSettled([reserve(owner, first), reserve(owner, second)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { message: "budget_exceeded" } });
    const accepted = results[0].status === "fulfilled" ? first : second;
    const remaining = accepted === first ? second : first;
    await expect(reserve(owner, accepted)).rejects.toThrow(/duplicate_run/);
    await db.query("update personal_ai_connections set secret='replacement' where user_id=$1", [owner]);
    await expect(reserve(owner, remaining)).rejects.toThrow(/budget_exceeded/);
    await db.query("update personal_ai_runs set created_at=(date_trunc('month',now() at time zone 'UTC') at time zone 'UTC') - interval '1 second' where user_id=$1", [owner]);
    expect((await reserve(owner, remaining)).rows).toEqual([{ reserve_personal_ai_run: "replacement" }]);
    const month = (await db.query("select * from personal_ai_month($1)", [owner])).rows;
    expect(month).toEqual([expect.objectContaining({ runs: 1, unknown_runs: 1, pending_micros: 3000000 })]);
    await db.query("update personal_ai_connections set expires_at=now()-interval '1 second' where user_id=$1", [owner]);
    await expect(reserve(owner, remaining)).rejects.toThrow(/connection_expired/);
  } finally {
    await db.close();
  }
}, 20000);
