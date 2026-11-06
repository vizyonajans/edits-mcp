# Contributing

Thanks for helping creators connect AI tools to a real editing workflow.

## Good first contributions

- Clear, minimal bug reproductions and compatibility reports.
- Tests for error paths, protocol variations and permission behavior.
- Documentation improvements and translations.
- Small fixes that preserve the local-only connection and explicit tool permissions.

## Development

Use Node.js 22+ and Python 3.9+. Synthetic tests run on macOS/Linux; actual Edits use requires macOS.

```sh
npm ci --ignore-scripts
npm test
npm run test:coverage
npm run test:python
npm run smoke
npm run check:release
```

Add a meaningful regression test for behavior changes. Keep pull requests focused and describe actual validation. Fixture names are not real Edits API names; distinguish synthetic tests from native testing.

Real tests are opt-in. Never run write/delete/publish tests on somebody's existing projects. Use a newly created disposable project, generated media and exact native schemas. Do not make live credentials a CI requirement.

## Privacy and review

Do not commit tokens, personal paths, private media, unreviewed diagnostic reports or personal email addresses. Use a GitHub noreply author/committer address. See [PRIVACY.md](PRIVACY.md). Public issues must contain only sanitized information.

Security reports should be sent privately to **info@vizyoncreative.com**, not disclosed with an exploitable secret in a public issue.

## License

This project is MIT-licensed. Review [LICENSE](LICENSE) before contributing. Do not imply endorsement by Meta or Instagram or include third-party assets without appropriate rights.
