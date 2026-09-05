"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { DigitField } from "../digit-field";

const HeroScene = dynamic(() => import("./hero-scene").then((m) => m.HeroScene), {
  ssr: false,
  loading: () => null,
});

/**
 * Gates the full 3D scene behind a capability check: respects
 * prefers-reduced-motion (spec §51 — animations must not make the site
 * unusable) and skips the heavier WebGL scene on narrow/mobile viewports in
 * favor of the lighter 2D digit backdrop. Never blocks the page — this is
 * an enhancement layer, not a loading gate for the actual product.
 */
export function Hero3D() {
  const [render3d, setRender3d] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wideEnough = window.innerWidth >= 768;
    const hasWebGL = (() => {
      try {
        const canvas = document.createElement("canvas");
        return !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
      } catch {
        return false;
      }
    })();
    setRender3d(!reducedMotion && wideEnough && hasWebGL);
  }, []);

  if (!render3d) return <DigitField />;
  return <HeroScene />;
}
