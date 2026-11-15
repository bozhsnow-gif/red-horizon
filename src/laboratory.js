import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

export class Laboratory {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.ready = new GLTFLoader()
      .loadAsync('rocketship-laboratory.glb')
      .then((gltf) => {
        const source = gltf.scene;
        source.rotation.x = Math.PI / 2;
        source.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(source);
        const center = bounds.getCenter(new THREE.Vector3());
        this.source = source;
        this.mixer = new THREE.AnimationMixer(source);
        this.progress = 0;
        this.open = false;
        const moving = new Set();
        this.actions = gltf.animations.map((clip) => {
          for (const track of clip.tracks) {
            const node = THREE.PropertyBinding.findNode(
              source,
              THREE.PropertyBinding.parseTrackName(track.name).nodeName,
            );
            if (!node) throw Error('Missing animated laboratory part: ' + track.name);
            node.traverse((part) => moving.add(part));
          }
          const action = this.mixer.clipAction(clip).play();
          action.paused = true;
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
          return {
            action,
            openTime: Math.min(clip.duration, clip.name.includes('Garage') ? 59 / 24 : 29 / 24),
          };
        });
        this.movingNodes = [...moving].filter((node) => !node.isMesh);
        this.groundContacts = [];
        const staticObjects = [];
        const batches = new Map();
        source.traverse((object) => {
          if (!object.isMesh || moving.has(object)) return;
          staticObjects.push(object);
          const geometry = object.geometry.index
            ? object.geometry.toNonIndexed()
            : object.geometry.clone();
          geometry.applyMatrix4(object.matrixWorld);
          geometry.translate(-center.x, -center.y, -bounds.min.z);
          // Extend only ground-facing supports/foundation skirts, leaving the building and doors rigid.
          if (/^Solar[ _]support|foundation/i.test(object.name)) {
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const position = geometry.attributes.position;
            const bottomBand = Math.max(0.03, (box.max.z - box.min.z) * 0.22);
            const spawn = Gale.spawnPoint,
              anchorY = spawn.y + 20 * Gale.unitsPerMeter;
            const anchorZ = Gale.height(spawn.x, anchorY);
            for (let i = 0; i < position.count; i++) {
              if (position.getZ(i) > box.min.z + bottomBand) continue;
              const x = position.getX(i),
                y = position.getY(i);
              const ground =
                (Gale.height(spawn.x + x * Gale.unitsPerMeter, anchorY + y * Gale.unitsPerMeter) -
                  anchorZ) /
                Gale.unitsPerMeter;
              position.setZ(i, ground - 0.025);
              this.groundContacts.push([x, y, ground - 0.025]);
            }
            position.needsUpdate = true;
            geometry.computeVertexNormals();
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
          }
          const material = object.material;
          const key = Array.isArray(material)
            ? object.uuid
            : material.uuid + Object.keys(geometry.attributes).sort().join(',');
          if (!batches.has(key)) batches.set(key, { material, geometries: [] });
          batches.get(key).geometries.push(geometry);
        });
        for (const { material, geometries } of batches.values()) {
          const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
          if (!geometry) throw Error('Laboratory geometry batching failed');
          const mesh = new THREE.Mesh(geometry, material);
          this.root.add(mesh);
          if (geometries.length > 1) for (const g of geometries) g.dispose();
        }
        // Keep the original animated hierarchy; merge only stationary meshes.
        for (const object of staticObjects) object.removeFromParent();
        source.position.set(-center.x, -center.y, -bounds.min.z);
        this.root.add(source);
        this.mixer.update(0);
        this.root.scale.setScalar(Gale.unitsPerMeter);
        this.sizeMeters = bounds.getSize(new THREE.Vector3());
        this.loaded = true;
        document.documentElement.dataset.laboratory = 'ready';
      })
      .catch((error) => {
        this.error = error;
        document.documentElement.dataset.laboratory = 'failed';
        console.error('Laboratory import failed', error);
      });
  }
  toggle() {
    if (!this.loaded) return false;
    this.open = !this.open;
    return this.open;
  }
  reset() {
    this.open = false;
    this.progress = 0;
    if (this.actions) for (const entry of this.actions) entry.action.time = 0;
    this.mixer?.update(0);
  }
  update(eye, dt = 0) {
    if (!this.loaded) return;
    const target = this.open ? 1 : 0;
    const step = Math.max(0, dt) / 2.5;
    this.progress +=
      Math.sign(target - this.progress) * Math.min(Math.abs(target - this.progress), step);
    for (const { action, openTime } of this.actions) action.time = this.progress * openTime;
    this.mixer.update(0);
    const spawn = Gale.spawnPoint;
    // Centre-to-centre horizontal distance, south along the model's short side.
    this.worldPosition = { x: spawn.x, y: spawn.y + 20 * Gale.unitsPerMeter };
    const p = this.worldPosition;
    this.root.position.set(p.x - eye[0], p.y - eye[1], Gale.height(p.x, p.y) - eye[2]);
  }
}
