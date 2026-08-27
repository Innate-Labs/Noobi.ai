# Contributing to Noobi.ai

Thanks for helping make Noobi.ai safer, more portable and easier to extend. Focused pull requests are the easiest to review and merge.

## Good places to contribute

- media-provider adapters and compatibility tests
- Windows and Linux development or packaging support
- deterministic browser-game templates and example projects
- accessibility, keyboard navigation and responsive workbench improvements
- tests, diagnostics and failure messages
- English and Simplified Chinese documentation

For larger features or behavior changes, open a proposal issue before investing in an implementation. Bug fixes, tests and documentation improvements can usually go straight to a pull request.

## Local setup

You need macOS, Node.js 22 LTS, npm, and a ChatGPT/Codex account for real Agent smoke tests.

```bash
git clone https://github.com/YOUR-USERNAME/Noobi.ai.git
cd Noobi.ai
npm ci
npm run dev
```

Keep your fork current without rewriting shared history:

```bash
git remote add upstream https://github.com/Innate-Labs/Noobi.ai.git
git fetch upstream
git rebase upstream/main
```

## Project map

| Area | Location |
| --- | --- |
| Electron trusted host | `src/main/` |
| React workbench | `src/renderer/` |
| Shared IPC contracts | `src/shared/contracts.ts` |
| Generated Codex protocol types | `src/generated/codex/` |
| Product and architecture docs | `docs/` |
| Smoke and protocol scripts | `scripts/` |

Do not hand-edit generated Codex protocol files unless the change is intentionally part of protocol generation. Keep secrets, API keys, local paths and provider responses out of commits, fixtures and screenshots.

## Verification

Run the full local gate before opening a pull request:

```bash
npm run verify
```

This runs both TypeScript configurations, 124 tests, and the production build. Run the isolated UI capture when changing the workbench:

```bash
npm run smoke:ui
```

The following commands use a signed-in account and may consume Codex or media-provider quota. Run only the smoke test relevant to your change:

```bash
npm run smoke:codex
npm run smoke:harness
npm run smoke:media
npm run smoke:image
```

## Pull request checklist

- Keep one coherent change per pull request.
- Add or update tests for behavior changes.
- Update both `README.md` and `README.zh-CN.md` when changing user-facing setup or capabilities.
- Include screenshots for visible UI changes and remove local paths or private data.
- Explain which verification commands you ran.
- Avoid unrelated dependency or formatting churn.

Security vulnerabilities should not be opened as public issues. Follow [`SECURITY.md`](SECURITY.md) instead.
