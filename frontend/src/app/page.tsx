import Image from "next/image";
import Link from "next/link";
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { LandingShell } from "@/components/landing/LandingShell";

const NAV = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#schools", label: "For Schools" },
  { href: "#pricing", label: "Pricing" },
  { href: "#about", label: "About" },
] as const;

const STEPS = [
  {
    title: "Upload",
    body: "Add PDFs, docs, images, markdown or videos.",
  },
  {
    title: "Generate",
    body: "AI structures content into an interactive lesson deck.",
  },
  {
    title: "Share",
    body: "Get a unique link. Teach, anytime, anywhere.",
  },
] as const;

const PERSONAS = [
  {
    name: "Curious Kavya",
    blurb: "Asks “why” a lot and loves examples.",
    readiness: 78,
    tone: "#0f6a5a",
    avatar: "/personas/kavya.png",
  },
  {
    name: "Logical Rohan",
    blurb: "Likes facts, logic and structure.",
    readiness: 64,
    tone: "#1d4e89",
    avatar: "/personas/rohan.png",
  },
  {
    name: "Quick Simba",
    blurb: "Fast learner, gets bored easily.",
    readiness: 41,
    tone: "#9a3412",
    avatar: "/personas/simba.png",
  },
  {
    name: "Shy Isha",
    blurb: "Needs gentle encouragement.",
    readiness: 52,
    tone: "#6b21a8",
    avatar: "/personas/isha.png",
  },
] as const;

const MODES = [
  {
    title: "Interactive",
    badge: "Live",
    body: "Clickable scenes, AI guide, hotspots and audio.",
    live: true,
  },
  {
    title: "Gamified",
    badge: "Coming soon",
    body: "Points, levels and challenges to boost engagement.",
    live: false,
  },
  {
    title: "Quiz",
    badge: "Coming soon",
    body: "Auto generated quizzes and assessments.",
    live: false,
  },
] as const;

function LogoMark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`landing-logo ${className}`}>
      <span className="landing-logo-mark" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 11.5L21 3l-4.5 18-5.2-6.3L3 11.5z"
            fill="currentColor"
          />
        </svg>
      </span>
      <span>GuruDroneAI</span>
    </Link>
  );
}

function StartTeacherCta({ className = "" }: { className?: string }) {
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal" forceRedirectUrl="/dashboard">
          <button type="button" className={className}>
            Start as teacher <span aria-hidden>→</span>
          </button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <Link href="/dashboard" className={className}>
          Go to dashboard <span aria-hidden>→</span>
        </Link>
      </Show>
    </>
  );
}

function CreateLessonCta({ className = "" }: { className?: string }) {
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal" forceRedirectUrl="/studio/new">
          <button type="button" className={className}>
            Create lesson
          </button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <Link href="/studio/new" className={className}>
          Create lesson
        </Link>
      </Show>
    </>
  );
}

