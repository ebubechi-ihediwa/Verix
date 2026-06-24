# Verix — Landing Page Design Documentation

> **Verix** is a verifiable AI execution layer for Stellar DeFi. You submit a
> mandate — swap, supply to a lending pool, settle a cross-border payment —
> and specialized AI agents execute it on-chain while a cryptographic proof
> commits every action to Soroban. The product promise: *you don't just get an
> output, you get proof the agent stayed inside your parameters.*

This document captures the design system, rationale, and implementation of the
landing page so it can be maintained, extended, or rebuilt consistently.

---

## 1. Design Direction

**One line:** Dark cinematic · IBM Plex Mono technical voice · electric indigo,
with a Noomo-style iridescent mesh glow as atmosphere.

**Audience:** Developers / technical + finance / ops. Both groups trust
*evidence* over marketing. Every design choice leans into rigor, precision, and
verifiability rather than hype.

**Reference DNA (blended, not copied):**
| Reference | What we took |
|---|---|
| Noomo (storytelling) | Dreamy iridescent mesh glow, premium soft light, gradient orb |
| Sohub | Giant type, object breaking through headline, scroll word-illuminate, sticky stacking cards |
| Truck'N Roll | Brutalist confidence, massive condensed type, skewed marquee tape |
| Son Daven | Dark cinematic mood, monospace/technical texture, restraint |

**Anti-goals:** no neon "AI concept-art" clichés, no gradient-soup backgrounds,
no emoji, no rounded-card-with-left-accent-border tropes, no filler stats.
Minimalism and negative space are features.

---

## 2. Color System

All colors are CSS custom properties defined in `:root` (see `verix.css`).

### Surfaces (near-black violet base)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#07070d` | Page background |
| `--bg-2` | `#0a0a12` | Alternating section background (steps, quotes, faq) |
| `--surface` | `#0f0f1b` | Cards, console body |
| `--surface-2` | `#14142233` | Translucent card fills |
| `--line` | `rgba(255,255,255,0.09)` | Primary hairline borders |
| `--line-2` | `rgba(255,255,255,0.05)` | Faint internal dividers, grid lines |

### Ink
| Token | Value | Use |
|---|---|---|
| `--text` | `#ECECF4` | Primary text |
| `--muted` | `#8E8EA6` | Body copy, secondary |
| `--faint` | `#5B5B72` | Labels, captions, meta |

### Accent — electric indigo
| Token | Value | Use |
|---|---|---|
| `--accent` | `#4b3bff` | Primary buttons, marquee tape, key glows |
| `--accent-2` | `#7c6bff` | Hovers, eyebrow rules, link accents, "+" markers |
| `--accent-ink` | `#E9E6FF` | Light ink on accent |

### Iridescent mesh (Noomo atmosphere)
Used only as *light* — glows, orbs, and gradient text fills. Never as flat fills.
| Token | Value |
|---|---|
| `--m-violet` | `#9b8cff` |
| `--m-pink` | `#ffb3d1` |
| `--m-teal` | `#8fe3d0` |
| `--m-blue` | `#7aa9ff` |

**Gradient text fill** (used on italic accent words and the final CTA):
`linear-gradient(100deg, var(--m-violet), var(--m-pink) 45%, var(--m-teal))`
clipped to text. Teal is consistently the "verified / proof" signal color.

**Usage rule:** the page is ~95% near-black + ink. Indigo is the single
conversion-driving pop. The iridescent mesh appears sparingly as diffuse light
behind hero, console, manifesto, and final CTA — it is atmosphere, not decoration.

---

## 3. Typography

Two families, loaded from Google Fonts.

| Role | Family | Weights | Notes |
|---|---|---|---|
| Display / headings | **Space Grotesk** | 400, 500, 600, 700 | `letter-spacing: -0.02em to -0.04em`, `line-height: 0.92–0.95`. Italic 400 = the gradient-fill accent word. |
| Body / UI / technical | **IBM Plex Mono** | 400, 500, 600 | Default `body` font. Carries the "technical voice." Used for nav, buttons, labels, body copy. |

