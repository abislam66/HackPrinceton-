-- Generated models: what the building viewer produces for one project, kept as files.
--   <project>/model.glb   the 3D model exported from the viewer's three.js scene (the Shots tab loads it)
--   <project>/viewer.html the house-style viewer page
-- The project's model.json (bounding box, sides) is small JSON and goes in public.records (collection
-- "generated-models"), next to the viewer HTML records in "project-models". No new table. Only the two files
-- need Storage.
--
-- Private bucket with no policies on storage.objects (RLS is on by default there), so only the secret key
-- (SUPABASE_SECRET_KEY, server only) can read or write it. The browser never talks to Storage and needs no
-- signed URLs: the app serves the GLB through /api/models/<project>/glb, which reads the bucket on the server.
--
-- Limit: 4 MB per file. A Vercel function can't take or return a body over about 4.5 MB, so a larger file
-- couldn't be uploaded or served through the app anyway. The demo's GLB is 0.3 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'models',
  'models',
  false,
  4194304,
  array['model/gltf-binary', 'application/octet-stream', 'text/html']
)
on conflict (id) do nothing;
