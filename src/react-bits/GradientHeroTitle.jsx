/**
 * Lightweight gradient headline: same idea as React Bits GradientText (CSS clip + shifting gradient).
 * No motion/Framer dependency — avoids bundle cost and transform conflicts with GSAP.
 */
import "./GradientHeroTitle.css";

export default function GradientHeroTitle({ children, className = "" }) {
  return <span className={`rb-gradient-hero-title ${className}`.trim()}>{children}</span>;
}
