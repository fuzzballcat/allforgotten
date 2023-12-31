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


function mod(n, d){
  return ((n % d) + d) % d;
}

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

const tloader = new THREE.TextureLoader();

const wallpaper = tloader.load('./textures/misc/wallpaper.png');
wallpaper.wrapS = wallpaper.wrapT = THREE.RepeatWrapping;
wallpaper.center.set(0.5, 0.5);


const swipe_map = tloader.load('./icons/swipe.png');
const swipe_material = new THREE.SpriteMaterial({ map: swipe_map });
const swipe_sprite = new THREE.Sprite( swipe_material );

const click_map = tloader.load('./icons/click.png');
const click_material = new THREE.SpriteMaterial({ map: click_map });
const click_sprite = new THREE.Sprite( click_material );

const eyearrow_map = tloader.load('./icons/eye_arrow.png');
const eyearrow_material = new THREE.MeshBasicMaterial({ map: eyearrow_map });
const eyearrow_sprite = new THREE.Mesh( new THREE.PlaneGeometry(1, 1), eyearrow_material );

const seeing_map = tloader.load('./textures/misc/seeing.png');
const seeing_material = new THREE.MeshBasicMaterial({ map: seeing_map });
const seeing_sprite = new THREE.Mesh( new THREE.PlaneGeometry(2, 2), seeing_material );

const OBJECT_TEXTURE_MAP = {
  "table": {
    "Cylinder": "oldwood.png",
    "Cylinder001": "oldwood.png",
    "Cylinder002": "oldwood.png",
    "Cylinder003": "oldwood.png",
    "Cylinder004": "oldwood.png"
  },
  "chair": {
    "Cylinder": "metal.png",
    "Plane": "grungyfabric.png"
  },
  "lamp": {
    "Sphere": "lampshade-2.jpeg",
    "Cylinder": "metal.png",
    "Cylinder006": "metal.png"
  },
  "smalltable": {
    "Cube": "oldwood.png",
    "Cylinder001": "oldwood.png",
    "Cylinder006": "metal.png"
  },
  "radio": {
    "Cube": "polishedwood.png",
    "Cylinder001": "metal2.png",
    "Cube001": "metal2.png",
    "Cube002": "metal2.png",
    "Cube004": "metal2.png"
  },
  "couch": {
    "Cylinder001": "metal2.png",
    "Plane001": "couchfabric.png"
  },
  "hanglamp": {
    "Cylinder002": "lampshade.png",
    "Cube": "metal.png",
    "Cube001": "metal.png",
    "Cylinder001": "metal.png",
    "Cylidner003": "metal.png"
  },
  "bench": {
    "Cube": "polishedwood.png",
    "Cube001": "polishedwood.png"
  },
  "camera": {
    "Cube": "metal.png",
    "Cube001": "metal.png",
    "Cylinder001": "metal2.png",
    "Cylinder002": "metal2.png",
    "Cube": "polishedwood.png"
  },
  "shelves": {
    "Cube": "polishedwood.png",
    "Cube002": "polishedwood.png",
    "Cube001": "oldwood.png"
  }
}

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
renderer.outputColorSpace = THREE.SRGBColorSpace;
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

let objects = [], planes = [], lights = [], scene = new THREE.Scene();

const directions = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0)
];

function generate_floorplan(is_wall){
  let output = [];
  output.push(new THREE.Vector3());

  const our_directions = is_wall ? directions : directions.slice(0, 4);

  let extra_rooms = Math.floor(Math.random() * 5);
  for(let i = 0; i < extra_rooms; i ++){
    let choosable_rooms = output.map(o => 
      [o, our_directions.filter(d => 
        !output.find(other => other.equals(o.clone().add(d)))
       )]
    ).filter(o => o[1].length);

    let choice = choosable_rooms[Math.floor(Math.random() * choosable_rooms.length)];

    output.push(choice[0].clone().add(choice[1][Math.floor(Math.random() * choice[1].length)]));
  }

  return output;
}

