# Design System: Kelp

## 1. Visual Theme & Atmosphere

Kelp is a console for object storage that looks like a quiet, deep-water instrument: a near-black canvas with almost no chrome, where information sits in large, confident type and color appears only where it means something. The base is strictly monochrome: jet black to ivory, white text, white pill buttons. Each product area owns one luminous hue family, rendered as a soft mesh-gradient "aurora" that glows inside cards like bioluminescence in the dark. The result should feel premium and calm, closer to a frontier-tech product page than an admin panel. Generous space, few borders, big numbers, and motion that responds rather than decorates.

The language is derived from x.ai (observed November 2026): a jet `#0A0A0A` canvas, `#1A1A1A` 16-pixel cards, pill CTAs, a frosted sticky header, 60-pixel headlines with negative tracking, mesh-gradient feature cards, a sheen that sweeps cards on hover, and a hairline spectrum gradient used as an accent. Kelp keeps that discipline and adds an ocean vocabulary: a five-hue "Kelp spectrum" mapped to product areas, contour and ray motifs from underwater light, and a grain texture that keeps gradients from looking digital.

- Overall feeling: deep, calm, precise; a dark instrument panel lit from within.
- Visual density: low to medium. Data-heavy pages use tables, but every page opens with space, a large title and a few big numbers.
- Brand posture: confident and technical, never playful. Copy is plain and direct.
- Signature motifs: area auroras (mesh gradients with grain), giant tabular numerals separated by hairlines, white pill actions, the Kelp spectrum hairline, light rays and strands on the sign-in page.

### Key Characteristics

- Monochrome UI chrome; color is reserved for area identity, data and status.
- Every product area has one aurora hue family; the same hue marks its nav item, its page hero and its data series.
- Pills for actions and navigation (`border-radius: 9999px`), 16-pixel radius for cards, 12-pixel radius for inputs.
- Headlines are large (48–60 px) with weight 450–500 and about -1% tracking; labels are sentence case at 55–60% opacity, never all caps.
- Cards are filled surfaces without borders in dark mode; hairlines (`rgba(255,255,255,0.08)`) separate rows and stats.
- Motion is crisp (150–250 ms) and purposeful: numbers count, sheen sweeps on hover, auroras drift slowly, lists spring in.

## 2. Color Palette & Roles

