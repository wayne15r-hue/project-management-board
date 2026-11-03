"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, AtSign, UserPlus, MessageSquare } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Actor {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string;
}

interface Notification {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  type: string;
  ticket_id?: string;
  request_id?: string;
  card_id: string | null;
  board_id: string | null;
  activity_log_id: string | null;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  actor: Actor | null;
  card_title: string | null;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function initialsOf(actor: Actor | null): string {
  const source = actor?.full_name || actor?.email || "?";
  return source
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function iconFor(type: Notification["type"]) {
  if (type === "assignment") return <UserPlus className="h-3 w-3" />;
  if (type === "mention") return <AtSign className="h-3 w-3" />;
  return <MessageSquare className="h-3 w-3" />;
}

export function NotificationBell({userId}:{userId:string}) { return <NotificationBellContent key={userId} userId={userId}/>; }
function NotificationBellContent({ userId }: { userId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [error,setError]=useState("");
  const [writing,setWriting]=useState(false);
  const session=useRef<{active:boolean;controller:AbortController;sequence:number}|null>(null);
  const load=useCallback(async()=>{
    const current=session.current;if(!current?.active)return;
    const sequence=++current.sequence;
    try{
      const res=await fetch("/api/notifications",{signal:current.controller.signal,cache:"no-store"});
      if(!res.ok)throw new Error("Unable to load notifications. Please retry.");
      const data=await res.json();
      if(!current.active||sequence!==current.sequence)return;
      setNotifications(data.notifications??[]);setUnread(data.unread_count??0);setError("");
    }catch(err){if(current.active&&sequence===current.sequence)setError(err instanceof Error?err.message:"Unable to load notifications.");}
    finally{if(current.active&&sequence===current.sequence)setLoading(false);}
  },[]);
  useEffect(()=>{
    const current={active:true,controller:new AbortController(),sequence:0};session.current=current;
    void load();
    const supabase=createClient();
    const channel=supabase.channel(`notifications-${userId}`).on("postgres_changes",{event:"*",schema:"public",table:"notifications",filter:`recipient_id=eq.${userId}`},()=>{if(current.active)void load();}).on("postgres_changes",{event:"*",schema:"public",table:"desk_notifications",filter:`recipient_id=eq.${userId}`},()=>{if(current.active)void load();}).subscribe((status)=>{if(status==="SUBSCRIBED"&&current.active)void load();});
    const refresh=()=>{if(current.active)void load();};
    window.addEventListener("focus",refresh);window.addEventListener("online",refresh);window.addEventListener('service-desk-updated',refresh);
    const timer=window.setInterval(refresh,30000);
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{
      if(next?.user.id===userId)return;current.active=false;current.controller.abort();setNotifications([]);setUnread(0);setOpen(false);setError("");
    });
    return()=>{current.active=false;current.controller.abort();subscription.unsubscribe();void supabase.removeChannel(channel);window.removeEventListener("focus",refresh);window.removeEventListener("online",refresh);window.removeEventListener('service-desk-updated',refresh);window.clearInterval(timer);};
  },[userId,load]);
  async function markRead(url:string){
    const current=session.current;if(!current?.active||writing)return false;
    setWriting(true);setError("");
    try{const res=await fetch(url,{method:"POST",signal:current.controller.signal});if(!res.ok)throw new Error("Unable to mark notifications read. Please retry.");if(!current.active)return false;await load();return true;}
    catch(err){if(current.active)setError(err instanceof Error?err.message:"Unable to mark notifications read.");return false;}
    finally{if(current.active)setWriting(false);}
  }
  async function handleClickNotification(n:Notification){
    const current=session.current;
    if(!n.read_at&&!await markRead(`/api/notifications/${n.id}/read`))return;
    if(!current?.active)return;setOpen(false);
    if(n.request_id)router.push(`/dashboard/leave-desk/${n.request_id}`);
    else if(n.ticket_id)router.push(`/dashboard/service-desk/${n.ticket_id}`);
    else if(n.board_id)router.push(`/dashboard/board/${n.board_id}${n.card_id?`?card=${n.card_id}`:""}`);
  }
  async function handleMarkAllRead(){await markRead("/api/notifications/read-all");}
  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <Popover open={open} onOpenChange={value=>{setOpen(value);if(value)void load();}}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Notifications"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white">
                {badge}
              </span>
            )}
          </button>
        }
      />
      <PopoverContent align="end" className="w-[min(360px,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-[13px] font-semibold">Notifications</p>
          {unread > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead} disabled={writing}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <Check className="h-3 w-3" />
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto">{error&&<div role="alert" className="p-3 text-sm"><p>{error}</p><button type="button" className="mt-2 underline" onClick={()=>void load()}>Retry loading notifications</button></div>}
          {loading ? (
            <div className="space-y-1 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-md bg-muted/50"
                />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <Bell className="h-6 w-6 text-muted-foreground opacity-50" />
              <p className="text-[13px] text-muted-foreground">
                No notifications yet.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => {
                const isUnread = !n.read_at;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleClickNotification(n)}
                      className={cn(
                        "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent",
                        isUnread && "bg-primary/5"
                      )}
                    >
                      <div className="relative shrink-0">
                        <div
                          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[#7CAFC4] text-[11px] font-semibold text-white"
                          style={
                            n.actor?.avatar_url
                              ? {
                                  backgroundImage: `url(${n.actor.avatar_url})`,
                                  backgroundSize: "cover",
                                  backgroundPosition: "center",
                                }
                              : undefined
                          }
                        >
                          {!n.actor?.avatar_url && initialsOf(n.actor)}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-background bg-muted text-muted-foreground">
                          {iconFor(n.type)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-[13px]",
                            isUnread
                              ? "font-semibold text-foreground"
                              : "text-muted-foreground"
                          )}
                        >
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="line-clamp-2 text-[12px] text-muted-foreground">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {relativeTime(n.created_at)}
                        </p>
                      </div>
                      {isUnread && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-border px-3 py-2 text-right">
          <Link
            href="/dashboard/settings"
            onClick={() => setOpen(false)}
            className="text-[11px] text-muted-foreground hover:underline"
          >
            Notification settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
