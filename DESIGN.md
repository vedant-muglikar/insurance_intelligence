---
name: BimaSetu
description: A pre-admission coverage preflight in a calm navy-and-blue system, dark by default with a first-class light theme, Geist text, Geist Mono figures, Bricolage Grotesque display in the tool.
colors:
  brand: "#4aa3ff"
  brand-hi: "#7cbcff"
  on-brand: "#04132a"
  brand-light: "#0b63c9"
  brand-hi-light: "#0a52a8"
  sun: "#f7a93a"
  sun-light: "#e0891b"
  night-ground: "#08111f"
  night-surface: "#0c1a2d"
  night-card: "#112238"
  night-card-2: "#152a44"
  night-sunk: "#060d18"
  night-raised: "#1a3250"
  night-border: "#1c3050"
  night-border-2: "#28416a"
  night-border-3: "#5675a6"
  night-text: "#eaf2fb"
  night-muted: "#b4c5db"
  night-subtle: "#93a8c4"
  night-faint: "#8a9fbd"
  day-ground: "#f4f8fb"
  day-surface: "#fbfdfe"
  day-card: "#ffffff"
  day-card-2: "#f1f6fa"
  day-sunk: "#e6eef5"
  day-border: "#d6e2ec"
  day-border-2: "#bccddc"
  day-border-3: "#7a94ad"
  day-text: "#0b1f3a"
  day-muted: "#3c516b"
  day-subtle: "#4d627c"
  day-faint: "#566b84"
  ok: "#3cca97"
  ok-ink: "#74d8a9"
  ok-ink-light: "#0b5e46"
  ok-light: "#0f7a5c"
  warn: "#f7a93a"
  warn-ink: "#fbbf5e"
  warn-light: "#a35d00"
  warn-ink-light: "#7a4500"
  deny: "#ef7b6a"
  deny-ink: "#f5a392"
  deny-light: "#b83a2e"
  deny-ink-light: "#8a2a1f"
  info: "#5aa6f5"
  info-ink: "#86bfff"
  info-light: "#0b5fc0"
  info-ink-light: "#0a4a99"
  plum: "#a99be0"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Geist, system-ui, sans-serif"
    fontSize: "clamp(1.6rem, 2.4vw, 2rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  landing-hero:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(2.3rem, 4.2vw, 3.5rem)"
    fontWeight: 650
    lineHeight: 1.06
    letterSpacing: "-0.035em"
  landing-section:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(1.8rem, 3.2vw, 2.6rem)"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Bricolage Grotesque, Geist, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 650
    letterSpacing: "-0.015em"
  kpi-value:
    fontFamily: "Bricolage Grotesque, Geist, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  figure:
    fontFamily: "Geist Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "24px"
    fontWeight: 500
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  body-small:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14.5px"
    fontWeight: 500
  label:
    fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
rounded:
  xs: "4px"
  sm: "6px"
  sm-plus: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  panel: "16px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "42px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hi}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.night-text}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "42px"
  card:
    backgroundColor: "{colors.night-card}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.xl}"
    padding: "20px"
  kpi-card:
    backgroundColor: "{colors.night-card}"
    rounded: "{rounded.xl}"
    padding: "18px 20px"
  chip:
    textColor: "{colors.warn-ink}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "28px"
  nav-item:
    textColor: "{colors.night-muted}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "42px"
  input:
    backgroundColor: "{colors.night-sunk}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.md}"
    height: "44px"
---

# Design System: BimaSetu

## Overview

**Creative North Star: "The Navy Ledger"**

BimaSetu reads as a well-kept account book in a calm, trustworthy blue: a deep navy ground, flat cards with hairline borders, one brand blue for every action and selection, and monospaced figures for every rupee. The product explains money to stressed families, so the surface stays quiet and legible; colour appears only where it carries state (covered, reduced, excluded, review) or marks the one thing to press.

