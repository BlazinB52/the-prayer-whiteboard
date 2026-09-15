import "server-only";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { EMAIL_CATEGORIES, type EmailCategory, type PreferenceView } from "@/lib/email-categories";
import { buildConfirmationEmail, buildPreferenceManagementEmail } from "@/lib/subscription-email-content";
import { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONFIRMATION_TTL_HOURS = 72;
const MANAGEMENT_TTL_MINUTES = 30;
const DUPLICATE_DELIVERY_WINDOW_MINUTES = 15;

type Preference = {
  category: EmailCategory;
  status: "pending" | "active" | "disabled";
};

function getClient() {
  const supabase = createServiceRoleClient();
  if (!supabase) throw new Error("Subscription storage is not configured.");
  return supabase;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function maskEmail(email: string) {
  const [name = "", domain = ""] = email.split("@");
  if (!domain) return "Invalid email";
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${"*".repeat(Math.max(2, name.length - visible.length))}@${domain}`;
}

export function readSelectedCategories(formData: FormData) {
  return EMAIL_CATEGORIES.filter((category) => formData.get(category) === "on");
}

export function validateSubscriberFields(formData: FormData) {
  const firstName = String(formData.get("firstName") ?? "").trim().replace(/\s+/g, " ");
  const email = String(formData.get("email") ?? "").trim();
  const normalizedEmail = normalizeEmail(email);
  const categories = readSelectedCategories(formData);
  const consent = formData.get("privacyConsent") === "on";
  const website = String(formData.get("website") ?? "").trim();

  if (website) return { error: "Subscription could not be submitted." };
  if (!firstName || firstName.length > 120) return { error: "Enter your first name." };
  if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 320) return { error: "Enter a valid email address." };
  if (!categories.length) return { error: "Choose at least one email category." };
  if (!consent) return { error: "Please acknowledge the privacy and consent statement." };

  return { value: { firstName, email, normalizedEmail, categories } };
}

export function validatePreferenceFields(formData: FormData) {
  const firstName = String(formData.get("firstName") ?? "").trim().replace(/\s+/g, " ");
  const categories = readSelectedCategories(formData);
  const unsubscribeAll = formData.get("unsubscribeAll") === "on";
  const token = String(formData.get("token") ?? "").trim();

  if (!token) return { error: "This preference link is missing or invalid." };
  if (!firstName || firstName.length > 120) return { error: "Enter your first name." };
  if (!unsubscribeAll && !categories.length) return { error: "Choose at least one email category or unsubscribe from all." };

  return { value: { firstName, categories, token, unsubscribeAll } };
}

function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function expiresInHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function expiresInMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function requestMetadata() {
  const headerStore = await headers();
  return {
    userAgent: headerStore.get("user-agent")?.slice(0, 300) ?? null,
  };
}

async function replacePreferences(subscriberId: string, categories: EmailCategory[], status: "pending" | "active") {
  const supabase = getClient();
  const now = new Date().toISOString();
  const rows = EMAIL_CATEGORIES.map((category) => ({
    subscriber_id: subscriberId,
    category,
    status: categories.includes(category) ? status : "disabled",
    requested_at: now,
    confirmed_at: status === "active" && categories.includes(category) ? now : null,
    disabled_at: categories.includes(category) ? null : now,
  }));
  const { error } = await supabase.from("email_subscription_preferences").upsert(rows, { onConflict: "subscriber_id,category" });
  if (error) throw new Error("Subscription preferences could not be saved.");
}

async function createAccessToken(subscriberId: string, tokenType: "confirmation" | "management") {
  const supabase = getClient();
  const token = generateToken();
  const expiresAt = tokenType === "confirmation" ? expiresInHours(CONFIRMATION_TTL_HOURS) : expiresInMinutes(MANAGEMENT_TTL_MINUTES);
  const { error: replacementError } = await supabase
    .from("email_access_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("subscriber_id", subscriberId)
    .eq("token_type", tokenType)
    .is("used_at", null);
  if (replacementError) throw new Error("Access token could not be replaced.");
  const { error } = await supabase.from("email_access_tokens").insert({
    subscriber_id: subscriberId,
    token_type: tokenType,
    token_hash: tokenHash(token),
    expires_at: expiresAt,
  });
  if (error) throw new Error("Access token could not be created.");
  return { token, expiresAt };
}

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || "https://theprayerwhiteboard.com";
  if (process.env.NODE_ENV === "production" && configured.includes("localhost")) {
    throw new Error("Production subscription links cannot use localhost.");
  }
  return configured.replace(/\/+$/, "");
}

async function recordConsentEvent(subscriberId: string, eventType: string, categories: EmailCategory[], metadata: Record<string, unknown> = {}) {
  const supabase = getClient();
  const { data: subscriber } = await supabase.from("email_subscribers").select("first_name, normalized_email").eq("id", subscriberId).maybeSingle();
  await supabase.from("email_consent_events").insert({
    subscriber_id: subscriberId,
    event_type: eventType,
    categories,
    first_name: subscriber?.first_name ?? null,
    normalized_email: subscriber?.normalized_email ?? null,
    metadata,
  });
}

async function createDeliveryEvent(subscriberId: string, messageType: "confirmation" | "management" | "preference_sync", metadata: Record<string, unknown>) {
  const supabase = getClient();
  const { data, error } = await supabase.from("email_delivery_events").insert({
    subscriber_id: subscriberId,
    provider: "sender",
    message_type: messageType,
    status: "queued",
    metadata,
  }).select("id").single();
  if (error) throw new Error("Email delivery record could not be created.");
  await supabase.from("email_subscribers").update({ sender_sync_status: "pending", sender_sync_error: null }).eq("id", subscriberId);
  return data.id as string;
}

async function updateDeliveryEvent(deliveryEventId: string, result: Awaited<ReturnType<typeof sendSenderTransactionalEmail>>) {
  const supabase = getClient();
  if (result.ok) {
    await supabase.from("email_delivery_events").update({
      status: "sent",
      provider_message_id: result.providerMessageId,
      error: null,
    }).eq("id", deliveryEventId);
    return;
  }
  await supabase.from("email_delivery_events").update({
    status: "failed",
    error: result.reason,
  }).eq("id", deliveryEventId);
}

async function hasRecentSuccessfulDelivery(subscriberId: string, messageType: "confirmation" | "management") {
  const supabase = getClient();
  const since = new Date(Date.now() - DUPLICATE_DELIVERY_WINDOW_MINUTES * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("email_delivery_events")
    .select("id", { count: "exact", head: true })
    .eq("subscriber_id", subscriberId)
    .eq("message_type", messageType)
    .eq("status", "sent")
    .gte("created_at", since);
  return Boolean(count);
}

async function deliverConfirmationEmail(input: { subscriberId: string; firstName: string; email: string; categories: EmailCategory[]; token: string; expiresAt: string }) {
  const confirmationUrl = `${siteUrl()}/subscribe/confirm?token=${encodeURIComponent(input.token)}`;
  const email = buildConfirmationEmail({ firstName: input.firstName, categories: input.categories, confirmationUrl, expiresAt: input.expiresAt });
  const deliveryEventId = await createDeliveryEvent(input.subscriberId, "confirmation", {
    expiresAt: input.expiresAt,
    categories: input.categories,
    deliveryPath: "/subscribe/confirm",
  });
  const result = await sendSenderTransactionalEmail({
    toEmail: input.email,
    toName: input.firstName,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  await updateDeliveryEvent(deliveryEventId, result);
  return result;
}

async function deliverPreferenceManagementEmail(input: { subscriberId: string; firstName: string; email: string; token: string; expiresAt: string }) {
  const managementUrl = `${siteUrl()}/email-preferences/manage?token=${encodeURIComponent(input.token)}`;
  const email = buildPreferenceManagementEmail({ firstName: input.firstName, managementUrl, expiresAt: input.expiresAt });
  const deliveryEventId = await createDeliveryEvent(input.subscriberId, "management", {
    expiresAt: input.expiresAt,
    deliveryPath: "/email-preferences/manage",
  });
  const result = await sendSenderTransactionalEmail({
    toEmail: input.email,
    toName: input.firstName,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
  await updateDeliveryEvent(deliveryEventId, result);
  return result;
}

export async function requestSubscription(formData: FormData) {
  const fields = validateSubscriberFields(formData);
  if (fields.error || !fields.value) return { error: fields.error ?? "Subscription could not be submitted." };

  const supabase = getClient();
  const { data: existing, error: existingError } = await supabase
    .from("email_subscribers")
    .select("id, status")
    .eq("normalized_email", fields.value.normalizedEmail)
    .maybeSingle();
  if (existingError) return { error: "Subscription could not be submitted." };
  if (existing?.status === "suppressed") return { submitted: true };

  let subscriberId = existing?.id ?? null;
  const subscriberPayload = {
    first_name: fields.value.firstName,
    email: fields.value.email,
    normalized_email: fields.value.normalizedEmail,
    status: "pending",
    confirmed_at: null,
    unsubscribed_at: null,
    sender_sync_status: "not_configured",
  };
  const subscriberResult = subscriberId
    ? await supabase.from("email_subscribers").update(subscriberPayload).eq("id", subscriberId)
    : await supabase.from("email_subscribers").insert(subscriberPayload).select("id").single();
  if (!subscriberId && "data" in subscriberResult) subscriberId = subscriberResult.data?.id ?? null;
  const subscriberError = subscriberResult.error;
  if (subscriberError) return { error: "Subscription could not be submitted." };
  if (!subscriberId) return { error: "Subscription could not be submitted." };

  await replacePreferences(subscriberId, fields.value.categories, "pending");
  if (await hasRecentSuccessfulDelivery(subscriberId, "confirmation")) return { submitted: true };
  const access = await createAccessToken(subscriberId, "confirmation");
  const metadata = await requestMetadata();
  await recordConsentEvent(subscriberId, existing?.status === "unsubscribed" ? "resubscribed" : "subscription_requested", fields.value.categories, metadata);
  const delivery = await deliverConfirmationEmail({
    subscriberId,
    firstName: fields.value.firstName,
    email: fields.value.email,
    categories: fields.value.categories,
    token: access.token,
    expiresAt: access.expiresAt,
  });
  if (!delivery.ok) return { error: "Your subscription was saved, but the confirmation email could not be sent. Please try again in a few minutes." };

  return { submitted: true };
}

async function readToken(token: string, tokenType: "confirmation" | "management", consume: boolean) {
  const supabase = getClient();
  const hash = tokenHash(token);
  const { data, error } = await supabase
    .from("email_access_tokens")
    .select("id, subscriber_id, expires_at, used_at")
    .eq("token_hash", hash)
    .eq("token_type", tokenType)
    .maybeSingle();
  if (error) throw new Error("Token lookup failed.");
  if (!data) return { status: "not_found" as const };
  if (data.used_at) return { status: "used" as const, subscriberId: data.subscriber_id as string };
  if (new Date(data.expires_at).getTime() < Date.now()) return { status: "expired" as const, subscriberId: data.subscriber_id as string };
  if (consume) {
    const { error: usedError } = await supabase.from("email_access_tokens").update({ used_at: new Date().toISOString() }).eq("id", data.id).is("used_at", null);
    if (usedError) throw new Error("Token could not be used.");
  }
  return { status: "valid" as const, subscriberId: data.subscriber_id as string };
}

export async function confirmSubscriptionToken(token: string) {
  if (!token) return { status: "invalid" as const };
  const supabase = getClient();
  const tokenResult = await readToken(token, "confirmation", true);
  if (tokenResult.status === "used" && tokenResult.subscriberId) return { status: "already_confirmed" as const };
  if (tokenResult.status !== "valid" || !tokenResult.subscriberId) return { status: tokenResult.status };

  const { data: preferences, error: prefError } = await supabase
    .from("email_subscription_preferences")
    .select("category, status")
    .eq("subscriber_id", tokenResult.subscriberId)
    .eq("status", "pending");
  if (prefError) return { status: "invalid" as const };
  const categories = (preferences ?? []).map((preference) => preference.category as EmailCategory).filter((category) => EMAIL_CATEGORIES.includes(category));
  if (!categories.length) return { status: "invalid" as const };

  const now = new Date().toISOString();
  const { error: subscriberError } = await supabase.from("email_subscribers").update({
    status: "confirmed",
    confirmed_at: now,
    unsubscribed_at: null,
    sender_sync_status: "not_configured",
  }).eq("id", tokenResult.subscriberId);
  if (subscriberError) return { status: "invalid" as const };
  await replacePreferences(tokenResult.subscriberId, categories, "active");
  await recordConsentEvent(tokenResult.subscriberId, "double_opt_in_confirmed", categories, await requestMetadata());
  return { status: "confirmed" as const };
}

export async function requestManagementLink(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const website = String(formData.get("website") ?? "").trim();
  if (website) return { submitted: true };
  if (!EMAIL_PATTERN.test(email) || email.length > 320) return { error: "Enter a valid email address." };
  const supabase = getClient();
  const { data: subscriber } = await supabase.from("email_subscribers").select("id, status").eq("normalized_email", email).maybeSingle();
  if (subscriber?.status === "confirmed" || subscriber?.status === "unsubscribed") {
    if (await hasRecentSuccessfulDelivery(subscriber.id, "management")) return { submitted: true };
    const access = await createAccessToken(subscriber.id, "management");
    await recordConsentEvent(subscriber.id, "preference_management_requested", [], await requestMetadata());
    const { data: fullSubscriber } = await supabase.from("email_subscribers").select("first_name, email").eq("id", subscriber.id).maybeSingle();
    if (!fullSubscriber) return { submitted: true };
    await deliverPreferenceManagementEmail({
      subscriberId: subscriber.id,
      firstName: fullSubscriber.first_name,
      email: fullSubscriber.email,
      token: access.token,
      expiresAt: access.expiresAt,
    });
  }
  return { submitted: true };
}

export async function loadPreferenceToken(token: string): Promise<PreferenceView | null> {
  if (!token) return null;
  const tokenResult = await readToken(token, "management", false);
  if (tokenResult.status !== "valid" || !tokenResult.subscriberId) return null;
  const supabase = getClient();
  const { data: subscriber } = await supabase.from("email_subscribers").select("id, first_name, email, status").eq("id", tokenResult.subscriberId).maybeSingle();
  if (!subscriber || !["confirmed", "unsubscribed"].includes(subscriber.status)) return null;
  const { data: preferences } = await supabase.from("email_subscription_preferences").select("category, status").eq("subscriber_id", subscriber.id);
  return {
    subscriberId: subscriber.id,
    firstName: subscriber.first_name,
    emailMasked: maskEmail(subscriber.email),
    categories: ((preferences ?? []) as Preference[]).filter((preference) => preference.status === "active").map((preference) => preference.category),
    token,
  };
}

export async function savePreferences(formData: FormData) {
  const fields = validatePreferenceFields(formData);
  if (fields.error || !fields.value) return { error: fields.error ?? "Preferences could not be saved." };
  const tokenResult = await readToken(fields.value.token, "management", true);
  if (tokenResult.status !== "valid" || !tokenResult.subscriberId) return { error: "This preference link is invalid or expired." };
  const supabase = getClient();
  const now = new Date().toISOString();
  const categories = fields.value.unsubscribeAll ? [] : fields.value.categories;
  const status = fields.value.unsubscribeAll ? "unsubscribed" : "confirmed";
  const { error } = await supabase.from("email_subscribers").update({
    first_name: fields.value.firstName,
    status,
    unsubscribed_at: fields.value.unsubscribeAll ? now : null,
    sender_sync_status: "not_configured",
  }).eq("id", tokenResult.subscriberId);
  if (error) return { error: "Preferences could not be saved." };
  await replacePreferences(tokenResult.subscriberId, categories, "active");
  await recordConsentEvent(tokenResult.subscriberId, fields.value.unsubscribeAll ? "unsubscribed" : "preference_changed", categories, await requestMetadata());
  return { saved: true, unsubscribed: fields.value.unsubscribeAll };
}
