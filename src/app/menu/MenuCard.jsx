import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { MAX_REVIEW_BODY_LENGTH, MIN_REVIEW_BODY_LENGTH, sanitizeText } from "../../lib/securityLimits.js";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { useReactBits } from "../../react-bits/ReactBitsProvider.jsx";
import SpotlightCard from "../../react-bits/SpotlightCard.jsx";
import { MENU_CARD_REVIEW_PREVIEW_COUNT } from "../appConstants.js";
import { formatPrice } from "../formatters.js";
import { badgeToneClass, getAllBadgesForItem } from "../menuModelAndBadges.js";
import { DishReviewsModal } from "../ui/DishReviewsModal.jsx";
import { Icon } from "../ui/Icon.jsx";
import { StarRating } from "../ui/StarRating.jsx";

export function MenuCard({
  item,
  onOrder,
  onReview,
  session = null,
  orders = [],
  menuForBadges = [],
  reviewOpen: reviewOpenProp = false,
  onReviewPanelToggle,
}) {
  const { t } = useI18n();
  const rb = useReactBits();
  const location = useLocation();
  const [fallbackReviewOpen, setFallbackReviewOpen] = useState(false);
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const controlledReview = typeof onReviewPanelToggle === "function";
  const reviewOpen = controlledReview ? reviewOpenProp : fallbackReviewOpen;

  function toggleReviewPanel() {
    if (controlledReview) onReviewPanelToggle(item.id);
    else setFallbackReviewOpen((o) => !o);
  }

  function closeReviewPanel() {
    if (controlledReview) onReviewPanelToggle(null);
    else setFallbackReviewOpen(false);
  }

  const badgeCtx = useMemo(
    () => ({ orders, menu: menuForBadges.length ? menuForBadges : [item] }),
    [orders, menuForBadges, item],
  );
  const badges = useMemo(() => getAllBadgesForItem(item, badgeCtx), [item, badgeCtx]);

  const previewReviews = useMemo(() => {
    const list = Array.isArray(item.reviews) ? item.reviews : [];
    return list.slice(0, MENU_CARD_REVIEW_PREVIEW_COUNT);
  }, [item.reviews]);

  const averageRating = useMemo(() => {
    if (!item.reviews.length) return 0;
    const total = item.reviews.reduce((sum, review) => sum + Number(review.rating), 0);
    return Math.round(total / item.reviews.length);
  }, [item.reviews]);

  const returnToParam = useMemo(
    () => encodeURIComponent(`${location.pathname}${location.search || ""}`),
    [location.pathname, location.search],
  );

  const cleanReviewText = sanitizeText(text, { maxLength: MAX_REVIEW_BODY_LENGTH });
  const canSubmitReview = cleanReviewText.length >= MIN_REVIEW_BODY_LENGTH && !reviewSubmitting;

  async function submitReview(event) {
    event.preventDefault();
    if (!session || !onReview || !canSubmitReview) return;
    const name = session.username?.trim() || "";
    setReviewSubmitting(true);
    let ok = false;
    try {
      ok = await onReview(item.id, {
        author: name,
        rating: Number(rating),
        text: cleanReviewText,
      });
    } finally {
      setReviewSubmitting(false);
    }
    if (!ok) return;
    setText("");
    setRating(5);
    closeReviewPanel();
  }

  return (
    <SpotlightCard
      as="article"
      className="food-card"
      active={rb.foodSpotlight}
      spotlightColor="rgba(255, 198, 41, 0.14)"
    >
      <div className="food-image-wrap">
        <img src={item.image} alt={`${item.name} dish`} />
        {badges.length ? (
          <div className="food-card-badges-wrap">
            {badges.map((b) => (
              <span key={b} className={`badge ${badgeToneClass(b)}`}>
                {b}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="food-card-body">
        <div className="food-title-row">
          <div>
            <p className="category">{item.category}</p>
            <h3>{item.name}</h3>
          </div>
          <strong>{formatPrice(item.price)}</strong>
        </div>
        <p>{item.description}</p>
        <div className="rating-line">
          {averageRating ? <StarRating value={averageRating} /> : <span>{t("menuCard.noReviewsYet")}</span>}
          <span>
            {item.reviews.length === 1
              ? t("menuCard.reviewCount", { count: item.reviews.length })
              : t("menuCard.reviewCountPlural", { count: item.reviews.length })}
          </span>
        </div>
        <div className="card-actions">
          <button className="primary-cta small" type="button" onClick={() => onOrder(item)}>
            <Icon name="plus" />
            {t("menuCard.addToCart")}
          </button>
          {onReview && (
            <button className="secondary-cta small" type="button" onClick={toggleReviewPanel}>
              {t("menuCard.review")}
            </button>
          )}
        </div>
        {reviewOpen && !session ? (
          <div className="review-login-gate">
            <p className="review-login-gate-title">{t("menuCard.reviewLoginTitle")}</p>
            <p className="review-login-gate-hint">{t("menuCard.reviewLoginHint")}</p>
            <div className="review-login-gate-actions">
              <Link className="primary-cta small" to={`/login?returnTo=${returnToParam}`}>
                {t("header.login")}
              </Link>
              <Link className="secondary-cta small" to={`/register?returnTo=${returnToParam}`}>
                {t("header.register")}
              </Link>
            </div>
          </div>
        ) : null}
        {reviewOpen && session ? (
          <form className="review-form" onSubmit={submitReview}>
            <p className="review-form-account full-row">{t("menuCard.reviewPostedAs", { name: session.username })}</p>
            <label className="full-row">
              {t("menuCard.rating")}
              <select value={rating} onChange={(event) => setRating(event.target.value)}>
                {[5, 4, 3, 2, 1].map((value) => (
                  <option key={value} value={value}>
                    {t("menuCard.starsOption", { n: value })}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-row">
              {t("menuCard.reviewText")}
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t("menuCard.reviewPlaceholder")}
                rows="3"
                minLength={MIN_REVIEW_BODY_LENGTH}
                maxLength={MAX_REVIEW_BODY_LENGTH}
                required
              />
            </label>
            <button className="primary-cta small full-row" type="submit" disabled={!canSubmitReview}>
              {reviewSubmitting ? t("common.saving") : t("menuCard.sendReview")}
            </button>
          </form>
        ) : null}
        <section className="menu-card-reviews" aria-labelledby={`reviews-heading-${item.id}`}>
          <h4 className="menu-card-reviews-heading" id={`reviews-heading-${item.id}`}>
            {t("menuCard.recentReviews")}
          </h4>
          {item.reviews.length === 0 ? (
            <p className="menu-card-reviews-empty">{t("menuCard.firstReview")}</p>
          ) : (
            <>
              {item.reviews.length > MENU_CARD_REVIEW_PREVIEW_COUNT ? (
                <p className="menu-card-reviews-note">
                  {t("menuCard.showingLatest", { n: MENU_CARD_REVIEW_PREVIEW_COUNT, total: item.reviews.length })}
                </p>
              ) : null}
              <ul className="menu-card-reviews-list">
                {previewReviews.map((review, index) => {
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
              <button
                type="button"
                className="secondary-cta small menu-card-reviews-modal-btn"
                onClick={() => setReviewsModalOpen(true)}
              >
                {item.reviews.length > MENU_CARD_REVIEW_PREVIEW_COUNT
                  ? t("menuCard.viewAllCount", { count: item.reviews.length })
                  : t("menuCard.viewAllReviews")}
              </button>
            </>
          )}
        </section>
      </div>
      <DishReviewsModal open={reviewsModalOpen} onClose={() => setReviewsModalOpen(false)} item={item} />
    </SpotlightCard>
  );
}
