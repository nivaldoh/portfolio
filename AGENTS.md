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

## Writing

Visible text has to sound like the owner wrote it, because the site speaks in their name. Owner, 2026-11-04: "The text reads like AI slop though. For instance, everything is a punchline. A bit painful to see." Before writing, read the abstract and introduction of `public/media/robocasa/teleporting-bread-and-changing-goals.pdf` and the "My part, briefly" section of `src/content/projects/pokeagent-metamon.mdx`.

- Keep it short, because the figures do the explaining. On the homepage a section gets one or two lines. Owner, 2026-11-04, picking the shortest of four drafts: "Also note that not everything needs an explanation. There's still too much text in the page." Their chosen example: "Six ways of controlling an army, in six battles. One battle per pair so far, so this can't rank them yet."
- Don't choose a headline or a house style alone. Offer a few real drafts in different styles and let the owner pick. An editor agent's approval says nothing about whether it sounds like them.
- Say what the thing is and what happened, in whole sentences joined with words like so, but, because and while. Give numbers without commentary. End a paragraph on a fact.
- No punchlines. That means no tagline headings with a full stop, no paired contrasts built for effect ("X changed, Y didn't"), no short closing sentence added for rhythm, no "X, not Y", no slogans like "state in, orders out", no clever labels like "The catch", and no hook questions. If a sentence is there for how it sounds, cut it.
- Headings say what the section contains: "Benchmark results", "How it works", "Competition result".
- American spelling. No semicolons or em dashes in visible text.
- State a limit once, in plain words, where it applies.

## Commit & Pull Request Guidelines

History uses short, plain-language action summaries, such as `sync SITE_URL with the Pages domain`; no mandatory prefix convention is evident. Keep commits focused.

PRs should describe the change, link relevant issues, report validation results, and include screenshots for visual changes.

## Content & Data Integrity

Support public claims with evidence and limitations. Keep private drafts in ignored `dev/`. Regenerate replay JSON with `scripts/export_wh3_replay.py`; never hand-edit recordings or interpolate positions. Keep PokéTCG simulator/source assets private. Preserve font licensing in `public/fonts/OFL.txt`.
