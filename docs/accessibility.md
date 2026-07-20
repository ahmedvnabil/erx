# Accessibility (WCAG 2.1 AA)

This document records the accessibility work applied to the server-rendered HTML/CSS in
`src/views.ts` (app pages: `/explore`, `/sources`, `/knowledge`, `/methodology`,
`/documents/:id`) and `src/landing.ts` (the marketing landing content rendered inside the
product shell). Scope was limited to these two files; the dark brutalist / RTL Arabic-first
visual language was preserved — only attributes and a single marginal color token were changed.

The landing page's outer shell (`<html lang dir>`, skip link, `<main>`, primary `<nav>`,
footer) is produced by `src/product.ts`, which was intentionally left untouched because it was
already accessible (skip link `#main-content`, `<main id="main-content">`,
`<nav aria-label>`, correct `lang`/`dir`, and per-language `imageAlt`).

## Changes by view / component

### `layout()` — shell for all app pages (`src/views.ts`)
- Added a **skip link** as the first focusable element in `<body>`:
  `<a class="skip-link" href="#main">تخطَّ إلى المحتوى</a>`. It targets the new `id="main"`.
  The `.skip-link` visual (off-screen until `:focus`) is already defined globally in
  `LANDING_V2_CSS`, which is concatenated into `/static/app.css`, so no new CSS was needed.
- Gave `<main>` an `id="main"` so the skip link has a landmark target.
- Named the primary navigation: `<nav … aria-label="التنقل الرئيسي">`.
- Added **`aria-current="page"`** on the active top-level nav item via a new optional
  `active` parameter (`layout(content, title, active)`); each view passes its own path.

### `homeView()` (`/explore`) — search form
- `<form … role="search" aria-label="بحث في الأرشيف">`.
- Added `aria-label` to every previously unlabeled control:
  `q` → "كلمة البحث", `source_type` → "نوع المصدر", `mode` → "نمط البحث",
  `date_from` → "من تاريخ", `date_to` → "إلى تاريخ".
- Submit button given an explicit `type="submit"`.
- Results container marked `aria-live="polite"` so HTMX-injected results are announced.
- Passes `active="/explore"` to `layout()`.

### `resultsView()`
- The repeated "المصدر الأصلي ↗" links are visually identical; added a unique
  `aria-label="المصدر الأصلي: <title> (يفتح في المصدر)"` so each link is distinguishable
  out of context. Heading order (h2 count → h3 per result) already correct.

### `documentView()`
- The "الأصل ↗" citation link now has `rel="noreferrer"` and
  `aria-label="الوثيقة الأصلية في المصدر (يفتح في المصدر)"`.

### `sourcesView()` (`/sources`)
- Passes `active="/sources"` to `layout()`. Existing `role="tablist"`/`role="tab"`/
  `role="tabpanel"`, `role="listbox"`/`role="option"`, `aria-selected`, `aria-controls`,
  `aria-pressed` (view switch), and the labelled filter (`aria-label="ابحث في المصادر"`) were
  left intact — the interactive explorer was already keyboard-operable (see JS below).

### `knowledgeView()` / `methodologyView()`
- Pass `active="/knowledge"` / `active="/methodology"` to `layout()`; `methodologyView` also
  now supplies a page-specific `<title>`. Single h1 + h2 hierarchy already correct.

### `landingContent()` (`src/landing.ts`)
- `<form class="newsroom-search" role="search" aria-label="<search>" …>` — the input already
  had a `<label class="visually-hidden" for="landing-query">`; added the search role/name.
- The two `.copy-control` buttons both read "نسخ"/"Copy"; added
  `aria-label="<copy>: <Remote endpoint>"` and `"<copy>: <Local runtime>"` to disambiguate.
- `<img … alt>` on the archive image was already meaningful (`text.archiveAlt`) — unchanged.

### `SOURCE_EXPLORER_JS` (custom widget) — verified, not changed
- The tab widget already toggles `aria-selected` on `[role="tab"]` and `hidden` on
  `[role="tabpanel"]`, moves focus with Arrow keys, updates `aria-pressed` on the view-switch
  group, and manages `aria-selected` on listbox `[role="option"]` buttons. This already meets
  the intent of the task (roles/expanded-state exposed), so no changes were required.

## Focus styles