### Type scale (fluid, `clamp()`)
| Element | Size |
|---|---|
| Hero title | `clamp(48px, 9.2vw, 160px)` |
| Section title | `clamp(34px, 5.4vw, 84px)` |
| Final CTA | `clamp(42px, 8vw, 124px)` |
| Feature title | `clamp(30px, 4vw, 60px)` |
| Manifesto (illuminate) | `clamp(28px, 4.4vw, 74px)` |
| Drift wordmark | `clamp(72px, 17vw, 280px)` |
| Body / lead | 15–18px |
| Kicker / labels | 11–12px, `letter-spacing: 0.2–0.28em`, uppercase |

**Patterns:**
- **Kicker** (`.kicker`): uppercase mono micro-label with a short `--accent-2`
  rule before it. Used as the eyebrow on every section.
- **Italic accent word**: headings mix Space Grotesk 600 with a 400-italic word
  in iridescent gradient fill — e.g. "Execution you can *prove.*"
- `text-wrap: balance` on headings, `pretty` where useful.

---

## 4. Layout & Spacing

| Token | Value | Use |
|---|---|---|
| `--maxw` | `1480px` | Max content width |
| `--pad` | `clamp(20px, 5vw, 80px)` | Horizontal page padding (also section vertical rhythm anchor) |

- Section vertical padding: `clamp(90px, 12vh, 160px)`.
- **Layout primitive:** flex / grid with `gap` everywhere — never bare inline
  siblings or per-element margins (survives direct-edit reordering).
- Hairline `1px` borders (`--line`) separate every major section — a key part of
  the "engineered / precise" feel.
- Grids: feature rows `1.05fr / 1fr`; metrics 4-up; pricing & quotes 3-up; steps
  collapse to a sticky stack.

### Easing
| Token | Curve | Use |
|---|---|---|
| `--ease` | `cubic-bezier(.22,1,.36,1)` | Default — soft overshoot-free settle |
| `--ease-2` | `cubic-bezier(.65,.05,.36,1)` | Sharper, for accents |

---

## 5. Section Architecture

Order and intent, top to bottom:

1. **Nav** — fixed; transparent over hero, blurs to `rgba(7,7,13,0.72)` +
   hairline border once scrolled past 40px.
2. **Hero** — giant headline "Execution you can *prove.*", iridescent orb
   breaking *through* the type (z-index 1, behind text z-index 3), animated mesh
   glow, hairline grid masked to a radial fade, scroll cue + 3 stats.
3. **Logo cloud** — "Composes with the Stellar DeFi stack" (Soroban, Blend,
   Soroswap, Aquarius, StellarX, Phoenix, Freighter).
4. **Manifesto** — the thesis, rendered as a **scroll word-illuminate** (words
   light from 0.14 → 1 opacity as you scroll; "prove"/"verifiable" in gradient).
5. **Features / Protocol** — three oversized rows (Mandate → Execution → Proof),
   alternating sides, each with a drag-and-drop `<image-slot>` for product
   imagery. This is the core product story.
6. **How it works** — three **sticky stacking cards** (01 Write mandate → 02
   Agents execute → 03 Proof commits) that nest over each other on scroll.
7. **Marquee tape** — two skewed bands (one indigo, one outline) drifting with
   scroll velocity.
8. **Console showcase** — a faux product console that **reveals in 3D** (tilts
   flat from perspective) and **streams a live execution trace** that hashes a
   mandate into a Soroban-committed proof.
9. **Metrics** — 4 animated counters (100% proven, 4.9s finality, 38 primitives,
   0 breaches).
10. **Testimonials** — 3 quotes (treasury, protocol eng, VC).
11. **Pricing** — Sandbox / Mandate (featured) / Institutional.
12. **FAQ** — accordion, 5 items.
13. **Drift wordmark** — giant outlined+gradient "VERIFY EVERYTHING. PROVE EVERY
    MOVE." drifting horizontally on scroll.
14. **Final CTA** — "Stop trusting agents. *Start verifying them.*" + email
    capture ("Get Early Access").
15. **Footer** — brand, product, developers, company columns.

---

## 6. Interaction System

All interactions are **hand-built in vanilla JS** (`verix.js`) — no libraries.
Everything routes through `requestAnimationFrame` loops so it works regardless of
scroll-event quirks, and everything respects `prefers-reduced-motion`.

