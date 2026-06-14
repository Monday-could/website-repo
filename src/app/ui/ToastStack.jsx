import { useI18n } from "../../i18n/I18nContext.jsx";
import { Icon } from "./Icon.jsx";

export function ToastStack({ toasts, onDismiss }) {
  const { t } = useI18n();
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="region" aria-label={t("common.notifications")} aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.variant || "error"}`} role="alert">
          <p className="toast-message">{toast.message}</p>
          <button type="button" className="toast-dismiss" aria-label={t("common.dismissNotification")} onClick={() => onDismiss(toast.id)}>
            <Icon name="x" />
          </button>
        </div>
      ))}
    </div>
  );
}
