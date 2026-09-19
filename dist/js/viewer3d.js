/* Track Tec — interactive 3D viewer (three.js, GLB).
   Settings mirror the reference viewer:
   - PerspectiveCamera fov 35
   - OrbitControls with damping, auto-rotate (stops on user drag)
   - RoomEnvironment probe + ACESFilmic tone mapping (SRGB output)
   - Model is auto-framed, lit by ambient + one soft shadow-casting light
   - Toolbar: reset / auto-rotate / cover / slice / wireframe / fullscreen */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

function byId(id) { return document.getElementById(id); }

function lang() { return document.documentElement.lang || 'en'; }

var NO_MODEL_MSG = {
  en: '3D model not yet available for this product.',
  pl: 'Model 3D nie jest jeszcze dostępny dla tego produktu.',
  de: 'Für dieses Produkt ist noch kein 3D-Modell verfügbar.'
};

var LOADING_MSG = {
  en: 'Loading 3D model…',
  pl: 'Wczytywanie modelu 3D…',
  de: '3D-Modell wird geladen…'
};

/* How many of the largest parts the COVER button ghosts. Parts are ranked by
   world-space bounding-box volume — the GLBs aren't watertight, so a true
   enclosed volume isn't available, but the box volume ranks large solids
   (bodies, castings) reliably against small ones (clips, bolts). */
var COVER_PARTS = 1;

/* How far the ghosted parts fade — low enough to see through, high enough
   that the part's shape stays readable. */
var COVER_OPACITY = 0.2;

/* COVER is available for sleepers and rail fastenings, but only when the
   loaded GLB contains more than one mesh. Single-solid models hide it. */
var COVER_CATEGORIES = ['concrete-sleepers', 'rail-fastenings'];

/* Product-specific corrections for GLBs whose authored orientation does not
   match the shared viewer camera. Values are radians around world axes. */
var INITIAL_ROTATION = {
  'sb-tts': { y: Math.PI },
  'wfp-f1': { x: -Math.PI * 1.5 }
};

class Viewer {
  constructor(container) {
    this.container = container;
    this.loaderScreen = byId('viewer-loader');
    this.loaderStatus = byId('loader-status');

    this.config = { clearColor: this.themedViewerColor(), autoRotateSpeed: 1.2 };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.productGroup = null;
    this.mainLight = null;

    this.isAutoRotating = true;
    this.isWireframe = false;
    this.isClipping = false;
    this.clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0.0);
    this.clipAxis = 'x';

