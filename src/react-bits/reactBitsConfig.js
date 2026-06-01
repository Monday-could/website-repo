/**
 * Global toggle for React Bits–style UI effects (separate from GSAP page motion; can be disabled alone).
 *
 * Disable (pick one):
 * 1) Browser console, then refresh:
 *    localStorage.setItem("vite-react-bits", "0")
 * 2) Build-time env in `.env`:
 *    VITE_REACT_BITS=0
 * Re-enable: localStorage.removeItem("vite-react-bits") and do not set VITE_REACT_BITS=0
 */
const LS_KEY = "vite-react-bits";

export function readReactBitsEnabledFromStorage() {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(LS_KEY);
    if (v === "0" || v === "false") return false;
    if (v === "1" || v === "true") return true;
  } catch {
    /* ignore */
  }
  return true;
}

export function isReactBitsBuildDisabled() {
  const raw = import.meta.env?.VITE_REACT_BITS;
  return raw === "0" || raw === "false";
}

/** Runtime user toggle: localStorage overrides default; build flag VITE_REACT_BITS=0 forces off */
export function areReactBitsEffectsEnabled() {
  if (isReactBitsBuildDisabled()) return false;
  return readReactBitsEnabledFromStorage();
}
