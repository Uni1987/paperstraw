import { NextResponse, type NextRequest } from "next/server";
import { isProtectedAdminPath, isValidAdminBasicAuth, isValidCronSecretAuth as isValidCronSecret } from "@/lib/auth/adminAuth";

export function middleware(request: NextRequest) {
  if (!isProtectedAdminPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (!isValidBasicAuth(request) && !isValidCronSecretAuth(request)) {
    return unauthorized();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-paperstraw-admin-authenticated", "1");

  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/cron/:path*", "/api/ingest/:path*"]
};

function isValidBasicAuth(request: NextRequest) {
  return isValidAdminBasicAuth({
    authorization: request.headers.get("authorization"),
    expectedUsername: process.env.ADMIN_USERNAME,
    expectedPassword: process.env.ADMIN_PASSWORD
  });
}

function isValidCronSecretAuth(request: NextRequest) {
  return isValidCronSecret({
    pathname: request.nextUrl.pathname,
    authorization: request.headers.get("authorization"),
    xCronSecret: request.headers.get("x-cron-secret"),
    querySecret: request.nextUrl.searchParams.get("secret"),
    expectedSecret: process.env.CRON_SECRET
  });
}

function unauthorized() {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="PaperStraw Admin", charset="UTF-8"'
    }
  });
}
