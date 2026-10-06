"use server";

import { requestManagementLink, requestSubscription, savePreferences } from "@/lib/email-subscriptions";
import { checkRateLimit } from "@/lib/rate-limit";

// Español versions of the subscription actions. They share the English tables and rules and
// differ only in the language of the messages, the emails and the confirmation links.

export type SubscribeStateEs = { error?: string; submitted?: boolean; alreadyConfirmed?: boolean };
export type PreferenceRequestStateEs = { error?: string; submitted?: boolean };
export type PreferenceSaveStateEs = { error?: string; saved?: boolean; unsubscribed?: boolean };

export async function submitSubscriptionEs(_previousState: SubscribeStateEs, formData: FormData): Promise<SubscribeStateEs> {
  const limit = await checkRateLimit("email-subscription", 5, 15 * 60 * 1000);
  if (!limit.allowed) return { error: "Demasiados intentos de suscripción. Esperá unos minutos e intentalo de nuevo." };

  try {
    return await requestSubscription(formData, "es");
  } catch {
    return { error: "No se pudo enviar la suscripción." };
  }
}

export async function requestPreferenceAccessEs(_previousState: PreferenceRequestStateEs, formData: FormData): Promise<PreferenceRequestStateEs> {
  const limit = await checkRateLimit("email-preferences", 5, 15 * 60 * 1000);
  if (!limit.allowed) return { error: "Demasiadas solicitudes. Esperá unos minutos e intentalo de nuevo." };
  try {
    return await requestManagementLink(formData, "es");
  } catch {
    return { submitted: true };
  }
}

export async function saveEmailPreferencesEs(_previousState: PreferenceSaveStateEs, formData: FormData): Promise<PreferenceSaveStateEs> {
  const limit = await checkRateLimit("email-preferences-save", 12, 15 * 60 * 1000);
  if (!limit.allowed) return { error: "Demasiados cambios de preferencias. Esperá unos minutos e intentalo de nuevo." };
  try {
    return await savePreferences(formData, "es");
  } catch {
    return { error: "No se pudieron guardar las preferencias." };
  }
}
