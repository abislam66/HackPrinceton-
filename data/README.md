# Pre-loaded demo project

Everything the system knows about the demo project lives here. Nothing is researched live.

```
demo-project/
  project.json        project facts (schema: src/features/project/schema.ts, projectSchema)
  clients/<id>.json   one file per client, with their pre-loaded needs (clientSchema)
  images/             reference images for the model builder
```

The JSON files currently hold sample values. Replace them with the real demo project. Adding a client is adding a file to `clients/`; the file name must match its `id`.

The web app and the model builder both read this folder. Changing a schema here is a contract change: post on the board.
