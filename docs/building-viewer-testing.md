# How to test the building viewer API

**What it does:** an address (and optionally a photo) goes in. The backend geocodes it and fetches nearby buildings from OpenStreetMap. Claude then fills the scaffold's SUBJECT block, following `building-viewer/house_viewer_prompt.md`. You get back one HTML viewer file and Claude's reply.

## Option A: browser

1. Open https://tradesmarktool.vercel.app/building-viewer
2. Fill in the [sample input](#sample-input). Type the access code in **Access code**. Ask Abrar for the code; it is never written down here.
3. Click **Generate viewer**. Progress lines appear for each step, then the viewer, the reply, and a **Download HTML** button.

## Option B: API

`POST https://tradesmarktool.vercel.app/api/building-viewer/generate`, as `multipart/form-data`. The access code goes in the `x-access-code` header.

| Field | Required | Limit |
|---|---|---|
| `address` | yes | 5 to 200 characters |
| `buildingName` | no | up to 120 characters |
| `knownFacts` | no | up to 500 characters |
| `notes` | no | up to 1000 characters |
| `photo` | no | JPEG or PNG, up to 5 MB, checked by the file's bytes, not its name |

Without a photo:

```bash
curl -sN -X POST https://tradesmarktool.vercel.app/api/building-viewer/generate \
  -H "x-access-code: <ACCESS_CODE>" \
  -F "address=Morgan Center for Research and Innovation, Schuylkill Avenue, Philadelphia, PA" \
  -F "buildingName=CHOP Morgan Center for Research & Innovation" \
  -F "knownFacts=17 storeys, 350,000 sq ft" \
  > run.ndjson
```

With a photo, add this line before `> run.ndjson`:

```bash
  -F "photo=@morgan-center.jpg" \
```

Save and open the viewer:

```bash
jq -r 'select(.type=="result") | .html'  run.ndjson > viewer.html
jq -r 'select(.type=="result") | .reply' run.ndjson
open viewer.html        # macOS. Windows: start viewer.html
```

## Sample input

- Address: Morgan Center for Research and Innovation, Schuylkill Avenue, Philadelphia, PA
- Building name: CHOP Morgan Center for Research & Innovation
- Known facts: 17 storeys, 350,000 sq ft

## The response

An accepted request returns `200` with NDJSON, one JSON object per line:

```json
{"type":"step","step":"geocode","status":"start"}
{"type":"step","step":"geocode","status":"done","detail":"retrieved"}
{"type":"step","step":"context","status":"done","detail":"retrieved"}
{"type":"step","step":"model","status":"done"}
{"type":"step","step":"assemble","status":"done"}
{"type":"result","html":"<!DOCTYPE html>…","reply":"…","geocode_status":"retrieved","context_status":"retrieved","drift":false}
```

Steps run in order: `geocode`, `context`, `model`, `assemble`. Context is `skipped` when there are no coordinates. `drift: true` means Claude changed locked code; the server used the locked scaffold anyway.

## What a good result looks like

- A 17-floor tower in the house style: orange background, toon shading, dark outlines, shadows on the ground.
- Nearby buildings as plain blocks, or a reply that says context was "not retrieved".
- The reply separates observed values (your known facts) from inferred ones, and labels every estimate as inferred.
- Sources the model cites, if it used web search (up to 3 searches, for building facts only).

## Expected errors

These come back as JSON `{ "error", "step" }` before any work starts:

| Case | Status | Body |
|---|---|---|
| Wrong or missing access code | 401 | `{"error":"That access code isn't right.","step":"access"}` |
| Code not set on the server | 503 | `{"error":"The viewer generator isn't set up yet.","step":"access"}` |
| Address under 5 characters | 400 | `{"error":"Enter a street address.","step":"validate"}` |
| Photo over 5 MB | 400 | `{"error":"The photo is over 5 MB. Choose a smaller one.","step":"validate"}` |
| Photo not JPEG or PNG | 400 | `{"error":"The photo must be a JPEG or PNG.","step":"validate"}` |
| Rate limit, 5 runs per client per hour | 429 | `{"error":"You've made 5 viewers in the last hour. Try again later.","step":"rate_limit"}`, plus a `Retry-After` header in seconds |

An address that can't be found is **not** an error. The run continues with `geocode_status: "not retrieved"` and no nearby buildings.

> **Known issue:** Currently a rejected request still uses one of your 5 runs; this is being fixed.

Errors after the run starts arrive as the last NDJSON line:

| Case | Last line |
|---|---|
| Model call failed or timed out (270 s) | `{"type":"error","error":"The model call failed. Try again in a minute.","step":"model"}` |
| Output cut off | `{"type":"error","error":"The model's page was cut off. Try again, or give it fewer notes.","step":"model"}` |
| SUBJECT block failed the checks | `{"type":"error","error":"…","step":"assemble"}` |

If the host stops the function at 300 s, the stream ends with no `result` line.

## Cost

Each run spends paid credits: Claude Opus 5.5 with web search, plus a Google Geocoding call. Run it by hand; don't loop it or script it.
