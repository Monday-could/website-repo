import gsap from "gsap";

/**
 * Scoped GSAP timelines; always call `context.revert()` on cleanup (React strict mode safe).
 * @param {HTMLElement | null} scope
 * @param {{ reducedMotion?: boolean }} opts
 * @returns {import("gsap").Context | null}
 */
export function runHomeHeroMotion(scope, { reducedMotion = false } = {}) {
  if (!scope || reducedMotion) return null;
  return gsap.context(() => {
    gsap.from(scope.querySelectorAll(".hero-copy > *"), {
      opacity: 0,
      y: 22,
      duration: 0.62,
      stagger: 0.07,
      ease: "power3.out",
    });
    gsap.from(scope.querySelectorAll(".hero-food img"), {
      opacity: 0,
      y: 32,
      scale: 0.94,
      duration: 0.68,
      stagger: 0.14,
      ease: "power3.out",
      delay: 0.08,
    });
  }, scope);
}

export function runHomePopularMotion(scope, { reducedMotion = false } = {}) {
  if (!scope || reducedMotion) return null;
  return gsap.context(() => {
    gsap.from(scope.querySelectorAll(".section-heading > *"), {
      opacity: 0,
      y: 16,
      duration: 0.5,
      stagger: 0.06,
      ease: "power2.out",
      delay: 0.1,
    });
    const carousel = scope.querySelector(".home-carousel");
    if (carousel) {
      gsap.from(carousel, {
        opacity: 0,
        y: 20,
        duration: 0.55,
        ease: "power2.out",
        delay: 0.26,
      });
    }
  }, scope);
}

export function runFoodCardStagger(scope, { reducedMotion = false } = {}) {
  if (!scope || reducedMotion) return null;
  const cards = scope.querySelectorAll(".food-card");
  if (!cards.length) return null;
  return gsap.context(() => {
    gsap.from(cards, {
      opacity: 0,
      y: 24,
      duration: 0.48,
      /** No stagger on Y: keeps paired column cards on the same horizontal baseline during and after the intro */
      stagger: 0,
      ease: "power2.out",
    });
  }, scope);
}

export function runCartLayoutMotion(scope, { reducedMotion = false } = {}) {
  if (!scope || reducedMotion) return null;
  return gsap.context(() => {
    const lines = scope.querySelector(".cart-lines-panel");
    const summary = scope.querySelector(".cart-summary-panel");
    if (lines) gsap.from(lines, { opacity: 0, x: -14, duration: 0.45, ease: "power2.out" });
    if (summary) gsap.from(summary, { opacity: 0, x: 14, duration: 0.45, ease: "power2.out", delay: 0.06 });
  }, scope);
}

/** Subtle route transition on `<main>` (skips first paint — caller handles that). */
export function runMainRouteEnter(mainEl, { reducedMotion = false } = {}) {
  if (!mainEl || reducedMotion) return null;
  return gsap.context(() => {
    gsap.fromTo(
      mainEl,
      { opacity: 0.93, y: 8 },
      { opacity: 1, y: 0, duration: 0.34, ease: "power2.out" },
    );
  }, mainEl);
}
