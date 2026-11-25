import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const OPEN = ['/admin/login', '/admin/reset-password', '/admin/update-password'];

export async function middleware(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const path = req.nextUrl.pathname;
    if (path.startsWith('/admin') && path !== '/admin/login') {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.search = 'error=config';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll(list: Array<{ name: string; value: string; options: CookieOptions }>) {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );
  const { data: { user }, error } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  if (error && error.name !== 'AuthSessionMissingError' && path.startsWith('/admin') && !OPEN.includes(path)) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = 'error=auth';
    return NextResponse.redirect(url);
  }
  if (path.startsWith('/admin') && !OPEN.includes(path) && !user) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ['/admin/:path*', '/auth/:path*'] };
