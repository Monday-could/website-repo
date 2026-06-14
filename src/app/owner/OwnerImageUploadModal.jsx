import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { MAX_OWNER_IMAGE_BYTES } from "../appConstants.js";
import { Icon } from "../ui/Icon.jsx";

export function OwnerImageUploadModal({ open, onClose, onApply }) {
  const { t } = useI18n();
  const fileInputRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(null);
    setError(null);
    setDragOver(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  function processFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("ownerUpload.notImage"));
      setDraft(null);
      return;
    }
    if (file.size > MAX_OWNER_IMAGE_BYTES) {
      setError(t("ownerUpload.tooLarge", { mb: Math.round(MAX_OWNER_IMAGE_BYTES / 1024 / 1024) }));
      setDraft(null);
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setDraft(reader.result);
    };
    reader.onerror = () => {
      setError(t("ownerUpload.readError"));
      setDraft(null);
    };
    reader.readAsDataURL(file);
  }

  if (!open) return null;

  return (
    <div className="order-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="order-modal owner-upload-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="owner-upload-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="order-modal-header">
          <h2 id="owner-upload-title">{t("ownerUpload.title")}</h2>
          <button type="button" className="icon-button" aria-label={t("ownerUpload.close")} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <p className="owner-upload-intro">{t("ownerUpload.intro")}</p>

        <input
          ref={fileInputRef}
          type="file"
          className="owner-file-input-hidden"
          accept="image/*"
          aria-label={t("ownerUpload.chooseFile")}
          onChange={(event) => {
            processFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />

        <button
          type="button"
          className={`owner-upload-dropzone${dragOver ? " owner-upload-dropzone-active" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragOver(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files?.[0];
            processFile(file);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="owner-upload-dropzone-title">{t("ownerUpload.dropTitle")}</span>
          <span className="owner-upload-dropzone-sub">{t("ownerUpload.dropSub")}</span>
        </button>

        {error ? (
          <p className="owner-upload-error" role="alert">
            {error}
          </p>
        ) : null}

        {draft ? (
          <div className="owner-upload-preview-wrap">
            <p className="owner-upload-preview-label">{t("ownerUpload.preview")}</p>
            <img src={draft} alt="" className="owner-upload-preview" />
          </div>
        ) : null}

        <div className="order-modal-actions">
          <button type="button" className="secondary-cta" onClick={onClose}>
            {t("ownerUpload.cancel")}
          </button>
          <button
            className="primary-cta"
            type="button"
            disabled={!draft}
            onClick={() => {
              if (draft) onApply(draft);
              onClose();
            }}
          >
            {t("ownerUpload.useImage")}
          </button>
        </div>
      </div>
    </div>
  );
}
