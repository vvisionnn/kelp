# Design System: Kelp

Kelp is the console an operator keeps open next to a SeaweedFS cluster. This file is the source of truth for how it looks and behaves: concept, tokens, components, layout and motion. Implementation lives in `src/index.css` (tokens), `src/components/ui` (controls) and `src/components/kelp` (Kelp's own primitives).

## 1. Visual Theme & Atmosphere

**A calm instrument.** Kelp is a dashboard, not a landing page. People come to answer a question ("is the cluster healthy?", "which bucket grew?", "why did that job fail?") and to act. Every screen is built to be scanned in seconds and worked in for hours.

Two influences, used as concepts and never copied:

- **x.ai's color thinking**: the chrome is black, white and greys, actions are monochrome (ink on light, white on dark), and color comes from one place: the spectrum family (indigo, violet, pink, orange, amber). Kelp uses it for data and for the few brand moments, never for decoration.
- **Desktop craft**: navigation is docked and quiet, dense controls are compact rounded rectangles, hierarchy comes from type and spacing rather than boxes, and motion answers what the person did.

### Key Characteristics

- A sidebar docked to the window edge in the canvas tone, separated by a hairline, with quiet monochrome line icons. The current page rests on a small sheet of its own, the same white (raised grey in dark) as the groups on the page, so the chrome and the content speak one language. It folds to an icon rail.
- A toolbar per page in the canvas tone: where you are (section, page, item) on the left, search and theme on the right. Content scrolls under it; a hairline appears once it does.
- Inset grouped sections (white sheets on a soft grey canvas in light, raised greys on near-black in dark), with hairline separators between rows.
- Dense, legible tables: 40px rows, 13px text, tabular numerals, units in secondary ink.
- Charts everywhere data has a shape: live traffic, latency, growth, shares and distributions, drawn in the data palette with a crosshair and a data table behind every chart.
- Numbers in a rounded face where the platform has one, units set lighter.
- No decorative gradients, glows or ambient animation inside the app. The sign-in page is the one place for atmosphere.

## 2. Color Palette & Roles

Colors are named by role. Light and dark are designed separately, not inverted.

| Role            | Token                | Light                  | Dark                   | Usage                                            |
| --------------- | -------------------- | ---------------------- | ---------------------- | ------------------------------------------------ |
| Canvas          | `--background`       | #F5F5F7                | #0E0E10                | Window background behind sidebar and groups      |
| Sheet           | `--card`             | #FFFFFF                | #1C1C1E                | Grouped sections, tables, widgets                |
| Raised          | `--raised`           | #F2F2F5                | #2C2C2E                | Inputs on sheets, hovered rows, segmented tracks |
| Popover         | `--popover`          | #FFFFFF                | #2C2C2E                | Menus, popovers, dialogs                         |
| Label           | `--foreground`       | #1D1D1F                | #F5F5F7                | Primary text                                     |
| Secondary label | `--muted-foreground` | #6E6E73                | #98989F                | Descriptions, metadata, column headers           |
| Tertiary label  | `--tertiary`         | rgb(60 60 67 / .36)    | rgb(235 235 245 / .32) | Placeholders, disabled text, units               |
| Separator       | `--border`           | rgb(0 0 0 / .08)       | rgb(255 255 255 / .08) | Row hairlines, group outlines                    |
| Fill            | `--accent`           | rgb(120 120 128 / .12) | rgb(120 120 128 / .24) | Selected sidebar row, hovered controls           |
| Ink (primary)   | `--primary`          | #1D1D1F                | #F5F5F7                | Primary buttons, selected menu rows, switches on |
| Destructive     | `--destructive`      | #E5352B                | #FF5A50                | Delete and irreversible actions                  |

### Primary

**Ink** is Kelp's action color, as on x.ai: primary buttons are near-black with white text in light mode and near-white with black text in dark mode. Highlighted menu rows, switches that are on and selected segments invert the same way. Links are ink with an underline on hover. Focus is a 2px ring of ink at 55% opacity.

### The spectrum

`--spectrum` is x.ai's gradient: indigo #6366F1, violet #A855F7, pink #EC4899, orange #F97316, amber #EAB308. It appears in exactly two places: capacity meters below the warning threshold, and the sign-in screen. Nowhere else, so it keeps meaning "Kelp". The chrome carries no color at all apart from the cluster's status dot, so any color in the sidebar means something.

### Icons

Navigation icons are 16px lucide line icons at 1.75 stroke in secondary ink; hovered and current pages turn to label ink. Icons sit on one vertical line with the brand tile and the avatar, so folding to the rail only hides the words. No colored icon tiles: they read as a phone home screen, not a desktop console.

### Status (reserved)

| State    | Light   | Dark    | Always paired with            |
| -------- | ------- | ------- | ----------------------------- |
| Good     | #248A3D | #30D158 | a dot or check, and a word    |
| Warning  | #C93400 | #FF9F0A | a triangle or dot, and a word |
| Critical | #D70015 | #FF453A | an octagon or dot, and a word |
| Info     | #5552E0 | #6D6AF2 | an info glyph                 |

Status colors appear as small dots, glyphs and tinted pills (12% fill, full-strength text). Never as large fills.

### Data palette

For charts and meters only, in this fixed order (validated for color-vision deficiency on both surfaces):

Drawn from the spectrum family, with a teal added so neighbors stay apart for color-blind readers:

- Light: indigo #5552E0, orange #C2541A, teal #00897A, violet #9A45C2, amber #8F6D10
- Dark: indigo #6D6AF2, orange #D96A2B, teal #1F9D8F, violet #B65FD8, amber #B08A24

Series take colors in this order and keep them when filters change; a sixth series folds into "Other". Capacity meters fill with the spectrum below 80%, Warning from 80% and Critical from 95%, always with the percentage in text beside them.

### Charts

- Time series share one range control (15m, 1h, 6h, 24h) in the page header; it scopes every chart on the page.
- Lines are 2px; areas are a 10% wash; stacked areas use the data palette with a 1px surface seam.
- Hairline horizontal gridlines only, compact tick labels (1.2K, 34K), clock times on the x axis.
- A crosshair snaps to the nearest sample and lists every series, value first. The chart is focusable and the arrow keys walk the samples.
- Two or more series always have a legend; one series is named by the panel title.
- Every chart carries a screen-reader table of its data.
- Stat tiles: label, value with a lighter unit, optional hint, optional 12-point sparkline.

### Surface & Overlay

- Glass (floating save bars only): canvas color at 72% (light) / 64% (dark) with `backdrop-filter: blur(24px) saturate(180%)`, a 0.5px edge and a 1px inner top highlight. The sidebar and toolbar are solid: a blur under a sticky bar repaints on every scrolled frame.
- Overlay behind dialogs and sheets: black at 24% (light) / 48% (dark) with 2px blur.

### Shadows & Depth

- Sheet: none in dark; `0 1px 2px rgb(0 0 0 / .04)` in light, plus the 0.5px separator outline.
- Glass: `0 8px 32px rgb(0 0 0 / .08)` light, `0 8px 32px rgb(0 0 0 / .5)` dark.
- Popover and dialog: `0 12px 40px rgb(0 0 0 / .14), 0 0 0 .5px rgb(0 0 0 / .08)`; dark uses .55 and a white edge at .1.

## Theme Modes

### Light Mode

Soft grey canvas (#F5F5F7), white sheets, near-black label (#1D1D1F). Separators are 8% black. Glass is bright and frosted. Actions are near-black ink.

### Dark Mode

Near-black canvas (#0E0E10), sheets at #1C1C1E and raised controls at #2C2C2E, so depth reads as lighter-is-closer. Labels are #F5F5F7, separators 8% white. Glass is smoky. Actions invert to near-white.

## 3. Typography Rules

### Font Family

- Sans: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter Variable", system-ui, sans-serif`. On Apple devices this is San Francisco; elsewhere Kelp ships Inter, its closest open relative.
- Numerals: `ui-rounded, "SF Pro Rounded", "Inter Variable", sans-serif` with tabular figures, for metrics only.
- Mono: `ui-monospace, "SF Mono", "Geist Mono Variable", monospace` for addresses, IDs, keys, paths and JSON.

### Hierarchy

| Role          | Size / line | Weight | Tracking | Use                                         |
| ------------- | ----------- | ------ | -------- | ------------------------------------------- |
| Page title    | 26 / 32     | 700    | -0.022em | One per page, in the page header            |
| Toolbar title | 15 / 20     | 600    | -0.01em  | Sticky toolbar when the page header scrolls |
| Section title | 17 / 22     | 600    | -0.012em | Above a group or table                      |
| Headline      | 13 / 18     | 600    | 0        | Row titles, widget labels                   |
| Body          | 14 / 20     | 400    | -0.006em | Paragraphs, form labels                     |
| Callout       | 13 / 18     | 400    | 0        | Table cells, list rows, controls            |
| Footnote      | 12 / 16     | 400    | 0        | Metadata, hints, column headers             |
| Caption       | 11 / 14     | 500    | 0.01em   | Sidebar section labels, chart axes          |
| Metric        | 28 / 32     | 600    | -0.02em  | KPI values (rounded numerals)               |
| Metric small  | 20 / 24     | 600    | -0.015em | Secondary values in widgets                 |

### Principles

- Hierarchy through weight and size, never through color alone. Secondary ink is for information that supports the label beside it.
- Sentence case everywhere. No all-caps labels, no letter-spaced eyebrows.
- Units sit in secondary ink after the number ("42.7 MiB" with "MiB" lighter), so columns of numbers scan cleanly.
- Line length stays under 75 characters for prose.

## 4. Component Stylings

### Buttons and Links

- Sizes: small 28px (toolbars, rows), regular 32px (default), large 40px (sign-in, empty states).
- Shape: rounded rectangle, 8px radius. Capsules only for the sign-in button and status pills.
- Primary: ink fill (near-black in light, near-white in dark) with inverted text, 500 weight. Hover lifts brightness. Press scales to 0.98.
- Secondary: Fill background, label text. Plain: transparent, Fill on hover.
- Destructive: red text on Fill; in confirmations a red fill. Deleting a populated resource uses hold-to-confirm (React Bits HoldButton).
- Links: ink text, underline on hover.

### Cards and Containers

- **Group**: the inset grouped section. Sheet surface, 12px radius, 0.5px separator outline, rows separated by hairlines inset 16px from the leading edge. An optional title (section title style) and footnote sit outside the group, above and below.
- **Widget**: a Group used for one metric or chart. 16px padding, label row (glyph + headline in secondary), metric below, optional meter.
- No nested cards. No gradient fills.

### Inputs and Interactive Controls

- Text fields: 32px, 8px radius, Raised fill with a faint edge; on focus an ink ring at 30%. Search fields carry a magnifier glyph and a ⌘K hint.
- Segmented control: Raised track, white (light) or #636366 (dark) thumb with a soft shadow; the thumb springs between segments (React Bits RubberSegment). Used for filters and view switches.
- Switch: ink when on, thumb inverted.
- Checkbox: 16px, 4px radius, ink fill when checked.
- Select and menus: popover surface, 6px radius items, ink fill on the highlighted item with inverted text.

### Navigation

- **Sidebar**: docked, full height, 240px wide, canvas tone, 1px hairline on its trailing edge, no radius or shadow. Top: Kelp app icon, name, and a one-line cluster status. Then sections (Cluster, Storage, Object store, Access, Operations) with caption-style labels, then items: 16px line icon in secondary ink, 13px label, 32px row, 8px radius. The current row rests on a sheet (`--nav-current`, white with a hairline and faint shadow in light, #222225 with a light edge in dark) that springs between rows; hover shows a Fill pill that glides the same way. Bottom: the account button.
- **Rail**: ⌘B (or the toolbar's sidebar button) folds the sidebar to 56px; the choice is remembered. Words fade out before the rail narrows and back in after it widens; section labels become hairlines; every item names itself in a tooltip; the cluster status becomes a dot on the brand tile. Below 1024px the sidebar is a sheet from the toolbar instead.
- **Toolbar**: 52px, sticky, canvas tone, a hairline once content scrolls under it. Leading: the sidebar button and a breadcrumb: section, page and, on detail pages, the page as a link back to its list followed by the item ("Operations › Maintenance › Volume vacuum"). Trailing: search field and theme switch.
- **Page header**: 26px semibold title, a one-line description in secondary ink, and page actions (including the time range when the page has charts) at the trailing edge.

### Tables

- No header band. Column headers are footnote size in secondary ink with sort glyphs.
- Rows are 40px, separated by hairlines; hover uses Raised; selected rows use ink at 6%.
- Numbers right-aligned, tabular. Identifiers in mono. Empty cells show an en dash in tertiary ink.
- A table lives inside a Group; its toolbar (search, segmented filter, actions) sits above it, outside the group.

### Badges and Status

- Status pill: capsule, 20px, 12% tinted fill, 500-weight 12px text, leading dot.
- Neutral tag: Raised fill, secondary label, 6px radius.
- Job and task state (pending, running, done, failed, canceled): React Bits StatusMark next to a word.

### Image Treatment

Previews sit on a Raised surface with 12px radius. Images never bleed to the window edge.

### Distinctive Components

- **Current-page sheet** gliding between sidebar rows.
- **Rolling metrics**: values change with React Bits Counter digit rolls when data refreshes.
- **Capacity meter**: 6px track in Fill, value in spectrum/Warning/Critical with the percent beside it.
- **Hold to delete**: destructive actions on populated resources fill as you hold, so nothing important is lost to a misclick.

## 5. Layout Principles

### Spacing System

4px base, used in steps of 4, 8, 12, 16, 20, 24, 32, 48. Rows pad 10–12px vertically and 16px horizontally. Groups are 16px apart in a stack and 32px apart between sections.

### Grid & Container

- Window: sidebar (240px, or the 56px rail) and a content column.
- Content column: 24px side padding (32px from 1280px), max width 1400px, left-aligned.
- Overview and list pages use a 12-column grid with 16px gutters; widgets span 3, 4, 6 or 12 columns.

### Whitespace Philosophy

Density with calm: tight inside a group, generous between groups. A page shows the answer above the fold at 1440×900.

### Border Radius Scale

Groups and widgets 12, controls and sidebar rows 8, menu items and tags 6, checkboxes 4, pills 9999. The docked sidebar and toolbar have no radius.

## 6. Depth & Elevation

| Level | Surface                 | Treatment                       |
| ----- | ----------------------- | ------------------------------- |
| 0     | Canvas                  | flat                            |
| 1     | Sheet (groups, widgets) | separator outline, faint shadow |
| 2     | Sidebar, toolbar        | canvas tone, hairline edge      |
| 3     | Popover, menu, tooltip  | popover surface, popover shadow |
| 4     | Dialog, sheet panel     | overlay plus popover shadow     |

### Depth Principles

- Glass is for navigation and controls that float above content, never for content itself.
- In dark mode, closer surfaces are lighter; shadows are secondary.

## 7. Do's and Don'ts

### Do

- Put the answer first: health, capacity and problems at the top of the page.
- Group related settings and facts into inset groups with titles outside.
- Give every number with a history a trend, and every share a chart.
- Keep numbers tabular, right-aligned and with lighter units.
- Animate in response to actions: selection, opening, confirming, refreshing.

### Don't

- No landing-page patterns: hero headlines, marketing copy, giant stat bands, bento grids of links, decorative gradients.
- No glass on content, no nested cards, no borders and shadows stacked on the same element.
- No color for decoration; the spectrum is only for meters and sign-in; status colors only for state.
- No ambient or looping animation inside the app. A skeleton's tide runs only while something loads, and the sheet spotlight only answers the pointer.
- No all-caps labels or letter-spaced eyebrows.

## 8. Responsive Behavior

### Breakpoints

| Name    | Width     | Behavior                                                  |
| ------- | --------- | --------------------------------------------------------- |
| Compact | < 1024    | Sidebar becomes a sheet from the toolbar's sidebar button |
| Regular | 1024–1279 | Docked sidebar (or rail), widgets reflow to 6 columns     |
| Wide    | ≥ 1280    | Full grid, 32px content padding                           |

### Touch Targets

Rows and buttons are at least 32px tall on pointer devices and grow to 40px under `pointer: coarse`.

### Collapsing Strategy

Tables keep identity and status columns and drop secondary columns first; side columns on detail pages stack under the main column.

## 9. Agent Prompt Guide

### Quick Color Reference

- Canvas #F5F5F7 / #0E0E10, Sheet #FFFFFF / #1C1C1E, Raised #F2F2F5 / #2C2C2E
- Label #1D1D1F / #F5F5F7, Secondary #6E6E73 / #98989F
- Ink #1D1D1F / #F5F5F7, spectrum #6366F1 → #A855F7 → #EC4899 → #F97316 → #EAB308 (meters and sign-in only)
- Current page in the sidebar: `--nav-current` #FFFFFF / #222225
- Good #248A3D / #30D158, Warning #C93400 / #FF9F0A, Critical #D70015 / #FF453A

### Quick Summary

Big-screen operations dashboard: docked sidebar in the canvas tone with quiet line icons and the current page on a sheet, folding to an icon rail; a breadcrumb toolbar; stat tiles with sparklines, live charts in the data palette, inset grouped sheets on a soft canvas, dense 40px tables, monochrome ink actions, status colors only for state.

### Example Component Prompts

- "A widget: Sheet, 12px radius, 16px padding. Top row: a glyph and 'Disk capacity' in 13px secondary. Value '168 GiB' in 28px rounded semibold with 'of 228 GiB' in secondary. A 6px capacity meter below with '74%' at the right."
- "A list page: page header with a 26px semibold title, one-line description and a 32px primary button; a row with a search field and a segmented filter; then a Group containing a table with 40px rows."

### Ready-to-Use Prompt

"Build this screen in the Kelp design system: a big-screen operations dashboard, not a landing page. Stat tiles with sparklines and live charts in the data palette, inset grouped sheets, compact rounded-rectangle controls, monochrome ink actions, the spectrum only for meters, status colors only for state, no decorative gradients."

### Iteration Guide

1. Is the answer visible above the fold?
2. Could any box be removed and replaced by spacing?
3. Does every color mean something?
4. Are numbers aligned and units lighter?
5. Does every animation answer an action or new data?

## Optional Appendix: Interaction Patterns

- Selection springs (stiffness 500, damping 40). Sheets slide from the trailing edge in 280ms. Popovers scale from 0.96 at their anchor in 150ms.
- Refreshing data rolls changed digits; unchanged digits stay still.
- Destructive actions on non-empty resources use hold-to-confirm or a typed confirmation.
- Reduced motion turns springs into fades and stops digit rolls.

## Optional Appendix: Content & Messaging Patterns

- Name things by what the operator sees: "Volumes", "Buckets", "Access keys".
- Health in one sentence: "Healthy. 1 volume server reporting."
- Errors say what failed and what to do next.
- Buttons say what happens: "Create bucket", "Vacuum volume", "Delete user".

## Optional Appendix: Evidence Notes

- From x.ai: the restraint of a monochrome chrome with color reserved for meaning, and quiet, confident numbers. Its marketing patterns (hero headlines, mesh-gradient cards, bento links) were deliberately left behind; they belong on a landing page, not in a console.
- From Apple's Human Interface Guidelines (Sidebars) and WWDC25 "Get to know the new design system": capsules for standout actions while dense desktop controls stay rounded rectangles; rounded numerals for metrics. Colored icon tiles were tried and dropped: they read as mobile, not desktop.
- From ReUI's app shells (reui.io): the docked sidebar in the canvas tone with a hairline, the neutral current-page fill, folding to an icon rail. React Bits supplied the gliding highlight and the rail's tooltips.
- Tried and dropped (v0.6): the floating glass sidebar inset 8px from the window with a spectrum bar on the current row. It read as a separate floating panel competing with the content, and its blur cost frames while scrolling.

## Loading and change

Nothing on screen jumps. Data arrives, it doesn't appear.

- **Loading**: `Loaded` holds skeleton, error and content in one grid cell and crossfades between them. The header stays mounted. The skeleton is the page's real structure, with real `Panel` and `Section` titles around ghosts from `skeletons.tsx`, so content lands where its placeholder stood. It stays hidden for the first 120 ms, so a fast answer shows none.
- **Once per page**: the first time a page's content shows in a session it makes its entrance: it sharpens in from a 6 px blur, bars grow, lines draw, digits spin and rows rise. That holds even when hovering the link already fetched the data. Content that loads (skeleton first) always makes its entrance. Revisiting a page whose data is loaded shows it directly, like a native app; so do tab switches and re-renders (`ArrivalContext`, `useArriving`).
- **Catch-up**: for 1.5 s after a view appears (`CATCH_UP_MS`), changes land as they are: opening a page from cache brings fresher numbers a moment later, and nobody has read the old ones yet. After that, changes move, because someone is watching.
- **Refresh**: a refetch with no news changes nothing. New numbers roll, charts morph one frame across lines, window and axis, and a failed refresh keeps the data on screen. The toolbar edge lights only for requests that take longer than 700 ms.
- **Text**: changing short text goes through `TextMorph`, per letter (per word above 32 characters). Numbers with units go through `RollingValue`.
- **Swaps**: tabs, modes and empty states crossfade through `Swap`.
- **Pages**: a view transition captures only the page area: the old page dissolves in 120 ms while the new one rises 10 px into place over 360 ms, sliding under the toolbar. The root is never captured, so the sidebar and toolbar stay live and their glass and shadows never redraw. Filters in the URL don't animate the page. The theme spreads from the pointer in a circle.
- **Measure**: `scripts/motion-qa.ts` screenshots each route loading and loaded, and `e2e/motion.spec.ts` fails a route whose layout shift reaches 0.03.
- **Tokens**: `EASE`, `SPEED` and `SPRING` in `motion.ts`. Never hard-code a curve or duration in a component.

## Performance

Motion is only worth having if it runs at the display's rate. These rules come from profiling Kelp, not from taste:

- **Page-sized motion animates opacity and transform only.** A blur or filter on a page, a table or a chart repaints all of it on every frame. Small text may still morph.
- **No backdrop blur on sticky chrome.** The sidebar and toolbar are solid; glass is for small floating bars.
- **No layout reads while a page mounts.** `getBoundingClientRect`, `offsetWidth` and `document.fonts.ready` in a layout effect force the browser to lay out the whole new page early, inside the page transition. Measure from a `ResizeObserver` (its first callback arrives after layout, before paint).
- **Unchanged text renders nothing.** `TextMorph` and `RollingValue` are memoized; every glyph tracks its layout, so a re-render with the same text must not reach them. Don't morph text that changes on every navigation (titles, breadcrumbs): the page crossfade already covers it.
- **Formatters are built once** (`Intl.DateTimeFormat`, `Intl.NumberFormat`), never per call.
- **The first download stays small.** Route files export only `Route`; helpers live in `src/components/kelp/<area>`. Libraries sit in their own cached chunks. Things used on demand (the command menu) load on demand.
- **Data starts early.** `index.html` asks for the session (and the overview's numbers) while scripts download; route loaders prefetch every query their page needs, telemetry included.

Budgets, measured with `bun scripts/perf-profile.ts` against a production build (`--cpu 4 --network 4g` for a slow laptop or phone on mobile data):

| Measure                                             | Budget   | v0.5.1   | v0.6   |
| --------------------------------------------------- | -------- | -------- | ------ |
| Overview data on screen, cold, 4× CPU + 4G          | ≤ 2 s    | 3.2 s    | 1.6 s  |
| Overview data on screen, cold, unthrottled          | ≤ 300 ms | 537 ms   | 116 ms |
| Bytes on a first visit (compressed)                 | ≤ 450 KB | 1,466 KB | 437 KB |
| Frames over 20 ms during a page change, unthrottled | ≤ 5%     | ~25%     | ~2%    |
| Frames over 20 ms while scrolling, 4× CPU           | ≤ 5%     | 15%      | ≤ 4%   |
