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
  const MAPLIBRE_VERSION = '5.6.1';
  const MAPLIBRE_BASE = 'https://unpkg.com/maplibre-gl@' + MAPLIBRE_VERSION + '/dist/';
  const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const radians = Math.PI / 180;
  let scriptLoad = null;
  let map = null;
  let avatarMarker = null;
  let generation = 0;
  let active = false;
  let frameId = 0;
  let loadTimeout = 0;
  let rejectMapLoad = null;
  let lastFrame = 0;
  let pointer = null;
  let joystickPointer = null;
  let joystick = { x: 0, y: 0 };
  let keys = new Set();
  let cameraDirty = false;
  let camera = { bearing: 0, pitch: 62 };
  let player = null;

  function setStatus(message) {
    status.textContent = message;
  }

  function loadMapLibre() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (scriptLoad) return scriptLoad;

    if (!document.getElementById('maplibre-css')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css';
      link.rel = 'stylesheet';
      link.href = MAPLIBRE_BASE + 'maplibre-gl.css';
      document.head.appendChild(link);
    }

    scriptLoad = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = MAPLIBRE_BASE + 'maplibre-gl.js';
      script.onload = () => resolve(window.maplibregl);
      script.onerror = () => {
        scriptLoad = null;
        reject(new Error('MapLibre GL JS could not be loaded.'));
      };
      document.head.appendChild(script);
    });
    return scriptLoad;
  }

  function destroyMap() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    lastFrame = 0;
    if (loadTimeout) clearTimeout(loadTimeout);
    loadTimeout = 0;
    if (rejectMapLoad) {
      const reject = rejectMapLoad;
      rejectMapLoad = null;
      reject(new Error('Open map loading was cancelled.'));
    }
    if (avatarMarker) avatarMarker.remove();
    avatarMarker = null;
    if (map) map.remove();
    map = null;
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
    destroyMap();
  }

  function makeMap(maplibregl) {
    const instance = new maplibregl.Map({
      container: host,
      style: STYLE_URL,
      center: [C.location.lng, C.location.lat],
      zoom: 18,
      pitch: camera.pitch,
      bearing: camera.bearing,
      maxPitch: 75,
      minZoom: 17,
      maxZoom: 19,
      attributionControl: false,
      dragPan: false,
      dragRotate: false,
      scrollZoom: false,
      doubleClickZoom: false,
      touchZoomRotate: false,
      keyboard: false,
      pitchWithRotate: false,
      renderWorldCopies: false,
      antialias: false
    });

    instance.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: '© OpenStreetMap contributors © OpenMapTiles © OpenFreeMap'
    }), 'bottom-left');
    instance.on('error', event => {
      if (event.error) console.error('[walk-world] Open map resource failed to load.', event.error);
    });
    return instance;
  }

  function waitForMapLoad(instance) {
    return new Promise((resolve, reject) => {
      const onLoad = () => {
        instance.off('load', onLoad);
        clearTimeout(loadTimeout);
        loadTimeout = 0;
        rejectMapLoad = null;
        resolve();
      };
      rejectMapLoad = error => {
        instance.off('load', onLoad);
        clearTimeout(loadTimeout);
        loadTimeout = 0;
        rejectMapLoad = null;
        reject(error);
      };
      loadTimeout = setTimeout(() => {
        if (rejectMapLoad) rejectMapLoad(new Error('Timed out loading the open 3D map.'));
      }, 20000);
      instance.on('load', onLoad);
    });
  }

  function makeAvatar(maplibregl) {
    const element = document.createElement('div');
    element.className = 'walk-avatar';
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML =
      '<svg class="walk-avatar-body" viewBox="0 0 64 92" xmlns="http://www.w3.org/2000/svg">'
      + '<ellipse cx="32" cy="87" rx="17" ry="4" fill="rgba(12,10,26,.42)"/>'
      + '<path d="M22 56 18 78q0 4 5 4l8-21m11-5 4 23q0 4-5 4l-8-24" fill="#26263f" stroke="#151629" stroke-width="2" stroke-linejoin="round"/>'
      + '<path d="m22 34-8 20q-1 4 3 6t6-3l9-15m10-8 8 20q1 4-3 6t-6-3l-9-15" fill="#dca184" stroke="#9e6d65" stroke-width="2" stroke-linejoin="round"/>'
      + '<path d="M21 34q11-8 22 0l4 24q-15 9-30 0z" fill="#8f416e" stroke="#4a274d" stroke-width="2"/>'
      + '<path d="M25 14q7-7 14 0l4 11q-5 9-12 9t-11-9z" fill="#e7ae89" stroke="#a87569" stroke-width="2"/>'
      + '<path d="M24 14q8-11 17 0l-2 3H25z" fill="#342943"/>'
      + '<path d="M17 51 9 67m38-16 8 16" stroke="#dca184" stroke-width="5" stroke-linecap="round"/>'
      + '<path d="m18 78-2 7q0 3 4 3h8q3-1 2-4l-7-5m18-1 2 7q0 3-4 3h-8q-3-1-2-4l6-5" fill="#f3d9d3"/>'
      + '</svg>';

    avatarMarker = new maplibregl.Marker({
      element,
      anchor: 'bottom',
      pitchAlignment: 'viewport',
      rotationAlignment: 'viewport'
    }).setLngLat([player.lng, player.lat]).addTo(map);
    return element;
  }

  function getCameraPadding() {
    return { top: Math.round(host.clientHeight * 0.18), right: 0, bottom: 0, left: 0 };
  }

  function updateCamera() {
    if (!map || !player) return;
    map.jumpTo({
      center: [player.lng, player.lat],
      zoom: 18,
      pitch: camera.pitch,
      bearing: camera.bearing,
      padding: getCameraPadding()
    });
    avatarMarker.setLngLat([player.lng, player.lat]);
    avatarMarker.setRotation(player.heading);
    cameraDirty = false;
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

  function movePlayer(dt) {
    const input = readInput();
    if (!input.forward && !input.right) return false;
    const bearing = camera.bearing * radians;
    const speed = C.walkSpeedMetersPerSecond * dt;
    const east = (input.forward * Math.sin(bearing) + input.right * Math.cos(bearing)) * speed;
    const north = (input.forward * Math.cos(bearing) - input.right * Math.sin(bearing)) * speed;
    const cosLat = Math.max(0.01, Math.cos(player.lat * radians));
    player.lat += north / 111132;
    player.lng += east / (111320 * cosLat);
    if (Math.hypot(east, north) > 0) player.heading = Math.atan2(east, north) / radians;

    const northFromStart = (player.lat - C.location.lat) * 111132;
    const eastFromStart = (player.lng - C.location.lng) * 111320 * Math.cos(C.location.lat * radians);
    const distance = Math.hypot(northFromStart, eastFromStart);
    if (distance > C.radiusMeters) {
      const scale = C.radiusMeters / distance;
      player.lat = C.location.lat + (northFromStart * scale) / 111132;
      player.lng = C.location.lng + (eastFromStart * scale) / (111320 * Math.cos(C.location.lat * radians));
    }
    return true;
  }

  function scheduleFrame() {
    if (active && !frameId) frameId = requestAnimationFrame(animate);
  }

  function animate(now) {
    frameId = 0;
    if (!active || !map || !player) return;
    const input = readInput();
    const moving = !!(input.forward || input.right);
    if (!lastFrame) lastFrame = now;
    const elapsed = now - lastFrame;
    if (elapsed < 33 && moving) {
      scheduleFrame();
      return;
    }
    const dt = Math.min(elapsed / 1000, 0.05);
    lastFrame = now;

    const moved = movePlayer(dt);
    if (moved) makeAvatarMoving(true);
    else makeAvatarMoving(false);
    if (moved || cameraDirty) updateCamera();
    if (moving) scheduleFrame();
  }

  function makeAvatarMoving(moving) {
    const element = avatarMarker && avatarMarker.getElement();
    if (element) element.classList.toggle('is-moving', moving);
  }

  async function start() {
    stop();
    const run = generation;
    active = true;
    section.classList.add('walk-unavailable');
    retry.hidden = true;
    setStatus(C.loading);

    try {
      const maplibregl = await loadMapLibre();
      if (!active || run !== generation) return;
      camera = { bearing: 0, pitch: 62 };
      map = makeMap(maplibregl);
      await waitForMapLoad(map);
      if (!active || run !== generation) return;

      player = { lat: C.location.lat, lng: C.location.lng, heading: 0 };
      makeAvatar(maplibregl);
      map.resize();
      updateCamera();
      section.classList.remove('walk-unavailable');
      setStatus(C.controls);
    } catch (error) {
      if (!active || run !== generation) return;
      console.error('[walk-world] The open 3D neighborhood could not be initialized.', error);
      active = false;
      section.classList.add('walk-unavailable');
      destroyMap();
      setStatus(C.loadError);
      retry.hidden = false;
    }
  }

  stick.addEventListener('pointerdown', event => {
    event.preventDefault();
    joystickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    updateJoystick(event);
    scheduleFrame();
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
    scheduleFrame();
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
    camera.bearing = (camera.bearing - dx * 0.32 + 360) % 360;
    camera.pitch = clamp(camera.pitch + dy * 0.2, 45, 72);
    cameraDirty = true;
    scheduleFrame();
  });
  function releaseLook(event) {
    if (pointer && pointer.id === event.pointerId) pointer = null;
  }
  host.addEventListener('pointerup', releaseLook);
  host.addEventListener('pointercancel', releaseLook);

  addEventListener('keydown', event => {
    if (!active || (event.target.closest && event.target.closest('button,input,textarea'))) return;
    if (/^(ArrowUp|ArrowDown|ArrowLeft|ArrowRight|w|a|s|d)$/i.test(event.key)) {
      event.preventDefault();
      keys.add(event.key);
      scheduleFrame();
    }
  });
  addEventListener('keyup', event => keys.delete(event.key));
  addEventListener('blur', () => keys.clear());
  addEventListener('resize', () => {
    if (active && map) {
      map.resize();
      cameraDirty = true;
      scheduleFrame();
    }
  });

  window.WalkWorld = { start, stop };
})();
