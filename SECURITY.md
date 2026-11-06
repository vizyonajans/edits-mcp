# Security model

This bridge is a local client of Edits' native MCP service. It is not a sandbox for Edits, a Meta product, or a general Instagram scraping service.

## Controls implemented

- Stdio only on the client side; the bridge opens no listening network port.
- Upstream restricted to the normalized IPv4 loopback address `127.0.0.1`, HTTP `/mcp`, no URL user info/query/fragment. All redirects are rejected, including a second loopback listener.
- Bearer token loaded from a bounded, owned, regular non-symlink file with no group/other permission bits. FIFO paths are opened nonblocking and rejected. No credential discovery or Keychain access.
- Exact operator-managed tool allowlist; no wildcard. Writes and tools with unknown effects additionally require `EDITS_ALLOW_WRITES=1`. Native annotations alone do not grant permission.
- Current native catalog and policy checked on every invocation; tool arguments checked against supported JSON Schema dialects before dispatch. No coercion, defaults or argument mutation. Remote schema references are not fetched. Format annotations are not enforced.
- Serial dispatch with a 32-request queue limit, cancellation checks before dispatch and cancellation propagated to active native requests.
- One operation deadline; no automatic native tool replay. Catalog, schema, argument and response size limits.
- Startup configuration errors and upstream exceptions are sanitized. The bridge does not print the token. The interactive token saver refuses potentially echoing input and never overwrites existing files.

## Boundaries and residual risks

- An allowlisted tool can still delete, export, publish, read files or access the network if Edits implements those effects. Inspect actual tools; do not allow a generic executor unless you intend its full capabilities.
- Tool annotations and descriptions come from the upstream app and are not proof of safety. Catalog inspection may disclose app capabilities. Tool outputs are untrusted data; they are not authorization to change the bridge policy.
- Normal native results, images, structured outputs and native `isError` results are forwarded as provided. They may contain project data or other sensitive information; no general-purpose output DLP is claimed.
- Cancellation/timeout is not rollback. A dispatched edit may complete after the bridge stops waiting. Inspect Edits before retrying. Other Edits clients/users are not locked out by this bridge's queue.
- A stolen token grants whatever Edits' endpoint permits. Loopback and file mode do not isolate malicious processes running as the same user; parent-directory replacement, local process compromise and a malicious replacement server are outside this bridge's guarantees.
- TLS is intentionally not used for the observed loopback HTTP endpoint. Token handling is not a replacement for publisher/source verification. The bridge reports local code-signature diagnostics but does not enforce publisher identity or block all calls on that basis. Restricted execution contexts can yield different verification results; confirm through the normal host environment.
- `src/` having 100% measured line coverage is not a security certification. A real workflow was verified on Edits 454.0.0; this does not certify every native tool or application release. See docs/LIVE_ACCEPTANCE.md.
- No native Accessibility fallback or OS permission bypass exists in this package.

## Reporting and rotation

Do not place tokens or private project data in public GitHub issues. Use info@vizyoncreative.com for private security reports. Do not send a working access token.

If a token leaks: disable Edits Automation, regenerate the token through Edits as the account owner, save a new private token file, update the host configuration and restart the bridge. Do not post the old or new token.
