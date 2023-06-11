import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from './Pass.js';
import {
	ShaderMaterial,
	UniformsUtils
} from 'three';


const SHADOWMAPSIZE = 512;

let IS_TUTORIAL = 1;
let FORCE_SKIP = false;
const OBJECTS = {};

let LEVEL = 0;

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath( './decoder/' );
loader.setDRACOLoader( dracoLoader );
const TOLOAD = ['table', 'chair', 'lamp', 'smalltable', 'radio', 'couch', 'hanglamp', 'bench', 'camera', 'shelves'];
for(let to of TOLOAD){
  loader.load( './models/' + to + '.glb', function ( gltf ) {
    gltf.scene.updateMatrixWorld( true );
  	OBJECTS[to] = gltf.scene;
  }, undefined, function ( error ) {
  	console.error( error );
  } );
}

const AUDIOS = ["Body_and_Soul", "Dancing_In_The_Dark", "Home", "Im_In_Another_World", "Intermezzo", "Its_All_Forgotten_Now", "Oh_You_Crazy_Moon", "Stardust", "The_Very_Thought_of_You", "You_were_there"];
let audio_index = 0;
let sound;

function audio_to_src(audio){
  return './audio/' + audio + '_Verb.mp3';
}

function play_audio(){
  if(audio_index == 0){
    // shuffle
    for (let i = AUDIOS.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = AUDIOS[i];
      AUDIOS[i] = AUDIOS[j];
      AUDIOS[j] = temp;
    }
  }

  if(sound) {
    sound.pause();
    sound.currentTime = 0;
  }
  sound.src = audio_to_src(AUDIOS[audio_index]);
  sound.play().catch(_ => play_audio());

  audio_index++;
  if(audio_index >= AUDIOS.length){
    audio_index = 0;
  }
}

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  1,
  10000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
//renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);


// ---- BEGIN POSTPROCESSING BUFFER UTILS ----
const postprocessing_buffer = new THREE.Scene();

const postprocessing_bufferTexture = new THREE.WebGLRenderTarget( window.innerWidth, window.innerHeight, { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter });

const postprocessing_camera = new THREE.OrthographicCamera( 1 / - 2, 1 / 2, 1 / 2, 1 / - 2, 1, 100 );
postprocessing_camera.position.set(0, 0, 15);
postprocessing_camera.lookAt(0, 0, 0);
postprocessing_buffer.add(postprocessing_camera);

const postprocessing_quad_geo = new THREE.PlaneGeometry( 1, 1 );
const postprocessing_quad_mat = new THREE.MeshBasicMaterial({ map: postprocessing_bufferTexture.texture });
const postprocessing_quad = new THREE.Mesh(postprocessing_quad_geo, postprocessing_quad_mat);
postprocessing_buffer.add(postprocessing_quad);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(postprocessing_buffer, postprocessing_camera));

