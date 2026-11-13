// Real client components, fictional fixtures, loopback only. No production or device access.
import {createServer} from '../node_modules/vite/dist/node/index.js';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(repo,'../output/helios-solar-observatory/preview');fs.mkdirSync(root,{recursive:true});
const port=Number(process.env.HELIOS_PREVIEW_PORT || 4320);
const route=file=>repo.replaceAll('\\','/')+'/src/'+file;
fs.writeFileSync(path.join(root,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Helios local implementation preview</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script>window.process={env:{}};</script><div id="root"></div><script type="module" src="/preview.jsx"></script></body></html>`);
fs.writeFileSync(path.join(root,'preview.jsx'),`
import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
import { LandingPage } from '${route('components/landing/landing-page.tsx')}';
import AuthLayout from '${route('app/(auth)/layout.tsx')}';
import BoardPage from '${route('app/(dashboard)/dashboard/board/[boardId]/page.tsx')}';
import { AuthSessionBoundary } from '${route('components/shared/auth-session-boundary.tsx')}';
import { WorkspaceShell } from '${route('components/shared/workspace-shell.tsx')}';
import { DashboardStats } from '${route('components/dashboard/dashboard-stats.tsx')}';
import { RecentActivity } from '${route('components/dashboard/recent-activity.tsx')}';
import{ThemeProvider}from'${route('components/shared/theme-provider.tsx')}';import{TooltipProvider}from'${route('components/ui/tooltip.tsx')}';
import Login from'${route('app/(auth)/login/page.tsx')}';
import{ChatShell}from'${route('components/chat/chat-shell.tsx')}';import{CallRoom}from'${route('components/calls/call-room.tsx')}';import{CallProvider}from'${route('components/calls/call-provider.tsx')}';
import{SettingsForm}from'${route('components/settings/settings-form.tsx')}';import{EmployeeAdmin}from'${route('components/employee/employee-admin.tsx')}';import{Sidebar}from'${route('components/shared/sidebar.tsx')}';
import{BoardList}from'${route('components/board/board-list.tsx')}';import{MyWork}from'${route('components/my-work/my-work.tsx')}';import{ServiceDesk}from'${route('components/service-desk/service-desk.tsx')}';import{LeaveDesk}from'${route('components/leave-desk/leave-desk.tsx')}';import{Button}from'${route('components/ui/button.tsx')}';import{useTheme}from'${route('components/shared/theme-provider.tsx')}';import{Toaster}from'${route('components/ui/sonner.tsx')}';import{fixture,user,boards,call}from'/fixtures.js';import'${route('app/globals.css')}';
Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{enumerateDevices:async()=>[],addEventListener(){},removeEventListener(){},getSupportedConstraints:()=>({}),getUserMedia:async()=>{throw new Error('Device access is disabled in this local preview.');},getDisplayMedia:async()=>{throw new DOMException('Preview only','NotAllowedError');}}});
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
const reviewBoards = [boards[0], {...boards[0], id:'10000000-0000-4000-8000-000000000002', name:'Cross-functional onboarding and delivery readiness', description:'Coordinate milestones, owners and weekly updates.'}];
const reviewStats = {
  [reviewBoards[0].id]: {total:12, done:8, overdue:2},
  [reviewBoards[1].id]: {total:9, done:3, overdue:0}
};
const screens = ['landing','login','boards','boards-empty','board','my-work','my-work-empty','service-desk','leave-desk','chat','calls','settings','admin'];
function App() {
  const [screen,setScreen] = useState(new URLSearchParams(location.search).get('screen') || 'landing');
  const [expanded,setExpanded] = useState(true);
  const [admin,setAdmin] = useState(new URLSearchParams(location.search).get('role') !== 'member');
  const {theme,setTheme} = useTheme();
  window.previewPath = screen==='board' ? '/dashboard/board/'+boards[0].id : ['boards','boards-empty'].includes(screen) ? '/dashboard' : '/dashboard/'+screen.replace('-empty','');
  fixture.workEmpty = screen==='my-work-empty';
  window.previewNavigate = (url) => {
    const {pathname, search} = new URL(url,location.origin);
    if (pathname==='/' || pathname==='/login') return setScreen(pathname==='/'?'landing':'login');
    const route = pathname.split('/')[2];
    if (search) history.replaceState(null,'',search);
    setScreen(screens.includes(route)?route:'boards');
  };
  const shownBoards = screen==='boards-empty' ? [] : reviewBoards;
  let content;
  if (screen==='landing') content=<LandingPage/>;
  else if (screen==='login') content=<AuthLayout><Login/></AuthLayout>;
  else {
    let page;
    if (screen==='boards'||screen==='boards-empty') page=(
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-5 md:px-7 md:py-7">
        <header className="workspace-page-intro mb-5"><h1>All Boards</h1><p className="mt-2 text-sm text-muted-foreground">Jordan, here’s what’s happening across your projects.</p></header>
        <div className="mb-6"><DashboardStats/></div>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
          <div className="min-w-0"><h2 className="mb-4 text-lg font-semibold tracking-tight">Your boards</h2><BoardList boards={shownBoards} userId={user.id} boardStats={reviewStats}/></div>
          <RecentActivity/>
        </div>
      </div>
    );
    else if (screen==='board') page=<BoardPage/>;
    else if (screen==='chat') page=<ChatShell currentUser={user}/>;
    else if (screen==='calls') page=<section className="mx-auto max-w-5xl space-y-5 p-5"><div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-semibold">Operations catch-up</h1><Button variant="outline" onClick={()=>setExpanded(v=>!v)}>{expanded?'Minimize':'Expand'}</Button></div><CallRoom call={call} currentUserId={user.id} expanded={expanded} onLeave={()=>setScreen('chat')} onKick={()=>{}}/></section>;
    else if (screen==='settings') page=<div className="mx-auto max-w-3xl p-5"><h1 className="text-2xl font-semibold">Settings</h1><SettingsForm userId={user.id} email={user.email} initialName={user.full_name} initialAvatarUrl={null}/><Button className="mt-4" variant="outline" onClick={()=>{fixture.incoming=true;window.dispatchEvent(new Event('online'));}}>Try incoming call</Button></div>;
    else if (screen==='admin') page=<EmployeeAdmin/>;
    else if (screen.startsWith('my-work')) page=<MyWork key={screen} userId={user.id}/>;
    else if (screen==='service-desk') page=<ServiceDesk userId={user.id}/>;
    else page=<LeaveDesk userId={user.id}/>;
    content=<AuthSessionBoundary userId={user.id}><CallProvider currentUserId={user.id}><WorkspaceShell userId={user.id} sidebar={<Sidebar boards={shownBoards} userEmail={user.email} userName={user.full_name} isEmployeeAdmin={admin}/>}>{page}</WorkspaceShell></CallProvider></AuthSessionBoundary>;
  }
  return <>
    <aside className="fixed right-3 bottom-3 z-35 max-w-[calc(100%-1.5rem)] rounded-xl border bg-card text-sm shadow-lg" aria-label="Fixture controls">
      <details><summary className="cursor-pointer px-3 py-2">Preview controls</summary>
        <div className="grid gap-2 border-t p-3">
          <p className="text-muted-foreground">Local preview · Fictional data</p>
          <label>Screen <select aria-label="Preview screen" value={screen} onChange={e=>setScreen(e.target.value)}>{screens.map(s=><option key={s}>{s}</option>)}</select></label>
          <label>Theme <select aria-label="Preview theme" value={theme} onChange={e=>setTheme(e.target.value)}>{['system','light','dark'].map(s=><option key={s}>{s}</option>)}</select></label>
          <label><input type="checkbox" checked={admin} onChange={e=>setAdmin(e.target.checked)}/> Admin role</label>
        </div>
      </details>
    </aside>
    {content}<Toaster/>
  </>;
}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><ThemeProvider><TooltipProvider><App/></TooltipProvider></ThemeProvider></QueryClientProvider>);
`);
const stubs={
 'next/navigation':`const router={push:url=>window.previewNavigate?.(url),replace:url=>history.replaceState(null,'',url),refresh:()=>{}};let search,params;export const useRouter=()=>router;export const usePathname=()=>window.previewPath||'/dashboard';export const useSearchParams=()=>{if(search!==location.search){search=location.search;params=new URLSearchParams(search);}return params;};export const useParams=()=>({boardId:usePathname().split('/')[3]});`,
 'next/link':`import React from'react';export default function Link({href,children,prefetch,onClick,...props}){return React.createElement('a',{...props,href,onClick:e=>{onClick?.(e);if(!e.defaultPrevented&&typeof href==='string'&&!href.startsWith('#')){e.preventDefault();window.previewNavigate?.(href);}}},children);}`,
 'next/image':`import React from'react';export default function Image({fill,unoptimized,priority,...props}){return React.createElement('img',{...props,style:fill?{...props.style,width:'100%',height:'100%'}:props.style});}`,
 'next/dynamic':`import React from'react';export default function dynamic(loader){const Component=React.lazy(async()=>{const value=await loader();return {default:value.default||value};});return props=>React.createElement(React.Suspense,{fallback:null},React.createElement(Component,props));}`,
 '@/lib/supabase/client':`export{createClient}from'/fixtures.js';`,
 'livekit-client':`export const Track={Kind:{Audio:'audio',Video:'video'},Source:{Microphone:'microphone',Camera:'camera',ScreenShare:'screen',ScreenShareAudio:'screen-audio'}};export const RoomEvent=Object.fromEntries(['TrackSubscribed','TrackUnsubscribed','LocalTrackPublished','LocalTrackUnpublished','TrackMuted','TrackUnmuted','ConnectionQualityChanged','AudioPlaybackStatusChanged','Reconnecting','Reconnected','Disconnected','ActiveSpeakersChanged','ParticipantConnected','ParticipantDisconnected'].map(k=>[k,k]));export class Room{canPlaybackAudio=true;remoteParticipants=new Map();localParticipant={identity:'local',trackPublications:new Map(),publishTrack:async()=>{},unpublishTrack:async()=>{}};on(){return this;}async connect(){}async disconnect(){}async startAudio(){}async switchActiveDevice(){}}`,
};
fs.copyFileSync(path.join(repo,'scripts/solar-preview-fixtures.js'),path.join(root,'fixtures.js'));
const server=await createServer({root,publicDir:path.join(repo,'public'),configFile:false,server:{host:'127.0.0.1',port,strictPort:true,fs:{allow:[root,repo,path.resolve(repo,'../project-management-board')]}},esbuild:{jsx:'automatic'},optimizeDeps:{include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime','@tanstack/react-query']},resolve:{alias:[...['react','react-dom','@tanstack/react-query'].map(find=>({find,replacement:path.join(repo,'node_modules',find)})),{find:/^@\/(?!lib\/supabase\/client$)/,replacement:repo.replaceAll('\\','/')+'/src/'}],dedupe:['react','react-dom']},css:{postcss:repo},plugins:[{name:'solar-preview-stubs',enforce:'pre',resolveId(id){if(stubs[id])return '\0solar:'+id;},load(id){if(id.startsWith('\0solar:'))return stubs[id.slice(7)];},configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url.startsWith('/audio/ringtones/')){const name=path.basename(req.url);if(!/^(dawn-chimes|warm-keys|soft-marimba|orbit-bells)\.wav$/.test(name)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type','audio/wav');res.end(fs.readFileSync(path.join(repo,'public/audio/ringtones',name)));return;}next();});}}]});
await server.listen();console.log(`Helios real-component local preview: http://127.0.0.1:${port}`);
