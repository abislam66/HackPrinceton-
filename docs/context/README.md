# Context from Tradesmark

Source material for the Project Proposal System, provided by Tradesmark. These are reference documents: read them to understand the product and the rules behind it. They are copied here unchanged.

| File | What it is |
|---|---|
| `project-proposal-system-overview-v3.md` | The product brief: what the system does, the current manual process, stakeholders, need categories, the model, the proposal, the shot list, and 30 answered questions. Start here. |
| `project-proposal-system-board.html` | The same system as an interactive diagram: the full pipeline, the eleven phases of the proposal system, what good and bad look like at each step. Open it in a browser. |
| `Model-Builder.md` | Tradesmark's existing method for building an accurate 3D model of a real building: stages, gates and hard rules. The reference for our model builder. |
| `Toon-Model-Builder-Road-Work-Ahead.md` | The same method with a cel-shaded "Toon Street" finish. That style belongs to another brand, Road Work Ahead; we do not use it. |
| `Modeling-in-the-Road-Work-Ahead-Flow.md` | How that other brand uses the models day to day. Background only. |

## How to use these

**Our hackathon scope in `AGENTS.md` section 0 wins wherever it differs from these documents.** The documents describe the full product; we are building a cut-down version. The main differences:

- The documents have the system research the project itself. We do not: the project's files, images and location data are pre-loaded in `data/`.
- The documents classify each client's needs from company signals. We do not: needs are pre-loaded.
- The documents cover four stakeholders on every project. We cover 1 to 2 clients on one project.
- The model builder documents refer to scripts and files (`scripts/engine.py`, `scripts/tmb.py`, `references/`, agent definitions) that we do not have. We are building our own in `model-builder/`. Use the documents for the method and the rules, not as instructions to run.

Rules from these documents that do carry over:

- No pricing or scope on the proposal page; one call to action, "book a call".
- Client-owned images are reference only and are never shown in the proposal.
- The model is never built by hand.
- Shots only frame sides of the building that have real reference.
- The same model is shared by every client's proposal.
