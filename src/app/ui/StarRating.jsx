import { useI18n } from "../../i18n/I18nContext.jsx";

export function StarRating({ value }) {
  const { t } = useI18n();
  return (
    <span className="stars" aria-label={t("a11y.stars", { value })}>
      {"\u2605".repeat(value)}
      <span>{"\u2606".repeat(5 - value)}</span>
    </span>
  );
}
