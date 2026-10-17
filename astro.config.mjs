import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

const SITE = 'https://portfolio-818.pages.dev';

/**
 * Wrap standalone <img> (image-only paragraphs) in <figure>, using the
 * markdown image title syntax — `![alt](url "caption")` — as the caption.
 *
 * Astro's `<Content components={{ img: Figure }} />` only fires for MDX,
 * so plain .md posts need this rehype pass to get <figure> + <figcaption>.
 */
function rehypeImageFigure() {
  return (tree) => {
    const walk = (parent) => {
      if (!parent || !Array.isArray(parent.children)) return;
      for (let i = 0; i < parent.children.length; i++) {
        const node = parent.children[i];
        if (
          node.type === 'element' &&
          node.tagName === 'p' &&
          node.children.length === 1 &&
          node.children[0].type === 'element' &&
          node.children[0].tagName === 'img'
        ) {
          const img = node.children[0];
          const title = img.properties && img.properties.title;
          const figureChildren = [img];
          if (title) {
            delete img.properties.title;
            figureChildren.push({
              type: 'element',
              tagName: 'figcaption',
              properties: {},
              children: [{ type: 'text', value: String(title) }],
            });
          }
          parent.children[i] = {
            type: 'element',
            tagName: 'figure',
            properties: {},
            children: figureChildren,
          };
        } else {
          walk(node);
        }
      }
    };
    walk(tree);
  };
}

export default defineConfig({
  site: SITE,
  integrations: [mdx(), sitemap()],
  // About, contact and the project index live on the homepage.
  redirects: {
    '/about': '/#about',
    '/projects': '/#work',
    '/projects/robocasa': '/#robocasa',
    '/projects/slay-the-spire': '/#slay-the-spire',
  },
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      wrap: true,
    },
    rehypePlugins: [rehypeImageFigure],
  },
});
