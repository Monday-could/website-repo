import { useNavigate, useOutletContext } from "react-router-dom";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { formatPrice } from "../formatters.js";
import { getAllBadgesForItem } from "../menuModelAndBadges.js";
import { Icon } from "../ui/Icon.jsx";

export function OwnerEditMenuPage() {
  const { t } = useI18n();
  const { menu, orders, onDeleteMenuItem, onToggleMenuItemAvailable } = useOutletContext();
  const navigate = useNavigate();

  async function confirmDelete(item) {
    if (!window.confirm(t("ownerEdit.confirmDelete", { name: item.name }))) return;
    await onDeleteMenuItem(item.id);
  }

  return (
    <div className="owner-edit-hub">
      <div className="section-heading compact">
        <p className="eyebrow">{t("ownerEdit.eyebrow")}</p>
        <h3>{t("ownerEdit.allDishes")}</h3>
        <p>{t("ownerEdit.intro")}</p>
      </div>

      <ul className="owner-edit-list">
        {menu.length === 0 ? (
          <li className="empty-state">{t("ownerEdit.emptyList")}</li>
        ) : (
          menu.map((item) => (
            <li key={item.id} className={`owner-edit-row${item.available === false ? " owner-edit-row-hidden" : ""}`}>
              <div className="owner-edit-row-main">
                <img src={item.image} alt="" className="owner-edit-row-img" />
                <div>
                  <strong>{item.name}</strong>
                  <p>
                    {item.category} · {formatPrice(item.price)} · {getAllBadgesForItem(item, { orders, menu }).join(" · ") || "—"}
                  </p>
                  {item.available === false ? <span className="owner-hidden-pill">{t("ownerEdit.hiddenPill")}</span> : null}
                </div>
              </div>
              <div className="owner-edit-row-actions">
                <button type="button" className="secondary-cta small" onClick={() => navigate(`/owner/edit/${item.id}`)}>
                  {t("ownerEdit.editDetails")}
                </button>
                <button type="button" className="secondary-cta small" onClick={() => onToggleMenuItemAvailable(item.id)}>
                  {item.available === false ? t("ownerEdit.showMenu") : t("ownerEdit.hideMenu")}
                </button>
                <button type="button" className="decline-button small" onClick={() => confirmDelete(item)}>
                  <Icon name="x" />
                  {t("ownerEdit.delete")}
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
