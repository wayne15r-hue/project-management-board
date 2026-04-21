import { createAdminClient } from "./admin";

type BucketSpec = {
  id: string;
  public: boolean;
  fileSizeLimit: number;
  allowedMimeTypes: string[] | null;
};

const BUCKETS: Record<"avatars" | "attachments", BucketSpec> = {
  avatars: {
    id: "avatars",
    public: true,
    fileSizeLimit: 2 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  },
  attachments: {
    id: "attachments",
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: null,
  },
};

// Process-local cache so we don't round-trip to Supabase on every request.
const ensured = new Set<string>();

export type EnsureBucketResult =
  | { ok: true }
  | { ok: false; reason: "no_service_key" | "permission" | "unknown"; message: string };

/**
 * Ensures a storage bucket exists. Safe to call from any route — uses
 * the service-role admin client. Returns structured errors that callers
 * can surface to the user with admin-friendly messaging.
 */
export async function ensureBucket(
  name: "avatars" | "attachments"
): Promise<EnsureBucketResult> {
  if (ensured.has(name)) return { ok: true };

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false,
      reason: "no_service_key",
      message:
        "Server is missing SUPABASE_SERVICE_ROLE_KEY. Ask an admin to set it or apply migration 00006_storage_buckets.sql manually.",
    };
  }

  const spec = BUCKETS[name];
  const admin = createAdminClient();

  try {
    const { data: existing, error: getErr } = await admin.storage.getBucket(
      spec.id
    );
    if (existing && !getErr) {
      ensured.add(name);
      return { ok: true };
    }

    const { error: createErr } = await admin.storage.createBucket(spec.id, {
      public: spec.public,
      fileSizeLimit: spec.fileSizeLimit,
      allowedMimeTypes: spec.allowedMimeTypes ?? undefined,
    });

    if (createErr) {
      const msg = (createErr.message || "").toLowerCase();
      // Already exists — race with a parallel request, that's fine.
      if (msg.includes("already exists") || msg.includes("duplicate")) {
        ensured.add(name);
        return { ok: true };
      }
      if (msg.includes("permission") || msg.includes("not authorized")) {
        return {
          ok: false,
          reason: "permission",
          message:
            "Service role key lacks permission to create storage buckets. Apply migration 00006_storage_buckets.sql.",
        };
      }
      return {
        ok: false,
        reason: "unknown",
        message: createErr.message,
      };
    }

    ensured.add(name);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: "unknown",
      message: err instanceof Error ? err.message : "Bucket setup failed.",
    };
  }
}
