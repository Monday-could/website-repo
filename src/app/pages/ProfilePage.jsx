import { Link } from "react-router-dom";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { ProfileOrderHistoryBlock } from "../orders/ProfileOrderHistoryBlock.jsx";

export function ProfilePage({ session, orders = [] }) {
  const { t } = useI18n();
  const roleKey =
    session?.role === "staff"
      ? "profile.roleStaff"
      : session?.role === "owner"
        ? "profile.roleOwner"
        : session?.role === "customer"
          ? "profile.roleCustomer"
          : null;
  const roleLabel = roleKey ? t(roleKey) : "";

  return (
    <section className="content-section page-section" aria-labelledby="profile-title">
      <div className="section-heading">
        <p className="eyebrow">{t("profile.eyebrow")}</p>
        {!session ? (
          <div className="profile-hero-row">
            <h2 id="profile-title" className="profile-hero-title">
              {t("profile.titleGuest")}
            </h2>
            <div className="profile-auth-actions">
              <Link className="primary-cta" to="/login">
                {t("profile.login")}
              </Link>
              <Link className="secondary-cta" to="/register">
                {t("profile.register")}
              </Link>
            </div>
          </div>
        ) : (
          <h2 id="profile-title">{t("profile.titleLogged", { name: session.username })}</h2>
        )}
        <p>
          {!session
            ? t("profile.bodyGuest")
            : session.role === "customer"
              ? t("profile.bodyCustomer")
              : t("profile.bodyStaff", { role: roleLabel })}
        </p>
      </div>
      {session ? (
        <div className="profile-order-history" aria-labelledby="profile-order-history-title">
          <h3 id="profile-order-history-title" className="profile-order-history-heading">
            {t("profile.orderHistoryTitle")}
          </h3>
          <p className="profile-order-history-intro">{t("profile.orderHistoryIntro")}</p>
          <ProfileOrderHistoryBlock session={session} orders={orders} />
        </div>
      ) : null}
    </section>
  );
}
