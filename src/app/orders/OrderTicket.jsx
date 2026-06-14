import { useI18n } from "../../i18n/I18nContext.jsx";
import { formatPrice } from "../formatters.js";
import { Icon } from "../ui/Icon.jsx";

export function OrderTicket({ order, children, onReady, hideReadyState = false }) {
  const { t } = useI18n();
  const isReady = Boolean(order.ready);
  const showReadyPill = !hideReadyState && order.status === "accepted";
  const statusKey = `orderStatus.${order.status}`;
  const statusLabel = t(statusKey) !== statusKey ? t(statusKey) : order.status.toUpperCase();
  const customerLabel = order.customerName === "Walk-in Guest" ? t("common.walkInGuest") : order.customerName;

  return (
    <article className={`ticket status-${order.status}`}>
      <div>
        <p className="ticket-meta">{new Date(order.createdAt).toLocaleString()}</p>
        <h3>{order.itemName}</h3>
        <p>
          {order.quantity} × {formatPrice(order.price)} = {formatPrice(Number(order.price) * Number(order.quantity || 1))}{" "}
          · {customerLabel}
        </p>
        <p>{order.notes}</p>
      </div>
      <div className="ticket-footer">
        <span className={`status-pill status-label-${order.status}`}>{statusLabel}</span>
        <div className="ticket-actions">
          {children}
          {onReady && (
            <button className="ready-button" type="button" onClick={() => onReady(order.id)}>
              {t("staff.ready")}
            </button>
          )}
          {showReadyPill && (
            <span className={isReady ? "ready-pill ready" : "ready-pill not-ready"}>
              {isReady ? t("staff.readyYes") : t("staff.readyNo")}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
