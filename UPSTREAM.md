# Upstream maintenance

## Fixed baseline

- Repository: `https://github.com/basketikun/infinite-canvas.git`
- Release: `v0.20.0`
- Commit: `3a6b64b602ad062b29fac66902ed18a7ef5fd9dc`
- Upstream license: `MIT` (retained in `LICENSE.upstream-MIT`).
- FYJIT derivative license: `AGPL-3.0` (retained in `LICENSE`).

The original FYJIT fork started from AGPL-3.0 upstream `v0.13.0` /
`335467ec0d98aca69df49c285edd56eb00e736e6`. The upgrade preserves that
history and the FYJIT patches; the upstream license change does not relicense
the existing FYJIT derivative.

The local Git remote named `upstream` points to the repository above. The public FYJIT derivative is published at `https://github.com/Jy027234/fyjit-infinite-canvas` through the `origin` remote.

## Patch boundary

FYJIT keeps the upstream canvas, image, video, asset, and prompt implementations while replacing these browser-owned integration points:

- API Key and Base URL configuration;
- direct browser requests to model providers;
- local generation history as the authoritative source;
- root-path deployment and upstream release links.

The replacement boundary is the same-origin FYJIT Creative API under `/api/creative`. The application is built and served independently under `/creative/`.

## Sync procedure

1. Fetch tags and commits from `upstream`.
2. Review upstream changes since the fixed baseline, including license and dependency changes.
3. Create an integration branch from the current FYJIT release tag.
4. Merge or cherry-pick the selected upstream release without squashing upstream history.
5. Reapply unresolved FYJIT patches and record conflicts in this file.
6. Run TypeScript, formatting, tests, production build, container health, base-path refresh, license, and source-link checks.
7. Publish an immutable release tag and image digest; never deploy a floating branch.

## Known divergence

- The production base path is `/creative/` instead of `/`.
- FYJIT session and Creative API replace browser-managed provider credentials.
- FYJIT navigation, theme, version, and source metadata replace upstream standalone configuration entry points.

## v0.20.0 integration

Merged the official tag without squashing upstream history. Canvas rendering,
multi-result nodes, reference connections, focus controls, previews, Agent
conversation handling, and upstream localization follow v0.20.0.

Conflict decisions:

- Keep FYJIT bootstrap, shared session/preferences, sign-out, navigation, and
  source metadata instead of upstream credential setup and root-path links.
- Keep Creative estimates/jobs, authorized asset routes, server pagination and
  trash, canvas optimistic locking, revisions, and save-before-navigation.
- Persist each grouped image/text result's FYJIT asset ID. Resume video nodes
  with the existing Creative job ID, never a direct provider task or a new job.
- Keep capability-driven FYJIT video controls. Upstream provider-specific
  request parameters remain subject to server-declared supported parameters.
- Exclude browser local-proxy/provider configuration and WebDAV modules. The
  upstream standalone canvas-proxy package is retained as upstream source only
  and is not imported, built, or deployed by the FYJIT web application.
- Retain FYJIT workbench/history/draft/asset/prompt pages where upstream assumes
  browser-owned generation history; retain prompt licensing/takedown policy.
- Retain both upstream MIT attribution and the existing AGPL derivative license.

Validation results are recorded in `docs/fyjit-v0.20.0-upgrade.md`. Production
image selection remains a separate immutable release/deployment step.
