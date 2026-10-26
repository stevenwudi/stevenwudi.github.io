export interface Role {
  period: string;
  org: string;
  href?: string;
  role?: string;
  place?: string;
  summary?: string;
}

// Dates from the 2020 CV; FITURE from the CV and site history.
export const EXPERIENCE: Role[] = [
  { period: 'Now', org: 'XDOF.ai', href: 'https://www.xdof.ai/' },
  {
    period: 'Freelance',
    org: 'Independent',
    role: 'AI engineer',
    summary:
      'Retrieval-augmented generation (RAG) to cut through bureaucratic paperwork, and a WeChat mini-program for the pet-lover community.',
  },
  {
    period: '2020 – 2022',
    org: 'FITURE',
    role: 'Computer vision scientist',
    summary:
      'Real-time embedded AI: detection, key-points and 3D human pose for touchless gesture control on a 5-TOPS edge device.',
  },
  {
    period: '2019 – 2020',
    org: 'Ping An Property & Casualty Insurance',
    role: 'Senior research data scientist',
    summary:
      'Computer vision for automatic car-damage assessment, with ARCore 6-DoF car rendering on mobile.',
  },
  {
    period: '2016 – 2019',
    org: 'Shenzhen University',
    role: 'Postdoctoral researcher',
    summary: 'Perception for autonomous driving: 6-DoF vehicle pose, instance segmentation, visual tracking.',
  },
  {
    period: '2015 – 2016',
    org: 'Idiap Research Institute (EPFL)',
    role: 'Postdoctoral researcher',
    place: 'Martigny, Switzerland',
    summary:
      'Perception and activity understanding; led person identification in broadcast TV for the EU FP7 EUMSSI project.',
  },
  {
    period: '2013',
    org: 'Microsoft Research Cambridge',
    role: 'Research intern',
    summary: 'Kinect-based assessment of movement disorders in multiple-sclerosis patients, with Ben Glocker.',
  },
  { period: '2010 – 2014', org: 'University of Sheffield', role: 'PhD, Electronic & Electrical Engineering' },
  { period: '2006 – 2010', org: 'Zhejiang University', role: 'BEng, Electrical & Electronic Engineering' },
];
