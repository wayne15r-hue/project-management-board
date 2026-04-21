import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureBucket } from "@/lib/supabase/storage-setup";

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const BUCKET = "avatars";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Please upload an image file" },
      { status: 400 }
    );
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return NextResponse.json(
      { error: "Image must be under 3MB" },
      { status: 400 }
    );
  }

  const bucketResult = await ensureBucket("avatars");
  if (!bucketResult.ok) {
    return NextResponse.json(
      { error: bucketResult.message },
      { status: 503 }
    );
  }

  const ext = file.name.split(".").pop() || "png";
  const path = `${user.id}/avatar-${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = data.publicUrl;

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ avatar_url: publicUrl });
}
