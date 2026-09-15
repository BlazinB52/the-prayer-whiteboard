"use server";

import { checkRateLimit } from "@/lib/rate-limit";
import { requestManagementLink, savePreferences } from "@/lib/email-subscriptions";

export type PreferenceRequestState = { error?: string; submitted?: boolean };
export type PreferenceSaveState = { error?: string; saved?: boolean; unsubscribed?: boolean };

export async function requestPreferenceAccess(_previousState: PreferenceRequestState, formData: FormData): Promise<PreferenceRequestState> {
  const limit = await checkRateLimit("email-preferences", 5, 15 * 60 * 1000);
  if (!limit.allowed) return { error: "Too many requests. Please wait a few minutes and try again." };
  try {
    return await requestManagementLink(formData);
  } catch {
    return { submitted: true };
  }
}

export async function saveEmailPreferences(_previousState: PreferenceSaveState, formData: FormData): Promise<PreferenceSaveState> {
  const limit = await checkRateLimit("email-preferences-save", 12, 15 * 60 * 1000);
  if (!limit.allowed) return { error: "Too many preference changes. Please wait a few minutes and try again." };
  try {
    return await savePreferences(formData);
  } catch {
    return { error: "Preferences could not be saved." };
  }
}
