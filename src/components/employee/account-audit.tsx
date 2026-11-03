'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accountRead,accountDate } from './account-controls';
import type { AccountAuditPage } from '@/types/accounts';

export function AccountAudit() {
  const [query,setQuery]=useState(''),[page,setPage]=useState(1);
  const audit=useQuery({queryKey:['employee-admin','audit',query,page],queryFn:()=>accountRead<AccountAuditPage>(`/api/admin/audit?q=${encodeURIComponent(query)}&page=${page}`)});
  return <section className="space-y-4" aria-label="Account audit log">
    <div className="space-y-2"><Label htmlFor="audit-search">Search audit log</Label><Input id="audit-search" maxLength={100} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="Actor, target, action or outcome"/></div>
    {audit.isPending&&<p>Loading audit log…</p>}{audit.error&&<p role="alert">{audit.error.message}</p>}
    {audit.data?.items.map(entry=><article key={entry.id} className="space-y-2 rounded-lg border p-4 text-sm break-words"><p className="font-medium">{entry.action}</p><dl className="grid gap-2 sm:grid-cols-2"><div><dt className="text-muted-foreground">Actor</dt><dd className="break-all">{entry.actor}</dd></div><div><dt className="text-muted-foreground">Target</dt><dd className="break-all">{entry.target}</dd></div><div><dt className="text-muted-foreground">Outcome</dt><dd>{entry.outcome}</dd></div><div><dt className="text-muted-foreground">When</dt><dd>{accountDate(entry.createdAt)}</dd></div></dl></article>)}
    {audit.data?.items.length===0&&<p className="text-sm text-muted-foreground">No audit entries found.</p>}
    <div className="flex flex-wrap items-center gap-3 text-sm"><Button variant="outline" aria-label="Previous audit page" disabled={page===1||audit.isFetching} onClick={()=>setPage(p=>p-1)}>Previous</Button><span>Page {page} · {audit.data?.total??0} entries</span><Button variant="outline" aria-label="Next audit page" disabled={!audit.data||page*25>=audit.data.total||audit.isFetching} onClick={()=>setPage(p=>p+1)}>Next</Button><Button variant="ghost" disabled={audit.isFetching} onClick={()=>void audit.refetch()}>Refresh audit log</Button></div>
  </section>;
}
