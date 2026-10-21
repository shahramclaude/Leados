import { useTranslations } from "next-intl";

/** Always-visible marker so synthetic onboarding data is never mistaken for real data. */
export default function SampleDataBadge() {
  const t = useTranslations("common");
  return (
    <span className="sample-badge" aria-label={t("sampleBadge")}>
      {t("sampleBadge")}
    </span>
  );
}
