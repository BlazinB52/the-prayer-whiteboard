import type { ReactNode } from "react";

export type SectionCalloutType = "our-prayer" | "application-for-believers" | "custom";
export type SectionCalloutStyle = "filled" | "outline" | "soft";

export type SectionCallout = {
  enabled: boolean;
  type: SectionCalloutType;
  heading?: string;
  color: string;
  style: SectionCalloutStyle;
};

export type SectionContentValue = {
  format: "paragraph" | "bullets" | "scripture" | "takeaway";
  text?: string;
  introduction?: string;
  conclusion?: string;
  reference?: string;
  translation?: string;
  quotation?: string;
  bullets?: string[];
  callout?: SectionCallout;
};

export function getPresetDefaults(type: SectionCalloutType) {
  if (type === "our-prayer") return { heading: "", color: "#d9b24d", style: "filled" as const };
  if (type === "application-for-believers") return { heading: "", color: "#7a9b7d", style: "filled" as const };
  return { heading: "", color: "#d9b24d", style: "filled" as const };
}

const INTERNAL_CALL_OUT_LABELS = new Set(["callout", "custom", "application for believers", "our prayer"]);

export function normalizeCallout(value: unknown): SectionCallout | undefined {
  if (!value || typeof value !== "object") return undefined;
  const callout = value as Record<string, unknown>;
  const enabled = Boolean(callout.enabled);
  if (!enabled) return undefined;

  const type = ["our-prayer", "application-for-believers", "custom"].includes(String(callout.type ?? "custom"))
    ? (String(callout.type ?? "custom") as SectionCalloutType)
    : "custom";

  const preset = getPresetDefaults(type);
  const rawHeading = typeof callout.heading === "string" ? callout.heading.trim() : "";
  const heading = rawHeading && !INTERNAL_CALL_OUT_LABELS.has(rawHeading.toLowerCase()) ? rawHeading : undefined;
  const color = typeof callout.color === "string" && /^#[0-9a-fA-F]{6}$/.test(callout.color) ? callout.color : preset.color;
  const style = ["filled", "outline", "soft"].includes(String(callout.style ?? "filled"))
    ? (String(callout.style ?? "filled") as SectionCalloutStyle)
    : "filled";

  return { enabled: true, type, ...(heading ? { heading } : {}), color, style };
}

export function getCalloutLabel(callout: SectionCallout | undefined) {
  if (!callout) return "";
  const heading = callout.heading?.trim();
  if (!heading || INTERNAL_CALL_OUT_LABELS.has(heading.toLowerCase())) return "";
  return heading;
}

export function getCalloutStyles(color: string, style: SectionCalloutStyle) {
  return {
    filled: { border: "1px solid transparent", background: color, color: "#1a241d", borderColor: color },
    outline: { border: `1px solid ${color}`, background: "transparent", color: "#243126", borderColor: color },
    soft: { border: `1px solid ${color}`, background: `${color}22`, color: "#243126", borderColor: color },
  }[style];
}

function TextParagraphs({ text, className }: { text: unknown; className?: string }) {
  const paragraphs = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map((paragraph) => paragraph.trim()).filter(Boolean);
  return <div className={className ?? "space-y-3"}>{paragraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`} className="whitespace-pre-wrap">{paragraph}</p>)}</div>;
}

function renderSectionBody({ value, title }: { value: SectionContentValue; title?: string }) {
  if (value.format === "bullets") {
    return (
      <>
        {title ? <h3 className="text-base font-extrabold text-[#385245]">{title}</h3> : null}
        {value.introduction ? <TextParagraphs text={value.introduction} className="space-y-3 text-[#52645a]" /> : null}
        {value.bullets && value.bullets.length ? <ul className="mt-3 list-disc space-y-2 pl-6 text-[#52645a]">{value.bullets.map((bullet) => <li key={String(bullet)}>{String(bullet)}</li>)}</ul> : null}
        {value.conclusion ? <TextParagraphs text={value.conclusion} className="mt-3 space-y-3 text-[#52645a]" /> : null}
      </>
    );
  }

  if (value.format === "scripture") {
    return (
      <>
        {title ? <h3 className="text-base font-extrabold text-[#385245]">{title}</h3> : null}
        {value.introduction ? <TextParagraphs text={value.introduction} className="space-y-3 text-[#52645a]" /> : null}
        <p className="mt-3 font-bold text-[#385245]">{String(value.reference ?? "")} {value.translation ? <span className="font-normal text-[#607066]">({String(value.translation)})</span> : null}</p>
        {value.quotation ? <div className="mt-2 space-y-3 italic text-[#52645a]"><TextParagraphs text={value.quotation} className="space-y-3" /></div> : null}
      </>
    );
  }

  const textContent = value.format === "takeaway" ? <TextParagraphs text={value.text} className="space-y-3 font-bold text-[#385245]" /> : <TextParagraphs text={value.text} className="space-y-3 text-[#52645a]" />;

  return (
    <>
      {title ? <h3 className="text-base font-extrabold text-[#385245]">{title}</h3> : null}
      {textContent}
    </>
  );
}

export function CalloutSection({ title, value, callout, className = "" }: { title?: string; value: SectionContentValue; callout?: SectionCallout; className?: string }): ReactNode {
  const resolvedCallout = callout && callout.enabled ? callout : undefined;
  const body = renderSectionBody({ value, title: resolvedCallout ? title : title });

  if (!resolvedCallout) {
    return <section className={className}>{body}</section>;
  }

  const label = getCalloutLabel(resolvedCallout);
  const styles = getCalloutStyles(resolvedCallout.color, resolvedCallout.style);

  return (
    <section className={className}>
      <div className="rounded-xl px-4 py-3 text-sm" style={styles}>
        <div className="text-xs font-extrabold uppercase tracking-[0.14em]">{label}</div>
        {title ? <h3 className="mt-2 text-base font-extrabold text-[#385245]">{title}</h3> : null}
        <div className="mt-3 space-y-3 text-[#52645a]">
          {value.format === "bullets" ? (
            <>
              {value.introduction ? <TextParagraphs text={value.introduction} className="space-y-3" /> : null}
              {value.bullets && value.bullets.length ? <ul className="list-disc space-y-2 pl-6">{value.bullets.map((bullet) => <li key={String(bullet)}>{String(bullet)}</li>)}</ul> : null}
              {value.conclusion ? <TextParagraphs text={value.conclusion} className="mt-3 space-y-3" /> : null}
            </>
          ) : value.format === "scripture" ? (
            <>
              {value.introduction ? <TextParagraphs text={value.introduction} className="space-y-3" /> : null}
              <p className="font-bold text-[#385245]">{String(value.reference ?? "")} {value.translation ? <span className="font-normal text-[#607066]">({String(value.translation)})</span> : null}</p>
              {value.quotation ? <div className="mt-2 space-y-3 italic"><TextParagraphs text={value.quotation} className="space-y-3" /></div> : null}
            </>
          ) : (
            <TextParagraphs text={value.text} className={value.format === "takeaway" ? "space-y-3 font-bold text-[#385245]" : "space-y-3"} />
          )}
        </div>
      </div>
    </section>
  );
}
