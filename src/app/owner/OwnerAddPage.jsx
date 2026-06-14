import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { formatPrice } from "../formatters.js";
import {
  migrateLegacyBadgeString,
  parseOwnerCustomBadgesInput,
  sanitizeManualBadges,
} from "../menuModelAndBadges.js";
import { Icon } from "../ui/Icon.jsx";
import { OwnerImageUploadModal } from "./OwnerImageUploadModal.jsx";

export function OwnerAddPage() {
  const { t } = useI18n();
  const { onAddMenuItemsBatch, stagedDishes, addStagedDish, removeStagedDish, clearStagedDishes } = useOutletContext();
  const [imageSource, setImageSource] = useState("url");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    price: "",
    category: "Specials",
    customBadges: "",
    description: "",
    image: "",
  });

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function setImageSourceMode(mode) {
    setImageSource(mode);
    if (mode === "url") {
      setForm((current) => ({
        ...current,
        image: current.image.startsWith("data:") ? "" : current.image,
      }));
    }
  }

  function addToPreview(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.description.trim() || !form.price) return;
    const manualBadges = parseOwnerCustomBadgesInput(form.customBadges);
    const payload = {
      id: `preview-${Date.now()}`,
      name: form.name.trim(),
      price: Number(form.price),
      category: form.category.trim() || "Specials",
      manualBadges,
      description: form.description.trim(),
      image: form.image.trim(),
    };
    addStagedDish(payload);
    setForm({
      name: "",
      price: "",
      category: "Specials",
      customBadges: "",
      description: "",
      image: "",
    });
    setImageSource("url");
  }

  function removeStaged(id) {
    removeStagedDish(id);
  }

  function submitStagedToMenu() {
    if (!stagedDishes.length) return;
    const payloads = stagedDishes.map((dish) => {
      const { id: _id, badge: _legacyBadge, ...rest } = dish;
      const manualFromArray = Array.isArray(rest.manualBadges)
        ? sanitizeManualBadges(rest.manualBadges)
        : typeof _legacyBadge === "string"
          ? migrateLegacyBadgeString(_legacyBadge)
          : [];
      return {
        name: rest.name,
        price: rest.price,
        category: rest.category,
        description: rest.description,
        image: rest.image,
        manualBadges: manualFromArray,
      };
    });
    onAddMenuItemsBatch(payloads);
    clearStagedDishes();
  }

  function previewCustomBadgesLine(dish) {
    const m = Array.isArray(dish.manualBadges)
      ? sanitizeManualBadges(dish.manualBadges)
      : typeof dish.badge === "string"
        ? migrateLegacyBadgeString(dish.badge)
        : [];
    return m.length ? m.join(" · ") : t("ownerAdd.noCustomBadges");
  }

  return (
    <div className="owner-add-workspace">
      <div className="owner-add-form-column">
        <form className="owner-form owner-add-form" onSubmit={addToPreview}>
          <label>
            {t("ownerAdd.dishName")}
            <input
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              placeholder="Midnight Melt"
              required
            />
          </label>
          <label>
            {t("ownerAdd.price")}
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(event) => updateField("price", event.target.value)}
              placeholder="11.99"
              required
            />
          </label>
          <label>
            {t("ownerAdd.category")}
            <input
              value={form.category}
              onChange={(event) => updateField("category", event.target.value)}
              placeholder="Specials"
            />
          </label>
          <label className="full-row">
            {t("ownerAdd.customBadges")}
            <input
              value={form.customBadges}
              onChange={(event) => updateField("customBadges", event.target.value)}
              placeholder="e.g. Chef's pick, Spicy (comma-separated)"
            />
            <span className="owner-field-hint">{t("ownerAdd.customBadgesHint")}</span>
          </label>

          <fieldset className="owner-image-fieldset full-row">
            <legend>{t("ownerAdd.dishImage")}</legend>
            <div className="owner-image-source-options" role="radiogroup" aria-label={t("ownerAdd.imageSourceAria")}>
              <label className="owner-image-radio">
                <input
                  type="radio"
                  name="owner-add-image-source"
                  checked={imageSource === "url"}
                  onChange={() => setImageSourceMode("url")}
                />
                <span>{t("ownerAdd.imageUrl")}</span>
              </label>
              <label className="owner-image-radio">
                <input
                  type="radio"
                  name="owner-add-image-source"
                  checked={imageSource === "upload"}
                  onChange={() => setImageSourceMode("upload")}
                />
                <span>{t("ownerAdd.uploadImage")}</span>
              </label>
            </div>

            {imageSource === "url" ? (
              <label className="owner-image-url-label">
                {t("ownerAdd.link")}
                <input
                  value={form.image.startsWith("data:") ? "" : form.image}
                  onChange={(event) => updateField("image", event.target.value)}
                  placeholder="https://… or /assets/diner-burger.png"
                />
              </label>
            ) : (
              <div className="owner-image-upload-block">
                {form.image ? (
                  <div className="owner-image-upload-preview-row">
                    <img src={form.image} alt="" className="owner-image-thumb" />
                    <div className="owner-image-upload-actions">
                      <button type="button" className="primary-cta small" onClick={() => setUploadModalOpen(true)}>
                        {t("ownerAdd.changeImage")}
                      </button>
                      <button type="button" className="owner-image-clear" onClick={() => updateField("image", "")}>
                        {t("ownerAdd.clear")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="owner-image-upload-empty">{t("ownerAdd.noImageYet")}</p>
                    <button type="button" className="primary-cta small owner-upload-open-btn" onClick={() => setUploadModalOpen(true)}>
                      {t("ownerAdd.uploadOpen")}
                    </button>
                  </>
                )}
                <p className="owner-image-upload-hint">{t("ownerAdd.uploadHintBlock")}</p>
              </div>
            )}
          </fieldset>

          <label className="full-row">
            {t("ownerAdd.description")}
            <textarea
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              placeholder="Short appetite-driven dish description"
              rows="4"
              required
            />
          </label>
          <button className="primary-cta full-row" type="submit">
            <Icon name="plus" />
            {t("ownerAdd.addPreview")}
          </button>
        </form>
      </div>

      <aside className="owner-add-preview-column" aria-labelledby="owner-preview-title">
        <div className="owner-add-preview-head">
          <h3 id="owner-preview-title">{t("ownerAdd.previewTitle")}</h3>
          <p className="owner-add-preview-sub">{t("ownerAdd.previewSub")}</p>
        </div>

        {stagedDishes.length === 0 ? (
          <p className="owner-add-preview-empty">{t("ownerAdd.previewEmpty")}</p>
        ) : (
          <ul className="owner-add-preview-list">
            {stagedDishes.map((dish) => (
              <li key={dish.id} className="owner-add-preview-card">
                <img src={dish.image || "/assets/diner-burger.png"} alt="" className="owner-add-preview-img" />
                <div className="owner-add-preview-body">
                  <strong>{dish.name}</strong>
                  <p className="owner-add-preview-meta">
                    {dish.category} · {formatPrice(dish.price)} · {previewCustomBadgesLine(dish)}
                  </p>
                  <p className="owner-add-preview-desc">{dish.description}</p>
                </div>
                <button type="button" className="owner-add-preview-remove" onClick={() => removeStaged(dish.id)} aria-label={t("ownerAdd.removePreviewAria", { name: dish.name })}>
                  <Icon name="x" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="owner-add-preview-footer">
          <button
            type="button"
            className="primary-cta owner-add-preview-submit"
            disabled={!stagedDishes.length}
            onClick={submitStagedToMenu}
          >
            {t("ownerAdd.submitMenu")}
          </button>
          <p className="owner-add-preview-footnote">{t("ownerAdd.queued", { count: stagedDishes.length })}</p>
        </div>
      </aside>

      <OwnerImageUploadModal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onApply={(dataUrl) => {
          setImageSource("upload");
          updateField("image", dataUrl);
        }}
      />
    </div>
  );
}
