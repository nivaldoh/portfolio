# CLAUDE.md

Orientation for Claude Code sessions on this repo. Keep this file tight — it loads into every session. See `README.md` for the human-facing setup doc.

## What this is

Personal portfolio + technical blog. Astro 5, fully static, deployed to Cloudflare Pages. Content is markdown / MDX in `src/content/`; everything else is Astro components.

## Stack

- Astro 5 · TypeScript · npm · Node 20 (pinned in `.nvmrc`).
- **Static build, no `@astrojs/cloudflare` adapter.** Pages serves `dist/` directly.
- Integrations: `@astrojs/mdx`, `@astrojs/sitemap`, `@astrojs/rss`, `@astrojs/check`.
- Astro 5 Content Layer API. Schemas live at `src/content.config.ts` (top level under `src/`, NOT `src/content/config.ts`).
- Self-hosted Newsreader variable font (latin, weight axis 200–800), roman + italic in `public/fonts/`. Preloaded in `BaseHead.astro`.
- Shiki single theme `github-dark` (no dual-theme swap; colors bake into inline styles).

## Design language

A restrained dark-fantasy / cosmic-horror motif. Technical-first; Personality lives in details.

- **Single dark theme.** Light theme was deliberately removed. **Do not reintroduce a theme toggle** without asking — `BaseHead.astro` no longer has a FOUC bootstrap script and `BaseLayout.astro` no longer sets `data-theme`.
- **Palette tokens** (`src/styles/global.css`):
  - `--bg #0a0c10` indigo-black · `--fg #d6cfb8` candlewax ivory
  - `--accent #c8b270` pale gold (links, focus, blockquote rule)
  - `--accent-2 #4a6a8e` cobalt (used **only** in `::selection`)
- **No decorative glyph.** An earlier "Mark" (ringed-dot SVG) was tried as a post-end mark and as a preamble before page `<h1>`s; both were removed. Personality lives in the palette, the typography, and the small text touches (footer colophon, 404 copy) — not in a recurring symbol. Don't reintroduce a brand mark without asking.
- **Tone constraints.** No glitch effects, no parallax, no animated backgrounds, no gothic display fonts, no "edgelord" copy. Heading letter-spacing on `h1` is `+0.02em` (inscribed feel); other headings keep the default `-0.01em` tightening.

## Conventions

- **Posts**: `.md` for prose-only; `.mdx` only when the post genuinely needs a component. The MDX template shows the import pattern.
- **Images in markdown**: `![alt](url "caption")` — the title doubles as the caption. A small inline rehype plugin in `astro.config.mjs` wraps standalone-image paragraphs in `<figure>` and turns the title into `<figcaption>`. **Heads up:** Astro's `<Content components={{ img: Figure }} />` mapping fires for MDX only, not plain markdown — that's why the rehype plugin exists. Don't remove it without restoring an equivalent.
- **Images in MDX**: import the asset, render `<Figure src={pic} alt="..." caption="..." />`. `Figure.astro` switches between `astro:assets <Image>` (for ImageMetadata) and a plain `<img>` (for string URLs); `alt` is required at the type level.
- **Drafts**: `draft: true` in frontmatter hides the post in `npm run build` but keeps it visible in `npm run dev`.
- **Dates**: `FormattedDate.astro` formats with `timeZone: 'UTC'` so frontmatter dates don't drift on different build hosts.
- **Heading hierarchy**: one `<h1>` per page (page title or post title); body content starts at `<h2>`.

## Code
- Focus on simplicity.

## Content schemas (`src/content.config.ts`)

- **Posts** (`src/content/posts/`, `.md` + `.mdx`): `title`, `description`, `pubDate`, `updatedDate?`, `tags[]`, `draft`, `interactive`.
- **Projects** (`src/content/projects/`, `.md`): `title`, `description`, `year`, `links[{label,url}]`, `status: 'active' | 'archived'`, `featured`.
- File slug = filename. To customize, add a `slug` field to the schema and use `entry.data.slug` in `getStaticPaths`.
- Render via `const { Content } = await render(entry)` from `astro:content` (Astro 5 form, NOT the legacy `entry.render()`).

## Deploy (Cloudflare Pages)

- **Project type is Pages, not Workers.** Earlier in the project's history a Workers + auto-injected `@astrojs/cloudflare` + `wrangler` setup broke the build; switching to Pages was the fix. **Do not switch back to Workers** or add the Cloudflare adapter.
- Production domain: `https://portfolio-818.pages.dev`, wired into `astro.config.mjs#site` and `src/consts.ts#SITE_URL`.
- Build: `npm run build` → `dist/`. Pages reads `.nvmrc` (`20`).
- `public/_headers` is honored automatically (immutable cache for fonts + `_astro/*`, baseline security headers).

## Hard rules

- **Never use the `**/` glob pattern in shell commands** (`find`, `grep`, `ls`, etc.). This is a global user constraint. It does **not** apply to source-code globs — e.g. Astro's loader pattern in `content.config.ts` is fine, since it's an internal API, not a shell invocation.
- **Don't invent personal content.** Every `TODO:` placeholder stays as a placeholder until the user fills it in. No fake bio, no invented dates, no testimonials, no marketing taglines.

## TODOs the user still needs to fill in

- `src/consts.ts` — `SITE_TITLE`, `SITE_DESCRIPTION`, `AUTHOR`, `SOCIAL_LINKS`.
- `src/pages/index.astro` — landing intro, "Currently" copy.
- `src/pages/about.astro` — Bio, Background, Contact.
- `public/og-default.png` — replace placeholder (1200×630 expected).
- `public/favicon.svg` — placeholder (plain indigo-black square). User to design.
- Delete the two template posts (`template-markdown-post.md`, `template-mdx-post.mdx`) and `template-project.md` once real content exists.

## Out of scope (don't propose unprompted)

Analytics, newsletter signup, comments. All deliberately deferred. Theme toggle is also out of scope; we removed it on purpose.

## Where to look for what

| Concern                          | Path                                                          |
| -------------------------------- | ------------------------------------------------------------- |
| Routes                           | `src/pages/` (file-based)                                     |
| Long-form post layout            | `src/layouts/PostLayout.astro`                                |
| Page chrome (head/header/footer) | `src/components/{BaseHead,Header,Footer}.astro`               |
| Design tokens, prose, focus, motion | `src/styles/global.css`                                    |
| Site constants                   | `src/consts.ts`                                               |
| Collection schemas               | `src/content.config.ts`                                       |
| Astro / Shiki / rehype config    | `astro.config.mjs`                                            |
| Cloudflare Pages cache + headers | `public/_headers`                                             |
| Self-hosted fonts                | `public/fonts/newsreader-{roman,italic}.woff2`                |

## Commands

`npm run dev` · `npm run check` · `npm run build` · `npm run preview`. Local Node 18.17.1+ works for dev; CI uses Node 20.