const FilmShader = {

	name: 'FilmShader',

	uniforms: {

		'tDiffuse': { value: null },
		'time': { value: 0.0 },
		'nIntensity': { value: 1 },
		'sIntensity': { value: 0.025 },
		'sCount': { value: window.innerHeight / 2 },
    'angle': { value: 1.4 },
	},

	vertexShader: /* glsl */`
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,

	fragmentShader: /* glsl */`
		#include <common>
		// control parameter
		uniform float time;
		uniform float nIntensity;
		uniform float sIntensity;
		uniform float sCount;
    uniform float angle;
		uniform sampler2D tDiffuse;
		varying vec2 vUv;
		void main() {
      vec4 original = texture2D( tDiffuse, vUv );
			vec4 cTextureScreen = texture2D( tDiffuse, vUv + rand(vUv + time) * 0.005 );
			float dx = rand( vUv + time );
			vec3 cResult = cTextureScreen.rgb + cTextureScreen.rgb * clamp( 0.1 + dx, 0.0, 1.0 );
			cResult += cTextureScreen.rgb * sin( vUv.y * sCount * sin(angle) + vUv.x * sCount * cos(angle) ) * sIntensity;
			cResult = original.rgb + clamp( nIntensity, 0.0,1.0 ) * ( cResult - original.rgb );

			gl_FragColor =  vec4( cResult, cTextureScreen.a );
		}`,

};

class FilmPass extends Pass {

	constructor( noiseIntensity, scanlinesIntensity, scanlinesCount, grayscale ) {

		super();

		const shader = FilmShader;

		this.uniforms = UniformsUtils.clone( shader.uniforms );

		this.material = new ShaderMaterial( {

			name: shader.name,
			uniforms: this.uniforms,
			vertexShader: shader.vertexShader,
			fragmentShader: shader.fragmentShader

		} );

		this.fsQuad = new FullScreenQuad( this.material );

	}

	render( renderer, writeBuffer, readBuffer, deltaTime /*, maskActive */ ) {

		this.uniforms[ 'tDiffuse' ].value = readBuffer.texture;
		this.uniforms[ 'time' ].value += deltaTime;

		if ( this.renderToScreen ) {

			renderer.setRenderTarget( null );
			this.fsQuad.render( renderer );

		} else {

			renderer.setRenderTarget( writeBuffer );
			if ( this.clear ) renderer.clear();
			this.fsQuad.render( renderer );

		}

	}

	dispose() {

		this.material.dispose();

		this.fsQuad.dispose();

	}

}

const DotScreenShader = {

	name: 'DotScreenShader',

	uniforms: {

		'tDiffuse': { value: null },
		'tSize': { value: new THREE.Vector2( 256, 256 ) },
		'center': { value: new THREE.Vector2( 0, 0 ) },
		'angle': { value: 0.5 },
		'scale': { value: 4.0 }

	},

	vertexShader: /* glsl */`
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,

	fragmentShader: /* glsl */`
		uniform vec2 center;
		uniform float angle;
		uniform float scale;
		uniform vec2 tSize;
		uniform sampler2D tDiffuse;
		varying vec2 vUv;
		float pattern() {
			float s = sin( angle ), c = cos( angle );
			vec2 tex = vUv * tSize - center;
			vec2 point = vec2( c * tex.x - s * tex.y, s * tex.x + c * tex.y ) * scale;
			return sin( point.x ) * sin( point.y );
		}
		void main() {
			vec4 color = texture2D( tDiffuse, vUv );
			gl_FragColor = vec4( color.rgb * (pattern() * 0.05 + 0.6), color.a );
		}`

};

composer.addPass(new ShaderPass(DotScreenShader));
composer.addPass(new FilmPass());


// ---- END POSTPROCESSING BUFFER UTILS ----

function updatePixelRatio(){
  const pratio = 1;//Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pratio);
  composer.setPixelRatio(pratio);
}
updatePixelRatio();

let scenes = [];
let objects = [], planes = [], lights = [];

function generate_room(RFACTOR){
  let return_planes = [];
  const material = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });

  let p1 = new THREE.Mesh(new THREE.PlaneGeometry(4 + RFACTOR, 3), material.clone());
  p1.position.set( 0, 0, -2 );
  return_planes.push(p1);

  let p2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), material.clone());
  p2.position.set( -2 - RFACTOR/2, 0, 0 );
  p2.rotateY(Math.PI / 2);
  return_planes.push(p2);

  let p3 = new THREE.Mesh(new THREE.PlaneGeometry(4, 4 + RFACTOR), material.clone());
  p3.position.set( 0, -1.5, 0 );
  p3.rotateZ(Math.PI / 2);
  p3.rotateY(Math.PI / 2);
  return_planes.push(p3);

  let p1p = new THREE.Mesh(new THREE.PlaneGeometry(4 + RFACTOR, 3), material.clone());
  p1p.position.set( 0, 0, 2 );
  p1p.rotateY(Math.PI);
  return_planes.push(p1p);

  let p2p = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), material.clone());
  p2p.position.set( 2 + RFACTOR/2, 0, 0 );
  p2p.rotateY(Math.PI / 2);
  p2p.rotateY(Math.PI);
  return_planes.push(p2p);

  let p3p = new THREE.Mesh(new THREE.PlaneGeometry(4, 4 + RFACTOR), material.clone());
  p3p.position.set( 0, 1.5, 0 );
  p3p.rotateZ(Math.PI / 2);
  p3p.rotateY(Math.PI / 2);
  p3p.rotateY(Math.PI);
  return_planes.push(p3p);

  return return_planes;
}

