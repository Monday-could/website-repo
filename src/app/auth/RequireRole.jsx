import { Navigate } from "react-router-dom";

export function RequireRole({ session, role, children }) {
  if (!session || session.role !== role) {
    return <Navigate to={`/login?role=${role}`} replace />;
  }
  return children;
}
