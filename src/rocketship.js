import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
const ROCKETSHIP_SCALE = 3;
const rocketshipPosition = () => Gale.fromCoordinates(-4.5893, 137.4406);

export class Rocketship {
  constructor(scene) {
    this.root = new THREE.Group();
    this.walkFloors = [];
    this.interiorFloors = [];
    this.walls = [];
    this.doors = [];
    this.floorRay = new THREE.Raycaster();
    scene.add(this.root);
    this.ready = new GLTFLoader()
      .loadAsync('rocketshipmagnet.glb')
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
          if (!object.isMesh) return;
          if (moving.has(object)) {
            if (/Crew[ _]hatch[ _]*\|[ _]*armored[ _]panel/i.test(object.name)) {
              const g = object.geometry.clone();
              g.applyMatrix4(object.matrixWorld);
              g.translate(-center.x, -center.y, -bounds.min.z);
              g.computeBoundingBox();
              this.doorCenter = g.boundingBox.getCenter(new THREE.Vector3());
              const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({side: THREE.DoubleSide}));
              mesh.updateMatrixWorld(true);
              this.doors.push(mesh);
            }
            return;
          }
          staticObjects.push(object);
          const geometry = object.geometry.index
            ? object.geometry.toNonIndexed()
            : object.geometry.clone();
          geometry.applyMatrix4(object.matrixWorld);
          geometry.translate(-center.x, -center.y, -bounds.min.z);
          if (/Crew[ _]corridor[ _]*\|[ _]*.*wall|Corridor[ _]*\|[ _]*far[ _](bulkhead|hatch[ _]panel)/i.test(object.name)) {
            const wall = new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial({side: THREE.DoubleSide}));
            wall.updateMatrixWorld(true);
            this.walls.push(wall);
          }
          if (
            /framed[ _]deck[ _]panel|subfloor|forward[ _]deck|Crew[ _]stairs.*(tread|upper[ _]landing)|Crew[ _]hatch.*threshold/i.test(
              object.name,
            )
          ) {
            const floor = new THREE.Mesh(
              geometry.clone(),
              new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
            );
            floor.updateMatrixWorld(true);
            this.walkFloors.push(floor);
            if (/framed[ _]deck[ _]panel/i.test(object.name)) this.interiorFloors.push(floor);
            if (/framed[ _]deck[ _]panel[ _]09/.test(object.name)) {
              floor.geometry.computeBoundingBox();
              const box = floor.geometry.boundingBox;
              this.spawnLocal = box.getCenter(new THREE.Vector3());
              this.spawnLocal.z = box.max.z;
            }
          }
          // Extend only ground-facing supports/foundation skirts, leaving the building and doors rigid.
          if (/Cradle.*floor[ _]foot|Crew[ _]stairs.*landing[ _]foot/i.test(object.name)) {
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const position = geometry.attributes.position;
            const bottomBand = Math.max(0.03, (box.max.z - box.min.z) * 0.22);
            const { x: anchorX, y: anchorY } = rocketshipPosition();
            const anchorZ = Gale.height(anchorX, anchorY);
            for (let i = 0; i < position.count; i++) {
              if (position.getZ(i) > box.min.z + bottomBand) continue;
              const x = position.getX(i),
                y = position.getY(i);
              const ground =
                (Gale.height(
                  anchorX - x * Gale.unitsPerMeter * ROCKETSHIP_SCALE,
                  anchorY - y * Gale.unitsPerMeter * ROCKETSHIP_SCALE,
                ) -
                  anchorZ) /
                (Gale.unitsPerMeter * ROCKETSHIP_SCALE);
              position.setZ(i, ground - 0.025 / ROCKETSHIP_SCALE);
              this.groundContacts.push([x, y, ground - 0.025 / ROCKETSHIP_SCALE]);
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
        // Close the corridor end where the visual model has no continuous wall mesh.
        const endWall = new THREE.BufferGeometry();
        endWall.setAttribute('position', new THREE.Float32BufferAttribute([
          0.584, -11.15, 2.71, 2.904, -11.15, 2.71, 2.904, -11.15, 4.89,
          0.584, -11.15, 2.71, 2.904, -11.15, 4.89, 0.584, -11.15, 4.89,
        ], 3));
        const endCollider = new THREE.Mesh(endWall, new THREE.MeshBasicMaterial({side: THREE.DoubleSide}));
        endCollider.updateMatrixWorld(true);
        this.walls.push(endCollider);
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
        this.root.scale.setScalar(Gale.unitsPerMeter * ROCKETSHIP_SCALE);
        this.root.rotation.z = Math.PI;
        this.sizeMeters = bounds.getSize(new THREE.Vector3()).multiplyScalar(ROCKETSHIP_SCALE);
        this.loaded = true;
        document.documentElement.dataset.rocketship = 'ready';
      })
      .catch((error) => {
        this.error = error;
        document.documentElement.dataset.rocketship = 'failed';
        console.error('Rocketship import failed', error);
      });
  }
  toggle() {
    if (!this.loaded) return false;
    this.open = !this.open;
    return this.open;
  }
  interiorSpawn() {
    if (!this.loaded || !this.spawnLocal) return null;
    const p = rocketshipPosition(),
      s = Gale.unitsPerMeter * ROCKETSHIP_SCALE;
    return {
      x: p.x - this.spawnLocal.x * s,
      y: p.y - this.spawnLocal.y * s,
      z: Gale.height(p.x, p.y) + this.spawnLocal.z * s,
    };
  }
  floorHeight(x, y, maxZ) {
    if (!this.loaded) return null;
    const p = rocketshipPosition(),
      s = Gale.unitsPerMeter * ROCKETSHIP_SCALE,
      base = Gale.height(p.x, p.y);
    this.floorRay.set(
      new THREE.Vector3((p.x - x) / s, (p.y - y) / s, (maxZ - base) / s),
      new THREE.Vector3(0, 0, -1),
    );
    const hit = this.floorRay.intersectObjects(this.walkFloors, false)[0];
    return hit ? base + hit.point.z * s : null;
  }
  containsAstronaut(actor) {
    if (!this.loaded || !actor) return false;
    const p = rocketshipPosition(), s = Gale.unitsPerMeter * ROCKETSHIP_SCALE;
    const base = Gale.height(p.x, p.y);
    this.floorRay.set(new THREE.Vector3((p.x - actor.x) / s, (p.y - actor.y) / s,
      (actor.z - base) / s + 1), new THREE.Vector3(0, 0, -1));
    const hit = this.floorRay.intersectObjects(this.interiorFloors, false)[0];
    return !!hit && Math.abs(actor.z - (base + hit.point.z * s)) < Gale.unitsPerMeter * 4;
  }
  moveAstronaut(actor, dx, dy) {
    if (!this.loaded || !Math.hypot(dx, dy)) return {x: actor.x + dx, y: actor.y + dy};
    const p = rocketshipPosition(), s = Gale.unitsPerMeter * ROCKETSHIP_SCALE;
    const ray = new THREE.Raycaster();
    const length = Math.hypot(dx, dy) / s;
    const direction = new THREE.Vector3(-dx, -dy, 0).normalize();
    const walls = this.progress > 0.9 ? this.walls : this.walls.concat(this.doors);
    for (const height of [0.15, 0.4, 1.2, 2, 3]) {
      for (const offset of [-0.3, 0, 0.3]) {
        ray.set(new THREE.Vector3((p.x-actor.x)/s - direction.y * offset * Gale.unitsPerMeter / s,
          (p.y-actor.y)/s + direction.x * offset * Gale.unitsPerMeter / s,
          (actor.z-Gale.height(p.x,p.y)+height*Gale.unitsPerMeter)/s), direction);
        ray.far = length + 0.35 * Gale.unitsPerMeter / s;
        if (ray.intersectObjects(walls, false).length) return {x: actor.x, y: actor.y};
      }
    }
    return {x: actor.x + dx, y: actor.y + dy};
  }
  updateDoor(actor) {
    if (!this.loaded || !this.doorCenter) return;
    const p = rocketshipPosition(), s = Gale.unitsPerMeter * ROCKETSHIP_SCALE;
    const x = p.x - this.doorCenter.x * s, y = p.y - this.doorCenter.y * s;
    this.open = !!actor && Math.hypot(actor.x-x, actor.y-y) < 5 * Gale.unitsPerMeter;
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
    this.worldPosition = rocketshipPosition();
    const p = this.worldPosition;
    this.root.position.set(p.x - eye[0], p.y - eye[1], Gale.height(p.x, p.y) - eye[2]);
  }
}
