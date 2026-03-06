import { NextResponse } from "next/server";

interface TestBody {
  baseUrl: string;
  email: string;
  apiToken: string;
}

interface JiraMyselfResponse {
  displayName?: string;
  emailAddress?: string;
}

/**
 * POST /api/config/test
 * Tests provided Jira credentials against the /rest/api/3/myself endpoint.
 * Does NOT save anything — purely a connectivity check.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as Record<string, unknown>).baseUrl !== "string" ||
    typeof (body as Record<string, unknown>).email !== "string" ||
    typeof (body as Record<string, unknown>).apiToken !== "string"
  ) {
    return NextResponse.json(
      { success: false, error: "Body must include baseUrl, email, and apiToken as strings." },
      { status: 400 }
    );
  }

  const { baseUrl, email, apiToken } = body as TestBody;

  if (!baseUrl.trim() || !email.trim() || !apiToken.trim()) {
    return NextResponse.json(
      { success: false, error: "baseUrl, email, and apiToken must not be empty." },
      { status: 400 }
    );
  }

  const cleanBaseUrl = baseUrl.replace(/\/+$/, "");
  const url = `${cleanBaseUrl}/rest/api/3/myself`;
  const authorization =
    "Basic " + Buffer.from(`${email.trim()}:${apiToken.trim()}`).toString("base64");

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: authorization, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return NextResponse.json(
      { success: false, error: `Could not reach Jira: ${message}` },
      { status: 200 }
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let hint = "";
    if (res.status === 401) hint = " Check your email and API token.";
    else if (res.status === 403) hint = " Your token may lack permissions.";
    else if (res.status === 404) hint = " Check your Jira base URL.";
    return NextResponse.json(
      {
        success: false,
        error: `Jira returned ${res.status}.${hint}${text ? ` (${text.slice(0, 200)})` : ""}`,
      },
      { status: 200 }
    );
  }

  const data = (await res.json()) as JiraMyselfResponse;
  return NextResponse.json({
    success: true,
    displayName: data.displayName ?? data.emailAddress ?? "Unknown user",
  });
}
