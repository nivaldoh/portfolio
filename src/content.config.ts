import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    interactive: z.boolean().default(false),
  }),
});

// Case studies. Each entry renders at /projects/<file slug>/ and supplies the
// homepage panel copy, so the summary and status live in one place.
const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      subtitle: z.string().optional(),
      /** <meta name="description"> for the case-study page. */
      description: z.string(),
      /** Homepage panel text: problem, personal contribution, in a few sentences. */
      summary: z.string(),
      /** Plain-language status, always shown next to the work. */
      status: z.string(),
      /** When the work happened, e.g. "2026" or "2022–2023". */
      period: z.string(),
      /** Position on the homepage and in previous/next navigation. */
      order: z.number().int(),
      cover: z.object({ src: image(), alt: z.string() }).optional(),
      links: z
        .array(z.object({ label: z.string(), url: z.string().url() }))
        .default([]),
      /** Foundations this work builds on ("Built on" box). */
      credits: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    }),
});

export const collections = { posts, projects };