    this.partCount = 1;
    this.coverAllowed = true;
    this.initialRotation = null;
    this.coverMeshes = [];
    this.coverMaterials = [];
    this.coverGhost = false;
    this.coverOpacity = 1;
    this.coverTarget = 1;
    this.coverTransparent = false;
    this.currentProduct = null;
    this.rafId = null;
    this.disposed = false;

    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('./vendor/three/addons/libs/draco/gltf/');
  }

  /* The viewport background comes from CSS (--viewer-bg) so it follows the
     light/dark theme instead of being hardcoded here. */
  themedViewerColor() {
    var v = '';
    try {
      v = getComputedStyle(document.documentElement).getPropertyValue('--viewer-bg');
    } catch (e) { /* ignore */ }
    return (v && v.trim()) || '#14161b';
  }

  syncViewerColor() {
    if (!this.renderer) return;
    this.config.clearColor = this.themedViewerColor();
    this.renderer.setClearColor(new THREE.Color(this.config.clearColor));
  }

  setStatus(text) {
    if (this.loaderStatus) this.loaderStatus.textContent = text;
  }

  showLoader() {
    if (!this.loaderScreen) return;
    this.loaderScreen.style.display = 'flex';
    this.loaderScreen.style.opacity = '1';
  }

  hideLoader() {
    if (!this.loaderScreen) return;
    this.loaderScreen.style.opacity = '0';
    setTimeout(() => { if (this.loaderScreen) this.loaderScreen.style.display = 'none'; }, 400);
  }

  keepMessage(text) {
    this.setStatus(text);
    this.showLoader();
    this.loaderScreen.style.opacity = '1';
  }

  init() {
    var w = this.container.clientWidth || 800;
    var h = this.container.clientHeight || 600;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 1000);
    this.camera.position.set(4, 3, 6);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(new THREE.Color(this.config.clearColor));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.68;
    this.container.appendChild(this.renderer.domElement);

    var pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(this.renderer), 0.04).texture;
    pmrem.dispose();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.autoRotate = this.isAutoRotating;
    this.controls.autoRotateSpeed = this.config.autoRotateSpeed;
    this.controls.addEventListener('start', () => {
      if (this.isAutoRotating) this.setAutoRotate(false);
    });

    this.productGroup = new THREE.Group();
    this.scene.add(this.productGroup);

    var ambient = new THREE.AmbientLight(0xffffff, 0.08);
    this.scene.add(ambient);

    this.mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.mainLight.position.set(-5, 7, 4);
    this.mainLight.castShadow = true;
    this.mainLight.shadow.mapSize.width = 2048;
    this.mainLight.shadow.mapSize.height = 2048;
    this.mainLight.shadow.bias = -0.0001;
    this.mainLight.shadow.normalBias = 0.02;
    this.scene.add(this.mainLight);

    // Soft fill from the opposite side keeps shadowed model details visible.
    this.fillLight = new THREE.DirectionalLight(0xffffff, 0.28);
    this.fillLight.position.set(4, 2, -3);
    this.fillLight.castShadow = false;
    this.scene.add(this.fillLight);

    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('tt-themechange', () => this.syncViewerColor());
    window.addEventListener('orientationchange', () => {
      // dimensions settle a moment after the orientation flips
      setTimeout(() => this.onResize(), 250);
      setTimeout(() => this.onResize(), 600);
    });

    // keep the canvas matched to the container across layout/media-query changes
    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(() => this.onResize());
      this.resizeObserver.observe(this.container);
    }
    this.loop();
  }

  setAutoRotate(state) {
    this.isAutoRotating = state !== undefined ? !!state : !this.isAutoRotating;
    this.controls.autoRotate = this.isAutoRotating;
    var btn = byId('btn-rotate');
    if (btn) btn.classList.toggle('active', this.isAutoRotating);
  }

  clearModel() {
    while (this.productGroup.children.length) {
      this.productGroup.remove(this.productGroup.children[0]);
    }
    this.partCount = 1;
    this.coverMeshes = [];
    this.coverMaterials = [];
    this.coverGhost = false;
    this.coverOpacity = 1;
    this.coverTarget = 1;
    this.coverTransparent = false;
  }

  load(path) {
    this.showLoader();
    this.setStatus(LOADING_MSG[lang()] || LOADING_MSG.en);
    this.clearModel();
    this.setToolbarVisible(false);

    var loader = new GLTFLoader();
    loader.setDRACOLoader(this.dracoLoader);

    loader.load(
      path,
      (gltf) => {
        var model = gltf.scene;
        if (this.initialRotation) {
          model.rotation.x += this.initialRotation.x || 0;
          model.rotation.y += this.initialRotation.y || 0;
          model.rotation.z += this.initialRotation.z || 0;
        }
        model.updateMatrixWorld(true);
        this.prepareMeshes(model);
        this.productGroup.add(model);
        this.partCount = this.countMeshes(this.productGroup);
        this.fitCamera(model);
        if (this.coverAllowed) this.computeCoverParts(this.productGroup);
        if (this.isClipping) this.setSliceAxis(this.clipAxis); // re-size for the new model
        this.setToolbarVisible(true);
        this.updateCoverButton();
        this.hideLoader();
      },
      (xhr) => {
        if (xhr.total > 0) {
          var pct = Math.round((xhr.loaded / xhr.total) * 100);
          this.setStatus(LOADING_MSG[lang()] + ' ' + pct + '%');
        }
      },
      (err) => {
        console.error('GLB load failed:', err);
        this.keepMessage(NO_MODEL_MSG[lang()] || NO_MODEL_MSG.en);
      }
    );
  }

  forEachMaterial(mesh, fn) {
    if (!mesh.material) return;
    var mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(fn);
  }

  prepareMeshes(model) {
    var maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;

      this.forEachMaterial(child, (mat) => {
        mat.wireframe = this.isWireframe;
        mat.clippingPlanes = this.isClipping ? [this.clipPlane] : [];
        ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'].forEach((k) => {
          if (mat[k] && mat[k].isTexture) {
            mat[k].anisotropy = maxAnisotropy;
            mat[k].needsUpdate = true;
          }
        });
      });
    });
  }

  /* Direction the camera looks from, normalised. A fairly low elevation (~17°)
     keeps long parts like sleepers big on screen: a steep angle swings their
     far end low and forces the camera back to stay inside the frame. */
  viewDirection() {
    if (!this._viewDir) this._viewDir = new THREE.Vector3(0.79, 0.25, 0.56).normalize();
    return this._viewDir;
  }

  /* Distance that keeps the model fully framed at every rotation angle.
     Auto-rotate spins the camera around the model, so the frame has to be
     sized for the worst-case azimuth — otherwise a long part (e.g. a sleeper)
     grows past the edge as it turns. */
  rotationSafeDistance(margin) {
    var base = this.viewDirection();
    var elev = base.y;
    var horiz = Math.sqrt(base.x * base.x + base.z * base.z) || 1;
    var worst = 0;
    var dir = new THREE.Vector3();
    var steps = 48;
    for (var i = 0; i < steps; i++) {
      var a = (i / steps) * Math.PI * 2;
      dir.set(Math.cos(a) * horiz, elev, Math.sin(a) * horiz).normalize();
      worst = Math.max(worst, this.framedDistance(dir, 1));
    }
    return worst * (margin == null ? 1.03 : margin);
  }

  /* Exact distance at which the model's bounding-box corners just fit the
     frustum when viewed from `dir`. Fitting the box (not a bounding sphere)
     matters for long, thin parts like a sleeper, which would otherwise sit
     lost in the middle of a mostly-empty frame. */
  /* A spread-out sample of the model's real surface points (world space) —
     far tighter than the axis-aligned box for diagonal/long parts, and much
     cheaper to fit against than every vertex. */
  collectFramePoints(obj) {
    var meshes = [];
    var total = 0;
    obj.traverse(function (o) {
      if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position) {
        meshes.push(o);
        total += o.geometry.attributes.position.count;
      }
    });
    var target = 2500;
    var step = Math.max(1, Math.floor(total / target));
    var pts = [];
    var v = new THREE.Vector3();
    meshes.forEach(function (m) {
      var pos = m.geometry.attributes.position;
      for (var k = 0; k < pos.count; k += step) {
        pts.push(v.set(pos.getX(k), pos.getY(k), pos.getZ(k)).applyMatrix4(m.matrixWorld).clone());
      }
    });
    return pts;
  }

  framedDistance(dir, margin) {
    var pts = this._framePoints;
    var center = this._frameCenter;
    if (!pts || !pts.length || !center) return 1;

    var tanV = Math.tan((this.camera.fov * Math.PI / 180) / 2);
    var tanH = tanV * this.camera.aspect;

    var forward = dir.clone().negate().normalize(); // camera -> target
    var upHint = this.camera.up.clone().normalize();
    var right = new THREE.Vector3().crossVectors(forward, upHint);
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    right.normalize();
    var up = new THREE.Vector3().crossVectors(right, forward).normalize();

    var dist = 0;
    var e = new THREE.Vector3();
    for (var i = 0; i < pts.length; i++) {
      e.copy(pts[i]).sub(center);
      var eR = right.dot(e);
      var eU = up.dot(e);
      var eF = forward.dot(e);
      dist = Math.max(dist, Math.abs(eR) / tanH - eF, Math.abs(eU) / tanV - eF);
    }
    return Math.max(dist, 1e-4) * (margin == null ? 1 : margin);
  }

  fitCamera(obj) {
    var box = new THREE.Box3().setFromObject(obj);
    var center = box.getCenter(new THREE.Vector3());
    var size = box.getSize(new THREE.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z) || 1;

    // fit against the model's real surface points (plus the box corners as a
    // safety net) so long, diagonal parts fill the frame without clipping
    obj.updateMatrixWorld(true);
    var points = this.collectFramePoints(obj);
    points.push(new THREE.Vector3(box.min.x, box.min.y, box.min.z));
    points.push(new THREE.Vector3(box.max.x, box.max.y, box.max.z));
    this._framePoints = points;
    this._frameCenter = center;
    this._modelBox = box;

    var dir = this.viewDirection();
    var dist = this.rotationSafeDistance();

    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.near = Math.max(maxDim * 0.01, 0.01);
    this.camera.far = Math.max(maxDim * 200, dist + maxDim * 20);
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(center);
    this.controls.maxDistance = Math.max(dist * 8, maxDim * 20);
    this.controls.minDistance = Math.max(maxDim * 0.05, 0.005);
    this.controls.update();

    var r = maxDim * 1.5;
    this.mainLight.shadow.camera.left = -r;
    this.mainLight.shadow.camera.right = r;
    this.mainLight.shadow.camera.top = r;
    this.mainLight.shadow.camera.bottom = -r;
    this.mainLight.shadow.camera.near = 0.1;
    this.mainLight.shadow.camera.far = r * 4;
    this.mainLight.shadow.camera.updateProjectionMatrix();
    this.mainLight.position.set(center.x - maxDim * 1.7, center.y + maxDim * 2.3, center.z + maxDim * 1.4);
    this.fillLight.position.set(center.x + maxDim * 1.4, center.y + maxDim * 0.8, center.z - maxDim * 1.2);
  }

  resetCamera() {
    if (this.productGroup.children.length) {
      this.fitCamera(this.productGroup.children[0]);
    } else {
      this.controls.reset();
      this.camera.position.set(4, 3, 6);
      this.controls.target.set(0, 0, 0);
    }
  }

  countMeshes(obj) {
    var n = 0;
    obj.traverse((c) => { if (c.isMesh) n++; });
    return n;
  }

  /* Rank the model's parts by bounding-box volume and remember the biggest
     few, so COVER can ghost them to reveal what they cover. */
  computeCoverParts(obj) {
    var meshes = [];
    obj.traverse(function (c) { if (c.isMesh) meshes.push(c); });

    var box = new THREE.Box3();
    var size = new THREE.Vector3();
    var ranked = meshes.map(function (m) {
      box.setFromObject(m);
      box.getSize(size);
      return { mesh: m, vol: Math.max(size.x, 0) * Math.max(size.y, 0) * Math.max(size.z, 0) };
    }).sort(function (a, b) { return b.vol - a.vol; });

    // never ghost the whole model: keep at least one part solid
    var n = Math.min(COVER_PARTS, Math.max(0, ranked.length - 1));
    this.coverMeshes = ranked.slice(0, n).map(function (r) { return r.mesh; });

    // give the ghosted parts their own material copies: a GLB often shares one
    // material between big and small parts, and fading it would ghost those too
    var mats = [];
    this.coverMeshes.forEach(function (m) {
      if (!m.material) return;
      if (Array.isArray(m.material)) {
        m.material = m.material.map(function (mm) { return mm.clone(); });
        m.material.forEach(function (mm) { mats.push(mm); });
      } else {
        m.material = m.material.clone();
        mats.push(m.material);
      }
    });
    this.coverMaterials = mats;

    this.coverGhost = false;
    this.coverOpacity = 1;
    this.coverTarget = 1;
    this.coverTransparent = false;
  }

  /* opacity is eased toward the target in the render loop */
  applyCoverOpacity(v) {
    var wantTransparent = v < 0.999;
    var flip = wantTransparent !== this.coverTransparent;
    this.coverTransparent = wantTransparent;
    this.coverMaterials.forEach(function (m) {
      m.opacity = v;
      if (flip) {
        m.transparent = wantTransparent;
        m.depthWrite = !wantTransparent;
        m.needsUpdate = true; // required when toggling `transparent`
      }
    });
  }

  updateCoverButton() {
    var btn = byId('btn-cover');
    if (!btn) return;
    if (!this.coverAllowed || this.partCount <= 1) {
      btn.hidden = true;
      btn.disabled = true;
      btn.classList.remove('active');
      return;
    }
    btn.hidden = false;
    var usable = this.coverMaterials.length > 0;
    btn.disabled = !usable;
    if (!usable) btn.classList.remove('active');
    btn.classList.toggle('active', this.coverGhost);
  }

  toggleCover() {
    if (!this.coverMaterials.length) return false;
    this.coverGhost = !this.coverGhost;
    this.coverTarget = this.coverGhost ? COVER_OPACITY : 1;
    // a see-through shell shouldn't cast a solid shadow
    var ghost = this.coverGhost;
    this.coverMeshes.forEach(function (m) { m.castShadow = !ghost; });
    this.updateCoverButton();
    return this.coverGhost;
  }

  toggleSlice() {
    this.isClipping = !this.isClipping;
    this.productGroup.traverse((child) => {
      if (child.isMesh) {
        this.forEachMaterial(child, (mat) => {
          mat.clippingPlanes = this.isClipping ? [this.clipPlane] : [];
        });
      }
    });
    var btn = byId('btn-clip');
    if (btn) btn.classList.toggle('active', this.isClipping);
    var wrap = byId('clip-slider-container');
    if (wrap) wrap.hidden = !this.isClipping;

    if (this.isClipping) this.setSliceAxis(this.clipAxis);
    return this.isClipping;
  }

  /* World-space normal for a slice axis (negated so the slider reads
     low -> high along that axis). */
  sliceNormal(axis) {
    if (axis === 'y') return new THREE.Vector3(0, -1, 0);
    if (axis === 'z') return new THREE.Vector3(0, 0, -1);
    return new THREE.Vector3(-1, 0, 0);
  }

  /* Point the clipping plane down X, Y or Z and size the slider to the model
     so its whole travel sweeps the part. */
  setSliceAxis(axis) {
    this.clipAxis = axis === 'y' || axis === 'z' ? axis : 'x';
    this.clipPlane.normal.copy(this.sliceNormal(this.clipAxis));

    var box = this._modelBox;
    var lo = -1;
    var hi = 1;
    if (box) {
      if (this.clipAxis === 'y') { lo = box.min.y; hi = box.max.y; }
      else if (this.clipAxis === 'z') { lo = box.min.z; hi = box.max.z; }
      else { lo = box.min.x; hi = box.max.x; }
      if (!(hi > lo)) { lo -= 0.5; hi += 0.5; }
    }

    var mid = (lo + hi) / 2;
    this.clipPlane.constant = mid;

    var slider = byId('clip-slider');
    if (slider) {
      slider.min = lo;
      slider.max = hi;
      slider.step = (hi - lo) / 200;
      slider.value = mid;
    }

    var label = byId('clip-slider-label');
    if (label) label.textContent = 'PLANE ' + this.clipAxis.toUpperCase();

    var group = byId('clip-axes');
    if (group) {
      Array.prototype.forEach.call(group.querySelectorAll('.clip-axis'), (b) => {
        b.classList.toggle('active', b.getAttribute('data-axis') === this.clipAxis);
      });
    }
    return this.clipAxis;
  }

  setSliceHeight(v) { this.clipPlane.constant = v; }

  toggleWireframe() {
    this.isWireframe = !this.isWireframe;
    this.productGroup.traverse((child) => {
      if (child.isMesh) this.forEachMaterial(child, (m) => { m.wireframe = this.isWireframe; });
    });
    var btn = byId('btn-wireframe');
    if (btn) btn.classList.toggle('active', this.isWireframe);
    return this.isWireframe;
  }

  toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    this.container.requestFullscreen && this.container.requestFullscreen();
  }

  setToolbarVisible(visible) {
    var c = byId('viewer-controls');
    if (c) c.hidden = !visible;
  }

  onResize() {
    if (!this.renderer || !this.container) return;
    var w = this.container.clientWidth;
    var h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);

    // keep the model framed at the new aspect: adjust the distance along the
    // current viewing direction (keeps the user's orientation, refits the zoom)
    if (this._framePoints && this.controls) {
      var target = this.controls.target;
      var dir = this.camera.position.clone().sub(target);
      if (dir.lengthSq() > 1e-8) {
        dir.normalize();
        this.camera.position.copy(target).addScaledVector(dir, this.rotationSafeDistance());
        this.controls.update();
      }
    }
  }

  loop() {
    this.rafId = requestAnimationFrame(() => this.loop());
    if (this.disposed || !this.renderer) return;
    // ease the ghost fade toward its target
    if (this.coverMaterials.length && this.coverOpacity !== this.coverTarget) {
      this.coverOpacity = Math.abs(this.coverOpacity - this.coverTarget) < 0.004
        ? this.coverTarget
        : THREE.MathUtils.lerp(this.coverOpacity, this.coverTarget, 0.16);
      this.applyCoverOpacity(this.coverOpacity);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    if (this.resizeObserver) this.resizeObserver.disconnect();
  }
}

