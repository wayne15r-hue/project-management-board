import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // The cron authenticates its bearer; the two pg_net wakeups perform only
  // fixed-purpose, service-authorized maintenance and consume no request targets.
  if (["/api/cron/due-date-reminders", "/api/calls/maintenance", "/api/notifications/maintenance"].includes(pathname)) return NextResponse.next({ request });
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
  const publicPage = ["/", "/login", "/signup", "/callback", "/reset-password", "/update-password"].includes(pathname) || /^\/invite\/[^/]+$/.test(pathname);
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
  const needsSetupCheck = pathname === '/dashboard' || pathname.startsWith('/dashboard/') || /^\/invite\/[^/]+$/.test(pathname)
    || (pathname.startsWith('/api/') && !pathname.startsWith('/api/employee/') && !pathname.startsWith('/api/admin/'));
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