function generate_room(is_tutorial, is_wall){
  let floorplan = is_tutorial ? [new THREE.Vector3()] : generate_floorplan(is_wall);

  let return_planes = [];
  const material = new THREE.MeshStandardMaterial({ map: wallpaper });//{ color: 0xaaaaaa });

  for(let room of floorplan){
    for(let direction of directions){
      let neighbor_room = floorplan.find(f => f.equals(room.clone().add(direction)));
      if(!neighbor_room){
        let p1 = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), material.clone());
        p1.material.map.rotation = is_tutorial ? 0 : (Math.floor(Math.random() * 4) * Math.PI);
        p1.material.needsUpdate = true;
        p1.position.set( direction.x*2 + room.x * 4, direction.y*2 + room.y * 4, direction.z*2 + room.z * 4 );
        p1.lookAt(room.x * 4, room.y * 4, room.z * 4);
        return_planes.push(p1);
      }
    }
  }

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
  objects.push(object);
  
 // const mat = new THREE.MeshBasicMaterial({ color: object.color });

  const threecol = new THREE.Color(object.color);
  const uniforms = {
    time: { type: 'f', value: 0 },
    opacity: { type: 'f', value: 1 },
    color: { type: 'vec3', value: [threecol.r, threecol.g, threecol.b] },
    tex: { type: 't', value: 0 }
  };

  const mat = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: /* glsl */`
      uniform float time;
      varying vec2 vUv;
      float rand(vec3 co){
        return fract(sin(dot(co, vec3(12.9898, 78.233, 32.542))) * 43758.5453);
      }

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position.xy, position.z + (time == 0.0 ? 0.0 : 1.0) * (rand(position + time) - 0.5) / 5.0, 1.0 );
      }
    `,
    fragmentShader: /* glsl */`
    uniform float time;
    uniform float opacity;
    uniform vec3 color;
    uniform sampler2D tex;
    varying vec2 vUv;
    float rand(vec2 co){
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main(){
      float r = floor(rand(vec2(vUv.y, vUv.x + rand(vec2(time, time))) * time / 2.0) + 0.5);
      float qualified = time == 0.0 ? 1.0 : r;
      gl_FragColor = vec4(qualified * texture2D(tex, vUv).rgb, (qualified + 0.5) * opacity);
    }
    `
  });
  mat.transparent = true;
 /* const threecol = new THREE.Color(object.color);
  mat.onBeforeCompile = function( shader ) {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <output_fragment>',
      `
      vec3 backfaceColor = vec3( ${threecol.r}, ${threecol.g}, ${threecol.b} );
      gl_FragColor = ( gl_FrontFacing ) ? vec4( outgoingLight, diffuseColor.a ) : vec4( backfaceColor, opacity );
      `
    )
  };
  mat.side = THREE.DoubleSide;*/
  object.mesh.traverse(n => { 
    if(n.isMesh) {
      n.material = mat.clone();
      let texture = tloader.load("./textures/" + OBJECT_TEXTURE_MAP[object.name][n.name]);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.flipY = false;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      n.material.uniforms.tex.value = texture;

      n.castShadow = false;
      n.layers.set(2);
    }
  });
  scene.add(object.mesh);

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
  scene.add(shadow_object);
  object.shadow_object = shadow_object;
}

function generate_beige(){
  return 'hsl(' + (Math.random() * 16 + 20) + ', ' + (Math.random() * 20 + 20) + '%, 60%)'
}


function choose_position_on(planes){
  let chosen = planes[Math.floor(Math.random() * planes.length)];
  let boundingbox = new THREE.Box3().setFromObject(chosen);
  let pos = new THREE.Vector3(boundingbox.min.x + Math.random() * (boundingbox.max.x - boundingbox.min.x), boundingbox.min.y + Math.random() * (boundingbox.max.y - boundingbox.min.y), boundingbox.min.z + Math.random() * (boundingbox.max.z - boundingbox.min.z));
  let normal = planeFromPlane(chosen).normal;
  return { pos, normal, plane: chosen };
}

