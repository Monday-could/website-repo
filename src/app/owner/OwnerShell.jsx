import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { OWNER_STAGED_SESSION_KEY } from "../appConstants.js";
import { loadOwnerStagedSession } from "../ownerStagedPreviewStorage.js";

export function OwnerShell({ menu, orders, onAddMenuItem, onAddMenuItemsBatch, onUpdateMenuItem, onDeleteMenuItem, onToggleMenuItemAvailable }) {
  const { t } = useI18n();
  const [stagedDishes, setStagedDishes] = useState(loadOwnerStagedSession);

  useEffect(() => {
    try {
      if (!stagedDishes.length) {
        window.sessionStorage.removeItem(OWNER_STAGED_SESSION_KEY);
      } else {
        window.sessionStorage.setItem(OWNER_STAGED_SESSION_KEY, JSON.stringify(stagedDishes));
      }
    } catch {
      /* ignore quota / privacy mode */
    }
  }, [stagedDishes]);

  function addStagedDish(dish) {
    setStagedDishes((current) => [...current, dish]);
  }

  function removeStagedDish(id) {
    setStagedDishes((current) => current.filter((d) => d.id !== id));
  }

  function clearStagedDishes() {
    setStagedDishes([]);
  }

  return (
    <section className="content-section page-section owner-area">
      <div className="section-heading">
        <p className="eyebrow">{t("ownerShell.eyebrow")}</p>
        <h2 id="owner-title">{t("ownerShell.title")}</h2>
        <p>{t("ownerShell.body")}</p>
      </div>
      <Outlet
        context={{
          menu,
          orders,
          onAddMenuItem,
          onAddMenuItemsBatch,
          onUpdateMenuItem,
          onDeleteMenuItem,
          onToggleMenuItemAvailable,
          stagedDishes,
          addStagedDish,
          removeStagedDish,
          clearStagedDishes,
        }}
      />
    </section>
  );
}
