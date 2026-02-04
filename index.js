// index.js (ES module)
const marketplaceEl = document.getElementById('marketplace');
const viewerModal = document.getElementById('viewerModal');
const closeViewerBtn = document.getElementById('closeViewer');
const viewerTitle = document.getElementById('viewerTitle');
const downloadPack = document.getElementById('downloadPack');
const threeContainer = document.getElementById('threeContainer');
const prevSkinBtn = document.getElementById('prevSkin');
const nextSkinBtn = document.getElementById('nextSkin');
const skinNameEl = document.getElementById('skinName');
const skinIndexEl = document.getElementById('skinIndex');
const thumbnailsEl = document.getElementById('thumbnails');
const searchInput = document.getElementById('search');

let skinpacks = []; // loaded from skins.json
let currentPack = null;
let currentIndex = 0;

// THREE.js essentials
let renderer, scene, camera, controls, cubeMesh, light;

// Utility: fetch skins.json from same folder
async function loadSkins() {
  try {
    const res = await fetch('skins.json', {cache: "no-store"});
    if (!res.ok) throw new Error('Failed to load skins.json');
    skinpacks = await res.json();
    renderMarketplace(skinpacks);
  } catch (err) {
    marketplaceEl.innerHTML = `<div style="padding:24px;color:#f88">Error loading skins: ${err.message}</div>`;
    console.error(err);
  }
}

// Render marketplace cards
function renderMarketplace(packs) {
  marketplaceEl.innerHTML = '';
  if (!packs.length) {
    marketplaceEl.innerHTML = '<p style="color:var(--muted);padding:18px">No skinpacks found.</p>';
    return;
  }

  packs.forEach((pack, idx) => {
    const card = document.createElement('article');
    card.className = 'card';
    const previewImg = pack.preview || (pack.skins && pack.skins[0] && pack.skins[0].png) || '';
    card.innerHTML = `
      <div class="preview">
        <img src="${escapeHtml(previewImg)}" alt="${escapeHtml(pack.name)} preview" onerror="this.style.opacity=.25;this.style.objectFit='contain'"/>
      </div>
      <div>
        <h3>${escapeHtml(pack.name)}</h3>
        <p>${escapeHtml(pack.description || '')}</p>
      </div>
      <div class="meta">
        <div style="color:var(--muted);font-size:.9rem">${pack.skins ? pack.skins.length : 0} skins</div>
        <div>
          <button class="btn view-btn" data-index="${idx}">View</button>
        </div>
      </div>
    `;
    marketplaceEl.appendChild(card);
  });

  // attach listeners
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = Number(e.currentTarget.dataset.index);
      openViewer(skinpacks[idx]);
    });
  });
}

// Open viewer for a pack
function openViewer(pack) {
  currentPack = pack;
  currentIndex = 0;
  viewerTitle.textContent = pack.name || 'Skinpack Viewer';
  downloadPack.href = pack.location || '#';
  downloadPack.setAttribute('download', '');
  populateThumbnails(pack);
  showSkinAt(currentIndex);
  viewerModal.classList.remove('hidden');
  viewerModal.setAttribute('aria-hidden', 'false');
  initThree();
  animate();
}

// Close viewer
function closeViewer() {
  viewerModal.classList.add('hidden');
  viewerModal.setAttribute('aria-hidden', 'true');
  disposeThree();
}

// Populate thumbnails
function populateThumbnails(pack) {
  thumbnailsEl.innerHTML = '';
  (pack.skins || []).forEach((s, i) => {
    const t = document.createElement('div');
    t.className = 'thumb';
    t.dataset.index = i;
    t.innerHTML = `<img src="${escapeHtml(s.png)}" alt="${escapeHtml(s.name || 'skin')}">`;
    t.addEventListener('click', () => {
      showSkinAt(i);
    });
    thumbnailsEl.appendChild(t);
  });
  updateThumbActive();
}

