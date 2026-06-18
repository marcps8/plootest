import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const ISSUER = "ploot-scheduler";

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-jwt-secret-change-in-prod");
}

export async function middleware(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "unauthorized", message: "Missing or invalid Authorization header" },
      { status: 401 }
    );
  }

  try {
    await jwtVerify(auth.slice("Bearer ".length), secret(), { issuer: ISSUER });
    return NextResponse.next();
  } catch {
    return NextResponse.json(
      { error: "unauthorized", message: "Invalid or expired JWT" },
      { status: 401 }
    );
  }
}

export const config = {
  matcher: "/api/v1/:path*",
};
