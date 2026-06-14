import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { runFoodCardStagger } from "../../lib/uiMotion.js";
import { usePrefersReducedMotion } from "../../lib/usePrefersReducedMotion.js";
import { collectBadgeFilterOptions, filterMenuByCategoryAndBadge } from "../menuModelAndBadges.js";
import { MenuCard } from "../menu/MenuCard.jsx";
import { MenuFiltersBar } from "../menu/MenuFiltersBar.jsx";

export function MenuPage({ menu, orders, session, onOrder, onReview }) {
  const { t } = useI18n();
  const menuGridRef = useRef(null);
  const reducedMotion = usePrefersReducedMotion();
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterBadge, setFilterBadge] = useState("all");
  const [openReviewItemId, setOpenReviewItemId] = useState(null);
  const visibleMenu = useMemo(() => menu.filter((item) => item.available !== false), [menu]);
  const badgeCtx = useMemo(() => ({ orders, menu: visibleMenu }), [orders, visibleMenu]);
  const badgeFilterOptions = useMemo(() => collectBadgeFilterOptions(visibleMenu, orders), [visibleMenu, orders]);
  const filteredMenu = useMemo(
    () => filterMenuByCategoryAndBadge(visibleMenu, filterCategory, filterBadge, badgeCtx),
    [visibleMenu, filterCategory, filterBadge, badgeCtx],
  );
  const filteredMenuKey = useMemo(() => filteredMenu.map((item) => item.id).join(","), [filteredMenu]);

  useLayoutEffect(() => {
    if (reducedMotion || !filteredMenu.length) return;
    const ctx = runFoodCardStagger(menuGridRef.current, { reducedMotion });
    return () => ctx?.revert();
  }, [filteredMenuKey, reducedMotion, filteredMenu.length]);

  useEffect(() => {
    setOpenReviewItemId((prev) => {
      if (prev === null) return null;
      return filteredMenu.some((item) => item.id === prev) ? prev : null;
    });
  }, [filteredMenu]);

  function handleReviewPanelToggle(itemId) {
    setOpenReviewItemId((prev) => {
      if (itemId === null) return null;
      return prev === itemId ? null : itemId;
    });
  }

  return (
    <section className="content-section page-section menu-page" aria-labelledby="menu-title">
      <div className="section-heading">
        <p className="eyebrow">{t("menuPage.eyebrow")}</p>
        <h2 id="menu-title">{t("menuPage.title")}</h2>
        <p>{t("menuPage.body")}</p>
      </div>

      <MenuFiltersBar
        menuItems={visibleMenu}
        category={filterCategory}
        badge={filterBadge}
        onCategory={setFilterCategory}
        onBadge={setFilterBadge}
        badgeOptions={badgeFilterOptions}
      />

      {filteredMenu.length ? (
        <div className="menu-grid" ref={menuGridRef}>
          {filteredMenu.map((item) => (
            <MenuCard
              key={item.id}
              item={item}
              onOrder={onOrder}
              onReview={onReview}
              session={session}
              orders={orders}
              menuForBadges={visibleMenu}
              reviewOpen={openReviewItemId === item.id}
              onReviewPanelToggle={handleReviewPanelToggle}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state empty-state--soft menu-filter-empty" role="status">
          <p className="empty-state-title">{t("menuPage.emptyFilterTitle")}</p>
          <p className="empty-state-hint">{t("menuPage.emptyFilterHint")}</p>
        </div>
      )}
    </section>
  );
}
