# stevenwudi.github.io

Personal site of Di Wu (吴迪) — <https://stevenwudi.github.io>. Built with [Astro](https://astro.build) and deployed
to GitHub Pages by GitHub Actions on every push to `master`.

## Run locally

Needs Node ≥ 22.23.4 (see `.nvmrc`; Node 24 LTS recommended).

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # static site in dist/
npm run preview   # serve dist/
npm run check     # type-check
```

## Where things live

| What | File |
| --- | --- |
| Name, email, profile links, CV, current role | `src/data/site.ts` |
| Experience timeline | `src/data/experience.ts` |
| Projects and honours | `src/data/work.ts` |
| Publications | `src/data/publications.ts` |
| Summer schools and courses | `src/data/learning.ts` |
| Notes (articles) | `src/pages/notes/*.mdx` |
| Colours, type, layout | `src/styles/global.css` |
| Images | `src/assets/` (optimised to WebP at build time) |
| Files served as-is | `public/` |

**Add a paper:** put a figure in `src/assets/papers/`, import it at the top of `src/data/publications.ts`, and add an
entry to `PUBLICATIONS` (newest first). Set `selected: true` to feature it on the homepage.

**Add a CV:** copy it to `public/cv.pdf` and set `cv: '/cv.pdf'` in `src/data/site.ts`.

**Add Google Scholar or LinkedIn:** set the URL in `SITE.links` in `src/data/site.ts`.

## Old URLs

The previous site's pages redirect to their new homes via small stubs in `public/` (`Publications.html`,
`ResearchActivities.html`, `blog.html`, `DiWuContact.html`). `public/Images/tPAMI2016.pdf` keeps its original URL.

## Credits

Fonts: Instrument Serif, Inter and JetBrains Mono (SIL Open Font License), self-hosted. The 吴迪 seal is drawn from
Ma Shan Zheng (SIL Open Font License).
