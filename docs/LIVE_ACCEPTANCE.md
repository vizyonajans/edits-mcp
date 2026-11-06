# Live acceptance: real Edits, real exported video

**Verified:** 2026-11-06. **Application:** Edits 454.0.0. **Transport:** local stdio bridge → authenticated native Streamable HTTP MCP. No personal device inventory is published.

The test used a newly created, dedicated project and generated media. Existing user projects were not edited, deleted or published. Every native operation below went through the bridge's `edits_invoke` tool, except the explicitly identified OS file-access setup step.

| Check | Evidence | Result |
| --- | --- | --- |
| Authenticated catalog | 274 native tools discovered | Pass |
| Native read calls | `appState`, `state`, `clips`, `title`, `getCanvas`, `elements`, `exportStatus` | Pass |
| New project | `newProject`, then `setTitle` | Pass |
| Canvas | `setCanvas`: 16:9, 30 fps | Pass |
| Media access denial | Initial `importMedia` without a file-picker grant returned a sandbox-bookmark error | Expected denial |
| Media access grant | Selected only the generated video through Edits' own Import Media picker | Manual OS setup |
| Native import | Repeated `importMedia` after the grant; one six-second clip appeared | Pass |
| Trim | `trim` removed one second from the right edge; native `clips` reported duration 5 | Pass |
| Split | `splitAt` at 2 seconds; native `clips` reported spans [0,2] and [2,5] | Pass |
| Text overlay | `addText` added a five-second overlay at zero; the rendered output shows the text | Pass |
| Persistence | `saveProject`, `closeProject`, `openProject`; `state` and `elements` retained two clips and one text element | Pass |
| Real write gate | `setTitle` with writes disabled returned POLICY_DENIED; `title` confirmed no rename | Pass |
| Export access denial | An ungranted destination was accepted initially but `exportStatus` reported permission failure | Expected asynchronous failure |
| Accessible native export | Native `export` into the directory established by Edits' own export flow; polled until complete | Pass |
| Independent inspection | ffprobe: 5.000 seconds, 2560×1440, 30 fps, HEVC video and AAC audio | Pass |
| Full decode | ffmpeg decoded the complete exported audio/video without error | Pass |
| Visual inspection | Exported frame shows the expected synthetic test pattern and added text | Pass |

## What this establishes

The bridge works against the tested Edits release for the exercised operations, not just a synthetic server. It can preserve native results and metadata, enforce local policy, validate native inputs, and drive a real editing/export workflow.

## Operational findings

**macOS file access is independent of MCP authentication.** Possessing a token does not grant Edits access to arbitrary media or output paths. The source must be reachable through Edits' normal security-scoped file access. Use an export directory Edits can access. No Full Disk Access, Accessibility, Screen Recording or Apple Events bypass was used.

**Job acceptance is not job success.** The first native export call returned `ok: true`, but the status tool later reported an output permission error. The successful test required `exportStatus.state == complete`, a real file and independent media validation.

**Code-signature verification depends on execution context.** An earlier restricted check failed. A normal host check of the same app release passed and identified the publisher as Instagram, Inc. This is not evidence that the application was modified or repaired. Raw diagnostic output and device information are deliberately excluded from the repository.

## Scope limits

274 tools were **discovered**, not all exercised. This report does not certify every Edits release, every tool, every macOS version, rendering quality, licensed music, AI features, account publishing, project deletion or every hardware configuration. No Instagram post or external media upload occurred.

The animation in [the README](../README.md#live-demo) is derived only from the synthetic exported test video. [Sanitized machine-readable evidence](reports/live-acceptance.json) records the verified checks without private paths or project IDs.
