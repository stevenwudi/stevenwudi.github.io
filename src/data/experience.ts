export interface Role {
  period: string;
  org: string;
  /** Logo in public/logos/. */
  logo: string;
  /** First-person description; trusted HTML (links). */
  desc: string;
}

const a = (href: string, text: string) => `<a href="${href}">${text}</a>`;

// Dates from the 2020 CV; FITURE from the CV and site history; Covariant from Di.
export const EXPERIENCE: Role[] = [
  {
    period: 'Now',
    org: 'XDOF.ai',
    logo: '/logos/xdof.svg',
    desc: `I’m currently at ${a('https://www.xdof.ai/', 'XDOF.ai')}.`,
  },
  {
    period: '2022 – 2024',
    org: 'Covariant',
    logo: '/logos/covariant.svg',
    desc: `I was a research engineer at ${a('https://covariant.ai/', 'Covariant')}, focusing on AI for industrial robot picking.`,
  },
  {
    period: '2020 – 2022',
    org: 'FITURE',
    logo: '/logos/fiture.png',
    desc: `I was a computer vision scientist at ${a('https://www.fiture.com/', 'FITURE')}, building real-time embedded AI — detection, key-point recognition and 3D human pose — so a screen could be driven by natural, touchless gestures on a 5-TOPS edge device.`,
  },
  {
    period: '2019 – 2020',
    org: 'Ping An Property & Casualty Insurance',
    logo: '/logos/ping-an.svg',
    desc: `I was a senior research data scientist at ${a('https://property.pingan.com/', 'Ping An Property &amp; Casualty Insurance')}, where I led a computer-vision system for automatic car-damage assessment and used ARCore to render cars in 6-DoF, in real time, on a phone. Along the way our team took 2nd of 864 in Kaggle’s Peking University/Baidu autonomous-driving challenge.`,
  },
  {
    period: '2016 – 2019',
    org: 'Shenzhen University',
    logo: '/logos/shenzhen-university.svg',
    desc: `Postdoc at ${a('https://www.szu.edu.cn/', 'Shenzhen University')} on perception for autonomous driving: 6-DoF vehicle pose, instance segmentation and visual tracking — and 1st place in the ApolloScape 3D Car Instance challenge at ECCV 2018.`,
  },
  {
    period: '2015 – 2016',
    org: 'Idiap Research Institute (EPFL)',
    logo: '/logos/idiap.svg',
    desc: `Postdoc at the ${a('https://www.idiap.ch/', 'Idiap Research Institute')} (affiliated with EPFL) in Martigny, a beautiful Swiss Alpine town, on perception and activity understanding. I led person identification in broadcast TV for the EU FP7 ${a('https://web.archive.org/web/20181122004046/https://www.eumssi.eu/', 'EUMSSI')} project, whose system ranked 1st in the MediaEval 2015 person-discovery task.`,
  },
  {
    period: '2013',
    org: 'Microsoft Research Cambridge',
    logo: '/logos/microsoft.svg',
    desc: `Research intern at ${a('https://www.microsoft.com/en-us/research/lab/microsoft-research-cambridge/', 'Microsoft Research Cambridge')} with ${a('https://www.doc.ic.ac.uk/~bglocker/', 'Ben Glocker')}, using the Kinect to assess movement disorders in patients with multiple sclerosis.`,
  },
  {
    period: '2010 – 2014',
    org: 'University of Sheffield',
    logo: '/logos/university-of-sheffield.svg',
    desc: `PhD in Electronic &amp; Electrical Engineering at the ${a('https://www.sheffield.ac.uk/', 'University of Sheffield')}, on deep learning and probabilistic graphical models for human action and gesture recognition — work that led to papers at CVPR, ACM Multimedia and TNNLS.`,
  },
  {
    period: '2006 – 2010',
    org: 'Zhejiang University',
    logo: '/logos/zhejiang-university.svg',
    desc: `BEng in Electrical &amp; Electronic Engineering at ${a('https://www.zju.edu.cn/english/', 'Zhejiang University')}, where I led the build of a small autonomous car — home-brewed hardware and software — that follows a previously unseen curvy track.`,
  },
];
