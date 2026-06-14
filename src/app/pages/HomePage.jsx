import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ClickSpark from "../../react-bits/ClickSpark.jsx";
import GradientHeroTitle from "../../react-bits/GradientHeroTitle.jsx";
import Magnet from "../../react-bits/Magnet.jsx";
import { useReactBits } from "../../react-bits/ReactBitsProvider.jsx";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { runHomeHeroMotion, runHomePopularMotion } from "../../lib/uiMotion.js";
import { usePrefersReducedMotion } from "../../lib/usePrefersReducedMotion.js";
import { POPULAR_SALES_TOP_N } from "../appConstants.js";
import { sortVisibleMenuBySalesThenPopularity } from "../menuModelAndBadges.js";
import { MenuCard } from "../menu/MenuCard.jsx";

function HomePopularCarousel({ items, onOrder, orders, menuForBadges }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const count = items.length;

  useEffect(() => {
    setIndex((i) => (count ? Math.min(i, count - 1) : 0));
  }, [count]);

  function goPrev() {
    setIndex((i) => (count ? (i - 1 + count) % count : 0));
  }

  function goNext() {
    setIndex((i) => (count ? (i + 1) % count : 0));
  }

  if (!count) {
    return (
      <div className="empty-state empty-state--soft home-carousel-empty" role="status">
        <p className="empty-state-title">{t("home.carouselEmptyTitle")}</p>
        <p className="empty-state-hint">{t("home.carouselEmptyHint")}</p>
        <Link className="secondary-cta" to="/menu">
          {t("home.viewFullMenu")}
        </Link>
      </div>
    );
  }

  return (
    <div className="home-carousel" aria-roledescription="carousel" aria-label={t("home.carouselAria")}>
      <div className="home-carousel-controls">
        <button type="button" className="home-carousel-arrow" aria-label={t("home.prevDish")} onClick={goPrev}>
          <span aria-hidden="true">‹</span>
        </button>
        <div className="home-carousel-viewport">
          <div className="home-carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
            {items.map((item) => (
              <div key={item.id} className="home-carousel-slide">
                <MenuCard item={item} onOrder={onOrder} orders={orders} menuForBadges={menuForBadges} />
              </div>
            ))}
          </div>
        </div>
        <button type="button" className="home-carousel-arrow" aria-label={t("home.nextDish")} onClick={goNext}>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <div className="home-carousel-dots" role="tablist" aria-label={t("home.carouselAria")}>
        {items.map((_, i) => (
          <button
            key={items[i].id}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={t("home.slideShow", { i: i + 1, count })}
            className={`home-carousel-dot${i === index ? " active" : ""}`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}

export function HomePage({ menu, orders, onOrder }) {
  const { t } = useI18n();
  const rb = useReactBits();
  const heroRef = useRef(null);
  const popularRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const visibleMenu = useMemo(() => menu.filter((item) => item.available !== false), [menu]);
  const popularItems = useMemo(
    () => sortVisibleMenuBySalesThenPopularity(visibleMenu, orders).slice(0, POPULAR_SALES_TOP_N),
    [visibleMenu, orders],
  );

  useLayoutEffect(() => {
    if (reducedMotion) return;
    const ctx = runHomeHeroMotion(heroRef.current, { reducedMotion });
    return () => ctx?.revert();
  }, [reducedMotion]);

  useLayoutEffect(() => {
    if (reducedMotion) return;
    const ctx = runHomePopularMotion(popularRef.current, { reducedMotion });
    return () => ctx?.revert();
  }, [reducedMotion, popularItems.length]);

  return (
    <div className="home-reveal">
      <section ref={heroRef} className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">{t("home.heroEyebrow")}</p>
          <h1 id="hero-title">
            {rb.heroGradient ? <GradientHeroTitle>{t("home.heroTitle")}</GradientHeroTitle> : t("home.heroTitle")}
          </h1>
          <p>{t("home.heroBody")}</p>
          <div className="hero-actions">
            {rb.enabled ? (
              <ClickSpark disabled={!rb.clickSpark} sparkColor="rgba(255, 255, 255, 0.85)" sparkCount={6} duration={300}>
                <Magnet disabled={!rb.magnet} magnetStrength={7} padding={48}>
                  <Link className="primary-cta" to="/menu">
                    {t("home.startOrder")}
                  </Link>
                </Magnet>
              </ClickSpark>
            ) : (
              <Link className="primary-cta" to="/menu">
                {t("home.startOrder")}
              </Link>
            )}
            <Link className="secondary-cta" to="/location">
              {t("home.findLocation")}
            </Link>
          </div>
        </div>
        <div className="hero-food" aria-label={t("home.heroFoodAria")}>
          <img src="/assets/pancake-breakfast.png" alt="" />
          <img src="/assets/diner-burger.png" alt="" />
        </div>
      </section>

      <section ref={popularRef} className="content-section home-reveal-content" aria-labelledby="popular-title">
        <div className="section-heading">
          <p className="eyebrow">{t("home.popularEyebrow")}</p>
          <h2 id="popular-title">{t("home.popularTitle")}</h2>
          <p>{t("home.popularBody")}</p>
        </div>
        <HomePopularCarousel items={popularItems} onOrder={onOrder} orders={orders} menuForBadges={visibleMenu} />
      </section>
    </div>
  );
}