function bindControls(v) {
  var btnReset = byId('btn-reset');
  var btnRotate = byId('btn-rotate');
  var btnCover = byId('btn-cover');
  var btnClip = byId('btn-clip');
  var btnWire = byId('btn-wireframe');
  var btnFs = byId('btn-fullscreen');
  var clipSlider = byId('clip-slider');

  if (btnReset) btnReset.addEventListener('click', () => v.resetCamera());
  if (btnRotate) btnRotate.addEventListener('click', () => v.setAutoRotate());
  if (btnCover) btnCover.addEventListener('click', () => v.toggleCover());
  if (btnClip) btnClip.addEventListener('click', () => v.toggleSlice());
  if (btnWire) btnWire.addEventListener('click', () => v.toggleWireframe());
  if (btnFs) btnFs.addEventListener('click', () => v.toggleFullscreen());
  if (clipSlider) clipSlider.addEventListener('input', (e) => v.setSliceHeight(parseFloat(e.target.value)));

  var axes = byId('clip-axes');
  if (axes) {
    axes.addEventListener('click', (e) => {
      var b = e.target.closest ? e.target.closest('.clip-axis') : null;
      if (b) v.setSliceAxis(b.getAttribute('data-axis'));
    });
  }

  document.addEventListener('fullscreenchange', () => {
    if (btnFs) btnFs.classList.toggle('active', !!document.fullscreenElement);
    setTimeout(() => v.onResize(), 100);
  });
}