| Role                  | Semantic Name | Value                                                               | Usage                                                     |
| --------------------- | ------------- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| Canvas (dark)         | Abyss         | #0A0A0A                                                             | Page background in dark mode, header base                 |
| Surface (dark)        | Trench        | #1A1A1A                                                             | Cards, tables, popovers in dark mode                      |
| Raised (dark)         | Shelf         | #212121                                                             | Secondary pill buttons, hover rows, inputs on cards       |
| Hairline (dark)       | Basalt        | #1F2228                                                             | Borders, dividers, header bottom edge                     |
| Muted text            | Fog           | #7F848B                                                             | Secondary text, placeholders, meta                        |
| Soft text             | Pewter        | #A6B0BC                                                             | Tertiary text in light mode, icons at rest                |
| Hairline (light)      | Dove          | #D6DBE5                                                             | Borders and dividers in light mode                        |
| Surface (light)       | Shell         | #F8F7F5                                                             | Cards in light mode (warm ivory)                          |
| Canvas (light)        | Foam          | #FFFFFF                                                             | Page background in light mode                             |
| Ink                   | Jet           | #0A0A0A                                                             | Text and primary pill in light mode                       |
| Primary action (dark) | Moonlight     | #FFFFFF                                                             | Primary pill background in dark mode, headings            |
| Spectrum              | Kelp spectrum | linear-gradient(90deg, #6366F1, #A855F7, #EC4899, #F97316, #EAB308) | Active underline, progress, focus accent, brand hairlines |

### Primary

- Primary action is monochrome: a white pill with jet text in dark mode, a jet pill with white text in light mode. Never a colored primary button.
- Secondary action is a Shelf `#212121` pill with white text in dark mode, a Nimbus `#F2F3F7` pill with jet text in light mode.
- Destructive actions use a coral-tinted pill (`#F0607E` text on 12% coral fill), never a solid red block.

### Interactive

- Links are white (dark) or jet (light) with 60% opacity at rest and full opacity on hover; inline links underline with a 1 px line offset 4 px.
- Focus: a 2 px ring in `rgba(255,255,255,0.55)` (dark) or `rgba(10,10,10,0.55)` (light) with a 2 px canvas-colored gap, so it reads on any surface.
- Active navigation uses a filled Shelf pill plus a 2 px Kelp-spectrum underline that glides between items.

### Area Hues (aurora families)

Each area owns a hue. Its aurora is a mesh of three radial gradients over the surface color, plus film grain at 6–8% opacity.

| Area         | Name            | Deep    | Core    | Glow    | Data (dark) | Data (light) |
| ------------ | --------------- | ------- | ------- | ------- | ----------- | ------------ |
| Storage      | Current         | #0B2A5C | #2F86E0 | #8FD0FF | #2F86E0     | #2563C9      |
| Object store | Coral           | #5C0F2A | #F0607E | #FFB199 | #D9573F     | #C8452E      |
| Operations   | Lagoon          | #062E33 | #1FA591 | #A3F0E2 | #1FA591     | #0E8A79      |
| Cluster      | Bioluminescence | #241552 | #8B6CF0 | #C9B6FF | #9D74E0     | #7D55C7      |
| Access       | Sunset          | #4A1D05 | #F28A2E | #FFD18A | #B98B2A     | #9A7012      |

The Data columns form Kelp's categorical palette, assigned in this fixed order (blue, coral, teal, violet, amber). It was checked with a palette validator: every slot in the OKLCH lightness band, adjacent colors separable under color-vision deficiency (worst ΔE 10.2–11.0), and at least 3:1 contrast on Trench, Abyss and Shell.

### Neutral Scale

- Abyss `#0A0A0A`: dark canvas.
- Trench `#1A1A1A`: dark surface.
- Shelf `#212121`: dark raised surface, secondary pill.
- Basalt `#1F2228`: dark hairline (also `rgba(255,255,255,0.08)` over images and auroras).
- Steel `#35383C`: dark scrollbar thumb, disabled fills.
- Fog `#7F848B`: muted text in both modes.
- Pewter `#A6B0BC`: soft icons.
- Dove `#D6DBE5`: light hairline.
- Nimbus `#F2F3F7`: light raised surface, secondary pill.
- Shell `#F8F7F5`: light surface.
- Foam `#FFFFFF`: light canvas.

### Status (reserved)

Status colors never double as area hues and always come with an icon and a word.

- Healthy: `#4ADE80` (dark) / `#16A34A` (light), label "Healthy", "Writable", "Running".
- Attention: `#FACC15` (dark) / `#B45309` (light), label "Needs attention", "Read-only".
- Failing: `#F87171` (dark) / `#DC2626` (light), label "Unreachable", "Failed", "Missing shards".
- Neutral: Fog, label "Idle", "Off", "Not configured".

### Surface & Overlay

- Header: canvas at 80% opacity with a 12 px backdrop blur and a hairline bottom border once the page scrolls.
- Popovers and menus: Trench `#1A1A1A` (dark) / Foam (light), 16 px radius, hairline ring, shadow `0 24px 48px -12px rgba(0,0,0,0.6)`.
- Dialogs: same as popovers over a scrim of `rgba(0,0,0,0.6)` with a 4 px blur.
- Aurora: three radial gradients (deep at the bottom left, core in the middle, glow at the top right) over the surface, with a grain overlay at 7% opacity.

### Shadows & Depth

- Cards use no shadow in dark mode; elevation comes from surface steps (Abyss → Trench → Shelf).
- Floating layers use `0 24px 48px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)`.
- In light mode floating layers use `0 24px 48px -16px rgba(10,10,10,0.18), 0 0 0 1px rgba(10,10,10,0.06)`.

## Theme Modes

### Light Mode

- Background: Foam `#FFFFFF`.
- Surface: Shell `#F8F7F5` cards, Nimbus `#F2F3F7` raised controls.
- Text: Jet `#0A0A0A`, muted at 55%.
- Accent: area hues stay, auroras lighten (glow stop leads, deep stop drops to 40%).
- Notes: cards gain no borders; separation comes from the warm ivory against white. Primary pills invert to jet.

### Dark Mode

- Background: Abyss `#0A0A0A`.
- Surface: Trench `#1A1A1A` cards, Shelf `#212121` raised controls.
- Text: Moonlight `#FFFFFF` headings, `#E7E9EE` body, muted at 55–60%.
- Accent: full-strength area auroras; the spectrum hairline glows.
- Notes: dark is the signature mode and the default when the system has no preference.

## 3. Typography Rules

One family carries the whole interface: a neutral grotesque with a variable weight axis, set large and tight for display and plain for reading. Monospace is only for machine values.

### Font Family

- Primary: Geist (variable, weights 100–900), standing in for x.ai's proprietary xVf.
- Monospace: Geist Mono, for addresses, ids, paths, keys, code and policy JSON.
- OpenType Features: tabular numerals (`font-variant-numeric: tabular-nums`) for every number that updates or aligns.

### Hierarchy

| Role          | Font       | Size | Weight | Line Height | Letter Spacing | Notes                                                   |
| ------------- | ---------- | ---- | ------ | ----------- | -------------- | ------------------------------------------------------- |
| Display       | Geist      | 60px | 450    | 1.0         | -0.6px         | Sign-in and overview headlines only                     |
| Page title    | Geist      | 48px | 500    | 1.0         | -0.48px        | One per page; 36px on mobile                            |
| Section title | Geist      | 28px | 500    | 1.2         | -0.28px        | Major sections inside a page                            |
| Card title    | Geist      | 16px | 500    | 1.375       | -0.16px        | Card and panel headings                                 |
| Lead          | Geist      | 18px | 400    | 1.6         | 0              | Page descriptions under titles                          |
| Body          | Geist      | 15px | 400    | 1.6         | 0              | Default reading text                                    |
| UI label      | Geist      | 14px | 500    | 1.43        | 0              | Buttons, tabs, nav items (13px in the header)           |
| Label         | Geist      | 14px | 500    | 1.43        | 0              | Section labels above titles, 60% opacity, sentence case |
| Meta          | Geist      | 13px | 400    | 1.5         | 0              | Table headers, captions, timestamps, 55% opacity        |
| Big number    | Geist      | 56px | 450    | 1.0         | -0.56px        | Stat rows (tabular); 40px on mobile                     |
| Code          | Geist Mono | 13px | 400    | 1.6         | 0              | Addresses, ids, paths, JSON                             |

### Principles

- Size and weight carry hierarchy; color stays monochrome. Muted text is the same color at lower opacity.
- No all-caps labels, no letter-spaced eyebrows. Labels are sentence case at 60% opacity.
- Numbers are heroes: show the value large, the unit small and muted beside it ("57 volumes", "171 GiB of 228 GiB").
- Mono never appears in headings; a mono value inside a sentence stays at body size.

## 4. Component Stylings

### Buttons and Links

- Primary CTA: pill, height 40 px, padding 0 18 px, 14 px weight 500, Moonlight on Abyss (dark) or Jet on Foam (light). Hover lightens to Ivory `#F8F7F5` (dark) or Umbra `#1F2228` (light). An optional trailing chevron nudges 2 px right on hover.
- Secondary CTA: same pill on Shelf `#212121` (dark) / Nimbus `#F2F3F7` (light).
- Ghost: text-only, 60% opacity, full on hover, used for "View all" with a trailing chevron.
- Destructive: coral text on a 12% coral pill; in dialogs it becomes a solid coral pill only for the final confirmation.
- Icon buttons: 36 px circles on Shelf or transparent.
- Small: height 32 px, padding 0 14 px, 13 px label.
- Hover and active feel: 150 ms color transitions, a 1 px press-down on active, no scale bounces.

### Cards and Containers

- Surface style: Trench `#1A1A1A` (dark) / Shell `#F8F7F5` (light), no border.
- Radius: 16 px; inner tiles 12 px.
- Border: none on cards; hairlines only between rows and stats.
- Shadow or elevation: none; surface steps instead.
- Internal spacing: 24 px padding (20 px on mobile), 16 px gaps between stacked elements.
- Hover on interactive cards: a diagonal sheen (white 6–10%) sweeps across in 700 ms (React Bits GlareHover), and the aurora brightens slightly.

### Aurora Cards (signature)

- The area hero and the overview bento use aurora cards: a Trench card with the area mesh gradient, a grain overlay, white text, and big numbers.
- Gradient recipe (dark): `radial-gradient(at 0% 100%, Deep 0, transparent 55%), radial-gradient(at 55% 40%, Core/0.55 0, transparent 60%), radial-gradient(at 100% 0%, Glow/0.45 0, transparent 50%)` over Trench.
- In light mode the same stops sit over Shell at about 60% strength, with jet text.
- The gradient drifts slowly (40 s loop, 4–8% translation) and is still under reduced motion.

### Inputs and Interactive Controls

- Input treatment: height 40 px, 12 px radius, transparent fill with a hairline ring (`rgba(255,255,255,0.10)` / `rgba(10,10,10,0.12)`), 15 px text, placeholder at 40%.
- Focus behavior: the ring brightens to 55% and gains a 3 px outer glow at 12%.
- Selection states: switches and checkboxes fill white (dark) / jet (light); selects open a 16 px popover; segmented controls are pill groups on Shelf with a sliding white pill.
- Search: a pill input with a leading icon and a `⌘K` hint.

### Navigation

- Structure: one sticky top bar (64 px). Left: the Kelp mark and wordmark. Center: five area pills (Cluster, Storage, Object store, Access, Operations), each opening a mega menu of its pages with one-line descriptions and the area aurora as a thin top glow. Right: a search pill (⌘K), the theme switch, and the account pill.
- Background treatment: canvas at 80% with a 12 px blur; a hairline appears after scrolling 8 px.
- Link style: 13 px weight 500, 60% opacity at rest, full on hover; the active area gets a Shelf pill fill and the spectrum underline.
- Sticky or scroll behavior: always visible. Inside long pages, section tabs stick 8 px below it.
- Mobile: the center pills collapse into a menu button that opens a full-screen staggered menu (React Bits StaggeredMenu pattern) grouped by area.

### Tables

- Live inside a card with no outer border; 48 px rows; header 13 px at 55% opacity on the card surface (no fill band).
- Rows are separated by hairlines; hover fills `rgba(255,255,255,0.03)` (dark) / `rgba(10,10,10,0.025)` (light).
- Numeric columns are right-aligned and tabular; identifiers use mono.
- Selection checkboxes appear on hover and stay visible once any row is selected; a floating action bar (pill, Shelf) slides up from the bottom.

### Badges and Status

- Badges are pills: height 22 px, 12 px weight 500, padding 0 8 px, hue text on a 12% fill of the same hue.
- Status is a dot plus a word; healthy dots pulse softly (2 s), failing dots never animate.
- Live or new markers use a ShinyText sheen on the word.

### Image Treatment

- File previews sit on a checkerboard-free Shelf surface with a 12 px radius.
- No stock imagery. Illustration comes from code: auroras, contour lines, light rays, strands.

### Distinctive Components

- **Stat band**: three or four giant numbers in a row, separated by vertical hairlines, labels under each at 55%. Numbers count up on first view (React Bits CountUp) and roll digits on change (Counter).
- **Area hero**: label (area name), page title, lead, pill actions, and to the right or below an aurora card with the area's two or three headline numbers.
- **Overview bento**: a grid of five aurora cards, one per area, with live numbers and "Open" ghost links, plus a wide health card.
- **Activity stream**: a list where new rows spring in (React Bits AnimatedList pattern), each with a status mark.
- **Spectrum progress**: progress bars and capacity meters fill with the Kelp spectrum (or the area core hue) on a 4 px track; above 80% they shift to attention, above 95% to failing.

## 5. Layout Principles

### Spacing System

- Base unit: 4 px.
- Repeated spacing values: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- Section rhythm: 64 px between major sections (48 px on mobile); 24 px between cards in a grid.

### Grid & Container

- Grid logic: 12 columns with 24 px gutters; content often splits 7/5 or 8/4.
- Max content width: 1232 px centered (104 px side margins at 1440 px), 24 px side padding below 1280 px, 16 px on mobile.
- Section spacing: page hero ends 48 px above the first content block.

### Whitespace Philosophy

- Whitespace philosophy: space is the frame. No page starts with a table; it starts with a title, a sentence and the numbers that matter.
- Alignment tendencies: left-aligned content; centered layouts only for sign-in, empty states and the not-found page.
- Content width behavior: reading text stays under 72 characters; tables use the full container.

### Border Radius Scale

- Micro: 6 px (tags inside inputs, tooltips).
- Standard: 12 px (inputs, inner tiles, menus items).
- Large: 16 px (cards, popovers, dialogs).
- Pill: 9999 px (buttons, badges, nav items, search).

## 6. Depth & Elevation

| Level   | Treatment                                  | Use                                            |
| ------- | ------------------------------------------ | ---------------------------------------------- |
| Flat    | Canvas, no edge                            | Page background                                |
| Surface | Trench / Shell fill, no border             | Cards, tables                                  |
| Raised  | Shelf / Nimbus fill                        | Secondary buttons, hover rows, inputs on cards |
| Float   | Surface + hairline ring + soft long shadow | Menus, popovers, dialogs, toasts               |
| Focus   | 2 px ring with 2 px canvas gap             | Keyboard focus on anything interactive         |

### Depth Principles

- Surface hierarchy: depth reads through fill steps, not shadows.
- Shadow language: only floating layers cast shadows, long and soft.
- Blur, glass, or overlay behavior: the header and dialog scrims blur; nothing else does.
- When depth is used versus avoided: avoid stacked cards inside cards; inside a card, use hairlines or raised tiles.

## 7. Do's and Don'ts

### Do

- Keep chrome monochrome and let the area aurora carry color.
- Lead every page with a title, a one-sentence lead and big numbers.
- Use pills for every action and navigation item.
- Use mono only for machine values.
- Pair every status color with a word and an icon.
- Respect reduced motion: auroras stop drifting, counters jump to their value, sheen is off.

### Don't

- Don't use a colored primary button or a single brand green.
- Don't build a sidebar admin layout; navigation lives in the top bar.
- Don't put borders around cards in dark mode or stack cards inside cards.
- Don't write all-caps labels, letter-spaced eyebrows or "WORD — fragment" labels.
- Don't use more than one aurora hue on a page except on the overview bento.
- Don't animate on a loop without a reason; idle motion is limited to the slow aurora drift and the healthy pulse.

## 8. Responsive Behavior

### Breakpoints

| Name    | Width      | Key Changes                                                                                        |
| ------- | ---------- | -------------------------------------------------------------------------------------------------- |
| Mobile  | < 640px    | Menu button replaces area pills; titles 36 px; stat bands stack 2×2; tables hide secondary columns |
| Tablet  | 640–1023px | Area pills collapse to icons plus active label; grids go to two columns                            |
| Desktop | ≥ 1024px   | Full top bar; 12-column grid; 1232 px container                                                    |

### Touch Targets

- Interactive targets are at least 40 px tall (pills, rows); icon buttons are 36 px with a 44 px hit area on touch devices.
- Row actions stay visible on touch devices (no hover-only controls).

### Collapsing Strategy

- Desktop behavior: hero splits text and aurora side by side.
- Tablet behavior: aurora stacks under the title; bento becomes two columns.
- Mobile behavior: single column, full-width pills, stat bands become 2×2 tiles with hairlines.
- Breakpoint-driven component changes: mega menus become a full-screen staggered menu; tables drop to name, status and one key number.
- Touch target and spacing adjustments: card padding 20 px, section gaps 48 px.

## 9. Agent Prompt Guide

### Quick Color Reference

- Primary CTA: white pill `#FFFFFF` with `#0A0A0A` text (dark); `#0A0A0A` pill with white text (light).
- Background: `#0A0A0A` (dark) / `#FFFFFF` (light).
- Heading text: `#FFFFFF` (dark) / `#0A0A0A` (light).
- Body text: `#E7E9EE` (dark) / `#1A1A1A` (light); muted at 55–60% opacity.
- Border or ring: `rgba(255,255,255,0.08)` (dark) / `#D6DBE5` (light).
- Accent: area auroras (Current blue, Coral, Lagoon teal, Bioluminescence violet, Sunset amber) and the Kelp spectrum.

### Quick Summary

Kelp is a dark-first, monochrome storage console in the x.ai manner. Black canvas, `#1A1A1A` 16 px cards, white pill actions, a frosted top bar with area pills, 48–60 px tight headlines and giant tabular numbers separated by hairlines. Color appears only as per-area mesh-gradient auroras with grain, a five-hue data palette, reserved status colors, and a spectrum hairline. Motion is crisp: counters, sheen on hover, springy lists, slow aurora drift.

### Example Component Prompts

- Hero: "Area label 'Storage' at 60% opacity, 48 px title 'Volumes' weight 500 tracking -1%, an 18 px lead sentence, a white primary pill and a Shelf secondary pill; to the right a Current aurora card with three big tabular numbers and hairline dividers."
- Card: "Trench `#1A1A1A` card, 16 px radius, no border, 24 px padding, 16 px weight 500 title, 13 px muted meta, GlareHover sheen on hover."
- Navigation: "64 px sticky bar, canvas at 80% with 12 px blur, Kelp mark left, five 13 px area pills centered with the active one on a Shelf fill and a spectrum underline, search pill with ⌘K and an account pill on the right."
- Button or badge: "Pill badge 22 px tall, 12 px weight 500 text in the area hue on a 12% fill of that hue."

### Ready-to-Use Prompt

Build this screen in Kelp's design system: dark canvas `#0A0A0A`, `#1A1A1A` cards with 16 px radius and no borders, white pill primary buttons and `#212121` secondary pills, Geist with 48 px weight-500 titles at -1% tracking and 13–15 px body, mono only for machine values, hairline dividers `rgba(255,255,255,0.08)`, and a page hero that pairs the title with an area aurora card holding the key numbers. Use the area hue only inside its aurora, badges and data. Keep motion crisp and respect reduced motion.

### Iteration Guide

1. Remove color from chrome first; if a screen looks dull, add one aurora card, not more color.
2. Check the type scale: one 48 px title, then a jump to 28 px or 16 px. Nothing in between competes.
3. Replace boxes with hairlines wherever two things merely need separating.
4. Make the most important number on the page the largest thing after the title.
5. Verify both themes; the light theme must look designed, not inverted.

## Optional Appendix: Interaction Patterns

- Scroll behavior: the header gains its hairline after 8 px; section tabs stick under it; content fades up 8 px the first time it enters view (once).
- Hover behavior: links go from 60% to 100% opacity; cards get the sheen sweep; table rows tint; area pills preview their mega menu after 120 ms.
- Click behavior: buttons press 1 px; destructive actions confirm in a dialog that names the item; successful writes toast in the bottom right.
- Animation tone: crisp and restrained. 150 ms for color, 200–250 ms for layout, springs (stiffness 400, damping 32) for pills and lists, 40 s for aurora drift.

## Optional Appendix: Content & Messaging Patterns

- Headline pattern: short noun titles for pages ("Volumes", "Buckets"); statements for the overview ("Your cluster is healthy.").
- CTA language: verb + object ("Create bucket", "Vacuum volume", "Run now"); the toast repeats the noun ("Bucket media created").
- Trust signal pattern: live numbers and plain health sentences instead of badges.
- Voice and tone: plain, specific, calm. Errors say what happened and what to do.

## Optional Appendix: Observed Pages

- https://x.ai/ (dark and light): canvas `#0A0A0A` / `#FFFFFF`, cards `#1A1A1A` with 16 px radius, pill CTAs (white `#FFFFFF` primary, `#212121` secondary, 40 px tall, 10 × 18 px padding, 14 px weight 500), 64 px sticky header at 85% opacity with a 12 px blur, h1 60/60 weight 450 at -0.6 px, h2 48/48 weight 500 at -0.48 px, h3 16/22 weight 500 at -0.16 px, labels at 60% opacity, mesh-gradient feature cards (three radial gradients), a 120° white sheen that sweeps cards on hover, a hairline spectrum gradient (indigo → violet → pink → orange → amber), giant stat numbers separated by vertical hairlines, and a named palette (jet, charcoal, umbra, fog, pewter, dove, ivory, with sunset, dawn, dusk, twilight, breeze and midnight accents).

## Optional Appendix: Evidence Notes

- x.ai's display face (xVf) is proprietary; Geist is the closest open neo-grotesque with a variable weight axis.
- Area hues, the ocean vocabulary and the data palette are Kelp's own additions, not observed on x.ai.
