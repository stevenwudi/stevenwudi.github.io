import type { ImageMetadata } from 'astro';
import type { Link } from './work';
import neuralMeshRefiner from '../assets/papers/neural-mesh-refiner.jpg';
import sixDVNet from '../assets/papers/6d-vnet.jpg';
import kernalised from '../assets/papers/kernalised-convnet-tracking.png';
import ddnnTpami from '../assets/papers/ddnn-tpami-2016.png';
import eumssi from '../assets/papers/eumssi-mediaeval-2015.png';
import ddnnEccvw from '../assets/papers/ddnn-eccvw-2014.png';
import multimodal from '../assets/papers/multimodal-dynamic-networks.png';
import hierarchical from '../assets/papers/hierarchical-parametric-networks.png';
import deepAndWide from '../assets/papers/learning-deep-and-wide.png';
import mmmSvm from '../assets/papers/mmm-svm.png';
import silhouette from '../assets/papers/silhouette-action-recognition.png';
import oneShotKinect from '../assets/papers/one-shot-gesture-kinect.png';
import oneShotRgbd from '../assets/papers/one-shot-gesture-rgbd.jpg';
import correlogram from '../assets/papers/correlogram-body-poses.png';

export interface Publication {
  /** Anchor id on /publications/. */
  id: string;
  title: string;
  authors: string[];
  /** Short venue badge, e.g. "TPAMI". */
  venue: string;
  venueFull: string;
  year: number;
  image?: ImageMetadata;
  imageAlt?: string;
  abstract?: string;
  links?: Link[];
  note?: string;
  selected?: boolean;
}

