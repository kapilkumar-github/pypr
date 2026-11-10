import { NextResponse, type NextRequest } from "next/server"

// Fast path only: bounce requests with no session cookie. The app layout still validates the session.
export function proxy(request: NextRequest) {
  if (request.cookies.has("pypr_session")) return NextResponse.next()
  const url = new URL("/login", request.url)
  url.searchParams.set("next", request.nextUrl.pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ["/resumes/:path*", "/job-match", "/job-tracker/:path*", "/workspaces/:path*", "/take/:path*", "/code/:workspace/:problem", "/machine/:workspace/:session", "/design/:workspace/:board"],
}
