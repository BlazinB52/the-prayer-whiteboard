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

export type SenderRejectionDiagnostic = {
  httpStatus: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export type SenderTransactionalResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; reason: "configuration" | "rejected" | "timeout" | "network"; message: string; diagnostic?: SenderDiagnostic; rejection?: SenderRejectionDiagnostic };

const SEND_ENDPOINT = "https://api.sender.net/v2/message/send";

function normalizeApiKey(apiKey: string) {
  return apiKey.replace(/^\uFEFF+|\uFEFF+$/g, "").trim();
}

function isSafeHeaderValue(value: string) {
  return /^[\x20-\x7E]+$/.test(value);
}

function normalizeErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const maybeMessage = (value as { message?: unknown }).message;
  return typeof maybeMessage === "string" ? maybeMessage.slice(0, 300) : null;
}

function normalizeErrorCode(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const maybeCode = (value as { code?: unknown; errorCode?: unknown; error?: unknown }).code ?? (value as { errorCode?: unknown }).errorCode ?? (value as { error?: unknown }).error;
  return typeof maybeCode === "string" ? maybeCode.slice(0, 120) : null;
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

async function readRejectionPayload(response: Response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return { payload: null, text: null };
  try {
    return { payload: JSON.parse(raw) as unknown, text: raw };
  } catch {
    return { payload: null, text: raw };
  }
}

export async function sendSenderTransactionalEmail(input: SenderTransactionalInput): Promise<SenderTransactionalResult> {
  const apiKey = normalizeApiKey(input.apiKey);
  if (!apiKey || !isSafeHeaderValue(apiKey) || !input.fromEmail || !input.fromName) {
    return { ok: false, reason: "configuration", message: "Sender transactional email is not configured." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 8000);
  const fetcher = input.fetcher ?? fetch;

  try {
    const response = await fetcher(SEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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

    const rejectionPayload = response.ok ? null : await readRejectionPayload(response);
    const payload = response.ok ? await response.json().catch(() => null) as { emailId?: unknown; id?: unknown } | null : rejectionPayload?.payload as { emailId?: unknown; id?: unknown } | null;
    if (!response.ok) {
      const rawMessage = normalizeErrorMessage(payload) ?? rejectionPayload?.text ?? `Sender API rejected the request with status ${response.status}.`;
      const safeMessage = redactDiagnosticValue(rawMessage, input).slice(0, 300);
      const safeCode = normalizeErrorCode(payload);
      return {
        ok: false,
        reason: "rejected",
        message: safeMessage,
        rejection: {
          httpStatus: response.status,
          errorCode: safeCode ? redactDiagnosticValue(safeCode, input).slice(0, 120) : null,
          errorMessage: safeMessage,
        },
      };
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
