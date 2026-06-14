import { NavLink } from "react-router-dom";

export function MobileLink({ to, onDone, children }) {
  return (
    <NavLink className="drawer-link" to={to} onClick={onDone}>
      {children}
    </NavLink>
  );
}
