# Composition rules, full text

Numbers assume a 1440px desktop with 12 columns, 20px margins and 20px gutters (column width 98.33px, starts at 20, 138.3, 256.7, 375, 493.3, 611.7, 730, 848.3, 966.7, 1085, 1203.3, 1321.7). For other widths scale by width / 1440, or recompute: col = (W - 2*margin - 11*gutter) / 12. Phone 390: 4 columns. Measure text by glyph rects (DOM Range getClientRects), not container boxes.

Tags: Evidence, Convention, Taste, House.

## Grid and edges
1. Every text block starts on a column line (headline, lead, body, label, button), within 2px. Convention (Swiss grid).
2. One page-wide primary edge, hero included: the first text of each section starts on the same column line. At most 2 distinct section-start edges per page. Evidence (readers scan down the left edge).
3. At most 3 distinct left edges per section. Taste.
4. A text group (label, headline, lead, body, button) shares one edge within 2px. A label may hang in its own column only if every label on the page does. Convention.
5. Type 64px and larger is aligned optically: the first stem sits within 2px of the line; offset by a small negative margin for side bearing, round letters and quotes. Convention.
6. Text container widths are n columns plus (n-1) gutters, within 2px. Ragged right, never justified. Convention; Evidence for no justification (WCAG 1.4.8).

## Type and measure
7. Body 45 to 75 characters per line (target 66). Cards or multi-column 40 to 50. Leads 35 to 60. Never over 80. Evidence (Bringhurst, Baymard, WCAG 1.4.8).
8. At most 7 font sizes at one viewport, from one ratio scale, adjacent levels at least 1.2x apart, exactly one largest element per section. Convention.
9. Body line height 1.4 to 1.6, display 0.95 to 1.1, every computed line height a multiple of 4px. Evidence for body (WCAG 1.4.8), Convention for display.
10. No orphans in headlines and leads: `text-wrap: balance` on headlines, `pretty` on leads; check at wide, mid and phone widths. Convention.

## Spacing and rhythm
11. Every margin, padding and gap is on the scale (4, 8, 12, 16, 24, 32, 48, 64, 96, 128, 160, 224). No stray values. Convention (4/8pt grids).
12. The largest gap inside a text group is at most 0.5x the gap between that group and the next. Evidence for proximity grouping, Taste for the 0.5.
13. Section top and bottom padding use the large steps only (96 and up), may differ, and no two adjacent sections use the same pair. House: uniform padding down a page is a failure.

## Composition
14. A lead or short line beside a headline aligns by last baseline (bottom-align) or first cap top (top-align) within 2px, one choice page-wide. Bottom-align when the headline is 2+ lines and the lead closes the thought; top-align when the lead is read first. Stack the lead under the headline instead when the headline spans 8+ columns or the lead column would hold under 35 characters. Never center vertically. Convention; Taste for the choice.
15. Text beside media starts at its top edge (cap top within 2px) or ends at its bottom edge (last baseline within 2px). Text and media meet across exactly one gutter and both sit on column lines. House, Convention.
16. Text over media: 4.5:1 for body, 3:1 for large type, against the worst pixel behind the glyphs across the whole range of moving media, and still obeys rule 1. Evidence (WCAG 1.4.3).
17. Text keeps at least one gutter from every rule line, border and ground edge. House.
18. Two-part sections are asymmetric (4+8, 5+7, 3+9; empty columns count as composition). A 6+6 split at most once per page. Taste.
19. No two adjacent sections share the same headline start column, span and padding pair. Each section names its empty columns. House.
20. A ground change (dark to light) is the divider; no extra rule or border at the same boundary. Text stays at least the section padding from the change unless media bleeds across on purpose. Convention.
21. Center only a lone headline, or a lone line with one button. Body is never centered. A section never mixes centered and left-aligned blocks. Evidence, Convention, House.
22. A label sits on its group's line at the smallest gap in the group, and never repeats the heading under it. Filled buttons align by box edge, text links by first glyph; pick per type and keep it page-wide. House, Convention.

## Phone
23. At 390, all text starts on the phone margin line, at most one indent level page-wide. Stack in reading order: label, headline, lead, body, action, then supporting media (unless the media is the point, then right after the headline). Body measure 30 to 45 characters. Related items stay together after stacking. Convention.
24. Tap targets at least 44x44px, none under 24px. Primary actions in the middle half to two-thirds of the screen, not against the top or side edges. Enough bottom space for the last action to scroll to mid screen. Evidence (WCAG 2.5.8, Apple HIG, Hoober reach studies).

## Sources
Bringhurst, webtypography.net 2.1.2; Baymard line length; Butterick, Practical Typography; W3C WCAG 1.4.3, 1.4.8, 2.5.8; Apple HIG accessibility; NN/g on proximity and F-pattern; Müller-Brockmann grid systems; Queensland Health design system spacing; Hoober, UXmatters on touch reach.
