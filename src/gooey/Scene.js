import * as THREE from '../../../utils/threejs/build/three.module.js'

import Tile from './Tile.js'
import DetailView from './Detail.js'
import { ev } from './utils/utils.js'

const perspective = 800

let trippyShader = await (await  fetch('./src/glsl/trippyShader.glsl')).text()
let shapeShader = await (await fetch('./src/glsl/shapeShader.glsl')).text()
let gooeyShader = await (await fetch('./src/glsl/gooeyShader.glsl')).text()
let waveShader = await (await fetch('./src/glsl/waveShader.glsl')).text()
let revealShader = await (await fetch('./src/glsl/revealShader.glsl')).text()


const shaders = [

    trippyShader,
    gooeyShader,
    waveShader,
    revealShader,
    shapeShader,
]

const durations = [
    0.5,
    0.5,
    0.5,
    0.8,
    0.8,
]

export default class Scene {

    constructor($scene) {
        this.container = $scene
        this.$tiles = document.querySelectorAll('.slideshow-list__el')

        this.W = window.innerWidth
        this.H = window.innerHeight

        this.mouse = new THREE.Vector2(0, 0)
        this.activeTile = null

        this.start()

        this.detailview = new DetailView()


        this.bindEvent()
    }

    bindEvent() {
        document.addEventListener('toggleDetail', ({ detail: shouldOpen }) => { this.onToggleView(shouldOpen) })

        window.addEventListener('resize', () => { this.onResize() })
    }


    start() {
        this.mainScene = new THREE.Scene()
        this.initCamera()
        this.initLights()

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.container,
            alpha: true,
        })
        this.renderer.setSize(this.W, this.H)
        this.renderer.setPixelRatio(window.devicePixelRatio)

        this.tiles = Array.from(this.$tiles).map(($el, i) => new Tile($el, this, durations[i], shaders[i], i))

        this.update()
    }

    initCamera() {
        const fov = (180 * (2 * Math.atan(this.H / 2 / perspective))) / Math.PI

        this.camera = new THREE.PerspectiveCamera(fov, this.W / this.H, 1, 10000)
        this.camera.position.set(0, 0, perspective)
    }

    initLights() {
        const ambientlight = new THREE.AmbientLight(0xffffff, 2)
        this.mainScene.add(ambientlight)
    }

    /* Handlers
    --------------------------------------------------------- */
    onResize() {
        this.W = window.innerWidth
        this.H = window.innerHeight

        this.camera.aspect = this.W / this.H

        this.camera.updateProjectionMatrix()
        this.renderer.setSize(this.W, this.H)
    }

    onToggleView({ target, open }) {
        console.log(target, open)
        this.activeTile = target // !== undefined ? target : this.activeTile
        ev('lockScroll', { lock: open })
        ev('tile:zoom', { tile: this.activeTile, open })
    }

    /* Actions
    --------------------------------------------------------- */
    update() {
        requestAnimationFrame(this.update.bind(this))

        this.tiles.forEach((tile) => {
            tile.update()
        })

        this.renderer.render(this.mainScene, this.camera)
    }

}
