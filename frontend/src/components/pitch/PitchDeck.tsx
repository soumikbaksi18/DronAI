"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PITCH_SLIDES } from "@/lib/pitch-slides";

export function PitchDeck() {
  const total = PITCH_SLIDES.length;
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");

  const go = useCallback(
    (next: number, direction: "next" | "prev") => {
      const clamped = Math.max(0, Math.min(total - 1, next));
      if (clamped === index) return;
      setDir(direction);
      setIndex(clamped);
    },
    [index, total],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(index + 1, "next");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1, "prev");
      } else if (e.key === "Home") {
        e.preventDefault();
        go(0, "prev");
      } else if (e.key === "End") {
        e.preventDefault();
        go(total - 1, "next");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, total]);

  // Light touch swipe
  useEffect(() => {
    let startX: number | null = null;
    function onStart(e: TouchEvent) {
      startX = e.changedTouches[0]?.clientX ?? null;
    }
    function onEnd(e: TouchEvent) {
      if (startX == null) return;
      const dx = (e.changedTouches[0]?.clientX ?? startX) - startX;
      if (Math.abs(dx) > 48) {
        if (dx < 0) go(index + 1, "next");
        else go(index - 1, "prev");
      }
      startX = null;
    }
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [go, index]);

  const slide = PITCH_SLIDES[index];

  return (
    <div className="pitch" data-accent={slide.accent ?? "brand"}>
      <header className="pitch-top">
        <Link href="/" className="pitch-brand">
          GuruDroneAI
        </Link>
        <div className="pitch-top-actions">
          <a
            href="/GuruDroneAI-Pitch.pdf"
            download="GuruDroneAI-Pitch.pdf"
            className="pitch-download"
          >
            Download PDF
          </a>
          <p className="pitch-progress">
            <span className="font-mono">{String(index + 1).padStart(2, "0")}</span>
            <span className="pitch-progress-sep">/</span>
            <span className="font-mono">{String(total).padStart(2, "0")}</span>
          </p>
        </div>
      </header>

      <div className="pitch-stage" aria-live="polite">
        <div
          key={slide.id}
          className={`pitch-panel pitch-panel--${dir}`}
          data-accent={slide.accent ?? "brand"}
        >
          {slide.kicker ? <p className="pitch-kicker">{slide.kicker}</p> : null}
          <h1 className="pitch-title">{slide.title}</h1>
          <p className="pitch-body">{slide.body}</p>

          {slide.points?.length ? (
            <ul className="pitch-points" data-loop={slide.id === "loop" ? "true" : "false"}>
              {slide.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          ) : null}

          {slide.footer ? (
            slide.id === "close" ? (
              <div className="pitch-cta">
                <Link href="/studio" className="pitch-cta-btn">
                  {slide.footer}
                </Link>
              </div>
            ) : (
              <p className="pitch-footer">{slide.footer}</p>
            )
          ) : null}
        </div>
      </div>

      <nav className="pitch-nav" aria-label="Slide navigation">
        <button
          type="button"
          className="pitch-arrow"
          aria-label="Previous slide"
          disabled={index === 0}
          onClick={() => go(index - 1, "prev")}
        >
          <span aria-hidden>←</span>
        </button>

        <ol className="pitch-dots">
          {PITCH_SLIDES.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                className={i === index ? "is-active" : undefined}
                aria-label={`Go to slide ${i + 1}: ${item.title}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => go(i, i > index ? "next" : "prev")}
              />
            </li>
          ))}
        </ol>

        <button
          type="button"
          className="pitch-arrow"
          aria-label="Next slide"
          disabled={index === total - 1}
          onClick={() => go(index + 1, "next")}
        >
          <span aria-hidden>→</span>
        </button>
      </nav>

      <p className="pitch-hint">Use ← → or swipe</p>
    </div>
  );
}
