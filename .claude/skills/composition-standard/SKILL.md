---
name: composition-standard
description: Checkable composition, alignment, type and spacing standard for any grid-based layout (web pages, decks, dashboards, canvases, documents, video frames). Use before designing a layout, when a design reads as amateur or "off", when asked to review spacing, alignment, hierarchy or composition, and before showing any visual work. Gives 24 measurable rules, a workflow, and a script that measures a live page.
---

# Composition standard

A layout is judged on composition before anything else. Correct motion, color or copy on a badly composed layout earns nothing. This skill turns "good composition" into rules that can be measured, so work is checked before anyone else sees it.

## When to use
- Starting any layout: decide the grid and scales first (steps 1 and 2).
- Reviewing or fixing a layout that feels off: run the audit (step 4).
- Before presenting visual work: run the audit and show the proof.

## Workflow
1. **Fix the grid.** Pick columns, margin and gutter for each target width (default desktop 12 / 20px / 20px at 1440; phone 4 columns). Write the column start lines down. Everything snaps to them.
2. **Fix three scales before drawing:** a type scale (at most 7 sizes, steps of at least 1.2x), a spacing scale on a 4px base (4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160, 224), and line heights by role. No value outside a scale.
3. **Compose per section, not per page.** Each section names its start column, span, empty columns and padding pair. Adjacent sections must differ. Two-part splits are asymmetric (4+8, 5+7, 3+9).
4. **Audit.** For a live page run `scripts/measure.mjs` (needs Playwright, see usage). For static art, check by eye with the grid drawn over a screenshot. Read `references/rules.md` for each rule's measure.
5. **Prove it.** Show screenshots with the column lines drawn, and list any rule that still fails. Do not call design work done on a pass you did not measure.

## The rules in one line each
Full text, measures and sources: `references/rules.md`.

Grid and edges: 1 text starts on column lines. 2 one page-wide primary edge, hero included. 3 at most 3 left edges per section. 4 a text group shares one edge. 5 big type aligned optically by its glyph. 6 text widths are whole column spans, ragged right.
Type: 7 body 45 to 75 characters per line. 8 one scale, at most 7 sizes. 9 body line height 1.4 to 1.6, display 0.95 to 1.1. 10 no orphans.
Spacing: 11 every space on the scale. 12 gap inside a group is at most half the gap around it. 13 section padding large, varied, on the scale.
Composition: 14 a lead beside a headline aligns by baseline or cap top, never centered. 15 text beside media aligns to its edge. 16 text over media readable at its worst pixel. 17 text keeps one gutter from rules. 18 two-part sections are asymmetric. 19 composition changes between sections. 20 a ground change is the divider, not a rule too. 21 center only a lone item. 22 labels and buttons follow their group.
Phone: 23 one edge and a reading-order stack. 24 44px targets, actions in reach.

## Measuring a live page
```
node .claude/skills/composition-standard/scripts/measure.mjs <url> [--width 1440] [--cols 12] [--margin 20] [--gutter 20] [--tol 2] [--pw <dir containing node_modules/playwright>]
```
It reports text blocks off the column lines, section-start edges, left edges per section, font sizes, line heights off the 4px multiple, body measure, spacing values off the scale, and centered body text. It is a first pass for rules 1 to 3, 7 to 9, 11 and 21; the rest need eyes and a screenshot. Measure glyphs, not containers: a box can sit on the line while its text does not.

## Common failures
Hero on its own margin that matches no column. Container on the grid but glyphs off it (padding, side bearing). Lead floating, centered against a headline. Text centered against an image. Body lines over 90 or under 25 characters. Stray spacing values from one-off tweaks. Equal gaps everywhere so nothing groups. Same padding and centered stack in every section. Rule lines added at a ground change. On phones, desktop indents kept and actions pinned to corners.

## Tags and your own taste
Rules are tagged in `references/rules.md` as Evidence (research or accessibility standard), Convention (settled grid and type practice), Taste (a call, change freely) or House (a preference of the person or brand). Rules 3, 12, 13, 14's choice rules, 18 and 19 are taste or house: confirm them with the owner of the project and record changes, do not silently drop them. Brand type, color and copy rules are outside this skill; this one only governs where things sit and how much space they get.

## Non-web use
The same logic applies to decks, posters, documents and video frames: pick a grid, snap text to its lines, use one spacing scale, group by proximity, vary composition between slides or shots, center only lone items, keep text off busy pixels. Replace px with the unit of the medium and keep the ratios.
