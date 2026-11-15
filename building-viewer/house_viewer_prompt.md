Build a viewer for the project below. Keep its visual style identical to the
house style. Consistency matters more than novelty.

STEP 1: START FROM THE SCAFFOLD. Copy the provided scaffold.html exactly. Do not
rewrite the shader, the palette, the control bar, the camera setup or the outline
and shadow code. Those are locked. You may change only:
- the SUBJECT block (SUBJECT object and buildSubject function, between
  "SUBJECT (REPLACE THIS BLOCK PER PROJECT)" and "END SUBJECT BLOCK");
- the page <title>.

STEP 2: BUILD THE SUBJECT. Use the PROJECT, OBSERVED facts, NOTES and PHOTO below.
If values are missing, choose sensible defaults and list them. Label each value
observed (from a provided source) or inferred (your estimate) in a comment next to
it. Never present an inferred value as observed. Observed facts always win over
estimates, including counts read from a photo.

PHOTO (if attached): match the glass pattern, roof and overall massing to the
photo. Where the photo conflicts with observed facts, keep the observed facts and
say which one you followed. Do not copy anything you cannot see, and label those
parts inferred.

STEP 2b: CONTEXT (already fetched by the backend; do not fetch anything).
- COORDINATES and CONTEXT are provided below. Copy CONTEXT into SUBJECT.context
  unchanged.
- If GEOCODE_STATUS or CONTEXT_STATUS says "not retrieved", leave context empty
  and say so in the reply. Never invent buildings or coordinates.

LOCKED PALETTE:
- Page background #DC5527
- Ground #D9D3C7 / #A59C93
- Control cream #F4F1EA, navy #1b1d33, mustard accent #E8B730
- Outline #111122

LOCKED RENDER RULES:
- Toon shading: split light and shade at brightness 0.18.
- Outlines on edges steeper than 25 degrees, unless a material sets nolines.
- Sun shadows: 4096 PCF map; the sun direction is fixed, not per-subject.
- Camera: three-quarter view from the southwest, framed to the full height.

STEP 3: MATERIALS. Each material gets a light and a shade colour from the locked
palette, or one new pair that sits between them in value. Keep at most six
materials per subject. Keep geometry planar so outlines read cleanly.

STEP 4: CHECK BEFORE REPLYING.
- Outlines are visible on the subject, unless a material sets nolines.
- Shadows fall on the ground.
- The subject fills the frame.
- Every material used is defined in SUBJECT.materials.
- Nearby buildings are in SUBJECT.context, or the reply says they were not retrieved.
- The file is a single HTML page and works without localStorage.
- Code outside the SUBJECT block is unchanged.
- Every inferred value is labelled as inferred.

OUTPUT FORMAT:
Return the full HTML inside <html_output></html_output> and the final reply inside
<reply></reply>. The reply gives: one sentence on what the viewer shows, the
defaults and inferred values you chose, whether geocode and context were
retrieved, and anything you could not verify.

PROJECT: {{project_name}}
ADDRESS: {{address}}
COORDINATES: {{lat}}, {{lng}}   (GEOCODE_STATUS: {{geocode_status}})
CONTEXT: {{context_json}}       (CONTEXT_STATUS: {{context_status}})
OBSERVED: {{observed_facts}}
NOTES: {{user_notes}}
PHOTO: {{photo_status}}