| # | Interaction | How it works |
|---|---|---|
| 1 | **Custom cursor** | Difference-blend ring lerping toward pointer + instant dot. Grows on hover targets. Hidden on touch (`hover: none`). |
| 2 | **Magnetic buttons** | `.magnetic` elements translate toward the cursor (strength 0.35) on mousemove, reset on leave. |
| 3 | **Nav scroll state** | `.scrolled` class toggles blur + border past 40px. |
| 4 | **Split-text reveal** | Headings (`.split`) are tokenized into `.reveal-word > span/em`, each clipped and translated up 110%, released in sequence (55ms stagger). |
| 5 | **Reveal engine** | IntersectionObserver *plus* a rAF rect-check fallback so reveals fire even on programmatic jump-scrolls. `.fade-up` elements stagger by sibling index. |
| 6 | **Word-illuminate** | Manifesto words interpolate opacity 0.14→1 based on the line's progress through the viewport. |
| 7 | **Sticky stacking cards** | CSS `position: sticky` with stepped `top` offsets; cards physically stack. |
| 8 | **3D console reveal** | `rotateX` + `translateY` + `scale` interpolated from scroll progress inside a `perspective: 1800px` stage; flattens as it enters. |
| 9 | **Streaming proof log** | On enter, 8 trace lines stream in at 620ms intervals, each fading up; trace counter updates; ends "sealed". |
| 10 | **Metric counters** | Cubic-ease count-up on enter; the "0 breaches" metric stays at 0 by design. |
| 11 | **Marquee tape** | Constant drift + scroll-velocity boost, wrapped within one track width for seamless loop. |
| 12 | **Drift wordmark** | Horizontal `translateX` tied to the band's position in the viewport. |
| 13 | **Parallax** | Hero orb + feature viz orbs offset on a rAF loop. |
| 14 | **FAQ accordion** | Single-open; `max-height` transition measured from `scrollHeight`. |
| 15 | **Email form** | No backend — UX confirmation ("You're on the list ✓") then resets. |
| 16 | **Smooth anchor scroll** | Offset by nav height; honors reduced-motion. |

**Texture:** a fixed SVG fractal-noise **grain** overlay at 5% opacity,
`mix-blend-mode: screen`, sits above everything (z-9998) for a filmic finish.

---

## 7. Imagery Guidance

The three **Protocol** feature slots are drag-and-drop `<image-slot>` elements
(persist on drop). Intended content:

- **01 / Mandate** — the mandate editor: plain-language input above a compiled
  policy showing enforced bounds (slippage, gas, protocols, window).
- **02 / Execution** — router fanning a mandate to swap/lend/settle agents with
  live Soroban tx hashes, or a node-graph of the agent fleet.
- **03 / Proof** — the proof receipt (merkle root, action hashes, committed seal)
  or a Stellar explorer view of the committed proof transaction.

**Style rule:** keep all three on the same dark canvas with indigo/iridescent
accents so they read as frames of one product. Prefer real product UI over
abstract 3D for this technical/finance audience. Avoid the neon "AI concept-art"
look — anchor any generated imagery to a real medium (studio photo, engineering
schematic) and use restraint + negative space.

---

## 8. Accessibility & Robustness

- **`prefers-reduced-motion`**: all animations disabled; reveal elements forced
  visible; smooth scroll falls back to instant. Content is never gated behind an
  animation — base state is the visible end-state.
- **Touch**: custom cursor and magnetic effects disabled on `hover: none`.
- **Canonical HTML**: all non-void elements explicitly closed, attributes quoted
  — keeps the file directly editable.
- **Semantics**: `[data-cursor]` flags interactive targets; decorative bands are
  `aria-hidden`.

---

## 9. Files

| File | Role |
|---|---|
| `Verix.html` | Page structure & content |
| `verix.css` | Full design system + all styling |
| `verix.js` | All interactions (vanilla, no libraries) |
| `image-slot.js` | Drag-and-drop image placeholder web component |

---

## 10. Extending the Design

- **New section?** Wrap in `.section`, open with a `.kicker` eyebrow + a
  `.section-title.split` headline (with one italic gradient accent word). Add a
  `--line` top border. Alternate `--bg` / `--bg-2` to keep rhythm (max 2 bg colors).
- **New reveal?** Add `.split` (headings) or `.fade-up` (everything else) — the
  reveal engine picks them up automatically.
- **New CTA?** Use `.btn.btn-primary.magnetic` with the `.btn-label` + `.arr`
  span structure so the magnetic + arrow-nudge interactions apply.
- **Keep the palette**: pull from the existing tokens; if you need a new hue,
  derive it in `oklch` from the indigo/mesh set rather than inventing one.
