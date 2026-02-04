// index.js
// Single-file marketplace + viewer script that uses explicit CDN module URLs.
// Avoids bare specifiers like "three" so browsers won't try to resolve them relatively.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/controls/OrbitControls.js';

document.addEventListener('DOMContentLoaded', () => {
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

  if (!marketplaceEl) console.warn('index.js: #marketplace not found — marketplace will not render.');
  if (!canvasContainer) console.warn('index.js: #canvas-container not found — viewer will not initialize.');

  let skinpacks = [];
  let currentPack = null;
  let currentIndex = 0;

  async function loadSkins() {
    try {
      const res = await fetch('skins.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      skinpacks = await res.json();
      if (marketplaceEl) renderMarketplace(skinpacks);
    } catch (err) {
      console.error('Failed to load skins.json:', err);
      if (marketplaceEl) {
        marketplaceEl.innerHTML = `<div style="padding:24px;color:#f88">Error loading skins.json: ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  function renderMarketplace(packs) {
    if (!marketplaceEl) return;
    marketplaceEl.innerHTML = '';
    if (!Array.isArray(packs) || packs.length === 0) {
      marketplaceEl.innerHTML = '<p style="color:var(--muted);padding:18px">No skinpacks found.</p>';
      return;
    }

    packs.forEach((pack, packIdx) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `
        <div class="preview" data-preview-index="0" aria-hidden="true"></div>
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

      const previewEl = card.querySelector('.preview');
      if (previewEl && Array.isArray(pack.skins) && pack.skins.length) {
        createSmallPreview(previewEl, pack.skins, { autoplay: true, interval: 1800 });
      } else if (previewEl) {
        previewEl.textContent = 'No skins';
      }
    });

    marketplaceEl.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = Number(e.currentTarget.dataset.index);
        if (!Number.isNaN(idx) && skinpacks[idx]) openViewer(skinpacks[idx]);
      });
    });
  }

  function createSmallPreview(containerEl, skins, opts = {}) {
    if (!containerEl) return;
    const baseW = Math.max(160, containerEl.clientWidth || 160);
    const baseH = Math.max(120, containerEl.clientHeight || 120);

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(baseW, baseH);
    containerEl.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, baseW / baseH, 0.1, 1000);
    camera.position.set(0, 1.6, 3);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; controls.enableZoom = false; controls.enableRotate = false;

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(5, 10, 7);
    scene.add(dir);

    const group = new THREE.Group();
    scene.add(group);

    const geometry = new THREE.BoxGeometry(1, 2, 0.5);
    const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = 1;
    group.add(mesh);

    const texLoader = new THREE.TextureLoader();
    texLoader.crossOrigin = 'anonymous';

    let idx = 0;
    let intervalId = null;

    function loadSkin(i) {
      const url = skins[i] && skins[i].png;
      if (!url) {
        mesh.material.map = null;
        mesh.material.color.setHex(0x888888);
        return;
      }
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

    if (opts.autoplay) {
      loadSkin(idx);
      intervalId = setInterval(() => {
        idx = (idx + 1) % skins.length;
        loadSkin(idx);
      }, opts.interval || 2000);
    } else {
      loadSkin(0);
    }

    containerEl.addEventListener('click', () => {
      const packIdx = skinpacks.findIndex(p => p.skins === skins || (p.skins && arraysEqualByPng(p.skins, skins)));
      if (packIdx >= 0) openViewer(skinpacks[packIdx], idx);
    });

    const observer = new MutationObserver(() => {
      if (!document.body.contains(containerEl)) {
        clearInterval(intervalId);
        renderer.dispose();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    new ResizeObserver(() => {
      const nw = Math.max(48, containerEl.clientWidth || baseW);
      const nh = Math.max(48, containerEl.clientHeight || baseH);
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    }).observe(containerEl);
  }

  function arraysEqualByPng(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if ((a[i] && a[i].png) !== (b[i] && b[i].png)) return false;
    }
    return true;
  }

  // Viewer renderer
  let viewerRenderer = null;
  let viewerScene = null;
  let viewerCamera = null;
  let viewerControls = null;
  let mainGroup = null;
  let texLoader = null;
  let viewerRaf = null;

  function initViewerRenderer() {
    if (!canvasContainer) return;
    canvasContainer.innerHTML = '';

    viewerRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    viewerRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    viewerRenderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    canvasContainer.appendChild(viewerRenderer.domElement);

    viewerScene = new THREE.Scene();
    viewerCamera = new THREE.PerspectiveCamera(45, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
    viewerCamera.position.set(0, 1.6, 3);

    viewerControls = new OrbitControls(viewerCamera, viewerRenderer.domElement);
    viewerControls.enableDamping = true;
    viewerControls.enablePan = false;
    viewerControls.minDistance = 1.6;
    viewerControls.maxDistance = 6;
    viewerControls.target.set(0, 1.2, 0);

    viewerScene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 10, 7);
    viewerScene.add(dir);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0x071827, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    viewerScene.add(ground);

    mainGroup = new THREE.Group();
    viewerScene.add(mainGroup);

    const geometry = new THREE.BoxGeometry(1, 2, 0.5);
    const cubeMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x999999 }));
    cubeMesh.position.y = 1;
    mainGroup.add(cubeMesh);

    texLoader = new THREE.TextureLoader();
    texLoader.crossOrigin = 'anonymous';

    window.addEventListener('resize', onViewerResize);
    animateViewer();
  }

  function disposeViewer() {
    if (!viewerRenderer) return;
    cancelAnimationFrame(viewerRaf);
    viewerRenderer.dispose();
    viewerRenderer.forceContextLoss && viewerRenderer.forceContextLoss();
    viewerRenderer.domElement && viewerRenderer.domElement.remove();
    viewerRenderer = null;
    viewerScene = null;
    viewerCamera = null;
    viewerControls = null;
    mainGroup = null;
    texLoader = null;
    window.removeEventListener('resize', onViewerResize);
  }

  function onViewerResize() {
    if (!viewerRenderer || !viewerCamera) return;
    const w = canvasContainer.clientWidth;
    const h = canvasContainer.clientHeight;
    viewerRenderer.setSize(w, h);
    viewerCamera.aspect = w / h;
    viewerCamera.updateProjectionMatrix();
  }

  function animateViewer() {
    if (!viewerRenderer) return;
    viewerRaf = requestAnimationFrame(animateViewer);
    viewerControls && viewerControls.update();
    if (mainGroup) mainGroup.rotation.y += 0.003;
    viewerRenderer.render(viewerScene, viewerCamera);
  }

  function buildViewerModelFromSkin(url) {
    if (!mainGroup || !texLoader) return;
    while (mainGroup.children.length) mainGroup.remove(mainGroup.children[0]);

    const headGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const bodyGeo = new THREE.BoxGeometry(0.9, 1.2, 0.45);
    const armGeo = new THREE.BoxGeometry(0.35, 1.1, 0.35);
    const legGeo = new THREE.BoxGeometry(0.4, 1.2, 0.4);

    texLoader.load(
      url,
      (tex) => {
        tex.flipY = false;
        tex.encoding = THREE.sRGBEncoding;
        const texturedMat = new THREE.MeshStandardMaterial({ map: tex });
        const head = new THREE.Mesh(headGeo, texturedMat); head.position.set(0, 1.9, 0);
        const body = new THREE.Mesh(bodyGeo, texturedMat); body.position.set(0, 1.0, 0);
        const leftArm = new THREE.Mesh(armGeo, texturedMat); leftArm.position.set(-0.7, 1.05, 0);
        const rightArm = new THREE.Mesh(armGeo, texturedMat); rightArm.position.set(0.7, 1.05, 0);
        const leftLeg = new THREE.Mesh(legGeo, texturedMat); leftLeg.position.set(-0.2, -0.2, 0);
        const rightLeg = new THREE.Mesh(legGeo, texturedMat); rightLeg.position.set(0.2, -0.2, 0);

        mainGroup.add(head, body, leftArm, rightArm, leftLeg, rightLeg);
      },
      undefined,
      () => {
        const fallback = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.5), new THREE.MeshStandardMaterial({ color: 0x6b1f1f }));
        fallback.position.y = 1;
        mainGroup.add(fallback);
      }
    );
  }

  function openViewer(pack, startIndex = 0) {
    currentPack = pack;
    currentIndex = startIndex || 0;
    if (viewerTitle) viewerTitle.textContent = pack.name || 'Skinpack Viewer';
    if (packMeta) packMeta.textContent = pack.description || '';
    if (downloadPack) {
      downloadPack.href = pack.location || '#';
      downloadPack.setAttribute('download', '');
    }
    if (viewerPanel) viewerPanel.setAttribute('aria-hidden', 'false');

    if (!viewerRenderer && canvasContainer) initViewerRenderer();
    populateThumbnails(pack);
    showSkinAt(currentIndex);
  }

  function populateThumbnails(pack) {
    if (!thumbnailsEl) return;
    thumbnailsEl.innerHTML = '';
    (pack.skins || []).forEach((s, i) => {
      const t = document.createElement('div');
      t.className = 'thumb';
      t.dataset.index = i;
      thumbnailsEl.appendChild(t);

      createThumbPreview(t, s.png);

      t.addEventListener('click', () => {
        showSkinAt(i);
      });
    });
    updateThumbActive();
  }

  function createThumbPreview(containerEl, pngUrl) {
    if (!containerEl) return;
    const w = Math.max(48, containerEl.clientWidth || 72);
    const h = Math.max(48, containerEl.clientHeight || 72);
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
    if (pngUrl) {
      loader.load(pngUrl, (tex) => {
        tex.flipY = false;
        tex.encoding = THREE.sRGBEncoding;
        m.material.map = tex;
        m.material.needsUpdate = true;
      });
    }

    function loop() {
      m.rotation.y += 0.006;
      r.render(s, c);
      requestAnimationFrame(loop);
    }
    loop();

    new ResizeObserver(() => {
      const nw = Math.max(48, containerEl.clientWidth || w);
      const nh = Math.max(48, containerEl.clientHeight || h);
      r.setSize(nw, nh);
      c.aspect = nw / nh;
      c.updateProjectionMatrix();
    }).observe(containerEl);
  }

  function showSkinAt(i) {
    if (!currentPack || !currentPack.skins || i < 0 || i >= currentPack.skins.length) return;
    currentIndex = i;
    const skin = currentPack.skins[i];
    if (skinNameEl) skinNameEl.textContent = skin.name || `Skin ${i+1}`;
    if (skinIndexEl) skinIndexEl.textContent = `${i+1} / ${currentPack.skins.length}`;
    updateThumbActive();
    buildViewerModelFromSkin(skin.png);
  }

  if (prevSkinBtn) {
    prevSkinBtn.addEventListener('click', () => {
      if (!currentPack) return;
      const next = (currentIndex - 1 + currentPack.skins.length) % currentPack.skins.length;
      showSkinAt(next);
    });
  }
  if (nextSkinBtn) {
    nextSkinBtn.addEventListener('click', () => {
      if (!currentPack) return;
      const next = (currentIndex + 1) % currentPack.skins.length;
      showSkinAt(next);
    });
  }

  function updateThumbActive() {
    if (!thumbnailsEl) return;
    const thumbs = thumbnailsEl.querySelectorAll('.thumb');
    thumbs.forEach(t => t.classList.remove('active'));
    const active = thumbnailsEl.querySelector(`.thumb[data-index="${currentIndex}"]`);
    if (active) active.classList.add('active');
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const filtered = skinpacks.filter(p => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
      if (marketplaceEl) renderMarketplace(filtered);
    });
  }

  function escapeHtml(s = '') {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  loadSkins();

  window.addEventListener('resize', () => {
    if (viewerRenderer) onViewerResize();
  });
});
