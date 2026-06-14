import { useEffect, useId, useMemo } from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { uniqSortedCategoryValues } from "../menuModelAndBadges.js";

export function MenuFiltersBar({ menuItems, category, badge, onCategory, onBadge, badgeOptions }) {
  const { t } = useI18n();
  const catSelectId = useId();
  const badgeSelectId = useId();
  const categoryOptions = useMemo(() => uniqSortedCategoryValues(menuItems), [menuItems]);
  const badgeOptionsSafe = Array.isArray(badgeOptions) ? badgeOptions : [];

  useEffect(() => {
    if (category !== "all" && !categoryOptions.includes(category)) onCategory("all");
  }, [category, categoryOptions, onCategory]);

  useEffect(() => {
    if (badge !== "all" && !badgeOptionsSafe.includes(badge)) onBadge("all");
  }, [badge, badgeOptionsSafe, onBadge]);

  const showClear = category !== "all" || badge !== "all";

  return (
    <div className="menu-filters-bar">
      <div className="menu-filters-fields">
        <label htmlFor={catSelectId}>
          {t("menuFilters.category")}
          <select id={catSelectId} value={category} onChange={(event) => onCategory(event.target.value)}>
            <option value="all">{t("menuFilters.allCategories")}</option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={badgeSelectId}>
          {t("menuFilters.badge")}
          <select id={badgeSelectId} value={badge} onChange={(event) => onBadge(event.target.value)}>
            <option value="all">{t("menuFilters.allBadges")}</option>
            {badgeOptionsSafe.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
      </div>
      {showClear ? (
        <button
          type="button"
          className="secondary-cta small menu-filters-clear"
          onClick={() => {
            onCategory("all");
            onBadge("all");
          }}
        >
          {t("menuFilters.clear")}
        </button>
      ) : null}
    </div>
  );
}