// Show skin at index
function showSkinAt(i) {
  if (!currentPack || !currentPack.skins || i < 0 || i >= currentPack.skins.length) return;
  currentIndex = i;
  const skin = currentPack.skins[i];
  skinNameEl.textContent = skin.name || `Skin ${i+1}`;
  skinIndexEl.textContent = `${i+1} / ${currentPack.skins.length}`;
  updateThumbActive();
  loadTextureToCube(skin.png);
}

// Prev/next handlers
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
closeViewerBtn.addEventListener('click', closeViewer);
viewerModal.addEventListener('click', (e) => {
  if (e.target === viewerModal) closeViewer();
});

// Search
searchInput.addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const filtered = skinpacks.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
  renderMarketplace(filtered);
});

// --- THREE.js setup and helpers ---

function initThree() {
  // clear container
  threeContainer.innerHTML = '';

  // renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(threeContainer.clientWidth, threeContainer.clientHeight);
  threeContainer.appendChild(renderer.domElement);

  // scene
  scene = new THREE.Scene();

  // camera
  camera = new THREE.PerspectiveCamera(45, threeContainer.clientWidth / threeContainer.clientHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 3);

  // controls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1.6;
  controls.maxDistance = 6;
  controls.target.set(0, 1.2, 0);

  // light
  light = new THREE.DirectionalLight(0xffffff, 1.0);
  light.position.set(5, 10, 7);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  // ground subtle
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x071827, roughness: 1, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.receiveShadow = true;
  scene.add(ground);

  // create a cube that will receive the skin texture
  const geometry = new THREE.BoxGeometry(1, 2, 0.5);
  // default material placeholder
  const material = new THREE.MeshStandardMaterial({ color: 0x999999 });
  cubeMesh = new THREE.Mesh(geometry, material);
  cubeMesh.position.y = 1;
  scene.add(cubeMesh);

  // handle resize
  window.addEventListener('resize', onResize);
  onResize();
}

// Dispose three resources when closing
function disposeThree() {
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement && renderer.domElement.remove();
  }
  renderer = null;
  scene = null;
  camera = null;
  controls = null;
  cubeMesh = null;
  window.removeEventListener('resize', onResize);
  cancelAnimationFrame(rafId);
}

// load a PNG texture and apply to cube
function loadTextureToCube(url) {
  if (!scene || !cubeMesh) return;
  const loader = new THREE.TextureLoader();
  // show a quick placeholder while loading
  cubeMesh.material.map = null;
  cubeMesh.material.color.setHex(0x888888);
  loader.crossOrigin = 'anonymous';
  loader.load(
    url,
    (tex) => {
      tex.flipY = false; // Minecraft skins often need flipY false depending on mapping; keep false for direct display
      tex.encoding = THREE.sRGBEncoding;
      // We'll apply the same texture to all faces for a simple preview
      cubeMesh.material.map = tex;
      cubeMesh.material.needsUpdate = true;
    },
    undefined,
    (err) => {
      console.warn('Texture load error', err);
      // fallback: tint material red-ish to indicate missing texture
      cubeMesh.material.map = null;
      cubeMesh.material.color.setHex(0x6b1f1f);
      cubeMesh.material.needsUpdate = true;
    }
  );
}

// animation loop
let rafId;
function animate() {
  if (!renderer) return;
  rafId = requestAnimationFrame(animate);
  controls && controls.update();
  // subtle rotation for presentation
  if (cubeMesh) cubeMesh.rotation.y += 0.003;
  renderer.render(scene, camera);
}

// handle resize
function onResize() {
  if (!renderer || !camera) return;
  const w = threeContainer.clientWidth;
  const h = threeContainer.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// highlight active thumbnail
function updateThumbActive() {
  const thumbs = thumbnailsEl.querySelectorAll('.thumb');
  thumbs.forEach(t => t.classList.remove('active'));
  const active = thumbnailsEl.querySelector(`.thumb[data-index="${currentIndex}"]`);
  if (active) active.classList.add('active');
}

// small helper to escape HTML for inserted strings
function escapeHtml(s = '') {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// initial load
loadSkins();

