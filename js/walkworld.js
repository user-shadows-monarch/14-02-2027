(function () {
  'use strict';
  const C = window.GIFT.walkWorld;
  const $ = s => document.querySelector(s);
  const section = $('#s-world');
  const host = $('#walk-world');
  const status = $('#walk-status');
  const retry = $('#walk-retry');
  const stick = $('#walk-stick');
  const knob = $('#walk-stick-knob');
  const CESIUM_VERSION = '1.126';
  const CESIUM_BASE = 'https://cesium.com/downloads/cesiumjs/releases/' + CESIUM_VERSION + '/Build/Cesium/';
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const radians = Math.PI / 180;
  let scriptLoad = null;
  let viewer = null;
  let tileset = null;
  let entities = [];
  let generation = 0;
  let active = false;
  let tileErrorShown = false;
  let frameId = 0;
  let lastFrame = 0;
  let lastUpdate = 0;
  let pointer = null;
  let joystickPointer = null;
  let joystick = { x: 0, y: 0 };
  let keys = new Set();
  let orbit = { heading: 0, pitch: -0.34 };
  let player = null;

  function setStatus(message) {
    status.textContent = message;
  }

  function loadCesium() {
    if (window.Cesium) return Promise.resolve(window.Cesium);
    if (scriptLoad) return scriptLoad;

    window.CESIUM_BASE_URL = CESIUM_BASE;
    if (!document.getElementById('cesium-widgets-css')) {
      const link = document.createElement('link');
      link.id = 'cesium-widgets-css';
      link.rel = 'stylesheet';
      link.href = CESIUM_BASE + 'Widgets/widgets.css';
      document.head.appendChild(link);
    }

    scriptLoad = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CESIUM_BASE + 'Cesium.js';
      script.onload = () => resolve(window.Cesium);
      script.onerror = () => {
        scriptLoad = null;
        reject(new Error('CesiumJS could not be loaded.'));
      };
      document.head.appendChild(script);
    });
    return scriptLoad;
  }

  function destroyViewer() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    lastFrame = 0;
    lastUpdate = 0;
    if (viewer && !viewer.isDestroyed()) viewer.destroy();
    viewer = null;
    tileset = null;
    entities = [];
    host.replaceChildren();
  }

  function stop() {
    active = false;
    generation++;
    section.classList.add('walk-unavailable');
    keys.clear();
    joystick = { x: 0, y: 0 };
    joystickPointer = null;
    pointer = null;
    knob.style.transform = 'translate(0, 0)';
    destroyViewer();
  }

  function makeViewer(Cesium) {
    const map = new Cesium.Viewer(host, {
      imageryProvider: false,
      baseLayerPicker: false,
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      fullscreenButton: false,
      selectionIndicator: false,
      infoBox: false,
      scene3DOnly: true,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      terrainProvider: new Cesium.EllipsoidTerrainProvider()
    });
    map.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.25);
    map.scene.globe.show = false;
    map.scene.screenSpaceCameraController.enableInputs = false;
    map.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(C.location.lng, C.location.lat, 150),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-55),
        roll: 0
      }
    });
    map.scene.requestRender();
    return map;
  }

  function createCharacter(Cesium) {
    const Color = Cesium.Color;
    const parts = [
      { kind: 'ellipsoid', offset: [0, 0, 1.2], radii: [0.30, 0.23, 0.52], color: '#572a58' },
      { kind: 'ellipsoid', offset: [0, 0, 1.94], radii: [0.22, 0.22, 0.24], color: '#e5a984' },
      { kind: 'cylinder', offset: [-0.39, 0, 1.31], length: 0.70, radius: 0.085, color: '#e5a984' },
      { kind: 'cylinder', offset: [0.39, 0, 1.31], length: 0.70, radius: 0.085, color: '#e5a984' },
      { kind: 'cylinder', offset: [-0.13, 0, 0.48], length: 0.82, radius: 0.12, color: '#292849' },
      { kind: 'cylinder', offset: [0.13, 0, 0.48], length: 0.82, radius: 0.12, color: '#292849' }
    ];
    entities = parts.map((part, i) => {
      const entity = { id: 'walk-character-' + i, position: Cesium.Cartesian3.ZERO };
      if (part.kind === 'ellipsoid') {
        entity.ellipsoid = {
          radii: new Cesium.Cartesian3(part.radii[0], part.radii[1], part.radii[2]),
          material: Color.fromCssColorString(part.color),
          outline: true,
          outlineColor: Color.fromCssColorString('#21172d')
        };
      } else {
        entity.cylinder = {
          length: part.length,
          topRadius: part.radius * 0.88,
          bottomRadius: part.radius,
          slices: 8,
          material: Color.fromCssColorString(part.color)
        };
      }
      entity._walkOffset = part.offset;
      return viewer.entities.add(entity);
    });
    updateCharacter(Cesium);
  }

  async function findGroundHeight(Cesium, run) {
    const point = Cesium.Cartographic.fromDegrees(C.location.lng, C.location.lat);
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!active || run !== generation) return null;
      try {
        const samples = await viewer.scene.sampleHeightMostDetailed([point]);
        const height = samples[0] && samples[0].height;
        if (Number.isFinite(height)) return { height, approximate: false };
      } catch {
        console.warn('[walk-world] Could not sample 3D tile height; using the configured street elevation.');
        return { height: C.location.groundHeight, approximate: true };
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    return { height: C.location.groundHeight, approximate: true };
  }

  function updateCharacter(Cesium) {
    if (!player || !entities.length) return;
    const base = Cesium.Cartesian3.fromDegrees(player.lng, player.lat, player.height);
    const frame = Cesium.Transforms.eastNorthUpToFixedFrame(base);
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(
      base,
      new Cesium.HeadingPitchRoll(player.heading, 0, 0)
    );
    entities.forEach(entity => {
      const offset = entity._walkOffset;
      const local = new Cesium.Cartesian3(offset[0], offset[1], offset[2]);
      entity.position = Cesium.Matrix4.multiplyByPoint(frame, local, new Cesium.Cartesian3());
      entity.orientation = orientation;
    });
  }

  function readInput() {
    let x = joystick.x;
    let y = joystick.y;
    if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) x -= 1;
    if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) x += 1;
    if (keys.has('ArrowUp') || keys.has('w') || keys.has('W')) y -= 1;
    if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) y += 1;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    return { forward: -y, right: x };
  }

  function movePlayer(Cesium, dt) {
    const input = readInput();
    if (!input.forward && !input.right) return;
    const direction = orbit.heading;
    const east = (input.forward * Math.sin(direction) + input.right * Math.cos(direction)) * C.walkSpeedMetersPerSecond * dt;
    const north = (input.forward * Math.cos(direction) - input.right * Math.sin(direction)) * C.walkSpeedMetersPerSecond * dt;
    const cosLat = Math.max(0.01, Math.cos(player.lat * radians));
    player.lat += north / 111132;
    player.lng += east / (111320 * cosLat);
    if (Math.hypot(east, north) > 0) {
      player.heading = Math.atan2(east, north);
      orbit.heading = player.heading;
    }

    const northFromStart = (player.lat - C.location.lat) * 111132;
    const eastFromStart = (player.lng - C.location.lng) * 111320 * Math.cos(C.location.lat * radians);
    const distance = Math.hypot(northFromStart, eastFromStart);
    if (distance > C.radiusMeters) {
      const scale = C.radiusMeters / distance;
      player.lat = C.location.lat + (northFromStart * scale) / 111132;
      player.lng = C.location.lng + (eastFromStart * scale) / (111320 * Math.cos(C.location.lat * radians));
    }
    updateCharacter(Cesium);
  }

  function updateCamera(Cesium) {
    const target = Cesium.Cartesian3.fromDegrees(player.lng, player.lat, player.height + 1.1);
    viewer.camera.lookAt(target, new Cesium.HeadingPitchRange(
      orbit.heading,
      orbit.pitch,
      18
    ));
    viewer.scene.requestRender();
  }

  function animate(now, Cesium) {
    if (!active || !viewer) return;
    if (!lastFrame) lastFrame = now;
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    if (now - lastUpdate >= 33) {
      movePlayer(Cesium, dt);
      updateCamera(Cesium);
      lastUpdate = now;
    }
    frameId = requestAnimationFrame(time => animate(time, Cesium));
  }

  async function start() {
    stop();
    const run = generation;
    active = true;
    tileErrorShown = false;
    section.classList.add('walk-unavailable');
    retry.hidden = true;
    setStatus(C.loading);

    if (!C.google3dTilesApiKey) {
      active = false;
      setStatus(C.missingKey);
      return;
    }

    try {
      const Cesium = await loadCesium();
      if (!active || run !== generation) return;
      viewer = makeViewer(Cesium);
      const url = 'https://tile.googleapis.com/v1/3dtiles/root.json?key=' + encodeURIComponent(C.google3dTilesApiKey);
      tileset = await Cesium.Cesium3DTileset.fromUrl(url, {
        maximumScreenSpaceError: 20,
        cacheBytes: 64 * 1024 * 1024,
        showCreditsOnScreen: true
      });
      if (!active || run !== generation) {
        destroyViewer();
        return;
      }
      viewer.scene.primitives.add(tileset);
      tileset.tileFailed.addEventListener(() => {
        if (run !== generation || tileErrorShown) return;
        tileErrorShown = true;
        active = false;
        if (frameId) cancelAnimationFrame(frameId);
        keys.clear();
        section.classList.add('walk-unavailable');
        console.error('[walk-world] Google 3D Tiles request failed; check the API key, billing, and referrer restrictions.');
        setStatus(C.tileError);
        retry.hidden = false;
      });
      viewer.scene.renderError.addEventListener(() => {
        if (run !== generation) return;
        active = false;
        if (frameId) cancelAnimationFrame(frameId);
        keys.clear();
        section.classList.add('walk-unavailable');
        console.error('[walk-world] CesiumJS could not render the 3D scene.');
        setStatus(C.loadError);
        retry.hidden = false;
      });

      const ground = await findGroundHeight(Cesium, run);
      if (!active || run !== generation || !ground) return;
      player = {
        lat: C.location.lat,
        lng: C.location.lng,
        height: ground.height,
        heading: 0
      };
      orbit = { heading: 0, pitch: -0.34 };
      createCharacter(Cesium);
      updateCamera(Cesium);
      section.classList.remove('walk-unavailable');
      setStatus(C.controls + (ground.approximate ? ' · ' + C.approximateGround : ''));
      frameId = requestAnimationFrame(time => animate(time, Cesium));
    } catch {
      if (!active || run !== generation) return;
      console.error('[walk-world] The photorealistic 3D scene could not be initialized.');
      active = false;
      section.classList.add('walk-unavailable');
      destroyViewer();
      setStatus(C.loadError);
      retry.hidden = false;
    }
  }

  stick.addEventListener('pointerdown', event => {
    event.preventDefault();
    joystickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    updateJoystick(event);
  });
  stick.addEventListener('pointermove', event => {
    if (event.pointerId === joystickPointer) updateJoystick(event);
  });
  function releaseJoystick(event) {
    if (event.pointerId !== joystickPointer) return;
    joystickPointer = null;
    joystick = { x: 0, y: 0 };
    knob.style.transform = 'translate(0, 0)';
  }
  stick.addEventListener('pointerup', releaseJoystick);
  stick.addEventListener('pointercancel', releaseJoystick);

  function updateJoystick(event) {
    const rect = stick.getBoundingClientRect();
    const max = rect.width * 0.31;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    const scale = length > max ? max / length : 1;
    const x = dx * scale;
    const y = dy * scale;
    joystick = { x: x / max, y: y / max };
    knob.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
  }

  host.addEventListener('pointerdown', event => {
    if (event.target.closest('.walk-ui') || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    host.setPointerCapture(event.pointerId);
  });
  host.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    orbit.heading -= dx * 0.006;
    orbit.pitch = clamp(orbit.pitch + dy * 0.004, -1.05, -0.12);
  });
  function releaseLook(event) {
    if (pointer && pointer.id === event.pointerId) pointer = null;
  }
  host.addEventListener('pointerup', releaseLook);
  host.addEventListener('pointercancel', releaseLook);

  addEventListener('keydown', event => {
    if (!active || event.target.closest('button,input,textarea')) return;
    if (/^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|w|a|s|d)$/i.test(event.key)) {
      event.preventDefault();
      keys.add(event.key);
    }
  });
  addEventListener('keyup', event => keys.delete(event.key));
  addEventListener('blur', () => keys.clear());
  addEventListener('resize', () => {
    if (active && viewer) { viewer.resize(); viewer.scene.requestRender(); }
  });

  window.WalkWorld = { start, stop };
})();
