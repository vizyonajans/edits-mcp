# Privacy and publication policy

## What is public

Source code, synthetic test fixtures, sanitized test evidence, generated demo media, public repository identifiers, the MIT license and the explicitly designated business contact **info@vizyoncreative.com**.

## What must stay private

- Edits tokens, GitHub credentials, OAuth/device codes, environment files and credential stores.
- Personal email addresses, real names that were not designated for publication, phone numbers and private account identifiers.
- Home-directory paths, machine names, device identifiers, local network addresses, exact host OS/runtime inventory and unreviewed diagnostic output.
- Private projects, media, original filenames, project identifiers, browsing history and screenshots of the owner's desktop or browser profile.

The demo is generated test media. It is not a recording of the owner's computer. Live evidence uses summarized checks rather than raw native responses, UUIDs, file paths or machine diagnostics. Tested **application compatibility**, minimum runtime requirements and generated output dimensions are product information, not an inventory of the owner's device.

## Runtime behavior

The bridge has no telemetry, tracking or cloud relay. Its upstream client is restricted to the configured `127.0.0.1` MCP endpoint. The MCP host receives local tool outputs, and native outputs may include sensitive project information; review them before copying anything to a public issue.

`edits_status` intentionally reports local diagnostic data to the requesting local MCP client. It does not upload that report to GitHub. Do not publish its raw output. Edits itself is a separate application with its own network behavior and privacy policy; this project does not claim to control that behavior.

## Credentials and publication

Keep tokens outside the repository in an owned private file. `.gitignore` is a convenience, not a secret-removal mechanism. Before a release, run `npm run check:release` and inspect staged changes. A repository may be public even though package.json has `private: true`; that field prevents accidental npm publishing only.

Use a GitHub `noreply` author **and committer** address for all release commits. Do not publish unreviewed local Git history. Public copies or third-party caches of previously disclosed data cannot be guaranteed to disappear just because a repository is replaced.

Public questions belong in Issues. Credentials and private security reports must not be posted publicly; use **info@vizyoncreative.com** for private project contact.
