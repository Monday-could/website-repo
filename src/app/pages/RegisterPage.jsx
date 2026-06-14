import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { registerCustomer } from "../../services/authService.js";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { sanitizeReturnToParam } from "../routeHelpers.js";

export function RegisterPage({ onLoginSuccess }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = sanitizeReturnToParam(searchParams.get("returnTo"));
  const loginHref = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(t("auth.error.REG_PASSWORD_MISMATCH"));
      return;
    }
    setLoading(true);
    try {
      const session = await registerCustomer({ username, password });
      onLoginSuccess(session);
      navigate(returnTo || "/menu", { replace: true });
    } catch (err) {
      const code = err?.code;
      setError(code ? t(`auth.error.${code}`) : t("auth.error.REGISTER_FAILED"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="content-section page-section auth-page" aria-labelledby="register-title">
      <div className="section-heading">
        <p className="eyebrow">{t("auth.register.eyebrow")}</p>
        <h2 id="register-title">{t("auth.register.title")}</h2>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <label className="auth-label">
          {t("auth.login.username")}
          <input
            className="auth-input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="auth-label">
          {t("auth.login.password")}
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="auth-label">
          {t("auth.register.password2")}
          <input
            className="auth-input"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        </label>
        <button className="primary-cta" type="submit" disabled={loading}>
          {loading ? t("auth.login.loading") : t("auth.register.submit")}
        </button>
      </form>
      <p className="auth-secondary-actions">
        <Link to={loginHref}>{t("auth.register.linkLogin")}</Link>
        {" · "}
        <Link to="/menu">{t("auth.login.linkGuest")}</Link>
      </p>
    </section>
  );
}
