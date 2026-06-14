import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useI18n } from "../../i18n/I18nContext.jsx";
import {
  formatManualBadgesInput,
  getAllBadgesForItem,
  migrateLegacyBadgeString,
  parseOwnerCustomBadgesInput,
} from "../menuModelAndBadges.js";
import { OwnerImageUploadModal } from "./OwnerImageUploadModal.jsx";

export function OwnerEditDishPage() {
  const { t } = useI18n();
  const { menu, orders, onUpdateMenuItem } = useOutletContext();
  const { itemId } = useParams();
  const navigate = useNavigate();
  const item = useMemo(() => menu.find((m) => m.id === itemId), [menu, itemId]);

  const [imageSource, setImageSource] = useState("url");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!item) {
      navigate("/owner/edit", { replace: true });
      return;
    }
    const manual = Array.isArray(item.manualBadges)
      ? item.manualBadges
      : typeof item.badge === "string"
        ? migrateLegacyBadgeString(item.badge)
        : [];
    setForm({
      name: item.name,
      price: String(item.price),
      category: item.category,
      customBadges: formatManualBadgesInput(manual),
      description: item.description,
      image: item.image,
    });
    setImageSource(item.image?.startsWith("data:") ? "upload" : "url");
  }, [item, itemId, navigate]);

  function updateField(field, value) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
  }

  function setImageSourceMode(mode) {
    setImageSource(mode);
    if (mode === "url") {
      setForm((current) =>
        current
          ? {
              ...current,
              image: current.image.startsWith("data:") ? "" : current.image,
            }
          : current,
      );
    }
  }

  function submitUpdate(event) {
    event.preventDefault();
    if (!item || !form) return;
    if (!form.name.trim() || !form.description.trim() || !form.price) return;
    onUpdateMenuItem(item.id, {
      name: form.name.trim(),
      price: Number(form.price),
      category: form.category.trim() || "Specials",
      manualBadges: parseOwnerCustomBadgesInput(form.customBadges),
      description: form.description.trim(),
      image: form.image.trim() || "/assets/diner-burger.png",
    });
    navigate("/owner/edit");
  }

  const liveBadgePreview = useMemo(() => {
    if (!item || !form) return [];
    const merged = {
      ...item,
      name: form.name.trim() || item.name,
      price: form.price !== "" && form.price != null ? Number(form.price) : item.price,
      category: form.category.trim() || item.category,
      description: form.description.trim() || item.description,
      image: form.image.trim() || item.image || "/assets/diner-burger.png",
      manualBadges: parseOwnerCustomBadgesInput(form.customBadges),
    };
    return getAllBadgesForItem(merged, { orders, menu });
  }, [item, form, orders, menu]);

  if (!item || !form) {
    return (
      <div className="owner-edit-hub">
        <p className="empty-state">{t("ownerEdit.loading")}</p>
      </div>
    );
  }

  return (
    <div className="owner-edit-dish">
      <div className="owner-edit-dish-header">
        <button type="button" className="secondary-cta small" onClick={() => navigate("/owner/edit")}>
          {t("ownerEdit.backList")}
        </button>
        <h3>{t("ownerEdit.editDishTitle")}</h3>
      </div>

      <form className="owner-form owner-edit-dish-form" onSubmit={submitUpdate}>
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
          <span className="owner-field-hint">{t("ownerEdit.customBadgesEditHint")}</span>
        </label>
        <p className="owner-live-badges-preview" aria-live="polite">
          <strong>{t("ownerEdit.liveBadges")}</strong> {liveBadgePreview.length ? liveBadgePreview.join(" · ") : "—"}
        </p>

        <fieldset className="owner-image-fieldset full-row">
          <legend>{t("ownerEdit.legendImage")}</legend>
          <div className="owner-image-source-options" role="radiogroup" aria-label={t("ownerEdit.imageRadiogroupAria")}>
            <label className="owner-image-radio">
              <input
                type="radio"
                name="owner-edit-image-source"
                checked={imageSource === "url"}
                onChange={() => setImageSourceMode("url")}
              />
              <span>{t("ownerAdd.imageUrl")}</span>
            </label>
            <label className="owner-image-radio">
              <input
                type="radio"
                name="owner-edit-image-source"
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
                      {t("ownerEdit.changeImageBtn")}
                    </button>
                    <button type="button" className="owner-image-clear" onClick={() => updateField("image", "")}>
                      {t("ownerEdit.clearImage")}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="owner-image-upload-empty">{t("ownerEdit.noImageSelected")}</p>
                  <button type="button" className="primary-cta small owner-upload-open-btn" onClick={() => setUploadModalOpen(true)}>
                    {t("ownerEdit.uploadImageBtn")}
                  </button>
                </>
              )}
              <p className="owner-image-upload-hint">{t("ownerEdit.uploadHint")}</p>
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
        <div className="owner-edit-dish-actions full-row">
          <button className="primary-cta" type="submit">
            {t("ownerEdit.save")}
          </button>
          <button type="button" className="secondary-cta" onClick={() => navigate("/owner/edit")}>
            {t("ownerEdit.cancel")}
          </button>
        </div>
      </form>

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