Dark is the default and the light theme is a full alternate, not an afterthought: every semantic colour has a darker "ink" variant for light grounds. The tool at `/app` is a conventional dashboard (sidebar, sticky header, KPI cards, tabbed content cards). The public landing page is a minimal single-column page of hairline-divided sections with one flat SVG illustration; sign-in shares the same tokens.

**Key Characteristics:**
- One brand blue (`#4aa3ff` dark, `#0b63c9` light) is the only action colour; solid fills, no outline-only primaries.
- Navy-tinted neutrals in both themes; text and borders carry the same hue as the ground.
- Semantic ok / warn / deny / info each ship a fill colour and a readable "ink" colour for text on tinted washes.
- Figures are Geist Mono with negative tracking; headings are Bricolage Grotesque in the tool and on the landing; sign-in headings use Geist.
- Surfaces are flat. Depth comes from a one-step lighter card against the ground and a 1px border.

## Colors

A navy ground family with a single blue brand, warm orange held in reserve, and four semantic hues. All values live as custom properties in `app/theme.css`; dark is `:root`, light is `:root[data-theme='light']`, and the Tailwind palette variables (slate, gray, emerald, red, blue and the rest) are remapped to the same hues so utility classes follow the theme.

### Primary
- **Setu Blue** (`{colors.brand}` dark, `{colors.brand-light}` light): primary buttons, selected nav and tab indicators, focus ring, links, progress bars, the "typical" value on cost ranges. Hover steps to `{colors.brand-hi}` / `{colors.brand-hi-light}`. Text on it is `{colors.on-brand}` (near-black navy in dark, white in light).

### Secondary
- **Sun Orange** (`{colors.sun}` dark, `{colors.sun-light}` light): defined as a token and identical to the warn hue in dark. No stylesheet uses `--sun` directly; the warm tone appears only as the warn semantic. Treat it as reserved, not as a second brand colour.

### Semantic
- **Covered Green** (`{colors.ok}`, ink `{colors.ok-ink}`): covered amounts, success alerts, the insurer share of the split bar.
- **Caution Amber** (`{colors.warn}`, ink `{colors.warn-ink}`): needs-review chips, banners, medium severity.
- **Patient Coral** (`{colors.deny}`, ink `{colors.deny-ink}`): excluded lines, what the patient pays, listening mic, errors.
- **Info Blue** (`{colors.info}`, ink `{colors.info-ink}`): reduced lines and neutral information.
- **Plum** (`{colors.plum}`): a minor categorical tone used only in the cost-breakdown palette and checklist.

### Neutral
- **Night family** (`{colors.night-ground}` ground, `{colors.night-surface}` sidebar and bands, `{colors.night-card}` cards, `{colors.night-card-2}` hover and nested cards, `{colors.night-sunk}` inputs and wells, `{colors.night-raised}` focused fields): the dark stack.
- **Night borders** (`{colors.night-border}` hairline, `{colors.night-border-2}` control borders, `{colors.night-border-3}` hover and dashed drop zones).
- **Night text** (`{colors.night-text}` primary, `{colors.night-muted}` body, `{colors.night-subtle}` captions, `{colors.night-faint}` placeholders and inactive).
- **Day family** mirrors the stack: `{colors.day-ground}`, `{colors.day-surface}`, `{colors.day-card}`, `{colors.day-card-2}`, `{colors.day-sunk}`, borders `{colors.day-border}` / `{colors.day-border-2}` / `{colors.day-border-3}`, text `{colors.day-text}` / `{colors.day-muted}` / `{colors.day-subtle}` / `{colors.day-faint}`.

### Named Rules
**The One Blue Rule.** Every primary action, selection and focus state uses the brand blue. Do not introduce a second action colour.

**The Ink Rule.** Text on a tinted semantic wash uses the `-ink` value (`color-mix` of the hue at 10 to 16% over transparent or the card for the wash). Raw semantic fills are for dots, bars and icons.

**The Tint-Not-Fill Rule.** Chips, banners and status pills are a 10 to 16% `color-mix` of the semantic hue, never a saturated block.

## Typography

