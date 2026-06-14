import { useEffect } from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { Icon } from "../ui/Icon.jsx";
import { OrderTicket } from "./OrderTicket.jsx";

export function OrderHistorySheet({ orders, onClose }) {
  const { t } = useI18n();
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="order-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="order-modal profile-order-sheet-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-order-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="order-modal-header">
          <h2 id="profile-order-sheet-title">{t("profile.allOrdersTitle")}</h2>
          <button type="button" className="icon-button" aria-label={t("dishReviews.close")} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="profile-order-sheet-scroll" role="list">
          <div className="ticket-list">
            {orders.map((order) => (
              <OrderTicket key={order.id} order={order} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
