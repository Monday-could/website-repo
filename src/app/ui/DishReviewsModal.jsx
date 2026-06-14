import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { Icon } from "./Icon.jsx";
import { StarRating } from "./StarRating.jsx";

export function DishReviewsModal({ open, onClose, item }) {
  const { t } = useI18n();
  const titleId = item ? `dish-reviews-modal-title-${item.id}` : "dish-reviews-modal-title";

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !item || !item.reviews?.length) return null;

  return createPortal(
    <div className="order-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="order-modal dish-reviews-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="order-modal-header">
          <h2 id={titleId}>{t("dishReviews.title")}</h2>
          <button type="button" className="icon-button" aria-label={t("common.close")} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <p className="order-modal-dish">{item.name}</p>
        <p className="dish-reviews-modal-count">{t("dishReviews.total", { count: item.reviews.length })}</p>
        <ul className="dish-reviews-modal-list">
          {item.reviews.map((review, index) => {
            const rid = review.id ?? `${item.id}-review-${index}`;
            const stars = Math.min(5, Math.max(0, Math.round(Number(review.rating) || 0)));
            return (
              <li key={rid} className="menu-card-review-item">
                <div className="menu-card-review-meta">
                  <strong>{review.author && review.author !== "Guest" ? review.author : t("common.guest")}</strong>
                  {stars > 0 ? <StarRating value={stars} /> : null}
                </div>
                <p>{review.text}</p>
              </li>
            );
          })}
        </ul>
        <div className="order-modal-actions">
          <button type="button" className="primary-cta" onClick={onClose}>
            {t("dishReviews.close")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