function transform_object(object){
  object.mesh.position.copy(object.position);
  object.mesh.rotateY(object.yrot);
  object.mesh.rotateOnWorldAxis(object.axis, object.angle);

  object.bounding_box = new THREE.Box3().setFromObject(object.mesh);
}

function add_object(object){
  scenes.push(new THREE.Scene());
  objects.push(object);

  object.shadowplanes = [];
  
  const mat = new THREE.MeshBasicMaterial({ color: object.color });
  object.mesh.traverse(n => { 
    if(n.isMesh) {
      n.material = mat;
      n.castShadow = false;
      n.layers.set(2);
    }
  });
  scenes[scenes.length - 1].add(object.mesh);

  const smat = new THREE.ShadowMaterial();
  for(let plane of planes){
    /*const planenormal = new THREE.Vector3(0, 0, 1);
    planenormal.applyQuaternion(plane.quaternion);
    const angle = object.light.angleTo(planenormal);
    if(angle >= Math.PI / 2) continue;*/
    
    const p = plane.clone();
    p.material = smat;
    p.receiveShadow = true;
    p.layers.set(1);
    scenes[scenes.length - 1].add(p);
    object.shadowplanes.push(p);
  }

  // shadow object [duplicate]
  const shadow_object = object.mesh.clone();
  let fakematerial = new THREE.MeshBasicMaterial();
  fakematerial.depthWrite = false;
  fakematerial.colorWrite = false;
  shadow_object.traverse(n => { 
    if(n.isMesh) {
      n.material = fakematerial;
      n.castShadow = true;
      n.layers.set(1);
    }
  });
  scenes[scenes.length - 1].add(shadow_object);

  const light = new THREE.PointLight( 0xffffff, 1 );
  light.position.copy(object.light);
  light.castShadow = true;
  light.shadow.mapSize.width = SHADOWMAPSIZE;
  light.shadow.mapSize.height = SHADOWMAPSIZE;
  light.layers.set(1);
  //scenes[scenes.length - 1].add(light);
  lights.push(light);
  object.referenceTo_light = light;
}

function generate_beige(){
  return 'hsl(' + (Math.random() * 100) + ', ' + (Math.random() * 20 + 20) + '%, 40%)'
}


let camera_rot;

