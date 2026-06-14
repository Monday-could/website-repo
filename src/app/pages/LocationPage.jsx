import { useI18n } from "../../i18n/I18nContext.jsx";
import { Icon } from "../ui/Icon.jsx";

export function LocationPage() {
  const { t } = useI18n();
  return (
    <section className="content-section page-section" aria-labelledby="location-title">
      <div className="section-heading">
        <p className="eyebrow">{t("location.eyebrow")}</p>
        <h2 id="location-title">{t("location.title")}</h2>
        <p>{t("location.body")}</p>
      </div>
      <div className="location-layout">
        <div className="location-panel">
          <Icon name="pin" />
          <h3>{t("location.addressTitle")}</h3>
          <p className="location-address">{t("location.addressLine")}</p>
          <p className="location-meta">{t("location.addressMeta")}</p>
          <dl className="location-hours" aria-label={t("location.hoursAria")}>
            <div className="location-hours-row">
              <dt>{t("location.monThu")}</dt>
              <dd>{t("location.hoursMonThu")}</dd>
            </div>
            <div className="location-hours-row">
              <dt>{t("location.friSat")}</dt>
              <dd>{t("location.hoursFriSat")}</dd>
            </div>
            <div className="location-hours-row">
              <dt>{t("location.sunday")}</dt>
              <dd>{t("location.hoursSun")}</dd>
            </div>
          </dl>
          <div className="location-contact">
            <a href="tel:+13125550199">(312) 555-0199</a>
            <span aria-hidden="true"> · </span>
            <a href="mailto:hello@dinerdesk.demo">hello@dinerdesk.demo</a>
          </div>
          <p className="location-disclaimer">{t("location.disclaimer")}</p>
        </div>
        <div className="location-panel red-panel">
          <h3>{t("location.panel2Title")}</h3>
          <p>{t("location.panel2p1")}</p>
          <p>{t("location.panel2p2")}</p>
          <p className="location-a11y-note">{t("location.panel2a11y")}</p>
        </div>
      </div>
    </section>
  );
}
