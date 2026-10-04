"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ImagePlus, Minus, Plus } from "lucide-react";
import { AUTHORITY_PHOTO_SIZE, LEADER_LIMITS, MAX_ACTIVE_LEADERS, type AuthorityLeader } from "@/lib/those-in-authority";
import type { LeaderActionState, LeaderFormState } from "./actions";

type FormAction = (state: LeaderFormState, formData: FormData) => Promise<LeaderFormState>;
type ButtonAction = (state: LeaderActionState) => Promise<LeaderActionState>;

// Submits by hand instead of through <form action>, so React does not clear
// the form afterward. A failed save keeps what was typed and the cropped photo.
function submitWithPhoto(event: FormEvent<HTMLFormElement>, dispatch: (formData: FormData) => void, photo: Blob | null) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  if (photo) formData.set("photo", photo, "photo.jpg");
  startTransition(() => dispatch(formData));
}

// ---------------------------------------------------------------------------
// Leader details (create and edit)
// ---------------------------------------------------------------------------

export function LeaderForm({
  leader,
  action,
  canActivate,
}: {
  leader?: AuthorityLeader;
  action: FormAction;
  canActivate: boolean;
}) {
  const [state, formAction, isPending] = useActionState(action, {});
  const [isActive, setIsActive] = useState(leader?.is_active ?? false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoRef = useRef<Blob | null>(null);
  const switchLocked = !isActive && !canActivate;

  return (
    <form onSubmit={(event) => submitWithPhoto(event, formAction, photoRef.current)} className="space-y-4">
      {!leader ? (
        <div>
          <p className="text-sm font-bold text-[#385245]">Photo <span className="font-normal text-[#7a877f]">(optional)</span></p>
          <PhotoCropper onBusyChange={setPhotoBusy} onCropped={(blob) => { photoRef.current = blob; }} />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Name" name="name" defaultValue={leader?.name} maxLength={LEADER_LIMITS.name} placeholder="Jane Doe" />
        <TextField label="Title" name="title" defaultValue={leader?.title} maxLength={LEADER_LIMITS.title} placeholder="President, SCOTUS, Governor…" />
      </div>
      <TextField
        label="Scripture reference"
        name="scriptureReference"
        defaultValue={leader?.scripture_reference}
        maxLength={LEADER_LIMITS.scriptureReference}
        placeholder="Proverbs 21:1"
      />
      <CountedTextarea
        label="Scripture text"
        name="scriptureText"
        defaultValue={leader?.scripture_text ?? ""}
        maxLength={LEADER_LIMITS.scriptureText}
        rows={3}
        required={false}
        hint="Optional. The verse itself, shown above the reference."
      />
      <CountedTextarea
        label="Prayer"
        name="prayer"
        defaultValue={leader?.prayer ?? ""}
        maxLength={LEADER_LIMITS.prayer}
        rows={4}
      />
      <TextField
        label="Photo description"
        name="photoAlt"
        defaultValue={leader?.photo_alt ?? ""}
        maxLength={LEADER_LIMITS.photoAlt}
        required={false}
        placeholder="Official portrait of …"
        hint="Optional. Read aloud by screen readers. Leave blank to use “Photo of [Name]”."
      />

      <div className="rounded-xl border border-[#284a3b]/10 bg-[#f7f2e8] px-4 py-3">
        <label className={`flex items-center justify-between gap-4 ${switchLocked ? "cursor-not-allowed" : "cursor-pointer"}`}>
          <span>
            <span className="block text-sm font-extrabold text-[#385245]">{isActive ? "Active: shown on the public page" : "Not active: hidden from the public page"}</span>
            {switchLocked ? (
              <span className="mt-0.5 block text-xs font-bold text-[#a2472c]">
                {MAX_ACTIVE_LEADERS} leaders are already active. Turn one off to activate this one.
              </span>
            ) : (
              <span className="mt-0.5 block text-xs text-[#607066]">Up to {MAX_ACTIVE_LEADERS} leaders can be active at once.</span>
            )}
          </span>
          <input
            type="checkbox"
            role="switch"
            name="isActive"
            checked={isActive}
            disabled={switchLocked}
            onChange={(event) => setIsActive(event.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className={`relative inline-flex h-7 w-12 shrink-0 rounded-full transition peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#a85e32] ${isActive ? "bg-[#326048]" : "bg-[#c9cfc9]"} ${switchLocked ? "opacity-50" : ""}`}
          >
            <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${isActive ? "left-6" : "left-1"}`} />
          </span>
        </label>
      </div>

      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm font-bold text-[#326048]">Saved.</p> : null}
      <button type="submit" disabled={isPending || photoBusy} className="admin-primary-button">
        {isPending ? "Saving..." : leader ? "Save" : "Add leader"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Photo: replace or remove without touching the rest of the entry
// ---------------------------------------------------------------------------

export function ReplacePhotoForm({ action, hasPhoto }: { action: FormAction; hasPhoto: boolean }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cropperKey, setCropperKey] = useState(0);
  const photoRef = useRef<Blob | null>(null);
  const [state, formAction, isPending] = useActionState(async (previous: LeaderFormState, formData: FormData) => {
    const result = await action(previous, formData);
    if (result.saved) {
      setOpen(false);
      setReady(false);
      setCropperKey((key) => key + 1);
    }
    return result;
  }, {});

  if (!open) {
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)} className="admin-secondary-button w-full">
          {hasPhoto ? "Change photo" : "Add photo"}
        </button>
        {state.saved ? <p role="status" className="mt-2 text-sm font-bold text-[#326048]">Photo saved.</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={(event) => submitWithPhoto(event, formAction, photoRef.current)} className="space-y-3">
      <PhotoCropper
        key={cropperKey}
        autoOpen
        onBusyChange={setBusy}
        onCropped={(blob) => {
          photoRef.current = blob;
          setReady(Boolean(blob));
        }}
      />
      {state.error ? <p role="alert" className="text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={!ready || busy || isPending} className="admin-primary-button flex-1">
          {isPending ? "Saving..." : "Save photo"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setReady(false); setCropperKey((key) => key + 1); }} className="admin-secondary-button">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ActionButton({
  action,
  label,
  pendingLabel,
  confirmation,
  variant = "secondary",
  disabled = false,
  className = "",
}: {
  action: ButtonAction;
  label: string;
  pendingLabel: string;
  confirmation?: string;
  variant?: "secondary" | "danger";
  disabled?: boolean;
  className?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, {});
  const buttonClass = variant === "danger" ? "admin-danger-button" : "admin-secondary-button";

  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirmation && !window.confirm(confirmation)) event.preventDefault();
      }}
    >
      {state.error ? <p role="alert" className="mb-2 text-sm font-bold text-[#a2472c]">{state.error}</p> : null}
      <button type="submit" disabled={isPending || disabled} className={`${buttonClass} w-full`}>
        {isPending ? pendingLabel : label}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Photo cropper
//
// Loads the chosen image into a square frame. Drag to position it and use the
// slider to zoom. The framed area is drawn to a 600×600 JPEG and handed to
// the surrounding form through onCropped.
// ---------------------------------------------------------------------------

const VIEW = 240; // on-screen crop frame, px
const PHOTO_BACKGROUND = "#f4efe5"; // fills space around a zoomed-out photo

type Crop = { zoom: number; x: number; y: number };

function PhotoCropper({
  autoOpen = false,
  onBusyChange,
  onCropped,
}: {
  autoOpen?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onCropped: (photo: Blob | null) => void;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; crop: Crop } | null>(null);
  const encodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<Crop>({ zoom: 1, x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);

  // zoom 1 = the photo fills the frame. Zooming below 1 shrinks it until the
  // whole photo fits (minZoom); the leftover space is filled with cream.
  const baseScale = natural ? Math.max(VIEW / natural.w, VIEW / natural.h) : 1;
  const minZoom = natural ? Math.min(VIEW / natural.w, VIEW / natural.h) / baseScale : 1;

  const clamp = useCallback(
    (next: Crop): Crop => {
      if (!natural) return next;
      const scale = baseScale * next.zoom;
      const w = natural.w * scale;
      const h = natural.h * scale;
      // Larger than the frame: keep it covering the frame. Smaller: keep it inside.
      const within = (value: number, size: number) =>
        Math.min(Math.max(0, VIEW - size), Math.max(Math.min(0, VIEW - size), value));
      return { zoom: next.zoom, x: within(next.x, w), y: within(next.y, h) };
    },
    [natural, baseScale],
  );

  const encode = useCallback(
    (current: Crop) => {
      const image = imageRef.current;
      if (!image || !natural) return;
      if (encodeTimer.current) clearTimeout(encodeTimer.current);
      onBusyChange?.(true);
      encodeTimer.current = setTimeout(() => {
        const scale = baseScale * current.zoom;
        const canvas = document.createElement("canvas");
        canvas.width = AUTHORITY_PHOTO_SIZE;
        canvas.height = AUTHORITY_PHOTO_SIZE;
        const context = canvas.getContext("2d");
        if (!context) {
          setError("This browser could not crop the photo.");
          onBusyChange?.(false);
          return;
        }
        context.fillStyle = PHOTO_BACKGROUND;
        context.fillRect(0, 0, AUTHORITY_PHOTO_SIZE, AUTHORITY_PHOTO_SIZE);
        context.imageSmoothingQuality = "high";
        const k = AUTHORITY_PHOTO_SIZE / VIEW;
        context.drawImage(image, current.x * k, current.y * k, natural.w * scale * k, natural.h * scale * k);
        canvas.toBlob(
          (blob) => {
            if (blob) onCropped(blob);
            else setError("This browser could not crop the photo.");
            onBusyChange?.(false);
          },
          "image/jpeg",
          0.86,
        );
      }, 150);
    },
    [natural, baseScale, onBusyChange, onCropped],
  );

  useEffect(() => {
    if (autoOpen) pickerRef.current?.click();
  }, [autoOpen]);

  useEffect(() => () => {
    if (src) URL.revokeObjectURL(src);
  }, [src]);

  function choose(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file (JPG, PNG, or WebP).");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("That image is over 25 MB. Choose a smaller one.");
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      const w = image.naturalWidth;
      const h = image.naturalHeight;
      const scale = Math.max(VIEW / w, VIEW / h);
      // Start centered horizontally and near the top, where faces usually are.
      const start = { zoom: 1, x: (VIEW - w * scale) / 2, y: Math.min(0, (VIEW - h * scale) * 0.15) };
      setNatural({ w, h });
      setSrc(url);
      setCrop(start);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      setError("That image could not be opened. Try a JPG or PNG.");
    };
    image.src = url;
  }

  // Encode once the image and its starting crop are in place.
  useEffect(() => {
    if (natural && src) encode(crop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural, src]);

  function clear() {
    setSrc(null);
    setNatural(null);
    imageRef.current = null;
    if (pickerRef.current) pickerRef.current.value = "";
    onCropped(null);
  }

  function setZoom(zoom: number) {
    const next = Math.min(4, Math.max(minZoom, zoom));
    const ratio = next / crop.zoom;
    const center = VIEW / 2;
    const updated = clamp({ zoom: next, x: center - (center - crop.x) * ratio, y: center - (center - crop.y) * ratio });
    setCrop(updated);
    encode(updated);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!natural) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, crop };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setCrop(clamp({ ...drag.crop, x: drag.crop.x + event.clientX - drag.startX, y: drag.crop.y + event.clientY - drag.startY }));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    encode(crop);
  }

  const scale = baseScale * crop.zoom;

  return (
    <div className="mt-2">
      <input ref={pickerRef} type="file" accept="image/*" hidden onChange={(event) => choose(event.target.files?.[0])} />

      {src && natural ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[#284a3b]/10 bg-[#f7f2e8] p-4">
          <div
            className="relative cursor-grab touch-none overflow-hidden rounded-2xl border-2 border-[#c99a52] shadow-md active:cursor-grabbing"
            style={{ width: VIEW, height: VIEW, background: PHOTO_BACKGROUND }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt="Crop preview"
              draggable={false}
              className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
              style={{ width: natural.w * scale, height: natural.h * scale, transform: `translate(${crop.x}px, ${crop.y}px)` }}
            />
          </div>
          <p className="text-xs text-[#607066]">Drag to position. Slide left to zoom out, right to zoom in.</p>
          <div className="flex w-full max-w-[15rem] items-center gap-2">
            <button type="button" onClick={() => setZoom(crop.zoom - 0.2)} aria-label="Zoom out" className="grid size-8 place-items-center rounded-lg border border-[#284a3b]/15 bg-white text-[#385245]">
              <Minus aria-hidden="true" size={16} />
            </button>
            <input
              type="range"
              min={minZoom}
              max={4}
              step={0.01}
              value={crop.zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              aria-label="Zoom"
              className="flex-1 accent-[#244a3a]"
            />
            <button type="button" onClick={() => setZoom(crop.zoom + 0.2)} aria-label="Zoom in" className="grid size-8 place-items-center rounded-lg border border-[#284a3b]/15 bg-white text-[#385245]">
              <Plus aria-hidden="true" size={16} />
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => pickerRef.current?.click()} className="admin-secondary-button">Choose a different photo</button>
            <button type="button" onClick={clear} className="admin-secondary-button">Clear</button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => pickerRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#284a3b]/20 bg-[#fffdf8] px-4 py-5 text-sm font-extrabold text-[#385245] transition hover:border-[#a85e32]/40 hover:text-[#a85e32]"
        >
          <ImagePlus aria-hidden="true" size={18} />
          Choose a photo
        </button>
      )}
      {error ? <p role="alert" className="mt-2 text-sm font-bold text-[#a2472c]">{error}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

function TextField({
  label,
  name,
  defaultValue = "",
  maxLength,
  required = true,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  maxLength: number;
  required?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block text-sm font-bold text-[#385245]">
      {label}
      <input name={name} defaultValue={defaultValue} required={required} maxLength={maxLength} placeholder={placeholder} className="admin-input" />
      {hint ? <span className="mt-1 block text-xs font-normal text-[#607066]">{hint}</span> : null}
    </label>
  );
}

function CountedTextarea({
  label,
  name,
  defaultValue,
  maxLength,
  rows,
  required = true,
  hint,
}: {
  label: string;
  name: string;
  defaultValue: string;
  maxLength: number;
  rows: number;
  required?: boolean;
  hint?: string;
}) {
  const [length, setLength] = useState(defaultValue.length);
  const remaining = maxLength - length;
  const tone = remaining <= 0 ? "text-[#a2472c]" : remaining <= Math.max(20, maxLength * 0.1) ? "text-[#946332]" : "text-[#607066]";

  return (
    <label className="block text-sm font-bold text-[#385245]">
      <span className="flex items-baseline justify-between gap-3">
        <span>
          {label} <span className="font-normal text-[#7a877f]">({maxLength} characters max)</span>
        </span>
        <span className={`text-xs font-extrabold tabular-nums ${tone}`} aria-live="polite">
          {remaining} {remaining === 1 ? "character" : "characters"} left
        </span>
      </span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        required={required}
        maxLength={maxLength}
        rows={rows}
        onChange={(event) => setLength(event.target.value.length)}
        className="admin-input resize-y py-3"
      />
      {hint ? <span className="mt-1 block text-xs font-normal text-[#607066]">{hint}</span> : null}
    </label>
  );
}