function new_light_at(lightpos, num_lights){
  const light = new THREE.PointLight( 0xffffff, 0.7 / num_lights );
  light.position.copy(lightpos);
  light.castShadow = true;
  light.shadow.mapSize.width = SHADOWMAPSIZE;
  light.shadow.mapSize.height = SHADOWMAPSIZE;
  light.layers.enable(1);
  lights.push(light);
  scene.add(light);
}

function create_scene(){
  camera_lookAt.set(IS_TUTORIAL == 2 ? 1 : -1, 0, 0);
  camera_pos.set(0, 0, 0);
  camera_target.copy(camera_pos);
  camera_currentNormal.set(0, 1, 0);
  camera_currentNormal_target.copy(camera_currentNormal);

  setCamPosition();

  scene.traverse(o => {
    if(o.isMesh){
      o.geometry.dispose();
      o.material.dispose();
    }
    if(typeof(o.dispose) == 'function'){
      o.dispose();
    }
  });
  
  objects = []; planes = []; lights = []; scene = new THREE.Scene();

  let is_wall = LEVEL > 1;

  // backdrop room
  planes = generate_room(IS_TUTORIAL, is_wall);
  for(let plane of planes){
    scene.add(plane);
  }

  let planeBoundaries = [];
  for(let p of planes){
    planeBoundaries.push(planeFromPlane(p));
  }

  // shadow planes
  const smat = new THREE.ShadowMaterial();
  smat.transparent = true;
  smat.opacity = 0.9;
  for(let plane of planes){
    const p = plane.clone();
    p.material = smat;
    p.receiveShadow = true;
    p.layers.set(1);
    scene.add(p);
  }

  if(IS_TUTORIAL == 2){
    let object = {
      mesh: OBJECTS.chair,
      position: new THREE.Vector3(-1, -2, 0),
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
      position: new THREE.Vector3(0, -2, 1),
      yrot: 0,
      light: new THREE.Vector3(0, 0, 1),
      color: generate_beige(),
      up: new THREE.Vector3(0, 1, 0),
      name: "lamp",
      light: 1
    };
    transform_object(object2);
    add_object(object2);

    new_light_at(new THREE.Vector3(1, 0, -1), 2);
    new_light_at(new THREE.Vector3(1, 0, 1), 2);

    seeing_sprite.scale.set(0.4, 0.3, 0.4);
    seeing_sprite.position.set(1.99, 0, 0);
    seeing_sprite.rotateY(Math.PI + Math.PI / 2);
    seeing_sprite.layers.set(2);
    seeing_sprite.material.color = new THREE.Color(0.5, 0.5, 0.5, 0.2);
    scene.add(seeing_sprite);
  } else if(IS_TUTORIAL){
    let object = {
      mesh: OBJECTS.chair,
      position: new THREE.Vector3(-1, -2, 0),
      yrot: 0,
      light: new THREE.Vector3(1, 0, 0),
      color: generate_beige(),
      up: new THREE.Vector3(0, 1, 0),
      name: "chair",
      light: 0
    };
    transform_object(object);
    add_object(object);

    new_light_at(new THREE.Vector3(0, 0, -1), 1);

    swipe_sprite.position.set(-0.5, 0, 0);
    swipe_sprite.layers.set(2);
    swipe_sprite.scale.set(0.3, 0.3, 0.3);
    swipe_sprite.material.transparent = true;
    swipe_sprite.material.opacity = 0.5;
    scene.add(swipe_sprite);

    click_sprite.position.set(lights[0].position.x, -1.8, lights[0].position.z);
    click_sprite.layers.set(2);
    click_sprite.material.transparent = true;
    click_sprite.material.opacity = 0.5;
    scene.add(click_sprite);

    eyearrow_sprite.position.set(lights[0].position.x, -1.95, lights[0].position.z);
    eyearrow_sprite.layers.set(2);
    eyearrow_sprite.scale.set(0.6, 0.6, 0.6);
    eyearrow_sprite.rotateZ(Math.PI / 2);
    eyearrow_sprite.rotateY(Math.PI / 2);
    eyearrow_sprite.rotateZ(Math.PI / 4);
    eyearrow_sprite.material.transparent = true;
    eyearrow_sprite.material.opacity = 0;
    scene.add(eyearrow_sprite);
  } else {
    LEVEL++;
    
    let num_objects = Math.floor(Math.random() * 4) + 4;
    const choices = Object.keys(OBJECTS);
    
    for(let i = 0; i < num_objects; i ++){
      for(let retry = 0; retry < 100; retry ++){
        let choice = choices[Math.floor(Math.random() * choices.length)];

        let { pos, normal, plane } = choose_position_on(is_wall ? planes : planes.filter(p => p.position.y == -2));

        // object

        let object = {
          name: choice,
          mesh: OBJECTS[choice].clone(),
          position: pos,
          yrot: Math.random() * Math.PI * 2,
          up: normal,
          color: generate_beige(),
          light: i,
          plane
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

        // light
        for(let lretry = 0; lretry < 100; lretry ++){
          let { pos: lightpos, normal } = choose_position_on([plane]);
          lightpos.add(normal.clone().multiplyScalar(2));
          if(lretry < 99 && (lights.find(l => l.position.distanceTo(lightpos) < 1) || objects.find(o => o.bounding_box.containsPoint(lightpos) || o.position.distanceTo(lightpos) < 2))) { continue; }
          new_light_at(lightpos, num_objects);
          break;
        }

        break;
      }
    }
  }
}

let camera_pos = new THREE.Vector3();
let camera_target = new THREE.Vector3();
let camera_lookAt = new THREE.Vector3(0, 0, 1);
let camera_currentNormal = new THREE.Vector3(0, 1, 0);
let camera_currentNormal_target = new THREE.Vector3(0, 1, 0);
let frustum = new THREE.Frustum();
let projScreenMatrix = new THREE.Matrix4();

function setCamPosition(){
  camera.position.set(camera_pos.x, camera_pos.y, camera_pos.z);
  camera.lookAt(camera_lookAt);
  camera.up.copy(camera_currentNormal);

  const cvel = camera_target.clone().sub(camera_pos).divideScalar(20);

  camera_pos.add(cvel);
  camera_lookAt.add(cvel);

  let target_mx = new THREE.Matrix4().lookAt(camera_currentNormal_target, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
  let target_qt = new THREE.Quaternion().setFromRotationMatrix(target_mx);

  let mx = new THREE.Matrix4().lookAt(camera_currentNormal, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
  let qt = new THREE.Quaternion().setFromRotationMatrix(mx);
  
  qt.slerp(target_qt, 0.03);
  let result = new THREE.Vector3(0, 0, 1);
  result.applyQuaternion(qt);

  camera_currentNormal.copy(result);
}

let last_plane = undefined;
function set_camera_relrot(rotation){
  let normalVector = new THREE.Vector3(0, 0, 1);
  normalVector.applyEuler(rotation);

  camera_currentNormal_target.copy(normalVector);
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

function coplanar(a, b){
  return    a.position.x == b.position.x
         || a.position.y == b.position.y
         || a.position.z == b.position.z;
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
      raycaster.layers.disableAll();
      raycaster.layers.enable(0);
      raycaster.layers.enable(2);

      const intersects = raycaster.intersectObjects(planes);

      if(intersects.length){
        let normalVector = new THREE.Vector3(0, 0, 1);
        normalVector.applyEuler(intersects[0].object.rotation);
        let camera_to_point = intersects[0].point.clone().add(normalVector.multiplyScalar(2));

        let lighttarget = lights.find(l => l.position.distanceTo(camera_to_point) < 1);
        if(lighttarget){
          camera_target.copy(lighttarget.position);

          if(IS_TUTORIAL == 1 && click_sprite.material.opacity > 0.4){ click_sprite.material.opacity = 0.4; }
        } else {
          camera_target.copy(camera_to_point);
        }

        set_camera_relrot(intersects[0].object.rotation);
      }
    }
  }, false);
  document.body.addEventListener("pointermove", function(event) {
    {
      if(mouse.down && !wmsgopacity && waitmsg.innerText == "") {
        let yrot = -(event.clientX - mouse.pos.x) / window.innerWidth * DRAG_RESPONSIVITY;
  
        let xrot = -(event.clientY - mouse.pos.y) / window.innerHeight * DRAG_RESPONSIVITY;
        if(xrot > 0.1) xrot = 0.1;
        if(xrot < -0.1) xrot = -0.1;

        camera_lookAt.sub(camera_pos);

        camera_lookAt.applyAxisAngle(camera_currentNormal, yrot);
        let localX = new THREE.Vector3(1, 0, 0);
        localX.applyQuaternion(camera.quaternion);

        // normed = "prevent" gimbal lock
        // todo: better
        let dot = camera_lookAt.clone().normalize().dot(camera_currentNormal);
        let normed = 1 - Math.abs(dot);
        let normed_adjusted = 1 - Math.pow(1 - normed, 10);
        camera_lookAt.applyAxisAngle(localX, xrot * ((Math.sign(dot) == Math.sign(xrot)) ? normed_adjusted : Math.min(normed_adjusted + 0.5, 1)));

        camera_lookAt.add(camera_pos);
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
    renderer.render(scene, camera);
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

    const val = Math.max((angle - Math.PI / 2) / Math.PI * 2, 0);
   /* plane.material.transparent = true;
    plane.material.opacity = val*/
    plane.material.color = new THREE.Color(val/2 + 0.2, val/2 + 0.2, val/2 + 0.2);
    plane.material.needsUpdate = true;
  }

  camera.updateMatrix(); 
  camera.updateMatrixWorld();
  projScreenMatrix.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
  frustum.setFromProjectionMatrix( projScreenMatrix );

  let alldeaths = true;
  let oind = 0;
  for(let o of objects){
    if(!o.death || o.death > 0.05) { alldeaths = false; }
    
    if(o.death && o.death < 1){ 
      o.death += (0 - o.death) / 16;

      o.mesh.traverse(n => { 
        if(n.isMesh) {
          n.material.uniforms.opacity.value = o.death;
          n.material.depthWrite = false;
          n.material.needsUpdate = true;
        }
      });

      if(o.death < 0.05 && !lights[oind].death){ lights[oind].death = 0.1; }

      oind++;
      continue;
    }

    if(Math.random() < 0.001){
      if(!o.static) o.static = 0;
      o.static += 10;
    }
    if(o.static){
      o.static --;
      if(o.static < 0) o.static = 0;
    }

    if(o.static){
      o.mesh.traverse(n => {
        if(n.isMesh) {
          n.material.uniforms.time.value += 0.05;
          n.material.needsUpdate = true;
        }
      });
    } else {
      o.mesh.traverse(n => {
        if(n.isMesh) {
          n.material.uniforms.time.value = 0;
          n.material.needsUpdate = true;
        }
      });
    }

    if(camera_pos.distanceTo(camera_target) < 0.1 && camera.position.distanceTo(lights[o.light].position) < 0.1){
      let found = frustum.containsPoint(o.bounding_box.max.clone().add(o.bounding_box.min).divideScalar(2));
      
      if(found) o.death = 0.99;
    }

    let scalefactor = o.mesh.position.distanceTo(camera.position) / o.mesh.position.distanceTo(lights[o.light].position);
    o.mesh.scale.set(scalefactor, scalefactor, scalefactor);

    oind ++;
  }

  for(let i = 0; i < lights.length; i ++){
    if(lights[i].death){
      if(lights[i].death <= 1) lights[i].death += 0.05;

      if(lights[i].death > 1 || Math.sin(Math.pow(lights[i].death * Math.PI * 6, 2)) > 0.9){
        lights[i].castShadow = false;
        objects[i].shadow_object.traverse(n => {
          if(n.isMesh) n.castShadow = false;
        });
      } else {
        lights[i].castShadow = true;
        objects[i].shadow_object.traverse(n => {
          if(n.isMesh) n.castShadow = true;
        });
      }
    }
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
      eyearrow_sprite.material.opacity += (0.8 - eyearrow_sprite.material.opacity) / 16;
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
        LEVEL = 2;
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