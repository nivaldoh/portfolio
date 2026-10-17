# Portfolio

Portfolio website. Astro 5, fully static, deployed to Cloudflare Pages.

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
│  ├─ projects/              # .mdx case studies → /projects/<slug>/ (the homepage reads their titles and summaries)
│  └─ posts/                 # .md / .mdx blog posts → /writing/ (not linked from the nav yet)
├─ components/
│  ├─ Plate, Details, ProjectPanel, BeamSection, Career, RecordedVideo, ...
│  ├─ wh3/                   # BattleReplay (the recorded Total War replay) + FlankTrace (hero route trace)
│  ├─ slay/                  # RunProgress: the furthest full run (homepage and the game-agents case study)
│  ├─ game-agents/           # small figures for the Total War case study
│  ├─ robocasa/              # DevelopmentRecordings: the homepage clips
│  ├─ tcg/                   # ResultsChart, TeacherData, TrainingLoop
│  └─ pokeagent/             # HybridSearch, MetamonPRs, SelfPlayDiagram, TournamentBrackets
├─ layouts/                  # BaseLayout, CaseStudyLayout, PostLayout
├─ pages/
│  ├─ index.astro            # / — hero with an index of the work, game agents (Total War + Slay the Spire), the PokéAgent → RoboCasa thread (#thread), Beam, background (#about), contact (#contact)
│  ├─ projects/[slug].astro  # /projects/<slug>/
│  ├─ writing/               # /writing/, /writing/<slug>/
│  ├─ 404.astro
│  └─ rss.xml.ts
├─ assets/work/<project>/    # images, optimised by astro:assets at build time
├─ data/                     # build-time inputs (e.g. the Beam code excerpt)
├─ styles/global.css         # tokens, type scale, shared presentation units, prose
└─ consts.ts                 # site title, description, URL, email, résumé path, social links
public/
├─ benchmarks/total-war/     # full report and compressed replays loaded on demand
├─ media/<project>/          # videos, posters and JSON served as-is (replay data, chart data)
├─ nivaldo-tokuda-resume.pdf
├─ fonts/                    # Self-hosted Newsreader and its OFL license
├─ og-default.png            # social card (1200×630)
├─ favicon.svg               # plain dark square
└─ _headers                  # Cloudflare Pages cache + security headers
scripts/
├─ import_wh3_benchmark.py   # package an exported standalone benchmark without changing recordings
├─ export_wh3_replay.py      # rebuilds public/media/game-agents/wh3-cavalry-flank.json from a recorded job
└─ replay.test.cjs           # focused tests of the replay's pure TypeScript logic
```

`/about`, `/projects` and `/projects/robocasa` redirect to `/#about`, `/#work` and `/#robocasa`.

## Case studies

Each case study is an `.mdx` file in `src/content/projects/`. The file name is the URL slug, and the frontmatter supplies the page header (and the homepage title and summary where the homepage uses them):

```yaml
---
title: Slay the Spire
subtitle: Tracing decisions over a full run                  # optional
description: One sentence for <meta name="description">.
summary: One or two short sentences for the homepage.
period: '2026'
order: 2                                                     # previous/next order
cover: { src: '../../assets/work/<project>/<image>', alt: '...' }   # optional, used as OG image
links:                                                       # public evidence only
  - label: Code
    url: https://github.com/...
credits:                                                     # the foundations the work builds on
  - Slay the Spire, by Mega Crit.
---
```

In the body, headings start at `h2`. Text sits in a 42rem reading column; give a figure or interactive panel the `wide` class (`<Plate wide ...>`, or wrap it in `<div class="wide">`) to span the full width. Put implementation detail in `<Details summary="...">`.

Every public claim must match its evidence, with evaluation scope and limitations alongside reported numbers. Keep private editorial notes in the ignored `dev/` folder; the site does not depend on its contents.

Homepage panels (`ProjectPanel.astro`) take their copy as props, and a panel's title links to a case study only when it is given an `href`. RoboCasa365 has no case study, and the homepage does not link the Pokémon TCG or PokéAgent/Metamon case studies (they stay reachable through the previous/next pager). RoboCasa365's panel uses `DevelopmentRecordings.astro`, the GR00T scene-change and Astra goal-change clips as ambient loops (`RecordedVideo` with `ambient`): muted, playing while on screen, with a Pause/Play toggle, and click-to-play with native controls under reduced motion or without JavaScript. The web copies and their posters live in `public/media/robocasa/`; the supplied source MP4s are archived locally in ignored `dev/robocasa/originals/`. The paper is served from `public/media/robocasa/teleporting-bread-and-changing-goals.pdf`, and `/projects/robocasa/` redirects to the homepage panel. Project evidence links accept absolute URLs or root-relative paths.