function create_scene(){
  camera_rot = new THREE.Vector2(Math.PI / 4, -Math.PI / 4);
  setCamPosition();

  for(let s of scenes){
    s.traverse(o => {
      if(o.isMesh){
        o.geometry.dispose();
        o.material.dispose();
      }
      if(typeof(o.dispose) == 'function'){
        o.dispose();
      }
    });
  }
  for(let l of lights){
    l.dispose();
  }
  
  scenes = []; objects = []; planes = []; lights = [];

  let rectangular_factor = Math.random() + 1;
  
  // backdrop room
  planes = generate_room(IS_TUTORIAL ? 0 : rectangular_factor);
  scenes.push(new THREE.Scene());
  for(let plane of planes){
    scenes[0].add(plane);
  }

  let planeBoundaries = [];
  for(let p of planes){
    var plane = new THREE.Plane();
    var normal = new THREE.Vector3();
    var point = new THREE.Vector3();

    normal.set( 0, 0, 1 ).applyQuaternion( p.quaternion );
    point.copy( p.position );
    plane.setFromNormalAndCoplanarPoint( normal, point );
    
    planeBoundaries.push(plane);
  }

  if(IS_TUTORIAL == 3){
    let object = {
      mesh: OBJECTS.chair,
      position: new THREE.Vector3(0, -1.5, -1),
      yrot: 0,
      light: new THREE.Vector3(4.949, 4.949, 0),
      color: generate_beige(),
      axis: new THREE.Vector3(0, 0, 1),
      angle: 0,
      name: "chair"
    };
    transform_object(object);
    add_object(object);

    let object2 = {
      mesh: OBJECTS.lamp,
      position: new THREE.Vector3(0, -1.5, 1),
      yrot: 0,
      light: new THREE.Vector3(0, 4.949, 4.949),
      color: generate_beige(),
      axis: new THREE.Vector3(0, 0, 1),
      angle: 0,
      name: "lamp"
    };
    transform_object(object2);
    add_object(object2);
  } else if(IS_TUTORIAL){
    let object = {
      mesh: OBJECTS.chair,
      position: new THREE.Vector3(0, -1.5, 0),
      yrot: 0,
      light: new THREE.Vector3(4.949, 4.949, 0),
      color: generate_beige(),
      axis: new THREE.Vector3(0, 0, 1),
      angle: 0,
      name: "chair"
    };
    transform_object(object);
    add_object(object);
  } else {
    LEVEL++;
    const flatness_factor = 0.8;
    const probability_wall = 1 / (LEVEL + flatness_factor / (1 - flatness_factor)) + flatness_factor;
    
    let num_objects = Math.floor(Math.random() * 4) + 4;
    const choices = Object.keys(OBJECTS);
    
    for(let i = 0; i < num_objects; i ++){
      for(let retry = 0; retry < 100; retry ++){
        let choice = choices[Math.floor(Math.random() * choices.length)];
                
        let pos = new THREE.Vector3((Math.random() - 0.5) * (4 + rectangular_factor), -1.5, (Math.random() - 0.5) * 4);

        let axis = new THREE.Vector3(1, 0, 0);
        let angle = 0;
        if(Math.random() > probability_wall){
          if(Math.random() < 0.5) axis.set(0, 0, 1);
          
          angle = Math.floor(Math.random() * 2) + 1;
          if(Math.random() < 0.5) angle = -angle;
          
          if(Math.abs(angle) == 2){
            pos.y = -pos.y; // easy
          } else {
            if(axis.x){
              pos.set((Math.random() - 0.5) * (4 + rectangular_factor), (Math.random() - 0.5) * 3, -4 * Math.sign(angle) / 2);
            } else {
              pos.set((4 + rectangular_factor) * Math.sign(angle) / 2, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4);
            }
          }

          angle *= Math.PI / 2;
        }

        let object = {
          name: choice,
          mesh: OBJECTS[choice].clone(),
          position: pos,
          yrot: Math.random() * Math.PI * 2,
          light: new THREE.Vector3().randomDirection().multiplyScalar(7),
          axis,
          angle,
          color: generate_beige()
        };
        transform_object(object);
        
        if(objects.find(o => o.bounding_box.intersectsBox(object.bounding_box)) || planeBoundaries.find(p => p.distanceToPoint(object.position) > 0 && object.bounding_box.intersectsPlane(p))){
          object.mesh.traverse(m => {
            if(!m.isMesh) return;
            
            m.geometry.dispose();
            m.material.dispose();
          })
          continue;
        }        

        add_object(object);

        break;
      }
    }
  }
}

let camera_flipped = false;
function setCamPosition(){
  const v = new THREE.Vector3(7, 0, 0);
  v.applyAxisAngle(new THREE.Vector3(0, 0, -1), camera_rot.y);
  v.applyAxisAngle(new THREE.Vector3(0, -1, 0), camera_rot.x);
  camera.up.set(0, (camera_flipped ? -1 : 1), 0);
  camera.position.set(v.x, v.y, v.z);
  camera.lookAt(0, 0, 0);
}

const DRAG_SLOWNESS = 80;

