"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ReactLenis, useLenis } from "lenis/react";
import "lenis/dist/lenis.css";

function LandingEffects({ children }: { children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLenis((lenis) => {
    const root = rootRef.current;
    if (!root) return;

    const y = lenis.scroll;
    root.dataset.scrolled = y > 12 ? "true" : "false";
    root.style.setProperty("--lenis-scroll", `${y}`);

    root.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => {
      if (el.hasAttribute("data-reveal") && !el.classList.contains("is-revealed")) return;
      const speed = Number(el.dataset.parallax) || 0.12;
      el.style.transform = `translate3d(0, ${y * speed}px, 0)`;
    });

    root.querySelectorAll<HTMLElement>("[data-parallax-x]").forEach((el) => {
      const speed = Number(el.dataset.parallaxX) || 0.06;
      el.style.transform = `translate3d(${y * speed}px, 0, 0)`;
    });
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const nodes = root.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -10% 0px" },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="landing" data-scrolled="false">
      {children}
    </div>
  );
}

export function LandingShell({ children }: { children: ReactNode }) {
  return (
    <ReactLenis
      root
      options={{
        autoRaf: true,
        anchors: true,
        lerp: 0.075,
        smoothWheel: true,
        syncTouch: false,
        touchMultiplier: 1.1,
        wheelMultiplier: 0.95,
        stopInertiaOnNavigate: true,
        respectReducedMotion: true,
      }}
    >
      <LandingEffects>{children}</LandingEffects>
    </ReactLenis>
  );
}