**Display Font:** Bricolage Grotesque (with Geist, system-ui)
**Body Font:** Geist (with system-ui, -apple-system, Segoe UI)
**Label/Mono Font:** Geist Mono (with ui-monospace, Menlo, Consolas)

**Character:** Geist keeps reading text neutral and compact; Bricolage gives the tool's headings and KPI numbers a slightly warmer, humane voice; Geist Mono makes rupee figures align and read as data. Fonts are self-hosted through `next/font` in `app/layout.tsx` and exposed as `--font-display`, `--font-sans`, `--font-mono`.

### Hierarchy
The shipped sizes, as used:
- **Landing hero** (Geist 650, `clamp(2.3rem, 4.2vw, 3.5rem)`, 1.06, -0.035em): `.lp-h1`; the second line is brand blue.
- **Landing section** (Geist 650, `clamp(1.8rem, 3.2vw, 2.6rem)`, 1.1, -0.03em): `.lp-h2`, also the CTA band heading at `clamp(1.7rem, 3.2vw, 2.5rem)`.
- **Sign-in** (Geist 650): panel title `clamp(1.8rem, 3vw, 2.6rem)`, form title 1.8rem.
- **Page title** (Bricolage 700, `clamp(1.6rem, 2.4vw, 2rem)`, -0.025em): `.db-head h1`. Upload title is 700 at `clamp(2rem, 6vw, 2.8rem)`; processing title 700 at `clamp(1.8rem, 5vw, 2.4rem)`.
- **Card title** (Bricolage 650, 18px, -0.015em); rule-card names 650 at 16.5px; drop-zone heading 650 at 20px.
- **KPI value** (Bricolage 700, 30px, 1.1, -0.03em); money KPI is Geist Mono 500 at 24px, -0.04em.
- **Estimator figure** (Geist Mono 500, `clamp(1.5rem, 2.3vw, 2.1rem)`; main figure `clamp(1.9rem, 3vw, 2.6rem)`, -0.04em).
- **Body** (Geist 400, 15px on `body`; 14.5 to 16px in cards and descriptions; landing lede `clamp(1rem, 1.2vw, 1.125rem)` at 1.65).
- **Label** (Geist 500 to 600, 13 to 14.5px; chips 13.5px 600; table headers 13px 600; micro text never below 11.5px in the tool).

Sign-in headings do not set the display face, so they render in Geist; the landing headings use Bricolage, as do is used in the tool, upload and processing screens, buttons (`.pl-btn`) and the wordmark.

### Named Rules
**The Figures Are Mono Rule.** Rupee amounts, table numerals and estimator values use Geist Mono with negative tracking (-0.02 to -0.05em); `.pl-num` adds tabular figures.

**The Sentence-Case Rule.** Labels in the tool are sentence case with normal tracking; the tool stylesheet resets Tailwind `uppercase` and wide-tracking utilities inside `.db-content`.

## Layout

The tool is a two-column grid: a 248px sticky sidebar (`--side-w`) and a fluid main column with a 64px sticky header. Content is centred at max-width 1240px with `clamp(16px, 3vw, 32px)` side padding, 28px top and 56px bottom. Vertical rhythm inside a page is a 20px grid gap between cards, 16px between KPI cards, 14 to 16px inside card heads, and 12 to 14px for form and list gaps; the scale in practice is 4, 8, 12, 16, 20, 28.

KPI cards run four across, then two below 1180px and one below 520px. The estimator is a 380px sticky form beside the output at 1100px and up, stacked (output first) below. A detail grid pairs a fluid column with a 340px rail until 1180px.

Below 1024px the sidebar dissolves: brand and footer hide, the nav becomes a fixed bottom tab bar (icon above a 12px label, 56px tall, safe-area padding) and the content gains 96px bottom padding. The claim ledger table collapses to two-column rows below 900px.

The landing page is a quiet column of hairline-divided sections in a centred wrapper, under a plain-link header: a hero with copy beside an inline flat SVG footbridge illustration (`BridgeArt`), three numbered steps, a try-it playground with a ledger, a feature list, a cost-range line and a closing call to action. There are no cards, stat strip or glow. Sign-in is a two-pane grid (1.05fr proof panel, 0.95fr form, form max 400px) that collapses to the form alone below 1024px.

