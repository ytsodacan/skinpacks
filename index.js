// index.js - Cleaned and optimized for Import Maps
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
  const skinIndexEl = document.indexElement = document.getElementById('skinIndex');
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
      if (marketplaceEl) {
        marketplaceEl.innerHTML = `<div style="padding:24px;color:#f88">Error: ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  // --- 2. MARKETPLACE RENDERER ---
  function renderMarketplace(packs) {
    if (!marketplaceEl) return;
    marketplaceEl.innerHTML = '';
    
    packs.forEach((pack, packIdx) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `
        <div class="preview" style="height:160px; background:#1a1a1a; cursor:pointer"></div>
        <div style="padding:12px">
          <h3>${escapeHtml(pack.name)}</h3>
          <p style="font-size:0.9rem; color:#aaa">${escapeHtml(pack.description || '')}</p>
          <div style="display:flex; justify-content:between; align-items:center; margin-top:10px">
            <span style="font-size:0.8rem">${pack.skins ? pack.skins.length : 0} skins</span>
            <button class="btn view-btn" data-index="${packIdx}">View Pack</button>
          </div>
        </div>
      `;
      marketplaceEl.appendChild(card);

      const previewEl = card.querySelector('.preview');
      if (previewEl && pack.skins?.length) {
        createSmallPreview(previewEl, pack.skins, { autoplay: true });
      }

      card.querySelector('.view-btn').onclick = () => openViewer(pack);
    });
  }

  // --- 3. THREE.JS HELPERS ---
  function createSmallPreview(container, skins, opts = {}) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth || 200, 160);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, (container.clientWidth || 200) / 160, 0.1, 100);
    camera.position.set(0, 1.5, 3.5);

    scene.add(new THREE.AmbientLight(0xffffff, 1));
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1.8, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x444444 })
    );
    mesh.position.y = 1;
    scene.add(mesh);

    const loader = new THREE.TextureLoader();
    let idx = 0;

    const updateTexture = (i) => {
      if (!skins[i]?.png) return;
      loader.load(skins[i].png, (tex) => {
        tex.magFilter = THREE.NearestFilter; // Minecraft-style pixel art
        mesh.material.map = tex;
        mesh.material.needsUpdate = true;
      });
    };

    updateTexture(0);
    if (opts.autoplay) {
      setInterval(() => {
        idx = (idx + 1) % skins.length;
        updateTexture(idx);
      }, 2000);
    }

    function anim() {
      mesh.rotation.y += 0.01;
      renderer.render(scene, camera);
      requestAnimationFrame(anim);
    }
    anim();
  }

  // --- 4. VIEWER LOGIC ---
  let viewerRenderer, viewerScene, viewerCamera, viewerControls, mainGroup;

  function initViewerRenderer() {
    if (viewerRenderer) return;
    viewerRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    viewerRenderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    canvasContainer.appendChild(viewerRenderer.domElement);

    viewerScene = new THREE.Scene();
    viewerCamera = new THREE.PerspectiveCamera(45, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
    viewerCamera.position.set(0, 1.5, 4);

    viewerControls = new OrbitControls(viewerCamera, viewerRenderer.domElement);
    viewerControls.enableDamping = true;

    viewerScene.add(new THREE.AmbientLight(0xffffff, 1));
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
    mainGroup.clear(); // Clean previous model

    const loader = new THREE.TextureLoader();
    loader.load(url, (tex) => {
      tex.magFilter = THREE.NearestFilter;
      const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true });

      // Basic Minecraft Humanoid Shape
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mat);
      head.position.y = 2.0;
      
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.4), mat);
      body.position.y = 1.0;

      mainGroup.add(head, body);
    });
  }

  function openViewer(pack, startIndex = 0) {
    currentPack = pack;
    currentIndex = startIndex;
    if (viewerTitle) viewerTitle.textContent = pack.name;
    if (viewerPanel) viewerPanel.style.display = 'block';
    if (downloadPack) downloadPack.href = pack.location;

    initViewerRenderer();
    showSkinAt(currentIndex);
  }

  function showSkinAt(i) {
    const skin = currentPack.skins[i];
    if (skinNameEl) skinNameEl.textContent = skin.name;
    buildViewerModelFromSkin(skin.png);
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  loadSkins();
});
