import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MAX_ORDER_QUANTITY } from "../../lib/securityLimits.js";
import { runCartLayoutMotion } from "../../lib/uiMotion.js";
import { usePrefersReducedMotion } from "../../lib/usePrefersReducedMotion.js";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { formatPrice } from "../formatters.js";
import { getCartQuantity } from "../cartStorage.js";

export function CartPage({ cart, onUpdateQuantity, onRemoveLine, onCheckout }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const cartLayoutRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + Number(line.price) * Number(line.quantity || 1), 0),
    [cart],
  );
  const totalItems = useMemo(() => getCartQuantity(cart), [cart]);
  const cartLayoutAnimated = useRef(false);

  useLayoutEffect(() => {
    if (!cart.length) {
      cartLayoutAnimated.current = false;
      return;
    }
    if (reducedMotion || cartLayoutAnimated.current) return;
    cartLayoutAnimated.current = true;
    const ctx = runCartLayoutMotion(cartLayoutRef.current, { reducedMotion });
    return () => ctx?.revert();
  }, [cart.length, reducedMotion]);

  async function handleCheckout() {
    if (!cart.length) return;
    const qty = cart.reduce((sum, line) => sum + Number(line.quantity || 1), 0);
    const lines = cart.length;
    const ok = await onCheckout();
    if (!ok) return;
    navigate("/order-success", { state: { qty, lines } });
  }

  return (
    <section className="cart-page content-section page-section" aria-labelledby="cart-title">
      <div className="section-heading cart-page-intro">
        <p className="eyebrow">{t("cart.eyebrow")}</p>
        <h1 id="cart-title">{t("cart.title")}</h1>
        <p>{t("cart.intro")}</p>
      </div>

      {!cart.length ? (
        <div className="cart-empty-panel">
          <p className="cart-empty-title">{t("cart.emptyTitle")}</p>
          <p className="cart-empty-copy">{t("cart.emptyCopy")}</p>
          <Link className="primary-cta" to="/menu">
            {t("cart.browseMenu")}
          </Link>
        </div>
      ) : (
        <div className="cart-layout" ref={cartLayoutRef}>
          <div className="cart-lines-panel">
            <h2 className="cart-panel-heading">{t("cart.itemsHead")}</h2>
            <ul className="cart-line-list">
              {cart.map((line) => {
                const lineTotal = Number(line.price) * Number(line.quantity || 1);
                return (
                  <li key={line.id} className="cart-line">
                    <div className="cart-line-thumb">
                      <img src={line.image} alt="" />
                    </div>
                    <div className="cart-line-body">
                      <div className="cart-line-top">
                        <h3>{line.itemName}</h3>
                        <strong className="cart-line-price">{formatPrice(lineTotal)}</strong>
                      </div>
                      <p className="cart-line-unit">{t("cart.each", { price: formatPrice(line.price) })}</p>
                      {line.notes && line.notes !== "No special request" ? (
                        <p className="cart-line-notes">
                          <span className="cart-notes-label">{t("cart.noteLabel")}</span> {line.notes}
                        </p>
                      ) : null}
                      <div className="cart-line-controls">
                        <div className="cart-qty" aria-label={t("cart.qtyAria")}>
                          <button
                            type="button"
                            className="cart-qty-button"
                            onClick={() => onUpdateQuantity(line.id, line.quantity - 1)}
                            aria-label={t("cart.decAria")}
                          >
                            −
                          </button>
                          <span className="cart-qty-value">{line.quantity}</span>
                          <button
                            type="button"
                            className="cart-qty-button"
                            onClick={() => onUpdateQuantity(line.id, line.quantity + 1)}
                            aria-label={t("cart.incAria")}
                            disabled={totalItems >= MAX_ORDER_QUANTITY}
                          >
                            +
                          </button>
                        </div>
                        <button type="button" className="cart-remove" onClick={() => onRemoveLine(line.id)}>
                          {t("cart.remove")}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <aside className="cart-summary-panel" aria-labelledby="cart-summary-title">
            <h2 id="cart-summary-title">{t("cart.summaryTitle")}</h2>
            <dl className="cart-summary-rows">
              <div className="cart-summary-row">
                <dt>{t("cart.items")}</dt>
                <dd>{totalItems}</dd>
              </div>
              <div className="cart-summary-row cart-summary-total">
                <dt>{t("cart.total")}</dt>
                <dd>{formatPrice(subtotal)}</dd>
              </div>
            </dl>
            <p className="cart-demo-note">{t("cart.demoNote")}</p>
            <button type="button" className="primary-cta cart-checkout-btn" onClick={handleCheckout}>
              {t("cart.checkout")}
            </button>
            <p className="cart-checkout-hint">{t("cart.checkoutHint")}</p>
          </aside>
        </div>
      )}
    </section>
  );
}
