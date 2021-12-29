import { wrap, unwrap, ev } from './utils/utils.js'
import { SplitText as ST } from './vendors/gsap/SplitText.js'

export default class DetailView {

    constructor() {
        this.index = 0
        this.$els = {
            el: document.querySelectorAll('.detail-view')[this.index],
            closeBtn: document.querySelectorAll('.close-detail')[this.index],
            title: document.querySelector('.detail-view__title'),
        }

        this.bindEvent()
    }

    bindEvent() {
        document.addEventListener('view:toggle', ({ detail }) => { this.toggleReveal(detail) })

        this.$els.closeBtn.addEventListener('click', () => { this.onClose() })
    }

    onToggleView(shouldOpen = true) {
        this.$els.el.classList.toggle('is-interactive', shouldOpen)
        this.$els.el.classList.toggle('is-visible', shouldOpen)
    }

    onOpen() {
        const title = this.$els.el.querySelector('.detail-view__title')
        const text = this.$els.el.querySelectorAll('p')
        const { title: pageTitle } = APP.Stage.$els

        this.stgs = new ST([title, text], { type: 'lines', linesClass: 'line' })

        this.stgs.lines.forEach((l) => {
            const div = document.createElement('div')
            div.classList.add('line-ctn')
            wrap(l, div)
        })

        gsap.to(pageTitle, 0.5, {
            alpha: 0,
            force3D: true,
        })

        gsap.fromTo(this.$els.closeBtn, 0.5, {
            rotate: -45,
            scale: 0,
            alpha: 0,
        }, {
            rotate: 0,
            scale: 1,
            alpha: 1,
            ease: Power2.easeInOut,
            force3D: true,
        })

        gsap.to(this.stgs.lines,
            0.8,
            {
            yPercent: 0,
            },
            {
            yPercent: 100,
            ease: Power3.easeInOut,
            force3D: true,
        }, 0.5 / this.stgs.lines.length)

        this.onToggleView()
    }

    onClose() {
        console.log(2323)
        const { title: pageTitle } = APP.Stage.$els

        gsap.to(pageTitle, 0.5, {
            alpha: 0.1,
            force3D: true,
        })

        gsap.to(this.stgs.lines, 0.8, {
            yPercent: 100,
            ease: Power3.easeInOut,
            force3D: true,
        }, 0.5 / this.stgs.lines.length)

        setTimeout(() => {
            this.onToggleView(false)
            unwrap(this.stgs.lines)
        }, 800)

        gsap.to(this.$els.closeBtn, 0.5, {
            rotate: -45,
            scale: 0,
            alpha: 0,
            ease: Power2.easeInOut,
            force3D: true,
        })

        gsap.delayedCall(0.3, () => {
            console.log('2')
            ev('toggleDetail', {
                open: false,
                force: true,
            })
        })
    }

    toggleReveal({ shouldOpen, target, index }) {
        if (!shouldOpen) return

        console.log(this, this.$els)

        this.index = index
        this.$els.el = document.querySelectorAll('.detail-view')[index]
        this.$els.closeBtn = document.querySelectorAll('.close-detail')[index]
        console.log(this.$els.closeBtn)
        this.$els.closeBtn.addEventListener('click', () => { this.onClose() })
        this.$els.title.innerText = target.$els.title
        this.onOpen()
    }

}
