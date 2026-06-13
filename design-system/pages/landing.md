# Landing Page — Design Override

Inherits from: `MASTER.md`

## Overrides & Specifics

### Background
- `html, body`: `#05070f` forced via scoped `<style>` tag
- Three glow orbs: indigo (top-center), violet (right), blue (bottom-left)
- Dot grid: `radial-gradient` 1px dots, `rgba(255,255,255,0.07)`, 32×32px grid

### Hero Layout
- Two-column grid: `1fr 480px`, 64px gap, center-aligned
- Minimum height: `calc(100vh - 64px)`
- Responsive breakpoint: stack to single column below 1024px

### Headline Treatment
- Line 1: plain `#fff`
- Line 2: gradient `linear-gradient(135deg, #818cf8, #c4b5fd, #a5b4fc)` clipped to text
- Line 3: `rgba(255,255,255,0.55)` — intentionally dimmer for hierarchy

### Terminal Card (right column)
- `animation: lp-float 6s ease-in-out infinite`
- Rainbow accent bar at bottom: `linear-gradient(90deg, #6366f1, #8b5cf6, #3b82f6, #10b981)`
- Scan line sweep animation on loop

### Entrance Animations
Five staggered fade-up delays: 0.1s, 0.22s, 0.34s, 0.46s, 0.58s

### Nav
- Frosted glass: `backdrop-filter: blur(12px)`, `background: rgba(5,7,15,0.7)`
- Logo: gradient VX mark with `box-shadow: 0 0 20px rgba(99,102,241,0.5)`
