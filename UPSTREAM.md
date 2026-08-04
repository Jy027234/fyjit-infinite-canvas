# Upstream maintenance

## Fixed baseline

- Repository: `https://github.com/basketikun/infinite-canvas.git`
- Release: `v0.13.0`
- Commit: `335467ec0d98aca69df49c285edd56eb00e736e6`
- License: `AGPL-3.0`

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

No upstream sync has been attempted after the fixed baseline yet.
