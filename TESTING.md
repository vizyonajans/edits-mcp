# Testing and verification

The project is tested at two distinct levels: automated protocol/security tests using synthetic servers, and a separately authorized acceptance run against the real Edits application. No private device inventory or raw user-project responses are published.

## Results

| Check | Result |
| --- | --- |
| JavaScript protocol, security and integration tests | **81 passed**, 0 failed, 0 skipped |
| Python token-saver and diagnostic tests | **14 passed**, 0 failed |
| Separate clean dependency installation | The same **95 tests passed** again |
| Measured line coverage of the four core server files | **100%**; not full behavioral coverage |
| Dependency audit | **0 known vulnerabilities** at the recorded scan |
| Real Edits authenticated native discovery | **Passed**, 274 native tools discovered |
| Real import → trim → split → text → save/reopen → export | **Passed** on generated test media |
| Independent exported-file inspection and full decode | **Passed** |
| GitHub Actions remote matrix | **Passed** on macOS 15 / Ubuntu 24.04 × Node 22 / 24 |

[Real acceptance report](docs/LIVE_ACCEPTANCE.md) · [Sanitized acceptance JSON](docs/reports/live-acceptance.json)

## Reproduce automated tests

Use Node.js 22+ and Python 3.9+ on macOS or Linux. The actual application integration targets macOS.

```sh
npm ci --ignore-scripts
npm test
npm run test:coverage
npm run test:python
npm run smoke
```

The test suite starts ephemeral HTTP listeners on `127.0.0.1`. A restricted execution environment may reject `listen` with EPERM. Allow only the local test connections needed by the suite; do not disable OS protections.

A separate clean copy was installed without the development node_modules directory using npm ci and the existing download cache. Its JavaScript/Python suites and local smoke test passed. This verifies dependency reproducibility from the lockfile; it does not mean that every OS/runtime combination has been tested.

## Automated test coverage

### Configuration and credentials

- Reject remote hosts, DNS names, incorrect paths, URL credentials, query strings, fragments and unsupported protocols.
- Exact native-tool allowlist with no wildcard; reject malformed configuration and write switches.
- Validate bounded integer operation timeouts and absolute token-file paths.
- Reject empty, oversized, multiline, control-character and non-ASCII header tokens.
- Reject unsafe permission bits, other-user ownership, symlinks and non-regular FIFO files. FIFO access cannot block token loading.
- Token saver creates a private file, does not overwrite or follow a link, accounts for its final newline, and refuses noninteractive or potentially visible getpass fallback input.
- Startup errors and upstream exception messages do not expose synthetic secrets used by the tests.

### Authorization and input schemas

- Unlisted tools are blocked even when writes are enabled.
- Write/unknown-effect/destructive tools are blocked while the write gate is closed.
- Refresh catalog membership and annotations before every invocation.
- Reject extra wrapper parameters, empty names, missing fields and arrays where objects are required.
- Enforce native required fields, types, numeric bounds and additionalProperties rules before dispatch.
- No value coercion, default insertion or input mutation. Inherited properties cannot satisfy required fields.
- Draft-07 and draft-2020-12 structural validation; fail closed for unknown/invalid dialects, oversized schemas and unresolved remote references. Format annotations are intentionally not validated.

### MCP and transport

- Real SDK client → separate stdio server process: initialization, discovery, calls and error results.
- Authenticated synthetic Streamable HTTP and SSE tool results.
- Legacy protocol response negotiation for 2025-11-25, 2025-06-18, 2025-03-26 and 2024-11-05; reject unknown future versions.
- Preserve text, image-content blocks, structuredContent and native isError results. The synthetic image test checks transport preservation, not PNG rendering.
- Correct empty and paginated catalogs; reject duplicate names/cursors, more than 2000 tools and more than 100 pages.
- HTTP 401/403/404/429/500/503, malformed JSON, malformed tool results and JSON-RPC exceptions.
- Reject redirects and verify that a second loopback listener receives no request or token.
- Enforce response and argument size caps.

### Cancellation, concurrency and recovery

- Parallel stdio calls dispatch serially within a bridge process.
- Excess requests beyond the 32-call queue receive BUSY and are not dispatched.
- Calls cancelled before connection create no network traffic.
- Calls cancelled while queued do not execute after an earlier call finishes.
- Active cancellation propagates; timeout, RPC failure and socket disconnect do not replay the native call.
- A valid call still works after a rejected wrapper call.
- Cancellation and timeouts are not tested as rollback guarantees; the bridge explicitly makes no such claim.

### Python helpers and smoke scripts

- Missing application, corrupt plist, signature-check timeout and absent executable handling.
- Failed signature checks are not reported as verified identity.
- Private token-file creation, no overwrite, no symlink following, maximum size and hidden-input behavior.
- Local smoke discovers bridge tools without a token.
- Live smoke discovers a synthetic native catalog without invoking native editing tools.
- Missing live credentials produce an explicit nonzero result, rather than a false pass.

## Measured coverage

Node's built-in experimental test coverage reported:

| Production file | Lines | Branches | Functions |
| --- | ---: | ---: | ---: |
| src/backend.mjs | 100% | 91.49% | 91.67% |
| src/config.mjs | 100% | 97.96% | 100% |
| src/server.mjs | 100% | 100% | 75% |
| src/validation.mjs | 100% | 100% | 100% |
| scripts/smoke.mjs | 94.12% | 33.33% | 50% |

100% line coverage is not 100% branch/function coverage, a security certification or proof of compatibility with every release. Python line coverage was not measured. Closing-error variants and all runtime/OS combinations are not exhaustively tested.

## Findings fixed before release

1. Native schemas were listed but not locally enforced. Added pre-dispatch structural validation.
2. Cancelled queued requests could execute later. Added dispatch-time cancellation checks and active cancellation propagation.
3. Wrapper tools accepted undeclared arguments. Enforced their published schemas.
4. No total operation deadline or explicit stream-retry policy. Added a shared deadline and disabled reconnection retries.
5. Insufficient resource bounds. Added queue/argument/schema/response caps and bounded, nonblocking credential reads.
6. Startup exceptions could reveal malformed configuration content. Added static sanitized errors.
7. Token saver fallback, character and newline-boundary issues. Added hidden interactive input enforcement and consistent header/size restrictions.

The first expanded security run had 10 failing cases in 35 tests before these fixes; some were multiple inputs exercising the same issue. All related regressions and the earlier tests then passed together.

## Live acceptance and limits

The real application run is documented separately in [docs/LIVE_ACCEPTANCE.md](docs/LIVE_ACCEPTANCE.md). It verified exercised operations on Edits 454.0.0 and showed why normal macOS file grants and asynchronous export-status checks matter. It did not test every discovered tool, account publishing, destructive deletion, AI features, licensed music or all hardware configurations.

The native Automation server was turned off after the acceptance run. The test did not grant GitHub CLI account-wide permissions or upload private data. Machine-specific diagnostics and personal paths are excluded from the published evidence.

## Evidence and CI

Sanitized automated logs are in [docs/reports](docs/reports/). The GitHub workflow covers macOS 15 / Ubuntu 24.04 and Node 22 / 24, with Python 3.12. Those values are **CI target configurations**, not the owner's computer specifications. The workflow does not need an Edits token. [Recorded successful source run](https://github.com/vizyonajans/edits-mcp/actions/runs/42185187174).

```sh
npm audit --omit=dev --json
npm run check:release
```

The dependency audit reported zero known vulnerabilities at its recorded scan. Future advisories and upstream changes may alter that result. Release privacy checks inspect files and metadata; they are not a guarantee that every future contributor change is safe.
