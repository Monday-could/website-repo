import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { login as authLogin } from "../../services/authService.js";
import { useI18n } from "../../i18n/I18nContext.jsx";
import { sanitizeReturnToParam } from "../routeHelpers.js";

export function LoginPage({ onLoginSuccess }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = sanitizeReturnToParam(searchParams.get("returnTo"));
  const profileNotice = searchParams.get("notice") === "profile";
  const roleParam = searchParams.get("role");
  const isStaffOrOwnerLogin = roleParam === "staff" || roleParam === "owner";
  const demoHintKey =
    roleParam === "staff"
      ? "auth.login.demoHintStaff"
      : roleParam === "owner"
        ? "auth.login.demoHintOwner"
        : "auth.login.demoHintGuest";
  const registerHref = returnTo ? `/register?returnTo=${encodeURIComponent(returnTo)}` : "/register";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = await authLogin({ username, password });
      onLoginSuccess(session);
      if (session.role === "staff") navigate("/orders", { replace: true });
      else if (session.role === "owner") navigate("/owner", { replace: true });
      else if (returnTo) navigate(returnTo, { replace: true });
      else navigate("/menu", { replace: true });
    } catch (err) {
      const code = err?.code;
      setError(code ? t(`auth.error.${code}`) : t("auth.error.LOGIN_FAILED"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="content-section page-section auth-page" aria-labelledby="login-title">
      <div className="section-heading">
        <p className="eyebrow">{t("auth.login.eyebrow")}</p>
        <h2 id="login-title">{t("auth.login.title")}</h2>
        {profileNotice ? (
          <p className="auth-hint" role="status">
            {t("auth.login.noticeProfile")}
          </p>
        ) : null}
        <p className="auth-hint auth-demo-hint" role="status">
          {t(demoHintKey)}
        </p>
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
            autoComplete="current-password"
          />
        </label>
        <button className="primary-cta" type="submit" disabled={loading}>
          {loading ? t("auth.login.loading") : t("auth.login.submit")}
        </button>
      </form>
      {isStaffOrOwnerLogin ? (
        <p className="auth-hint auth-login-staff-owner-footer">
          {t("auth.login.staffOwnerFooterHint")}{" "}
          <Link to="/menu" className="auth-footer-link">
            {t("auth.login.linkGuest")}
          </Link>
        </p>
      ) : (
        <p className="auth-secondary-actions">
          <Link to={registerHref}>{t("auth.login.linkRegister")}</Link>
          {" · "}
          <Link to="/menu">{t("auth.login.linkGuest")}</Link>
        </p>
      )}
    </section>
  );
}
