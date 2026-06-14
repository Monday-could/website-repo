import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { getPersonalOrdersForSession } from "../orderRowHelpers.js";
import { OrderTicket } from "./OrderTicket.jsx";

export function CustomerOrderHistory({ session, orders, context = "orders" }) {
  const { t } = useI18n();
  const mine = useMemo(() => getPersonalOrdersForSession(session, orders), [session?.id, orders]);
  const onProfile = context === "profile";

  if (!mine.length) {
    return (
      <div className="empty-state empty-state--soft profile-empty-panel">
        <p className="empty-state-title">
          {onProfile ? t("profile.orderHistoryEmptyTitle") : t("ordersPage.historyEmptyTitle")}
        </p>
        <p className="empty-state-hint">
          {onProfile ? t("profile.orderHistoryEmptyHint") : t("ordersPage.historyEmptyHint")}
        </p>
        <Link className="primary-cta" to="/menu">
          {t("profile.goMenu")}
        </Link>
      </div>
    );
  }

  return (
    <div className="order-history">
      <div className="ticket-list" role="list">
        {mine.map((order) => (
          <OrderTicket key={order.id} order={order} />
        ))}
      </div>
    </div>
  );
}
