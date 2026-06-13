# Verix — Brand & Design System MASTER

**Version:** 1.0  
**Audience:** Developer / Technical Founders  
**Personality:** Precise · Technical · Trustworthy  
**Category:** AI Infrastructure / Web3 / Multi-agent SaaS  

---

## 1. Brand Essence

| Attribute | Definition |
|-----------|-----------|
| **Mission** | Make autonomous agent work verifiable and trustless |
| **Promise** | Every execution is cryptographically committed, auditable, and settled on-chain |
| **Tone** | Direct, precise, zero fluff — like good documentation |
| **Anti-patterns** | Hype language, vague adjectives ("powerful", "seamless"), over-animation |

### Brand Voice Rules
- Write like an engineer explaining to another engineer
- Use concrete nouns: "receipt hash", "trace root", "spend cap" — not "powerful AI insights"
- Active voice, short sentences
- Never say "leverage", "synergy", "next-generation", "cutting-edge"
- Okay to use technical jargon — the audience will know it

---

## 2. Color System

### Primitive Tokens (raw values)
```
/* Neutrals */
--primitive-black:       #05070f   /* deepest background */
--primitive-dark-900:    #0a0c15   /* secondary bg */
--primitive-dark-800:    #0f1120   /* card bg */
--primitive-dark-700:    #161829   /* elevated surface */
--primitive-dark-600:    #1e2035   /* border / divider */
--primitive-dark-500:    #2a2d47   /* muted border */
--primitive-dark-400:    #3d4268   /* placeholder */
--primitive-dark-300:    #6b72a3   /* muted text */
--primitive-dark-200:    #9ba3cc   /* secondary text */
--primitive-dark-100:    #c4c9e0   /* primary text dim */
--primitive-white:       #eef0f8   /* primary text */

/* Brand — Indigo/Violet spectrum */
--primitive-brand-600:   #4f46e5   /* deep indigo */
--primitive-brand-500:   #6366f1   /* primary brand */
--primitive-brand-400:   #818cf8   /* interactive / glow */
--primitive-brand-300:   #a5b4fc   /* text accent */
--primitive-brand-200:   #c4b5fd   /* gradient mid */
--primitive-brand-100:   #ddd6fe   /* light tint */

/* Violet accent */
--primitive-violet-600:  #7c3aed
--primitive-violet-500:  #8b5cf6
--primitive-violet-400:  #a78bfa

/* Semantic status */
--primitive-green-500:   #10b981
--primitive-green-400:   #34d399
--primitive-red-500:     #ef4444
--primitive-red-400:     #f87171
--primitive-amber-500:   #f59e0b
--primitive-amber-400:   #fbbf24
```

### Semantic Tokens (use these in code)
```
/* Backgrounds */
--color-bg-base:          #05070f   /* html / body */
--color-bg-subtle:        #0a0c15   /* page sections */
--color-bg-surface:       #0f1120   /* cards, panels */
--color-bg-elevated:      #161829   /* modals, dropdowns */
--color-bg-overlay:       rgba(5,7,15,0.85)  /* scrim */

/* Borders */
--color-border-subtle:    rgba(255,255,255,0.06)
--color-border-default:   rgba(255,255,255,0.10)
--color-border-strong:    rgba(255,255,255,0.18)
--color-border-brand:     rgba(99,102,241,0.40)

/* Text */
--color-text-primary:     #eef0f8
--color-text-secondary:   #9ba3cc
--color-text-muted:       #6b72a3
--color-text-disabled:    #3d4268
--color-text-brand:       #a5b4fc
--color-text-on-brand:    #ffffff

/* Brand */
--color-brand-primary:    #6366f1
--color-brand-secondary:  #8b5cf6
--color-brand-glow:       rgba(99,102,241,0.35)

/* Status */
--color-success:          #34d399
--color-error:            #f87171
--color-warning:          #fbbf24
--color-info:             #60a5fa

/* Glass surfaces */
--color-glass-bg:         rgba(255,255,255,0.04)
--color-glass-border:     rgba(255,255,255,0.10)
--color-glass-hover:      rgba(255,255,255,0.07)
```

