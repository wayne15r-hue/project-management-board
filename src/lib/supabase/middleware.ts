import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (/^\/audio\/ringtones\/(?:dawn-chimes|warm-keys|soft-marimba|orbit-bells)\.wav$/.test(pathname)) return NextResponse.next({request});
  // The cron authenticates its bearer; the two pg_net wakeups perform only
  // fixed-purpose, service-authorized maintenance and consume no request targets.
  if (["/api/cron/due-date-reminders", "/api/calls/maintenance", "/api/notifications/maintenance", "/api/accounts/maintenance"].includes(pathname)) return NextResponse.next({ request });
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      },
    } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  const recoveryPage=["/", "/login", "/signup", "/callback", "/reset-password", "/update-password", "/auth/recovery", "/account-inactive"].includes(pathname);
  const publicArtwork = pathname === '/opengraph-image' || pathname === '/twitter-image';
  const publicPage = recoveryPage || publicArtwork || /^\/invite\/[^/]+$/.test(pathname);
  if (!user && !publicPage) {
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : (() => {
          const url = new URL("/login", request.url);
          url.searchParams.set("next", pathname + request.nextUrl.search);
          return NextResponse.redirect(url);
        })();
    for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie);
    return response;
  }
  if(user&&!recoveryPage){
    const {data,error}=await supabase.rpc('account_is_active');
    if(error||data!==true){
      const response=error?NextResponse.json({error:'Account status unavailable. Please retry.'},{status:503})
        :pathname.startsWith('/api/')?NextResponse.json({error:'This account is inactive. Contact your administrator.',code:'ACCOUNT_INACTIVE'},{status:403})
        :NextResponse.redirect(new URL('/account-inactive',request.url));
      for(const cookie of supabaseResponse.cookies.getAll())response.cookies.set(cookie);
      return response;
    }
  }
  const needsNameCheck=pathname==='/employee-setup'||pathname==='/dashboard'||pathname.startsWith('/dashboard/')||/^\/invite\/[^/]+$/.test(pathname)
    ||(pathname.startsWith('/api/')&&pathname!=='/api/profile/name');
  if(user&&needsNameCheck){
    const {data,error}=await supabase.rpc('profile_name_ready');
    if(error||data!==true){
      const url=new URL('/name-setup',request.url);url.searchParams.set('next',pathname+request.nextUrl.search);
      const response=error?NextResponse.json({error:'Name setup is temporarily unavailable. Please retry.'},{status:503})
        :pathname.startsWith('/api/')?NextResponse.json({error:'Complete your name setup to continue.',code:'NAME_SETUP_REQUIRED'},{status:403}):NextResponse.redirect(url);
      for(const cookie of supabaseResponse.cookies.getAll())response.cookies.set(cookie);
      return response;
    }
  }
  const needsSetupCheck = pathname === '/dashboard' || pathname.startsWith('/dashboard/') || /^\/invite\/[^/]+$/.test(pathname)
    || (pathname.startsWith('/api/') && pathname!=='/api/profile/name' && !pathname.startsWith('/api/employee/') && !pathname.startsWith('/api/admin/'));
  if (user && needsSetupCheck) {
    const { data, error } = await supabase.from('employee_records').select('completed_at').eq('user_id', user.id).maybeSingle();
    let response: NextResponse | null = null;
    if (error) response = NextResponse.json({ error: 'Employee setup is temporarily unavailable. Please retry.' }, { status: 503 });
    else if (!data?.completed_at) {
      if (pathname.startsWith('/api/')) response = NextResponse.json({ error: 'Complete your employee details to continue.', code: 'EMPLOYEE_SETUP_REQUIRED' }, { status: 403 });
      else {
        const url = new URL('/employee-setup', request.url);
        url.searchParams.set('next', pathname + request.nextUrl.search);
        response = NextResponse.redirect(url);
      }
    }
    if (response) {
      for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie);
      return response;
    }
  }
  return supabaseResponse;
}
