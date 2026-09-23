/* ==========================================================================
   CROQUIS MORELIA - APLICACIÓN PRINCIPAL
   Vanilla JS + D3 v7 · Proyección Geográfica WGS84 · Captura Táctil
   ========================================================================== */

(function () {
  "use strict";

  // Constantes de configuración
  const PAD_FRAC_LINE = 0.22;
  const PAD_FRAC_FINAL = 0.12;
  const MIN_DRAW_METERS = 80;
  const MIN_DRAW_POINTS = 4;
  const CAPTURE_MIN_PX = 3;
  const REVEAL_DRAW_MS = 600;
  const REVEAL_SCORE_TICK_MS = 650;

  const LS_CLIENT_ID = "croquis_morelia_client_id";
  const LS_RUN_STATE = "croquis_morelia_run_state";

  // Helpers Geográficos
  function approxMeters(latA, lonA, latB, lonB) {
    const dy = (latB - latA) * 111000;
    const dx = (lonB - lonA) * 111000 * Math.cos((latA + latB) * 0.5 * Math.PI / 180);
    return Math.hypot(dx, dy);
  }

  function pathLengthMeters(coords) {
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
      total += approxMeters(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
    }
    return total;
  }

  function getClientId() {
    let id = localStorage.getItem(LS_CLIENT_ID);
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : `mor-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(LS_CLIENT_ID, id);
    }
    return id;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Estado de la Partida
  let state = null;
  let canonicalOrder = [];
  let layersMeta = {};
  let anchorsList = [];
  let valleGeo = null;
  let polMoreliaGeo = null;

  function freshRunState(difficulty = "hard", playerName = "") {
    const normalizedDiff = (difficulty === "facil") ? "facil" : "hard";
    return {
      order: shuffle(canonicalOrder),
      currentIndex: 0,
      drawnLines: {},
      perLineScores: {},
      perLineTiers: {},
      perLinePhrases: {},
      perLineStickers: {},
      difficulty: normalizedDiff,
      playerName: playerName || "",
      finished: false,
      sessionSaved: false
    };
  }

  function saveRunState() {
    localStorage.setItem(LS_RUN_STATE, JSON.stringify(state));
  }

  function loadRunState() {
    try {
      const raw = localStorage.getItem(LS_RUN_STATE);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.order)) return null;
      if (parsed.difficulty === "facil") {
        parsed.difficulty = "facil";
      } else {
        parsed.difficulty = "hard";
      }
      parsed.playerName = typeof parsed.playerName === "string" ? parsed.playerName : "";
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function clearRunState() {
    localStorage.removeItem(LS_RUN_STATE);
    localStorage.removeItem("croquis_morelia_player_name");
  }

  function currentLineId() { return state.order[state.currentIndex]; }
  function currentLineMeta() { return layersMeta[currentLineId()]; }
  function drawnCount() { return Object.keys(state.drawnLines).length; }
  function isHardMode() { return Boolean(state && (state.difficulty === "hard" || state.difficulty === "dificil")); }
  function isEasyMode() { return !isHardMode(); }

  // Referencias al DOM
  const svg = document.getElementById("map");
  const mapWrap = document.getElementById("map-wrap");
  const lineMedallion = document.getElementById("line-medallion");
  const pistaBtn = document.getElementById("pista-btn");
  const pistaBtnText = document.getElementById("pista-btn-text");
  const lineNameEl = document.getElementById("line-name");

  const drawPrompt = document.getElementById("draw-prompt");
  const drawPromptText = document.getElementById("draw-prompt-text");
  const drawPromptHint = document.getElementById("draw-prompt-hint");
  const drawPromptHintText = document.getElementById("draw-prompt-hint-text");

  function getPistaText(meta) {
    if (!meta) return "";
    const raw = meta.pista || meta.hint || meta.kicker || meta.kiker || meta.Kicker || meta.KIKER || "";
    return String(raw).trim();
  }

  function setPistaVisible(visible) {
    const meta = currentLineMeta();
    const hintStr = getPistaText(meta);

    if (visible && hintStr) {
      if (drawPromptHint && drawPromptHintText) {
        drawPromptHintText.textContent = `Pista: ${hintStr}`;
        drawPromptHint.removeAttribute("hidden");
      }
      if (drawPrompt) {
        drawPrompt.classList.add("has-pista");
        drawPrompt.classList.remove("hidden");
      }
      pistaBtn?.classList.add("active");
      pistaBtn?.setAttribute("aria-expanded", "true");
      if (pistaBtnText) pistaBtnText.textContent = "Ocultar pista";
      if (pistaBtn) pistaBtn.title = "Ocultar pista geográfica";
    } else {
      if (drawPromptHint) {
        drawPromptHint.setAttribute("hidden", "");
      }
      if (drawPrompt) {
        drawPrompt.classList.remove("has-pista");
      }
      pistaBtn?.classList.remove("active");
      pistaBtn?.setAttribute("aria-expanded", "false");
      if (pistaBtnText) pistaBtnText.textContent = "Pista";
      if (pistaBtn) pistaBtn.title = "Revelar pista geográfica";
    }
  }

  function togglePista() {
    const isHidden = drawPromptHint ? drawPromptHint.hasAttribute("hidden") : true;
    setPistaVisible(isHidden);
  }

  pistaBtn?.addEventListener("click", togglePista);
  const modeFacilBtn = document.getElementById("mode-facil-btn");
  const modeDificilBtn = document.getElementById("mode-dificil-btn");
  const anchorsToggle = document.getElementById("anchors-toggle") || modeDificilBtn;
  const themeColorMeta = document.getElementById("theme-color-meta");
  const progressEl = document.getElementById("progress-indicator");
  const progressDotsEl = document.getElementById("progress-dots");
  const borrarBtn = document.getElementById("borrar-btn");
  const listoBtn = document.getElementById("listo-btn");
  const verMapaBtn = document.getElementById("ver-mapa-btn");
  const aboutBtn = document.getElementById("about-btn");
  const anchorSizeBtn = document.getElementById("anchor-size-btn");
  const anchorSizeBadge = document.getElementById("anchor-size-badge");
  const mapToast = document.getElementById("map-toast");

  // Controles de Zoom
  const zoomControls = document.getElementById("zoom-controls");
  const zoomInBtn = document.getElementById("zoom-in-btn");
  const zoomOutBtn = document.getElementById("zoom-out-btn");
  const zoomResetBtn = document.getElementById("zoom-reset-btn");
  const zoomLevelText = document.getElementById("zoom-level-text");

  const revealBanner = document.getElementById("reveal-banner");
  const revealHardLabel = document.getElementById("reveal-hard-label");
  const revealTierEl = document.getElementById("reveal-tier");
  const revealScoreEl = document.getElementById("reveal-score");
  const revealPhraseEl = document.getElementById("reveal-phrase");
  const revealNextBtn = document.getElementById("reveal-next");
  const revealToggleBtn = document.getElementById("reveal-toggle-btn");
  const revealDockHeader = document.getElementById("reveal-dock-header");

  function resolveStickerUrl(stickerNameOrUrl) {
    if (!stickerNameOrUrl) return "";
    if (typeof MoreliaScoring !== "undefined" && typeof MoreliaScoring.getStickerUrl === "function") {
      return MoreliaScoring.getStickerUrl(stickerNameOrUrl);
    }
    const isStaticSubdir = window.location.pathname.includes("/static/") || Boolean(document.querySelector('script[src*="./scoring.js"]'));
    const base = isStaticSubdir ? "./img/stickers/" : "./static/img/stickers/";
    return base + stickerNameOrUrl;
  }

  function setStickerImage(imgEl, stickerFilename, altText) {
    if (!imgEl || !stickerFilename) return;
    imgEl.alt = altText || "Sticker de calificación";
    const primaryUrl = resolveStickerUrl(stickerFilename);
    imgEl.src = primaryUrl;
    imgEl.onerror = () => {
      if (primaryUrl.includes("./static/img/stickers/")) {
        imgEl.src = primaryUrl.replace("./static/img/stickers/", "./img/stickers/");
      } else if (primaryUrl.includes("./img/stickers/")) {
        imgEl.src = primaryUrl.replace("./img/stickers/", "./static/img/stickers/");
      }
      imgEl.onerror = null;
    };
  }

  revealBanner?.addEventListener("pointerdown", (e) => e.stopPropagation());

  function toggleRevealMinimize() {
    if (!revealBanner) return;
    const isMin = revealBanner.classList.toggle("is-minimized");
    if (revealToggleBtn) {
      revealToggleBtn.setAttribute("aria-expanded", String(!isMin));
      revealToggleBtn.title = isMin ? "Expandir puntaje" : "Minimizar / Explorar mapa completo";
    }
  }
  revealToggleBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleRevealMinimize();
  });
  revealDockHeader?.addEventListener("click", () => {
    if (revealBanner.classList.contains("is-minimized")) {
      toggleRevealMinimize();
    }
  });

  const finalSheet = document.getElementById("final-sheet");
  const flipCard = document.getElementById("flip-card");
  const globalScoreEl = document.getElementById("global-score");
  const shareVerdictEl = document.getElementById("share-verdict");
  const sharePhraseEl = document.getElementById("share-phrase");
  const shareStickerImg = document.getElementById("share-sticker-img");
  const shareHardSeal = document.getElementById("share-hard-seal");
  const shareMedallionsEl = document.getElementById("share-card-medallions");
  const resultsTableEl = document.getElementById("results-table");
  const compartirBtn = document.getElementById("compartir-btn");
  const descargarBtn = document.getElementById("descargar-btn");
  const jugarDeNuevoBtn = document.getElementById("jugar-de-nuevo-btn");
  const flipToBackBtn = document.getElementById("flip-to-back-btn");
  const flipToFrontBtn = document.getElementById("flip-to-front-btn");

  const welcomeModal = document.getElementById("welcome-modal");
  const welcomeStartBtn = document.getElementById("welcome-start-btn");
  const welcomeStartBtnText = document.getElementById("welcome-start-btn-text");
  const aboutModal = document.getElementById("about-modal");
  const playerNameInput = document.getElementById("player-name-input");
  const aboutStartBtn = document.getElementById("about-start-btn");
  const aboutStartBtnText = document.getElementById("about-start-btn-text");
  const shareCardTitle = document.getElementById("share-card-title");
  const shareCardSub = document.getElementById("share-card-sub");
  const shareCardFooterText = document.getElementById("share-card-footer-text");

  const confirmEndModal = document.getElementById("confirm-end-modal");
  const confirmEndBody = document.getElementById("confirm-end-body");
  const confirmEndContinueBtn = document.getElementById("confirm-end-continue-btn");
  const confirmEndStopBtn = document.getElementById("confirm-end-stop-btn");

  const confirmModeModal = document.getElementById("confirm-mode-modal");
  const confirmModeBody = document.getElementById("confirm-mode-body");
  const confirmModeCancelBtn = document.getElementById("confirm-mode-cancel-btn");
  const confirmModeSwitchBtn = document.getElementById("confirm-mode-switch-btn");

  const reiniciarBtn = document.getElementById("reiniciar-btn");
  const confirmResetModal = document.getElementById("confirm-reset-modal");
  const resetAllBtn = document.getElementById("reset-all-btn");
  const confirmResetCancelBtn = document.getElementById("confirm-reset-cancel-btn");
  const confirmResetCloseBtn = confirmResetModal?.querySelector(".confirm-reset-close");

  const gValle = d3.select("#layer-valle");
  const gPolMorelia = d3.select("#layer-pol-morelia");
  const gAnchors = d3.select("#layer-anchors");
  const gTruth = d3.select("#layer-truth");
  const gUserdraw = d3.select("#layer-userdraw");

  // Proyección D3, Control de Zoom y Desplazamiento (Pan)
  let projection = null;
  let currentZoom = 1.0;
  let panX = 0;
  let panY = 0;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 4.0;
  const ZOOM_STEP = 1.25;

  function svgSize() {
    const rect = mapWrap.getBoundingClientRect();
    return { W: rect.width || 400, H: rect.height || 600 };
  }

  function fitProjectionToBBox(bbox, padFrac, zoom = 1.0, pX = 0, pY = 0) {
    const { W, H } = svgSize();
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const feature = {
      type: "Feature",
      geometry: { type: "MultiPoint", coordinates: [[minLon, minLat], [maxLon, maxLat]] }
    };

    // Márgenes optimizados para que el trazado abarque el largo de la pantalla
    // sin quedar encogido ni distante ("hasta el largo de cada uno")
    const isMobile = W <= 520;
    const padX = isMobile ? 18 : Math.max(28, W * 0.05);
    const padY = isMobile ? 22 : Math.max(34, H * 0.06);

    const cx = W / 2 + pX;
    const cy = H / 2 + pY;
    const halfW = (W / 2 - padX) * zoom;
    const halfH = (H / 2 - padY) * zoom;

    return d3.geoMercator().fitExtent([[cx - halfW, cy - halfH], [cx + halfW, cy + halfH]], feature);
  }

  function applyProjectionAndRender() {
    const meta = currentLineMeta();
    if (!meta) return;
    projection = fitProjectionToBBox(meta.bbox, PAD_FRAC_LINE, currentZoom, panX, panY);
    renderValle();
    renderPolMorelia();
    renderAnchors();
    renderUserDraw();
    if (currentRevealTruth) {
      renderTruthStatic(currentRevealTruth.coords, currentRevealTruth.color);
    }
    updateZoomUI();
  }

  function updateZoomUI() {
    if (zoomLevelText) {
      zoomLevelText.textContent = `${Math.round(currentZoom * 100)}%`;
    }
    if (zoomInBtn) zoomInBtn.disabled = currentZoom >= MAX_ZOOM - 0.05;
    if (zoomOutBtn) zoomOutBtn.disabled = currentZoom <= MIN_ZOOM + 0.05;
    if (zoomResetBtn) {
      const isDefault = Math.abs(currentZoom - 1.0) < 0.02 && Math.abs(panX) < 1 && Math.abs(panY) < 1;
      zoomResetBtn.title = isDefault ? "Centrar mapa (100%)" : "Centrar y restablecer encuadre (⟲ o tecla 0)";
      zoomResetBtn.classList.toggle("is-off-center", !isDefault);
      zoomResetBtn.style.color = "";
    }
  }

  function applyZoom(newZoom) {
    currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    applyProjectionAndRender();
  }

  function zoomIn() { applyZoom(currentZoom * ZOOM_STEP); }
  function zoomOut() { applyZoom(currentZoom / ZOOM_STEP); }
  function resetZoom() {
    currentZoom = 1.0;
    panX = 0;
    panY = 0;
    applyProjectionAndRender();
  }

  zoomInBtn?.addEventListener("click", (e) => { e.stopPropagation(); zoomIn(); });
  zoomOutBtn?.addEventListener("click", (e) => { e.stopPropagation(); zoomOut(); });
  zoomResetBtn?.addEventListener("click", (e) => { e.stopPropagation(); resetZoom(); });

  const mapNorthBtn = document.getElementById("map-north");
  mapNorthBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    resetZoom();
    const svg = mapNorthBtn.querySelector(".north-arrow-svg");
    if (svg) {
      svg.style.transition = "transform 0.6s cubic-bezier(0.2, 1.6, 0.4, 1)";
      svg.style.transform = "rotate(360deg)";
      setTimeout(() => {
        svg.style.transition = "";
        svg.style.transform = "";
      }, 620);
    }
  });

  // Soporte para rueda del ratón sobre el mapa
  mapWrap.addEventListener("wheel", (e) => {
    if (isDrawing) return;
    e.preventDefault();
    if (e.deltaY < 0) {
      applyZoom(currentZoom * 1.12);
    } else {
      applyZoom(currentZoom / 1.12);
    }
  }, { passive: false });

  // Atajos de teclado (+, -, 0, Escape, y Enter/Espacio para avanzar turno)
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (aboutModal && !aboutModal.hidden) {
        closeAboutModal();
        return;
      }
    }
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    if (revealActive && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      revealNextBtn?.click();
      return;
    }
    if (e.key === "+" || e.key === "=") {
      zoomIn();
    } else if (e.key === "-" || e.key === "_") {
      zoomOut();
    } else if (e.key === "0") {
      resetZoom();
    }
  });

  function pathStringFromCoords(coords, proj) {
    if (!coords || coords.length < 2) return "";
    const lineGen = d3.line().x((d) => proj(d)[0]).y((d) => proj(d)[1]);
    return lineGen(coords);
  }

  function clearLayer(sel) { sel.selectAll("*").remove(); }

  // Normalización automática de devanado (winding) para asegurar que ningún polígono dibuje cajas globales
  function normalizeGeoJSONWinding(fc) {
    if (!fc || !Array.isArray(fc.features) || typeof d3 === "undefined" || !d3.geoArea) return fc;
    fc.features.forEach((f) => {
      if (!f || !f.geometry) return;
      if (f.geometry.type === "Polygon" && Array.isArray(f.geometry.coordinates)) {
        if (d3.geoArea(f) > 2 * Math.PI) {
          f.geometry.coordinates = f.geometry.coordinates.map((ring) => ring.slice().reverse());
        }
      } else if (f.geometry.type === "MultiPolygon" && Array.isArray(f.geometry.coordinates)) {
        f.geometry.coordinates = f.geometry.coordinates.map((poly) => {
          const tempFeat = { type: "Feature", geometry: { type: "Polygon", coordinates: poly } };
          if (d3.geoArea(tempFeat) > 2 * Math.PI) {
            return poly.map((ring) => ring.slice().reverse());
          }
          return poly;
        });
      }
    });
    return fc;
  }

  function renderValle() {
    clearLayer(gValle);
    if (!valleGeo || !projection) return;
    normalizeGeoJSONWinding(valleGeo);
    const geoPath = d3.geoPath(projection);
    gValle.selectAll("path.valle-fill")
      .data(valleGeo.features)
      .enter()
      .append("path")
      .attr("class", (d) => d.properties?.kind === "urban_core" ? "urban-core-fill" : "valle-fill")
      .attr("fill", (d) => d.properties?.kind === "urban_core" ? "rgba(196, 91, 67, 0.06)" : "rgba(70, 50, 40, 0.055)")
      .attr("stroke", (d) => d.properties?.kind === "urban_core" ? "rgba(196, 91, 67, 0.25)" : "rgba(70, 50, 40, 0.22)")
      .attr("stroke-width", "1.4")
      .attr("stroke-dasharray", "5 4")
      .attr("stroke-linecap", "round")
      .attr("stroke-linejoin", "round")
      .attr("d", geoPath);
  }

  function renderPolMorelia() {
    clearLayer(gPolMorelia);
    // En modo difícil se ocultan los 21 polígonos guía
    if (isHardMode() || !polMoreliaGeo || !projection) return;
    normalizeGeoJSONWinding(polMoreliaGeo);
    const geoPath = d3.geoPath(projection);
    gPolMorelia.selectAll("path.pol-morelia-guide")
      .data(polMoreliaGeo.features || [])
      .enter()
      .append("path")
      .attr("class", "pol-morelia-guide")
      .attr("fill", "rgba(70, 72, 75, 0.03)")
      .attr("stroke", "rgba(55, 58, 62, 0.60)")
      .attr("stroke-width", "1.45")
      .attr("stroke-dasharray", "5 4")
      .attr("stroke-linecap", "butt")
      .attr("stroke-linejoin", "miter")
      .attr("d", geoPath);
  }

  // Jerarquía y prioridad de puntos de referencia para evitar encimaderos
  const ANCHOR_PRIORITY_MAP = {
    "Catedral de Morelia": 1,
    "Las Tarascas": 2,
    "Estadio Morelos": 3,
    "Monumento": 4,
    "Zoológico": 5,
    "Deportivo Venustiano": 6,
    "Bosque Cuauhtémoc": 7,
    "Universidad Michoacana": 8,
    "Plaza Las Américas": 9,
    "El planetario": 10,
    "Tecnológico de Morelia": 11,
    "Central de Autobuses": 12,
    "Los Filtros Viejos": 13,
    "Tenencia Morelos": 14,
    "Manantial Mintzita": 15,
    "Mercado de Abastos": 16,
    "Ciudad Industrial": 17,
    "Presa de Coitzio": 18,
    "Policia y Tránsito": 19,
    "Deportivo Bicentenario": 20,
    "Panteón Municipal": 21,
    "Arboretum": 22,
    "Pabellon Don Vasco ": 23,
    "Parque de la Ciudad Industrial": 24
  };

  // Configuración de Tamaños de Texto para Puntos de Referencia
  const ANCHOR_SIZE_CONFIGS = [
    {
      level: 0,
      label: "Normal",
      shortLabel: "Normal",
      badge: "1x",
      scale: 1.0,
      fontSize: "10px",
      fontSizeMobile: "9.5px",
      strokeWidth: "3px",
      dotR: 3.2,
      dotRMobile: 2.8,
      charWidthDesktop: 5.8,
      charWidthMobile: 5.1,
      labelHeightDesktop: 14,
      labelHeightMobile: 12
    },
    {
      level: 1,
      label: "Grande (+30%)",
      shortLabel: "Grande",
      badge: "+",
      scale: 1.3,
      fontSize: "13px",
      fontSizeMobile: "12px",
      strokeWidth: "3.5px",
      dotR: 3.8,
      dotRMobile: 3.2,
      charWidthDesktop: 7.5,
      charWidthMobile: 6.6,
      labelHeightDesktop: 18,
      labelHeightMobile: 15
    },
    {
      level: 2,
      label: "Muy grande (+60%)",
      shortLabel: "Muy grande",
      badge: "++",
      scale: 1.6,
      fontSize: "16px",
      fontSizeMobile: "14.5px",
      strokeWidth: "4.2px",
      dotR: 4.4,
      dotRMobile: 3.8,
      charWidthDesktop: 9.3,
      charWidthMobile: 8.2,
      labelHeightDesktop: 22,
      labelHeightMobile: 19
    }
  ];

  const LS_ANCHOR_SIZE = "croquis_morelia_anchor_size";
  let anchorSizeLevel = 0;
  try {
    const saved = localStorage.getItem(LS_ANCHOR_SIZE);
    if (saved !== null) {
      const idx = parseInt(saved, 10);
      if (!isNaN(idx) && idx >= 0 && idx < ANCHOR_SIZE_CONFIGS.length) {
        anchorSizeLevel = idx;
      }
    }
  } catch (_) {}

  let mapToastTimer = null;
  function showMapToast(msg) {
    if (!mapToast) return;
    mapToast.textContent = msg;
    mapToast.hidden = false;
    requestAnimationFrame(() => mapToast.classList.add("visible"));
    if (mapToastTimer) clearTimeout(mapToastTimer);
    mapToastTimer = setTimeout(() => {
      mapToast.classList.remove("visible");
      setTimeout(() => { mapToast.hidden = true; }, 240);
    }, 1600);
  }

  function updateAnchorSizeUI() {
    const cfg = ANCHOR_SIZE_CONFIGS[anchorSizeLevel] || ANCHOR_SIZE_CONFIGS[0];
    const isStandard = anchorSizeLevel === 0;
    const isLarge = anchorSizeLevel === 1;
    const isXl = anchorSizeLevel === 2;

    const nextCfg = ANCHOR_SIZE_CONFIGS[(anchorSizeLevel + 1) % ANCHOR_SIZE_CONFIGS.length];
    const tip = `Tamaño de texto de referencias: ${cfg.label} (clic para cambiar a ${nextCfg.shortLabel || nextCfg.label})`;

    if (anchorSizeBtn) {
      anchorSizeBtn.title = tip;
      anchorSizeBtn.setAttribute("aria-label", tip);
      anchorSizeBtn.classList.toggle("active", !isStandard);
      anchorSizeBtn.classList.toggle("is-large", isLarge);
      anchorSizeBtn.classList.toggle("is-xl", isXl);
    }
    if (anchorSizeBadge) {
      anchorSizeBadge.textContent = cfg.badge;
    }

    const actualFontSize = (window.innerWidth <= 520) ? cfg.fontSizeMobile : cfg.fontSize;
    document.documentElement.style.setProperty("--anchor-font-size", actualFontSize);
    document.documentElement.style.setProperty("--anchor-stroke-width", cfg.strokeWidth);
  }

  function cycleAnchorSize(showNotification = true) {
    anchorSizeLevel = (anchorSizeLevel + 1) % ANCHOR_SIZE_CONFIGS.length;
    try {
      localStorage.setItem(LS_ANCHOR_SIZE, String(anchorSizeLevel));
    } catch (_) {}
    updateAnchorSizeUI();
    renderAnchors();
    if (showNotification) {
      const cfg = ANCHOR_SIZE_CONFIGS[anchorSizeLevel];
      showMapToast(`Texto de referencias: ${cfg.label}`);
    }
  }

  anchorSizeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    cycleAnchorSize(true);
  });

  function renderAnchors() {
    clearLayer(gAnchors);
    if (!anchorsList || !projection) return;

    const { W, H } = svgSize();
    const isMobile = W <= 520;
    const sizeCfg = ANCHOR_SIZE_CONFIGS[anchorSizeLevel] || ANCHOR_SIZE_CONFIGS[0];
    const charWidth = isMobile ? sizeCfg.charWidthMobile : sizeCfg.charWidthDesktop;
    const labelHeight = isMobile ? sizeCfg.labelHeightMobile : sizeCfg.labelHeightDesktop;
    const fontSize = isMobile ? sizeCfg.fontSizeMobile : sizeCfg.fontSize;
    const dotR = isMobile ? sizeCfg.dotRMobile : sizeCfg.dotR;

    const currentMeta = currentLineMeta();
    const currentLid = currentMeta ? (currentMeta.id || "").toLowerCase() : "";

    // Ordenar anclas por jerarquía e impulsar los puntos clave del elemento activo
    const sortedAnchors = anchorsList.slice().sort((a, b) => {
      let pa = ANCHOR_PRIORITY_MAP[a.name] || 99;
      let pb = ANCHOR_PRIORITY_MAP[b.name] || 99;

      if (currentLid.includes("madero")) {
        if (["Catedral de Morelia", "Monumento", "Las Tarascas", "Deportivo Venustiano"].includes(a.name)) pa -= 50;
        if (["Catedral de Morelia", "Monumento", "Las Tarascas", "Deportivo Venustiano"].includes(b.name)) pb -= 50;
      } else if (currentLid.includes("chiquito")) {
        if (["Zoológico", "El planetario", "Universidad Michoacana", "Los Filtros Viejos"].includes(a.name)) pa -= 50;
        if (["Zoológico", "El planetario", "Universidad Michoacana", "Los Filtros Viejos"].includes(b.name)) pb -= 50;
      } else if (currentLid.includes("acueducto")) {
        if (["Las Tarascas", "Bosque Cuauhtémoc", "Deportivo Venustiano", "Catedral de Morelia"].includes(a.name)) pa -= 50;
        if (["Las Tarascas", "Bosque Cuauhtémoc", "Deportivo Venustiano", "Catedral de Morelia"].includes(b.name)) pb -= 50;
      } else if (currentLid.includes("morelos")) {
        if (["Catedral de Morelia", "Estadio Morelos", "Tecnológico de Morelia"].includes(a.name)) pa -= 50;
        if (["Catedral de Morelia", "Estadio Morelos", "Tecnológico de Morelia"].includes(b.name)) pb -= 50;
      }

      return pa - pb;
    });

    const placedBoxes = [];

    function testCollision(box) {
      const gapX = isMobile ? 6 : 8;
      const gapY = 3;
      return placedBoxes.some((p) => !(
        box.x1 < p.x0 - gapX ||
        box.x0 > p.x1 + gapX ||
        box.y1 < p.y0 - gapY ||
        box.y0 > p.y1 + gapY
      ));
    }

    for (const a of sortedAnchors) {
      const pt = projection([a.lon, a.lat]);
      if (!pt) continue;
      const [x, y] = pt;

      // Omitir puntos que caigan completamente fuera de la vista
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;

      const circle = gAnchors.append("circle")
        .attr("class", "anchor-dot")
        .attr("cx", x)
        .attr("cy", y)
        .attr("r", dotR);

      circle.append("title").text(a.name);

      const name = a.name.trim();
      const approxW = name.length * charWidth + 8;

      // 4 posiciones candidatas (Derecha, Izquierda, Arriba, Abajo) adaptadas a la escala del texto
      const candRight = {
        x0: x + 4, y0: y - labelHeight * 0.7,
        x1: x + 4 + approxW, y1: y + labelHeight * 0.3,
        textX: x + 5, textY: y + Math.round(3 * sizeCfg.scale), anchor: "start"
      };
      const candLeft = {
        x0: x - 4 - approxW, y0: y - labelHeight * 0.7,
        x1: x - 4, y1: y + labelHeight * 0.3,
        textX: x - 5, textY: y + Math.round(3 * sizeCfg.scale), anchor: "end"
      };
      const candTop = {
        x0: x - approxW / 2, y0: y - labelHeight - 4,
        x1: x + approxW / 2, y1: y - 4,
        textX: x, textY: y - 5, anchor: "middle"
      };
      const candBottom = {
        x0: x - approxW / 2, y0: y + 4,
        x1: x + approxW / 2, y1: y + labelHeight + 4,
        textX: x, textY: y + Math.round(13 * sizeCfg.scale), anchor: "middle"
      };

      const candidates = x > W * 0.62
        ? [candLeft, candBottom, candTop, candRight]
        : [candRight, candLeft, candTop, candBottom];

      let chosen = null;
      for (const cand of candidates) {
        if (cand.x0 >= 4 && cand.x1 <= W - 4 && cand.y0 >= 4 && cand.y1 <= H - 4) {
          if (!testCollision(cand)) {
            chosen = cand;
            break;
          }
        }
      }

      // Si no colisiona, renderizar la etiqueta. Si colisiona, se conserva solo el punto de referencia
      if (chosen) {
        placedBoxes.push(chosen);
        gAnchors.append("text")
          .attr("class", "anchor-label")
          .attr("x", chosen.textX)
          .attr("y", chosen.textY)
          .attr("text-anchor", chosen.anchor)
          .style("font-size", fontSize)
          .style("stroke-width", sizeCfg.strokeWidth)
          .text(name);
      }
    }
  }

  function updateDifficultyUI() {
    const hard = isHardMode();
    document.body.dataset.difficulty = hard ? "hard" : "facil";
    themeColorMeta?.setAttribute("content", "#f2f5ef");

    const diffGroup = document.getElementById("difficulty-toggle-group");
    diffGroup?.classList.add("is-locked");

    if (modeFacilBtn) {
      modeFacilBtn.classList.toggle("active", !hard);
      modeFacilBtn.setAttribute("aria-pressed", String(!hard));
      modeFacilBtn.disabled = true;
      modeFacilBtn.title = !hard
        ? "Modo fácil activo (Fijado durante la prueba)"
        : "Modo fácil (Bloqueado. Para cambiar de nivel presiona Reiniciar)";
    }
    if (modeDificilBtn) {
      modeDificilBtn.classList.toggle("active", hard);
      modeDificilBtn.setAttribute("aria-pressed", String(hard));
      modeDificilBtn.disabled = true;
      modeDificilBtn.title = hard
        ? "Modo difícil activo (Fijado durante la prueba)"
        : "Modo difícil (Bloqueado. Para cambiar de nivel presiona Reiniciar)";
    }
    if (anchorsToggle && anchorsToggle !== modeDificilBtn) {
      anchorsToggle.setAttribute("aria-pressed", String(hard));
      anchorsToggle.classList.toggle("active", hard);
      anchorsToggle.disabled = true;
    }

    revealHardLabel.hidden = !hard;
    shareHardSeal.hidden = !hard;

    if (pistaBtn) {
      pistaBtn.disabled = false;
      const isHidden = drawPromptHint ? drawPromptHint.hasAttribute("hidden") : true;
      if (pistaBtnText && isHidden) {
        pistaBtnText.textContent = "Pista";
      }
      pistaBtn.title = "Revelar pista geográfica";
    }
  }

  function renderProgressDots() {
    progressDotsEl.innerHTML = "";
    const done = drawnCount();
    for (let i = 0; i < state.order.length; i++) {
      const dot = document.createElement("span");
      dot.className = "progress-dot" + (i < done ? " filled" : "");
      progressDotsEl.appendChild(dot);
    }
    progressEl.textContent = `${done} / ${state.order.length || canonicalOrder.length}`;
  }

  function renderUserDraw() {
    clearLayer(gUserdraw);
    if (currentStrokePoints.length < 2) return;
    const meta = currentLineMeta();
    gUserdraw.append("path")
      .attr("class", "userdraw-path")
      .attr("d", pathStringFromCoords(currentStrokePoints, projection))
      .attr("stroke", meta ? meta.color : "#c45b43");
  }

  function renderTruthReveal(coords, color) {
    clearLayer(gTruth);
    const d = pathStringFromCoords(coords, projection);
    const node = gTruth.append("path")
      .attr("class", "truth-path")
      .attr("stroke", color)
      .attr("d", d)
      .node();

    if (node) {
      const total = node.getTotalLength();
      node.style.strokeDasharray = `${total} ${total}`;
      node.style.strokeDashoffset = String(total);
      node.getBoundingClientRect(); // forzar reflow
      node.style.transition = `stroke-dashoffset ${REVEAL_DRAW_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
      requestAnimationFrame(() => { node.style.strokeDashoffset = "0"; });
    }
  }

  function renderTruthStatic(coords, color) {
    clearLayer(gTruth);
    gTruth.append("path")
      .attr("class", "truth-path")
      .attr("stroke", color)
      .attr("d", pathStringFromCoords(coords, projection));
  }

  // Soporte de Navegación (Pan y Multi-touch Pinch Zoom) y Captura de Dibujo
  let currentStrokePoints = [];
  let isDrawing = false;
  let lastCapturePx = null;

  let isPanning = false;
  let panStart = { x: 0, y: 0 };
  let panOffsetStart = { x: 0, y: 0 };
  let isSpacePressed = false;

  // Seguimiento de múltiples toques (pantallas táctiles)
  const activePointers = new Map();
  let touchPinchStartDist = 0;
  let touchPinchStartZoom = 1.0;
  let touchPinchStartCenter = { x: 0, y: 0 };
  let touchPinchStartPan = { x: 0, y: 0 };
  let isMultiTouch = false;

  // Detección de tecla Space para desplazamiento en escritorio
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName) && !revealActive) {
      isSpacePressed = true;
      if (!isDrawing) svg.style.cursor = "grab";
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      isSpacePressed = false;
      if (!isPanning) svg.style.cursor = revealActive ? "grab" : "crosshair";
    }
  });

  function getSvgPoint(ev) {
    const rect = svg.getBoundingClientRect();
    return [ev.clientX - rect.left, ev.clientY - rect.top];
  }

  function capturePoint(ev) {
    const [x, y] = getSvgPoint(ev);
    if (lastCapturePx) {
      const dx = x - lastCapturePx[0];
      const dy = y - lastCapturePx[1];
      if (Math.hypot(dx, dy) < CAPTURE_MIN_PX) return;
    }
    lastCapturePx = [x, y];
    const geo = projection.invert([x, y]);
    if (!geo) return;
    currentStrokePoints.push(geo);
    renderUserDraw();
    updateListoState();
    updateBorrarState();
    if (promptFadeTimer) { clearTimeout(promptFadeTimer); promptFadeTimer = null; }
    drawPrompt.classList.add("hidden");
  }

  function onPointerDown(ev) {
    activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    // 1. En modo revelado: SIEMPRE se desplaza el mapa (pan) con 1 dedo o ratón
    if (revealActive) {
      isPanning = true;
      panStart = { x: ev.clientX, y: ev.clientY };
      panOffsetStart = { x: panX, y: panY };
      svg.style.cursor = "grabbing";
      try { svg.setPointerCapture(ev.pointerId); } catch (_) {}
      return;
    }

    // 2. Multitouch táctil (2 dedos: pinch-to-zoom y pan simultáneos)
    if (activePointers.size >= 2) {
      isMultiTouch = true;
      if (isDrawing) {
        // Cancelar trazo accidental al poner el segundo dedo
        isDrawing = false;
        currentStrokePoints = [];
        lastCapturePx = null;
        renderUserDraw();
        updateListoState();
        updateBorrarState();
      }
      const pts = Array.from(activePointers.values());
      touchPinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      touchPinchStartZoom = currentZoom;
      touchPinchStartCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      touchPinchStartPan = { x: panX, y: panY };
      return;
    }

    // 3. Ratón en escritorio: desplazamiento con botón central (1), botón derecho (2) o tecla Space
    if (ev.pointerType === "mouse" && (ev.button === 1 || ev.button === 2 || isSpacePressed)) {
      ev.preventDefault();
      isPanning = true;
      panStart = { x: ev.clientX, y: ev.clientY };
      panOffsetStart = { x: panX, y: panY };
      svg.style.cursor = "grabbing";
      try { svg.setPointerCapture(ev.pointerId); } catch (_) {}
      return;
    }

    // 4. Dibujo normal con 1 dedo o clic izquierdo
    if (ev.button === 0 && !isSpacePressed) {
      ev.preventDefault();
      try { svg.setPointerCapture(ev.pointerId); } catch (_) {}
      isDrawing = true;
      currentStrokePoints = [];
      lastCapturePx = null;
      if (drawPrompt) drawPrompt.classList.add("hidden");
      capturePoint(ev);
    }
  }

  function onPointerMove(ev) {
    if (activePointers.has(ev.pointerId)) {
      activePointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    }

    // Gesto táctil de 2 dedos (Pinch-zoom y Pan)
    if (isMultiTouch && activePointers.size >= 2) {
      ev.preventDefault();
      const pts = Array.from(activePointers.values());
      const currDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const currCenter = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };

      if (touchPinchStartDist > 10) {
        const ratio = currDist / touchPinchStartDist;
        currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, touchPinchStartZoom * ratio));
      }
      panX = touchPinchStartPan.x + (currCenter.x - touchPinchStartCenter.x);
      panY = touchPinchStartPan.y + (currCenter.y - touchPinchStartCenter.y);
      applyProjectionAndRender();
      return;
    }

    // Desplazamiento (Pan) activo
    if (isPanning) {
      ev.preventDefault();
      const dx = ev.clientX - panStart.x;
      const dy = ev.clientY - panStart.y;
      panX = panOffsetStart.x + dx;
      panY = panOffsetStart.y + dy;
      applyProjectionAndRender();
      return;
    }

    // Dibujo activo
    if (isDrawing) {
      ev.preventDefault();
      capturePoint(ev);
    }
  }

  function onPointerUp(ev) {
    activePointers.delete(ev.pointerId);
    try { svg.releasePointerCapture(ev.pointerId); } catch (_) {}

    if (activePointers.size < 2) {
      isMultiTouch = false;
    }
    if (isPanning && activePointers.size === 0) {
      isPanning = false;
      svg.style.cursor = revealActive ? "grab" : (isSpacePressed ? "grab" : "crosshair");
    }
    if (isDrawing) {
      ev.preventDefault();
      isDrawing = false;
    }
  }

  svg.addEventListener("pointerdown", onPointerDown, { passive: false });
  svg.addEventListener("pointermove", onPointerMove, { passive: false });
  svg.addEventListener("pointerup", onPointerUp, { passive: false });
  svg.addEventListener("pointercancel", onPointerUp, { passive: false });
  svg.addEventListener("contextmenu", (e) => e.preventDefault());

  function updateListoState() {
    if (revealActive) return;
    const len = pathLengthMeters(currentStrokePoints);
    const ok = currentStrokePoints.length >= MIN_DRAW_POINTS && len >= MIN_DRAW_METERS;
    listoBtn.disabled = !ok;
    listoBtn.textContent = ok ? "Listo · Calificar" : "Dibuja el trazo";
  }

  function updateBorrarState() {
    const hasStroke = !revealActive && currentStrokePoints.length > 0;
    borrarBtn.disabled = !hasStroke;
    borrarBtn.classList.toggle("active", hasStroke);
  }

  function showDrawPrompt(customText = null) {
    if (customText && drawPromptText) {
      drawPromptText.textContent = customText;
    }
    if (drawPrompt) {
      drawPrompt.classList.remove("hidden");
    }
  }

  function borrar() {
    currentStrokePoints = [];
    lastCapturePx = null;
    isDrawing = false;
    clearLayer(gUserdraw);
    updateListoState();
    updateBorrarState();
    const meta = currentLineMeta();
    const activePrompt = meta ? (meta.prompt || `Traza de memoria la ubicación, forma y extensión ${meta.articulatedName || ('del ' + meta.name)}`) : "Traza sobre el mapa con el dedo o ratón";
    showDrawPrompt(activePrompt);
  }
  borrarBtn.addEventListener("click", borrar);

  // Modos de Dificultad
  // Modos de Dificultad (Fijados desde el inicio en el modal de bienvenida)
  let pendingDifficulty = null;

  function setModeTogglesDisabled(disabled) {
    if (modeFacilBtn) modeFacilBtn.disabled = true;
    if (modeDificilBtn) modeDificilBtn.disabled = true;
    if (anchorsToggle) anchorsToggle.disabled = true;
  }

  function openConfirmModeModal(targetDiff) {
    pendingDifficulty = targetDiff;
    const isTargetHard = targetDiff === "hard" || targetDiff === "dificil";
    const label = isTargetHard ? "Modo Difícil (sin polígonos guía)" : "Modo Fácil (con polígonos guía punteados)";
    confirmModeBody.innerHTML = `El nivel fue seleccionado al inicio y está <strong>bloqueado</strong> durante la prueba. Para cambiar a <strong>${label}</strong> es necesario reiniciar el croquis.<br><br>¿Deseas reiniciar ahora?`;
    confirmModeModal.hidden = false;
    requestAnimationFrame(() => confirmModeModal.classList.add("visible"));
  }

  function closeConfirmModeModal() {
    confirmModeModal.classList.remove("visible");
    setTimeout(() => { confirmModeModal.hidden = true; pendingDifficulty = null; }, 240);
  }

  function handleModeSelect(targetDiff) {
    if (revealActive) return;
    const currentDiff = isHardMode() ? "hard" : "facil";
    const wantedDiff = (targetDiff === "hard" || targetDiff === "dificil") ? "hard" : "facil";
    if (wantedDiff === currentDiff) return;
    openConfirmModeModal(wantedDiff);
  }

  const difficultyToggleGroup = document.getElementById("difficulty-toggle-group");
  difficultyToggleGroup?.addEventListener("click", (e) => {
    e.stopPropagation();
    const currentDiff = isHardMode() ? "hard" : "facil";
    const wantedDiff = currentDiff === "hard" ? "facil" : "hard";
    handleModeSelect(wantedDiff);
  });

  confirmModeCancelBtn.addEventListener("click", closeConfirmModeModal);
  confirmModeSwitchBtn.addEventListener("click", () => {
    const diff = pendingDifficulty;
    closeConfirmModeModal();
    restartGame();
    if (diff) {
      setWelcomeDifficulty(diff);
    }
  });

  // Reiniciar Juego y Reintentar Elemento
  function restartGame() {
    const diff = state ? state.difficulty : "hard";
    clearRunState();
    state = freshRunState(diff, "");
    currentStrokePoints = [];
    isDrawing = false;
    currentZoom = 1.0;
    panX = 0;
    panY = 0;
    document.body.classList.remove("reveal-active");
    svg.style.cursor = "crosshair";
    finalSheet.hidden = true;
    revealBanner.classList.remove("visible", "is-minimized");
    revealActive = false;
    clearLayer(gUserdraw);
    startLineTurn();
    if (playerNameInput) playerNameInput.value = "";
    setWelcomeDifficulty(diff);
    openWelcomeModal();
  }

  function openConfirmResetModal() {
    confirmResetModal.hidden = false;
    requestAnimationFrame(() => confirmResetModal.classList.add("visible"));
  }

  function closeConfirmResetModal() {
    confirmResetModal.classList.remove("visible");
    setTimeout(() => { confirmResetModal.hidden = true; }, 240);
  }

  reiniciarBtn?.addEventListener("click", () => {
    openConfirmResetModal();
  });

  confirmResetCancelBtn?.addEventListener("click", closeConfirmResetModal);
  confirmResetCloseBtn?.addEventListener("click", closeConfirmResetModal);
  confirmResetModal?.querySelector(".modal-backdrop")?.addEventListener("click", closeConfirmResetModal);

  resetAllBtn?.addEventListener("click", () => {
    closeConfirmResetModal();
    restartGame();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && confirmResetModal && !confirmResetModal.hidden) {
      closeConfirmResetModal();
      return;
    }
    // Tecla 'T' para alternar tamaño de texto de referencias
    if ((e.key === "t" || e.key === "T") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
      if (activeTag !== "input" && activeTag !== "textarea") {
        e.preventDefault();
        cycleAnchorSize(true);
      }
    }
  });

  // Flujo de Turnos
  let revealActive = false;
  let revealTimer = null;
  let currentRevealTruth = null;

  function startLineTurn() {
    borrar();
    clearLayer(gTruth);
    currentRevealTruth = null;
    currentZoom = 1.0;
    panX = 0;
    panY = 0;
    document.body.classList.remove("reveal-active");
    svg.style.cursor = "crosshair";
    revealBanner.classList.remove("visible", "is-minimized");

    const meta = currentLineMeta();
    if (!meta) {
      showFinalSheet();
      return;
    }

    lineMedallion.textContent = meta.badge || meta.abreviatura || meta.abrev || meta.id.slice(0, 3).toUpperCase();
    lineMedallion.style.setProperty("--line-color", meta.color);
    const hintStr = getPistaText(meta);
    if (drawPromptHintText) drawPromptHintText.textContent = `Pista: ${hintStr}`;
    setPistaVisible(false);
    if (pistaBtn) {
      pistaBtn.style.display = hintStr ? "" : "none";
    }
    lineNameEl.textContent = meta.name;

    const activePrompt = meta.prompt || `Traza de memoria la ubicación, forma y extensión ${meta.articulatedName || ('del ' + meta.name)}`;
    showDrawPrompt(activePrompt);

    updateDifficultyUI();
    setModeTogglesDisabled(false);
    renderProgressDots();
    verMapaBtn.disabled = drawnCount() === 0;

    applyProjectionAndRender();
    updateListoState();
  }

  function tickScore(el, target) {
    const t0 = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - t0) / REVEAL_SCORE_TICK_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function showReveal(score, truthCoords, tierTitle, phrase, tierSticker) {
    const meta = currentLineMeta();
    currentRevealTruth = { coords: truthCoords, color: meta.color };
    renderTruthReveal(truthCoords, meta.color);

    revealTierEl.textContent = tierTitle;
    revealScoreEl.textContent = "0";
    revealPhraseEl.textContent = `"${phrase}"`;



    document.body.classList.add("reveal-active");
    svg.style.cursor = "grab";
    revealBanner.classList.remove("is-minimized");
    revealBanner.classList.add("visible");
    tickScore(revealScoreEl, score);

    // Ajustar texto del botón según si restan capas o es la última
    const isLast = drawnCount() >= state.order.length;
    const btnTextEl = revealNextBtn.querySelector(".reveal-next-text");
    if (btnTextEl) {
      btnTextEl.textContent = isLast ? "Ver resultados finales" : "Siguiente elemento";
    } else {
      revealNextBtn.textContent = isLast ? "Ver resultados finales" : "Siguiente elemento";
    }

    const advance = () => {
      if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
      revealNextBtn.onclick = null;
      revealActive = false;
      document.body.classList.remove("reveal-active");
      svg.style.cursor = "crosshair";
      setModeTogglesDisabled(false);
      advanceTurn();
    };
    revealNextBtn.onclick = advance;
    // NOTA: Se desactiva el avance automático por petición; el usuario decide cuándo avanzar.
  }

  function onListo() {
    if (listoBtn.disabled || revealActive) return;
    const lid = currentLineId();
    const pointsSnapshot = currentStrokePoints.slice();
    listoBtn.disabled = true;
    revealActive = true;
    setModeTogglesDisabled(true);
    updateBorrarState();

    const layer = layersMeta[lid];
    const truthCoords = layer?.truthCoords || [];
    const tol = layer?.toleranceScale || 500.0;

    const finalizeScore = (data) => {
      state.drawnLines[lid] = pointsSnapshot;
      state.perLineScores[lid] = data.score;
      state.perLineTiers[lid] = data.tierTitle;
      state.perLinePhrases[lid] = data.phrase;
      if (!state.perLineStickers) state.perLineStickers = {};
      state.perLineStickers[lid] = data.tierSticker || "";
      saveRunState();
      showReveal(data.score, data.truth, data.tierTitle, data.phrase, data.tierSticker);
    };

    if (typeof MoreliaScoring !== "undefined") {
      const data = MoreliaScoring.evaluateStroke(pointsSnapshot, truthCoords, tol);
      finalizeScore(data);
    } else {
      fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lineId: lid, points: pointsSnapshot })
      })
        .then((r) => r.json())
        .then(finalizeScore)
        .catch((err) => {
          console.error("Error al calificar:", err);
          revealActive = false;
          setModeTogglesDisabled(false);
          updateListoState();
          updateBorrarState();
        });
    }
  }
  listoBtn.addEventListener("click", onListo);

  function advanceTurn() {
    clearLayer(gTruth);
    document.body.classList.remove("reveal-active");
    revealBanner.classList.remove("visible", "is-minimized");
    currentZoom = 1.0;
    panX = 0;
    panY = 0;
    svg.style.cursor = "crosshair";
    if (drawnCount() >= state.order.length) {
      showFinalSheet();
      return;
    }
    let guard = 0;
    do {
      state.currentIndex = (state.currentIndex + 1) % state.order.length;
      guard++;
    } while (state.drawnLines[currentLineId()] && guard <= state.order.length);
    saveRunState();
    startLineTurn();
  }

  function openConfirmEndModal() {
    const remaining = state.order.length - drawnCount();
    confirmEndBody.innerHTML = `Te faltan <strong>${remaining} capas</strong> por dibujar. Las que omitas contarán como cero en tu puntaje global.`;
    confirmEndModal.hidden = false;
    requestAnimationFrame(() => confirmEndModal.classList.add("visible"));
  }

  function closeConfirmEndModal() {
    confirmEndModal.classList.remove("visible");
    setTimeout(() => { confirmEndModal.hidden = true; }, 240);
  }

  verMapaBtn.addEventListener("click", () => {
    if (verMapaBtn.disabled || drawnCount() === 0) return;
    if (drawnCount() < state.order.length) {
      openConfirmEndModal();
    } else {
      showFinalSheet();
    }
  });

  confirmEndContinueBtn.addEventListener("click", closeConfirmEndModal);
  confirmEndStopBtn.addEventListener("click", () => {
    closeConfirmEndModal();
    showFinalSheet();
  });

  // Ficha Final y Resumen
  function computeGlobalScore() {
    if (!canonicalOrder.length) return 0;
    const sum = canonicalOrder.reduce((acc, lid) => acc + (Number(state.perLineScores[lid]) || 0), 0);
    return Math.round(sum / canonicalOrder.length);
  }

  function renderFinalMap() {
    const finalSvg = document.getElementById("final-map");
    while (finalSvg.firstChild) finalSvg.removeChild(finalSvg.firstChild);

    const wrap = document.getElementById("final-map-wrap");
    const rect = wrap.getBoundingClientRect();
    const W = rect.width || 380, H = rect.height || 240;
    finalSvg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const allCoords = Object.values(state.drawnLines).flat();
    if (!allCoords.length) return;

    const lons = allCoords.map((c) => c[0]);
    const lats = allCoords.map((c) => c[1]);
    const bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];

    const feature = {
      type: "Feature",
      geometry: { type: "MultiPoint", coordinates: [[bbox[0], bbox[1]], [bbox[2], bbox[3]]] }
    };
    const padX = W * PAD_FRAC_FINAL, padY = H * PAD_FRAC_FINAL;
    const finalProj = d3.geoMercator().fitExtent([[padX, padY], [W - padX, H - padY]], feature);
    const lineGen = d3.line().x((d) => finalProj(d)[0]).y((d) => finalProj(d)[1]);

    const svgNS = "http://www.w3.org/2000/svg";

    if (valleGeo) {
      const geoPath = d3.geoPath(finalProj);
      for (const feat of valleGeo.features) {
        const p = document.createElementNS(svgNS, "path");
        p.setAttribute("d", geoPath(feat));
        p.setAttribute("class", feat.properties?.kind === "urban_core" ? "urban-core-fill" : "valle-fill");
        finalSvg.appendChild(p);
      }
    }

    for (const lid of Object.keys(state.drawnLines)) {
      const p = document.createElementNS(svgNS, "path");
      p.setAttribute("d", lineGen(state.drawnLines[lid]));
      p.setAttribute("stroke", layersMeta[lid]?.color || "#c45b43");
      p.setAttribute("stroke-width", "3.5");
      p.setAttribute("fill", "none");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      finalSvg.appendChild(p);
    }
  }

  function renderShareMedallions() {
    shareMedallionsEl.innerHTML = "";
    for (const lid of canonicalOrder) {
      const meta = layersMeta[lid];
      const drawn = lid in state.perLineScores;
      const score = drawn ? Math.max(0, Math.min(100, state.perLineScores[lid])) : 0;

      const med = document.createElement("div");
      med.className = "medallion sm" + (drawn ? "" : " undrawn");
      med.style.setProperty("--line-color", meta.color);
      med.textContent = meta.badge || meta.abreviatura || meta.abrev || lid.slice(0, 3).toUpperCase();
      med.title = `${meta.name}: ${drawn ? score + ' pts' : 'Sin trazar'}`;
      shareMedallionsEl.appendChild(med);
    }
  }

  function renderResultsTable() {
    resultsTableEl.innerHTML = "";
    for (const lid of canonicalOrder) {
      const meta = layersMeta[lid];
      const drawn = lid in state.perLineScores;
      const score = drawn ? state.perLineScores[lid] : "-";
      const tier = drawn ? state.perLineTiers[lid] || "" : "Omitido";

      const row = document.createElement("div");
      row.className = "results-row" + (drawn ? "" : " undrawn");

      const med = document.createElement("div");
      med.className = "medallion sm";
      med.style.setProperty("--line-color", meta.color);
      med.textContent = meta.badge || meta.abreviatura || meta.abrev || lid.slice(0, 3).toUpperCase();

      const nameBox = document.createElement("div");
      nameBox.className = "line-label";
      nameBox.innerHTML = `<div class="line-name">${meta.name}</div><div class="kicker">${tier}</div>`;

      const scoreEl = document.createElement("div");
      scoreEl.className = "line-score";
      scoreEl.textContent = drawn ? `${score} pts` : "-";
      if (drawn) scoreEl.style.color = meta.textColor;

      row.append(med, nameBox, scoreEl);
      resultsTableEl.appendChild(row);
    }
  }

  function saveSessionToServer() {
    if (state.sessionSaved) return;
    state.sessionSaved = true;
    saveRunState();

    const sessionPayload = {
      clientId: getClientId(),
      playerName: state.playerName || "anonimo",
      difficulty: state.difficulty,
      globalScore: computeGlobalScore(),
      perLineScores: state.perLineScores,
      lines: state.drawnLines,
      timestamp: Date.now()
    };

    if (window.MoreliaDB) {
      MoreliaDB.saveSession(sessionPayload, layersMeta)
        .then(() => updateQgisBadge())
        .catch((e) => console.error("Error guardando en IndexedDB:", e));
    }

    // Persistencia opcional solo si se corre en servidor de desarrollo local (localhost / 127.0.0.1)
    const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    if (isLocalhost) {
      fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: getClientId(),
          lines: state.drawnLines,
          metadata: {
            difficulty: state.difficulty,
            playerName: state.playerName || ""
          }
        })
      }).catch(() => {});
    }
  }

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  function showFinalSheet() {
    state.finished = true;
    saveRunState();
    updateDifficultyUI();
    finalSheet.hidden = false;
    flipCard.classList.remove("flipped");

    requestAnimationFrame(() => {
      const pName = (state.playerName || "").trim();
      if (shareCardTitle) {
        if (pName) {
          const cleanName = pName.replace(/^croquis\s+(mental\s+)?de\s+/i, "").trim();
          shareCardTitle.innerHTML = `<span class="brand-kicker-title">Croquis Mental de</span><span class="brand-player-highlight">${escapeHtml(cleanName)}</span>`;
        } else {
          shareCardTitle.textContent = "Traza Morelia";
        }
      }
      if (shareCardSub) {
        shareCardSub.textContent = pName
          ? `Trazado de memoria por ${pName} · Ciudad de Morelia`
          : "Memoria territorial de la ciudad de Morelia";
      }
      if (shareCardFooterText) {
        shareCardFooterText.textContent = pName
          ? `Participante: ${pName} · Traza Morelia`
          : "Traza Morelia · IMPLAN Morelia";
      }

      renderFinalMap();
      const globalScore = computeGlobalScore();
      globalScoreEl.textContent = String(globalScore);

      // Obtener veredicto, frase y sticker directamente de MoreliaScoring
      if (typeof MoreliaScoring !== "undefined") {
        const v = MoreliaScoring.pickPhraseAndTier(globalScore);
        if (v.title) shareVerdictEl.textContent = v.title;
        if (v.phrase) sharePhraseEl.textContent = `"${v.phrase}"`;
        if (shareStickerImg && v.sticker) {
          setStickerImage(shareStickerImg, v.sticker, v.title);
          shareStickerImg.classList.remove("pop");
          void shareStickerImg.offsetWidth;
          shareStickerImg.classList.add("pop");
        }
      } else {
        fetch(`/api/verdict?score=${globalScore}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.tier) shareVerdictEl.textContent = data.tier;
            if (data.phrase) sharePhraseEl.textContent = `"${data.phrase}"`;
            if (shareStickerImg && data.sticker) {
              setStickerImage(shareStickerImg, data.sticker, data.tier);
            }
          })
          .catch(() => {});
      }
      renderShareMedallions();
      renderResultsTable();
    });
    saveSessionToServer();
  }

  flipToBackBtn.addEventListener("click", () => flipCard.classList.add("flipped"));
  flipToFrontBtn.addEventListener("click", () => flipCard.classList.remove("flipped"));

  jugarDeNuevoBtn.addEventListener("click", () => {
    restartGame();
  });

  // Exportar Ficha HD en Canvas (Tamaño Carta 8.5 x 11 in @ 150 DPI: 1275 x 1650 px)
  const SHARE_W = 1275;
  const SHARE_H = 1650;
  const FONT_FAMILY = 'Outfit, Inter, -apple-system, sans-serif';

  // Imágenes de Identidad Oficial IMPLAN Morelia para el Canvas
  const brandImplanLogo = new Image();
  brandImplanLogo.src = "./static/img/logo_implan_sin_slogan.png";

  const brandEscudoLogo = new Image();
  brandEscudoLogo.src = "./static/img/escudo_morelia_clean.png";

  const brandSigemLogo = new Image();
  brandSigemLogo.src = "./static/img/sigem_gris.png";

  const brandCenefaImg = new Image();
  brandCenefaImg.src = "./static/img/cenefa_movilidad.png";

  // Stickers precargados para la Ficha HD Canvas
  const STICKER_CANVAS_IMAGES = {
    1: new Image(),
    2: new Image(),
    3: new Image(),
    4: new Image(),
    5: new Image()
  };
  const STICKER_FILENAMES = {
    1: "nivel1_recien_llegado_a_morelia.png",
    2: "nivel2_mood_despistado.png",
    3: "nivel3_perdido_en_el_bosque_cuahutemoc.png",
    4: "nivel4_conocimiento_moreliano.png",
    5: "nivel5_gps_moreliano.png"
  };
  for (let lvl = 1; lvl <= 5; lvl++) {
    const fn = STICKER_FILENAMES[lvl];
    const sImg = STICKER_CANVAS_IMAGES[lvl];
    sImg.src = resolveStickerUrl(fn);
    sImg.onerror = () => {
      sImg.src = sImg.src.includes("./static/") ? `./img/stickers/${fn}` : `./static/img/stickers/${fn}`;
      sImg.onerror = null;
    };
  }

  function drawCanvasFbIcon(ctx, x, y, size) {
    ctx.save();
    // Círculo azul oficial #1877F2
    ctx.fillStyle = "#1877F2";
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();

    // 'f' oficial blanca
    ctx.save();
    ctx.translate(x, y);
    const s = size / 24;
    ctx.scale(s, s);
    ctx.fillStyle = "#ffffff";
    const fPath = new Path2D("M16.671 15.469l.532-3.47h-3.328v-2.25c0-.949.465-1.874 1.956-1.874h1.533V4.922s-1.374-.235-2.686-.235c-2.741 0-4.533 1.662-4.533 4.669v2.569H7.078v3.47h3.047v8.385a12.09 12.09 0 003.822 0v-8.385h2.724z");
    ctx.fill(fPath);
    ctx.restore();
    ctx.restore();
  }

  function drawCanvasIgIcon(ctx, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    const s = size / 24;
    ctx.scale(s, s);

    // Fondo degradado oficial de Instagram
    const grad = ctx.createLinearGradient(0, 24, 24, 0);
    grad.addColorStop(0, "#fdf497");
    grad.addColorStop(0.15, "#fd5949");
    grad.addColorStop(0.65, "#d6249f");
    grad.addColorStop(1, "#285AEB");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(0, 0, 24, 24, 6);
    ctx.fill();

    // Silueta de la cámara en blanco
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(3.5, 3.5, 17, 17, 4.5);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(12, 12, 4.2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(16.8, 7.2, 1.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawShareCardCanvas(canvas) {
    canvas.width = SHARE_W;
    canvas.height = SHARE_H;
    const ctx = canvas.getContext("2d");
    const hard = isHardMode();

    // Fondo (Mismo tono cálido de lienzo en ambos modos)
    ctx.fillStyle = "#f2f5ef";
    ctx.fillRect(0, 0, SHARE_W, SHARE_H);

    // Marco exterior institucional
    ctx.strokeStyle = "rgba(75, 79, 84, 0.22)";
    ctx.lineWidth = 3.5;
    ctx.strokeRect(36, 36, SHARE_W - 72, SHARE_H - 72);

    // Barra superior decorativa verde IMPLAN
    ctx.fillStyle = "#00833e";
    ctx.fillRect(36, 36, SHARE_W - 72, 8);

    // Logos institucionales IMPLAN y Morelia en la cabecera del Canvas
    let leftLogoRight = 60;
    if (brandImplanLogo.complete && brandImplanLogo.naturalWidth) {
      const iw = 155;
      const ih = (brandImplanLogo.naturalHeight / brandImplanLogo.naturalWidth) * iw;
      ctx.drawImage(brandImplanLogo, 60, 68, iw, ih);
      leftLogoRight = 60 + iw;
    } else {
      leftLogoRight = 60 + 155;
    }

    let rightLogoLeft = SHARE_W - 60;
    if (brandEscudoLogo.complete && brandEscudoLogo.naturalWidth) {
      const eh = 60;
      const ew = (brandEscudoLogo.naturalWidth / brandEscudoLogo.naturalHeight) * eh;
      const ex = SHARE_W - 60 - ew;
      ctx.drawImage(brandEscudoLogo, ex, 66, ew, eh);
      rightLogoLeft = ex;
    } else {
      rightLogoLeft = SHARE_W - 60 - 180;
    }

    // Margen seguro estricto: evita matemáticamente cualquier traslape con los logotipos
    const SAFE_GAP = 35;
    const maxSafeWidth = 2 * Math.min(
      (SHARE_W / 2) - (leftLogoRight + SAFE_GAP),
      (rightLogoLeft - SAFE_GAP) - (SHARE_W / 2)
    );

    // Título y Subtítulo con salto de línea inteligente y auto-escala
    const pName = (state && state.playerName ? state.playerName : "").trim();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    if (pName) {
      // SALTO DE LÍNEA AUTOMÁTICO:
      // Línea 1: "Croquis Mental de"
      // Línea 2: Nombre del participante en grande y resaltado
      const line1Text = "Croquis Mental de";
      let line2Text = pName.replace(/^croquis\s+(mental\s+)?de\s+/i, "").trim();

      // Ajuste dinámico de fuente para la Línea 2 (Nombre)
      let nameFontSize = 46;
      ctx.font = `800 ${nameFontSize}px ${FONT_FAMILY}`;
      while (ctx.measureText(line2Text).width > maxSafeWidth && nameFontSize > 22) {
        nameFontSize -= 2;
        ctx.font = `800 ${nameFontSize}px ${FONT_FAMILY}`;
      }

      // Si aún en 22px fuera extremadamente largo, partir el nombre en 2 líneas
      let nameLines = [line2Text];
      if (ctx.measureText(line2Text).width > maxSafeWidth) {
        const words = line2Text.split(/\s+/);
        const mid = Math.ceil(words.length / 2);
        nameLines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
      }

      // Línea 1: Prefijo
      ctx.font = `700 32px ${FONT_FAMILY}`;
      ctx.fillStyle = "#4a5056";
      ctx.fillText(line1Text, SHARE_W / 2, 92);

      // Línea 2: Nombre del participante (resaltado verde IMPLAN)
      ctx.fillStyle = "#00833e";
      if (nameLines.length === 1) {
        ctx.font = `800 ${nameFontSize}px ${FONT_FAMILY}`;
        ctx.fillText(nameLines[0], SHARE_W / 2, 136);
      } else {
        ctx.font = `800 ${Math.min(nameFontSize, 30)}px ${FONT_FAMILY}`;
        ctx.fillText(nameLines[0], SHARE_W / 2, 126);
        ctx.fillText(nameLines[1], SHARE_W / 2, 154);
      }

      // Subtítulo institucional
      ctx.font = `600 21px ${FONT_FAMILY}`;
      ctx.fillStyle = "#6d737a";
      const subTitle = "IMPLAN Morelia · Plataforma de Percepción Geográfica";
      const subY = nameLines.length === 1 ? 174 : 188;
      ctx.fillText(subTitle, SHARE_W / 2, subY);

    } else {
      // Sin participante (Anónimo): 1 sola línea centrada
      const mainTitle = "Traza Morelia";
      let titleFontSize = 52;
      ctx.font = `800 ${titleFontSize}px ${FONT_FAMILY}`;
      while (ctx.measureText(mainTitle).width > maxSafeWidth && titleFontSize > 28) {
        titleFontSize -= 2;
        ctx.font = `800 ${titleFontSize}px ${FONT_FAMILY}`;
      }

      ctx.fillStyle = "#00833e";
      ctx.fillText(mainTitle, SHARE_W / 2, 110);

      ctx.font = `600 24px ${FONT_FAMILY}`;
      ctx.fillStyle = "#4a5056";
      const subTitle = "IMPLAN Morelia · Plataforma de Percepción Geográfica";
      ctx.fillText(subTitle, SHARE_W / 2, 155);
    }

    // Contenedor y Leyenda de Capas (Insignia + Nombre completo en cuadrícula armónica)
    const mapLeft = 60, mapTop = 356, mapW = SHARE_W - 120, mapH = 820;
    const legendBoxTop = 216;
    const legendBoxH = 114;

    ctx.fillStyle = hard ? "rgba(70, 50, 40, 0.045)" : "rgba(70, 50, 40, 0.035)";
    ctx.strokeStyle = "rgba(70, 50, 40, 0.12)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(mapLeft, legendBoxTop, mapW, legendBoxH, 14);
    ctx.fill();
    ctx.stroke();

    const totalItems = canonicalOrder.length;
    const numCols = totalItems > 4 ? 4 : (totalItems || 1);
    const colW = mapW / numCols;
    const rowH = 48;
    const legendBaseY = 244;
    const badgeR = 18;

    for (let idx = 0; idx < totalItems; idx++) {
      const lid = canonicalOrder[idx];
      const meta = layersMeta[lid] || {};
      const drawn = lid in state.perLineScores;
      const col = idx % numCols;
      const row = Math.floor(idx / numCols);

      const cellX = mapLeft + col * colW + 14;
      const cellY = legendBaseY + row * rowH;

      // Medallón circular
      const cx = cellX + badgeR;
      const cy = cellY;

      ctx.beginPath();
      ctx.arc(cx, cy, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = drawn ? (meta.color || "#c45b43") : "#d4c8be";
      ctx.fill();

      // Siglas en medallón
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 15px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const badgeText = (meta.badge || meta.abreviatura || meta.abrev || lid.slice(0, 3)).toUpperCase();
      ctx.fillText(badgeText, cx, cy + 0.5);

      // Nombre de la capa
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = `600 19px ${FONT_FAMILY}`;
      ctx.fillStyle = drawn ? "rgba(33, 25, 21, 0.88)" : "rgba(33, 25, 21, 0.42)";

      const tx = cx + badgeR + 10;
      const maxTextW = colW - (badgeR * 2 + 20);
      let displayName = meta.name || lid;

      // Truncado preventivo seguro si algún nombre fuera excepcionalmente largo
      if (ctx.measureText(displayName).width > maxTextW) {
        while (displayName.length > 3 && ctx.measureText(displayName + "…").width > maxTextW) {
          displayName = displayName.slice(0, -1);
        }
        displayName += "…";
      }

      ctx.fillText(displayName, tx, cy);
    }

    // Mapa Canvas
    ctx.fillStyle = "#f2f5ef";
    ctx.fillRect(mapLeft, mapTop, mapW, mapH);
    ctx.strokeStyle = "rgba(75, 79, 84, 0.22)";
    ctx.lineWidth = 2;
    ctx.strokeRect(mapLeft, mapTop, mapW, mapH);

    const allCoords = Object.values(state.drawnLines).flat();
    if (allCoords.length) {
      const lons = allCoords.map((c) => c[0]);
      const lats = allCoords.map((c) => c[1]);
      const bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
      const feature = {
        type: "Feature",
        geometry: { type: "MultiPoint", coordinates: [[bbox[0], bbox[1]], [bbox[2], bbox[3]]] }
      };
      const proj = d3.geoMercator().fitExtent(
        [[mapLeft + 45, mapTop + 45], [mapLeft + mapW - 45, mapTop + mapH - 45]],
        feature
      );

      ctx.save();
      ctx.beginPath();
      ctx.rect(mapLeft, mapTop, mapW, mapH);
      ctx.clip();

      if (valleGeo) {
        normalizeGeoJSONWinding(valleGeo);
        const geoPath = d3.geoPath(proj, ctx);
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        geoPath(valleGeo);
        ctx.fillStyle = "rgba(70, 50, 40, 0.055)";
        ctx.fill();
        ctx.strokeStyle = "rgba(70, 50, 40, 0.22)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }

      if (!hard && polMoreliaGeo) {
        normalizeGeoJSONWinding(polMoreliaGeo);
        const geoPath = d3.geoPath(proj, ctx);
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        geoPath(polMoreliaGeo);
        ctx.fillStyle = "rgba(70, 72, 75, 0.03)";
        ctx.fill();
        ctx.strokeStyle = "rgba(55, 58, 62, 0.60)";
        ctx.lineWidth = 1.45;
        ctx.stroke();
        ctx.restore();
      }

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const lineGen = d3.line().x((d) => proj(d)[0]).y((d) => proj(d)[1]).context(ctx);
      for (const lid of Object.keys(state.drawnLines)) {
        ctx.beginPath();
        lineGen(state.drawnLines[lid]);
        ctx.strokeStyle = layersMeta[lid]?.color || "#c45b43";
        ctx.lineWidth = 8;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Sello oficial de Modo Difícil estampado sobre el lienzo cartográfico
    if (hard) {
      ctx.save();
      ctx.translate(mapLeft + mapW - 95, mapTop + 36);
      ctx.rotate(4 * Math.PI / 180);
      ctx.fillStyle = "#e63946";
      ctx.beginPath();
      ctx.roundRect(-70, -20, 140, 40, 8);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 20px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("DIFÍCIL", 0, 1);
      ctx.restore();
    }

    // Rosa de los vientos / Norte cartográfico en la tarjeta compartible
    ctx.save();
    const compassX = mapLeft + 44;
    const compassY = mapTop + 44;
    ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
    ctx.strokeStyle = "rgba(70, 50, 40, 0.18)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(compassX, compassY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = "rgba(196, 91, 67, 0.35)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(compassX, compassY, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#c45b43";
    ctx.font = `800 10.5px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", compassX, compassY - 11);

    ctx.beginPath();
    ctx.moveTo(compassX, compassY - 10);
    ctx.lineTo(compassX - 4.5, compassY + 1);
    ctx.lineTo(compassX, compassY - 1.5);
    ctx.closePath();
    ctx.fillStyle = "#c45b43";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(compassX, compassY - 10);
    ctx.lineTo(compassX + 4.5, compassY + 1);
    ctx.lineTo(compassX, compassY - 1.5);
    ctx.closePath();
    ctx.fillStyle = "#96341f";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(compassX, compassY + 11);
    ctx.lineTo(compassX - 4.5, compassY + 1);
    ctx.lineTo(compassX, compassY - 1.5);
    ctx.closePath();
    ctx.fillStyle = "#9fa89b";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(compassX, compassY + 11);
    ctx.lineTo(compassX + 4.5, compassY + 1);
    ctx.lineTo(compassX, compassY - 1.5);
    ctx.closePath();
    ctx.fillStyle = "#bcc5b8";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(compassX, compassY, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#96341f";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Hero Card de Calificación Oficial (Sticker a la izquierda y Puntaje/Veredicto a la derecha)
    const heroCardX = 60;
    const heroCardY = 1205;
    const heroCardW = SHARE_W - 120; // 1155px
    const heroCardH = 300;

    // Fondo y contorno del Hero Card
    ctx.save();
    ctx.fillStyle = hard ? "rgba(255, 253, 248, 0.96)" : "rgba(255, 255, 255, 0.98)";
    ctx.strokeStyle = "rgba(0, 131, 62, 0.28)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(heroCardX, heroCardY, heroCardW, heroCardH, 22);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Información de nivel y sticker
    const globalScore = computeGlobalScore();
    const tierInfo = typeof MoreliaScoring !== "undefined" ? MoreliaScoring.pickPhraseAndTier(globalScore) : null;
    const tierLevel = tierInfo?.level || (globalScore >= 85 ? 5 : globalScore >= 75 ? 4 : globalScore >= 50 ? 3 : globalScore >= 30 ? 2 : 1);
    const canvasSticker = STICKER_CANVAS_IMAGES[tierLevel];

    // Textos de calificación
    const verdictText = (shareVerdictEl?.textContent || tierInfo?.title || `Nivel ${tierLevel}`).trim();
    const rawPhrase = (sharePhraseEl?.textContent || tierInfo?.phrase || "").trim();
    const phraseText = rawPhrase.startsWith('"') ? rawPhrase : `"${rawPhrase}"`;

    // Medición del ancho de cada elemento para centrar armónicamente el grupo de Sticker + Calificación
    const stSize = 250;
    const clusterGap = 48;

    // 1. Medir línea de puntaje
    ctx.font = `800 120px ${FONT_FAMILY}`;
    const scoreNumW = ctx.measureText(`${globalScore}`).width;

    ctx.font = `700 46px ${FONT_FAMILY}`;
    const denW = ctx.measureText("/100").width;
    const scoreLineWidth = scoreNumW + 12 + denW;

    // 2. Medir veredicto
    let verdictFontSize = 38;
    ctx.font = `800 ${verdictFontSize}px ${FONT_FAMILY}`;
    let verdictW = ctx.measureText(verdictText).width;
    const maxAllowedTextW = 600;
    while (verdictW > maxAllowedTextW && verdictFontSize > 22) {
      verdictFontSize -= 2;
      ctx.font = `800 ${verdictFontSize}px ${FONT_FAMILY}`;
      verdictW = ctx.measureText(verdictText).width;
    }

    // 3. Medir y particionar frase si fuera extensa
    let phraseFontSize = 23;
    ctx.font = `italic 500 ${phraseFontSize}px ${FONT_FAMILY}`;
    let phraseW = ctx.measureText(phraseText).width;
    let phraseLines = [phraseText];
    if (phraseW > maxAllowedTextW) {
      const words = phraseText.split(/\s+/);
      let line1 = words[0] || "";
      let idx = 1;
      for (; idx < words.length; idx++) {
        const test = line1 + " " + words[idx];
        if (ctx.measureText(test).width <= maxAllowedTextW) {
          line1 = test;
        } else {
          break;
        }
      }
      const line2 = words.slice(idx).join(" ");
      phraseLines = line2 ? [line1, line2] : [line1];
      phraseW = Math.max(ctx.measureText(phraseLines[0]).width, phraseLines[1] ? ctx.measureText(phraseLines[1]).width : 0);
    }

    // Ancho del bloque derecho de información
    const rightBlockW = Math.max(scoreLineWidth, verdictW, phraseW);

    // Ancho total del grupo unificado (Sticker + Espacio + Bloque de Calificación)
    const totalClusterW = stSize + clusterGap + rightBlockW;

    // Centrado horizontal exacto dentro de la tarjeta
    const clusterStartX = Math.round(heroCardX + (heroCardW - totalClusterW) / 2);
    const stCenterX = clusterStartX + stSize / 2;
    const stCenterY = Math.round(heroCardY + heroCardH / 2); // 1355px
    const textStartX = clusterStartX + stSize + clusterGap;

    // 1. Dibujar Sticker Oficial centrado
    if (canvasSticker && canvasSticker.complete && canvasSticker.naturalWidth) {
      ctx.save();
      ctx.translate(stCenterX, stCenterY);
      ctx.rotate(-2.5 * Math.PI / 180);
      ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 10;
      ctx.drawImage(canvasSticker, -stSize / 2, -stSize / 2, stSize, stSize);
      ctx.restore();
    }

    // 2. Dibujar Bloque de Calificación al mismo nivel vertical
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";

    const hasTwoPhraseLines = phraseLines.length > 1;
    const scoreBaseY = hasTwoPhraseLines ? 1318 : 1330;
    const verdictBaseY = hasTwoPhraseLines ? 1368 : 1380;
    const phraseBaseY = hasTwoPhraseLines ? 1410 : 1424;

    // Puntaje numérico y denominador /100
    ctx.fillStyle = "#34383c";
    ctx.font = `800 120px ${FONT_FAMILY}`;
    ctx.fillText(`${globalScore}`, textStartX, scoreBaseY);

    ctx.font = `700 46px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(75, 79, 84, 0.45)";
    ctx.fillText("/100", textStartX + scoreNumW + 12, scoreBaseY);

    // Veredicto del nivel
    ctx.fillStyle = "#00833e";
    ctx.font = `800 ${verdictFontSize}px ${FONT_FAMILY}`;
    ctx.fillText(verdictText, textStartX, verdictBaseY);

    // Frase evaluativa personalizada
    ctx.fillStyle = "rgba(75, 79, 84, 0.85)";
    ctx.font = `italic 500 ${phraseFontSize}px ${FONT_FAMILY}`;
    ctx.fillText(phraseLines[0], textStartX, phraseBaseY);
    if (hasTwoPhraseLines) {
      ctx.fillText(phraseLines[1], textStartX, phraseBaseY + 32);
    }

    // Cenefa institucional de movilidad sustentable
    const cenefaY = 1530;
    const cenefaH = 26;
    if (brandCenefaImg.complete && brandCenefaImg.naturalWidth) {
      ctx.drawImage(brandCenefaImg, 50, cenefaY, SHARE_W - 100, cenefaH);
    }

    // Pie de página institucional
    ctx.font = `600 21px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(75, 79, 84, 0.70)";
    ctx.textAlign = "center";
    const footerText = pName
      ? `Participante: ${pName} · IMPLAN Morelia · www.implanmorelia.org`
      : "IMPLAN Morelia · Instituto Municipal de Planeación · www.implanmorelia.org";
    ctx.fillText(footerText, SHARE_W / 2, 1588);
  }

  async function exportCanvasBlob() {
    const canvas = document.createElement("canvas");
    drawShareCardCanvas(canvas);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  descargarBtn.addEventListener("click", async () => {
    const blob = await exportCanvasBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const pName = (state && state.playerName ? state.playerName : "").trim();
    const nameSlug = pName ? `-${pName.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : '';
    a.download = `croquis-mental-morelia${nameSlug}-${isHardMode() ? 'dificil' : 'facil'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  compartirBtn.addEventListener("click", async () => {
    const score = computeGlobalScore();
    const hard = isHardMode();
    const pName = (state && state.playerName ? state.playerName : "").trim();
    const text = pName
      ? `¡Mira mi croquis mental de Morelia trazado de memoria por ${pName}! Saqué ${score}/100 en Mi Croquis Mental de Morelia (${hard ? 'Modo Difícil' : 'Modo Fácil'})!`
      : (hard
        ? `Dibujé los ríos y ejes de Morelia en modo difícil y saqué ${score}/100 en Mi Croquis Mental de Morelia!`
        : `Dibujé los monumentos y ríos de Morelia en modo fácil y saqué ${score}/100 en Mi Croquis Mental de Morelia!`);

    const blob = await exportCanvasBlob();
    if (blob && navigator.canShare && navigator.canShare({ files: [new File([blob], "croquis-mental-morelia.png", { type: "image/png" })] })) {
      try {
        await navigator.share({
          title: pName ? `Croquis Mental de Morelia de ${pName}` : "Mi Croquis Mental de Morelia",
          text,
          files: [new File([blob], "croquis-mental-morelia.png", { type: "image/png" })]
        });
        return;
      } catch (e) { /* cancelado */ }
    }

    if (navigator.share) {
      try { await navigator.share({ title: pName ? `Croquis Mental de Morelia de ${pName}` : "Mi Croquis Mental de Morelia", text }); } catch (e) { /* cancelado */ }
    } else {
      descargarBtn.click();
    }
  });

  // Pantalla Previa de Bienvenida (Captura de Nombre y Modo de Dificultad Inicial)
  const welcomeModeFacilBtn = document.getElementById("welcome-mode-facil-btn");
  const welcomeModeDificilBtn = document.getElementById("welcome-mode-dificil-btn");
  let selectedWelcomeDifficulty = "hard";

  function setWelcomeDifficulty(diff) {
    selectedWelcomeDifficulty = (diff === "facil") ? "facil" : "hard";
    const isHard = selectedWelcomeDifficulty === "hard";
    if (welcomeModeFacilBtn) {
      welcomeModeFacilBtn.classList.toggle("active", !isHard);
      welcomeModeFacilBtn.setAttribute("aria-checked", String(!isHard));
    }
    if (welcomeModeDificilBtn) {
      welcomeModeDificilBtn.classList.toggle("active", isHard);
      welcomeModeDificilBtn.setAttribute("aria-checked", String(isHard));
    }
  }

  welcomeModeFacilBtn?.addEventListener("click", () => setWelcomeDifficulty("facil"));
  welcomeModeDificilBtn?.addEventListener("click", () => setWelcomeDifficulty("hard"));

  function updateNameValidation() {
    const val = playerNameInput ? playerNameInput.value.trim() : "";
    const nameGroup = document.getElementById("welcome-name-group");
    const nameHint = document.getElementById("welcome-name-hint");

    if (val.length > 0) {
      nameGroup?.classList.remove("has-error");
      if (nameHint) {
        nameHint.textContent = "Se incluirá como autor en tu croquis mental a la hora de la descarga.";
        nameHint.classList.remove("has-error");
      }
      if (welcomeStartBtn) {
        welcomeStartBtn.disabled = false;
        if (welcomeStartBtnText) {
          welcomeStartBtnText.textContent = "¡Comenzar a dibujar!";
        }
      }
    } else {
      if (welcomeStartBtn) {
        welcomeStartBtn.disabled = true;
        if (welcomeStartBtnText) {
          welcomeStartBtnText.textContent = "Ingresa tu nombre para comenzar";
        }
      }
    }
  }

  function openWelcomeModal() {
    if (playerNameInput) {
      playerNameInput.value = (state && state.playerName) || "";
    }
    setWelcomeDifficulty((state && state.difficulty) || "hard");
    updateNameValidation();
    if (welcomeModal) {
      welcomeModal.hidden = false;
      requestAnimationFrame(() => {
        welcomeModal.classList.add("visible");
        if (playerNameInput) {
          setTimeout(() => playerNameInput.focus(), 120);
        }
      });
    }
  }

  function tryCloseWelcomeModal() {
    const nameGroup = document.getElementById("welcome-name-group");
    const nameHint = document.getElementById("welcome-name-hint");
    const val = playerNameInput ? playerNameInput.value.trim() : "";

    if (!val) {
      nameGroup?.classList.add("has-error");
      if (nameHint) {
        nameHint.textContent = "⚠️ Por favor ingresa tu nombre o apodo para comenzar.";
        nameHint.classList.add("has-error");
      }
      playerNameInput?.focus();
      return false;
    }

    const normalizedDiff = (selectedWelcomeDifficulty === "facil") ? "facil" : "hard";
    if (state) {
      state.playerName = val;
      state.difficulty = normalizedDiff;
    }
    saveRunState();
    updateDifficultyUI();
    applyProjectionAndRender();

    if (welcomeModal) {
      welcomeModal.classList.remove("visible");
      setTimeout(() => { welcomeModal.hidden = true; }, 240);
    }
    return true;
  }

  // Modal de Información e Instrucciones (Botón (i) en la barra superior)
  function initInstructionTabs() {
    if (aboutModal?._tabsInitialized) return;
    const tabBtns = aboutModal?.querySelectorAll(".instruction-tab-btn");
    const panels = aboutModal?.querySelectorAll(".instruction-panel");
    if (!tabBtns || !panels) return;
    aboutModal._tabsInitialized = true;

    tabBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const targetId = btn.getAttribute("data-tab-target");
        tabBtns.forEach((b) => {
          const isActive = b === btn;
          b.classList.toggle("active", isActive);
          b.setAttribute("aria-selected", String(isActive));
        });
        panels.forEach((p) => {
          const isActive = p.id === targetId;
          p.classList.toggle("active", isActive);
          p.hidden = !isActive;
        });
      });
    });
  }

  function openAboutModal() {
    initInstructionTabs();
    updateQgisBadge();
    if (aboutModal) {
      aboutModal.hidden = false;
      requestAnimationFrame(() => {
        aboutModal.classList.add("visible");
      });
    }
  }

  function closeAboutModal() {
    if (aboutModal) {
      aboutModal.classList.remove("visible");
      setTimeout(() => { aboutModal.hidden = true; }, 240);
    }
  }

  aboutBtn?.addEventListener("click", openAboutModal);
  aboutModal?.querySelector(".about-close-btn")?.addEventListener("click", closeAboutModal);
  aboutModal?.querySelector(".modal-backdrop")?.addEventListener("click", closeAboutModal);
  aboutStartBtn?.addEventListener("click", closeAboutModal);

  welcomeStartBtn?.addEventListener("click", () => tryCloseWelcomeModal());
  welcomeModal?.querySelector(".modal-backdrop")?.addEventListener("click", () => {
    if (!state?.playerName) {
      const nameGroup = document.getElementById("welcome-name-group");
      const nameHint = document.getElementById("welcome-name-hint");
      nameGroup?.classList.add("has-error");
      if (nameHint) {
        nameHint.textContent = "⚠️ Por favor ingresa tu nombre o apodo para comenzar.";
        nameHint.classList.add("has-error");
      }
      playerNameInput?.focus();
    } else {
      tryCloseWelcomeModal();
    }
  });

  playerNameInput?.addEventListener("input", updateNameValidation);
  playerNameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      tryCloseWelcomeModal();
    }
  });

  // Panel de Datos e Investigación QGIS (IndexedDB)
  const qgisModalCount = document.getElementById("qgis-modal-count");
  const exportarQgisBtn = document.getElementById("exportar-qgis-btn");
  const exportarJsonBtn = document.getElementById("exportar-json-btn");
  const limpiarQgisBtn = document.getElementById("limpiar-qgis-btn");
  const descargarGeojsonBtn = document.getElementById("descargar-geojson-btn");

  async function updateQgisBadge() {
    if (!window.MoreliaDB) return;
    try {
      const count = await MoreliaDB.getSessionCount();
      if (qgisModalCount) qgisModalCount.textContent = String(count);
    } catch (e) {
      console.warn("No se pudo leer conteo de IndexedDB:", e);
    }
  }

  exportarQgisBtn?.addEventListener("click", async () => {
    if (window.MoreliaDB) {
      await MoreliaDB.exportConsolidatedGeoJSON();
    }
  });

  exportarJsonBtn?.addEventListener("click", async () => {
    if (window.MoreliaDB) {
      await MoreliaDB.exportSessionsJSON();
    }
  });

  limpiarQgisBtn?.addEventListener("click", async () => {
    const ok = confirm("¿Estás seguro de vaciar la base de datos de croquis en este navegador? Asegúrate de haber descargado el archivo GeoJSON consolidado primero.");
    if (ok && window.MoreliaDB) {
      await MoreliaDB.clearAllSessions();
      updateQgisBadge();
      alert("Base de datos local vaciada con éxito.");
    }
  });

  descargarGeojsonBtn?.addEventListener("click", () => {
    if (!state || !state.drawnLines || !window.MoreliaDB) return;
    const sessionData = {
      playerName: state.playerName || "anonimo",
      difficulty: state.difficulty,
      globalScore: computeGlobalScore(),
      perLineScores: state.perLineScores,
      lines: state.drawnLines,
      clientId: getClientId()
    };
    MoreliaDB.exportIndividualGeoJSON(sessionData, layersMeta);
  });

  // Resize Handler
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!state) return;
      if (finalSheet.hidden) {
        applyProjectionAndRender();
      } else {
        renderFinalMap();
      }
    }, 150);
  });

  // Bootstrap
  async function init() {
    try {
      let layers = [];
      let anchors = [];
      let valle = null;
      let polMorelia = null;

      // 1. PRIORIDAD EN SERVIDOR (HTTP/HTTPS): Cargar directamente data/lineas_morelia.geojson sin caché para reflejar cambios en tiempo real
      let loadedLive = false;
      if (window.location.protocol.startsWith("http")) {
        try {
          const basePath = window.location.pathname.endsWith('.html')
            ? window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1)
            : window.location.pathname;
          const cleanBase = basePath.endsWith('/') ? basePath : (basePath + '/');
          const cacheBust = `?t=${Date.now()}`;

          const [layersGeo, anchorsGeo, valleData, polMoreliaData] = await Promise.all([
            fetch(cleanBase + "data/lineas_morelia.geojson" + cacheBust, { cache: "no-store" }).then(r => {
              if (!r.ok) throw new Error("Status " + r.status);
              return r.json();
            }),
            fetch(cleanBase + "data/morelia_anchors.geojson" + cacheBust, { cache: "no-store" }).then(r => r.json()).catch(() => null),
            fetch(cleanBase + "data/cd_morelia_pol.geojson" + cacheBust, { cache: "no-store" })
              .then(r => r.json())
              .catch(() => fetch(cleanBase + "data/morelia_valle.geojson" + cacheBust, { cache: "no-store" }).then(r => r.json()))
              .catch(() => null),
            fetch(cleanBase + "data/pol_morelia.geojson" + cacheBust, { cache: "no-store" }).then(r => r.json()).catch(() => null)
          ]);

          if (layersGeo && typeof MoreliaScoring !== "undefined") {
            layers = MoreliaScoring.parseMoreliaLayers(layersGeo);
            if (anchorsGeo) anchors = MoreliaScoring.parseMoreliaAnchors(anchorsGeo);
            valle = valleData;
            polMorelia = polMoreliaData;
            loadedLive = true;
          }
        } catch (fetchErr) {
          // Intentar API backend FastAPI /api/layers
          try {
            const [apiLayers, apiAnchors, apiValle, apiPolMorelia] = await Promise.all([
              fetch("/api/layers?t=" + Date.now()).then(r => r.json()),
              fetch("/api/anchors?t=" + Date.now()).then(r => r.json()).catch(() => []),
              fetch("/api/valle?t=" + Date.now()).then(r => r.json()).catch(() => null),
              fetch("/api/pol_morelia?t=" + Date.now()).then(r => r.json()).catch(() => null)
            ]);
            if (apiLayers && apiLayers.length > 0) {
              layers = apiLayers;
              anchors = apiAnchors || [];
              valle = apiValle;
              polMorelia = apiPolMorelia;
              loadedLive = true;
            }
          } catch (_) {}
        }
      }

      // 2. Fallback offline o protocolo file://
      if (!loadedLive && typeof window.MORELIA_DATA !== "undefined" && window.MORELIA_DATA.lineas) {
        if (typeof MoreliaScoring !== "undefined") {
          layers = MoreliaScoring.parseMoreliaLayers(window.MORELIA_DATA.lineas);
          anchors = MoreliaScoring.parseMoreliaAnchors(window.MORELIA_DATA.anchors);
        }
        valle = window.MORELIA_DATA.valle;
        polMorelia = window.MORELIA_DATA.pol_morelia;
      }

      if (!polMorelia) {
        try {
          polMorelia = await fetch("./data/pol_morelia.geojson").then(r => r.json()).catch(() => null);
        } catch (_) {}
      }

      layersMeta = {};
      canonicalOrder = [];
      for (const l of layers) {
        layersMeta[l.id] = l;
        canonicalOrder.push(l.id);
      }
      anchorsList = anchors;
      valleGeo = valle;
      polMoreliaGeo = polMorelia;

      const saved = loadRunState();
      if (saved && saved.order.length === canonicalOrder.length) {
        state = saved;
      } else {
        state = freshRunState("hard");
      }

      initInstructionTabs();
      updateAnchorSizeUI();
      if (state.finished) {
        showFinalSheet();
      } else {
        startLineTurn();
        if (drawnCount() === 0 || !state.playerName) {
          openWelcomeModal();
        }
      }
      updateQgisBadge();
    } catch (e) {
      console.error("Error inicializando Croquis Morelia:", e);
    }
  }

  // Sincronización en vivo con QGIS: detecta si se guardó lineas_morelia.geojson al cambiar a la ventana
  let lastGeoJsonModified = null;
  async function checkForQgisUpdates() {
    if (!window.location.protocol.startsWith("http")) return;
    try {
      const basePath = window.location.pathname.endsWith('.html')
        ? window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1)
        : window.location.pathname;
      const cleanBase = basePath.endsWith('/') ? basePath : (basePath + '/');
      const res = await fetch(cleanBase + "data/lineas_morelia.geojson?_h=" + Date.now(), { method: "HEAD" });
      if (!res.ok) return;
      const modified = res.headers.get("Last-Modified") || res.headers.get("ETag");
      if (!modified) return;
      if (lastGeoJsonModified && lastGeoJsonModified !== modified) {
        lastGeoJsonModified = modified;
        const freshGeo = await fetch(cleanBase + "data/lineas_morelia.geojson?t=" + Date.now(), { cache: "no-store" }).then(r => r.json());
        if (freshGeo && typeof MoreliaScoring !== "undefined") {
          const freshLayers = MoreliaScoring.parseMoreliaLayers(freshGeo);
          freshLayers.forEach(fl => {
            if (layersMeta[fl.id]) {
              Object.assign(layersMeta[fl.id], fl);
            }
          });
          const curr = currentLineMeta();
          if (curr) {
            if (lineMedallion) lineMedallion.textContent = curr.badge || curr.abreviatura || curr.id.slice(0, 3).toUpperCase();
            const hintStr = getPistaText(curr);
            if (drawPromptHintText) drawPromptHintText.textContent = `Pista: ${hintStr}`;
            if (pistaBtn) pistaBtn.style.display = hintStr ? "" : "none";
          }
          console.log("✓ Sincronizado en tiempo real con lineas_morelia.geojson editado desde QGIS");
        }
      } else {
        lastGeoJsonModified = modified;
      }
    } catch (_) {}
  }

  window.addEventListener("focus", checkForQgisUpdates);
  window.recargarCapasQgis = checkForQgisUpdates;

  init();
})();
