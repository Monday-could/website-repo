/**
 * Magnet — adapted from DavidHDev/react-bits (MIT) `src/content/Animations/Magnet/Magnet.jsx`.
 * Formatting and defaults only; behavior matches the upstream component.
 */
import { useEffect, useRef, useState } from "react";

export default function Magnet({
  children,
  padding = 100,
  disabled = false,
  magnetStrength = 2.5,
  activeTransition = "transform 0.22s ease-out",
  inactiveTransition = "transform 0.45s ease-out",
  wrapperClassName = "",
  innerClassName = "",
  ...props
}) {
  const [isActive, setIsActive] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const magnetRef = useRef(null);

  useEffect(() => {
    if (disabled) {
      setPosition({ x: 0, y: 0 });
      return;
    }

    function handleMouseMove(e) {
      if (!magnetRef.current) return;

      const { left, top, width, height } = magnetRef.current.getBoundingClientRect();
      const centerX = left + width / 2;
      const centerY = top + height / 2;

      const distX = Math.abs(centerX - e.clientX);
      const distY = Math.abs(centerY - e.clientY);

      if (distX < width / 2 + padding && distY < height / 2 + padding) {
        setIsActive(true);
        const offsetX = (e.clientX - centerX) / magnetStrength;
        const offsetY = (e.clientY - centerY) / magnetStrength;
        setPosition({ x: offsetX, y: offsetY });
      } else {
        setIsActive(false);
        setPosition({ x: 0, y: 0 });
      }
    }

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [padding, disabled, magnetStrength]);

  const transitionStyle = isActive ? activeTransition : inactiveTransition;

  return (
    <div
      ref={magnetRef}
      className={wrapperClassName}
      style={{ position: "relative", display: "inline-flex", transition: transitionStyle }}
      {...props}
    >
      <div
        className={innerClassName}
        style={{
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
          transition: transitionStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
