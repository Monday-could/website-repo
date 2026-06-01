/**
 * SpotlightCard — adapted from DavidHDev/react-bits (MIT) `src/ts-default/Components/SpotlightCard`.
 * Supports `as` to render a semantic host (e.g. article.food-card).
 */
import { useRef } from "react";
import "./SpotlightCard.css";

export default function SpotlightCard({
  as: Comp = "div",
  children,
  className = "",
  spotlightColor = "rgba(255, 255, 255, 0.22)",
  active = true,
  ...rest
}) {
  const divRef = useRef(null);

  function handleMouseMove(e) {
    const el = divRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty("--rb-mouse-x", `${x}px`);
    el.style.setProperty("--rb-mouse-y", `${y}px`);
    el.style.setProperty("--rb-spotlight-color", spotlightColor);
  }

  if (!active) {
    return (
      <Comp ref={divRef} className={String(className ?? "").trim() || undefined} {...rest}>
        {children}
      </Comp>
    );
  }

  return (
    <Comp
      ref={divRef}
      className={`rb-spotlight ${className}`.trim()}
      onMouseMove={handleMouseMove}
      {...rest}
    >
      {children}
    </Comp>
  );
}
