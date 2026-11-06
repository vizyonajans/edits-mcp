# Native editing recipes

These examples use native tools observed and exercised on Edits 454.0.0. Always obtain the current `edits_catalog`; names and schemas can change. They are examples of `edits_invoke` arguments, not additional bridge tools.

## Start with inspection

Allow only `state` and `clips`, keeping writes disabled:

```json
{"EDITS_ALLOWED_TOOLS":"[\"state\",\"clips\"]","EDITS_ALLOW_WRITES":"0"}
```

Call the bridge tool `edits_invoke` with:

```json
{"name":"state","arguments":{}}
```

Then:

```json
{"name":"clips","arguments":{}}
```

## Trim and split a disposable test clip

Add the exact reviewed native names `trim` and `splitAt` to the allowlist and explicitly enable writes. Obtain the clip ID from `clips`; do not guess it or use an ID from a different project.

Remove one second from the right edge:

```json
{"name":"trim","arguments":{"id":"CLIP_ID_FROM_CATALOG_RESULT","side":"right","deltaSeconds":1}}
```

Split that element at two seconds of timeline time:

```json
{"name":"splitAt","arguments":{"id":"CLIP_ID_FROM_CATALOG_RESULT","times":[2]}}
```

Splitting creates new clip IDs. Refresh `clips` before the next clip-specific action. The acceptance run confirmed that a six-second source became two clips spanning [0,2] and [2,5].

## Add text

With `addText` explicitly allowed and writes enabled:

```json
{"name":"addText","arguments":{"text":"My test edit","duration":5,"atSeconds":0}}
```

This changes the current project. Use a new test project before trying it on valuable work.

## Import and export

For native `importMedia`, the schema observed in the acceptance run requires `path`. The source must already be accessible to Edits through its normal file permissions. Select it in Edits' Import Media picker when necessary.

For native `export`, provide an output path in a directory Edits can access. Then poll native `exportStatus` until complete. An `ok: true` response from `export` is not proof of a finished file; the live test observed an asynchronous permission failure before using an accessible directory.

Never automatically retry a timed-out editing call. Inspect state first. These recipes do not include account publishing, destructive deletion or privilege bypasses.
