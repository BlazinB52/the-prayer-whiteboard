import { redirect } from "next/navigation";

// Moved to the Content Management area. Kept so old bookmarks still work.
export default function LegacyAdminPointsOfAgreementPage() {
  redirect("/admin/cm/points-of-agreement");
}
