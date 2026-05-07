# Portfolio

Personal portfolio + technical blog. Astro 5, fully static, deployed to Cloudflare Pages.

## Commands

| Command           | What it does                                          |
| ----------------- | ----------------------------------------------------- |
| `npm install`     | Install dependencies.                                 |
| `npm run dev`     | Start the dev server at `http://localhost:4321`.      |
| `npm run check`   | Run `astro check` (TypeScript + content schemas).     |
| `npm run build`   | Produce a static build in `dist/`.                    |
| `npm run preview` | Serve `dist/` locally to preview the production build. |

Node 20+ is required (pinned in `.nvmrc`). Local Node 18.17.1+ also works for development; Cloudflare Pages reads `.nvmrc` at build time.

## Project structure

```
src/
├─ content.config.ts       # Content collection schemas
├─ content/
│  ├─ posts/               # .md and .mdx — blog posts
│  └─ projects/            # .md — project entries
├─ components/             # Astro components (Figure, PostList, ThemeToggle, etc.)
├─ layouts/                # BaseLayout, PostLayout
├─ pages/                  # Routes
│  ├─ index.astro          # /
│  ├─ writing/             # /writing, /writing/[...slug]
│  ├─ projects/            # /projects
│  ├─ about.astro
│  ├─ 404.astro
│  └─ rss.xml.ts
├─ styles/global.css       # tokens, typography, prose, shiki swap, focus, motion
└─ consts.ts               # SITE_TITLE, SITE_DESCRIPTION, SITE_URL, AUTHOR, links
public/
├─ fonts/                  # Self-hosted Newsreader (variable, latin)
├─ favicon.svg             # placeholder — TODO: replace
├─ og-default.png          # placeholder — TODO: replace
└─ _headers                # Cloudflare Pages cache + security headers
```

## Adding a post

Create a file in `src/content/posts/`. The filename becomes the URL slug (e.g. `my-post.md` → `/writing/my-post/`). Use `.md` for text-only posts and `.mdx` when you need to embed components.

Frontmatter:

```yaml
---
title: "Post title"
description: "Short description used in meta tags and on the index."
pubDate: 2026-05-07
updatedDate: 2026-05-10        # optional
tags: ["ml", "research"]        # optional, defaults to []
draft: false                    # optional; drafts are hidden in production
interactive: false              # optional; signal that the post embeds components
---
```

Drafts (`draft: true`) are visible in `npm run dev` and hidden in `npm run build`.

## Adding a project

Create a file in `src/content/projects/`:

```yaml
---
title: "Project name"
description: "One sentence."
year: 2026
status: "active"                # "active" | "archived"
featured: true                  # featured projects sort first
links:
  - label: "Repo"
    url: "https://github.com/..."
  - label: "Paper"
    url: "https://..."
---
```

The body of a project entry is currently not rendered on the index — the index only shows frontmatter. Add a `[...slug].astro` route under `src/pages/projects/` if you want detail pages later.

## Markdown vs MDX

Use plain markdown (`.md`) for almost every post — it's simpler, faster to author, and doesn't require imports.

Reach for MDX (`.mdx`) only when prose isn't enough on its own and the post genuinely wants an interactive component (a plot the reader can scrub, a small simulation, a knob to turn). The MDX template post (`src/content/posts/template-mdx-post.mdx`) shows the import pattern.

## Images

In a markdown post, use the standard syntax — alt text is required, and the optional title doubles as a caption:

```markdown
![Descriptive alt text.](https://example.com/foo.png "Optional caption goes here.")
```

A small rehype plugin in `astro.config.mjs` wraps standalone images in `<figure>` and turns the title into a `<figcaption>`. In MDX posts the `<Content components={{ img: Figure }} />` mapping in `src/pages/writing/[...slug].astro` does the same, plus you can use `<Figure>` directly:

```mdx
import pic from './pic.png';
<Figure src={pic} alt="..." caption="A caption" />
```

## Theme

Dark mode by default; light toggle persists to `localStorage`. Initial theme respects `prefers-color-scheme` if no preference is stored. The pre-paint script in `BaseHead.astro` avoids any flash of unstyled content.

Colors and typography live in `src/styles/global.css`. Accent color is muted amber (`#c89b3c` dark, `#a06d1f` light). Body font is self-hosted Newsreader (variable, latin). Code is rendered with Shiki in a dual `github-light` / `github-dark` theme that swaps with the site theme.

## Cloudflare Pages deployment

This site builds as a fully static bundle (no adapter, no SSR). To deploy:

1. Push this repo to GitHub.
2. In the Cloudflare dashboard → **Pages** → **Create a project** → connect the repo.
3. Framework preset: **Astro**. Build command: `npm run build`. Output directory: `dist`.
4. Cloudflare reads `.nvmrc` for the Node version (currently `20`).
5. `public/_headers` ships immutable cache for fonts and `_astro/*`, plus baseline security headers.

No deploy is wired up here yet — set the production domain first (see TODO list below).

## TODOs left to fill in

- `src/consts.ts` — `SITE_TITLE`, `SITE_DESCRIPTION`, `SITE_URL`, `AUTHOR`, `SOCIAL_LINKS`.
- `astro.config.mjs` — `site` URL.
- `src/pages/index.astro` — landing intro and "Currently" copy.
- `src/pages/about.astro` — Bio / Background / Contact sections.
- `public/favicon.svg` — replace placeholder.
- `public/og-default.png` — replace placeholder (1200×630 expected).
- Delete the two template posts and the template project once you have real ones.