Projects 02–05 (PokéAgent, Metamon, Pokémon TCG, RoboCasa365) sit on one dated timeline, `#thread`, with two milestones between them; their panels use `level={3}` under the section's own heading. PokéAgent's panel shows `HybridSearch.astro`, a schematic of the Gen 9 OU entry, a Metamon + PokéChamp minimax hybrid (nivaldoh/pokechamp @ fb520c9; the leaf scores are illustrative), beside the compact `SelfPlayDiagram`. Metamon's panel shows `MetamonPRs.astro`: the two merged pull requests and the encoder experiment (#111) from the lab's private development repository, unlinked. The Background section draws work and study on one axis with `Career.astro`, whose "now" line is the build date.

## The Total War replay

`BattleReplay` renders a still of the key moment at build time and fetches `public/media/game-agents/wh3-cavalry-flank.json` only when the widget nears the viewport. Positions are shown exactly as recorded (latest sample at or before the playhead, never interpolated). To export another recorded battle from the game repository:

```bash
python3 -I scripts/export_wh3_replay.py \
  <slay_the_spire_ai>/runs/twwarhammer3/battle/<job>/episode-0000 \
  <slay_the_spire_ai>/configs/twwarhammer3/report_notes.json \
  public/media/game-agents/<name>.json
```

The current recording is `bench-c1-cavalry-ai11-02-20261015/episode-0000`. Its key moment starts at 166.2 s, focuses on 186.2 s, and ends at 236.0 s. For a byte-identical export of the checked-in file, use that episode and add `--clip 166.2 229.2` (the optional video-excerpt metadata). The map key and recorded-event list are expandable. A failed fetch keeps the real still visible and offers a keyboard-accessible retry.

## The full benchmark

The supplied `dev/benchmark.html` is a self-contained 16 October 2026 snapshot: CSS, JavaScript, report data, prompts, terrain, and 99 gzip/base64 replays are embedded. **No companion files are required to run that HTML.** The report and replay JSON downloads are generated in the browser. Filenames inside recording warnings or provenance are not browser dependencies. Rebuilding the report from scratch would require the source repository and original recorded jobs; this importer does not do that.

The original HTML is about 59.4 MB and exceeds the [Cloudflare Pages 25 MiB asset limit](https://developers.cloudflare.com/pages/platform/limits/). The importer puts the same report at `/benchmarks/total-war/index.html`, copies the compressed replay bytes unchanged into `replays/*.bin`, and fetches only the selected replay. The report is about 2.4 MB; each replay is under 1.6 MB. Keep **the entire `public/benchmarks/total-war/` directory** together when copying it. No external CDN or API is required.

```bash
python3 scripts/import_wh3_benchmark.py dev/benchmark.html
```

Run this only when deliberately replacing the public snapshot. Ordinary builds do not read `dev/`. The adapter adds portfolio navigation, a dark theme, retry after a failed replay fetch, and a static results table for visitors without JavaScript. It recomputes the inline script's CSP hash. Links can open a scenario (`?scenario=scenario-1`) or a battle at a time in seconds (`?battle=g2-t4&t=186.2`); while a visitor uses the page, `history.replaceState` keeps the address on the open battle, and on its time after a pause or seek. The adapter also removes the internal scenario status and the masthead summary, rewrites the cavalry footnote and a few labels in plain terms, labels Figure 1 as the fixed cavalry round of 15 October 2026, and moves the scenario thumbnails below the viewer. `manifest.json` records the source hash and all 99 replay hashes. Upstream template changes fail explicitly for review.

The static results table uses the matched M1 round's exact trial IDs and outcomes. M1 includes the two initial `bench-b12-caster-assault-20261016` trials and four subsequent caster trials. Each of the six scenarios has three trials for each model. Do not replace this with the report's pooled model totals: those combine different harness versions. The later gpt-6.1-sol round is separate.

Total War and Slay the Spire are one project (nivaldoh/slay_the_spire_ai): the homepage's first section shows both games, and `/projects/game-agents/` covers Total War with a closing Slay the Spire section (`#slay-the-spire`). The former `/projects/slay-the-spire/` page is archived in `dev/archive/` and redirects to the homepage section.

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
import pic from '../../assets/work/game-agents/wh3-replay.png';
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

Pages limits each file to 25 MiB. Use the benchmark importer above to split the supplied standalone WH3 report before adding it to `public/`.

## Validation

Run `npm run check`, `npm run test:replay` and `npm run build` before publishing changes. The replay tests cover recorded sample selection, application-time decisions, ties, the key moment and endpoint, absent replies/positions/terrain, and HTML escaping.

For changes to layout or interactions, preview the build and check the homepage, the three project pages, and the benchmark at phone, tablet and desktop widths. Exercise keyboard playback and scrubbing, replay fetch failure and retry, benchmark scenario and battle links (including the address updating on pause and seek) and downloads, the hero trace's pause button, the email copy button, and video pausing. Check reduced motion and readable static content with JavaScript disabled.

## Font license

The self-hosted Newsreader fonts are by the Newsreader Project Authors and are distributed under the SIL Open Font License 1.1. The copyright notice and complete license are included in [public/fonts/OFL.txt](public/fonts/OFL.txt).
