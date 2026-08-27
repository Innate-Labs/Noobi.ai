# Security policy

## Supported versions

Noobi.ai is currently a developer preview without versioned public releases. Security fixes target the latest commit on `main`.

## Reporting a vulnerability

Please do not disclose a suspected vulnerability in a public issue, discussion or pull request.

Use GitHub's private vulnerability reporting flow:

<https://github.com/Innate-Labs/Noobi.ai/security/advisories/new>

Include, when available:

- the affected commit and operating system
- a minimal reproduction or proof of concept
- expected and observed behavior
- possible impact, including whether a secret, project file or generated asset can cross a trust boundary
- any suggested mitigation

Do not include real API keys, account tokens, personal project files or third-party user data. The maintainers will coordinate disclosure and remediation through the private advisory.

## Security model

Noobi.ai treats the Electron Main process as the trusted host and the Renderer, Agent output, manifests and generated workspaces as untrusted inputs. The architecture and current trust boundaries are documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
