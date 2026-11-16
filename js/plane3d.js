import * as THREE from 'https://esm.sh/three@0.180.0';
import { GLTFLoader } from 'https://esm.sh/three@0.180.0/examples/jsm/loaders/GLTFLoader.js';

export class Plane3DRenderer {
  constructor(mapCanvas, onLoad, onError) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'm3-plane-canvas';
    mapCanvas.parentNode.insertBefore(this.canvas, mapCanvas.nextSibling);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.camera.position.z = -100;
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const key = new THREE.DirectionalLight(0xffe6f0, 1.8);
    key.position.set(-35, 55, -80);
    this.scene.add(key);

    this.yaw = new THREE.Group();
    this.orientation = new THREE.Group();
    this.attitude = new THREE.Group();
    this.model = new THREE.Group();
    this.scene.add(this.yaw);
    this.yaw.add(this.orientation);
    this.orientation.add(this.attitude);
    this.attitude.add(this.model);
    this.orientation.rotation.x = -Math.PI / 2;
    this.canvasSize = { width: 0, height: 0 };
    this.modelReady = false;
    this.visibilityChecked = false;

    const fail = err => {
      this.canvas.remove();
      this.renderer.dispose();
      onError(err);
    };
    const loader = new GLTFLoader();
    loader.load(new URL('../assets/plane/Cesium_Air.glb', import.meta.url).href, gltf => {
      const aircraft = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(aircraft);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const span = Math.max(size.x, size.z);
      if (!Number.isFinite(span) || span <= 0) {
        fail(new Error('The aircraft model has invalid dimensions.'));
        return;
      }
      aircraft.position.sub(center);
      aircraft.scale.setScalar(1 / span);
      this.model.add(aircraft);
      this.aircraft = aircraft;
      this.modelReady = true;
    }, undefined, fail);
  }

  render(state) {
    const width = Math.max(1, state.width);
    const height = Math.max(1, state.height);
    if (width !== this.canvasSize.width || height !== this.canvasSize.height) {
      this.canvasSize = { width, height };
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.setSize(width, height, false);
      this.camera.left = -width / 2;
      this.camera.right = width / 2;
      this.camera.top = height / 2;
      this.camera.bottom = -height / 2;
      this.camera.updateProjectionMatrix();
    }

    this.yaw.position.set(state.x - width / 2, height / 2 - state.y, 0);
    this.yaw.rotation.z = -state.heading;
    this.attitude.rotation.set(state.pitch, 0, state.bank, 'ZYX');
    this.yaw.scale.setScalar(72 * state.scale);
    this.yaw.visible = state.visible;
    this.canvas.style.opacity = String(state.opacity);
    this.renderer.render(this.scene, this.camera);
    if (this.modelReady && !this.visibilityChecked) {
      this.visibilityChecked = true;
      const gl = this.renderer.getContext(), side = 31, pixels = new Uint8Array(side * side * 4);
      const centerX = Math.round(state.x * this.renderer.getPixelRatio());
      const centerY = Math.round((height - state.y) * this.renderer.getPixelRatio());
      const left = Math.max(0, Math.min(this.canvas.width - side, centerX - side / 2));
      const bottom = Math.max(0, Math.min(this.canvas.height - side, centerY - side / 2));
      gl.readPixels(left, bottom, side, side, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      if (pixels.some((value, i) => i % 4 === 3 && value > 0)) onLoad();
      else {
        fail(new Error('The aircraft model did not render visibly.'));
        return;
      }
    }
  }
}
