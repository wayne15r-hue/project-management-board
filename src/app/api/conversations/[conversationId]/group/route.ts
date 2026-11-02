import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { groupErrorStatus, groupMutation } from '../../group-validation';

type Context = { params: Promise<{ conversationId: string }> };
export async function GET(_request: Request, { params }: Context) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { conversationId } = await params;
  if (!z.uuid().safeParse(conversationId).success) return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 });
  const { data, error } = await supabase.rpc('group_details', { p_conversation_id: conversationId });
  if (error) return NextResponse.json({ error: error.message }, { status: groupErrorStatus(error.code) });
  return NextResponse.json(data);
}

export async function PATCH(request: Request, { params }: Context) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { conversationId } = await params;
  const parsed = groupMutation.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(conversationId).success || !parsed.success) return NextResponse.json({ error: 'Invalid group action, member ID or name (1–100 characters).' }, { status: 400 });
  const mutation = parsed.data;
  const { error } = await supabase.rpc('manage_group', {
    p_conversation_id: conversationId,
    p_action: mutation.action,
    p_user_id: 'userId' in mutation ? mutation.userId : null,
    p_name: 'name' in mutation ? mutation.name : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: groupErrorStatus(error.code) });
  return NextResponse.json({ ok: true });
}
