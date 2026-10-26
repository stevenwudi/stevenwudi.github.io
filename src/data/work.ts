import type { ImageMetadata } from 'astro';
import gesturePoster from '../assets/work/touchless-gesture.jpg';
import arcore from '../assets/work/arcore-car-damage.jpg';
import vehiclePose from '../assets/work/vehicle-pose.png';

export interface Link {
  label: string;
  href: string;
}

export type Media =
  | { kind: 'video'; src: string; poster: ImageMetadata; alt: string }
  | { kind: 'image'; src: ImageMetadata; alt: string; fit?: 'cover' | 'contain' };

export interface Project {
  title: string;
  meta: string;
  summary: string;
  media: Media;
  links?: Link[];
}

export const PROJECTS: Project[] = [
  {
    title: 'Touchless gesture control',
    meta: 'FITURE · 2021',
    summary:
      'Robust detection, key-point recognition and 3D human pose, running in real time on a 5-TOPS edge device so a screen can be driven by natural gestures — “Mission Impossible”-style, or simply ordering at McDonald’s in the time of Covid.',
    media: {
      kind: 'video',
      src: '/media/touchless-gesture.mp4',
      poster: gesturePoster,
      alt: 'Live demo: body skeleton and hand key-points tracked in real time while a person gestures at a screen.',
    },
  },
  {
    title: '6-DoF vehicle pose from a single image',
    meta: 'Research · 2018 – 2020',
    summary:
      'Networks built on Mask R-CNN that detect every car and regress its full 3D rotation and translation, then refine the pose with a differentiable neural mesh renderer. 1st in the ApolloScape 3D Car Instance challenge and 2nd of 864 teams on Kaggle.',
    media: {
      kind: 'image',
      src: vehiclePose,
      alt: 'A car mesh aligned to a street photo through a 6-DoF rotation and translation.',
      fit: 'contain',
    },
    links: [
      { label: '6D-VNet (CVPRW 2019)', href: '/publications/#6d-vnet' },
      { label: 'Neural Mesh Refiner', href: '/publications/#neural-mesh-refiner' },
    ],
  },
  {
    title: 'AR car rendering for insurance claims',
    meta: 'Ping An P&C Insurance · 2020',
    summary:
      'A computer-vision system for automatic car-damage evaluation, with ARCore rendering the car model in real time with 6 degrees of freedom on a phone.',
    media: {
      kind: 'image',
      src: arcore,
      alt: 'Phone screen recording: a translucent 3D car model overlaid on the camera view, with damage-classification labels.',
      fit: 'contain',
    },
    links: [{ label: 'Watch the demo on YouTube', href: 'https://www.youtube.com/watch?v=yKIvFBERICE' }],
  },
];

export interface Honour {
  rank: string;
  suffix: string;
  of?: string;
  event: string;
  detail: string;
  year?: number;
  href?: string;
}

export const HONOURS: Honour[] = [
  {
    rank: '2',
    suffix: 'nd',
    of: '864',
    event: 'Peking University / Baidu Autonomous Driving',
    detail: 'Kaggle · cash prize · 6-DoF pose of cars from a single image',
    year: 2020,
    href: 'https://www.kaggle.com/c/pku-autonomous-driving/leaderboard',
  },
  {
    rank: '1',
    suffix: 'st',
    event: 'ApolloScape 3D Car Instance Understanding',
    detail: 'ECCV 2018 · Baidu · cash prize',
    year: 2018,
    href: 'https://web.archive.org/web/20190110152520/http://apolloscape.auto/ECCV/carboard.html',
  },
  {
    rank: '3',
    suffix: 'rd',
    of: '145',
    event: 'CVPR 2018 WAD Video Segmentation',
    detail: 'Kaggle · Baidu · cash prize · top 2%',
    year: 2018,
    href: 'https://www.kaggle.com/c/cvpr-2018-autonomous-driving/leaderboard',
  },
  {
    rank: '23',
    suffix: 'rd',
    of: '1,646',
    event: 'Future Challenge — Helping Balloons Navigate the Weather',
    detail: 'Alibaba Cloud · top 1.4% · 3D A* routing for cargo balloons',
    year: 2017,
  },
  {
    rank: '7',
    suffix: 'th',
    of: '2,100',
    event: 'Taobao Clothes Matching',
    detail: 'Alibaba Tianchi · team enemylessRain · season 1',
    href: 'https://tianchi.aliyun.com/competition/rankingList.htm?spm=0.0.0.0.CjYjGh&raceId=231506&season=0',
  },
  {
    rank: '1',
    suffix: 'st',
    of: '9',
    event: 'MediaEval Multimodal Person Discovery in Broadcast TV',
    detail: 'MediaEval 2015 · team EUMSSI',
    year: 2015,
    href: 'http://www.multimediaeval.org/mediaeval2015/persondiscovery2015/',
  },
  {
    rank: '8',
    suffix: 'th',
    event: 'ChaLearn Gesture Challenge',
    detail: 'Oral at the CVPR 2012 Workshop on Gesture Recognition',
    year: 2012,
    href: 'http://gesture.chalearn.org/dissemination/cvpr2012',
  },
];
