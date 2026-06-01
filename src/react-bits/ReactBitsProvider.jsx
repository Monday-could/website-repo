import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { isReactBitsBuildDisabled, readReactBitsEnabledFromStorage } from "./reactBitsConfig.js";

const ReactBitsContext = createContext(
  /** @type {{ enabled: boolean; ambient: boolean; heroGradient: boolean; foodSpotlight: boolean; magnet: boolean; clickSpark: boolean }} */ ({
    enabled: false,
    ambient: false,
    heroGradient: false,
    foodSpotlight: false,
    magnet: false,
    clickSpark: false,
  }),
);

export function ReactBitsProvider({ reducedMotion, children }) {
  const [storageOn, setStorageOn] = useState(readReactBitsEnabledFromStorage);
  const [pointerFine, setPointerFine] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    function u() {
      setPointerFine(mq.matches);
    }
    u();
    mq.addEventListener("change", u);
    return () => mq.removeEventListener("change", u);
  }, []);

  useEffect(() => {
    function onStorage(e) {
      if (e.key === "vite-react-bits" || e.key === null) setStorageOn(readReactBitsEnabledFromStorage());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo(() => {
    if (isReactBitsBuildDisabled() || reducedMotion || !storageOn) {
      return {
        enabled: false,
        ambient: false,
        heroGradient: false,
        foodSpotlight: false,
        magnet: false,
        clickSpark: false,
      };
    }
    return {
      enabled: true,
      ambient: true,
      heroGradient: true,
      foodSpotlight: true,
      magnet: pointerFine,
      clickSpark: true,
    };
  }, [reducedMotion, storageOn, pointerFine]);

  return <ReactBitsContext.Provider value={value}>{children}</ReactBitsContext.Provider>;
}

export function useReactBits() {
  return useContext(ReactBitsContext);
}
