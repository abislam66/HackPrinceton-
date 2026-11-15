-- Generated models: the 3D model (GLB) the building viewer exports for a project, so the Shots tab can load it.
-- Stored at <project>/model.glb. The project's model.json (bounding box, sides) is small JSON and goes in
-- public.records (collection "generated-models"), next to the viewer HTML in "project-models"; only the binary
-- file needs Storage.
--
-- Private bucket with no policies on storage.objects, so only the secret key (SUPABASE_SECRET_KEY, server only)
-- can read or write it. The app serves the file through /api/models/<project>/glb; the browser never talks to
-- Storage directly. Limit: 20 MB per file, the same cap the upload route enforces.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('models', 'models', false, 20971520, array['model/gltf-binary', 'application/octet-stream'])
on conflict (id) do nothing;
