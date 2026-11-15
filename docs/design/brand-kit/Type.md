# Type

The full chapter, with specimens, is 04 Type in the guidelines PDF and `01 Brand Guidelines/Chapter Sheets/type-sheet.png`.

## Faces

Rigid Square 600 carries headings. 700 for short sign-off lines, smaller than the headline near them. Never 800 or heavier. Tracking -0.04em, leading 0.9. Use it for headings of six words or fewer at 28 px and up. Adobe Fonts, kit `xor3tpl`, web license. It is not installed on the Mac, so video and print renders load the kit in a headless browser.

Geist 600 takes longer titles, sub-heads and anything under 28 px. Tracking -0.03em.

Geist 500 sets all reading text: paragraphs, leads, captions. Tracking -0.01em, leading 1.42 at 19 px. Google Fonts. The deck marks Geist as under review: it stays until something better is picked.

Geist Mono 500 for labels, kickers, specs and readouts, always in caps at +0.02em, 13 px on the 1440 basis. 600 only for knock glyphs.

gear-wide is a specialty display face, rare. Helvetica Neue ties to Laminar Media Group and sets legal pages and contracts (Plaster ground, Helvetica body, small Rigid Square headings).

Retired: Space Grotesk and Azeret Mono. The old `tradesmark-design` skill still lists them; it is out of date.

## Where headings differ

On websites and anything new, headings are Rigid Square by default, with no switch (Michael, 2026-10-20). Inside the brand guidelines deck itself, page headings are Geist 600 and Rigid Square is kept for the cover, chapter breaks and big numerals (Michael, 2026-10-19).

## Scale

Five title sizes, four text sizes, one label size, set for a 1440 px screen and scaled with its width: titles 120, 76, 48, 36, 28; text 22, 19, 17, 15; label 13. `type.css` has them as classes.

## Pairing

Label, heading, body. Geist Mono 500 13 px caps, then Rigid Square 600 76 px, then Geist 500 19 px. On Asphalt the heading and body go to Stucco.

## Files

`type.css` loads the faces and sets the roles. `Fonts/` holds local Geist and Geist Mono (variable, Latin). Rigid Square cannot be copied out of Adobe Fonts.
