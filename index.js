// index.js (module)
// Uses Three.js to render small previews per card and a larger viewer on the right.
// It follows the renderer style from the provided renderer snippet (antialias:false, alpha:true).

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/controls/OrbitControls.js';

const marketplaceEl = document.getElementById('marketplace');
const viewerPanel = document.getElementById('viewerPanel');
const viewerTitle = document.getElementById('viewerTitle');
const packMeta = document.getElementById('packMeta');
const downloadPack = document.getElementById('downloadPack');
const canvasContainer = document.getElementById('canvas-container');
const prevSkinBtn = document.getElementById('prevSkin');
const nextSkinBtn = document.getElementById('nextSkin');
const skinNameEl = document.getElementById('skinName');
const skinIndexEl = document.getElementById('skinIndex');
const thumbnailsEl = document.getElementById('thumbnails');
const searchInput = document.getElementById('search');

let skinpacks = [];
let currentPack = null;
let currentIndex = 0;

// --- Utility: load skins.json ---
async function loadSkins() {
  try {
    const res = await fetch('skins.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('skins.json not found');
    skinpacks = await res.json();
    renderMarketplace(skinpacks);
  } catch (err) {
    marketplaceEl.innerHTML = `<div style="padding:24px;color:#f88">Error loading skins.json: ${err.message}</div>`;
    console.error(err);
  }
}

// --- Marketplace rendering ---
// For each pack we create a small Three renderer that cycles through its skins.
function renderMarketplace(packs) {
  marketplaceEl.innerHTML = '';
  if (!packs.length) {
    marketplaceEl.innerHTML = '<p style="color:var(--muted);padding:18px">No skinpacks found.</p>';
    return;
  }

  packs.forEach((pack, packIdx) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="preview" data-preview-index="0"></div>
      <div>
        <h3>${escapeHtml(pack.name)}</h3>
        <p>${escapeHtml(pack.description || '')}</p>
      </div>
      <div class="meta">
        <div style="color:var(--muted);font-size:.9rem">${pack.skins ? pack.skins.length : 0} skins</div>
        <div>
          <button class="btn view-btn" data-index="${packIdx}">View</button>
        </div>
      </div>
    `;
    marketplaceEl.appendChild(card);

    // create a small preview renderer inside .preview
    const previewEl = card.querySelector('.preview');
    if (pack.skins && pack.skins.length) {
      createSmallPreview(previewEl, pack.skins, { autoplay: true, interval: 1800 });
    } else {
      previewEl.textContent = 'No skins';
    }
  });

  // attach listeners
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = Number(e.currentTarget.dataset.index);
      openViewer(skinpacks[idx]);
    });
  });
}

// --- Small preview: creates its own renderer, scene, camera and cycles textures ---
function createSmallPreview(containerEl, skins, opts = {}) {
  const w = containerEl.clientWidth || 320;
  const h = containerEl.clientHeight || 160;

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  containerEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  camera.position.set(0, 1.6, 3);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableRotate = false;

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(5, 10, 7);
  scene.add(dir);

  const group = new THREE.Group();
  scene.add(group);

  // simple box geometry used as preview model (keeps performance)
  const geometry = new THREE.BoxGeometry(1, 2, 0.5);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 1;
  group.add(mesh);

  let texLoader = new THREE.TextureLoader();
  texLoader.crossOrigin = 'anonymous';

  let idx = 0;
  let intervalId = null;

  function loadSkin(i) {
    const url = skins[i].png;
    texLoader.load(
      url,
      (tex) => {
        tex.flipY = false;
        tex.encoding = THREE.sRGBEncoding;
        mesh.material.map = tex;
        mesh.material.needsUpdate = true;
      },
      undefined,
      () => {
        mesh.material.map = null;
        mesh.material.color.setHex(0x6b1f1f);
      }
    );
  }

  function animate() {
    mesh.rotation.y += 0.006;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  // autoplay cycle
  if (opts.autoplay) {
    loadSkin(idx);
    intervalId = setInterval(() => {
      idx = (idx + 1) % skins.length;
      loadSkin(idx);
    }, opts.interval || 2000);
  } else {
    loadSkin(0);
  }

  // cleanup on container removal (optional)
  const observer = new MutationObserver(() => {
    if (!document.body.contains(containerEl)) {
      clearInterval(intervalId);
      renderer.dispose();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // clicking preview opens viewer for the pack and selects that skin index
  containerEl.addEventListener('click', () => {
    // find pack index by searching skinpacks for this skins array reference
    const packIdx = skinpacks.findIndex(p => p.skins === skins);
    if (packIdx >= 0) openViewer(skinpacks[packIdx], idx);
  });

  // handle resize
  new ResizeObserver(() => {
    const nw = containerEl.clientWidth;
    const nh = containerEl.clientHeight;
    renderer.setSize(nw, nh);
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
  }).observe(containerEl);
}

// --- Viewer (right panel) ---
// We'll create a single renderer in canvasContainer and a more detailed model builder
let renderer, scene, camera, controls, mainGroup, cubeMesh, texLoader;
let rafId;

function initViewerRenderer() {
  // clear previous
  canvasContainer.innerHTML = '';

  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  canvasContainer.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 3);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1.6;
  controls.maxDistance = 6;
  controls.target.set(0, 1.2, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(5, 10, 7);
  scene.add(dir);

  // ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x071827, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  mainGroup = new THREE.Group();
  scene.add(mainGroup);

  // placeholder mesh
  const geometry = new THREE.BoxGeometry(1, 2, 0.5);
  cubeMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x999999 }));
  cubeMesh.position.y = 1;
  mainGroup.add(cubeMesh);

  texLoader = new THREE.TextureLoader();
  texLoader.crossOrigin = 'anonymous';

  window.addEventListener('resize', onViewerResize);
  animateViewer();
}

function disposeViewer() {
  if (!renderer) return;
  cancelAnimationFrame(rafId);
  renderer.dispose();
  renderer.forceContextLoss && renderer.forceContextLoss();
  renderer.domElement && renderer.domElement.remove();
  renderer = null;
  scene = null;
  camera = null;
  controls = null;
  mainGroup = null;
  cubeMesh = null;
  window.removeEventListener('resize', onViewerResize);
}

function onViewerResize() {
  if (!renderer || !camera) return;
  const w = canvasContainer.clientWidth;
  const h = canvasContainer.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function animateViewer() {
  if (!renderer) return;
  rafId = requestAnimationFrame(animateViewer);
  controls && controls.update();
  if (mainGroup) mainGroup.rotation.y += 0.003;
  renderer.render(scene, camera);
}

// Build a more accurate Minecraft-ish model using simple boxes and UV mapping
function buildViewerModelFromSkin(url) {
  if (!mainGroup) return;
  // clear previous
  while (mainGroup.children.length) mainGroup.remove(mainGroup.children[0]);

  // simple head/body/limbs using box geometry; for brevity we apply same texture to all faces
  const headGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  const bodyGeo = new THREE.BoxGeometry(0.9, 1.2, 0.45);
  const armGeo = new THREE.BoxGeometry(0.35, 1.1, 0.35);
  const legGeo = new THREE.BoxGeometry(0.4, 1.2, 0.4);

  const mats = [];
  const mat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
  mats.push(mat);

  texLoader.load(
    url,
    (tex) => {
      tex.flipY = false;
      tex.encoding = THREE.sRGBEncoding;
      const texturedMat = new THREE.MeshStandardMaterial({ map: tex });
      const head = new THREE.Mesh(headGeo, texturedMat);
      head.position.set(0, 1.9, 0);
      const body = new THREE.Mesh(bodyGeo, texturedMat);
      body.position.set(0, 1.0, 0);
      const leftArm = new THREE.Mesh(armGeo, texturedMat);
      leftArm.position.set(-0.7, 1.05, 0);
      const rightArm = new THREE.Mesh(armGeo, texturedMat);
      rightArm.position.set(0.7, 1.05, 0);
      const leftLeg = new THREE.Mesh(legGeo, texturedMat);
      leftLeg.position.set(-0.2, -0.2, 0);
      const rightLeg = new THREE.Mesh(legGeo, texturedMat);
      rightLeg.position.set(0.2, -0.2, 0);

      mainGroup.add(head, body, leftArm, rightArm, leftLeg, rightLeg);
    },
    undefined,
    () => {
      // fallback: single colored box
      const fallback = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.5), new THREE.MeshStandardMaterial({ color: 0x6b1f1f }));
      fallback.position.y = 1;
      mainGroup.add(fallback);
    }
  );
}

// --- Viewer controls: open pack, populate thumbnails, navigate ---
function openViewer(pack, startIndex = 0) {
  currentPack = pack;
  currentIndex = startIndex || 0;
  viewerTitle.textContent = pack.name || 'Skinpack Viewer';
  packMeta.textContent = pack.description || '';
  downloadPack.href = pack.location || '#';
  downloadPack.setAttribute('download', '');

  // show panel
  viewerPanel.setAttribute('aria-hidden', 'false');

  // init renderer if not present
  if (!renderer) initViewerRenderer();

  populateThumbnails(pack);
  showSkinAt(currentIndex);
}

function populateThumbnails(pack) {
  thumbnailsEl.innerHTML = '';
  (pack.skins || []).forEach((s, i) => {
    const t = document.createElement('div');
    t.className = 'thumb';
    t.dataset.index = i;
    thumbnailsEl.appendChild(t);

    // create a tiny renderer in each thumb to show 3D preview
    createThumbPreview(t, s.png);

    t.addEventListener('click', () => {
      showSkinAt(i);
    });
  });
  updateThumbActive();
}

function createThumbPreview(containerEl, pngUrl) {
  const w = containerEl.clientWidth || 72;
  const h = containerEl.clientHeight || 72;
  const r = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.setSize(w, h);
  containerEl.appendChild(r.domElement);

  const s = new THREE.Scene();
  const c = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
  c.position.set(0, 1.6, 3);
  const ctrl = new OrbitControls(c, r.domElement);
  ctrl.enablePan = false; ctrl.enableZoom = false; ctrl.enableRotate = false;

  s.add(new THREE.AmbientLight(0xffffff, 0.9));
  s.add(new THREE.DirectionalLight(0xffffff, 0.6));

  const g = new THREE.Group();
  s.add(g);

  const geo = new THREE.BoxGeometry(1, 2, 0.5);
  const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 1;
  g.add(m);

  const loader = new THREE.TextureLoader();
  loader.crossOrigin = 'anonymous';
  loader.load(pngUrl, (tex) => {
    tex.flipY = false;
    tex.encoding = THREE.sRGBEncoding;
    m.material.map = tex;
    m.material.needsUpdate = true;
  });

  function loop() {
    m.rotation.y += 0.006;
    r.render(s, c);
    requestAnimationFrame(loop);
  }
  loop();

  new ResizeObserver(() => {
    const nw = containerEl.clientWidth;
    const nh = containerEl.clientHeight;
    r.setSize(nw, nh);
    c.aspect = nw / nh;
    c.updateProjectionMatrix();
  }).observe(containerEl);
}

function showSkinAt(i) {
  if (!currentPack || !currentPack.skins || i < 0 || i >= currentPack.skins.length) return;
  currentIndex = i;
  const skin = currentPack.skins[i];
  skinNameEl.textContent = skin.name || `Skin ${i+1}`;
  skinIndexEl.textContent = `${i+1} / ${currentPack.skins.length}`;
  updateThumbActive();
  // build viewer model using the skin png
  buildViewerModelFromSkin(skin.png);
}

// prev/next handlers
prevSkinBtn.addEventListener('click', () => {
  if (!currentPack) return;
  const next = (currentIndex - 1 + currentPack.skins.length) % currentPack.skins.length;
  showSkinAt(next);
});
nextSkinBtn.addEventListener('click', () => {
  if (!currentPack) return;
  const next = (currentIndex + 1) % currentPack.skins.length;
  showSkinAt(next);
});

// highlight active thumbnail
function updateThumbActive() {
  const thumbs = thumbnailsEl.querySelectorAll('.thumb');
  thumbs.forEach(t => t.classList.remove('active'));
  const active = thumbnailsEl.querySelector(`.thumb[data-index="${currentIndex}"]`);
  if (active) active.classList.add('active');
}

// search
searchInput.addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const filtered = skinpacks.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
  renderMarketplace(filtered);
});

// small helper to escape HTML for inserted strings
function escapeHtml(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// initialize
loadSkins();

// ensure viewer resizes correctly
window.addEventListener('resize', () => {
  if (renderer) onViewerResize();
});
