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

  function freshRunState(difficulty = "normal", playerName = "") {
    return {
      order: shuffle(canonicalOrder),
      currentIndex: 0,
      drawnLines: {},
      perLineScores: {},
      perLineTiers: {},
      perLinePhrases: {},
      difficulty,
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
      if (parsed.difficulty !== "hard") parsed.difficulty = "normal";
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
  function isHardMode() { return state && state.difficulty === "hard"; }

  // Referencias al DOM
  const svg = document.getElementById("map");
  const mapWrap = document.getElementById("map-wrap");
  const lineMedallion = document.getElementById("line-medallion");
  const lineKicker = document.getElementById("line-kicker");
  const lineNameEl = document.getElementById("line-name");
  const hintTextEl = document.getElementById("hint-text");
  const anchorsToggle = document.getElementById("anchors-toggle");
  const themeColorMeta = document.getElementById("theme-color-meta");
  const progressEl = document.getElementById("progress-indicator");
  const progressDotsEl = document.getElementById("progress-dots");
  const borrarBtn = document.getElementById("borrar-btn");
  const listoBtn = document.getElementById("listo-btn");
  const verMapaBtn = document.getElementById("ver-mapa-btn");
  const aboutBtn = document.getElementById("about-btn");
  const drawPrompt = document.getElementById("draw-prompt");

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

  revealBanner?.addEventListener("pointerdown", (e) => e.stopPropagation());

  const finalSheet = document.getElementById("final-sheet");
  const flipCard = document.getElementById("flip-card");
  const globalScoreEl = document.getElementById("global-score");
  const shareVerdictEl = document.getElementById("share-verdict");
  const sharePhraseEl = document.getElementById("share-phrase");
  const shareHardSeal = document.getElementById("share-hard-seal");
  const shareMedallionsEl = document.getElementById("share-card-medallions");
  const resultsTableEl = document.getElementById("results-table");
  const compartirBtn = document.getElementById("compartir-btn");
  const descargarBtn = document.getElementById("descargar-btn");
  const jugarDeNuevoBtn = document.getElementById("jugar-de-nuevo-btn");
  const flipToBackBtn = document.getElementById("flip-to-back-btn");
  const flipToFrontBtn = document.getElementById("flip-to-front-btn");

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
  const gAnchors = d3.select("#layer-anchors");
  const gTruth = d3.select("#layer-truth");
  const gUserdraw = d3.select("#layer-userdraw");

  // Proyección D3 y Control de Zoom
  let projection = null;
  let currentZoom = 1.0;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3.5;
  const ZOOM_STEP = 1.25;

  function svgSize() {
    const rect = mapWrap.getBoundingClientRect();
    return { W: rect.width || 400, H: rect.height || 600 };
  }

  function fitProjectionToBBox(bbox, padFrac, zoom = 1.0) {
    const { W, H } = svgSize();
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const feature = {
      type: "Feature",
      geometry: { type: "MultiPoint", coordinates: [[minLon, minLat], [maxLon, maxLat]] }
    };
    const cx = W / 2;
    const cy = H / 2;
    const halfW = (W / 2) * (1 - padFrac * 2) * zoom;
    const halfH = (H / 2) * (1 - padFrac * 2) * zoom;
    return d3.geoMercator().fitExtent([[cx - halfW, cy - halfH], [cx + halfW, cy + halfH]], feature);
  }

  function updateZoomUI() {
    if (zoomLevelText) {
      zoomLevelText.textContent = `${Math.round(currentZoom * 100)}%`;
    }
    if (zoomInBtn) zoomInBtn.disabled = currentZoom >= MAX_ZOOM - 0.05;
    if (zoomOutBtn) zoomOutBtn.disabled = currentZoom <= MIN_ZOOM + 0.05;
    if (zoomResetBtn) {
      const isDefault = Math.abs(currentZoom - 1.0) < 0.02;
      zoomResetBtn.title = isDefault ? "Encuadre óptimo (100%)" : "Restablecer encuadre (100%)";
      zoomResetBtn.style.color = isDefault ? "" : "var(--cantera-rosa)";
    }
  }

  function applyZoom(newZoom) {
    currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    const meta = currentLineMeta();
    if (!meta) return;
    projection = fitProjectionToBBox(meta.bbox, PAD_FRAC_LINE, currentZoom);
    renderValle();
    renderAnchors();
    renderUserDraw();
    if (currentRevealTruth) {
      renderTruthStatic(currentRevealTruth.coords, currentRevealTruth.color);
    }
    updateZoomUI();
  }

  function zoomIn() { applyZoom(currentZoom * ZOOM_STEP); }
  function zoomOut() { applyZoom(currentZoom / ZOOM_STEP); }
  function resetZoom() { applyZoom(1.0); }

  zoomInBtn?.addEventListener("click", (e) => { e.stopPropagation(); zoomIn(); });
  zoomOutBtn?.addEventListener("click", (e) => { e.stopPropagation(); zoomOut(); });
  zoomResetBtn?.addEventListener("click", (e) => { e.stopPropagation(); resetZoom(); });

  // Soporte para rueda del ratón sobre el mapa
  mapWrap.addEventListener("wheel", (e) => {
    if (revealActive || isDrawing) return;
    e.preventDefault();
    if (e.deltaY < 0) {
      applyZoom(currentZoom * 1.12);
    } else {
      applyZoom(currentZoom / 1.12);
    }
  }, { passive: false });

  // Atajos de teclado (+, -, 0, y Enter/Espacio para avanzar turno)
  window.addEventListener("keydown", (e) => {
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

  function renderValle() {
    clearLayer(gValle);
    if (!valleGeo) return;
    const geoPath = d3.geoPath(projection);
    gValle.selectAll("path.valle-fill")
      .data(valleGeo.features)
      .enter()
      .append("path")
      .attr("class", (d) => d.properties?.kind === "urban_core" ? "urban-core-fill" : "valle-fill")
      .attr("d", geoPath);
  }

  function renderAnchors() {
    clearLayer(gAnchors);
    if (isHardMode() || !anchorsList) return;
    for (const a of anchorsList) {
      const pt = projection([a.lon, a.lat]);
      if (!pt) continue;
      const [x, y] = pt;
      gAnchors.append("circle")
        .attr("class", "anchor-dot")
        .attr("cx", x)
        .attr("cy", y)
        .attr("r", 3);
      gAnchors.append("text")
        .attr("class", "anchor-label")
        .attr("x", x + 5)
        .attr("y", y + 3)
        .text(a.name);
    }
  }

  function updateDifficultyUI() {
    const hard = isHardMode();
    document.body.dataset.difficulty = hard ? "hard" : "normal";
    themeColorMeta?.setAttribute("content", hard ? "#f4eee3" : "#fbf8f4");
    anchorsToggle.setAttribute("aria-pressed", String(hard));
    anchorsToggle.classList.toggle("active", hard);
    revealHardLabel.hidden = !hard;
    shareHardSeal.hidden = !hard;
  }

  function renderProgressDots() {
    progressDotsEl.innerHTML = "";
    const done = drawnCount();
    for (let i = 0; i < state.order.length; i++) {
      const dot = document.createElement("span");
      dot.className = "progress-dot" + (i < done ? " filled" : "");
      progressDotsEl.appendChild(dot);
    }
    progressEl.textContent = `${done} / ${canonicalOrder.length}`;
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

  // Captura de Dibujo
  let currentStrokePoints = [];
  let isDrawing = false;
  let lastCapturePx = null;

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
    if (revealActive) return;
    ev.preventDefault();
    svg.setPointerCapture(ev.pointerId);
    isDrawing = true;
    currentStrokePoints = [];
    lastCapturePx = null;
    capturePoint(ev);
  }

  function onPointerMove(ev) {
    if (!isDrawing) return;
    ev.preventDefault();
    capturePoint(ev);
  }

  function onPointerUp(ev) {
    if (!isDrawing) return;
    ev.preventDefault();
    isDrawing = false;
  }

  svg.addEventListener("pointerdown", onPointerDown, { passive: false });
  svg.addEventListener("pointermove", onPointerMove, { passive: false });
  svg.addEventListener("pointerup", onPointerUp, { passive: false });
  svg.addEventListener("pointercancel", onPointerUp, { passive: false });

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

  let promptFadeTimer = null;
  function showDrawPromptBriefly() {
    if (promptFadeTimer) clearTimeout(promptFadeTimer);
    drawPrompt.classList.remove("hidden");
    promptFadeTimer = setTimeout(() => {
      drawPrompt.classList.add("hidden");
    }, 4000);
  }

  function borrar() {
    currentStrokePoints = [];
    lastCapturePx = null;
    isDrawing = false;
    clearLayer(gUserdraw);
    updateListoState();
    updateBorrarState();
    showDrawPromptBriefly();
  }
  borrarBtn.addEventListener("click", borrar);

  // Modos de Dificultad
  let pendingDifficulty = null;

  function openConfirmModeModal(targetDiff) {
    pendingDifficulty = targetDiff;
    const label = targetDiff === "hard" ? "Modo Difícil (a ciegas)" : "Modo Normal (con referencias)";
    confirmModeBody.innerHTML = `Cambiar a <strong>${label}</strong> reiniciará tu progreso actual para mantener el juego justo.`;
    confirmModeModal.hidden = false;
    requestAnimationFrame(() => confirmModeModal.classList.add("visible"));
  }

  function closeConfirmModeModal() {
    confirmModeModal.classList.remove("visible");
    setTimeout(() => { confirmModeModal.hidden = true; pendingDifficulty = null; }, 240);
  }

  function applyDifficultyChange(targetDiff) {
    state = freshRunState(targetDiff);
    saveRunState();
    startLineTurn();
  }

  anchorsToggle.addEventListener("click", () => {
    if (revealActive) return;
    const targetDiff = isHardMode() ? "normal" : "hard";
    if (drawnCount() === 0 && currentStrokePoints.length === 0) {
      applyDifficultyChange(targetDiff);
    } else {
      openConfirmModeModal(targetDiff);
    }
  });

  confirmModeCancelBtn.addEventListener("click", closeConfirmModeModal);
  confirmModeSwitchBtn.addEventListener("click", () => {
    const diff = pendingDifficulty;
    closeConfirmModeModal();
    if (diff) applyDifficultyChange(diff);
  });

  // Reiniciar Juego y Reintentar Elemento
  function restartGame() {
    const diff = state ? state.difficulty : "normal";
    clearRunState();
    state = freshRunState(diff, "");
    currentStrokePoints = [];
    isDrawing = false;
    finalSheet.hidden = true;
    revealBanner.classList.remove("visible");
    revealActive = false;
    anchorsToggle.disabled = false;
    clearLayer(gUserdraw);
    startLineTurn();
    if (playerNameInput) playerNameInput.value = "";
    openAboutModal(true);
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
    if (drawnCount() === 0 && currentStrokePoints.length === 0 && !revealActive) {
      restartGame();
    } else {
      openConfirmResetModal();
    }
  });

  confirmResetCancelBtn?.addEventListener("click", closeConfirmResetModal);
  confirmResetCloseBtn?.addEventListener("click", closeConfirmResetModal);
  confirmResetModal?.querySelector(".modal-backdrop")?.addEventListener("click", closeConfirmResetModal);

  resetAllBtn?.addEventListener("click", () => {
    closeConfirmResetModal();
    restartGame();
  });

  // Flujo de Turnos
  let revealActive = false;
  let revealTimer = null;
  let currentRevealTruth = null;

  function startLineTurn() {
    borrar();
    clearLayer(gTruth);
    currentRevealTruth = null;
    revealBanner.classList.remove("visible");

    const meta = currentLineMeta();
    if (!meta) {
      showFinalSheet();
      return;
    }

    lineMedallion.textContent = meta.badge || meta.id.slice(0, 3).toUpperCase();
    lineMedallion.style.setProperty("--line-color", meta.color);
    lineKicker.textContent = meta.kicker || "Trazo de memoria";
    lineNameEl.textContent = meta.name;
    hintTextEl.textContent = meta.description || meta.name;

    updateDifficultyUI();
    anchorsToggle.disabled = false;
    renderProgressDots();
    verMapaBtn.disabled = drawnCount() === 0;

    currentZoom = 1.0;
    updateZoomUI();
    projection = fitProjectionToBBox(meta.bbox, PAD_FRAC_LINE, currentZoom);
    renderValle();
    renderAnchors();
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

  function showReveal(score, truthCoords, tierTitle, phrase) {
    const meta = currentLineMeta();
    currentRevealTruth = { coords: truthCoords, color: meta.color };
    renderTruthReveal(truthCoords, meta.color);

    revealTierEl.textContent = tierTitle;
    revealScoreEl.textContent = "0";
    revealPhraseEl.textContent = `"${phrase}"`;
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
      anchorsToggle.disabled = false;
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
    anchorsToggle.disabled = true;
    updateBorrarState();

    fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineId: lid, points: pointsSnapshot })
    })
      .then((r) => r.json())
      .then((data) => {
        state.drawnLines[lid] = pointsSnapshot;
        state.perLineScores[lid] = data.score;
        state.perLineTiers[lid] = data.tierTitle;
        state.perLinePhrases[lid] = data.phrase;
        saveRunState();
        showReveal(data.score, data.truth, data.tierTitle, data.phrase);
      })
      .catch((err) => {
        console.error("Error al calificar:", err);
        revealActive = false;
        anchorsToggle.disabled = false;
        updateListoState();
        updateBorrarState();
      });
  }
  listoBtn.addEventListener("click", onListo);

  function advanceTurn() {
    clearLayer(gTruth);
    revealBanner.classList.remove("visible");
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
      med.textContent = meta.badge || lid.slice(0, 3).toUpperCase();
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
      med.textContent = meta.badge || lid.slice(0, 3).toUpperCase();

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
    }).catch((e) => console.error("Error guardando sesión:", e));
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
        shareCardTitle.textContent = pName ? `Croquis de ${pName}` : "Mi Croquis de Morelia";
      }
      if (shareCardSub) {
        shareCardSub.textContent = pName
          ? `Trazado de memoria por ${pName} · Valle de Guayangareo`
          : "Memoria colectiva del Valle de Guayangareo";
      }
      if (shareCardFooterText) {
        shareCardFooterText.textContent = pName
          ? `Participante: ${pName} · Croquis Morelia`
          : "Croquis Morelia · Plataforma de Percepción Geográfica";
      }

      renderFinalMap();
      const globalScore = computeGlobalScore();
      globalScoreEl.textContent = String(globalScore);

      // Obtener veredicto y frase directamente de MORELIA_TIER_PHRASES en scoring.py
      fetch(`/api/verdict?score=${globalScore}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.tier) shareVerdictEl.textContent = data.tier;
          if (data.phrase) sharePhraseEl.textContent = `"${data.phrase}"`;
        })
        .catch((err) => {
          console.warn("No se pudo obtener veredicto del backend:", err);
        });
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

  // Exportar Ficha HD en Canvas (1080x1350)
  const SHARE_W = 1080;
  const SHARE_H = 1350;
  const FONT_FAMILY = 'Outfit, Inter, -apple-system, sans-serif';

  function drawShareCardCanvas(canvas) {
    canvas.width = SHARE_W;
    canvas.height = SHARE_H;
    const ctx = canvas.getContext("2d");
    const hard = isHardMode();

    // Fondo
    ctx.fillStyle = hard ? "#f4eee3" : "#fbf8f4";
    ctx.fillRect(0, 0, SHARE_W, SHARE_H);

    // Marco
    ctx.strokeStyle = "rgba(70, 50, 40, 0.25)";
    ctx.lineWidth = 4;
    ctx.strokeRect(32, 32, SHARE_W - 64, SHARE_H - 64);

    // Título y Subtítulo
    const pName = (state && state.playerName ? state.playerName : "").trim();
    ctx.textAlign = "center";
    ctx.fillStyle = "#211915";
    ctx.font = `800 ${pName ? '48px' : '52px'} ${FONT_FAMILY}`;
    const mainTitle = pName ? `Croquis de ${pName}` : "Mi Croquis de Morelia";
    ctx.fillText(mainTitle, SHARE_W / 2, 115);

    ctx.font = `500 24px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(33, 25, 21, 0.65)";
    const subTitle = pName 
      ? `Trazado de memoria en Morelia · Valle de Guayangareo`
      : "Memoria espacial del Valle de Guayangareo";
    ctx.fillText(subTitle, SHARE_W / 2, 155);

    // Sello modo difícil
    if (hard) {
      ctx.save();
      ctx.translate(940, 95);
      ctx.rotate(6 * Math.PI / 180);
      ctx.fillStyle = "#e63946";
      ctx.beginPath();
      ctx.roundRect(-75, -24, 150, 48, 8);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 22px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("DIFÍCIL", 0, 1);
      ctx.restore();
    }

    // Medallones de Capas
    const medY = 210, medR = 26, gap = 16;
    const totalRowW = canonicalOrder.length * (medR * 2) + (canonicalOrder.length - 1) * gap;
    let startX = SHARE_W / 2 - totalRowW / 2 + medR;

    for (const lid of canonicalOrder) {
      const meta = layersMeta[lid];
      const drawn = lid in state.perLineScores;
      const score = drawn ? state.perLineScores[lid] : 0;

      ctx.beginPath();
      ctx.arc(startX, medY, medR, 0, Math.PI * 2);
      ctx.fillStyle = drawn ? meta.color : "#d4c8be";
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = `800 18px ${FONT_FAMILY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(meta.badge || lid.slice(0, 3).toUpperCase(), startX, medY);

      startX += medR * 2 + gap;
    }

    // Mapa Canvas
    const mapLeft = 50, mapTop = 260, mapW = SHARE_W - 100, mapH = 720;
    ctx.fillStyle = hard ? "#fffdf8" : "#ffffff";
    ctx.fillRect(mapLeft, mapTop, mapW, mapH);
    ctx.strokeStyle = "rgba(70, 50, 40, 0.15)";
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
        [[mapLeft + 40, mapTop + 40], [mapLeft + mapW - 40, mapTop + mapH - 40]],
        feature
      );

      ctx.save();
      ctx.beginPath();
      ctx.rect(mapLeft, mapTop, mapW, mapH);
      ctx.clip();

      if (valleGeo) {
        const geoPath = d3.geoPath(proj, ctx);
        ctx.beginPath();
        geoPath(valleGeo);
        ctx.fillStyle = hard ? "rgba(90, 60, 40, 0.06)" : "rgba(70, 50, 40, 0.04)";
        ctx.fill();
        ctx.strokeStyle = "rgba(70, 50, 40, 0.15)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const lineGen = d3.line().x((d) => proj(d)[0]).y((d) => proj(d)[1]).context(ctx);
      for (const lid of Object.keys(state.drawnLines)) {
        ctx.beginPath();
        lineGen(state.drawnLines[lid]);
        ctx.strokeStyle = layersMeta[lid]?.color || "#c45b43";
        ctx.lineWidth = 7;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Puntaje y Veredicto
    const globalScore = computeGlobalScore();
    ctx.textAlign = "center";
    ctx.fillStyle = "#211915";
    ctx.font = `800 110px ${FONT_FAMILY}`;
    ctx.fillText(`${globalScore}`, SHARE_W / 2 - 30, 1090);

    ctx.font = `600 42px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(33, 25, 21, 0.45)";
    ctx.fillText("/100", SHARE_W / 2 + 75, 1090);

    ctx.font = `800 36px ${FONT_FAMILY}`;
    ctx.fillStyle = "#9b3c25";
    ctx.fillText(shareVerdictEl.textContent, SHARE_W / 2, 1150);

    ctx.font = `italic 500 24px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(33, 25, 21, 0.7)";
    ctx.fillText(sharePhraseEl.textContent, SHARE_W / 2, 1200);

    // Pie de foto
    ctx.font = `500 20px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(33, 25, 21, 0.45)";
    const footerText = pName
      ? `Participante: ${pName} · Croquis Morelia · Dibuja tu ciudad de memoria`
      : "Croquis Morelia · Dibuja tu ciudad de memoria";
    ctx.fillText(footerText, SHARE_W / 2, 1290);
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
    a.download = `croquis-morelia${nameSlug}-${isHardMode() ? 'dificil' : 'normal'}.png`;
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
      ? `¡Mira mi croquis de Morelia trazado de memoria por ${pName}! Saqué ${score}/100 en Croquis Morelia (${hard ? 'Modo Difícil' : 'Modo Normal'})!`
      : (hard
        ? `Dibujé los ríos y ejes de Morelia en modo difícil y saqué ${score}/100 en Croquis Morelia!`
        : `Dibujé los ríos y monumentos de Morelia de memoria y saqué ${score}/100 en Croquis Morelia!`);

    const blob = await exportCanvasBlob();
    if (blob && navigator.canShare && navigator.canShare({ files: [new File([blob], "croquis-morelia.png", { type: "image/png" })] })) {
      try {
        await navigator.share({
          title: pName ? `Croquis de Morelia de ${pName}` : "Mi Croquis de Morelia",
          text,
          files: [new File([blob], "croquis-morelia.png", { type: "image/png" })]
        });
        return;
      } catch (e) { /* cancelado */ }
    }

    if (navigator.share) {
      try { await navigator.share({ title: pName ? `Croquis de Morelia de ${pName}` : "Croquis Morelia", text }); } catch (e) { /* cancelado */ }
    } else {
      descargarBtn.click();
    }
  });

  // Pantalla Previa de Bienvenida y Modal Acerca de
  function openAboutModal(isWelcome = false) {
    if (playerNameInput) {
      if (isWelcome) {
        playerNameInput.value = "";
        if (state) state.playerName = "";
      } else {
        playerNameInput.value = (state && state.playerName) || "";
      }
    }
    if (aboutStartBtnText) {
      aboutStartBtnText.textContent = isWelcome ? "¡Comenzar a dibujar!" : "Continuar dibujando";
    }
    aboutModal.hidden = false;
    requestAnimationFrame(() => {
      aboutModal.classList.add("visible");
      if (isWelcome && playerNameInput) {
        setTimeout(() => playerNameInput.focus(), 120);
      }
    });
  }

  function closeAboutModal() {
    if (playerNameInput) {
      const raw = playerNameInput.value.trim();
      if (state) state.playerName = raw;
      saveRunState();
    }
    aboutModal.classList.remove("visible");
    setTimeout(() => { aboutModal.hidden = true; }, 240);
  }

  aboutBtn?.addEventListener("click", () => openAboutModal(false));
  aboutModal?.querySelector(".about-close-btn")?.addEventListener("click", closeAboutModal);
  aboutModal?.querySelector(".modal-backdrop")?.addEventListener("click", closeAboutModal);
  aboutStartBtn?.addEventListener("click", closeAboutModal);
  playerNameInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      closeAboutModal();
    }
  });

  // Resize Handler
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!state) return;
      if (finalSheet.hidden) {
        const meta = currentLineMeta();
        if (meta) {
          projection = fitProjectionToBBox(meta.bbox, PAD_FRAC_LINE, currentZoom);
          renderValle();
          renderAnchors();
          renderUserDraw();
          if (currentRevealTruth) {
            renderTruthStatic(currentRevealTruth.coords, currentRevealTruth.color);
          }
        }
      } else {
        renderFinalMap();
      }
    }, 150);
  });

  // Bootstrap
  async function init() {
    try {
      const [layers, anchors, valle] = await Promise.all([
        fetch("/api/layers").then((r) => r.json()),
        fetch("/api/anchors").then((r) => r.json()),
        fetch("/api/valle").then((r) => r.json())
      ]);

      layersMeta = {};
      canonicalOrder = [];
      for (const l of layers) {
        layersMeta[l.id] = l;
        canonicalOrder.push(l.id);
      }
      anchorsList = anchors;
      valleGeo = valle;

      const saved = loadRunState();
      if (saved && saved.order.length === canonicalOrder.length) {
        state = saved;
      } else {
        state = freshRunState();
      }

      if (state.finished) {
        showFinalSheet();
      } else {
        startLineTurn();
        if (drawnCount() === 0) {
          openAboutModal(true);
        }
      }
    } catch (e) {
      console.error("Error inicializando Croquis Morelia:", e);
    }
  }

  init();
})();
