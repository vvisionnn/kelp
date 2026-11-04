# Design System: Kelp

Kelp is the console an operator keeps open next to a SeaweedFS cluster. This file is the source of truth for how it looks and behaves: concept, tokens, components, layout and motion. Implementation lives in `src/index.css` (tokens), `src/components/ui` (controls) and `src/components/kelp` (Kelp's own primitives).

## 1. Visual Theme & Atmosphere

**A calm instrument.** Kelp is a dashboard, not a landing page. People come to answer a question ("is the cluster healthy?", "which bucket grew?", "why did that job fail?") and to act. Every screen is built to be scanned in seconds and worked in for hours.

Two influences, used as concepts and never copied:

- **Monochrome with meaning** (from x.ai): the chrome is black, white and greys; color appears only where it carries information.
- **Apple-grade craft** (from the Human Interface Guidelines and the Liquid Glass language): navigation floats on a glass layer above the content, controls are compact rounded rectangles in dense areas, hierarchy comes from type and spacing rather than boxes, and motion answers what the person did.

### Key Characteristics

- A floating glass sidebar, inset from the window edge, with System Settings style colored icon tiles. This is the main place color lives.
- A sticky glass toolbar per page: title on the left, search and page actions on the right. Content scrolls beneath both glass layers.
- Inset grouped sections (white sheets on a soft grey canvas in light, raised greys on near-black in dark), with hairline separators between rows.
- Dense, legible tables: 40px rows, 13px text, tabular numerals, units in secondary ink.
- Numbers in SF Pro Rounded where the platform has it, so metrics read like Apple widgets.
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
| Accent (Tide)   | `--primary`          | #0A66E8                | #3D8BFF                | Primary buttons, links, focus, selection         |
| Destructive     | `--destructive`      | #E5352B                | #FF5A50                | Delete and irreversible actions                  |

### Primary

**Tide** is Kelp's one interaction color: a clear, slightly deep blue. It marks what you can do (primary buttons, links, toggles that are on, focus rings, the current selection in tables) and nothing else. It is never used for decoration or for data.

### Interactive

- Primary button: Tide fill, white label.
- Secondary button: Fill (translucent grey) with label ink.
- Plain button: label ink, Fill on hover.
- Focus: 2px Tide ring at 2px offset (`--ring`).

### Identity tiles

Each page in the sidebar has a colored rounded-square tile with a white glyph, the way macOS System Settings does. The tile color identifies the page and repeats wherever that page is referenced (command menu, page header). Tile colors never encode state.

| Page             | Tile    |
| ---------------- | ------- |
| Overview         | #3A3A3C |
| Nodes            | #5E5CE6 |
| Volumes          | #0A84FF |
| Collections      | #30B0C7 |
| Erasure coding   | #BF5AF2 |
| Buckets          | #FF9F0A |
| Files            | #5AC8FA |
| Tables           | #FFB800 |
| Users            | #FF375F |
| Groups           | #A2845E |
| Service accounts | #7D7AFF |
| Policies         | #8E8E93 |
| Maintenance      | #636366 |
| Messaging        | #30D158 |
| Settings         | #8E8E93 |

Tiles have a soft top-light gradient (white at 22% fading to transparent) and a 0.5px inner edge, like an app icon.

### Status (reserved)

| State    | Light   | Dark    | Always paired with            |
| -------- | ------- | ------- | ----------------------------- |
| Good     | #248A3D | #30D158 | a dot or check, and a word    |
| Warning  | #C93400 | #FF9F0A | a triangle or dot, and a word |
| Critical | #D70015 | #FF453A | an octagon or dot, and a word |
| Info     | Tide    | Tide    | an info glyph                 |

Status colors appear as small dots, glyphs and tinted pills (12% fill, full-strength text). Never as large fills.

### Data palette

For charts and meters only, in this fixed order (validated for color-vision deficiency on both surfaces):

- Light: #2563C9, #C8452E, #0E8A79, #7D55C7, #9A7012
- Dark: #2F86E0, #D9573F, #1FA591, #9D74E0, #B98B2A

Capacity meters use Tide below 80%, Warning from 80% and Critical from 95%, always with the percentage in text beside them.

### Surface & Overlay

- Glass (sidebar, toolbar, floating bars): canvas color at 72% (light) / 64% (dark) with `backdrop-filter: blur(24px) saturate(180%)`, a 0.5px edge and a 1px inner top highlight.
- Overlay behind dialogs and sheets: black at 24% (light) / 48% (dark) with 2px blur.

### Shadows & Depth

- Sheet: none in dark; `0 1px 2px rgb(0 0 0 / .04)` in light, plus the 0.5px separator outline.
- Glass: `0 8px 32px rgb(0 0 0 / .08)` light, `0 8px 32px rgb(0 0 0 / .5)` dark.
- Popover and dialog: `0 12px 40px rgb(0 0 0 / .14), 0 0 0 .5px rgb(0 0 0 / .08)`; dark uses .55 and a white edge at .1.

## Theme Modes

### Light Mode

Soft grey canvas (#F5F5F7), white sheets, near-black label (#1D1D1F). Separators are 8% black. Glass is bright and frosted. Tide is #0A66E8.

### Dark Mode

Near-black canvas (#0E0E10), sheets at #1C1C1E and raised controls at #2C2C2E, so depth reads as lighter-is-closer. Labels are #F5F5F7, separators 8% white. Glass is smoky. Tide lifts to #3D8BFF to hold contrast.

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
- Primary: Tide fill, white text, 500 weight. Hover darkens. Press scales to 0.98.
- Secondary: Fill background, label text. Plain: transparent, Fill on hover.
- Destructive: red text on Fill; in confirmations a red fill. Deleting a populated resource uses hold-to-confirm (React Bits HoldButton).
- Links: Tide text, no underline until hover.

### Cards and Containers

- **Group**: the inset grouped section. Sheet surface, 12px radius, 0.5px separator outline, rows separated by hairlines inset 16px from the leading edge. An optional title (section title style) and footnote sit outside the group, above and below.
- **Widget**: a Group used for one metric or chart. 16px padding, label row (glyph + headline in secondary), metric below, optional meter.
- No nested cards. No gradient fills.

### Inputs and Interactive Controls

- Text fields: 32px, 8px radius, Raised fill with a faint edge; on focus a Tide ring. Search fields carry a magnifier glyph and a ⌘K hint.
- Segmented control: Raised track, white (light) or #636366 (dark) thumb with a soft shadow; the thumb springs between segments (React Bits RubberSegment). Used for filters and view switches.
- Switch: iOS proportions, Tide when on.
- Checkbox: 16px, 4px radius, Tide fill when checked.
- Select and menus: popover surface, 6px radius items, Tide fill on the highlighted item with white text.

### Navigation

- **Sidebar**: floats 8px from the window edges, 248px wide, 16px radius, glass. Top: Kelp app icon, name, and a one-line cluster status. Then sections (Cluster, Storage, Object store, Access, Operations) with caption-style labels, then items: 20px identity tile, 13px label, 32px row, 8px radius. The selected row gets the Fill background and a 600-weight label. Bottom: the account button.
- **Toolbar**: 52px, sticky, glass. Leading: sidebar button (compact widths), back button on detail pages ("‹ Volumes"), and the page title once the page header scrolls away. Trailing: search field.
- **Page header**: 26px bold title with the page's identity tile, a one-line description in secondary ink, and page actions at the trailing edge.

### Tables

- No header band. Column headers are footnote size in secondary ink with sort glyphs.
- Rows are 40px, separated by hairlines; hover uses Raised; selected rows use Tide at 10%.
- Numbers right-aligned, tabular. Identifiers in mono. Empty cells show an en dash in tertiary ink.
- A table lives inside a Group; its toolbar (search, segmented filter, actions) sits above it, outside the group.

### Badges and Status

- Status pill: capsule, 20px, 12% tinted fill, 500-weight 12px text, leading dot.
- Neutral tag: Raised fill, secondary label, 6px radius.
- Job and task state (pending, running, done, failed, canceled): React Bits StatusMark next to a word.

### Image Treatment

Previews sit on a Raised surface with 12px radius. Images never bleed to the window edge.

### Distinctive Components

- **Identity tiles** in the sidebar, page headers and command menu.
- **Rolling metrics**: values change with React Bits Counter digit rolls when data refreshes.
- **Capacity meter**: 6px track in Fill, value in Tide/Warning/Critical with the percent beside it.
- **Hold to delete**: destructive actions on populated resources fill as you hold, so nothing important is lost to a misclick.

## 5. Layout Principles

### Spacing System

4px base, used in steps of 4, 8, 12, 16, 20, 24, 32, 48. Rows pad 10–12px vertically and 16px horizontally. Groups are 16px apart in a stack and 32px apart between sections.

### Grid & Container

- Window: sidebar (248px plus 8px insets) and a content column.
- Content column: 24px side padding (32px from 1280px), max width 1400px, left-aligned.
- Overview and list pages use a 12-column grid with 16px gutters; widgets span 3, 4, 6 or 12 columns.

### Whitespace Philosophy

Density with calm: tight inside a group, generous between groups. A page shows the answer above the fold at 1440×900.

### Border Radius Scale

Concentric with the window: sidebar 16, groups and widgets 12, controls and sidebar rows 8, menu items and tags 6, checkboxes 4, pills 9999.

## 6. Depth & Elevation

| Level | Surface                  | Treatment                       |
| ----- | ------------------------ | ------------------------------- |
| 0     | Canvas                   | flat                            |
| 1     | Sheet (groups, widgets)  | separator outline, faint shadow |
| 2     | Glass (sidebar, toolbar) | blur, saturate, edge, shadow    |
| 3     | Popover, menu, tooltip   | popover surface, popover shadow |
| 4     | Dialog, sheet panel      | overlay plus popover shadow     |

### Depth Principles

- Glass is for navigation and controls that float above content, never for content itself.
- In dark mode, closer surfaces are lighter; shadows are secondary.

## 7. Do's and Don'ts

### Do

- Put the answer first: health, capacity and problems at the top of the page.
- Group related settings and facts into inset groups with titles outside.
- Use identity tiles to connect a page with every reference to it.
- Keep numbers tabular, right-aligned and with lighter units.
- Animate in response to actions: selection, opening, confirming, refreshing.

### Don't

- No landing-page patterns: hero headlines, marketing copy, giant stat bands, bento grids of links, decorative gradients.
- No glass on content, no nested cards, no borders and shadows stacked on the same element.
- No color for decoration; Tide is only for interaction, status colors only for state.
- No ambient or looping animation inside the app.
- No all-caps labels or letter-spaced eyebrows.

## 8. Responsive Behavior

### Breakpoints

| Name    | Width     | Behavior                                                  |
| ------- | --------- | --------------------------------------------------------- |
| Compact | < 1024    | Sidebar becomes a sheet from the toolbar's sidebar button |
| Regular | 1024–1279 | Floating sidebar, widgets reflow to 6 columns             |
| Wide    | ≥ 1280    | Full grid, 32px content padding                           |

### Touch Targets

Rows and buttons are at least 32px tall on pointer devices and grow to 40px under `pointer: coarse`.

### Collapsing Strategy

Tables keep identity and status columns and drop secondary columns first; side columns on detail pages stack under the main column.

## 9. Agent Prompt Guide

### Quick Color Reference

- Canvas #F5F5F7 / #0E0E10, Sheet #FFFFFF / #1C1C1E, Raised #F2F2F5 / #2C2C2E
- Label #1D1D1F / #F5F5F7, Secondary #6E6E73 / #98989F
- Tide #0A66E8 / #3D8BFF
- Good #248A3D / #30D158, Warning #C93400 / #FF9F0A, Critical #D70015 / #FF453A

### Quick Summary

Apple-grade operations dashboard: floating glass sidebar with colored identity tiles, sticky glass toolbar, inset grouped sheets on a soft canvas, dense 40px tables, 13–14px system type with rounded tabular numerals, one blue interaction color, status colors only for state.

### Example Component Prompts

- "A widget: Sheet, 12px radius, 16px padding. Top row: a glyph and 'Disk capacity' in 13px secondary. Value '168 GiB' in 28px rounded semibold with 'of 228 GiB' in secondary. A 6px capacity meter below with '74%' at the right."
- "A list page: page header with tile, 26px bold title, one-line description and a 32px primary button; a row with a search field and a segmented filter; then a Group containing a table with 40px rows."

### Ready-to-Use Prompt

"Build this screen in the Kelp design system: Apple-grade dashboard, not a landing page. Floating glass sidebar and toolbar, inset grouped sheets, compact rounded-rectangle controls, Tide blue for interaction only, status colors only for state, system font with rounded tabular metrics, no decorative gradients."

### Iteration Guide

1. Is the answer visible above the fold?
2. Could any box be removed and replaced by spacing?
3. Does every color mean something?
4. Are numbers aligned and units lighter?
5. Does every animation answer an action?

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
- From Apple's Human Interface Guidelines (Materials, Sidebars) and WWDC25 "Get to know the new design system": navigation on a floating glass layer above content; capsules for standout actions while dense desktop controls stay rounded rectangles; concentric radii; System Settings identity tiles; SF Pro Rounded for widget numerals.
