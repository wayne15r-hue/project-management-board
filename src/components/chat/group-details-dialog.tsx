"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { ChatProfile, GroupDetails } from '@/types/chat';

interface Props {
  open: boolean;
  conversationId: string;
  currentUserId: string;
  refreshKey?: string;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void | Promise<void>;
  onAccessRevoked: () => void;
}
type Mutation = { action: 'rename'; name: string } | { action: 'add' | 'remove' | 'promote' | 'demote'; userId: string } | { action: 'leave' };

export function GroupDetailsDialog(props: Props) {
  return props.open ? <GroupDetailsContent key={props.conversationId} {...props}/> : null;
}

function GroupDetailsContent({ conversationId, currentUserId, refreshKey, onOpenChange, onChanged, onAccessRevoked }: Props) {
  const [details, setDetails] = useState<GroupDetails | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatProfile[]>([]);
  const initialized = useRef(false);
  const callbacks = useRef({ onChanged, onAccessRevoked });
  useEffect(() => { callbacks.current = { onChanged, onAccessRevoked }; }, [onChanged, onAccessRevoked]);
  const load = useCallback((signal?: AbortSignal, resetName = false) => fetch(`/api/conversations/${conversationId}/group`, { signal }).then(async response => {
    if (signal?.aborted) return;
    if (response.status === 403 || response.status === 404) { callbacks.current.onAccessRevoked(); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Couldn't load group details.");
    if (signal?.aborted) return;
    setDetails(data);
    if (!initialized.current || resetName) { initialized.current = true; setName(data.name ?? ''); }
  }), [conversationId]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [load, refreshKey]);
  const isAdmin = details?.members.some(m => m.id === currentUserId && m.is_admin) ?? false;
  const lastAdmin = isAdmin && details?.members.filter(m => m.is_admin).length === 1;
  useEffect(() => {
    if (!isAdmin) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/profile/search?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error("Couldn't search members.");
        const data = await response.json();
        if (!controller.signal.aborted) setResults(data);
      }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [isAdmin, query]);
  async function mutate(mutation: Mutation) {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/group`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mutation) });
      const data = await response.json();
      if (!response.ok) {
        // A demoted admin can still be a member. Only a detail read proves revocation.
        if (response.status === 403) await load();
        throw new Error(data.error || "Couldn't update group.");
      }
      if (mutation.action === 'leave') { callbacks.current.onAccessRevoked(); onOpenChange(false); return; }
      await load(undefined, mutation.action === 'rename');
      await callbacks.current.onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection lost. Please try again.'); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={open => { if (!saving) onOpenChange(open); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" showCloseButton={!saving}>
      <DialogHeader><DialogTitle>Group details</DialogTitle><DialogDescription>View members and roles. Leaving removes only your access.</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!details ? <div><p>Loading group details…</p>{error && <Button onClick={() => { setError(null); void load().catch(e => setError(e.message)); }}>Retry</Button>}</div> : <>
        {isAdmin ? <form onSubmit={e => { e.preventDefault(); void mutate({ action: 'rename', name: name.trim() }); }} className="space-y-2">
          <label htmlFor="group-name">Group name</label>
          <Input id="group-name" value={name} onChange={e => setName(e.target.value)} maxLength={100} required disabled={saving} aria-describedby="group-name-help"/>
          <p id="group-name-help" className="text-xs text-muted-foreground">Required, 1–100 characters.</p>
          <Button type="submit" disabled={saving || !name.trim() || name.trim().length > 100}>Save name</Button>
        </form> : <p className="font-medium">{details.name || 'Unnamed group'}</p>}
        <p>{details.members.length}/50 members</p>
        <ul className="space-y-3">{details.members.map(member => {
          const label = member.full_name || member.email;
          return <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <div><p>{label}{member.id === currentUserId ? ' (you)' : ''}</p><p className="text-xs text-muted-foreground">{member.is_admin ? 'Admin' : 'Member'}</p></div>
            {isAdmin && member.id !== currentUserId && <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={saving} aria-label={`${member.is_admin ? 'Demote' : 'Promote'} ${label}`} onClick={() => void mutate({action: member.is_admin ? 'demote' : 'promote', userId:member.id})}>{member.is_admin ? 'Demote' : 'Make admin'}</Button>
              <Button size="sm" variant="outline" disabled={saving} aria-label={`Remove ${label}`} onClick={() => void mutate({action:'remove',userId:member.id})}>Remove</Button>
            </div>}
          </li>;
        })}</ul>
        {isAdmin && <div className="space-y-2">
          <label htmlFor="group-add-search">Add member</label>
          <Input id="group-add-search" value={query} onChange={e => setQuery(e.target.value)} disabled={saving || details.members.length >= 50} placeholder="Search by name or email"/>
          {details.members.length >= 50 ? <p>Maximum 50 members reached.</p> : <ul>{results.filter(r => !details.members.some(m => m.id === r.id)).map(profile => <li key={profile.id} className="flex items-center justify-between gap-2 py-1"><span>{profile.full_name || profile.email}</span><Button variant="outline" size="sm" disabled={saving} aria-label={`Add ${profile.full_name || profile.email}`} onClick={() => void mutate({action:'add',userId:profile.id})}>Add</Button></li>)}</ul>}
        </div>}
        {lastAdmin && <p className="text-sm text-muted-foreground">You are the last admin. Make another member an admin before leaving.</p>}
        <Button variant="outline" disabled={saving || lastAdmin} onClick={() => void mutate({action:'leave'})}>Leave group</Button>
        {saving && <p role="status">Saving…</p>}
      </>}
    </DialogContent>
  </Dialog>;
}
