import { NextResponse, type NextRequest } from "next/server";
import { isProtectedAdminPath, isValidAdminBasicAuth, isValidCronSecretAuth as isValidCronSecret } from "@/lib/auth/adminAuth";

export async function middleware(request: NextRequest) {
  if (!isProtectedAdminPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const isCronRequest = request.nextUrl.pathname.startsWith("/api/cron");
  const authenticated = isCronRequest ? await isValidCronSecretAuth(request) : await isValidBasicAuth(request);
  if (!authenticated) {
    return unauthorized(isCronRequest);
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

async function isValidBasicAuth(request: NextRequest) {
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
    expectedSecret: process.env.CRON_SECRET
  });
}

function unauthorized(isCronRequest: boolean) {
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: isCronRequest ? undefined : { "WWW-Authenticate": 'Basic realm="PaperStraw Admin", charset="UTF-8"' }
  });
}
