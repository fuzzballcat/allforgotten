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

const swipe_map = new THREE.TextureLoader().load('./icons/swipe.png');
const swipe_material = new THREE.SpriteMaterial({ map: swipe_map });
const swipe_sprite = new THREE.Sprite( swipe_material );

const click_map = new THREE.TextureLoader().load('./icons/click.png');
const click_material = new THREE.SpriteMaterial({ map: click_map });
const click_sprite = new THREE.Sprite( click_material );

const eyearrow_map = new THREE.TextureLoader().load('./icons/eye_arrow.png');
const eyearrow_material = new THREE.MeshBasicMaterial({ map: eyearrow_map });
const eyearrow_sprite = new THREE.Mesh( new THREE.PlaneGeometry(1, 1), eyearrow_material );

const seeing_map = new THREE.TextureLoader().load('./seeing.png');
const seeing_material = new THREE.MeshBasicMaterial({ map: seeing_map });
const seeing_sprite = new THREE.Mesh( new THREE.PlaneGeometry(2, 2), seeing_material );

const AUDIOS = ["Body_and_Soul", "Dancing_In_The_Dark", "Home", "Im_In_Another World", "Intermezzo", "Its_All_Forgotten_Now", "Oh_You_Crazy_Moon", "Stardust", "The_Very_Thought_Of_You", "You_were_there", "Whispering", "Midnight_With_the_Stars_and_You"];
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
  0.1,
  1000
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
			vec4 cTextureScreen = texture2D( tDiffuse, vUv + rand(vUv + time) * 0.015 );
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

let objects = [], planes = [], lights = [], scenes = [];

function generate_floorplan(){
  let output = [];
  output.push(new THREE.Vector2());

  //for(let i = 0; i < Math.random())
}

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
  object.mesh.position.set(0, 0, 0);
  object.mesh.lookAt(object.up);
  object.mesh.position.copy(object.position);
  object.mesh.rotateX(Math.PI / 2);
  object.mesh.rotateY(object.yrot);

  object.bounding_box = new THREE.Box3().setFromObject(object.mesh);
}

function planeFromPlane(p){
  var plane = new THREE.Plane();
  var normal = new THREE.Vector3();
  var point = new THREE.Vector3();

  normal.set( 0, 0, 1 ).applyQuaternion( p.quaternion );
  point.copy( p.position );
  plane.setFromNormalAndCoplanarPoint( normal, point );
  return plane;
}

function add_object(object){
  scenes.push(new THREE.Scene());

  objects.push(object);
  
  const mat = new THREE.MeshBasicMaterial({ color: object.color });
  const threecol = new THREE.Color(object.color);
  mat.onBeforeCompile = function( shader ) {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <output_fragment>',
      `
      vec3 backfaceColor = vec3( ${threecol.r}, ${threecol.g}, ${threecol.b} );
      gl_FragColor = ( gl_FrontFacing ) ? vec4( outgoingLight, diffuseColor.a ) : vec4( backfaceColor, opacity );
      `
    )
  };
  mat.side = THREE.DoubleSide;
  object.mesh.traverse(n => { 
    if(n.isMesh) {
      n.material = mat.clone();
      n.castShadow = false;
      n.layers.set(2);
    }
  });
  scenes[scenes.length - 1].add(object.mesh);

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

  // shadow planes
  const smat = new THREE.ShadowMaterial();
  object.shadowplanes = [];
  for(let plane of planes){
    const p = plane.clone();
    p.material = smat;
    p.receiveShadow = true;
    p.layers.set(1);
    scenes[scenes.length - 1].add(p);
    object.shadowplanes.push(p);
  }
}

function generate_beige(){
  return 'hsl(' + (Math.random() * 100) + ', ' + (Math.random() * 20 + 20) + '%, 40%)'
}


let camera_rot;

function choose_position_on(planes){
  let chosen = planes[Math.floor(Math.random() * planes.length)];
  let boundingbox = new THREE.Box3().setFromObject(chosen);
  let pos = new THREE.Vector3(boundingbox.min.x + Math.random() * (boundingbox.max.x - boundingbox.min.x), boundingbox.min.y + Math.random() * (boundingbox.max.y - boundingbox.min.y), boundingbox.min.z + Math.random() * (boundingbox.max.z - boundingbox.min.z));
  let normal = planeFromPlane(chosen).normal;
  return { pos, normal };
}

