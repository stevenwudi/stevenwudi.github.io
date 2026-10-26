// Site-wide facts. Optional links render only when set.
export const SITE = {
  url: 'https://stevenwudi.github.io',
  name: 'Di Wu',
  nameZh: '吴迪',
  title: 'Di Wu (吴迪) — computer vision & machine learning',
  description:
    'Di Wu (吴迪) builds machine-learning systems that see — from human gesture and action recognition to 6-DoF pose and 3D perception. Currently at XDOF.ai.',
  current: { org: 'XDOF.ai', href: 'https://www.xdof.ai/', role: undefined as string | undefined },
  email: 'stevenwudi@gmail.com',
  links: {
    github: 'https://github.com/stevenwudi',
    kaggle: 'https://www.kaggle.com/stevenwudi',
    scholar: undefined as string | undefined,
    linkedin: undefined as string | undefined,
  },
  /** Path to a CV in public/, e.g. '/cv.pdf'. Shows a CV button when set. */
  cv: undefined as string | undefined,
};

export const PROFILES = [
  { label: 'GitHub', href: SITE.links.github },
  { label: 'Kaggle', href: SITE.links.kaggle },
  { label: 'Google Scholar', href: SITE.links.scholar },
  { label: 'LinkedIn', href: SITE.links.linkedin },
].filter((p): p is { label: string; href: string } => Boolean(p.href));
