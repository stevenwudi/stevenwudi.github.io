"use strict"; // good practice - see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Strict_mode
////////////////////////////////////////////////////////////////////////////////
// Smooth shading exercise: change program to make sphere look smooth
////////////////////////////////////////////////////////////////////////////////
/*global THREE, window, document, $*/

var camera, scene, renderer;
var cameraControls;
var clock = new THREE.Clock();
var ambientLight, light;

var mesh;
var frame = 0 ;

function init() {
    // CAMERA
    camera = new THREE.PerspectiveCamera( 45, window.innerWidth / window.innerHeight, 1, 80000 );
    camera.position.set( -300, 300, -1000 );
    camera.lookAt(0,0,0);
    // LIGHTS

    ambientLight = new THREE.AmbientLight( 0xFFFFFF );
    light = new THREE.DirectionalLight( 0xFFFFFF, 0.7 );
    light.position.set( -800, 900, 300 );

    // RENDERER
    renderer = new THREE.WebGLRenderer( {antialias: true } );
    renderer.setSize(window.innerWidth/1.2, window.innerHeight/1.3);
    //renderer.setSize(800, 800);


    var container = document.getElementById('container');
    container.appendChild( renderer.domElement );

    renderer.gammaInput = true;
    renderer.gammaOutput = true;

    // CONTROLS
    cameraControls = new THREE.OrbitAndPanControls( camera, renderer.domElement );
    cameraControls.target.set(0, 0, 0);

}

function fillScene() {
    scene = new THREE.Scene();
    // scene.fog = new THREE.Fog( 0x808080, 2000, 4000 );

    // LIGHTS
    scene.add( ambientLight );
    scene.add( light );

    var loader = new THREE.JSONLoader()

    // load a resource
    loader.load(
        // resource URL
        'js/car_model/baojun-310-2017.js',

        // onLoad callback
        function ( geometry) {
            mesh = new THREE.Mesh( geometry, new THREE.MeshNormalMaterial());
            mesh.position.y += 200;
            mesh.position.x += 600;
            scene.add( mesh );
        },

        // onProgress callback
        function ( xhr ) {
            console.log( (xhr.loaded / xhr.total * 100) + '% loaded' );
        },

        // onError callback
        function( err ) {
            console.log( 'An error happened' );
        }
    );

}

function addToDOM() {
    var container = document.getElementById('container');
    var canvas = container.getElementsByTagName('canvas');
    if (canvas.length>0) {
        container.removeChild(canvas[0]);
    }
    container.appendChild( renderer.domElement );
}

function animate() {
    window.requestAnimationFrame( animate );
    render();
}

function render() {
    var delta = clock.getDelta();
    cameraControls.update(delta);

    renderer.render( scene, camera );
    if (frame > 1) {
        if (mesh.position.y >= -200) {
            mesh.position.y -= 1;
            mesh.position.z += 1;
            mesh.rotation.y -= 0.005;
        }
    }
    frame += 1;
}

try {
    init();
    fillScene();
    addToDOM();
    animate();
} catch(e) {
    var errorReport = "Your program encountered an unrecoverable error, can not draw on canvas. Error was:<br/><br/>";
    $('#container').append(errorReport+e);
}
