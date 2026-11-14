# Project Proposal System — Overview V3

## 1. Summary

The Project Proposal System takes a project name and address and autonomously produces a bespoke, animated proposal for each stakeholder on that project, published as a hosted Tradesmark web page. Each proposal is built around a 3D model of the project, a pitch tailored to that stakeholder's role and needs, and a shot list showing how we would capture their work.

The goal is to close the client from the first moment they open the proposal, and to send that level of proposal to every relevant contractor and representative on every major construction project in America. The tool is internal to Tradesmark.

## 2. Hackathon Scope

- **Must work live:** project name and address in, a complete proposal for one stakeholder out.
- **What wins:** a live working demo, a clear business case and market, and visual impact.
- **Human in the loop:** for the demo, a person reviews the generated proposal and hits send. Full-scale autonomous sending is the long-term vision, not the pitch.
- **Pitched, not built:** post-signature progress tracking, and how the proposal system fits into the wider Tradesmark pipeline (scouting, dossier, outreach). These appear as visuals in the pitch only.
- **Presentation:** Michael provides material; the team presents.

## 3. Current Process vs. the System

| Stage | How it's done today | How the system does it |
|---|---|---|
| Find the project and prospect | Manual research | Scouting system finds and sorts the largest construction projects |
| Identify who to pitch | Manual | Receives stakeholder contacts from the Dossier stage |
| Project analysis | 1–2 hours of manual reading and interpretation | Reads scope, type, phasing and timeline automatically |
| Get a model of the building | Site visit for photogrammetry, 2–10 man-hours of manual modeling, or up to 40 rounds with our current AI modeling tool | Builds the model autonomously from public sources, starting from a name and address |
| Scope the client's needs | Manual scoping and discovery | Classifies needs by company type, size, existing marketing and industry pressures |
| Shot selection and rendering | Pick shots by hand, render each one, manage the files | Generates a role-specific shot list and renders it from the shared model |
| Copywriting and proposal planning | Hours of manual writing and structuring | Writes problem and solution copy tailored to the stakeholder |
| Design and layout | Manual work in Adobe Express or Illustrator | Styling and layout applied automatically |
| Animation | After Effects or hand-built component animations; usually skipped | Fully animated by default |
| **Total per proposal** | **25 to 500 hours; 3 days to 3 weeks, sometimes 60 straight hours over three days** | **Generated for every project and every contact on the list** |

### Where the current process breaks
- **It doesn't scale.** At 25 to 500 hours per proposal, we pitch one project at a time. Bespoke work is why our prices are 3x competitors, and also why we haven't scaled further.
- **Modeling is the bottleneck.** We either visit the site for photogrammetry or fight our AI modeling tool through dozens of revisions.
- **Animation gets cut.** The step that sets the proposal apart is the first one dropped.
- **Cold outreach is generic.** Without the proposal, outreach is a template email pointing to our website, the same thing every other firm sends.

## 4. The Problem

A construction company comparing a dozen proposals from marketing and video firms sees the same standard document over and over. Ours needs to stand out immediately and show we already understand their project, while laying the groundwork for the actual production work if we win. Doing that by hand takes too long to do for more than a few prospects.

## 5. What We're Building

### Inputs
- **Minimum:** project name and address. The system finds all imagery and reference itself.
- **Project data sources:** permits and public bid records, news and press, and social media.
- **Stakeholder contacts:** received from the Dossier stage; the proposal system does not find people itself.
- **Client-owned material** (their renders, drawings, posts) is used as reference to rebuild the project. Their images are never shown in the proposal.

### Project understanding
- **What is being built:** for example, a new university library.
- **Scope type:** demolition and rebuild, expansion, live-in-place phased partial demolition and reconstruction, and so on.
- **Timeline and phasing.**
- Projects and clients are linked: a client may span several projects, or we may target one project and every party on it.

### Stakeholders covered in the first version
- General contractor.
- Architect.
- Owner or developer.
- One trade with a clear external visual role: the curtain wall and glazing contractor.

### Needs classification
- **Signals:** company revenue, headcount, how much they already market themselves, and the type of company and the problems facing firms of that type and size.
- **Need categories:**
  - Documentation by the best team available (typically larger firms and projects).
  - Self-promotion and marketing (typically smaller firms and projects).
  - Recruiting.
  - Sales and winning more bids.
  - Investor and owner updates.
  - Community and public relations.

