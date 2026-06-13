"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import "./verix-landing.css";

/* ============================================================
   VERIX — verifiable AI execution layer for Stellar DeFi
   Landing page. JSX ported from Verix.html; all interactions
   (cursor, magnetic, reveal, parallax, proof-log stream, metric
   counters, FAQ, marquee, illuminate, console-3d, drift) live in
   one useEffect, scoped to the .verix-landing root, with full
   cleanup so nothing leaks across route changes / Fast Refresh.
   ============================================================ */

export default function Home() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hasHover = window.matchMedia("(hover: hover)").matches;

    // ── cleanup bookkeeping ──────────────────────────────────────────────────
    const rafIds = new Set<number>();
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    const observers: IntersectionObserver[] = [];
    const cleanups: Array<() => void> = [];

    const raf = (fn: FrameRequestCallback): number => {
      const id = requestAnimationFrame(fn);
      rafIds.add(id);
      return id;
    };
    const wait = (fn: () => void, ms: number) => {
      const id = setTimeout(() => { timeouts.delete(id); fn(); }, ms);
      timeouts.add(id);
      return id;
    };
    const on = (
      t: EventTarget,
      ev: string,
      fn: EventListenerOrEventListenerObject,
      opts?: boolean | AddEventListenerOptions
    ) => {
      t.addEventListener(ev, fn, opts);
      cleanups.push(() => t.removeEventListener(ev, fn, opts));
    };

    const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);
    const $$ = <T extends Element = HTMLElement>(sel: string) => Array.from(root.querySelectorAll<T>(sel));

    /* ── 1. CUSTOM CURSOR + MAGNETIC BUTTONS ───────────────────────────────── */
    if (hasHover) {
      const cur = $<HTMLElement>(".cursor");
      const dot = $<HTMLElement>(".cursor-dot");
      if (cur && dot) {
        let mx = window.innerWidth / 2, my = window.innerHeight / 2;
        let cx = mx, cy = my;

        on(window, "mousemove", ((e: MouseEvent) => {
          mx = e.clientX; my = e.clientY;
          dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
        }) as EventListener);
        on(document, "mouseleave", (() => cur.classList.add("is-hidden")) as EventListener);
        on(document, "mouseenter", (() => cur.classList.remove("is-hidden")) as EventListener);

        const loop = () => {
          cx += (mx - cx) * 0.18;
          cy += (my - cy) * 0.18;
          cur.style.transform = `translate(${cx}px, ${cy}px) translate(-50%,-50%)`;
          raf(loop);
        };
        raf(loop);

        const hoverTargets = "[data-cursor], a, button, .feat-visual, input";
        $$(hoverTargets).forEach((el) => {
          const enter = () => cur.classList.add("is-hover");
          const leave = () => cur.classList.remove("is-hover");
          on(el, "mouseenter", enter as EventListener);
          on(el, "mouseleave", leave as EventListener);
        });

        $$<HTMLElement>(".magnetic").forEach((btn) => {
          const strength = 0.35;
          const move = (e: MouseEvent) => {
            const r = btn.getBoundingClientRect();
            const x = e.clientX - (r.left + r.width / 2);
            const y = e.clientY - (r.top + r.height / 2);
            btn.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
          };
          const leave = () => { btn.style.transform = ""; };
          on(btn, "mousemove", move as EventListener);
          on(btn, "mouseleave", leave as EventListener);
        });
      }
    }

    /* ── 2. NAV scroll state ───────────────────────────────────────────────── */
    const nav = $<HTMLElement>("#nav");
    if (nav) {
      const onScrollNav = () => nav.classList.toggle("scrolled", window.scrollY > 40);
      onScrollNav();
      on(window, "scroll", onScrollNav as EventListener, { passive: true });
    }

    /* ── 2b. MOBILE MENU toggle ────────────────────────────────────────────── */
    const navToggle = $<HTMLButtonElement>("#navToggle");
    const mobileMenu = $<HTMLElement>("#mobileMenu");
    if (navToggle && mobileMenu) {
      const setMenu = (open: boolean) => {
        root.classList.toggle("menu-open", open);
        navToggle.setAttribute("aria-expanded", open ? "true" : "false");
        navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      };
      on(navToggle, "click", (() => setMenu(!root.classList.contains("menu-open"))) as EventListener);
      mobileMenu.querySelectorAll("a").forEach((a) =>
        on(a, "click", (() => setMenu(false)) as EventListener)
      );
      on(window, "keydown", ((e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); }) as EventListener);
      on(window, "resize", (() => { if (window.innerWidth > 900) setMenu(false); }) as EventListener);
    }

    /* ── 3. SPLIT TEXT into reveal words ───────────────────────────────────── */
    function splitWords(el: HTMLElement) {
      if (el.dataset.splitProcessed) return;
      el.dataset.splitProcessed = "1";
      const frag = document.createDocumentFragment();
      el.childNodes.forEach((node) => {
        if (node.nodeType === 3) {
          (node.textContent ?? "").split(/(\s+)/).forEach((token) => {
            if (token.trim() === "") { frag.appendChild(document.createTextNode(token)); return; }
            const w = document.createElement("span");
            w.className = "reveal-word";
            const inner = document.createElement("span");
            inner.textContent = token;
            w.appendChild(inner);
            frag.appendChild(w);
          });
        } else if (node.nodeType === 1) {
          const elNode = node as HTMLElement;
          const tag = elNode.tagName.toLowerCase();
          (elNode.textContent ?? "").split(/(\s+)/).forEach((token) => {
            if (token.trim() === "") { frag.appendChild(document.createTextNode(token)); return; }
            const w = document.createElement("span");
            w.className = "reveal-word";
            const inner = document.createElement(tag);
            inner.textContent = token;
            w.appendChild(inner);
            frag.appendChild(w);
          });
        }
      });
      el.innerHTML = "";
      el.appendChild(frag);
    }

    $$<HTMLElement>(".split").forEach(splitWords);

    /* ── 4. REVEAL on scroll (words + fade-up) ─────────────────────────────── */
    function doReveal(el: HTMLElement) {
      if (el.dataset.revealed) return;
      el.dataset.revealed = "1";
      if (el.classList.contains("split")) {
        el.querySelectorAll(".reveal-word").forEach((w, i) =>
          wait(() => w.classList.add("in"), i * 55)
        );
      } else {
        const siblings = el.parentElement
          ? Array.from(el.parentElement.querySelectorAll(":scope > .fade-up"))
          : [];
        const idx = Math.max(0, siblings.indexOf(el));
        wait(() => el.classList.add("in"), idx * 70);
      }
    }

    const revealEls = $$<HTMLElement>(".split, .fade-up");

    // Primary trigger: IntersectionObserver.
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) doReveal(entry.target as HTMLElement); });
    }, { threshold: 0, rootMargin: "0px 0px -8% 0px" });
    observers.push(io);
    revealEls.forEach((el) => io.observe(el));

    // Fallback: rect check driven by an rAF loop — fires reliably on programmatic
    // jump-scrolls or environments that don't emit window scroll events.
    function revealCheck() {
      const vh = window.innerHeight || document.documentElement.clientHeight;
      let remaining = 0;
      for (const el of revealEls) {
        if (el.dataset.revealed) continue;
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.92 && r.bottom > 0) doReveal(el);
        else remaining++;
      }
      return remaining;
    }
    const revealLoop = () => {
      const left = revealCheck();
      if (left > 0) raf(revealLoop);
    };
    raf(revealLoop);
    on(window, "scroll", revealCheck as EventListener, { passive: true });
    on(window, "resize", revealCheck as EventListener, { passive: true });

    /* ── 5. PARALLAX ───────────────────────────────────────────────────────── */
    if (!reduce) {
      const items = $$<HTMLElement>("[data-parallax]").map((el) => ({
        el,
        speed: parseFloat(el.dataset.parallax ?? "") || 0.1,
      }));
      if (items.length) {
        const apply = () => {
          const vh = window.innerHeight;
          const narrow = window.innerWidth <= 768;
          items.forEach(({ el, speed }) => {
            if (narrow && el.classList.contains("hero-orb")) { el.style.transform = ""; return; }
            const r = el.getBoundingClientRect();
            const center = r.top + r.height / 2;
            const off = (center - vh / 2) * -speed;
            if (el.classList.contains("hero-orb")) {
              el.style.transform = `translateY(calc(-50% + ${off.toFixed(1)}px))`;
            } else {
              el.style.transform = `translate(-50%, calc(-50% + ${off.toFixed(1)}px))`;
            }
          });
        };
        const pRaf = () => { apply(); raf(pRaf); };
        raf(pRaf);
      }
    }

    /* ── 5b. FEATURE ROWS — scroll-reveal (card lift + scan + index rule),
            cursor 3D tilt + sheen, and scroll-linked image drift. ───────────── */
    const featRows = $$<HTMLElement>("[data-feat-row]");
    if (featRows.length) {
      // (a) Scroll reveal: add .is-in to the row when it enters. CSS handles the
      //     card lift/fade, the one-shot scan sweep, and the index rule draw-in.
      const rowIO = new IntersectionObserver((entries, obs) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          (e.target as HTMLElement).classList.add("is-in");
          obs.unobserve(e.target);
        });
      }, { threshold: 0.2, rootMargin: "0px 0px -8% 0px" });
      observers.push(rowIO);
      featRows.forEach((r) => rowIO.observe(r));

      // (b) Cursor-tracked 3D tilt + pointer-following sheen (desktop hover only).
      if (hasHover && !reduce) {
        $$<HTMLElement>(".feat-visual[data-tilt]").forEach((card) => {
          const inner = card.querySelector<HTMLElement>(".feat-inner");
          const sheen = card.querySelector<HTMLElement>(".feat-sheen");
          if (!inner) return;
          const MAX = 6; // deg
          const move = (e: MouseEvent) => {
            const r = card.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width;
            const py = (e.clientY - r.top) / r.height;
            const rx = (0.5 - py) * MAX * 2;
            const ry = (px - 0.5) * MAX * 2;
            inner.style.transform = `perspective(1100px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
            if (sheen) {
              sheen.style.background = `radial-gradient(420px circle at ${(px * 100).toFixed(0)}% ${(py * 100).toFixed(0)}%, rgba(155,140,255,0.2), transparent 60%)`;
              sheen.style.opacity = "1";
            }
          };
          const leave = () => {
            inner.style.transform = "";
            if (sheen) sheen.style.opacity = "0";
          };
          on(card, "mousemove", move as EventListener);
          on(card, "mouseleave", leave as EventListener);
        });
      }

      // (c) Scroll-linked vertical drift on each card image (opposite to scroll)
      //     for parallax depth. The .feat-img has 12% overscan to hide the gap.
      if (!reduce) {
        const imgs = $$<HTMLElement>(".feat-visual[data-tilt] .feat-img");
        if (imgs.length) {
          const driftLoop = () => {
            const vh = window.innerHeight || document.documentElement.clientHeight;
            imgs.forEach((img) => {
              const r = img.getBoundingClientRect();
              if (r.bottom < 0 || r.top > vh) return;
              const center = r.top + r.height / 2;
              const off = ((center - vh / 2) / vh) * -22; // px
              img.style.setProperty("--drift", `${off.toFixed(1)}px`);
            });
            raf(driftLoop);
          };
          raf(driftLoop);
        }
      }
    }

    /* ── 6. STREAMING PROOF LOG (console showcase) ─────────────────────────── */
    const log = $<HTMLElement>("#proof-log");
    const traceCount = $<HTMLElement>("#trace-count");
    if (log) {
      log.replaceChildren(); // clean restream on remount
      const lines = [
        { ts: "00.04", msg: "mandate-0x9f4c compiled", hash: "policy 0x7af3…e91c", ok: true },
        { ts: "00.11", msg: "bounds locked · slippage ≤ 0.30% · gas ≤ 15 XLM", ok: true },
        { ts: "00.19", msg: "swap-agent → route USDC/yUSDC via Soroswap", hash: "tx 0x2c8d…41ab", ok: false },
        { ts: "00.26", msg: "fill 0.21% slippage — within bound", ok: true },
        { ts: "00.33", msg: "lend-agent → supply 250,000 to Blend pool", hash: "tx 0x9e10…77ff", ok: false },
        { ts: "00.41", msg: "position confirmed · APY 6.84%", ok: true },
        { ts: "00.48", msg: "proof-agent → hashing action trail", hash: "root 0xb3c1…0d2e", ok: false },
        { ts: "00.52", msg: "proof committed to Soroban · block 4,182,907", ok: true },
      ];

      const startStream = () => {
        if (log.dataset.streamStarted) return;
        log.dataset.streamStarted = "1";
        let i = 0;
        const push = () => {
          if (i >= lines.length) {
            if (traceCount) traceCount.textContent = `${lines.length} actions · sealed`;
            return;
          }
          const l = lines[i];
          const rowEl = document.createElement("div");
          rowEl.className = "proof-line" + (l.ok ? " ok" : "");
          rowEl.innerHTML = `<span class="ts">${l.ts}</span><span class="msg">${l.msg}${l.hash ? ' · <span class="hash">' + l.hash + "</span>" : ""}</span>`;
          log.appendChild(rowEl);
          raf(() => rowEl.classList.add("in"));
          if (traceCount) traceCount.textContent = `${i + 1}/${lines.length} actions`;
          i++;
          wait(push, 620);
        };
        push();
      };

      const logIO = new IntersectionObserver((entries, obs) => {
        entries.forEach((e) => { if (e.isIntersecting) { startStream(); obs.disconnect(); } });
      }, { threshold: 0.3 });
      observers.push(logIO);
      logIO.observe(log);
      cleanups.push(() => { delete log.dataset.streamStarted; });
    }

    /* ── 7. METRIC COUNTERS ────────────────────────────────────────────────── */
    const countIO = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        const target = parseFloat(el.dataset.count ?? "0");
        const dec = parseInt(el.dataset.dec ?? "0", 10);
        const suffix = el.dataset.suffix ?? "";
        const isZero = el.dataset.zero === "1";
        const dur = 1400;
        const start = performance.now();
        const uSpan = suffix ? `<span class="u">${suffix}</span>` : "";

        if (isZero) {
          el.innerHTML = `0${uSpan}`;
        } else {
          const tick = (now: number) => {
            const p = Math.min((now - start) / dur, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            const val = (target * eased).toFixed(dec);
            el.innerHTML = `${val}${uSpan}`;
            if (p < 1) raf(tick);
            else el.innerHTML = `${target.toFixed(dec)}${uSpan}`;
          };
          raf(tick);
        }
        obs.unobserve(el);
      });
    }, { threshold: 0.5 });
    observers.push(countIO);
    $$<HTMLElement>("[data-count]").forEach((el) => countIO.observe(el));

    /* ── 8. FAQ accordion ──────────────────────────────────────────────────── */
    $$<HTMLElement>(".faq-item").forEach((item) => {
      const q = item.querySelector<HTMLElement>(".faq-q");
      const a = item.querySelector<HTMLElement>(".faq-a");
      if (!q || !a) return;
      const handler = () => {
        const open = item.classList.contains("open");
        root.querySelectorAll<HTMLElement>(".faq-item.open").forEach((other) => {
          if (other !== item) {
            other.classList.remove("open");
            const oa = other.querySelector<HTMLElement>(".faq-a");
            if (oa) oa.style.maxHeight = "";
          }
        });
        if (open) { item.classList.remove("open"); a.style.maxHeight = ""; }
        else { item.classList.add("open"); a.style.maxHeight = a.scrollHeight + "px"; }
      };
      on(q, "click", handler as EventListener);
    });

    /* ── 9. Email form (no backend — UX confirmation) ──────────────────────── */
    const form = $<HTMLFormElement>("#access-form");
    if (form) {
      const submit = (e: Event) => {
        e.preventDefault();
        const label = $<HTMLElement>("#access-label");
        if (label) label.innerHTML = "You’re on the list ✓";
        const input = form.querySelector("input");
        if (input) input.value = "";
        wait(() => { if (label) label.innerHTML = 'Get Early Access <span class="arr">→</span>'; }, 2600);
      };
      on(form, "submit", submit as EventListener);
    }

    /* ── 11. SCROLL ENGINE — illuminate · console-3d · drift · marquee · scrub ── */
    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

    // ── scroll-scrubbed video canvas (thesis vault reveal) ──────────────────────
    // Preload all extracted frames, then draw the frame that maps to how far the
    // user has scrolled through the section's tall track. Drawn inside scrollEngine.
    const scrubSection = $<HTMLElement>("[data-scrub-section]");
    const scrubCanvas = $<HTMLCanvasElement>("[data-scrub-canvas]");
    const scrubFrames: HTMLImageElement[] = [];
    let lastFrameDrawn = -1;
    // Buttery scrub (Apple-style): smooth the SCROLL VALUE (lerp toward
    // window.scrollY), then map the frame index 1:1 off that smoothed value.
    // The frame index is NEVER eased — that adds lag. Smoothing the input +
    // dense frames (150) gives continuous, momentum-like motion.
    let smoothScroll = window.scrollY;
    const scrubCtx = scrubCanvas?.getContext("2d") ?? null;
    if (scrubSection && scrubCanvas && scrubCtx) {
      const total = parseInt(scrubSection.dataset.frames ?? "92", 10);
      // Size the canvas buffer to its on-screen box (×DPR) so the full-bleed
      // cover render stays crisp instead of being CSS-upscaled from 850×720.
      const sizeCanvas = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = scrubCanvas.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width * dpr));
        const h = Math.max(1, Math.round(rect.height * dpr));
        if (scrubCanvas.width !== w || scrubCanvas.height !== h) {
          scrubCanvas.width = w; scrubCanvas.height = h;
        }
      };
      const drawFrame = (idx: number) => {
        const img = scrubFrames[idx];
        if (!img || !img.complete || img.naturalWidth === 0) return;
        // cover-fit the frame into the canvas pixel box
        const cw = scrubCanvas.width, ch = scrubCanvas.height;
        const ir = img.naturalWidth / img.naturalHeight;
        const cr = cw / ch;
        let dw = cw, dh = ch, dx = 0, dy = 0;
        if (ir > cr) { dh = ch; dw = ch * ir; dx = (cw - dw) / 2; }
        else { dw = cw; dh = cw / ir; dy = (ch - dh) / 2; }
        scrubCtx.clearRect(0, 0, cw, ch);
        scrubCtx.drawImage(img, dx, dy, dw, dh);
        lastFrameDrawn = idx;
      };
      sizeCanvas();
      on(window, "resize", (() => { sizeCanvas(); if (lastFrameDrawn >= 0) { const i = lastFrameDrawn; lastFrameDrawn = -1; drawFrame(i); } }) as EventListener);
      // preload frames (zero-indexed frame_000..frame_{total-1}). Decode each
      // ahead of time so the draw is synchronous (no decode-on-draw jank).
      // window.Image is the DOM ctor (module-scope `Image` is next/image's).
      for (let i = 0; i < total; i++) {
        const img = new window.Image();
        const n = String(i).padStart(3, "0");
        img.src = `/sphere/frame_${n}.jpg`;
        img.decode?.().catch(() => {});
        if (i === 0) img.onload = () => drawFrame(0);
        scrubFrames.push(img);
      }
      // ── travelling text mover ─────────────────────────────────────────────
      const mover = scrubSection.querySelector<HTMLElement>("[data-scrub-mover]");
      const copyHost = scrubSection.querySelector<HTMLElement>("[data-scrub-copy]");
      // copy + the corner each waypoint rests at, in path order. React renders
      // the spans as light-DOM children (not into template.content), so query
      // descendants directly.
      const copyByCorner: Record<string, string> = {};
      if (copyHost) {
        copyHost.querySelectorAll("span[data-corner]").forEach((s) => {
          const c = s.getAttribute("data-corner");
          if (c) copyByCorner[c] = s.textContent ?? "";
        });
      }
      // The 4 path waypoints, in order. Each: the screen corner + its copy.
      const PATH = [
        { corner: "tl", text: copyByCorner.tl ?? "" },
        { corner: "bl", text: copyByCorner.bl ?? "" },
        { corner: "br", text: copyByCorner.br ?? "" },
        { corner: "tr", text: copyByCorner.tr ?? "" },
      ];
      // corner → {x,y} anchor as a fraction of the stage box (computed per frame
      // so it tracks resize). Returns top-left position for the element.
      const cornerPos = (corner: string, sw: number, sh: number, mw: number, mh: number) => {
        const padX = sw * 0.05, padY = sh * 0.14;       // edge insets
        const left = corner.includes("l");
        const top = corner.includes("t");
        const x = left ? padX : sw - mw - padX;
        const y = top ? padY : sh - mh - padY;
        return { x, y, alignRight: !left };
      };
      let lastMoverText = "";
      // Timeline: the mover occupies scroll range [START,END]; within it, time is
      // split into per-segment "hold then travel" so the text RESTS at a corner
      // then MOVES (visible) in a straight line to the next corner.
      const M_START = 0.06, M_END = 0.97;

      // Gentle settle zones so the morph doesn't snap at the very start/end:
      // a short hold at each extreme, the continuous sphere flow scrubbed across
      // the long middle. Light holds keep the motion feeling alive (this is a
      // continuous animation, not a one-shot reveal).
      const HOLD_IN = 0.06, HOLD_OUT = 0.94;
      const frameProgress = (p: number) => {
        if (p <= HOLD_IN) return 0;
        if (p >= HOLD_OUT) return 1;
        return (p - HOLD_IN) / (HOLD_OUT - HOLD_IN);
      };

      // expose the updater to scrollEngine via a closure-scoped fn
      (scrubSection as HTMLElement & { __drawScrub?: () => void }).__drawScrub = () => {
        // Smooth the SCROLL VALUE (not the frame). lerp 0.16 = barely-there ease
        // that reads as momentum; the page itself scrolls natively (no hijack).
        const sy = window.scrollY;
        smoothScroll += (sy - smoothScroll) * 0.16;
        if (Math.abs(sy - smoothScroll) < 0.4) smoothScroll = sy;

        // section geometry from the smoothed scroll value (doc-absolute top).
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const r = scrubSection.getBoundingClientRect();
        const sectionTop = r.top + sy;          // doc-absolute top (raw scroll)
        const travel = r.height - vh;
        // progress along the pin, derived from the SMOOTHED scroll position
        const p = travel > 0 ? clamp((smoothScroll - sectionTop) / travel, 0, 1) : 0;

        // map frame index 1:1 off the smoothed progress (paced through holds)
        const fp = frameProgress(p);
        const idx = Math.min(total - 1, Math.max(0, Math.round(fp * (total - 1))));
        if (idx !== lastFrameDrawn) drawFrame(idx);

        // ── ONE text element physically travelling the corner path ──────────
        // The text RESTS at a corner (showing that corner's copy), then MOVES in
        // a straight line to the next corner while staying fully visible. Copy
        // swaps only during the brief moment it's between corners (lowest opacity)
        // so you never see a word change mid-air.
        if (mover && PATH.length >= 2) {
          const ease = (t: number) => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; // easeInOutCubic
          const segs = PATH.length - 1;                  // 3 travel segments
          const stage = scrubSection.querySelector<HTMLElement>(".thesis-stage");
          const sw = stage?.clientWidth ?? window.innerWidth;
          const sh = stage?.clientHeight ?? window.innerHeight;
          const mw = mover.offsetWidth || 360;
          const mh = mover.offsetHeight || 80;

          // local timeline 0→1 across the mover's scroll range
          const mt = clamp((p - M_START) / (M_END - M_START), 0, 1);
          // total units = segs travels + (segs+1) holds. Holds are longer than
          // travels so the text dwells (readable) and moves crisply between.
          const HOLD = 1.6, TRAVEL = 1.0;
          const unit = segs * TRAVEL + (segs + 1) * HOLD;
          let acc = mt * unit;                           // consume time units

          let fromIdx = 0, localT = 0, moving = false;
          // walk: hold(0) travel(0) hold(1) travel(1) … hold(segs)
          for (let i = 0; i <= segs; i++) {
            if (acc < HOLD) { fromIdx = i; localT = 0; moving = false; break; }
            acc -= HOLD;
            if (i < segs) {
              if (acc < TRAVEL) { fromIdx = i; localT = acc / TRAVEL; moving = true; break; }
              acc -= TRAVEL;
            } else { fromIdx = segs; localT = 0; moving = false; }
          }

          const from = PATH[fromIdx];
          const to = PATH[Math.min(fromIdx + 1, PATH.length - 1)];
          const a = cornerPos(from.corner, sw, sh, mw, mh);
          const b = cornerPos(to.corner, sw, sh, mw, mh);
          const t = moving ? ease(localT) : 0;
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;

          // opacity dips in the middle of a travel so the copy swap is unseen;
          // full + steady while resting at a corner.
          const o = moving ? 0.25 + 0.75 * Math.abs(localT - 0.5) * 2 : 1;
          // show the destination's copy once past the travel midpoint, else origin's
          const text = moving && localT > 0.5 ? to.text : from.text;
          // align right when resting/heading to a right-side corner
          const right = (moving ? (localT > 0.5 ? b : a) : a).alignRight;

          if (text !== lastMoverText) { mover.textContent = text; lastMoverText = text; }
          mover.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
          mover.style.opacity = o.toFixed(3);
          mover.style.textAlign = right ? "right" : "left";
        }
      };
    }

    // word-illuminate (Sohub fill)
    const illum = $<HTMLElement>("[data-illuminate]");
    let illumWords: HTMLElement[] = [];
    if (illum) {
      if (!illum.dataset.illuminateProcessed) {
        illum.dataset.illuminateProcessed = "1";
        const out = document.createDocumentFragment();
        illum.childNodes.forEach((node) => {
          const accent = node.nodeType === 1 && (node as HTMLElement).classList.contains("accent");
          const text = node.textContent ?? "";
          text.split(/(\s+)/).forEach((tok) => {
            if (tok === "") return;
            if (/^\s+$/.test(tok)) { out.appendChild(document.createTextNode(tok)); return; }
            const w = document.createElement("span");
            w.className = "w" + (accent ? " accent" : "");
            w.textContent = tok;
            out.appendChild(w);
          });
        });
        illum.innerHTML = "";
        illum.appendChild(out);
      }
      illumWords = Array.from(illum.querySelectorAll<HTMLElement>(".w"));
    }

    // marquee tracks
    const marquees = $$<HTMLElement>("[data-marquee]").map((el) => ({
      el,
      base: parseFloat(el.dataset.speed ?? "") || 0.05,
      reverse: el.dataset.reverse === "1",
      x: 0,
      w: 0,
    }));
    const measureMarquees = () => {
      marquees.forEach((m) => {
        const t = m.el.querySelector<HTMLElement>(".marquee-track");
        m.w = t ? t.offsetWidth : 0;
      });
    };
    measureMarquees();
    on(window, "resize", measureMarquees as EventListener);

    const drift = $<HTMLElement>("[data-drift]");
    const console3d = $<HTMLElement>("[data-console3d]");

    let lastY = window.scrollY;
    const scrollEngine = () => {
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const y = window.scrollY;
      const dy = y - lastY; lastY = y;

      // scroll-scrubbed vault canvas
      const drawScrub = (scrubSection as (HTMLElement & { __drawScrub?: () => void }) | null)?.__drawScrub;
      if (drawScrub) drawScrub();

      if (illumWords.length && illum) {
        const r = illum.getBoundingClientRect();
        const p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.42), 0, 1);
        const lit = p * illumWords.length;
        illumWords.forEach((w, i) => {
          w.style.opacity = clamp(lit - i + 0.5, 0.14, 1).toFixed(3);
        });
      }

      if (console3d) {
        if (window.innerWidth <= 768) {
          console3d.style.transform = "";
          console3d.style.opacity = "";
        } else {
          const r = console3d.getBoundingClientRect();
          const p = clamp((vh - r.top) / (vh * 0.7), 0, 1);
          const rot = (1 - p) * 12;
          const ty = (1 - p) * 60;
          const sc = 0.94 + p * 0.06;
          console3d.style.transform = `rotateX(${rot.toFixed(2)}deg) translateY(${ty.toFixed(1)}px) scale(${sc.toFixed(3)})`;
          console3d.style.opacity = clamp(0.3 + p, 0.3, 1).toFixed(2);
        }
      }

      if (drift) {
        const band = drift.parentElement;
        if (band) {
          const r = band.getBoundingClientRect();
          if (r.bottom > 0 && r.top < vh) {
            const speed = parseFloat(drift.dataset.speed ?? "") || 0.12;
            const center = r.top + r.height / 2;
            const off = (center - vh / 2) * -speed * 6;
            drift.style.transform = `translateX(${off.toFixed(1)}px)`;
          }
        }
      }

      marquees.forEach((m) => {
        if (!m.w) return;
        const dir = m.reverse ? 1 : -1;
        m.x += dir * Math.abs(m.base) * 2.2 + dy * m.base * 0.6;
        if (m.x <= -m.w) m.x += m.w;
        if (m.x >= 0) m.x -= m.w;
        m.el.style.transform = `translateX(${m.x.toFixed(1)}px)`;
      });

      raf(scrollEngine);
    };
    if (!reduce) raf(scrollEngine);
    else illumWords.forEach((w) => (w.style.opacity = "1"));

    /* ── 12. Smooth anchor scroll ──────────────────────────────────────────── */
    $$<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
      const click = (e: Event) => {
        const id = a.getAttribute("href") ?? "";
        if (id.length < 2) return;
        const t = root.querySelector(id);
        if (!t) return;
        e.preventDefault();
        window.scrollTo({
          top: t.getBoundingClientRect().top + window.scrollY - 70,
          behavior: reduce ? "auto" : "smooth",
        });
      };
      on(a, "click", click as EventListener);
    });

    // ── teardown ─────────────────────────────────────────────────────────────
    return () => {
      rafIds.forEach((id) => cancelAnimationFrame(id));
      timeouts.forEach((id) => clearTimeout(id));
      observers.forEach((o) => o.disconnect());
      cleanups.forEach((fn) => fn());
      root.classList.remove("menu-open");
    };
  }, []);

  return (
    <div className="verix-landing" ref={rootRef}>
      <div className="grain" />
      <div className="cursor" />
      <div className="cursor-dot" />

      {/* ============ NAV ============ */}
      <nav className="nav" id="nav">
        <a className="nav-logo" href="#top" aria-label="Verix">
          <Image className="nav-logo-img" src="/logo-mark.png" alt="Verix" width={976} height={344} priority />
        </a>
        <div className="nav-links">
          <a href="#features" data-cursor>Protocol</a>
          <a href="#how" data-cursor>How it works</a>
          <a href="#console" data-cursor>Console</a>
          <a href="#pricing" data-cursor>Pricing</a>
          <a href="#faq" data-cursor>FAQ</a>
        </div>
        <div className="nav-right">
          <a className="btn btn-primary magnetic nav-cta" href="#access" data-cursor><span className="btn-label">Get Early Access <span className="arr">→</span></span></a>
          <button className="nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false"><span /><span /><span /></button>
        </div>
      </nav>

      {/* ============ MOBILE MENU ============ */}
      <div className="mobile-menu" id="mobileMenu">
        <nav className="mobile-menu-links">
          <a href="#features">Protocol</a>
          <a href="#how">How it works</a>
          <a href="#console">Console</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a className="btn btn-primary" href="#access"><span className="btn-label">Get Early Access <span className="arr">→</span></span></a>
        <div className="mobile-menu-foot">VERIFIABLE EXECUTION · SOROBAN COMMITTED</div>
      </div>

      {/* ============ HERO ============ */}
      <header className="hero" id="top">
        <div className="hero-glow" />
        <div className="hero-grid-lines" />

        <div className="hero-inner">
          <div className="hero-kicker kicker">Verifiable AI execution layer · Stellar / Soroban</div>

          <h1 className="hero-title split">
            Execution you can <em>prove.</em>
          </h1>

          <div className="hero-orb" data-parallax="0.12" />

          <p className="hero-sub fade-up">
            Submit a mandate — swap, supply to a lending pool, settle a cross-border payment.
            Specialized AI agents execute it on-chain, while a cryptographic proof commits every
            action to Soroban. You don&apos;t just get an output. You get proof the agent stayed inside
            your parameters.
          </p>

          <div className="hero-cta fade-up">
            <a className="btn btn-primary magnetic" href="#access" data-cursor><span className="btn-label">Get Early Access <span className="arr">→</span></span></a>
            <a className="btn btn-ghost magnetic" href="#console" data-cursor><span className="btn-label">See the proof</span></a>
          </div>
        </div>

        <div className="hero-meta">
          <span className="hero-scroll"><span className="scroll-line" />Scroll</span>
          <div className="hero-stats">
            <div className="hs"><b>100%</b><span>actions proven</span></div>
            <div className="hs"><b>~5s</b><span>finality on Soroban</span></div>
            <div className="hs"><b>0</b><span>blind trust</span></div>
          </div>
        </div>
      </header>

      {/* ============ LOGO CLOUD ============ */}
      <section className="logos mobile-hide">
        <div className="logos-inner">
          <p className="logos-label fade-up">Composes with the Stellar DeFi stack</p>
          <div className="logos-row">
            <span className="lg fade-up">Soroban</span>
            <span className="lg fade-up">Blend</span>
            <span className="lg fade-up">Soroswap</span>
            <span className="lg fade-up">Aquarius</span>
            <span className="lg fade-up">StellarX</span>
            <span className="lg fade-up">Phoenix</span>
            <span className="lg fade-up">Freighter</span>
          </div>
        </div>
      </section>

      {/* ============ THESIS — "Specimen": the vault, examined ============ */}
      <section className="thesis" id="manifesto" data-scrub-section data-frames="150">
        <div className="thesis-track">
          <div className="thesis-stage">
            {/* full-bleed scrubbed video */}
            <canvas className="thesis-canvas" data-scrub-canvas width={1280} height={720} aria-hidden="true" />
            {/* left scrim — guarantees text legibility over the video's dark zone */}
            <div className="thesis-scrim" />

            {/* quiet kicker, top-left, static */}
            <span className="thesis-kicker">Verix · proof</span>

            {/* ONE text element that physically travels a straight-line path
                between corners (TL → BL → BR → TR), staying visible the whole
                way and swapping its words only at each waypoint. JS sets its
                position + content. */}
            <p className="thesis-mover" data-scrub-mover />
            {/* copy source for the mover (hidden; read by JS at mount) */}
            <div data-scrub-copy hidden>
              <span data-corner="tl">AI agents are about to move real money.</span>
              <span data-corner="bl">The question isn&apos;t whether they can act.</span>
              <span data-corner="br">It&apos;s whether you can prove they stayed inside the lines.</span>
              <span data-corner="tr">Verix makes every action verifiable.</span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section className="section features" id="features">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="section-eyebrow kicker fade-up">The protocol</div>
              <h2 className="section-title split">Agents act. The chain remembers <em>everything.</em></h2>
            </div>
            <p className="section-lead fade-up">Verix sits between intent and execution — turning natural-language mandates into bounded, auditable on-chain actions.</p>
          </div>

          <div className="feature-grid" style={{ marginTop: "clamp(40px,7vh,90px)" }}>

            <div className="feature-row" data-feat-row>
              <div className="feat-text">
                <div className="feat-index"><span className="fi-rule" />01 / MANDATE</div>
                <h3 className="feat-title split">Intent in. <em>Bounds enforced.</em></h3>
                <p className="feat-body">Write what you want in plain language and set hard constraints — max slippage, gas ceiling, allowed protocols, time windows. Verix compiles the mandate into a policy the agents physically cannot exceed.</p>
                <div className="feat-list">
                  <div className="fi fade-up">Declarative limits, not vibes</div>
                  <div className="fi fade-up">Per-mandate spend &amp; slippage caps</div>
                  <div className="fi fade-up">Protocol allow-lists, enforced at runtime</div>
                </div>
              </div>
              <div className="feat-visual" data-cursor data-tilt>
                <div className="feat-inner">
                  <Image className="feat-img" src="/image1.png" alt="Mandate policy editor compiling intent into enforceable constraints" fill sizes="(max-width: 880px) 100vw, 45vw" />
                  <span className="feat-scan" />
                  <span className="feat-sheen" />
                  <span className="ph-label">mandate.policy → compiled</span>
                </div>
              </div>
            </div>

            <div className="feature-row flip" data-feat-row>
              <div className="feat-text">
                <div className="feat-index"><span className="fi-rule" />02 / EXECUTION</div>
                <h3 className="feat-title split">Specialized agents, <em>real transactions.</em></h3>
                <p className="feat-body">A router decomposes the mandate and dispatches it to purpose-built agents — swap, lend, bridge, settle. Each signs and submits real Soroban transactions, coordinating routes for best execution.</p>
                <div className="feat-list">
                  <div className="fi fade-up">Best-route swaps across DEXs</div>
                  <div className="fi fade-up">Lending &amp; yield orchestration</div>
                  <div className="fi fade-up">Cross-border settlement via anchors</div>
                </div>
              </div>
              <div className="feat-visual" data-cursor data-tilt>
                <div className="feat-inner">
                  <Image className="feat-img" src="/image2.png" alt="Router dispatching to specialized swap, lend, and settle agents" fill sizes="(max-width: 880px) 100vw, 45vw" />
                  <span className="feat-scan" />
                  <span className="feat-sheen" />
                  <span className="ph-label">router → swap · lend · settle</span>
                </div>
              </div>
            </div>

            <div className="feature-row" data-feat-row>
              <div className="feat-text">
                <div className="feat-index"><span className="fi-rule" />03 / PROOF</div>
                <h3 className="feat-title split">A receipt you can <em>verify yourself.</em></h3>
                <p className="feat-body">Every decision, parameter and transaction is hashed into a proof committed to Soroban. Anyone can replay it against the original mandate and confirm the agent never stepped outside the lines — no trust required.</p>
                <div className="feat-list">
                  <div className="fi fade-up">Cryptographic action-by-action trail</div>
                  <div className="fi fade-up">On-chain commitment, independently checkable</div>
                  <div className="fi fade-up">Exportable for audit &amp; compliance</div>
                </div>
              </div>
              <div className="feat-visual" data-cursor data-tilt>
                <div className="feat-inner">
                  <Image className="feat-img" src="/image3.png" alt="Zero-knowledge proof verification receipt committed on-chain" fill sizes="(max-width: 880px) 100vw, 45vw" />
                  <span className="feat-scan" />
                  <span className="feat-sheen" />
                  <span className="ph-label">proof.commit → soroban</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="section steps" id="how">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="section-eyebrow kicker fade-up">How it works</div>
              <h2 className="section-title split">Three steps. <em>Zero blind trust.</em></h2>
            </div>
            <p className="section-lead fade-up">From a sentence to a settled, provable position in seconds.</p>
          </div>

          <div className="stack">
            <div className="stack-card" style={{ top: "calc(100px + 0 * 26px)", ["--i" as string]: 0 } as React.CSSProperties}>
              <div className="sc-no">01</div>
              <div className="sc-main">
                <h3>Write your mandate</h3>
                <p>Describe the outcome in plain language and pin the boundaries — slippage, gas, protocols, time. Verix compiles intent and limits into an enforceable execution policy.</p>
              </div>
              <div className="sc-tag">→ policy compiled</div>
              <div className="sc-orb" />
            </div>
            <div className="stack-card" style={{ top: "calc(100px + 1 * 26px)", ["--i" as string]: 1 } as React.CSSProperties}>
              <div className="sc-no">02</div>
              <div className="sc-main">
                <h3>Agents execute on-chain</h3>
                <p>Specialized agents route, sign and submit real Soroban transactions — coordinating for best execution while staying provably within every constraint you set.</p>
              </div>
              <div className="sc-tag">→ transactions live</div>
              <div className="sc-orb" style={{ background: "radial-gradient(40% 36% at 36% 30%, #fff, transparent 44%), radial-gradient(80% 80% at 60% 70%, var(--m-pink), transparent 70%), radial-gradient(120% 120% at 50% 50%, var(--accent), #1b1850 80%)" }} />
            </div>
            <div className="stack-card" style={{ top: "calc(100px + 2 * 26px)", ["--i" as string]: 2 } as React.CSSProperties}>
              <div className="sc-no">03</div>
              <div className="sc-main">
                <h3>Proof commits to Soroban</h3>
                <p>A cryptographic record of every action lands on-chain. Replay it any time against your original mandate to verify the agent never crossed a single line.</p>
              </div>
              <div className="sc-tag">→ proof verifiable</div>
              <div className="sc-orb" style={{ background: "radial-gradient(40% 36% at 36% 30%, #fff, transparent 44%), radial-gradient(80% 80% at 60% 70%, var(--m-teal), transparent 70%), radial-gradient(120% 120% at 50% 50%, var(--m-blue), #16243e 80%)" }} />
            </div>
          </div>
        </div>
      </section>

      {/* ============ MARQUEE TAPE ============ */}
      <div className="marquee-wrap" aria-hidden="true">
        <div className="marquee-band">
          <div className="marquee" data-marquee data-speed="-0.06">
            <div className="marquee-track">
              <span>Verifiable execution</span><span className="dot" /><span>Proof on Soroban</span><span className="dot" /><span>Bounded agents</span><span className="dot" /><span>No blind trust</span><span className="dot" />
            </div>
            <div className="marquee-track">
              <span>Verifiable execution</span><span className="dot" /><span>Proof on Soroban</span><span className="dot" /><span>Bounded agents</span><span className="dot" /><span>No blind trust</span><span className="dot" />
            </div>
          </div>
        </div>
        <div className="marquee-band alt mobile-hide">
          <div className="marquee" data-marquee data-speed="0.06" data-reverse="1">
            <div className="marquee-track">
              <span>Swap</span><span className="dot" /><span>Lend</span><span className="dot" /><span>Settle cross-border</span><span className="dot" /><span>Rebalance yield</span><span className="dot" />
            </div>
            <div className="marquee-track">
              <span>Swap</span><span className="dot" /><span>Lend</span><span className="dot" /><span>Settle cross-border</span><span className="dot" /><span>Rebalance yield</span><span className="dot" />
            </div>
          </div>
        </div>
      </div>

      {/* ============ CONSOLE SHOWCASE ============ */}
      <section className="section console-sec" id="console">
        <div className="console-glow" />
        <div className="wrap">
          <div className="console-head">
            <div className="section-eyebrow kicker no-rule fade-up" style={{ justifyContent: "center" }}>Live console</div>
            <h2 className="section-title split">Watch a mandate become a proof.</h2>
            <p className="section-lead fade-up">A real execution trace: parameters locked, agents dispatched, every action hashed and committed.</p>
          </div>

          <div className="console-stage">
            <div className="console" data-console3d>
              <div className="console-bar">
                <div className="console-dots"><i /><i /><i /></div>
                <span className="path">verix · console / mandate-0x9f4c</span>
                <span className="status"><span className="dot" />Executing</span>
              </div>

              <div className="console-body">
                <div className="console-left">
                  <div className="panel-label">Mandate</div>
                  <div className="mandate">
                    <div className="mandate-row"><span className="k">action</span><span className="v">rebalance · USDC → yield</span></div>
                    <div className="mandate-row"><span className="k">amount</span><span className="v">250,000 USDC</span></div>
                    <div className="mandate-row"><span className="k">max slippage</span><span className="v hl">0.30%</span></div>
                    <div className="mandate-row"><span className="k">protocols</span><span className="v">Blend, Soroswap</span></div>
                    <div className="mandate-row"><span className="k">gas ceiling</span><span className="v hl">15 XLM</span></div>
                    <div className="mandate-row"><span className="k">window</span><span className="v">≤ 60s</span></div>
                  </div>

                  <div className="agents">
                    <div className="agent"><span className="a-ico">S</span><span className="a-name">Swap agent</span><span className="a-state">active</span></div>
                    <div className="agent"><span className="a-ico">L</span><span className="a-name">Lend agent</span><span className="a-state">active</span></div>
                    <div className="agent"><span className="a-ico">P</span><span className="a-name">Proof agent</span><span className="a-state queued">queued</span></div>
                  </div>
                </div>

                <div className="console-right">
                  <div className="panel-label"><span>Execution trace</span><span id="trace-count">—</span></div>
                  <div className="proof-log" id="proof-log" />
                  <div className="proof-footer">
                    <span className="seal"><span className="ring" /> Proof committed · block 4,182,907</span>
                    <a className="verify-link" href="#access" data-cursor>Verify on-chain →</a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ METRICS ============ */}
      <section className="section metrics">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="section-eyebrow kicker fade-up">By the numbers</div>
              <h2 className="section-title split">Built for capital that <em>can&apos;t be wrong.</em></h2>
            </div>
          </div>
          <div className="metrics-grid">
            <div className="metric fade-up"><div className="m-num" data-count="100" data-suffix="%">0<span className="u">%</span></div><div className="m-label">of agent actions committed as on-chain proof</div></div>
            <div className="metric fade-up"><div className="m-num" data-count="4.9" data-suffix="s" data-dec="1">0<span className="u">s</span></div><div className="m-label">median mandate-to-finality on Soroban</div></div>
            <div className="metric fade-up"><div className="m-num" data-count="38" data-suffix="">0</div><div className="m-label">DeFi primitives reachable through one mandate</div></div>
            <div className="metric fade-up"><div className="m-num" data-count="0" data-suffix="" data-zero="1">0</div><div className="m-label">parameter breaches across testnet runs</div></div>
          </div>
        </div>
      </section>

      {/* ============ TESTIMONIALS ============ */}
      <section className="section quotes mobile-hide">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="section-eyebrow kicker fade-up">Early signal</div>
              <h2 className="section-title split">Operators who refuse to <em>guess.</em></h2>
            </div>
          </div>
          <div className="quotes-grid">
            <div className="quote fade-up">
              <div className="q-mark">&ldquo;</div>
              <p>We let agents touch real positions for the first time — because for the first time we can prove what they did, line by line. The audit trail sells itself to our risk team.</p>
              <div className="q-by"><span className="q-av" /><span><b>Maya Okonkwo</b><span>Head of Treasury, Arc Capital</span></span></div>
            </div>
            <div className="quote fade-up">
              <div className="q-mark">&ldquo;</div>
              <p>The mandate model is the right abstraction. I describe the strategy, set the bounds, and get a Soroban-committed receipt back. No more diffing logs hoping the bot behaved.</p>
              <div className="q-by"><span className="q-av" /><span><b>D900 / d.eth</b><span>Protocol engineer, independent</span></span></div>
            </div>
            <div className="quote fade-up">
              <div className="q-mark">&ldquo;</div>
              <p>Verifiable execution is the missing primitive for on-chain agents. Verix is the first team treating the proof as the product, not an afterthought.</p>
              <div className="q-by"><span className="q-av" /><span><b>Lena Fischer</b><span>Partner, Meridian Ventures</span></span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section className="section pricing" id="pricing">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="section-eyebrow kicker fade-up">Access</div>
              <h2 className="section-title split">Start in the sandbox. <em>Scale to mandates.</em></h2>
            </div>
            <p className="section-lead fade-up">Early access pricing. Lock your tier now — rates rise at public launch.</p>
          </div>

          <div className="price-grid">
            <div className="tier fade-up">
              <div className="t-name">Sandbox</div>
              <div className="t-desc">Build and test against Soroban testnet.</div>
              <div className="t-price">$0</div>
              <div className="t-feats-wrap">
                <ul className="t-feats">
                  <li>Unlimited testnet mandates</li>
                  <li>Full proof generation</li>
                  <li>Swap &amp; lend agents</li>
                  <li>Community support</li>
                </ul>
              </div>
              <a className="btn btn-ghost magnetic" href="#access" data-cursor><span className="btn-label">Start building</span></a>
            </div>

            <div className="tier featured fade-up">
              <span className="badge">Most teams</span>
              <div className="t-name">Mandate</div>
              <div className="t-desc">Production execution with committed proofs.</div>
              <div className="t-price">1.5<small> bps / mandate</small></div>
              <ul className="t-feats">
                <li>Mainnet execution</li>
                <li>On-chain proof commitment</li>
                <li>All agents + custom bounds</li>
                <li>Exportable audit trail</li>
                <li>Priority routing</li>
              </ul>
              <a className="btn btn-primary magnetic" href="#access" data-cursor><span className="btn-label">Get Early Access <span className="arr">→</span></span></a>
            </div>

            <div className="tier fade-up">
              <div className="t-name">Institutional</div>
              <div className="t-desc">For funds, treasuries &amp; anchors.</div>
              <div className="t-price">Custom</div>
              <ul className="t-feats">
                <li>Dedicated agent fleet</li>
                <li>Policy &amp; compliance review</li>
                <li>SLA + onboarding</li>
                <li>Private deployment options</li>
                <li>Named support engineer</li>
              </ul>
              <a className="btn btn-ghost magnetic" href="#access" data-cursor><span className="btn-label">Talk to us</span></a>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section className="section faq" id="faq">
        <div className="wrap">
          <div className="section-head">
            <div>
              <div className="section-eyebrow kicker fade-up">Questions</div>
              <h2 className="section-title split">What you&apos;ll want to <em>ask.</em></h2>
            </div>
          </div>
          <div className="faq-list">
            <div className="faq-item">
              <button className="faq-q" data-cursor>What exactly does the proof contain?<span className="ico" /></button>
              <div className="faq-a"><div className="faq-a-inner">Every step of the run — the compiled mandate, each agent decision, the parameters in force, and every signed transaction — is hashed into a tamper-evident structure and committed to Soroban. Replaying the proof against your original mandate confirms the agent never exceeded a single bound.</div></div>
            </div>
            <div className="faq-item">
              <button className="faq-q" data-cursor>Do agents ever custody my funds?<span className="ico" /></button>
              <div className="faq-a"><div className="faq-a-inner">No. Agents operate within scoped, revocable authorizations you grant per mandate. They can only do what the policy allows, for as long as the window is open — and you can revoke at any time.</div></div>
            </div>
            <div className="faq-item">
              <button className="faq-q" data-cursor>Which DeFi actions are supported today?<span className="ico" /></button>
              <div className="faq-a"><div className="faq-a-inner">Swaps across Stellar DEXs, supplying and borrowing on lending markets, yield rebalancing, and cross-border settlement through anchors. New primitives are added as agents — one mandate can compose several.</div></div>
            </div>
            <div className="faq-item">
              <button className="faq-q" data-cursor>How is this different from a trading bot?<span className="ico" /></button>
              <div className="faq-a"><div className="faq-a-inner">A bot gives you an outcome and asks you to trust the logs. Verix gives you an outcome plus an independently verifiable, on-chain proof that the execution stayed inside your declared parameters. The verification is the product.</div></div>
            </div>
            <div className="faq-item">
              <button className="faq-q" data-cursor>Why Stellar and Soroban?<span className="ico" /></button>
              <div className="faq-a"><div className="faq-a-inner">Fast, low-cost finality and a smart-contract layer purpose-built for financial primitives make Stellar ideal for committing dense, action-level proofs without crippling fees — and for real cross-border settlement.</div></div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ DRIFT WORDMARK ============ */}
      <div className="drift-band" aria-hidden="true">
        <div className="drift" data-drift data-speed="0.14"><span className="o">VERIFY&nbsp;</span><span className="g">EVERYTHING.&nbsp;</span><span className="o">PROVE&nbsp;</span><span className="f">EVERY&nbsp;MOVE.&nbsp;</span></div>
      </div>

      {/* ============ FINAL CTA ============ */}
      <section className="final" id="access">
        <div className="final-glow" />
        <div className="final-inner">
          <h2 className="split">Stop trusting agents. <em>Start verifying them.</em></h2>
          <p className="final-sub fade-up">Get early access to the verifiable execution layer for Stellar DeFi. Limited cohort — proofs included.</p>
          <form className="email-form fade-up" id="access-form">
            <input type="email" placeholder="you@fund.xyz" required aria-label="Email" />
            <button className="btn btn-primary magnetic" type="submit" data-cursor><span className="btn-label" id="access-label">Get Early Access <span className="arr">→</span></span></button>
          </form>
          <p className="email-note fade-up">No spam. Mandate updates and your cohort invite only.</p>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="footer">
        <div className="footer-top">
          <div className="footer-brand">
            <a className="nav-logo" href="#top" aria-label="Verix">
              <Image className="nav-logo-img" src="/logo-mark.png" alt="Verix" width={976} height={344} />
            </a>
            <p>The verifiable AI execution layer for Stellar DeFi. Mandates in, proofs out.</p>
          </div>
          <div className="footer-col">
            <h5>Product</h5>
            <a href="#features" data-cursor>Protocol</a>
            <a href="#how" data-cursor>How it works</a>
            <a href="#console" data-cursor>Console</a>
            <a href="#pricing" data-cursor>Pricing</a>
          </div>
          <div className="footer-col">
            <h5>Developers</h5>
            <a href="#access" data-cursor>Docs</a>
            <a href="#access" data-cursor>Whitepaper</a>
            <a href="#access" data-cursor>Proof spec</a>
            <a href="#access" data-cursor>Status</a>
          </div>
          <div className="footer-col">
            <h5>Company</h5>
            <a href="#access" data-cursor>About</a>
            <a href="#access" data-cursor>Careers</a>
            <a href="#access" data-cursor>X / Twitter</a>
            <a href="#access" data-cursor>Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 VERIX LABS — BUILT ON STELLAR</span>
          <span>VERIFIABLE EXECUTION · SOROBAN COMMITTED · QC + SF</span>
        </div>
      </footer>
    </div>
  );
}
