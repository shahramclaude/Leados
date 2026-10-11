# VANTA® — Digital Gravity Studio
An independent design-studio site built to an Awwwards-caliber standard: dark
editorial design, kinetic typography, smooth scroll physics, a playable
gravity-field canvas, full case-study deep-dives, ambient generative audio,
and an editorial project-brief composer.
**Concept** — Vanta builds "digital gravity": brands, websites and motion with
enough mass to pull audiences past the event horizon. Every visual and
interaction decision serves that thesis.
---
## Built with
| Layer        | Tech                                                        |
| ------------ | ----------------------------------------------------------- |
| Framework    | React 19 + TypeScript + Vite 7 (single-file build)         |
| Styling      | Tailwind CSS v4 (`@theme` design tokens, custom keyframes) |
| Animation    | Framer Motion (scroll-linked, springs, AnimatePresence)    |
| Smooth scroll| Lenis                                                       |
| Icons        | Lucide React                                                |
| Canvas       | Vanilla Canvas 2D (gravity-field particle simulation)      |
| Audio        | Web Audio API (fully synthesized ambient drone, no files)  |
| Type         | Syne (display) + Space Grotesk (body)                      |
## Design tokens
```css
--color-ink:   #0a0a0b   /* background        */
--color-coal:  #131315   /* raised surfaces   */
--color-bone:  #ece9e1   /* primary text      */
--color-smoke: #8a887f   /* secondary text    */
--color-acid:  #cdff3e   /* signature accent  */
```
## Page journey
1. **Preloader** — eased 0→100% counter, cycling discipline words, curtain exit
2. **Hero** — kinetic `EVENT HORIZON` type, parallax chrome render, rotating
   badge, orbital rings, mouse parallax
3. **Marquee** — infinite capability band
4. **Work** — 400vh sticky horizontal gallery; velocity-reactive shear; each
   card opens a full-screen **case study** (`←`/`→` browse, `Esc` closes)
5. **Manifesto** — scroll-linked word-by-word reveal
6. **Process** — four sticky-stacking method cards
7. **Capabilities** — accordion with cursor-chasing image previews
8. **Stats** — in-view animated counters
9. **Voices** — auto-rotating testimonial carousel
10. **Gravity Field** — interactive canvas: 150 bodies orbit your cursor
11. **Recognition** — awards list
12. **Journal** — Field Notes rows with acid sweep-fill hover
13. **Brief** — project-brief composer (mailto, opened from footer CTA or the
    gallery's "Your Project Here" card)
14. **Footer** — `SAY HELLO`, live Amsterdam clock, copy-email, giant wordmark
## Systems
- **Custom cursor** — acid dot + spring ring; morphs into `VIEW`/`READ`/`OPEN`
  bubble over tagged elements (`data-cursor`), disabled on touch devices
- **Ambient sound** — nav toggle plays a synthesized drone (detuned 55 Hz
  sines + LFO-swept bandpass noise); animated EQ indicator; `aria-pressed`
- **Scroll progress bar** — spring-smoothed acid hairline
- **Film grain + vignette** overlays
- **Event bus** — `window` CustomEvent (`vanta:open-brief`) opens the brief
  overlay from anywhere
- **Accessibility** — `prefers-reduced-motion` handling, `:focus-visible`
  acid outlines, aria labels, keyboard nav in case studies
- **SEO** — meta description, Open Graph, Twitter card, Organization JSON-LD
## Project structure
```
public/img/            generated art-direction imagery
src/
  lib/
    motion.ts          easing constants
    scroll.ts          Lenis singleton + scrollTo helper
  components/
    App-shell:         Nav, Preloader, Cursor, Noise, ProgressBar, Magnetic,
                       Reveal, SectionLabel
    sections:          Hero, Marquee, Work (+CaseStudy), Manifesto, Process,
                       Services, Stats, Testimonials, GravityField, Awards,
                       FieldNotes, Footer
    features:          Brief, SoundToggle, CopyEmail
```
## Scripts
```bash
npm run dev       # start dev server
npm run build     # production build → dist/index.html (single file)
npm run preview   # preview the build
```
---
© 2026 VANTA® Studio — Herengracht 420, Amsterdam · 52.3676° N, 4.9041° E