## Elevation & Depth

Flat, tonal layering with hairlines. Depth is a lighter card on the ground plus a 1px border; shadows are minimal and mostly structural.

### Shadow Vocabulary
- **Card hairline lift** (`box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12)`): dashboard cards, KPI cards, estimator KPIs.
- **Surface shadow** (`--shadow`: `0 18px 40px -22px rgba(0,0,0,0.7)` dark, `0 14px 30px -20px rgba(11,60,120,0.3)` light): the legacy `.panel` wrappers.
- **Focus ring** (`box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 22%, transparent)`; 4px at 20% on sign-in fields): focused search and inputs. Global `:focus-visible` is a 2px brand outline with 3px offset.
- **Active-tab rule** (`inset 0 -2px 0 var(--brand)`): selected tab underline.
- **Header blur** (`backdrop-filter: blur(8px)` at 92% ground in the tool, `blur(14px)` at 82 to 94% on the landing nav): sticky bars only.

### Named Rules
**The Flat-By-Default Rule.** Cards rest with a border and at most the hairline lift; hover changes border colour (`border3`) or background (`card2`), not elevation.

## Shapes

Soft-square, with pills for status. The shipped radius scale: 4px (tiny swatches, focus fallback, bars), 6px (`--radius-sm`), 8px (small inputs, skip link), 10px (default: buttons, inputs, nav items, search, list rows, theme toggle), 12px (banners, sidebar plan card, table container, drop-zone file button, upload CTA, rule cards), 14px (cards, KPI cards), 16px (upload drop zone), 999px (chips, tabs counters, status pills, progress bars). `--radius` is 10px. Borders are 1px hairlines; dashed 2px borders mark the upload drop zone and the bill-check CTA (1px dashed). Keyline dots and legend swatches are circles or 3 to 4px squares.

## Components

### Buttons
- **Shape:** 10px radius; tool buttons 42px tall (`.db-btn`), upload CTA 52px with 12px radius, landing buttons (`.pl-btn`) 13px/22px padding in the display face.
- **Primary:** solid brand blue, `on-brand` text, 600 weight, 14.5px. Hover moves to `brand-hi`. Landing and sign-in primaries lift 1px on hover and press down on active; the tool scales to 0.98 on active.
- **Ghost:** transparent with a `border2` (tool) or `border3` (landing) 1px or 2px border and `text`; hover tints with `card2` or 8% brand.
- **Disabled:** 40 to 50% opacity, `not-allowed`.
- **Mic and voice toggle:** 48px squares with 12px radius; the mic is brand blue at rest, coral while listening (with an expanding ring, disabled under reduced motion), green while speaking.

### Chips
- **Style:** pill, 28px tall, 13.5px 600, ink text on a 14 to 16% tint of the semantic hue; default tone is warn. `data-tone` selects ok, info, deny.
- **State:** tab counters are smaller pills (12.5px) on `sunk`, brand-tinted when their tab is selected. Table status pills (`.cl-status`) use the same tint rule at 12px.

### Cards / Containers
- **Corner Style:** 14px (`.db-card`, `.db-kpi`, `.est-kpi`); 12px for nested rule cards, banners and the table frame.
- **Background:** `card` on `bg`; nested or hover surfaces use `card2`; wells and inputs use `sunk`.
- **Border:** 1px `border`. The emphasised estimator KPI uses a brand-mixed border and 8% brand wash.
- **Internal Padding:** 20px (cards), 18px 20px (KPI), 16px 18px (rule cards). Card head: title (18px display) with optional 14.5px muted subtitle.

