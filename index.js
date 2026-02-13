import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

document.addEventListener('DOMContentLoaded', () => {
  const marketplaceEl = document.getElementById('marketplace');
  const viewerPanel = document.getElementById('viewerPanel');
  const viewerTitle = document.getElementById('viewerTitle');
  const downloadPack = document.getElementById('downloadPack');
  const canvasContainer = document.getElementById('canvas-container');
  const prevSkinBtn = document.getElementById('prevSkin');
  const nextSkinBtn = document.getElementById('nextSkin');
  const skinNameEl = document.getElementById('skinName');
  const skinIndexEl = document.getElementById('skinIndex');

  let skinpacks = [];
  let currentPack = null;
  let currentIndex = 0;

  // --- 1. RENDERER FROM ARCHITECT PRO ---
  function getMat(img, x, y, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    // Note: Architect Pro didn't use flipY = false, so we match exactly
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1, transparent: true });
  }

  function createPart(img, w, h, d, uv, pos, overlayUv) {
    const partGroup = new THREE.Group();
    // Default depth from Architect Pro
    const depth = 0.12; 

    const mats = [
        getMat(img, uv.x+d+w, uv.y+d, d, h), getMat(img, uv.x, uv.y+d, d, h),
        getMat(img, uv.x+d, uv.y, w, d), getMat(img, uv.x+d+w, uv.y, w, d),
        getMat(img, uv.x+d, uv.y+d, w, h), getMat(img, uv.x+d*2+w, uv.y+d, w, h)
    ];
    partGroup.add(new THREE.Mesh(new THREE.BoxGeometry(w/8, h/8, d/8), mats));

    if (overlayUv) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = img.width; tempCanvas.height = img.height;
        const tCtx = tempCanvas.getContext('2d');
        tCtx.drawImage(img, 0, 0);
        const data = tCtx.getImageData(overlayUv.x+d, overlayUv.y+d, w, h).data;
        for(let i=0; i<(w*h); i++) {
            if(data[i*4+3] > 10) {
                const vox = new THREE.Mesh(
                    new THREE.BoxGeometry(1/8, 1/8, depth),
                    new THREE.MeshStandardMaterial({ color: new THREE.Color(`rgb(${data[i*4]},${data[i*4+1]},${data[i*4+2]})`), roughness: 1 })
                );
                let px = i%w, py = Math.floor(i/w);
                vox.position.set((px/8)-(w/16)+0.0625, (h/16)-(py/8)-0.0625, (d/16)+(depth/2));
                partGroup.add(vox);
            }
        }
    }
    partGroup.position.set(pos.x, pos.y, pos.z);
    return partGroup;
  }

  // --- 2. DATA HANDLING ---
  async function loadSkins() {
    try {
      const res = await fetch('skins.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      skinpacks = await res.json();
      renderMarketplace(skinpacks);
    } catch (err) {
      console.error('Failed to load skins:', err);
    }
  }

  function renderMarketplace(packs) {
    if (!marketplaceEl) return;
    marketplaceEl.innerHTML = '';
    packs.forEach((pack, idx) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="preview-box" style="height:150px; background:#111"></div>
        <h3>${escapeHtml(pack.name)}</h3>
        <button class="view-btn" data-index="${idx}">View Pack</button>
      `;
      marketplaceEl.appendChild(card);
      card.querySelector('.view-btn').onclick = () => openViewer(pack);
    });
  }

  // --- 3. VIEWER ENGINE ---
  let viewerRenderer, viewerScene, viewerCamera, viewerControls, mainGroup;

  function initViewer() {
    if (viewerRenderer) return;
    viewerRenderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    viewerRenderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    canvasContainer.appendChild(viewerRenderer.domElement);

    viewerScene = new THREE.Scene();
    viewerCamera = new THREE.PerspectiveCamera(50, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
    viewerCamera.position.set(3, 2, 5);

    viewerControls = new OrbitControls(viewerCamera, viewerRenderer.domElement);
    viewerScene.add(new THREE.AmbientLight(0xffffff, 1.0));

    mainGroup = new THREE.Group();
    viewerScene.add(mainGroup);

    function animate() {
      requestAnimationFrame(animate);
      // Removed auto-rotation to let users use OrbitControls properly
      viewerControls.update();
      viewerRenderer.render(viewerScene, viewerCamera);
    }
    animate();
  }

  function buildModel(url) {
    if (!mainGroup) return;
    mainGroup.clear();
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
        // EXACT coordinate logic from Architect Pro buildModel()
        mainGroup.add(createPart(img, 8, 8, 8, {x:0, y:0}, {x:0, y:1.25, z:0}, {x:32, y:0}));
        mainGroup.add(createPart(img, 8, 12, 4, {x:16, y:16}, {x:0, y:0, z:0}, {x:16, y:32}));
        mainGroup.add(createPart(img, 4, 12, 4, {x:40, y:16}, {x:-0.75, y:0, z:0}, {x:40, y:32}));
        mainGroup.add(createPart(img, 4, 12, 4, {x:32, y:48}, {x:0.75, y:0, z:0}, {x:48, y:48}));
        mainGroup.add(createPart(img, 4, 12, 4, {x:0, y:16}, {x:-0.25, y:-1.5, z:0}, {x:0, y:32}));
        mainGroup.add(createPart(img, 4, 12, 4, {x:16, y:48}, {x:0.25, y:-1.5, z:0}, {x:0, y:48}));
    };
    img.src = url;
  }

  function openViewer(pack) {
    currentPack = pack;
    currentIndex = 0;
    viewerPanel.style.display = 'flex';
    viewerTitle.textContent = pack.name;
    if (downloadPack) downloadPack.href = pack.location;
    initViewer();
    updateSkinDisplay();
  }

  function updateSkinDisplay() {
    const skin = currentPack.skins[currentIndex];
    skinNameEl.textContent = skin.name;
    skinIndexEl.textContent = `${currentIndex + 1} / ${currentPack.skins.length}`;
    buildModel(skin.png);
  }

  if (prevSkinBtn) prevSkinBtn.onclick = () => {
    currentIndex = (currentIndex - 1 + currentPack.skins.length) % currentPack.skins.length;
    updateSkinDisplay();
  };

  if (nextSkinBtn) nextSkinBtn.onclick = () => {
    currentIndex = (currentIndex + 1) % currentPack.skins.length;
    updateSkinDisplay();
  };

  function escapeHtml(s) {
    return s ? s.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
  }

  loadSkins();
});
