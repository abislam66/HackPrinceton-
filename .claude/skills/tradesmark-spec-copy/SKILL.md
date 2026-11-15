---
name: tradesmark-spec-copy
description: Michael's concise house voice for explainer text. Use before writing or editing any body, explainer, caption, spec or label copy in the Tradesmark brand guidelines, decks, labs or brand docs, and before rewriting copy he has marked as too long, "AI" or over-explained.
---

# Tradesmark spec copy

Explainer copy reads like a spec sheet: short fragments that state what a thing is for. It is learned from Michael's own edits to Type 04.04–04.10 on 2026-10-19. The title above a paragraph already names the thing; the paragraph only adds what the title can't.

## The six rules

1. **Drop the subject and the verb when the title names the thing.**
   "Paragraphs, leads and captions all use this weight." → "Paragraphs, leads and captions."
   "Geist Mono handles labels, readouts and codes." → "Labels, readouts and codes."
2. **State the role, don't instruct or narrate.** No "Use it for", "This is", "These are", "We use", "Every X in the system…".
   "Use it for bold lead-ins, long titles and small headings." → "Bold lead-ins, long titles and small headings."
   "Set it in caps with a little extra tracking." → "Set in caps with a little extra tracking."
3. **Cut filler; commas over "and".** No "There are", "all", "just", "really", "so that", "in order to".
   "There are five title sizes, four text sizes and one label size." → "Five title sizes, four text sizes, one label size."
4. **Decide, don't hedge.** No "can work", "might", "we haven't settled", "still exploring", "for now". Say what it is. If it truly isn't decided, a tag says so, not the copy.
   "Helvetica can work as a heading too, but we haven't settled where." → "Helvetica used for LMG tie-ins."
5. **Fold two sentences into one line when they say one thing.**
   "The sizes shown are for a 1440 px screen. Everything scales with the screen width." → "Scaled for 1440 px screen. Scales with screen width."
6. **Cut what doesn't earn its place.** Delete status tags, second paragraphs, and reasons ("because…", "since…", "so it…") unless the reason *is* the rule. One or two lines per page.

## Also

- Keep every fact, number, name and rule that matters. Shorter, never vaguer.
- Keep a hard rule when it is the point ("If we didn't shoot it, it doesn't go out."). Short punchy rules stay.
- No "we", "our", "you" unless the line is a rule spoken to the team. No addressing the reader with prompts.
- Sentence case. Periods on fragments are fine. American spelling. No em or en dashes.
- Manual line breaks (`<br>`) are Michael's call for rag. Don't add them, and don't remove his.
- Titles use "&", body keeps "and" ([[ampersand-titles]] memory).
- Plain words. No slogans in explainers, no adjectives selling the work.

## Check before saving

Read each line and ask: does the title already say this? Does a word survive deletion? Is anything hedged? Is there a "we/you/use it/this is"? If yes to any, cut again.

## Where it applies

Everything in `brand/guidelines/v1/index.html` with class `body`, captions, spec values, tile captions, B-chapter explainers, and any new page copy. For the guidelines, edit the source, never the generated markup. Michael's canvas edits come back through `tools/brand/design-sync.mjs`.
