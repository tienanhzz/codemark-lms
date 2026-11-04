function defaultApiUrl() {
  if (typeof window === "undefined") return "http://localhost:5000";
  const url = new URL(window.location.origin);
  url.port = "5000";
  return url.origin;
}

export const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL || defaultApiUrl()
).replace(/\/$/, "");

export const SOCKET_URL = (
  process.env.NEXT_PUBLIC_SOCKET_URL || API_BASE
).replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  rawBody?: BodyInit;
};

function notifyUnauthorized() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("lms:unauthorized"));
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, rawBody, headers, ...rest } = options;
  const init: RequestInit = {
    credentials: "include",
    ...rest,
    headers: { ...(headers || {}) },
  };
  if (rawBody !== undefined) {
    init.body = rawBody;
  } else if (body !== undefined) {
    init.headers = {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    };
    init.body = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(
      "Cannot reach the API server. Make sure the Spring Boot backend is running and that the API URL matches the page host.",
      0,
      null,
    );
  }
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized();
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }
  return payload as T;
}

export async function download(path: string, filename: string) {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized();
    throw new ApiError(`Download failed (${response.status})`, response.status, null);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message.replaceAll("_", " ");
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