### Light Mode Tokens (dashboard, settings — non-landing pages)
The existing light shell (`#f6f5f2` / `#111113`) is retained for the app interior. The dark palette is **landing page only** unless the user explicitly adopts full dark mode.

---

## 3. Typography

### Font Stack
```
--font-display:  "Geist", system-ui, -apple-system, sans-serif   /* headings */
--font-body:     "Geist", system-ui, -apple-system, sans-serif   /* body */
--font-mono:     "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace  /* code / hashes */
```

### Type Scale
| Token | Size | Weight | Line-height | Use |
|-------|------|--------|-------------|-----|
| `--text-display-xl` | 72px | 700 | 1.05 | Hero headline max |
| `--text-display-lg` | 56px | 700 | 1.08 | Hero headline default |
| `--text-display-md` | 40px | 700 | 1.1  | Section headline |
| `--text-heading-lg` | 32px | 700 | 1.15 | Card group title |
| `--text-heading-md` | 24px | 600 | 1.2  | Card title |
| `--text-heading-sm` | 18px | 600 | 1.3  | Sub-section title |
| `--text-body-lg`    | 16px | 400 | 1.7  | Main body copy |
| `--text-body-md`    | 14px | 400 | 1.6  | Secondary body |
| `--text-body-sm`    | 13px | 400 | 1.55 | Caption / helper |
| `--text-label`      | 11px | 600 | 1.0  | UPPERCASE labels, badges |
| `--text-mono-md`    | 13px | 400 | 1.7  | Code, hashes |
| `--text-mono-sm`    | 11px | 400 | 1.6  | Terminal, receipt data |

### Typography Rules
- Headings: `letter-spacing: -0.03em` — tight tracking feels precise
- Body: `letter-spacing: 0` — default spacing, no forced looseness
- Labels/badges: `letter-spacing: 0.08em`, ALL CAPS
- Mono: `font-variant-numeric: tabular-nums` always
- Max line length: 65ch for body, 48ch for subheadings in heroes

---

## 4. Spacing & Layout

### Spacing Scale (4px base)
```
--space-1:  4px
--space-2:  8px
--space-3:  12px
--space-4:  16px
--space-5:  20px
--space-6:  24px
--space-8:  32px
--space-10: 40px
--space-12: 48px
--space-16: 64px
--space-20: 80px
--space-24: 96px
```

### Layout
- Max content width: `1152px`
- Page padding: `24px` (mobile), `32px` (tablet), `24px` within max-width container (desktop)
- Grid: 12-column, `24px` gutters
- Section vertical rhythm: `80px` top/bottom padding

---

## 5. Elevation & Effects

### Shadow Scale
```
--shadow-sm:   0 1px 3px rgba(0,0,0,0.4)
--shadow-md:   0 4px 12px rgba(0,0,0,0.5)
--shadow-lg:   0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05) inset
--shadow-xl:   0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05) inset
--shadow-brand: 0 0 32px rgba(99,102,241,0.4)
--shadow-brand-lg: 0 0 64px rgba(99,102,241,0.35), 0 8px 32px rgba(0,0,0,0.5)
```

### Border Radius
```
--radius-sm:   6px    /* chips, tags, small buttons */
--radius-md:   10px   /* buttons, inputs */
--radius-lg:   16px   /* cards */
--radius-xl:   20px   /* panels, modals */
--radius-pill: 999px  /* badges, pills */
```

### Glass Morphism Recipe
```css
background: rgba(255,255,255,0.04);
border: 1px solid rgba(255,255,255,0.10);
backdrop-filter: blur(24px) saturate(1.4);
box-shadow: 0 0 0 1px rgba(255,255,255,0.05) inset,
            0 32px 64px rgba(0,0,0,0.55),
            0 0 60px rgba(99,102,241,0.08);
border-radius: 16px;
```

### Glow Orbs (ambient background lighting)
Always use 3 orbs: primary (indigo, top-center), secondary (violet, right), tertiary (blue, bottom-left).  
Blur: `40–80px`. Opacity: `20–35%`. Never white or warm colours.

