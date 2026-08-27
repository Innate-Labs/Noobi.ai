# Noobi.ai roadmap

Noobi.ai is a macOS developer preview. This roadmap describes useful directions, not delivery promises. If you want to work on a larger item, open a proposal issue first so the implementation can be scoped with the maintainers.

## Reliability and release readiness

- [ ] Publish the project's open-source license after owner approval
- [ ] Add signed and notarized Apple Silicon and Intel macOS builds
- [ ] Create reproducible release notes and checksums
- [ ] Expand failure diagnostics for Codex login, model access and media-provider capability checks
- [ ] Add end-to-end coverage for interrupted and resumed production runs

## Platform support

- [ ] Validate development on Windows and Linux
- [ ] Add Windows and Linux packaging workflows
- [ ] Document platform-specific secret storage and sandbox behavior
- [ ] Test game-project paths containing non-ASCII characters and network volumes

## Game and media ecosystem

- [ ] Stabilize a documented media-provider adapter contract
- [ ] Add example adapters with mocked integration tests
- [ ] Add more deterministic 2D, 2.5D and Three.js project templates
- [ ] Publish a small gallery of generated games with reproducible prompts
- [ ] Add native asynchronous-job orchestration for selected 3D providers

## Workbench experience

- [ ] Improve keyboard navigation and screen-reader coverage
- [ ] Add a run comparison and review-diff view
- [ ] Add exportable production reports
- [ ] Extend English and Simplified Chinese localization coverage
- [ ] Add first-run guidance without hiding the underlying project and security model

## Contribution-ready ideas

The best first contributions are narrow and verifiable: a provider fixture, a platform-path test, a documentation fix, an accessibility improvement, or a focused game-template enhancement. See [`CONTRIBUTING.md`](CONTRIBUTING.md).