- **App pages** (`APP_CSS`): added a global keyboard-focus outline
  `a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,[tabindex]:focus-visible{outline:2px solid #57e389;outline-offset:2px}`.
  `#57e389` on the `#0a0c0d` page background is **11.9:1**, far above the 3:1 non-text
  minimum, and `outline-offset` keeps it visible even on the green `.action` button.
- **Landing** (`LANDING_V2_CSS`): extended the existing focus-visible rule to also cover
  `input`/`select`: `.landing-v2 a/button/input/select:focus-visible{outline:3px solid var(--accent);outline-offset:4px}`.
- The `.source-tab` / `.view-switch button` / `.source-select` focus-visible rules already
  present in `SOURCE_EXPLORER_CSS` were kept.

## Color contrast audit

All text/background token pairs in the edited CSS were computed (WCAG relative-luminance
formula). **The dark palette was already AA-compliant** — no pair fell below 4.5:1. The
lowest was the landing evidence-workflow step numerals, a small-text token sitting only just
above threshold; it was bumped for a comfortable margin. No other color was changed.

| Component | Token | Background | Before | After | Ratio (before → after) |
|-----------|-------|-----------|--------|-------|------------------------|
| `.evidence-workflow span` (landing step numbers, ~10px) | `#728079` | `#0c0f10` | `#728079` | **`#8a978f`** | 4.65:1 → **6.33:1** |

Representative pairs confirmed compliant and left unchanged (ratio on their real background):

| Token | Background | Ratio |
|-------|-----------|-------|
| `.section-head span` / footer `#9ca3a8` | `#0a0c0d` | 7.67:1 |
| `.result-excerpt` `#b7bec2` | `#0a0c0d` | 10.4:1 |
| `.status-failed` `#ff6b6b` | `#0a0c0d` | 7.06:1 |
| `.source-metric span` `#8f9994` | `#121617` | 6.20:1 |
| `.source-canvas__node small` `#84908a` | `#090c0d` | 5.92:1 |
| landing `--muted` `#a1aaa5` | `#121617` | 7.64:1 |
| landing `--accent` `#5bd68a` | `#0c0f10` | 10.5:1 |
| newsroom placeholder `#818b86` | `#121617` | 5.18:1 |
| focus outline `#57e389` | `#0a0c0d` | 11.9:1 (non-text, needs 3:1) |

## Language / direction

- App pages: `layout()` sets `<html lang="ar" dir="rtl">` (unchanged, verified correct).
- Landing: `lang`/`dir` are set per-language by the product shell (`src/product.ts`), with the
  English variant served at `/en` as `lang="en" dir="ltr"`. Arabic UI text is authored in the
  `ar` branch, English in the `en` branch of `landingContent()` — no mixed-language runs that
  would need an inline `lang` override.

## How to verify

1. Start the server: `npm run build && node dist/cli.js serve --transport http` (or run the
   dev entry), then open `http://localhost:<port>/`.
2. **Automated (axe):** in Chrome DevTools → Lighthouse → run an **Accessibility** audit on
   `/`, `/en`, `/explore`, `/sources`, `/knowledge`, `/methodology`, and a `/documents/1`
   page. Or install the axe DevTools extension and "Scan all of my page".
   Expect no violations for: "Elements must have sufficient color contrast", "Form elements
   must have labels", "Links must have discernible text", "Document must have one main
   landmark", "Page must contain a skip link", "Buttons must have discernible text".
3. **Keyboard:** load a page and press `Tab` once — the first stop must be
   "تخطَّ إلى المحتوى"; `Enter` jumps focus past the nav to `#main`. Continue tabbing and
   confirm every control shows the green focus outline; on `/sources` use Arrow keys to move
   between source tabs and directory options.
4. **Contrast spot-check:** DevTools color picker on `.evidence-workflow span` should report a
   ratio ≥ 4.5 against its background.
5. **Screen reader (optional):** VoiceOver (macOS, Cmd+F5) → rotor → Landmarks should list a
   named navigation and a main region; Form Controls should announce a label for each search
   field.

## Integration note (CSP)

No inline `<style>` block and no inline `style="…"` attributes were added or modified. All CSS
edits live in the exported CSS constants that are served as the external stylesheet
`/static/app.css` (covered by `style-src 'self'`). Therefore the CSP style hash pinned in
`src/web.ts` (`'sha256-bsV5JivYxvGywDAZ22EZJKBFip65Ng9xoJVLbBg7bdo='`) is **not affected** and
does not need recomputation.
