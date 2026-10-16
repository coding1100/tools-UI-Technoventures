import { NextRequest, NextResponse } from "next/server";
import { isAllowedRoute } from "@/lib/server/allowedRoutes";
import { backendUrl, getAccessToken } from "@/lib/server/backendSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Detection and scan creation can take tens of seconds on a cold backend.
export const maxDuration = 60;

const FORWARDED_REQUEST_HEADERS = ["content-type", "idempotency-key"];
const FORWARDED_RESPONSE_HEADERS = ["content-type", "content-disposition", "retry-after"];

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, { params }: RouteContext) {
  const { path } = await params;
  const toolPath = path.join("/");
  if (!isAllowedRoute(request.method, toolPath)) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  // Buffered once so the request can be replayed after a token renewal.
  const body = ["GET", "DELETE"].includes(request.method) ? undefined : await request.arrayBuffer();
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const send = async (renew: boolean) => {
    headers.set("authorization", `Bearer ${await getAccessToken({ renew })}`);
    return fetch(backendUrl(`/tools/${toolPath}${request.nextUrl.search}`), {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });
  };

  let upstream: Response;
  try {
    upstream = await send(false);
    if (upstream.status === 401) upstream = await send(true);
  } catch (error) {
    console.error("Backend request failed:", error);
    return NextResponse.json({ message: "Could not reach the service. Try again shortly." }, { status: 502 });
  }

  const responseHeaders = new Headers({ "cache-control": "no-store" });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  const hasBody = upstream.status !== 204 && upstream.status !== 304;
  return new NextResponse(hasBody ? await upstream.arrayBuffer() : null, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export { proxy as GET, proxy as POST, proxy as DELETE };
