// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// Self-hosted fonts, read from the installed Fontsource packages (Latin subset) — no network at build time.
// (The `npm` provider emits file:// URLs that Astro 7.4's font fetcher cannot read, so `local` is used.)
const local = fontProviders.local();
/** @param {string} pkg @param {string} name */
const file = (pkg, name) => `${pkg}/files/${name}.woff2`;

export default defineConfig({
  site: 'https://stevenwudi.github.io',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Astro 7 defaults to 'jsx', which strips whitespace between inline elements in prose.
  compressHTML: true,
  image: { layout: 'constrained' },
  fonts: [
    {
      provider: local,
      name: 'Instrument Serif',
      cssVariable: '--font-display',
      fallbacks: ['Georgia', 'serif'],
      options: {
        variants: [
          { src: [file('@fontsource/instrument-serif', 'instrument-serif-latin-400-normal')], weight: 400, style: 'normal' },
          { src: [file('@fontsource/instrument-serif', 'instrument-serif-latin-400-italic')], weight: 400, style: 'italic' },
        ],
      },
    },
    {
      provider: local,
      name: 'Inter',
      cssVariable: '--font-body',
      fallbacks: ['system-ui', 'sans-serif'],
      options: {
        variants: [
          { src: [file('@fontsource-variable/inter', 'inter-latin-wght-normal')], weight: '100 900', style: 'normal' },
          { src: [file('@fontsource-variable/inter', 'inter-latin-wght-italic')], weight: '100 900', style: 'italic' },
        ],
      },
    },
    {
      provider: local,
      name: 'JetBrains Mono',
      cssVariable: '--font-mono',
      fallbacks: ['ui-monospace', 'monospace'],
      options: {
        variants: [
          { src: [file('@fontsource/jetbrains-mono', 'jetbrains-mono-latin-400-normal')], weight: 400, style: 'normal' },
          { src: [file('@fontsource/jetbrains-mono', 'jetbrains-mono-latin-500-normal')], weight: 500, style: 'normal' },
        ],
      },
    },
  ],
  integrations: [mdx(), sitemap({ filter: (page) => !page.includes('/404') })],
});