### The model
- **Accuracy:** as precise as can be developed. At minimum, massing and general texture must be unimpeachable from 500 feet away, at the level of simplification the Toon Street style uses, even when not rendered in that style.
- **Style:** general architectural, as if a real image were dropped in. The same model is reused in other forms: a wireframe version behind images, an under-construction version, and a toon version for other uses.
- **Fully autonomous, always.** No manual modeling at any point. Reference almost always exists somewhere online or in the public record.
- **Sparse reference:** infer the best possible geometry from what exists. Worst case is a 2.5D model with one side modeled and styled and the rest extrapolated. When only one side is known, every proposal shot uses only that side.
- **Environment:** placed in a low-detail gray-box 3D map of the surrounding area so the project stands out. The map source is the developer's choice.

### The proposal
- **Format:** hosted web page under the Tradesmark brand.
- **Opening teaser:** a short animated shot from one perspective, already playing when the page opens. A drone-style shot flies up into their building with a wireframe overlay and text along the lines of "You're building this. We're here to document it."
- **Problem statement, then solution statement:** a one-two punch that adapts to the stakeholder's needs.
- **How we'd treat their project:** renders plus a full 3D video, shown later in the page as "this is what it'll look like." The video changes with the stakeholder and application, focusing on what matters to them (a glazing contractor sees the curtain wall; a steel firm sees the structural system). Rendered in the aspect ratios that matter for that project.
- **Other stakeholders:** each proposal references that we're working across the project.
- **No pricing or scope.** The page stops at the vision.
- **Call to action:** book a call.
- **Tracking:** full tracking of opens, watch time and clicks.

### The shot list
- Varies with the proposal's focus, shown as renders inside the proposal.
- Exported to the shot tracker app for our crew.
- Each shot carries: drone or ground, lens and framing, time of day and light, and the construction phase to capture it at.

### After the client signs (pitched, not built)
- Progress tracking of the project inside the same environment.
- Either procedural build-up of construction layers (framing, paneling, glass installation as separate stages) or ingesting the client's own data, such as photogrammetry or internal 3D data.

## 6. Where It Sits in the Pipeline

1. **Scouting:** identify the largest construction projects and sort them.
2. **Dossier:** research each project and identify who on it we'll talk to. Its output is the proposal system's input.
3. **Proposal generation:** before any outreach goes out, generate a proposal for every project and every contact.
4. **Review and send:** a person reviews and sends, initially.
5. **Outreach:** instead of a template email saying "check out our website," the message is "we have a vision for your specific project, and we're uniquely suited to capture it."

The older Prospect Engine is retired into this new pipeline.

### Target market
- First: large commercial GCs and public projects, with the positioning of being the team that documents America's biggest construction projects.
- Later: builders of smaller and individual homes.

### Success measures
- Proposals generated.
- Reply rate.
- Calls booked.
- Contracts signed.

### Scale
At 1,000 projects, the current approach would take about 10,000 hours, or force us to pick a few and pitch them one at a time. The system makes all of them possible.

## 7. Questions

### Open
1. Are we presenting the full vision version, only what runs on demo day, or the vision with one live flow? (Team decision.)

### Answered
2. **Hackathon criteria:** live working demo, business case and market, visual impact.
3. **Demo flow:** inputs through to a full proposal.
4. **Presenting:** Michael provides material only.
5. **Minimum input:** project name and address.
6. **Project data sources:** permits and public bids, news and press, social media.
7. **Contacts:** received from the Dossier stage.
8. **Client-owned assets:** reference only; rebuild, never show their image.
9. **Model accuracy:** as precise as possible; massing and texture unimpeachable from 500 feet at minimum.
10. **Model style:** general architectural, with wireframe, under-construction and toon variants.
11. **Sparse reference:** always autonomous; worst case 2.5D, shots limited to known sides.
12. **Review:** a person reviews and sends for now.
13. **Map source:** developer's choice.
14. **Stakeholders:** GC, architect, owner or developer, and one visual trade.
15. **Size signals:** revenue, headcount, existing marketing, company type and industry pressures.
16. **Need categories:** documentation, self-promotion, recruiting, sales, investor and owner updates, community and PR.
17. **Multiple stakeholders:** each proposal references the others.
18. **Brand:** Tradesmark.
19. **Format:** hosted web page.
20. **Pricing:** none; vision and CTA only.
21. **CTA:** book a call.
22. **Tracking:** full.
23. **Video:** opening teaser is separate from the full application-specific video shown later.
24. **Shot list users:** our crew, via the shot tracker app.
25. **Shot detail:** drone or ground, lens and framing, time of day, construction phase.
26. **Dossier:** its output is the proposal system's input.
27. **Prospect Engine:** retired into the new pipeline; for the hackathon, shown only as visuals of how the proposal system fits.
28. **Success:** proposals generated, reply rate, calls booked, contracts signed.
29. **Product:** internal only.
30. **Progress tracking:** pitched, not built.
