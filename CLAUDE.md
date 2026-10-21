# Sreejita's portfolio

See `PROJECT_NOTES.md` for how the site is built and run. Remember to bump the `?v=N` on any CSS/JS file you edit (in `index.html`, or in `work/*.html` for the case-study files).

## Commands Sreejita may give

### "airtel"

When Sreejita says **"airtel"** (or "add airtel", "I've joined Airtel", "show Airtel", `/airtel`), she has joined Airtel and wants it live on the **My Journey** timeline (page 4, `#journey`).

Everything is already built and only hidden:
- the entry `.p4-entry--0` in `index.html`: logo `assets/p4/airtel.jpg`, **Senior Product Designer · Airtel · Oct 2026 – Present**
- Housing's end date switches from "Present" to "Oct 2026" automatically
- the 6-entry spacing in `styles.css` (`.p4-entry--0` … `--5`, labels, timeline line)

To turn it on:
1. In `index.html`, remove `data-airtel="hidden"` from `<div class="p4-timeline" …>` (and the comment above it that mentions it).
2. Bump `styles.css?v=N` in `index.html`.
3. Check the page at `http://localhost:8935/index.html#journey` (desktop and phone width): six entries, Airtel on top, Housing reads "Jul 2025 – Oct 2026", nothing overlaps and the page doesn't scroll.

If she gives a different start date or title, update the Airtel entry's text (and Housing's `.p4-end-airtel` date to match) before turning it on.

To hide it again, put `data-airtel="hidden"` back on `.p4-timeline`.