function new_light_at(lightpos){
  const light = new THREE.PointLight( 0xffffff, 1 );
  light.position.copy(lightpos);
  light.castShadow = true;
  light.shadow.mapSize.width = SHADOWMAPSIZE;
  light.shadow.mapSize.height = SHADOWMAPSIZE;
  light.layers.set(1);
  lights.push(light);
}

function create_scene(){
  camera_rot = new THREE.Vector2(Math.PI * (IS_TUTORIAL == 2), 0);
  camera_pos.set(0, 0, 0);
  camera_target.copy(camera_pos);
  setCamPosition();

  for(let scene of scenes){
    scene.traverse(o => {
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
  
  objects = []; planes = []; lights = []; scenes = [];

  let rectangular_factor = Math.random() + 1;
  
  // backdrop room
  scenes.push(new THREE.Scene());
  planes = generate_room(IS_TUTORIAL ? 0 : rectangular_factor);
  for(let plane of planes){
    scenes[0].add(plane);
  }

  let planeBoundaries = [];
  for(let p of planes){
    planeBoundaries.push(planeFromPlane(p));
  }

  let ground_planes = planes.filter(p => p.position.y == -1.5);

  if(IS_TUTORIAL == 2){
    let object = {
      mesh: OBJECTS.chair,
      position: new THREE.Vector3(-1, -1.5, ),
      yrot: 0,
      light: new THREE.Vector3(1, 0, 0),
      color: generate_beige(),
      up: new THREE.Vector3(0, 1, 0),
      name: "chair",
      light: 0
    };
    transform_object(object);
    add_object(object);

    let object2 = {
      mesh: OBJECTS.lamp,
      position: new THREE.Vector3(0, -1.5, 1),
      yrot: 0,
      light: new THREE.Vector3(0, 0, 1),
      color: generate_beige(),
      up: new THREE.Vector3(0, 1, 0),
      name: "lamp",
      light: 1
    };
    transform_object(object2);
    add_object(object2);

    new_light_at(new THREE.Vector3(1, 0, -1));
    new_light_at(new THREE.Vector3(1, 0, 1));

    seeing_sprite.scale.set(0.4, 0.3, 0.4);
    seeing_sprite.position.set(1.99, 0, 0);
    seeing_sprite.rotateY(Math.PI + Math.PI / 2);
    seeing_sprite.layers.set(2);
    scenes[scenes.length - 1].add(seeing_sprite);
  } else if(IS_TUTORIAL){
    let object = {
      mesh: OBJECTS.chair,
      position: new THREE.Vector3(-1, -1.5, 0),
      yrot: 0,
      light: new THREE.Vector3(1, 0, 0),
      color: generate_beige(),
      up: new THREE.Vector3(0, 1, 0),
      name: "chair",
      light: 0
    };
    transform_object(object);
    add_object(object);

    new_light_at(new THREE.Vector3(0, 0, -1));

    swipe_sprite.position.set(-0.5, 0, 0);
    swipe_sprite.layers.set(2);
    swipe_sprite.scale.set(0.3, 0.3, 0.3);
    swipe_sprite.material.transparent = true;
    swipe_sprite.material.opacity = 0.5;
    scenes[scenes.length - 1].add(swipe_sprite);

    click_sprite.position.set(lights[0].position.x, -1, lights[0].position.z);
    click_sprite.layers.set(2);
    click_sprite.material.transparent = true;
    click_sprite.material.opacity = 0.5;
    scenes[scenes.length - 1].add(click_sprite);

    eyearrow_sprite.position.set(lights[0].position.x, -1, lights[0].position.z);
    eyearrow_sprite.layers.set(2);
    eyearrow_sprite.scale.set(0.3, 0.3, 0.3);
    eyearrow_sprite.rotateZ(Math.PI / 2);
    eyearrow_sprite.rotateY(Math.PI / 2);
    eyearrow_sprite.rotateZ(Math.PI / 4);
    eyearrow_sprite.material.transparent = true;
    eyearrow_sprite.material.opacity = 0;
    scenes[scenes.length - 1].add(eyearrow_sprite);
  } else {
    LEVEL++;
    const probability_wall = 2 / LEVEL;
    
    let num_objects = Math.floor(Math.random() * 4) + 4;
    const choices = Object.keys(OBJECTS);
    
    let num_lights = 3 + Math.floor(Math.random());

    for(let i = 0; i < num_objects; i ++){
      for(let retry = 0; retry < 100; retry ++){
        let choice = choices[Math.floor(Math.random() * choices.length)];

        let { pos, normal } = choose_position_on((Math.random() > probability_wall) ? planes : ground_planes);

        let object = {
          name: choice,
          mesh: OBJECTS[choice].clone(),
          position: pos,
          yrot: Math.random() * Math.PI * 2,
          up: normal,
          color: generate_beige(),
          light: Math.floor(Math.random() * num_lights)
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

    for(let i = 0; i < num_lights || !lights.length; i ++){
      for(let retry = 0; retry < 100; retry ++){
        let { pos: lightpos } = choose_position_on(ground_planes);
        if(lights.find(l => Math.sqrt(Math.pow(l.position.x - lightpos.x, 2) + Math.pow(l.position.z - lightpos.z, 2)) < 1) || objects.find(o => o.bounding_box.containsPoint(lightpos))) { continue; }
        lightpos.y = 0;

        new_light_at(lightpos);
        break;
      }
    }
  }
}

let camera_flipped = false;
let camera_pos = new THREE.Vector2();
let camera_target = new THREE.Vector2();
let frustum = new THREE.Frustum();
let projScreenMatrix = new THREE.Matrix4();

function setCamPosition(){
  const v = new THREE.Vector3(1, 0, 0);
  v.applyAxisAngle(new THREE.Vector3(0, 0, -1), camera_rot.y);
  v.applyAxisAngle(new THREE.Vector3(0, -1, 0), camera_rot.x);
  camera.up.set(0, (camera_flipped ? -1 : 1), 0);
  //camera.position.set(v.x, v.y, v.z);

  camera.position.set(0, 0, 0);
  camera.lookAt(-v.x, -v.y, -v.z);
  camera.position.set(camera_pos.x, 0, camera_pos.y);

  camera_pos.x += (camera_target.x - camera_pos.x) / 16;
  camera_pos.y += (camera_target.y - camera_pos.y) / 16;
}

const DRAG_RESPONSIVITY = Math.PI * 4;

const mouse = {
  pos: new THREE.Vector2(),
  down: false,
  downpos: new THREE.Vector2()
};
const raycaster = new THREE.Raycaster();
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
    waitmsg.style.display = "none";
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
    mouse.downpos.set(event.clientX, event.clientY);
  }, false);
  document.body.addEventListener("pointerup", function(event) {
    mouse.down = false;
  }, false);
  renderer.domElement.addEventListener("pointerup", function(event){
    if(mouse.downpos.distanceTo(mouse.pos) < 5 && camera_pos.distanceTo(camera_target) < 0.1 && !wmsgopacity && waitmsg.innerText == ""){ // tap
      const pointer = new THREE.Vector2(
        ( event.clientX / window.innerWidth ) * 2 - 1,
        - ( event.clientY / window.innerHeight ) * 2 + 1
      );
      raycaster.setFromCamera(pointer, camera);
      raycaster.layers.enable(2);

      //let os = objects.map(o => o.mesh).concat(planes);
      let ground_planes = planes.filter(p => Math.abs(p.position.y) == 1.5);
      const intersects = raycaster.intersectObjects(ground_planes);

      if(intersects.length && ground_planes.includes(intersects[0].object)){
        intersects[0].point.y = 0;
        let lighttarget = lights.find(l => l.position.distanceTo(intersects[0].point) < 1);
        if(lighttarget){
          camera_target.x = lighttarget.position.x;
          camera_target.y = lighttarget.position.z;

          if(IS_TUTORIAL == 1){ click_sprite.material.opacity = 0.4; }
        } else {
          camera_target.x = intersects[0].point.x;
          camera_target.y = intersects[0].point.z;
        }
      }
    }
  }, false);
  document.body.addEventListener("pointermove", function(event) {
    {
      if(mouse.down && !wmsgopacity && waitmsg.innerText == "") {
        camera_rot.x += (event.clientX - mouse.pos.x) / window.innerWidth * DRAG_RESPONSIVITY * (camera_flipped ? -1 : 1);
  
        let prev = camera_rot.y;
        camera_rot.y += -(event.clientY - mouse.pos.y) / window.innerHeight * DRAG_RESPONSIVITY;
        for(let x = -2; x < 2; x ++){
          if(Math.sign(Math.PI / 2 + Math.PI * x - prev) != Math.sign(Math.PI / 2 + Math.PI * x - camera_rot.y)){
            camera_flipped = !camera_flipped;
          }
        }
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
  setTimeout(() => {audioclick.style.display = "none";}, 1000);

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

let sees_any = 0;
function render() {
  if(waiting){
    if(hasaudioclick && TOLOAD.every(o => OBJECTS[o]) && AUDIOS.length > 0 && hasbrumpetimage){
      waiting = false;
      setup();
    }

    requestAnimationFrame(render);
    return;
  }
  
  if(!sees_any) setCamPosition();
  
  renderer.setRenderTarget(
    postprocessing_bufferTexture
  );
  renderer.clear();
  for(let layer = 0; layer < 3; layer ++){
    camera.layers.set(layer);
    for(let scene of scenes){
      // memory shenanigans
      for(let l of lights){
        scene.add(l);
      }
      renderer.render(scene, camera);
      for(let l of lights){
        scene.remove(l);
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

  camera.updateMatrix(); 
  camera.updateMatrixWorld();
  projScreenMatrix.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
  frustum.setFromProjectionMatrix( projScreenMatrix );

  let alldeaths = true;
  for(let o of objects){
    if(!o.death || o.death > 0.05) { alldeaths = false; }
    
    if(o.death && o.death < 1){ 
      o.death += (0 - o.death) / 16;

      for(let p of o.shadowplanes){
        p.material.transparent = true;
        p.material.opacity = o.death;
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

    if(camera_pos.distanceTo(camera_target) < 0.1 && camera.position.distanceTo(lights[o.light].position) < 0.1){
      let found = frustum.containsPoint(o.bounding_box.max.clone().add(o.bounding_box.min).divideScalar(2));
      
      if(found) o.death = 0.99;
    }

    let scalefactor = o.mesh.position.distanceTo(camera.position) / o.mesh.position.distanceTo(lights[o.light].position);
    o.mesh.scale.set(scalefactor, scalefactor, scalefactor);
  }

  if(IS_TUTORIAL == 1 && waitmsg.innerText == ""){
    if(swipe_sprite.material.opacity > 0.45){
      swipe_sprite.material.opacity -= (0.5 - 0.45) / 150;
    } else {
      swipe_sprite.material.opacity += (0 - swipe_sprite.material.opacity) / 16;
    }
    swipe_sprite.material.needsUpdate = true;

    if(click_sprite.material.opacity < 0.5){
      click_sprite.material.opacity += (0 - click_sprite.material.opacity) / 16;
      click_sprite.material.depthWrite = false;
      eyearrow_sprite.material.opacity += (0.5 - eyearrow_sprite.material.opacity) / 16;
    }
    click_sprite.material.needsUpdate = true;
    eyearrow_sprite.material.needsUpdate = true;
  }

  if(alldeaths || FORCE_SKIP){
    waitmsg.style.display = "block";
    let r = Math.random();
    if(r < Math.pow(wmsgopacity, 1.2)){
      waitmsg.style.opacity = 1;
    } else {
      waitmsg.style.opacity = wmsgopacity;
    }
    wmsgopacity += Math.pow(wmsgopacity, 2) + 0.0004;
  
    if(wmsgopacity > 0.99){
      if(FORCE_SKIP) { 
        IS_TUTORIAL = 0;
        FORCE_SKIP = false;
      }
      else if(IS_TUTORIAL == 1) {
        IS_TUTORIAL = 2;
      }
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
      waitmsg.style.display = "none";
    }
  }
  
  requestAnimationFrame(render);
}
render();