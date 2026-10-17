# Portfolio

Portfolio of AI-agent, evaluation and systems work, with case studies, recorded media and a few interactions built from real records. Astro 5, fully static, deployed to Cloudflare Pages.

## Commands

| Command           | What it does                                          |
| ----------------- | ----------------------------------------------------- |
| `npm install`     | Install dependencies.                                 |
| `npm run dev`     | Start the dev server at `http://localhost:4321`.      |
| `npm run check`   | Run `astro check` (TypeScript + content schemas).     |
| `npm run test:replay` | Check recorded timing, scrubbing, missing fields and HTML escaping. |
| `npm run build`   | Produce a static build in `dist/`.                    |
| `npm run preview` | Serve `dist/` locally to preview the production build. |

Node 20+ is required (pinned in `.nvmrc`). Local Node 18.17.1+ also works for development; Cloudflare Pages reads `.nvmrc` at build time.

## Local preview

To check the production build locally without deploying:

```bash
npm run build && npm run preview
```

This produces `dist/` and serves it at `http://localhost:4321`. Nothing leaves your machine. Use `npm run dev` for day-to-day authoring (faster, hot-reloading, draft posts visible); use the above when you want to verify the final output.

**Local preview is the default.** Deploy to production only when explicitly required.

## Project structure

```
src/
├─ content.config.ts         # Collection schemas (posts, projects)
├─ content/
│  ├─ projects/              # .mdx case studies → /projects/<slug>/ (also feed the homepage panels)
│  └─ posts/                 # .md / .mdx blog posts → /writing/ (not linked from the nav yet)
├─ components/
│  ├─ Plate, Details, ProjectPanel, BeamSection, RecordedVideo, ...
│  ├─ wh3/                   # BattleReplay: the recorded Total War replay (SVG + vanilla TS)
│  ├─ slay/                  # DecisionSteps: the recorded Gambling Chip trace
│  ├─ game-agents/           # small figures for the Game agents page
│  ├─ robocasa/              # GoalChange toggle + timelines, SharedStep diagram
│  ├─ tcg/                   # ResultsChart, TrainingLoop
│  └─ pokeagent/             # SelfPlayDiagram, TournamentBrackets
├─ layouts/                  # BaseLayout, CaseStudyLayout, PostLayout
├─ pages/
│  ├─ index.astro            # / — hero, featured replay, panels, Beam, background (#about), contact (#contact)
│  ├─ projects/[slug].astro  # /projects/<slug>/
│  ├─ writing/               # /writing/, /writing/<slug>/
│  ├─ 404.astro
│  └─ rss.xml.ts
├─ assets/work/<project>/    # images, optimised by astro:assets at build time
├─ data/                     # build-time inputs (e.g. the Beam code excerpt)
├─ styles/global.css         # tokens, type scale, shared presentation units, prose
└─ consts.ts                 # site title, description, URL, email, résumé path, social links
public/
├─ media/<project>/          # videos, posters and JSON served as-is (replay data, chart data)
├─ nivaldo-tokuda-resume.pdf
├─ fonts/                    # Self-hosted Newsreader and its OFL license
├─ og-default.png            # social card (1200×630)
├─ favicon.svg               # plain dark square
└─ _headers                  # Cloudflare Pages cache + security headers
scripts/
├─ export_wh3_replay.py      # rebuilds public/media/game-agents/wh3-cavalry-flank.json from a recorded job
└─ replay.test.cjs           # focused tests of the replay's pure TypeScript logic
```

`/about` and `/projects` redirect to `/#about` and `/#work`.

## Case studies

Each case study is an `.mdx` file in `src/content/projects/`. The file name is the URL slug, and the frontmatter supplies both the page header and the homepage panel:

```yaml
---
title: Changing goals during robot execution
subtitle: An agentic evaluation extension for RoboCasa365     # optional
description: One sentence for <meta name="description">.
summary: Two or three sentences for the homepage panel.
status: Workshop submission; decision pending                # always shown next to the work
period: '2026'
order: 2                                                     # homepage + previous/next order
cover: { src: '../../assets/work/robocasa/figure1.png', alt: '...' }   # optional, used as OG image
links:                                                       # public evidence only
  - label: Code
    url: https://github.com/...
credits:                                                     # the foundations the work builds on
  - RoboCasa365 ...
---
```