const mouse = {
  pos: new THREE.Vector2(),
  down: false
};
let resize_timer;

const waitmsg = document.getElementById("waitmsg");
const brumpet = document.getElementById("brumpet");
const skip = document.getElementById("skip");
function end_skip(){
  skip.style.transition = "opacity 1s";
  skip.classList.remove("normalBrumpetOpacity");
  skip.style.opacity = "0";
  setTimeout(() => { skip.style.display = "none"; }, 1000);
}
function setup(){
  waitmsg.style.opacity = "0";
  setTimeout(() => {
    waitmsg.classList.add("disableTransition");
    waitmsg.innerText = "";
  }, 5000);
  setTimeout(() => {
    skip.style.cursor = "pointer";
    setTimeout(() => { skip.style.transition = "none"; }, 1000);
    skip.classList.add("normalBrumpetOpacity");

    skip.addEventListener("pointerdown", function(event){
      FORCE_SKIP = true;
      end_skip();
    }, false);
  }, 4000);
  
  create_scene();
  play_audio();

  brumpet.classList.add("normalBrumpetOpacity");
  brumpet.style.cursor = "pointer";
  brumpet.addEventListener("pointerdown", function(event){
    if(sound.paused)
      sound.play();
    else
      sound.pause();
  }, false);
  
  document.body.addEventListener("pointerdown", function(event) {
    mouse.down = true;
    mouse.pos.set(event.clientX, event.clientY);
  }, false);
  document.body.addEventListener("pointerup", function(event) {
    mouse.down = false;
  }, false);
  document.body.addEventListener("pointermove", function(event) {
    {
      if(mouse.down && !wmsgopacity && IS_TUTORIAL != 1) {
        camera_rot.x += (event.clientX - mouse.pos.x) / DRAG_SLOWNESS * (camera_flipped ? -1 : 1);
  
        let prev = camera_rot.y;
        camera_rot.y += -(event.clientY - mouse.pos.y) / DRAG_SLOWNESS;
        for(let x = -2; x < 2; x ++){
          if(Math.sign(Math.PI / 2 + Math.PI * x - prev) != Math.sign(Math.PI / 2 + Math.PI * x - camera_rot.y)){
            camera_flipped = !camera_flipped;
          }
        }
        /*camera_rot.y = Math.min(camera_rot.y, Math.PI / 2);
        camera_rot.y = Math.max(camera_rot.y, -Math.PI / 2);*/
        camera_rot.x %= Math.PI * 2;
        camera_rot.y %= Math.PI * 2;
      }
    }
    
    mouse.pos.set(event.clientX, event.clientY);
  }, false);
  
  window.addEventListener( 'resize', () => {
    clearTimeout(resize_timer);
    resize_timer = setTimeout(() => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
      updatePixelRatio();
    }, 100);
  }, false);
}

const audioclick = document.getElementById("audioclick");
audioclick.addEventListener("click", () => {
  hasaudioclick = true;
  audioclick.style.opacity = "0";

  sound = new Audio(audio_to_src(AUDIOS[0]));
  sound.addEventListener("ended", play_audio, false);
}, false);

let waiting = true;
let hasaudioclick = false;
let hasbrumpetimage = false;
let wmsgopacity = 0;

if(brumpet.complete){ hasbrumpetimage = true; }
else {
  brumpet.addEventListener('load', () => { hasbrumpetimage = true; });
}

const swipe = document.getElementById("swipe");

