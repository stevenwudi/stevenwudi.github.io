// import Scrollbar from './lib/smooth-scrollbar.js'
// import OverscrollPlugin from './lib/overscroll.js'
import { map } from './utils/utils.js'

import Scene from './Scene.js'
import HorizontalScrollPlugin from './utils/HorizontalScrollPlugin.js'

Scrollbar.use(HorizontalScrollPlugin, OverscrollPlugin)

const offsetTitle = 100


export default class Stage {

    constructor() {
        this.progress = 0

        this.$els = {
            title       : document.querySelector('.page-title'),
            progress    : document.querySelector('.slideshow__progress'),
            progressCtn : document.querySelector('.slideshow__progress-ctn'),
            scene       : document.getElementById('scene'),
        }


        this.init()

        this.bindEvents()
    }

    bindEvents() {
        document.addEventListener('lockScroll', ({ detail }) => { this.lockScroll(detail) })

        this.Scroll.addListener((s) => { this.onScroll(s) })
    }

    init() {
        this.Scroll = Scrollbar.init(document.querySelector('.scrollarea'), {
            delegateTo: document,
            continuousScrolling : false,
            overscrollEffect: 'bounce',
            damping: 0.05,
            plugins: {
                horizontalScroll: {
                    events: [/wheel/],
                },
            },
        })

        this.Scroll.track.xAxis.element.remove()
        this.Scroll.track.yAxis.element.remove()

        Scrollbar.detachStyle()

        this.updateScrollBar()

        this.scene = new Scene(this.$els.scene)
    }


    /* Handlers
    --------------------------------------------------------- */

    onScroll({ limit, offset }) {
        this.progress = offset.x / limit.x

        gsap.to(this.$els.title,
            {duration: 0.3,
            x: -this.progress * offsetTitle,
                force3D: true })
        this.updateScrollBar()
    }

    /* Actions
    --------------------------------------------------------- */

    updateScrollBar() {
        const progress = map(this.progress * 100, 0, 100, 5, 100)
        gsap.to(this.$els.progress, {duration: 0.3,
            xPercent: progress, force3D: true })
    }

    lockScroll({ lock }) {
        const duration = lock ? 0 : 1.8

        gsap.delayedCall(duration, () => {
            this.Scroll.updatePluginOptions('horizontalScroll', {
                events: lock ? [] : [/wheel/],
            })
            gsap.to(this.$els.progressCtn,  {
                duration: 0.5,
                alpha: lock ? 0 : 1,
                force3D: true,
            })
        })
    }

    /* Values
    --------------------------------------------------------- */


}
