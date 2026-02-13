import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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

  let skinpacks = [];
  let currentPack = null;
  let currentIndex = 0;

  // --- 1. DATA LOADING ---
  async function loadSkins() {
    try {
      const res = await fetch('skins.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      skinpacks = await res.json();
      if (marketplaceEl) renderMarketplace(skinpacks);
    } catch (err) {
      console.error('Failed to load skins.json:', err);
    }
  }

  // --- 2. THREE.JS UV & PART UTILITIES ---
  function getSkinMat(img, x, y, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.flipY = false;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1, transparent: true });
  }

  function createPart(img, w, h, d, uv, pos, overlayUv) {
    const partGroup = new THREE.Group();
    const depthExtrusion = 0.12; // Matches your "Architect" default

    // Correct BoxGeometry UV Order: Right, Left, Top, Bottom, Front, Back
    const mats = [
      getSkinMat(img, uv.x + d + w, uv.y + d, d, h),     // Right
      getSkinMat(img, uv.x, uv.y + d, d, h),             // Left
      getSkinMat(img, uv.x + d, uv.y, w, d),             // Top
      getSkinMat(img, uv.x + d + w, uv.y, w, d),         // Bottom
      getSkinMat(img, uv.x + d, uv.y + d, w, h),         // Front
      getSkinMat(img, uv.x + d * 2 + w, uv.y + d, w, h)  // Back
    ];

    const base = new THREE.Mesh(new THREE.BoxGeometry(w / 8, h / 8, d / 8), mats);
    partGroup.add(base);

    // Voxelized Overlay Logic
    if (overlayUv) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.width; tempCanvas.height = img.height;
      const tCtx = tempCanvas.getContext('2d');
      tCtx.drawImage(img, 0, 0);
      const data = tCtx.getImageData(overlayUv.x + d, overlayUv.y + d, w, h).data;
      
      for (let i = 0; i < (w * h); i++) {
        if (data[i * 4 + 3] > 20) {
          const vox = new THREE.Mesh(
            new THREE.BoxGeometry(1.1 / 8, 1.1 / 8, depthExtrusion),
            new THREE.MeshStandardMaterial({ 
              color: new THREE.Color(`rgb(${data[i * 4]},${data[i * 4 + 1]},${data[i * 4 + 2]})`), 
              roughness: 1 
            })
          );
          let px = i % w, py = Math.floor(i / w);
          vox.position.set((px / 8) - (w / 16) + 0.0625, (h / 16) - (py / 8) - 0.0625, (d / 16) + (depthExtrusion / 2));
          partGroup.add(vox);
        }
      }
    }
    partGroup.position.set(pos.x, pos.y, pos.z);
    return partGroup;
  }

  // --- 3. MARKETPLACE RENDERER ---
  function renderMarketplace(packs) {
    if (!marketplaceEl) return;
    marketplaceEl.innerHTML = '';
    packs.forEach((pack, packIdx) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `
        <div class="preview" style="height:180px; background:#1a1a1a; cursor:pointer"></div>
        <div style="padding:12px">
          <h3>${escapeHtml(pack.name)}</h3>
          <button class="btn view-btn" data-index="${packIdx}">View Pack</button>
        </div>
      `;
      marketplaceEl.appendChild(card);
      card.querySelector('.view-btn').onclick = () => openViewer(pack);
    });
  }

  // --- 4. VIEWER LOGIC ---
  let viewerRenderer, viewerScene, viewerCamera, viewerControls, mainGroup;

  function initViewerRenderer() {
    if (viewerRenderer) return;
    viewerRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    viewerRenderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    canvasContainer.appendChild(viewerRenderer.domElement);

    viewerScene = new THREE.Scene();
    viewerCamera = new THREE.PerspectiveCamera(45, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
    viewerCamera.position.set(4, 3, 6);

    viewerControls = new OrbitControls(viewerCamera, viewerRenderer.domElement);
    viewerControls.enableDamping = true;
    viewerControls.target.set(0, 0, 0);

    viewerScene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dl = new THREE.DirectionalLight(0xffffff, 0.4);
    dl.position.set(5, 5, 5);
    viewerScene.add(dl);

    mainGroup = new THREE.Group();
    viewerScene.add(mainGroup);

    function animate() {
      requestAnimationFrame(animate);
      viewerControls.update();
      viewerRenderer.render(viewerScene, viewerCamera);
    }
    animate();
  }

  function buildViewerModelFromSkin(url) {
    if (!mainGroup) return;
    mainGroup.clear();

    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      // Assemble full Minecraft body with Architect coordinates
      mainGroup.add(createPart(img, 8, 8, 8, { x: 0, y: 0 }, { x: 0, y: 1.5, z: 0 }, { x: 32, y: 0 })); // Head
      mainGroup.add(createPart(img, 8, 12, 4, { x: 16, y: 16 }, { x: 0, y: 0.25, z: 0 }, { x: 16, y: 32 })); // Torso
      mainGroup.add(createPart(img, 4, 12, 4, { x: 40, y: 16 }, { x: -0.75, y: 0.25, z: 0 }, { x: 40, y: 32 })); // R Arm
      mainGroup.add(createPart(img, 4, 12, 4, { x: 32, y: 48 }, { x: 0.75, y: 0.25, z: 0 }, { x: 48, y: 48 })); // L Arm
      mainGroup.add(createPart(img, 4, 12, 4, { x: 0, y: 16 }, { x: -0.25, y: -1.25, z: 0 }, { x: 0, y: 32 })); // R Leg
      mainGroup.add(createPart(img, 4, 12, 4, { x: 16, y: 48 }, { x: 0.25, y: -1.25, z: 0 }, { x: 0, y: 48 })); // L Leg
    };
    img.src = url;
  }

  function openViewer(pack, startIndex = 0) {
    currentPack = pack;
    currentIndex = startIndex;
    if (viewerTitle) viewerTitle.textContent = pack.name;
    if (viewerPanel) viewerPanel.style.display = 'flex';
    initViewerRenderer();
    showSkinAt(currentIndex);
  }

  function showSkinAt(i) {
    const skin = currentPack.skins[i];
    if (skinNameEl) skinNameEl.textContent = skin.name;
    if (skinIndexEl) skinIndexEl.textContent = `${i + 1} / ${currentPack.skins.length}`;
    buildViewerModelFromSkin(skin.png);
  }

  // --- 5. EVENT LISTENERS ---
  if (prevSkinBtn) prevSkinBtn.onclick = () => {
    currentIndex = (currentIndex - 1 + currentPack.skins.length) % currentPack.skins.length;
    showSkinAt(currentIndex);
  };
  if (nextSkinBtn) nextSkinBtn.onclick = () => {
    currentIndex = (currentIndex + 1) % currentPack.skins.length;
    showSkinAt(currentIndex);
  };

  function escapeHtml(s) {
    return s ? s.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
  }

  loadSkins();
});
