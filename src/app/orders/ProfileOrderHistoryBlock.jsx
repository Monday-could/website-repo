import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { PROFILE_ORDER_HISTORY_PREVIEW } from "../appConstants.js";
import { getPersonalOrdersForSession } from "../orderRowHelpers.js";
import { OrderHistorySheet } from "./OrderHistorySheet.jsx";
import { OrderTicket } from "./OrderTicket.jsx";

export function ProfileOrderHistoryBlock({ session, orders }) {
  const { t } = useI18n();
  const [sheetOpen, setSheetOpen] = useState(false);
  const mine = useMemo(() => getPersonalOrdersForSession(session, orders), [session?.id, orders]);
  const preview = useMemo(() => mine.slice(0, PROFILE_ORDER_HISTORY_PREVIEW), [mine]);

  if (!mine.length) {
    return (
      <div className="empty-state empty-state--soft profile-empty-panel">
        <p className="empty-state-title">{t("profile.orderHistoryEmptyTitle")}</p>
        <p className="empty-state-hint">{t("profile.orderHistoryEmptyHint")}</p>
        <Link className="primary-cta" to="/menu">
          {t("profile.goMenu")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="order-history profile-order-history-preview">
        <div className="ticket-list" role="list">
          {preview.map((order) => (
            <OrderTicket key={order.id} order={order} />
          ))}
        </div>
      </div>
      {mine.length > PROFILE_ORDER_HISTORY_PREVIEW ? (
        <div className="profile-order-history-actions">
          <button type="button" className="secondary-cta" onClick={() => setSheetOpen(true)}>
            {t("profile.viewAllOrders")}
          </button>
        </div>
      ) : null}
      {sheetOpen ? <OrderHistorySheet orders={mine} onClose={() => setSheetOpen(false)} /> : null}
    </>
  );
}
