import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { Rocketship } from './rocketship.js';

// Share the terrain depth buffer; floating origin matches the native renderer.
export class AstronautView {
  constructor(owner) {
    this.owner = owner;
    this.renderer = new THREE.WebGLRenderer({ canvas: owner.canvas, context: owner.gl });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.scene.add(new THREE.HemisphereLight(0xffebce, 0x62503d, 2));
    const sun = new THREE.DirectionalLight(0xffe5c1, 2.2);
    sun.position.set(-0.82, -0.18, 0.55);
    this.scene.add(sun);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.rocketship = new Rocketship(this.scene);
    this.ready = new GLTFLoader()
      .loadAsync('astronaut.glb')
      .then((gltf) => {
        this.model = gltf.scene;
        this.root.add(this.model);
        // glTF Y-up to game Z-up. Normalize the suit to human height.
        this.model.rotation.x = Math.PI / 2;
        this.model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(this.model);
        const scale = (1.85 * 2.5 * Gale.unitsPerMeter) / (box.max.z - box.min.z);
        this.model.scale.setScalar(scale);
        this.model.position.set(
          (-(box.min.x + box.max.x) * scale) / 2,
          (-(box.min.y + box.max.y) * scale) / 2,
          -box.min.z * scale,
        );
        this.mixer = new THREE.AnimationMixer(this.model);
        this.actions = Object.fromEntries(
          gltf.animations.map((clip) => [clip.name, this.mixer.clipAction(clip)]),
        );
        // A separate idle action allows walking to blend out without resetting its pose.
        const walk = gltf.animations.find((clip) => clip.name === 'Walk');
        if (walk && !this.actions.Idle) {
          const tracks = walk.tracks.map((source) => {
            const track = source.clone();
            const pose = source.values.slice(0, source.getValueSize());
            track.times = new Float32Array([0, 1]);
            track.values = new Float32Array([...pose, ...pose]);
            return track;
          });
          this.actions.Idle = this.mixer.clipAction(new THREE.AnimationClip('Idle', 1, tracks));
        }
        this.loaded = true;
        document.documentElement.dataset.astronaut = 'ready';
      })
      .catch((error) => {
        this.error = error;
        document.documentElement.dataset.astronaut = 'failed';
        console.error('Astronaut load failed:', error);
      });
  }
  draw(eva, eye, vp, dt, firstPerson) {
    if (!this.loaded && !this.rocketship.loaded) return;
    this.root.visible = !!(this.loaded && eva && !firstPerson);
    if (this.loaded && eva) {
      const state = eva.state || 'Idle';
      if (state !== this.state) {
        const previous = this.action;
        this.action = this.actions[state] || this.actions.Walk;
        const locomotion = ['Walk', 'Run'].includes(state);
        const phase =
          previous && ['Walk', 'Run'].includes(this.state)
            ? (previous.time / previous.getClip().duration) % 1
            : 0;
        this.action
          .reset()
          .setEffectiveWeight(1)
          .setEffectiveTimeScale(
            state === 'Pick Up' ? this.action.getClip().duration : locomotion ? 2 : 1,
          );
        if (locomotion) this.action.time = phase * this.action.getClip().duration;
        this.action.setLoop(
          ['Jump', 'Pick Up'].includes(state) ? THREE.LoopOnce : THREE.LoopRepeat,
          Infinity,
        );
        this.action.clampWhenFinished = true;
        this.action.play();
        if (previous && previous !== this.action) {
          previous.crossFadeTo(this.action, locomotion || state === 'Idle' ? 0.25 : 0.12, false);
        }
        this.state = state;
      }
      this.mixer.update(dt);
      this.root.position.set(eva.x - eye[0], eva.y - eye[1], eva.z - eye[2]);
      this.root.rotation.z = eva.a;
    }
    this.rocketship.update(eye, dt);
    this.camera.projectionMatrix.fromArray(vp);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    this.renderer.resetState();
    this.renderer.setViewport(0, 0, this.owner.canvas.width, this.owner.canvas.height);
    this.renderer.render(this.scene, this.camera);
    this.renderer.resetState();
    const gl = this.owner.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
  }
}
window.AstronautView = AstronautView;
window.dispatchEvent(new Event('astronaut-module-ready'));
