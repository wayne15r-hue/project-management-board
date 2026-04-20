// NOTE: Requires a Supabase Storage bucket named "attachments" to exist.
// Create it in the Supabase dashboard under Storage (private bucket).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const BUCKET = "attachments";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("card_id", cardId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add signed URLs for viewing/downloading. If the storage bucket isn't
  // configured yet, fall back to null URLs rather than throwing.
  const withUrls = await Promise.all(
    (data || []).map(async (a) => {
      try {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(a.storage_path, 60 * 60);
        return { ...a, url: signed?.signedUrl ?? null };
      } catch {
        return { ...a, url: null };
      }
    })
  );

  return NextResponse.json(withUrls);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 10 MB limit" }, { status: 400 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${cardId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    const msg = (uploadError.message || "").toLowerCase();
    if (msg.includes("bucket not found") || msg.includes("not found")) {
      return NextResponse.json(
        {
          error:
            'File attachments aren\'t configured yet. Create a private "attachments" bucket in Supabase Storage to enable uploads.',
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      card_id: cardId,
      file_name: file.name,
      file_size: file.size,
      file_type: file.type || "application/octet-stream",
      storage_path: path,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (error) {
    try {
      await supabase.storage.from(BUCKET).remove([path]);
    } catch {
      // ignore cleanup errors
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let signedUrl: string | null = null;
  try {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);
    signedUrl = signed?.signedUrl ?? null;
  } catch {
    signedUrl = null;
  }

  return NextResponse.json({ ...data, url: signedUrl }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const supabase = await createClient();

  const { id } = await request.json();

  const { data: row } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("id", id)
    .eq("card_id", cardId)
    .single();

  if (row?.storage_path) {
    try {
      await supabase.storage.from(BUCKET).remove([row.storage_path]);
    } catch {
      // ignore — bucket may not exist; still remove DB row
    }
  }

  const { error } = await supabase.from("attachments").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
