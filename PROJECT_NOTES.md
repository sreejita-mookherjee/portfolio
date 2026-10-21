# Sreejita Mookherjee — Portfolio site

Personal portfolio for Sreejita Mookherjee, a product designer. Static site converted from a Figma "scrapbook" design. No build step — plain HTML/CSS/vanilla JS.

## Running it locally

```
cd ~/Documents/sreejita_26
python3 -m http.server 8935
```
Then open `http://localhost:8935`.

## Files

- `index.html` — all 5 page sections + nav. Each section has its own URL (`#home`, `#work`, `#about`, `#journey`, `#contact`)
- `styles.css` — all styling (cache-busted via `?v=N` query string in the `<link>` tag)
- `script.js` — stage-scale calculation, mobile nav, copy-email button (page 5), project cards opening their pages, and the forward for old `?open=<pdf slug>` links from when case studies were PDFs
- `carousel.js` — the coverflow carousel on page 2
- `flip.js` — the scroll-driven page-flip engine (GSAP + ScrollTrigger) and the section URLs
- `scroll-hint.js` — the idle "Scroll to continue" hint on page 1
- `analytics.js` — GA4 events, shared by the home page and the case studies (see "Analytics" below)
- `mini-me*.js` — the 3D mini-me character (three.js, `assets/vendor/three/`; model in `assets/mini-me/`). `mini-me-kit.js` is shared; `mini-me.js` page 1 desktop, `-m1` page 1 phones, `-p2` / `-p4` / `-p5` pages 2, 4, 5, `-walk` the reading-progress bar on case studies. Add `?mmdebug` to the URL to get `window.__miniMe…` debug handles
- `work/*.html` — one page per project (case studies), styled by `case-study.css`, with `case-study.js` (scroll reveals, "Keep exploring" strip, "Go back" — steps back through history to the homepage as it was left, however many projects were opened since; it keeps the count in `history.state.csDepth`)
- Coming back to the homepage from a case study, if the browser reloads it instead of restoring it, mini-me intros already seen this visit skip to their end (`introSeen` / `markIntroSeen` in `mini-me-kit.js`, sessionStorage). A plain refresh still replays them
- `assets/` — images, self-hosted fonts, decorative SVGs (`p2/`, `p3/`, `p4/` hold page-specific images; `case-studies/` the project pages' images; `og/` the link-preview images)

**Important:** whenever you edit a `.css` or `.js` file, bump its `?v=N` query string in `index.html` (and in `work/*.html` for the files the case studies load). The local dev server / some browser tools aggressively cache these files, so edits can appear not to take effect without this.

## Design system

- Colors: sage `#6e7b59`, ink `#262626`, cream `#f4efe7` (CSS vars `--sage`, `--ink`, `--bg`)
- Fonts (self-hosted in `assets/fonts/`): **Oswald Semibold** for headlines/display (uppercase), **Source Serif 4** for the smaller accent/kicker lines (formerly Staatliches + Caveat)
- Aesthetic: torn-paper edges (`assets/paper-*.svg` strips top/bottom of each page), polaroid-style photo cards, decorative stars + a rotated line-pattern "vector" background per page

## Architecture

### Stage scaling
All page content sits inside a `.stage` div sized exactly `1726×996px` (the Figma frame size). `script.js` computes `--stage-scale = max(vw/1726, vh/996)` and applies it via `transform: scale()`, with `.stage-wrapper` centering it. This makes the whole design scale/crop like a `background-size: cover` image while keeping every element's Figma-derived pixel coordinates (`left`/`top` in px) valid at any viewport size.

### Page-flip mechanic (`flip.js`)
5 panels (`.panel`, `#panel-1`..`#panel-5`) pinned inside `#horizontal`, scroll-scrubbed via GSAP ScrollTrigger. Each panel 3D-rotates away (`rotateY: -180`) one at a time as the user scrolls, `perspective: 2600px` on `.track`. Panel count is read dynamically (`panels.length`), so adding a 6th page needs no changes to `flip.js` itself.

Elements with `data-anim="up|pop|cardIn|photoIn|toolsIn|strip"` get scroll-scrubbed reveal animations — see `revealStates()` in `flip.js` for the from/to values per type.

### Nav (right-middle vertical ticks)
`<nav class="dots">` — short horizontal tick marks, vertically stacked, fixed to the right-middle of the viewport (not bottom-right — that was an earlier iteration). Inactive ticks are light grey, the active one is dark ink and slightly longer. Hovering a tick reveals the section name as plain Source Serif text (color matches the page-1 "Scroll to continue" grey, dark when it's the active page) — no pill/background, just text sliding in. Each tick has a bigger invisible hover hit-box than its visible line (`background-clip: content-box` + padding) so they're easier to target with a cursor; the flex `gap` between ticks was set to `0` to compensate so the *visible* lines stay closely spaced.

## Pages

1. **Home** — name + hero headline, waving-hand sphere badge, "Scroll to continue →" hint that fades in after 3s idle (only while Home is active — see `scroll-hint.js`)
2. **Selected Work** — circular "coverflow" carousel of project polaroids (`carousel.js`). Hover-driven fan-out only engages on a real `mousemove` (not just `mouseenter`), to avoid the carousel reacting to a cursor that was already resting over it when the page became active.
3. **Meet Sreejita** — bio/photo/tools-strip images. These are **pre-composited flattened images supplied directly by Sreejita** (not reconstructed from Figma layers in CSS) — if she provides new versions, just swap the file in `assets/p3/`.
4. **My Journey (Experience)** — timeline of work history, reverse-chronological (Full-time group first, then Internships), company logos in `assets/p4/`. An Airtel entry is built but hidden until she joins — see `CLAUDE.md`.
5. **Contact** — "Interested in working together? / LET'S CONNECT" + email/LinkedIn/Behance pills with icons and a copy-to-clipboard button on the email.

## Conventions to follow

- **New images from Sreejita**: she drops them in `~/Documents/items/`. Check `ls -lt ~/Documents/items/` for the newest files when she mentions adding/updating an asset.
- **Established spacing rule**: the gap between a script line (Source Serif, e.g. "Here's") and the headline below it (Oswald) should be a clean **27px ink-to-ceiling gap** — this is what page 1 uses, and pages 2/4/5 were tuned to match it. Avoid tightening a headline's `line-height` below `normal` to "shrink a gap" — it can make the glyph render *above* its own box and visually collide with the line above it. Prefer adjusting `top`/margin position instead.
- Don't reconstruct effects from Figma layers if Sreejita has supplied a single flattened/pre-composited image for that section — just use the image directly.

## Analytics (GA4, `G-0ZFXKL6YER`)

The gtag snippet is at the top of `index.html` and every `work/*.html`; `analytics.js` adds these events (page views come from gtag itself):

| Event | Where | Parameters |
|---|---|---|
| `section_view` | home | `section_name` (Home / Selected Work / About / Journey / Contact), `landed` ("yes" = the section the visit started on, e.g. from a shared `#contact` link) |
| `project_click` | home cards, case-study "Keep exploring" strip | `project_name` (page slug), `click_source` (`home_carousel` / `keep_exploring`) |
| `contact_click` | Contact | `contact_method` (`email` / `linkedin` / `behance`) |
| `email_copy` | Contact copy button | — |
| `case_study_scroll` | case studies | `project_name`, `percent_scrolled` (25 / 50 / 75 / 100) |
| `back_to_work` | case-study "Go back" | `project_name` |

If you add a project page, include the gtag snippet and `../analytics.js` like the others (and add it to `case-study.js`'s PROJECTS list).

## Link previews (LinkedIn, WhatsApp, Slack…)

Home uses `assets/og-preview.png`; each case study has its own 1200×630 card in `assets/og/<page-slug>.png` (cream card, title, one-line result, polaroid of the project's cover). Changing an image: bump/change its URL in the page's `og:image`/`twitter:image`, and re-scrape the link in LinkedIn's Post Inspector.

## Known tricky spot (verification, not a real bug)

In some sandboxed/automated browser tools, screenshots and `getBoundingClientRect()` can render blank or return all-zero values while a GSAP ScrollTrigger panel is mid-pin/mid-scrub. If that happens while testing: use `offsetLeft`/`offsetTop`/`offsetWidth`/`offsetHeight` instead (pure layout, unaffected by the paint issue), and avoid forcing `progress(1)` on *all* GSAP timelines at once (it can rotate panel 1 away). The intro animation on page 1 can also appear to render very slowly in such tools — that's a performance artifact of the tool, not the site.