function render() {
  if(waiting){
    if(hasaudioclick && TOLOAD.every(o => OBJECTS[o]) && AUDIOS.length > 0 && hasbrumpetimage){
      waiting = false;
      setup();
    }

    requestAnimationFrame(render);
    return;
  }
  
  setCamPosition();
  
  renderer.setRenderTarget(
    postprocessing_bufferTexture
  );
  renderer.clear();
  for(let layer = 0; layer < 3; layer ++){
    camera.layers.set(layer);
    for(let scene of scenes){
      // memory optimization getting a little crazy
      for(let light of lights){
        scene.add(light);
      }
      renderer.render(scene, camera);
      for(let light of lights){
        scene.remove(light);
      }
    }
  }

  renderer.setRenderTarget(null);
  renderer.clear();
  composer.render();

  const camdirection = new THREE.Vector3(0, 0, -1);
  camdirection.applyQuaternion(camera.quaternion);
  for(let plane of planes){
    const planenormal = new THREE.Vector3(0, 0, 1);
    planenormal.applyQuaternion(plane.quaternion);
    const angle = camdirection.angleTo(planenormal);

    plane.material.transparent = true;
    plane.material.opacity = Math.max((angle - Math.PI / 2) / Math.PI * 2, 0);
    plane.material.needsUpdate = true;
  }

  let alldeaths = true;
  for(let o of objects){
    if(!o.death || o.death > 0.05) { alldeaths = false; }
    
    if(o.death && o.death < 1){ 
      o.death += (0 - o.death) / 16;
      // we can do this without transition since the camera is aligned to hide shadows
      o.referenceTo_light.castShadow = false;
      
      for(let plane of o.shadowplanes){
        plane.material.transparent = true;
        plane.material.opacity = o.death;
      }
      o.mesh.traverse(n => { 
        if(n.isMesh) {
          n.material.transparent = true;
          n.material.opacity = o.death;
          n.material.depthWrite = false;
          n.material.needsUpdate = true;
        }
      });
      continue;
    }
    
    const offset = camera.position.clone();
    if(offset.angleTo(o.light) < 0.02){
      o.death = 0.99;
    }
  }
  
  if(!alldeaths && IS_TUTORIAL == 1 && waitmsg.innerText == ""){
    camera_rot.x += (0 - camera_rot.x) / 40;
    camera_rot.y += (-Math.PI / 4 - camera_rot.y) / 40;
  }

  if(alldeaths || FORCE_SKIP){
   /* if(!FORCE_SKIP){
      camera_rot.x += (Math.PI / 4 - camera_rot.x) / 32;
      camera_rot.y += (-Math.PI / 4 - camera_rot.y) / 32;
    }

    const delta = Math.abs(Math.PI / 4 - camera_rot.x) + Math.abs(-Math.PI / 4 - camera_rot.y); 
    
    if(delta < 0.01 || FORCE_SKIP) {*/
      let r = Math.random();
      if(r < Math.pow(wmsgopacity, 1.2)){
        waitmsg.style.opacity = 1;
      } else {
        waitmsg.style.opacity = wmsgopacity;
      }
      wmsgopacity += Math.pow(wmsgopacity, 2) + 0.0004;
    //}
  
    if(wmsgopacity > 0.99){
      if(FORCE_SKIP) { 
        IS_TUTORIAL = 0;
        swipe.style.opacity = "0";
        FORCE_SKIP = false;
      }
      else if(IS_TUTORIAL == 1) {
        IS_TUTORIAL = 2;
        setTimeout(() => {swipe.style.opacity = "0.6";}, 1000);
        setTimeout(() => {swipe.style.opacity = "0";}, 3000);
      }
      else if(IS_TUTORIAL == 2) IS_TUTORIAL = 3;
      else {
        IS_TUTORIAL = 0;
        end_skip();
      }
      create_scene();
      wmsgopacity = 1;
    }
  } else if(wmsgopacity > 0.05){
    let r = wmsgopacity < 0.1 ? 1 : Math.random();
    if(r < 0.01){
      waitmsg.style.opacity = wmsgopacity + 0.4;
    } else if(r < 0.02){
      waitmsg.style.opacity = wmsgopacity - 0.4;
    } else {
      wmsgopacity += (-0.1 - wmsgopacity) / 32;
      waitmsg.style.opacity = wmsgopacity;
    }

    if(wmsgopacity <= 0.05){
      wmsgopacity = 0;
      waitmsg.style.opacity = wmsgopacity;
    }
  }
  
  requestAnimationFrame(render);
}
render();