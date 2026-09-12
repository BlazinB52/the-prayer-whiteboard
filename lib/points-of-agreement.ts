export const POINTS_OF_AGREEMENT_STATUS = ["active", "archived"] as const;
export const EXPIRING_SOON_DAYS = 7;

export type PointOfAgreementStatus = (typeof POINTS_OF_AGREEMENT_STATUS)[number];

export type PointsOfAgreementGuideSettings = {
  title: string;
  subtitle: string;
  opening_scripture: string;
  opening_scripture_reference: string;
  footer_quotation: string;
  footer_scripture_reference: string;
};

export type PointOfAgreement = {
  id: string;
  point_of_agreement: string;
  scripture: string;
  target: string;
  decree: string;
  additional_direction: string | null;
  expires_on: string;
  display_order: number;
  status: PointOfAgreementStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type PublicPointOfAgreement = Omit<
  PointOfAgreement,
  "id" | "expires_on" | "status" | "created_at" | "updated_at" | "archived_at"
>;

export const DEFAULT_POINTS_OF_AGREEMENT_GUIDE_SETTINGS: PointsOfAgreementGuideSettings = {
  title: "PRAYER & INTERCESSION GUIDE",
  subtitle: "Hebrew Year 5787: The Year of Spoken Word & Divine Rest",
  opening_scripture:
    "“Take the helmet of salvation and the sword of the Spirit, which is the word of God. Praying in the Spirit always...”",
  opening_scripture_reference: "EPHESIANS 6:17–18",
  footer_quotation:
    "“Again I say to you, if two of you agree on earth about anything they ask, it will be done for them by my Father in heaven.”",
  footer_scripture_reference: "MATTHEW 18:19",
};

export function isPointOfAgreementStatus(value: string): value is PointOfAgreementStatus {
  return POINTS_OF_AGREEMENT_STATUS.includes(value as PointOfAgreementStatus);
}

export function getExpirationState(expiresOn: string, now = new Date()) {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const expirationUtc = Date.parse(`${expiresOn}T00:00:00Z`);
  const daysUntilExpiration = Math.floor((expirationUtc - todayUtc) / 86_400_000);

  if (daysUntilExpiration < 0) return "expired";
  if (daysUntilExpiration <= EXPIRING_SOON_DAYS) return "expiring-soon";
  return "current";
}

export function formatGuideDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
