# FYJIT Creative Theme

The public, versioned design contract is the generated file
`web/src/styles/fyjit-creative-theme-v1.css`. It contains the color,
typography, radius, spacing, elevation, stacking, motion, and responsive
breakpoint tokens used to align this derivative application with FYJIT.

## Provenance

- Canonical source: FYJIT `web/default/theme/fyjit-theme-v1.json`.
- Generator: FYJIT `web/default/scripts/generate-fyjit-theme.mjs`.
- Generated: 2026-09-13.
- Contract version: `1.1.0` (`--fyjit-theme-version`).
- License: AGPL-3.0, consistent with both the source project and this
  derivative repository.

The generated CSS is committed into this repository intentionally. The built
application does not import a private package, request a theme service, or
depend on the main repository at build time. The file header records the
canonical JSON SHA-256, and local cross-repository checks compare every shared
token and the source hash. Theme changes must edit the canonical JSON and run
the generator; generated CSS must not be edited directly.

## Consumption

`globals.css` maps the FYJIT contract onto the semantic Tailwind/shadcn
variables consumed by the application. Ant Design remains the internal widget
foundation; `app-theme.ts` maps the generated
`lib/generated/fyjit-ant-theme.ts` adapter onto its component tokens.
Shell and product-specific patterns live under `components/layout`,
`components/fyjit`, and `components/canvas` rather than being imported from a
private main-site package.

The breakpoint variables document the cross-repository contract. CSS custom
properties cannot be interpolated in media-query conditions, so Tailwind's
matching `sm`, `md`, `lg`, `xl`, and `2xl` values remain the executable form.
