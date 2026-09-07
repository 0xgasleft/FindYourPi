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
 *
 * Also recovers from a lost WebGL context, which otherwise leaves this
 * canvas permanently gray: this scene stays mounted for the entire
 * search -> connect -> claim -> mint flow on the landing page (it's the
 * background behind PiHunt, not gated by its phase), and minting requires
 * at least one wallet-extension popup — backgrounding the tab for that is a
 * common real-world trigger for Chrome/the GPU process dropping the
 * context. `webglcontextlost` must call preventDefault() or the browser
 * won't even attempt to restore it (treats the loss as permanent); once
 * `webglcontextrestored` fires, the whole scene is remounted via a `key`
 * change rather than trying to patch the existing renderer in place —
 * recreating from scratch is the only recovery path guaranteed to actually
 * repaint across browsers.
 */
export function Hero3D() {
  const [render3d, setRender3d] = useState(false);
  const [sceneKey, setSceneKey] = useState(0);

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

  useEffect(() => {
    if (!render3d) return;
    const handleContextLost = (e: Event) => e.preventDefault();
    const handleContextRestored = () => setSceneKey((k) => k + 1);
    // Context-loss events are dispatched on the <canvas> and bubble to window
    // — no need to drill a ref down through react-three-fiber's Canvas.
    window.addEventListener("webglcontextlost", handleContextLost, false);
    window.addEventListener("webglcontextrestored", handleContextRestored, false);
    return () => {
      window.removeEventListener("webglcontextlost", handleContextLost, false);
      window.removeEventListener("webglcontextrestored", handleContextRestored, false);
    };
  }, [render3d]);

  if (!render3d) return <DigitField />;
  return <HeroScene key={sceneKey} />;
}
