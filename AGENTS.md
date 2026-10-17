# Repository Guidelines

## Project Structure & Module Organization

This is a static Astro 5 portfolio using TypeScript and MDX, deployed to Cloudflare Pages.

- `src/pages/` defines routes; `src/layouts/` supplies page templates.
- `src/components/` contains shared UI and project-specific interactions, grouped by project.
- `src/content/projects/` holds case studies; `src/content/posts/` holds posts. Schemas live in `src/content.config.ts`; filenames become URL slugs.
- `src/assets/work/<project>/` holds optimized images; `public/media/<project>/` serves videos, posters, and JSON unchanged.
- `src/styles/global.css` defines shared styles and tokens; `src/consts.ts` stores site metadata.
- `scripts/` contains the replay exporter and tests.

## Build, Test, and Development Commands

Use Node 20 (`.nvmrc`) and npm.

- `npm ci`: install dependencies from the lockfile.
- `npm run dev`: start development at `http://localhost:4321`.
- `npm run check`: run Astro and TypeScript diagnostics.
- `npm run test:replay`: run replay regression tests.
- `npm run build`: generate static output in `dist/`.
- `npm run preview`: serve the production build locally.

Run check, replay tests, and build before submitting changes. Preview locally; deploy only when explicitly requested.

## Coding Style & Naming Conventions

Follow existing two-space indentation, single-quoted JavaScript/TypeScript strings, and semicolons. TypeScript uses Astro's strict configuration. No dedicated formatter or linter is configured.

Use PascalCase for Astro components (`RecordedVideo.astro`), camelCase for functions and variables, and kebab-case for content slugs. Keep interactions in vanilla TypeScript with useful static HTML. Reuse shared components and CSS tokens; preserve the single dark theme. Body headings start at `h2`.

## Testing Guidelines

Tests use Node's built-in `node:test` and strict assertions in `scripts/replay.test.cjs`. Add descriptive behavior-based cases for replay changes, especially timing, missing data, and HTML escaping. No numeric coverage threshold is configured.

For UI changes, preview the homepage and project pages at phone, tablet, and desktop widths. Check keyboard controls, reduced motion, disabled JavaScript, and relevant failure/retry behavior.

## Commit & Pull Request Guidelines

History uses short, plain-language action summaries, such as `sync SITE_URL with the Pages domain`; no mandatory prefix convention is evident. Keep commits focused.

PRs should describe the change, link relevant issues, report validation results, and include screenshots for visual changes.

## Content & Data Integrity

Support public claims with evidence and limitations. Keep private drafts in ignored `dev/`. Regenerate replay JSON with `scripts/export_wh3_replay.py`; never hand-edit recordings or interpolate positions. Keep PokéTCG simulator/source assets private. Preserve font licensing in `public/fonts/OFL.txt`.