### Inputs / Fields
- **Style:** 44px minimum height in the tool, 10px radius, `sunk` fill and `border2` stroke; sign-in fields are `card` fill, `border3` stroke, 12px/14px padding, 16px text.
- **Focus:** border moves to brand with a 3 to 4px brand halo (20 to 22%); sign-in fields also lift to `raised`. Invalid shows a coral border.
- **Search:** 40px tall pill-corner (10px) field that takes the same focus halo on `:focus-within`.

### Navigation
- **Sidebar (`.db-nav`):** 42px items, 15px 500, 12px gap to a 20px icon; hover `card2`; selected is a 14% brand tint with 600 weight and a brand icon. Footer holds a bordered plan card.
- **Header (`.db-top`):** 64px, breadcrumb at 14.5px with bold current section, actions right-aligned.
- **Tabs (`.db-tabs`):** text tabs 44px tall on a hairline, selected tab gets a 2px brand underline and bold text; horizontal scroll with hidden scrollbar.
- **Phones:** fixed bottom tab bar, 12px labels, 56px items.
- **Landing header:** plain text links with a sign-in link and a small launch button, a hamburger menu on small screens.

### Cost breakdown and split bar
A stacked segment bar (14px high, 3px gaps, 4px segments) above a ruled list with 12px colour swatches; amounts right-aligned in Geist Mono 15.5px. The estimator split bar is a 10px pill: green insurer share over a 60% coral-on-sunk remainder for the patient share. Palette order for breakdown segments: brand, ok, warn, info-ink, plum, deny, ok-ink, faint.

### Claim ledger table
A bordered, 12px-rounded grid: `sunk` header row (13px 600 subtle), hairline-separated rows opening as `details`, right-aligned mono amounts (14px), status pills, editable amount fields that reveal a border on hover or focus, and a `card2` total row with a stronger top rule.

### Bill check
Three stat tiles on `sunk` (mono 17px values, warn or ok tone), expandable findings with a 10px severity dot (info, warn, coral), and line-item rows of description, category select and amount input.

### Brand mark and wordmark
The logo image sits on a near-white tile (`#fbfdff`, 12px radius) so it reads in both themes. The wordmark is 800-weight Bricolage at 21px, "Bima" in text colour and "Setu" in the blue-to-teal-to-green `--grad` text fill. This is the only gradient use in the product CSS; see Do's and Don'ts.

### Theme toggle
38px, 10px radius, outlined icon button; theme changes crossfade colour, border and fill over 0.3s only, never layout.

### Motion
Eased with `cubic-bezier(0.16, 1, 0.3, 1)`. Entrances are a 6 to 14px rise with fade (0.35 to 0.7s), state changes 0.15 to 0.2s, bar fills 0.6 to 0.7s. Landing scroll effects use `animation-timeline` behind `@supports`. All animation and transition collapse under `prefers-reduced-motion`.

## Do's and Don'ts

### Do:
- **Do** take colour from the custom properties in `app/theme.css`; never hard-code a hex in a component, and check both themes.
- **Do** use the brand blue for the single primary action on a view and for selected and focus states.
- **Do** put semantic meaning in tinted washes with `-ink` text and keep the saturated hue for dots, bars and icons.
- **Do** set rupee figures in Geist Mono with negative tracking and right-align them in tables.
- **Do** use 10px radius for controls, 14px for cards, 999px for pills.
- **Do** keep hit areas at 42 to 44px or more in the tool and 56px for bottom tabs.
- **Do** keep cards flat: a `card` fill on the ground, a 1px border, at most the 0 1px 2px lift.

### Don't:
- **Don't** add a second action colour, or use the sun orange as a brand accent; its role is the warn semantic.
- **Don't** put gradient fills on surfaces, buttons, cards or text. The only gradient in the product is the "Setu" half of the wordmark; do not extend it.
- **Don't** use raw semantic fills as text on tinted backgrounds; use the ink value.
- **Don't** raise cards on hover in the tool; change border or background instead.
- **Don't** use uppercase or widely tracked labels in the tool; sentence case at 13 to 14.5px is the house style.
- **Don't** hand-pick Tailwind palette steps expecting stock colours; every palette family is remapped to this navy, blue, green, amber, coral set.
