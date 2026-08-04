# FYJIT patch register

All patches in this repository are applied on top of upstream release `v0.13.0`
at commit `335467ec0d98aca69df49c285edd56eb00e736e6`. The Git history is retained;
this register describes the purpose and compatibility impact of the FYJIT
divergence. Detailed user-facing changes are also recorded in `CHANGELOG.md`.

| Patch area | Purpose | Impact and upgrade risk |
| --- | --- | --- |
| Same-origin Creative API | Replace browser-held provider keys and direct provider requests with authenticated FYJIT bootstrap, estimate, Job, Asset, Prompt, Canvas, and Intent APIs. | Upstream provider configuration, WebDAV sync, and direct image/video/audio clients are intentionally removed. API changes must update `contracts/creative-v1.json` and regenerate the TypeScript operation map. |
| Server-owned capabilities and billing | Discover authorized models,本站 Token summaries, supported parameters, normalized estimates, and actual consumption from FYJIT. | Unknown models use conservative controls. New parameters remain hidden until declared by the server capability profile. |
| Persistent workbenches | Restore image/video jobs, assets, prompts, and Canvas revisions from FYJIT instead of treating IndexedDB as authoritative. | Local browser data is only cache/preferences. The one-time legacy import is user-scoped and idempotent. |
| `/creative/` deployment | Build and serve the app from an independent Nginx container under a fixed subpath with a `/healthz` probe. | Router/base-path changes require refresh-fallback and asset-path regression tests. Root-path upstream deployment instructions do not apply. |
| Private asset boundary | Load content through FYJIT ownership-checked routes and use server asset IDs for cross-module intents. | Provider URLs and long-lived credentials must never be restored to browser code. The boundary scanner blocks known direct-client markers. |
| FYJIT navigation and session | Align page titles, analytics route names, theme/user actions, and sign-out behavior with the main site. | Signing out clears FYJIT-scoped browser state and delegates the authenticated session transition to the main site. |
| Responsive workbench UI | Add H5 drawers, desktop collapsible panels, persisted layout preferences, and capability-driven video controls. | Frozen Windows/Linux screenshots and Playwright accessibility assertions must be reviewed when upstream layout changes. |
| Compliance and provenance | Retain AGPL, upstream attribution/history, runtime commit/source metadata, and immutable multi-architecture image workflows. | Releases must be tagged; deployment by a floating `main` image is unsupported. `NOTICE`, `UPSTREAM.md`, and this register are release-gated. |
| Prompt source governance | Require per-source license metadata before full synchronization, keep unclear sources link-only, accept metadata-only user reports through the FYJIT BFF, and honor server takedowns before cache or network access. | Prompt source changes must preserve attribution metadata and the source-policy tests; the browser must never persist or transmit provider credentials or copy reported remote prompt bodies. |

## Conflict handling

When an upstream update touches a registered area, resolve it in a dedicated
integration branch and record the conflict and decision in `UPSTREAM.md` before
release. Do not squash away upstream history. Provider-direct functionality
must not be reintroduced during conflict resolution.
