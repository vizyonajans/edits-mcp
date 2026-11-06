# Changelog

## 0.1.0 — Initial preview

### Native integration

- Local stdio bridge to the built-in Edits Automation MCP endpoint.
- Dynamic native catalog discovery; no invented editing endpoints or hard-coded native tool catalog.
- Real acceptance completed on Edits 454.0.0: discovery of 274 tools and project creation, granted-file import, trim, split, text, save/reopen and export.
- Export independently checked as a five-second 2560×1440/30 fps HEVC/AAC video, fully decoded and visually inspected.

### Security and reliability

- Exact tool allowlist, separate write gate and pre-dispatch native input validation.
- Shared native-operation deadline, explicit no-replay behavior, cancellation propagation and bounded queue/payloads.
- Loopback-only upstream, redirect rejection and private bounded token-file reads.
- Sanitized startup/upstream exceptions; hidden interactive token saver with no overwrite or echo fallback.
- 81 JavaScript tests and 14 Python tests, including a clean-install repeat.

### Documentation and community

- English README, Turkish guide, generated live demo and original SVG artwork.
- Detailed automated and native acceptance reports, security and privacy policies.
- MIT license, issue/PR templates and a four-job GitHub Actions matrix.
- Public project contact: info@vizyoncreative.com.

The native catalog is version/screen dependent. The first release remains a preview; discovery does not certify all 274 tools. See TESTING.md for limits.
