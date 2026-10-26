import raquel from '../assets/learning/icvss-2017-raquel-urtasun.jpg';

export interface Course {
  title: string;
  by?: string;
  href?: string;
}

export const SCHOOLS = [
  {
    title: 'International Computer Vision Summer School',
    meta: 'ICVSS 2017 · Sicily',
    href: 'https://web.archive.org/web/20190106224442/http://iplab.dmi.unict.it/icvss2017/',
    note: { label: 'and met my favourite researcher, Raquel Urtasun, again', href: raquel.src },
  },
  {
    title: 'Machine Learning Summer School',
    meta: 'MLSS 2014 · Reykjavik',
    href: 'http://mlss2014.hiit.fi/',
  },
  {
    title: 'Gaussian Process Summer School',
    meta: 'GPSS 2014 · Sheffield',
    href: 'https://gpss.cc/',
  },
];

export const COURSES: { provider: string; profile?: string; items: Course[] }[] = [
  {
    provider: 'Coursera',
    profile: 'https://www.coursera.org/user/3c53ce3e87f22d9388850aa05b574266',
    items: [
      {
        title: 'Machine Learning Engineering for Production (MLOps)',
        by: 'DeepLearning.AI',
        href: 'https://www.coursera.org/specializations/machine-learning-engineering-for-production-mlops',
      },
      {
        title: 'Generative Adversarial Networks (GANs)',
        by: 'DeepLearning.AI',
        href: 'https://www.coursera.org/specializations/generative-adversarial-networks-gans',
      },
      { title: 'Advanced App Development in Android' },
      {
        title: 'Introduction to Augmented Reality and ARCore',
        by: 'Google AR & VR',
        href: 'https://www.coursera.org/learn/ar',
      },
      { title: 'Machine Learning', by: 'Andrew Ng', href: 'https://www.coursera.org/course/ml' },
      { title: 'Probabilistic Graphical Models', by: 'Daphne Koller', href: 'https://www.coursera.org/course/pgm' },
      { title: 'Neural Networks for Machine Learning', by: 'Geoffrey Hinton' },
      { title: 'Startup Engineering', by: 'Balaji Srinivasan & Vijay Pande' },
      { title: 'C++ for C Programmers', by: 'Ira Pohl', href: 'https://www.coursera.org/course/cplusplus4c' },
      {
        title: 'An Introduction to Interactive Programming in Python',
        by: 'Joe Warren et al.',
        href: 'https://www.coursera.org/course/interactivepython',
      },
    ],
  },
  {
    provider: 'Udacity',
    items: [
      { title: 'Interactive 3D Rendering', href: 'https://www.udacity.com/course/cs291' },
      { title: 'Intro to Parallel Programming', by: 'NVIDIA', href: 'https://www.udacity.com/course/cs344' },
      {
        title: 'Artificial Intelligence for Robotics',
        by: 'Sebastian Thrun',
        href: 'https://www.udacity.com/course/artificial-intelligence-for-robotics--cs373',
      },
      { title: 'Android Development for Beginners', href: 'https://www.udacity.com/course/viewer#!/c-ud837' },
      { title: 'How to Use Git and GitHub', href: 'https://classroom.udacity.com/courses/ud775' },
    ],
  },
];
