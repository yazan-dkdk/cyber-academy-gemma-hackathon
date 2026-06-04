const DEFAULT_BACKEND_ORIGIN = "http://localhost:3000";
const FRONTEND_DEV_ORIGINS = new Set([
  "http://localhost:3001",
  "http://127.0.0.1:3001",
]);

type QuizAttemptProxyContext = {
  params: Promise<{
    path: string[];
  }>;
};

function getBackendApiOrigin(request: Request) {
  const configuredOrigin = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const requestOrigin = new URL(request.url).origin;

  if (!configuredOrigin) {
    return DEFAULT_BACKEND_ORIGIN;
  }

  try {
    const origin = new URL(configuredOrigin).origin;

    if (FRONTEND_DEV_ORIGINS.has(origin) || origin === requestOrigin) {
      return DEFAULT_BACKEND_ORIGIN;
    }

    return origin;
  } catch {
    return DEFAULT_BACKEND_ORIGIN;
  }
}

async function buildBackendQuizAttemptUrl(request: Request, context: QuizAttemptProxyContext) {
  const { path } = await context.params;
  const requestUrl = new URL(request.url);
  const backendPath = path.map(encodeURIComponent).join("/");

  return `${getBackendApiOrigin(request)}/api/quiz-attempts/${backendPath}${requestUrl.search}`;
}

function buildForwardHeaders(request: Request, body: string | null) {
  const cookieHeader = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");

  return {
    ...(accept ? { Accept: accept } : {}),
    ...(body !== null ? { "Content-Type": contentType ?? "application/json" } : {}),
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    ...(authorization ? { Authorization: authorization } : {}),
  };
}

function getSetCookieHeaders(headers: Headers) {
  const headersWithSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookieHeaders = headersWithSetCookie.getSetCookie?.();

  if (setCookieHeaders?.length) {
    return setCookieHeaders;
  }

  const setCookie = headers.get("set-cookie");

  return setCookie ? [setCookie] : [];
}

async function proxyQuizAttemptRequest(request: Request, context: QuizAttemptProxyContext) {
  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const requestBody = hasBody ? await request.text() : "";
  const body = requestBody.length ? requestBody : null;
  const backendResponse = await fetch(await buildBackendQuizAttemptUrl(request, context), {
    method,
    headers: buildForwardHeaders(request, body),
    cache: "no-store",
    ...(body !== null ? { body } : {}),
  });
  const responseBody = await backendResponse.text();
  const responseHeaders = new Headers();
  const contentType = backendResponse.headers.get("content-type");

  if (contentType) {
    responseHeaders.set("Content-Type", contentType);
  }

  for (const setCookie of getSetCookieHeaders(backendResponse.headers)) {
    responseHeaders.append("Set-Cookie", setCookie);
  }

  return new Response(responseBody, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}

export function GET(request: Request, context: QuizAttemptProxyContext) {
  return proxyQuizAttemptRequest(request, context);
}

export function POST(request: Request, context: QuizAttemptProxyContext) {
  return proxyQuizAttemptRequest(request, context);
}