In the body, headings start at `h2`. Text sits in a 42rem reading column; give a figure or interactive panel the `wide` class (`<Plate wide ...>`, or wrap it in `<div class="wide">`) to span the full width. Put implementation detail in `<Details summary="...">`.

Every public claim must match its evidence, with evaluation scope and limitations alongside reported numbers. Keep private editorial notes in the ignored `dev/` folder; the site does not depend on its contents.

## The Total War replay

`BattleReplay` renders a still of the key moment at build time and fetches `public/media/game-agents/wh3-cavalry-flank.json` only when the widget nears the viewport. Positions are shown exactly as recorded (latest sample at or before the playhead, never interpolated). To export another recorded battle from the game repository:

```bash
python3 -I scripts/export_wh3_replay.py \
  <slay_the_spire_ai>/runs/twwarhammer3/battle/<job>/episode-0000 \
  <slay_the_spire_ai>/configs/twwarhammer3/report_notes.json \
  public/media/game-agents/<name>.json
```

The current recording is `bench-c1-cavalry-ai11-02-20261015/episode-0000`. Its key moment starts at 166.2 s, focuses on 186.2 s, and ends at 236.0 s. For a byte-identical export of the checked-in file, use that episode and add `--clip 166.2 229.2` (the optional video-excerpt metadata). The map key and recorded-event list are expandable. A failed fetch keeps the real still visible and offers a keyboard-accessible retry.

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

Drafts (`draft: true`) are visible in `npm run dev` and hidden in `npm run build`, but their source is still public if committed. Keep private drafts in the ignored `dev/` folder until ready to share. No posts are included yet. When no published posts exist, `/writing/` redirects to `/#work`, the RSS feed has no entries, and pages omit RSS discovery. The writing section is not linked from the navigation; add it back to `src/components/Header.astro` once real posts exist.

## Images

In a markdown post, use the standard syntax — alt text is required, and the optional title doubles as a caption:

```markdown
![Descriptive alt text.](https://example.com/foo.png "Optional caption goes here.")
```

A small rehype plugin in `astro.config.mjs` wraps standalone images in `<figure>` and turns the title into a `<figcaption>`. In MDX, import the asset and use `<Plate>` (framed, with caption) or `<Figure>`:

```mdx
import pic from '../../assets/work/robocasa/figure1.png';
<Plate src={pic} alt="..." caption="A caption" wide />
```

## Theme

A single dark theme (no toggle). Tokens live in `src/styles/global.css`: indigo-black background, candlewax ivory text, pale-gold accent for links and focus, and a separate set of data colours (`--data-model`, `--data-ai`, `--data-ok`, `--data-miss`) used only in figures. Type is self-hosted Newsreader (variable weight and optical size). Code in posts uses Shiki `github-dark`.

## Cloudflare Pages deployment

This site builds as a fully static bundle (no adapter, no SSR). To deploy:

1. Push this repo to GitHub.
2. In the Cloudflare dashboard → **Pages** → **Create a project** → connect the repo.
3. Framework preset: **Astro**. Build command: `npm run build`. Output directory: `dist`.
4. Cloudflare reads `.nvmrc` for the Node version (currently `20`).
5. `public/_headers` ships immutable cache for fonts and `_astro/*`, plus baseline security headers.

Pages limits each file to 25 MiB, so full experiment reports (the WH3 HTML report is ~59 MB) can't be copied into `public/`.

## Validation

Run `npm run check`, `npm run test:replay` and `npm run build` before publishing changes. The replay tests cover recorded sample selection, application-time decisions, ties, the key moment and endpoint, absent replies/positions/terrain, and HTML escaping.

For changes to layout or interactions, preview the build and check the homepage and all four project pages at phone, tablet and desktop widths. Exercise keyboard playback and scrubbing, replay fetch failure and retry, robot selection, Slay steps, and video pausing. Check reduced motion and readable static content with JavaScript disabled.

## Font license

The self-hosted Newsreader fonts are by the Newsreader Project Authors and are distributed under the SIL Open Font License 1.1. The copyright notice and complete license are included in [public/fonts/OFL.txt](public/fonts/OFL.txt).
