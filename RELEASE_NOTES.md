# Edits MCP Bridge v0.1.0 — Preview

Connect an MCP-compatible AI assistant to the native automation tools in Instagram Edits on macOS.

## Highlights

- **Native tools, not screen-coordinate scripts.** The bridge discovers the actual authenticated Edits catalog.
- **You choose the permissions.** Exact native tool names, a separate write gate and schema-validated inputs.
- **Local by design.** Stdio to your assistant; loopback HTTP to Edits. No telemetry or cloud relay.
- **Real editing evidence.** Import, trim, split, text, save/reopen and export exercised in a new generated-media project.

## Verification

**95 automated tests passed**: 81 JavaScript and 14 Python, repeated after a clean dependency installation. The four core server files reached 100% measured line coverage; that is not a security certification.

Real Edits 454.0.0 discovery returned **274 native tools**. The tested workflow produced a fully decoded **5.000-second, 2560×1440, 30 fps HEVC/AAC** video. The README demo is made solely from generated test media. See `docs/LIVE_ACCEPTANCE.md` and `TESTING.md`.

## Before you use it

Edits' file-access sandbox still applies: select a source through its normal picker and export to an accessible directory. Poll `exportStatus`; an accepted export request is not a completed job. Tool availability varies by release and screen. Account publishing, destructive deletion, licensed music and all AI features are outside this acceptance run.

This is an independent MIT-licensed community project, not a Meta or Instagram product. Questions: GitHub Issues. Professional enquiries/private security reports: **info@vizyoncreative.com**.
