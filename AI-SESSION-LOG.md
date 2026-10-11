# AI Session Log — VANTA® Studio build
Chronicle of the iterative build. Each round was verified with a clean
production build (`vite build`, single-file output).
---
## Round 0 — Discovery
- Inspected the starter project: React 19 + Vite 7 + Tailwind CSS v4,
  `vite-plugin-singlefile`, empty `App.tsx` placeholder.
- Decision: build **VANTA® — Digital Gravity Studio**, a dark editorial
  studio site themed around "digital gravity".
- Installed: `framer-motion`, `lenis`, `lucide-react`.
- Generated 6 art-directed images (`hero` liquid-chrome torus; work:
  monolith, prism, liquid, velocity, terra).
## Round 1 — Core experience
Files created: 20 (whole app).
- Design system in `index.css` (Tailwind v4 `@theme` tokens: ink/coal/bone/
  smoke/acid, Syne + Space Grotesk, marquee/pulse keyframes, text-outline
  utilities, fine-pointer cursor hiding).
- Lenis smooth-scroll singleton (`lib/scroll.ts`) + easing constants
  (`lib/motion.ts`).
- **Preloader**: rAF-driven eased counter, cycling words, curtain exit.
- **Custom cursor**: dot + spring ring with `view` label bubble via
  `data-cursor` attributes; pointer-fine only.
- **Nav**: fixed bar + full-screen acid overlay menu with staggered links
  (Lenis-aware scroll-to).
- **Hero**: masked line reveals, scroll parallax, rotating SVG text badge,
  glow.
- **Marquee**, **Work** (sticky horizontal gallery, dynamic measure,
  inner-image parallax, progress bar, live counter), **Manifesto**
  (word-by-word opacity reveal), **Services** (accordion),
  **Stats** (counters), **Awards**, **Footer** (magnetic CTA, live AMS clock).
- Polish pass: explicit `spin-slow` keyframes, inline SVG favicon,
  velocity-reactive `skewX` on the work track, orbital rings in hero.
- ✅ Build: 429 kB → 433 kB after polish.
## Round 2 — Depth & interactivity
- **CaseStudy overlay**: full-screen, clip-path entrance, meta grid,
  narrative copy, next-case cycling, `data-lenis-prevent` native scrolling.
- **Work**: projects upgraded with full detail data (client, role,
  deliverables, narratives); card click opens overlay.
- **GravityField**: canvas particle simulation — cursor gravity + tangential
  swirl, constellation lines, influence ring, speed caps, edge wrapping,
  DPR-capped, reduced-motion static fallback.
- **Process**: sticky stacking method cards (Discover → Define → Design →
  Develop & Deliver).
- **Testimonials**: auto-rotating (6 s) quotes, blur/fade transitions,
  magnetic controls.
- Accessibility: `:focus-visible` acid outlines, global `prefers-reduced-
  motion` handling.
- Section numbering re-sequenced (01 Work → 07 Contact).
- ✅ Build: ~449–451 kB.
## Round 3 — Craft & feedback systems
- **Services hover previews**: 4 new generated visuals (brand V, device,
  light-painting, circuitry) chasing the cursor with springs.
- **FieldNotes** journal section: acid sweep-fill row hover.
- **ProgressBar**: spring-smoothed global scroll hairline.
- **CopyEmail**: clipboard micro-interaction (footer + menu overlay).
- **Footer**: giant 19vw outlined wordmark closer.
- **CaseStudy**: keyboard nav (`←`/`→`/`Esc`) + on-screen hint.
- **Hero**: mouse parallax on the chrome render.
- Meta: Open Graph + Twitter card tags.
- Nav: Journal link.
- ✅ Build: ~456 kB.
## Round 4 — Sensory & functional layer
- **SoundToggle**: fully synthesized Web Audio drone (detuned 55 Hz sines +
  LFO-swept bandpass noise), exponential fades, animated EQ bars, mounted in
  nav.
- **Brief composer**: full-screen editorial form (need chips, budget pills,
  timeline, story) → structured `mailto:`; opened via `vanta:open-brief`
  CustomEvent from footer CTA and gallery end card; `Esc`/click close,
  Lenis lock, honest "no tracking" copy + copy-email fallback.
- Perf: `loading="lazy"` + `decoding="async"` on below-fold imagery.
- SEO: Organization JSON-LD in `index.html`.
- ✅ Build: 466 kB final (gzip ~143 kB).
## Round 5 — Documentation
- Created `README.md` (overview, stack, tokens, journey, systems, structure,
  scripts) and this `ai-session-log.md`.
---
**Final state** — 30 source files, 10 generated images, 0 external runtime
assets beyond Google Fonts; single-file production build green on every
iteration.