function showNoModel(msg) {
  var loader = byId('viewer-loader');
  var status = byId('loader-status');
  if (status) status.textContent = msg;
  if (loader) {
    loader.style.display = 'flex';
    loader.style.opacity = '1';
  }
}

async function boot() {
  var container = byId('viewer3d');
  if (!container) return;

  var params = new URLSearchParams(window.location.search);
  var catSlug = params.get('cat') || params.get('product');
  var itemId = params.get('item');
  var modelPath = params.get('model');

  // COVER is offered only in the categories it suits; elsewhere drop the button
  var coverAllowed = COVER_CATEGORIES.indexOf(catSlug) !== -1;
  var coverBtn = byId('btn-cover');
  if (coverBtn && !coverAllowed) coverBtn.hidden = true;

  if (!modelPath && catSlug) {
    try {
      var res = await fetch('data/' + catSlug + '.json', { cache: 'no-store' });
      if (res.ok) {
        var data = await res.json();
        var item = null;
        if (itemId && data.products) {
          item = data.products.filter((p) => p.id === itemId)[0] || null;
        }
        if (!item && data.products && data.products.length) item = data.products[0];
        if (item && item.model3d) modelPath = item.model3d;
      }
    } catch (e) { /* ignore, fall through */ }
  }

  if (!modelPath) {
    showNoModel(NO_MODEL_MSG[lang()] || NO_MODEL_MSG.en);
    return;
  }

  var viewer = new Viewer(container);
  viewer.coverAllowed = coverAllowed;
  viewer.initialRotation = INITIAL_ROTATION[itemId] || null;
  try {
    viewer.init();
  } catch (err) {
    console.error('WebGL init failed:', err);
    showNoModel(NO_MODEL_MSG[lang()] || NO_MODEL_MSG.en);
    return;
  }
  bindControls(viewer);
  viewer.load(modelPath);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