export default function Home() {
  return (
    <LandingShell>
      <div className="landing-blob landing-blob-a" data-parallax="0.12" aria-hidden />
      <div className="landing-blob landing-blob-b" data-parallax="0.08" aria-hidden />
      <div className="landing-blob landing-blob-c" data-parallax-x="0.05" aria-hidden />

      <header className="landing-nav">
        <LogoMark />
        <nav className="landing-nav-links" aria-label="Primary">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="landing-nav-actions">
          <Show when="signed-out">
            <SignInButton mode="modal" forceRedirectUrl="/dashboard">
              <button type="button" className="landing-btn-ghost">
                Login
              </button>
            </SignInButton>
            <SignUpButton mode="modal" forceRedirectUrl="/dashboard">
              <button type="button" className="landing-btn-solid">
                Start as teacher
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <Link href="/dashboard" className="landing-btn-ghost">
              Dashboard
            </Link>
            <Link href="/studio" className="landing-btn-solid">
              Open Studio
            </Link>
            <UserButton />
          </Show>
        </div>
      </header>

      <main>
        <section className="landing-hero" id="product">
          <div className="landing-hero-copy" data-reveal>
            <p className="landing-eyebrow landing-hero-eyebrow">GuruDroneAI</p>
            <h1 className="landing-hero-title">
              Your AI co teacher
              <br />
              for smarter
              <br />
              <em>classrooms.</em>
            </h1>
            <p className="landing-lede">
              Turn your notes into an interactive classroom experience with AI.
              Simulate, teach, and adapt, all in one shareable link.
            </p>
            <div className="landing-hero-ctas">
              <StartTeacherCta className="landing-btn-solid landing-btn-lg" />
              <CreateLessonCta className="landing-btn-outline landing-btn-lg" />
            </div>
            <ul className="landing-pillars">
              <li>
                <strong>Upload</strong>
                <span>Any material</span>
              </li>
              <li>
                <strong>Generate</strong>
                <span>Interactive deck</span>
              </li>
              <li>
                <strong>Share</strong>
                <span>Teach anywhere</span>
              </li>
            </ul>
          </div>

          <div className="landing-hero-visual" data-parallax="0.04">
            <Image
              src="/hero.png"
              alt="GuruDroneAI interactive classroom deck for Photosynthesis with pixel guide character"
              width={1600}
              height={1000}
              priority
              sizes="(min-width: 900px) 48vw, 100vw"
              className="landing-hero-image"
            />
          </div>
        </section>

        <section className="landing-section" id="how" data-reveal>
          <p className="landing-eyebrow">How it works</p>
          <h2 className="landing-h2">From notes to a live classroom in three steps</h2>
          <ol className="landing-steps">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="landing-step"
                data-reveal
                style={{ transitionDelay: `${index * 80}ms` }}
              >
                <span className="landing-step-icon" aria-hidden>
                  {index === 0 ? "↑" : index === 1 ? "✦" : "↗"}
                </span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                {index < STEPS.length - 1 ? (
                  <span className="landing-step-arrow" aria-hidden>
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section" id="schools" data-reveal>
          <p className="landing-eyebrow">Teach with interaction</p>
          <h2 className="landing-h2 landing-h2-feature">
            An interactive deck that teaches for you.
          </h2>
          <p className="landing-split-lede">
            Pixel guide. Clickable hotspots. Audio explanations. Built for real
            classroom engagement.
          </p>
          <Show when="signed-out">
            <SignInButton mode="modal" forceRedirectUrl="/studio/new">
              <button type="button" className="landing-btn-solid">
                See demo <span aria-hidden>↗</span>
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link href="/studio/new" className="landing-btn-solid">
              See demo <span aria-hidden>↗</span>
            </Link>
          </Show>
        </section>

        <section className="landing-section" id="simulate" data-reveal>
          <p className="landing-eyebrow">Simulate & improve</p>
          <h2 className="landing-h2 landing-h2-center">
            Test your lesson with AI students first
          </h2>
          <div className="landing-personas">
            {PERSONAS.map((persona, index) => (
              <article
                key={persona.name}
                className="landing-persona"
                data-reveal
                style={{ transitionDelay: `${index * 70}ms` }}
              >
                <Image
                  src={persona.avatar}
                  alt={`${persona.name} pixel avatar`}
                  width={96}
                  height={96}
                  className="landing-persona-avatar"
                />
                <h3>{persona.name}</h3>
                <p>{persona.blurb}</p>
                <div className="landing-readiness">
                  <div className="landing-readiness-meta">
                    <span>Readiness</span>
                    <span>{persona.readiness}%</span>
                  </div>
                  <div className="landing-readiness-track">
                    <div
                      className="landing-readiness-fill"
                      style={{
                        width: `${persona.readiness}%`,
                        background: persona.tone,
                      }}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="landing-center-cta">
            <Show when="signed-out">
              <SignInButton mode="modal" forceRedirectUrl="/studio">
                <button type="button" className="landing-btn-outline">
                  Try simulation
                </button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <Link href="/studio" className="landing-btn-outline">
                Try simulation
              </Link>
            </Show>
          </div>
        </section>

        <section className="landing-section" id="pricing" data-reveal>
          <p className="landing-eyebrow">Modes for every classroom</p>
          <h2 className="landing-h2 landing-h2-center">Pick how your class learns</h2>
          <div className="landing-modes">
            {MODES.map((mode, index) => (
              <article
                key={mode.title}
                className={`landing-mode ${mode.live ? "is-live" : "is-soon"}`}
                data-reveal
                style={{ transitionDelay: `${index * 70}ms` }}
              >
                <div className="landing-mode-top">
                  <h3>{mode.title}</h3>
                  <span>{mode.badge}</span>
                </div>
                <p>{mode.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-banner" id="about" data-reveal>
          <h2>Your classroom. Supercharged.</h2>
          <div className="landing-hero-ctas">
            <StartTeacherCta className="landing-btn-light landing-btn-lg" />
            <CreateLessonCta className="landing-btn-light-outline landing-btn-lg" />
          </div>
        </section>
      </main>

      <footer className="landing-footer" data-reveal>
        <div className="landing-footer-brand">
          <LogoMark />
          <p className="landing-footer-tagline">
            AI Co Teacher for Modern Classrooms
          </p>
        </div>

        <nav className="landing-footer-nav" aria-label="Footer">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="landing-social">
          <a href="https://x.com" target="_blank" rel="noreferrer" aria-label="X">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.257 5.672L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
            </svg>
          </a>
          <a
            href="https://linkedin.com"
            target="_blank"
            rel="noreferrer"
            aria-label="LinkedIn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
          <a href="mailto:hello@gurudrone.ai" aria-label="Email">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M3.5 6.5h17a1 1 0 011 1v9a1 1 0 01-1 1h-17a1 1 0 01-1-1v-9a1 1 0 011-1z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M3.5 7.5l8.5 6 8.5-6"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
      </footer>
    </LandingShell>
  );
}