---

## 6. Component Patterns

### Primary Button
```
background: linear-gradient(135deg, #6366f1, #8b5cf6)
border: 1px solid rgba(255,255,255,0.15)
border-radius: 10px
padding: 11px 22px
font-size: 14px, font-weight: 600
box-shadow: 0 0 32px rgba(99,102,241,0.4)
hover: filter brightness(1.1), translateY(-1px)
```

### Secondary Button
```
background: rgba(255,255,255,0.06)
border: 1px solid rgba(255,255,255,0.12)
border-radius: 10px
padding: 11px 22px
font-size: 14px, font-weight: 500
color: rgba(255,255,255,0.70)
hover: background rgba(255,255,255,0.09)
```

### Badge / Label
```
background: rgba(99,102,241,0.12)
border: 1px solid rgba(99,102,241,0.35)
border-radius: 999px
padding: 4px 12px
font: 11px, 600, UPPERCASE, letter-spacing 0.07em
color: #a5b4fc
```

### Terminal / Code Panel
```
background: rgba(0,0,0,0.35)
border: 1px solid rgba(255,255,255,0.07)
font-family: Geist Mono
font-size: 12.5px, line-height: 2
Terminal line colors: success #34d399 · action #818cf8 · accent #a78bfa
```

### Status Indicators
- Live/active: pulsing dot `#818cf8` with `box-shadow` glow animation
- Success: `#34d399`
- Error: `#f87171`  
- Warning: `#fbbf24`
- Neutral: `rgba(255,255,255,0.3)`

---

## 7. Motion

### Principles
- Every animation must communicate meaning (not decorative)
- Respect `prefers-reduced-motion` — all animations should be wrapped or use `@media`
- Enter: ease-out, 200–350ms
- Exit: ease-in, 150–250ms (faster than enter)
- Micro-interactions: 120–180ms

### Named Animations
| Name | Keyframe | Duration | Use |
|------|----------|----------|-----|
| `lp-float` | translateY 0→-10px→0 | 6s ease-in-out infinite | Right panel hero card |
| `lp-pulse` | box-shadow glow expand | 2s ease-in-out infinite | Live indicator dots |
| `fade-up` | opacity 0→1, translateY 24→0 | 0.7s ease-out | Page entrance |
| `mesh-shift` | scale + translateY | 12s ease-in-out alternate | Background mesh |
| `scan-line` | translateY -100% → 400% | 4s linear infinite | Terminal scan effect |

### Stagger delays for list entrances: 0, 120ms, 240ms, 360ms, 480ms

---

## 8. Iconography

- Library: **Lucide React** (stroke, consistent 1.5px weight)
- Size scale: 11px (inline), 14px (button), 16px (nav), 20px (feature card), 24px (section icon), 32px (CTA hero)
- Color: always inherit from text context or explicit semantic colour
- Never use emoji as icons

---

## 9. Page-specific Notes

### Landing page
See `pages/landing.md`  
Dark theme. Full glow-orb background. Glass cards. Gradient headline. Entrance animations.

### Dashboard / App interior
Retains the existing light verix-shell (grid dot pattern, `#f6f5f2` bg).  
Tokens from the existing `globals.css` light system apply.

### Marketplace
Inherits light shell. Agent cards use `verix-panel` style.

---

## 10. Anti-patterns

| Don't | Do instead |
|-------|-----------|
| `bg-gradient-to-r` (Tailwind v3 syntax) | `bg-linear-to-r` (Tailwind v4) or inline style |
| Random box-shadow values | Use named shadow tokens |
| Emoji as structural icons | Lucide SVG icons |
| Warm colours (orange, yellow) as primary brand | Indigo/violet spectrum only |
| Mixing filled + outlined icons at same hierarchy | Pick one per context |
| Animating width/height | Use transform/opacity only |
| `min-h-screen` (broken on mobile safari) | `min-h-dvh` or `min-height: 100svh` |
| `100vh` fixed elements on mobile | Use `svh`/`dvh` units |
| Tailwind shadow classes on dark pages | They are zeroed by global override — use inline CSS |
