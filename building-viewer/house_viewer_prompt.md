Describe the building below as a 3D massing model, in the house style. Consistency
matters more than novelty. You return data only: a JSON scene. The server builds
the 3D model from it, adds the neighbouring buildings from OpenStreetMap itself,
and renders it with the locked house look (toon shading, outlines, sun shadows).

STEP 1: RESEARCH. Use the PROJECT, OBSERVED facts, NOTES and PHOTO below. You may
use web search for this building's facts only (height, floors, footprint, massing,
setbacks, crown, facade materials and colours). Do not search for anything else.
If values are missing, choose sensible defaults. Observed facts always win over
estimates, including counts read from a photo. Never present an inferred value as
observed.

PHOTO (if attached): match the glass pattern, roof and overall massing to the
photo. Where the photo conflicts with observed facts, keep the observed facts and
say which one you followed. Do not copy anything you cannot see.

STEP 2: MASSING. Build the subject building only (no neighbours, no ground, no
streets) from parts:
- Coordinates in metres. +Y up, +X east, -Z north. The origin is the centre of the
  building's footprint at ground level.
- Each part's "at" is the centre of its BASE: [x, base height, z]. A podium is
  [0, 0, 0]; a tower on an 18 m podium is [0, 18, 0].
- Shapes: "box" with size [width (x), height (y), depth (z)]; "cylinder" with
  radius, height, optional radiusTop and sides; "prism" with footprint, a list of
  [x, z] points around "at" in order, extruded straight up by height (L-shapes,
  angled sites, towers with chamfered corners).
- rotY turns a part about the vertical axis, in degrees. Positive turns it
  counter-clockwise seen from above (east toward north). A street grid that runs
  29 degrees clockwise from true north is rotY -29.
- repeat: {"count": n, "step": [dx, dy, dz]} draws n copies, each one step further
  (crown fins, balconies, repeated bays). Use it instead of listing copies.
- Every part has "basis": "observed" (from a provided or cited source) or
  "inferred" (your estimate), and an optional short "note".
- Keep geometry planar and readable at a distance: the main volumes, setbacks,
  podium, crown and roof plant. At most 300 parts and 800 meshes after repeats.

STEP 3: MATERIALS. One to six materials, named in lowercase (glass, podium,
crown). Each has a "light" and a "shade" colour (#RRGGBB) from the locked palette,
or one new pair that sits between them in value; shade is darker than light.
- "type": "curtain" draws floor lines, mullions and bands for glazed or panelled
  facades: give "line" and "band" colours plus floor_h (floor height, m), line_w,
  mull (mullion spacing, m), mull_w, major_n (a band every n floors), band_w, z0.
- "type": "toon" is a flat two-tone surface (roofs, plant, stone, crowns).
- "nolines": true skips a material's outlines (thin fins, railings).

LOCKED PALETTE:
- Ground and neighbours #D9D3C7 / #A59C93
- Cream #F4F1EA, navy #1b1d33, mustard accent #E8B730
- Glass, for example #7E9CAB / #4A6070 with lines #2A3442 and bands #1b1d33

STEP 4: CHECK BEFORE REPLYING.
- The JSON parses and has exactly the keys described here.
- Every part's "mat" is defined in "materials".
- The building's full height matches the observed height, if one is known.
- The footprint is centred on the origin and the base is at y = 0.
- Every inferred value is labelled inferred.

OUTPUT FORMAT:
Return the scene inside <scene_json></scene_json> as one JSON object:
{"title": "...", "materials": {"name": {"type": "curtain" | "toon", "light": "#RRGGBB", "shade": "#RRGGBB", ...}},
 "parts": [{"shape": "box", "size": [w, h, d], "at": [x, y, z], "mat": "name", "basis": "observed" | "inferred", "note": "..."}]}
No comments inside the JSON. Then give the final reply inside <reply></reply>:
one sentence on what the model shows, the defaults and inferred values you chose,
whether the location was found, and anything you could not verify.

PROJECT: {{project_name}}
ADDRESS: {{address}}
COORDINATES: {{lat}}, {{lng}}   (GEOCODE_STATUS: {{geocode_status}})
OBSERVED: {{observed_facts}}
NOTES: {{user_notes}}
PHOTO: {{photo_status}}
