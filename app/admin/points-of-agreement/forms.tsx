"use client";

import { useActionState, useState } from "react";
import type {
  PointOfAgreement,
  PointOfAgreementStatus,
  PointsOfAgreementGuideSettings,
} from "@/lib/points-of-agreement";
import type { PointActionState } from "./actions";

type FormState = { error?: string; saved?: boolean };
type FormAction = (state: FormState, formData: FormData) => Promise<FormState>;
type ButtonAction = (state: PointActionState) => Promise<PointActionState>;
type DeleteAction = (state: PointActionState, formData: FormData) => Promise<PointActionState>;

export function GuideSettingsForm({ settings, action }: { settings: PointsOfAgreementGuideSettings; action: FormAction }) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <TextInput label="Title" name="title" defaultValue={settings.title} maxLength={140} />
      <TextInput label="Subtitle" name="subtitle" defaultValue={settings.subtitle} maxLength={240} />
      <Textarea label="Opening Scripture" name="openingScripture" defaultValue={settings.opening_scripture} maxLength={2000} rows={4} />
      <TextInput label="Opening Scripture Reference" name="openingScriptureReference" defaultValue={settings.opening_scripture_reference} maxLength={140} />
      <Textarea label="Footer quotation" name="footerQuotation" defaultValue={settings.footer_quotation} maxLength={2000} rows={4} />
      <TextInput label="Footer Scripture Reference" name="footerScriptureReference" defaultValue={settings.footer_scripture_reference} maxLength={140} />
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Guide header and footer saved.</p> : null}
      <button type="submit" disabled={isPending} className="admin-primary-button">{isPending ? "Saving..." : "Save guide text"}</button>
    </form>
  );
}

export function PointOfAgreementForm({ point, action }: { point?: PointOfAgreement; action: FormAction }) {
  const [status, setStatus] = useState<PointOfAgreementStatus>(point?.status ?? "active");
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-4">
      <TextInput label="Point of Agreement" name="pointOfAgreement" defaultValue={point?.point_of_agreement ?? ""} maxLength={140} />
      <Textarea label="Scripture" name="scripture" defaultValue={point?.scripture ?? ""} maxLength={4000} rows={5} />
      <Textarea label="Target" name="target" defaultValue={point?.target ?? ""} maxLength={3000} rows={4} />
      <Textarea label="Decree" name="decree" defaultValue={point?.decree ?? ""} maxLength={3000} rows={4} />
      <Textarea label="Additional Direction" name="additionalDirection" defaultValue={point?.additional_direction ?? ""} maxLength={3000} rows={3} required={false} />
      <div className={`grid gap-4 ${point ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <TextInput label="Expiration date" name="expiresOn" type="date" defaultValue={point?.expires_on ?? ""} />
        {point ? <TextInput label="Display order" name="displayOrder" type="number" min={1} defaultValue={String(point.display_order)} /> : null}
        <label className="block text-sm font-bold text-[#385245]">
          Status
          <select name="status" value={status} onChange={(event) => setStatus(event.target.value as PointOfAgreementStatus)} className="admin-input">
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Point saved.</p> : null}
      <button type="submit" disabled={isPending} className="admin-primary-button">{isPending ? "Saving..." : point ? "Save point" : "Create point"}</button>
    </form>
  );
}

export function ConfirmActionButton({ action, label, pendingLabel, confirmation, variant = "secondary", disabled = false }: { action: ButtonAction; label: string; pendingLabel: string; confirmation?: string; variant?: "primary" | "secondary" | "danger"; disabled?: boolean }) {
  const [state, formAction, isPending] = useActionState(action, {});
  const className = variant === "primary" ? "admin-primary-button" : variant === "danger" ? "admin-danger-button" : "admin-secondary-button";

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmation && !window.confirm(confirmation)) {
          event.preventDefault();
        }
      }}
    >
      {state.error ? <p role="alert" className="mb-2 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={isPending || disabled} className={className}>{isPending ? pendingLabel : label}</button>
    </form>
  );
}

export function DeletePointForm({ action }: { action: DeleteAction }) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("This permanently deletes the point. Continue?")) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-2"
    >
      <input name="confirmation" placeholder="Type DELETE" className="admin-input mt-0 max-w-44 text-sm" />
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={isPending} className="admin-danger-button">{isPending ? "Deleting..." : "Delete permanently"}</button>
    </form>
  );
}

function TextInput({ label, name, defaultValue, maxLength, type = "text", min }: { label: string; name: string; defaultValue: string; maxLength?: number; type?: string; min?: number }) {
  return (
    <label className="block text-sm font-bold text-[#385245]">
      {label}
      <input name={name} type={type} defaultValue={defaultValue} required min={min} maxLength={maxLength} className="admin-input" />
    </label>
  );
}

function Textarea({ label, name, defaultValue, maxLength, rows, required = true }: { label: string; name: string; defaultValue: string; maxLength: number; rows: number; required?: boolean }) {
  return (
    <label className="block text-sm font-bold text-[#385245]">
      {label}
      <textarea name={name} defaultValue={defaultValue} required={required} maxLength={maxLength} rows={rows} className="admin-input resize-y py-3" />
    </label>
  );
}
