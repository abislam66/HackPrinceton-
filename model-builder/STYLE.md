# Model style

How a built model looks, and where each look comes from. Two parts: the **model** (geometry and materials, fixed in the GLB) and the **viewer** (the scene around it, chosen at render time).

## Model (set by project.json, built in `src/model_builder/massing.py`)

| Rule | Value | Input |
|---|---|---|
| Tile fin spacing, centre to centre | 2.2 m default, 0.8 to 6.0 m allowed | `finSpacingM` |
| Fin width, depth | 0.55 m, 0.3 m | fixed |
| Floor band depth, height | 0.18 m, 0.25 m | fixed |
| Podium metal band | 2.0 m | fixed |
| Crown overhang, canopy | 1.2 m, 0.8 m | `crown` (bool) |
| Rooftop plant | 5 m, inset 4 m | fixed |
| Podium floor height | 1.4× tower floor | fixed |
| Default floor height | 3.05 m | `floorHeightM` |
| Neighbours and streets | within 220 m, drawn dim, left out of bbox | `context`, `streets` |

Materials (PBR, in `_PBR`): glass `#121C28` (metallic 0.6, roughness 0.12), tile `#CDCDC6`, charcoal `#101012`, brick `#5F2316`, terracotta `#82321C`, stone `#827A6C`, concrete `#6E6C68`, metal `#3C4046` (metallic 0.7), timber `#6E4626`, roof `#282A2D`, sign white and emissive.

A wall with glass 0.7 or more, or tile, reads as glass; tile walls get the fins and bands above.

## Viewer (set in `src/features/viewer/styles.ts`)

Two looks. The model's own materials do not change between them.

- **night** (default): near-black background `#0D1015`, cool sky light, grid `#262C35`. Used by the current pages.
- **daylight**: pale sky `#DFE7EF`, warm sun `#FFF3E0` at 2.2, cool fill, grid `#B4BCC6`, shadows at 35%.

Use it with `<ModelViewer style="daylight" ... />`. Nothing is set by default, so existing pages keep the night look.

## Rules for a new building

1. Take the fin spacing from the photos. Count the window or fin rhythm across one bay and set `finSpacingM` to that distance. Leave it out to use 2.2 m.
2. Keep the materials in the table. Add a new material to `_PBR` and to this table together.
3. Pick the viewer style per page, not per building.
