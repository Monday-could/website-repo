import { Link, useLocation } from "react-router-dom";
import { useI18n } from "../../i18n/I18nContext.jsx";

export function OrderSuccessPage() {
  const { t } = useI18n();
  const location = useLocation();
  const summary =
    location.state && typeof location.state === "object" && !Array.isArray(location.state) ? location.state : null;
  const qty = Math.max(0, Math.floor(Number(summary?.qty)));
  const lines = Math.max(0, Math.floor(Number(summary?.lines)));

  return (
    <section className="content-section page-section order-success-page" aria-labelledby="order-success-title">
      <div className="section-heading">
        <p className="eyebrow">{t("orderSuccess.eyebrow")}</p>
        <h1 id="order-success-title" className="order-success-title">
          {t("orderSuccess.title")}
        </h1>
        <p>{t("orderSuccess.body")}</p>
        {qty > 0 && lines > 0 ? (
          <p className="order-success-summary">{t("orderSuccess.summary", { qty, lines })}</p>
        ) : null}
      </div>
      <div className="order-success-actions">
        <Link className="primary-cta" to="/menu">
          {t("orderSuccess.backMenu")}
        </Link>
        <Link className="secondary-cta" to="/">
          {t("orderSuccess.backHome")}
        </Link>
      </div>
    </section>
  );
}
