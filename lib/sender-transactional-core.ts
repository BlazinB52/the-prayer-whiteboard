export type SenderTransactionalInput = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

export type SenderDiagnostic = {
  errorName: string | null;
  errorMessage: string | null;
  causeCode: string | null;
};

export type SenderTransactionalResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; reason: "configuration" | "rejected" | "timeout" | "network"; message: string; diagnostic?: SenderDiagnostic };

const SEND_ENDPOINT = "https://api.sender.net/v2/message/send";

function normalizeErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const maybeMessage = (value as { message?: unknown }).message;
  return typeof maybeMessage === "string" ? maybeMessage.slice(0, 300) : null;
}

function redactDiagnosticValue(value: string, input: SenderTransactionalInput) {
  const sensitiveValues = [input.apiKey, input.fromEmail, input.toEmail, input.toName, input.html, input.text].filter((item): item is string => Boolean(item));
  let redacted = value.slice(0, 300);
  for (const sensitive of sensitiveValues) {
    redacted = redacted.split(sensitive).join("[redacted]");
  }
  return redacted
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[redacted-email]")
    .replace(/https?:\/\/\S+/g, "[redacted-url]");
}

function diagnosticFromError(error: unknown, input: SenderTransactionalInput): SenderDiagnostic {
  if (!(error instanceof Error)) {
    return { errorName: null, errorMessage: null, causeCode: null };
  }
  const cause = error.cause;
  const maybeCode = cause && typeof cause === "object" ? (cause as { code?: unknown }).code : null;
  return {
    errorName: redactDiagnosticValue(error.name, input),
    errorMessage: redactDiagnosticValue(error.message, input),
    causeCode: typeof maybeCode === "string" ? redactDiagnosticValue(maybeCode, input) : null,
  };
}

export async function sendSenderTransactionalEmail(input: SenderTransactionalInput): Promise<SenderTransactionalResult> {
  if (!input.apiKey || !input.fromEmail || !input.fromName) {
    return { ok: false, reason: "configuration", message: "Sender transactional email is not configured." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 8000);
  const fetcher = input.fetcher ?? fetch;

  try {
    const response = await fetcher(SEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: { email: input.fromEmail, name: input.fromName },
        to: { email: input.toEmail, name: input.toName || input.toEmail },
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: { charset: "utf-8" },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const payload = await response.json().catch(() => null) as { emailId?: unknown; id?: unknown } | null;
    if (!response.ok) {
      return { ok: false, reason: "rejected", message: normalizeErrorMessage(payload) ?? `Sender API rejected the request with status ${response.status}.` };
    }
    const providerMessageId = typeof payload?.emailId === "string" ? payload.emailId : typeof payload?.id === "string" ? payload.id : null;
    return { ok: true, providerMessageId };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reason: "timeout", message: "Sender API request timed out." };
    }
    return { ok: false, reason: "network", message: "Sender API request failed.", diagnostic: diagnosticFromError(error, input) };
  }
}
