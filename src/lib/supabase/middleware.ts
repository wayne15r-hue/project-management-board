import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // This endpoint uses only its own fail-closed bearer authentication.
  if (pathname === "/api/cron/due-date-reminders") return NextResponse.next({ request });
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
  return supabaseResponse;
}