export const PUBLICATIONS: Publication[] = [
  {
    id: 'neural-mesh-refiner',
    title: 'Neural Mesh Refiner for 6-DoF Pose Estimation',
    authors: ['Di Wu', 'Yihao Chen', 'Xianbiao Qi', 'Yongjian Jian', 'Weixuan Chen', 'Rong Xiao'],
    venue: 'arXiv',
    venueFull: 'arXiv preprint arXiv:2003.07561',
    year: 2020,
    image: neuralMeshRefiner,
    imageAlt: 'Pipeline: detection heads predict car class, rotation and translation; a neural mesh renderer refines the pose.',
    abstract:
      'How can we effectively utilise the 2D monocular image information for recovering the 6D pose (6-DoF) of the visual objects? Deep learning has shown to be effective for robust and real-time monocular pose estimation. Oftentimes, the network learns to regress the 6-DoF pose using a naive loss function. However, due to a lack of geometrical scene understanding from the directly regressed pose estimation, there are misalignments between the rendered mesh from the 3D object and the 2D instance segmentation result, e.g., bounding boxes and masks prediction. This paper bridges the gap between 2D mask generation and 3D location prediction via a differentiable neural mesh renderer. We utilise the overlay between the accurate mask prediction and less accurate mesh prediction to iteratively optimise the direct regressed 6D pose information with a focus on translation estimation. By leveraging geometry, we demonstrate that our technique significantly improves direct regression performance on the difficult task of translation estimation and achieve the state of the art results on Peking University/Baidu - Autonomous Driving dataset and the ApolloScape 3D Car Instance dataset.',
    links: [{ label: 'arXiv', href: 'https://arxiv.org/abs/2003.07561' }],
    selected: true,
  },
  {
    id: '6d-vnet',
    title: '6D-VNet: End-to-end 6-DoF Vehicle Pose Estimation from Monocular RGB Images',
    authors: ['Di Wu', 'Zhaoyong Zhuang', 'Canqun Xiang', 'Wenbin Zou', 'Xia Li'],
    venue: 'CVPRW',
    venueFull: 'CVPR Workshop on Autonomous Driving (WAD)',
    year: 2019,
    image: sixDVNet,
    imageAlt: 'Street scene from a car-mounted camera with detected vehicles highlighted.',
    abstract:
      "We present a conceptually simple framework for 6DoF object pose estimation, especially for autonomous driving scenario. Our approach efficiently detects traffic participants in a monocular RGB image while simultaneously regressing their 3D translation and rotation vectors. The method, called 6D-VNet, extends Mask R-CNN by adding customised heads for predicting vehicle's finer class, rotation and translation. The proposed 6D-VNet is trained end-to-end compared to previous methods. Furthermore, we show that the inclusion of translational regression in the joint losses is crucial for the 6DoF pose estimation task, where object translation distance along longitudinal axis varies significantly, e.g., in autonomous driving scenarios. Additionally, we incorporate the mutual information between traffic participants via a modified non-local block. As opposed to the original non-local block implementation, the proposed weighting modification takes the spatial neighbouring information into consideration whilst counteracting the effect of extreme gradient values.",
    links: [
      {
        label: 'Paper',
        href: 'https://openaccess.thecvf.com/content_CVPRW_2019/html/Autonomous_Driving/Wu_6D-VNet_End-to-End_6-DoF_Vehicle_Pose_Estimation_From_Monocular_RGB_Images_CVPRW_2019_paper.html',
      },
    ],
    selected: true,
  },
  {
    id: 'kernalised-convnet-tracking',
    title: 'Kernalised Multi-resolution Convnet for Visual Tracking',
    authors: ['Di Wu', 'Wenbin Zou', 'Xia Li', 'Y. Zhao'],
    venue: 'CVPRW',
    venueFull: 'IEEE Conference on Computer Vision and Pattern Recognition Workshops',
    year: 2017,
    image: kernalised,
    imageAlt: 'Architecture: hierarchical response maps from pre-trained VGG features feed a CNN that outputs the target movement.',
    abstract:
      'Kernelized Correlation Filters (KCF) have demonstrated excellent performance for high-speed visual object tracking. The key to their success is by observing that the resulting data matrix of translated patches is circulant, the cyclic shifts could be diagonalised with the Discrete Fourier Transform, reducing both storage and computation to obtain the next frame response map. Built upon their seminal work, there has been a plethora of recent improvements relying on convolutional neural network (CNN) pretrained on ImageNet as a feature extractor for visual tracking. However, most of their works rely on ad hoc analysis to design the weights for different layers either using boosting or hedging techniques as an ensemble tracker. In this paper, we go beyond the conventional KCF framework and introduce a novel formulation for training from the hierarchical response maps to directly output the target movement. We interpret the response maps from the hierarchies of convolutional layers as a nonlinear counter part of an image pyramid representation and employ a learning framework for mapping the hierarchical outputs to target translation. Our proposed formulation enables efficient integration of multi-resolution deep feature maps trained from massive online image data and demonstrates its competitiveness over the corresponding counterpart baselines.',
  },
  {
    id: 'vehicle-reid',
    title: 'Multi-model Metric Learning for Vehicle Re-identification in Traffic Surveillance Environment',
    authors: ['Y. Tang', 'D. Wu', 'Z. Jin', 'W. Zou', 'X. Li'],
    venue: 'ICIP',
    venueFull: 'IEEE International Conference on Image Processing',
    year: 2017,
  },
  {
    id: 'ddnn-tpami',
    title: 'Deep Dynamic Neural Networks for Multimodal Gesture Segmentation and Recognition',
    authors: ['Di Wu', 'Lionel Pigou', 'Pieter-Jan Kindermans', 'Nam Le', 'Ling Shao', 'Joni Dambre', 'Jean-Marc Odobez'],
    venue: 'TPAMI',
    venueFull: 'IEEE Transactions on Pattern Analysis and Machine Intelligence',
    year: 2016,
    image: ddnnTpami,
    imageAlt: 'Learned 3D-CNN filters and response maps for body and hand regions in grayscale and depth.',
    abstract:
      'This paper describes a novel method called Deep Dynamic Neural Networks (DDNN) for multimodal gesture recognition. A semi-supervised hierarchical dynamic framework based on a Hidden Markov Model (HMM) is proposed for simultaneous gesture segmentation and recognition where skeleton joint information, depth and RGB images, are the multimodal input observations. Unlike most traditional approaches that rely on the construction of complex handcrafted features, our approach learns high-level spatio-temporal representations using deep neural networks suited to the input modality: a Gaussian-Bernouilli Deep Belief Network (DBN) to handle skeletal dynamics, and a 3D Convolutional Neural Network (3DCNN) to manage and fuse batches of depth and RGB images. This is achieved through the modeling and learning of the emission probabilities of the HMM required to infer the gesture sequence. This purely data driven approach achieves a Jaccard index score of 0.81 in the ChaLearn LAP gesture spotting challenge. The performance is on par with a variety of state-of-the-art hand-tuned feature-based approaches and other learning-based methods, therefore opening the door to the use of deep learning techniques in order to further explore multimodal time series data.',
    links: [
      { label: 'PDF', href: '/Images/tPAMI2016.pdf' },
      { label: 'DOI', href: 'https://doi.org/10.1109/TPAMI.2016.2537340' },
    ],
    selected: true,
  },
  {
    id: 'face-diarization-periodical-detection',
    title: 'Efficient and Accurate Tracking for Face Diarization via Periodical Detection',
    authors: ['N. Le', 'A. Heili', 'D. Wu', 'J.-M. Odobez'],
    venue: 'ICPR',
    venueFull: 'International Conference on Pattern Recognition',
    year: 2016,
  },
  {
    id: 'face-tracking-subsampled-detection',
    title: 'Temporally Subsampled Detection for Accurate and Efficient Face Tracking and Diarization',
    authors: ['N. Le', 'A. Heili', 'D. Wu', 'J.-M. Odobez'],
    venue: 'ICPR',
    venueFull: 'International Conference on Pattern Recognition',
    year: 2016,
  },
  {
    id: 'eumssi-mediaeval',
    title: 'EUMSSI team at the MediaEval Person Discovery Challenge',
    authors: ['Nam Le', 'Di Wu', 'Sylvain Meignier', 'Jean-Marc Odobez'],
    venue: 'MediaEval',
    venueFull: 'Proceedings of the MediaEval 2015 Workshop, Wurzen, Germany',
    year: 2015,
    image: eumssi,
    imageAlt: 'Diagram of speaking faces and speech turns aligned along a broadcast timeline.',
    abstract:
      "We present the results of the EUMSSI team's participation in the Multimodal Person Discovery task at the MediaEval challenge 2015. Our system ranks first amongst 9 international research teams. The goal is to identify all people who simultaneously appear and speak in a video corpus, which implicitly involves both audio stream and visual stream. We emphasize on improving each modality separately and benchmarking them to analyze their pros and cons.",
    links: [{ label: 'Challenge', href: 'http://www.multimediaeval.org/mediaeval2015/persondiscovery2015/' }],
    note: 'Ranked 1st of 9 teams',
  },
  {
    id: 'ddnn-eccvw',
    title: 'Deep Dynamic Neural Networks for Gesture Segmentation and Recognition',
    authors: ['Di Wu', 'Ling Shao'],
    venue: 'ECCVW',
    venueFull: 'ChaLearn Looking at People workshop, ECCV 2014, Zurich',
    year: 2014,
    image: ddnnEccvw,
    imageAlt: '3D convolutional network architecture over depth and body-part input volumes.',
    abstract:
      'The purpose of this paper is to describe a novel Deep Dynamic Neural Networks (DDNN) for the track 3 of the Chalearn Looking at People 2014 challenge. A generalised semi-supervised hierarchical dynamic framework is proposed for simultaneous gesture segmentation and recognition taking both skeleton and depth images as input modules. First, Deep Belief Networks (DBN) and 3D Convolutional Neural Networks (3DCNN) are adopted for skeletal and depth module accordingly to extract high level spatio-temporal features. Then the learned representations are used for estimating emission probabilities of the Hidden Markov Models to infer action sequence. The framework can be easily extended by including an ergodic state to segment and recognise video sequence in a frame-to-frame mechanism, rendering it possible for online segmentation and recognition for diverse input modules. Some normalisation details pertaining to preprocessing raw features are also discussed. This purely data-driven approach achieves 0.8162 score in this gesture spotting challenge. The performance is on par with a variety of the state-of-the-art hand-tuned-feature approaches and other learning-based methods, opening the doors for using deep learning techniques to explore time series multimodal data.',
    links: [{ label: 'Code', href: 'https://github.com/stevenwudi/3DCNN_HMM' }],
  },
  {
    id: 'multimodal-dynamic-networks',
    title: 'Multimodal Dynamic Networks for Gesture Recognition',
    authors: ['Di Wu', 'Ling Shao'],
    venue: 'ACM MM',
    venueFull: 'ACM Multimedia 2014, Orlando',
    year: 2014,
    image: multimodal,
    imageAlt: 'Audio and skeleton networks feeding shared emission probabilities of a hidden Markov model.',
    abstract:
      "Multimodal input is a real-world situation in gesture recognition applications such as sign language recognition. In this paper, we propose a novel bi-modal (audio and skeleton joints) dynamic network for gesture recognition. First, state-of-the-art dynamic Deep Belief Networks are deployed to extract high level audio and skeletal joints representations. Then, instead of traditional late fusion, we adopt another layer of perceptron for cross modality learning taking the input from each individual net's penultimate layer. Finally, to account for temporal dynamics, the learned shared representations are used for estimating the emission probability to infer action sequences. In particular, we demonstrate that multimodal feature learning will extract semantically meaningful shared representations, outperforming individual modalities, and the early fusion scheme's efficacy against the traditional method of late fusion.",
  },
  {
    id: 'hierarchical-parametric-networks',
    title: 'Leveraging Hierarchical Parametric Networks for Skeletal Joints Based Action Segmentation and Recognition',
    authors: ['Di Wu', 'Ling Shao'],
    venue: 'CVPR',
    venueFull: 'IEEE Conference on Computer Vision and Pattern Recognition',
    year: 2014,
    image: hierarchical,
    imageAlt: 'Skeleton joints feeding a deep network whose outputs act as emission probabilities of a hidden Markov model.',
    abstract:
      'Over the last few years, with the immense popularity of the Kinect, there has been renewed interest in developing methods for human gesture and action recognition from 3D skeletal data. A number of approaches have been proposed to extract representative features from 3D skeletal data, most commonly hard wired geometric or bio-inspired shape context features. We propose a hierarchial dynamic framework that first extracts high level skeletal joints features and then uses the learned representation for estimating emission probability to infer action sequence. Currently gaussian mixture models are the dominant technique for modeling the emission distribution of hidden Markov models. We show that better action recognition using skeletal features can be achieved by replacing gaussian mixture models by deep neural networks that contain many layers of features to predict probability distributions over states of hidden Markov models. The framework can be easily extended to include a ergodic state to segment and recognize actions simultaneously.',
    links: [
      {
        label: 'Paper',
        href: 'https://openaccess.thecvf.com/content_cvpr_2014/html/Wu_Leveraging_Hierarchical_Parametric_2014_CVPR_paper.html',
      },
      { label: 'Video', href: 'https://www.youtube.com/watch?v=Hez9PkM-XfA' },
      { label: 'Code', href: 'https://github.com/stevenwudi/CVPR_2014_code' },
    ],
    selected: true,
  },
  {
    id: 'learning-deep-and-wide',
    title: 'Learning Deep and Wide: A Spectral Method for Learning Deep Networks',
    authors: ['Ling Shao', 'Di Wu', 'X. Li'],
    venue: 'TNNLS',
    venueFull: 'IEEE Transactions on Neural Networks and Learning Systems',
    year: 2014,
    image: deepAndWide,
    imageAlt: 'Penultimate-layer features of several networks embedded into one low-dimensional manifold.',
    abstract:
      'Building intelligent systems that are capable of extracting high-level representations from high-dimensional sensory data lies at the core of solving many computer vision related tasks. We propose the Multi-Spectral Neural Networks (MSNN) to learn features from multi-column Deep Neural Networks and embed the penultimate hierarchical discriminative manifolds into a compact representation. The low dimensional embedding explores the complementary property of different views wherein the distribution of each view is sufficiently smooth and hence achieves robustness given few labeled training data. Our experiments show that spectrally embedding several deep neural networks can explore the optimum output from the multi-column networks and consistently decrease the error rate compared to a single deep network.',
    selected: true,
  },
  {
    id: 'mmm-svm',
    title: 'Multi-Max-Margin Support Vector Machine for Multi-Source Human Action Recognition',
    authors: ['Di Wu', 'Ling Shao'],
    venue: 'Neurocomputing',
    venueFull: 'Neurocomputing',
    year: 2013,
    image: mmmSvm,
    imageAlt: 'Decision values from several camera views combined by a multi-max-margin SVM.',
    abstract:
      "We propose a new ensemble-based classifier for multi-source human action recognition called Multi-Max-Margin Support Vector Machine (MMM-SVM). This ensemble method incorporates the decision values of multiple sources and makes an informed final prediction by merging multi-source feature's intrinsic decision strength. Experiments performed on the benchmark IXMAS multi-view dataset demonstrate that the performance of our multi-view system can further improve the accuracy over single view by 3%-13% and consistently outperform the direct-concatenation method. We further apply this ensemble technique for combining the decision values of contextual and motion information in the UCF Sports dataset and the results are comparable to the state-of-the-art, which exhibits our algorithm's potential for further extension in other areas of feature fusion problems.",
  },
  {
    id: 'silhouette-action-recognition',
    title: 'Silhouette Analysis Based Action Recognition via Exploiting Human Poses',
    authors: ['Di Wu', 'Ling Shao'],
    venue: 'TCSVT',
    venueFull: 'IEEE Transactions on Circuits and Systems for Video Technology',
    year: 2013,
    image: silhouette,
    imageAlt: 'Silhouette sequences clustered into a bag of correlated poses.',
    abstract:
      'In this paper, we propose a novel scheme for human action recognition that combines the advantages of both local and global representations. We explore human silhouettes for human action representation by taking into account the correlation between sequential poses in an action. A modified bag-of-words model, named bag-of-correlated-poses (BoCP), is introduced to encode temporally local features of actions. To utilize the property of visual word ambiguity, we adopt the soft assignment strategy to reduce the dimensionality of our model and circumvent the penalty of computational complexity and quantization error. To compensate for the loss of structural information, we propose an extended motion template, i.e., extensions of the motion history image (extended-MHI) to capture the holistic structural features. The proposed scheme takes advantages of local and global features and therefore provides a discriminative representation for human actions. Experimental results prove the viability of the complimentary properties of two descriptors and the proposed approach outperforms the state-of-the-art methods on the IXMAS action recognition dataset.',
  },
  {
    id: 'one-shot-gesture-kinect',
    title: 'One Shot Learning Gesture Recognition with Kinect Sensor',
    authors: ['Di Wu', 'F. Zhu', 'Ling Shao', 'H. Zhang'],
    venue: 'ACM MM',
    venueFull: 'ACM Multimedia 2012',
    year: 2012,
    image: oneShotKinect,
    imageAlt: 'Demo interface: a user records a gesture once and assigns it to an action.',
    abstract:
      'Gestures are both natural and intuitive for Human-Computer-Interaction (HCI) and the one-shot learning scenario is one of the real world situations in terms of gesture recognition problems. In this demo, we present a hand gesture recognition system using the Kinect sensor, which addresses the problem of one-shot learning gesture recognition with a user defined training and testing system. Such a system can behave like a remote control where the user can allocate a specific function using a prefered gesture by performing it only once. To adopt the gesture recognition framework, the system first automatically segments an action sequence into atomic tokens, and then adopts the Extended-Motion-History-Image (Extended-MHI) for motion feature representation. We evaluate the performance of our system quantitatively in Chalearn Gesture Challenge, and apply it to a virtual one shot learning gesture recognition system.',
  },
  {
    id: 'one-shot-gesture-rgbd',
    title: 'One Shot Learning Gesture Recognition from RGBD Images',
    authors: ['Di Wu', 'F. Zhu', 'Ling Shao'],
    venue: 'CVPRW',
    venueFull: 'CVPR 2012 Workshop on Gesture Recognition',
    year: 2012,
    image: oneShotRgbd,
    imageAlt: 'Depth frames and extended motion-history images of a gesture.',
    abstract:
      'We present a system to classify the gesture from only one learning example. The inputs are duo-modality, i.e. RGB and depth sensor from Kinect. Our system performs morphological denoising on depth images and automatically segments the temporal boundaries. Features are extracted based on Extended-Motion-History-Image (Extended-MHI) and the Multi-view Spectral Embedding (MSE) algorithm is used to fuse duo modalities in a physically meaningful manner. Our approach achieves less than 0.3 in Levenshtein distance in CHALEARN Gesture Challenge validation batches.',
  },
  {
    id: 'correlogram-body-poses',
    title: 'Action Recognition Using Correlogram of Body Poses and Spectral Regression',
    authors: ['Ling Shao', 'Di Wu', 'X. Chen'],
    venue: 'ICIP',
    venueFull: 'IEEE International Conference on Image Processing',
    year: 2011,
    image: correlogram,
    imageAlt: 'Grid of correlograms of body poses for eleven actions.',
    abstract:
      'Human action recognition is an important topic in computer vision with its applications range from robotics, video surveillance, human-computer interaction, user interface design, multi-media video retrieval and among others. This paper proposed a novel representation for human action using Correlogram of Body Poses (CBP) which is a descendant of our previous work on Histogram of Body Poses (HBP). In addition, the paper explores a recently proposed subspace learning method called Spectral Regression Discriminant Analysis (SRDA) which aims to speed up the traditional subspace learning methods. Results show that this new representation of human action achieves a rather satisfactory rate and be compared to most state-of-art methods.',
  },
];

/** Bold the site owner's name in author lists. */
export const isMe = (author: string) => author === 'Di Wu' || author === 'D. Wu';
