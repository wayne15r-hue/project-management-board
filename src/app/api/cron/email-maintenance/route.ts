import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_BUCKET } from "@/lib/email/files";

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createAdminClient();
    let failed = 0;
    let removed = 0;
    let purged = 0;
    const until = Date.now() + 40_000;
    // Bound work per invocation; outstanding rows remain eligible for the next run.
    for (let batch = 0; batch < 8 && Date.now() < until; batch++) {
      const { data, error } = await db.rpc("email_claim_cleanup");
      if (error) throw error;
      const batchResult = data as { jobs: { id: string; path: string }[]; purged: number };
      const { jobs } = batchResult;
      purged += batchResult.purged;
      if (!jobs.length) {
        if (!batchResult.purged) break;
        continue;
      }

      const result = await db.storage.from(EMAIL_BUCKET).remove(jobs.map(({ path }) => path));
      for (const { id } of jobs) {
        const finished = await db.rpc("email_finish_cleanup", { p_id: id, p_success: !result.error });
        if (result.error || finished.error) failed++;
        else removed++;
      }
    }
    const limit = Number(process.env.EMAIL_STORAGE_LIMIT_BYTES);
    if (Number.isSafeInteger(limit) && limit > 0) {
      const { data: bytes, error } = await db.rpc("email_project_storage_bytes");
      if (error) {
        failed++;
        console.error("Helios Email storage monitoring failed");
      } else if (Number(bytes) >= limit * 0.7) {
        console.warn("Helios project Storage reached 70% of its allowance", { bytes, limit });
      }
    }
    if (failed) console.error("Helios Email cleanup will retry", { failed });
    return Response.json({ removed, purged, failed }, { status: failed ? 503 : 200 });
  } catch {
    console.error("Helios Email cleanup failed");
    return Response.json({ error: "Email cleanup unavailable." }, { status: 503 });
  }
}
