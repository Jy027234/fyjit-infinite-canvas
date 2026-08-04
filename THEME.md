# FYJIT Creative Theme

The public, versioned design contract is
`web/src/styles/fyjit-creative-theme-v1.css`. It contains the color,
typography, radius, spacing, elevation, stacking, motion, and responsive
breakpoint tokens used to align this derivative application with FYJIT.

## Provenance

- Source: FYJIT `web/default/src/styles/theme.css` and the public shell
  conventions maintained in the main FYJIT repository.
- Extracted: 2026-08-04.
- Contract version: `1.0.0` (`--fyjit-theme-version`).
- License: AGPL-3.0, consistent with both the source project and this
  derivative repository.

The values are copied into this public repository intentionally. The built
application does not import a private package, request a theme service, or
depend on the main repository at build time. Changes that alter a token's
meaning require a new versioned contract; compatible value tuning may update
the existing file together with visual snapshots and a changelog entry.

## Consumption

`globals.css` maps the FYJIT contract onto the semantic Tailwind/shadcn
variables consumed by the application. Ant Design remains the internal widget
foundation and receives the same primary/status palette from `app-theme.ts`.
Shell and product-specific patterns live under `components/layout`,
`components/fyjit`, and `components/canvas` rather than being imported from a
private main-site package.

The breakpoint variables document the cross-repository contract. CSS custom
properties cannot be interpolated in media-query conditions, so Tailwind's
matching `sm`, `md`, `lg`, `xl`, and `2xl` values remain the executable form.
