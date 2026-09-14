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
  const pistaBtn = document.getElementById("pista-btn");
  const pistaBtnText = document.getElementById("pista-btn-text");
  const lineNameEl = document.getElementById("line-name");

  function setPistaVisible(visible) {
    if (!lineKicker) return;
    if (visible) {
      lineKicker.removeAttribute("hidden");
      pistaBtn?.classList.add("active");
      pistaBtn?.setAttribute("aria-expanded", "true");
      if (pistaBtnText) pistaBtnText.textContent = "Ocultar pista";
      if (pistaBtn) pistaBtn.title = "Ocultar pista geográfica";
    } else {
      lineKicker.setAttribute("hidden", "");
      pistaBtn?.classList.remove("active");
      pistaBtn?.setAttribute("aria-expanded", "false");
      if (pistaBtnText) pistaBtnText.textContent = "Pista";
      if (pistaBtn) pistaBtn.title = "Revelar pista geográfica";
    }
  }

  function togglePista() {
    if (isHardMode()) return;
    const isHidden = lineKicker ? lineKicker.hasAttribute("hidden") : true;
    setPistaVisible(isHidden);
  }

  pistaBtn?.addEventListener("click", togglePista);
  const anchorsToggle = document.getElementById("anchors-toggle");
  const themeColorMeta = document.getElementById("theme-color-meta");
  const progressEl = document.getElementById("progress-indicator");
  const progressDotsEl = document.getElementById("progress-dots");
  const borrarBtn = document.getElementById("borrar-btn");
  const listoBtn = document.getElementById("listo-btn");
  const verMapaBtn = document.getElementById("ver-mapa-btn");
  const aboutBtn = document.getElementById("about-btn");
  const drawPrompt = document.getElementById("draw-prompt");
  const drawPromptText = document.getElementById("draw-prompt-text");

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
    themeColorMeta?.setAttribute("content", hard ? "#f2f5ef" : "#00833e");
    anchorsToggle.setAttribute("aria-pressed", String(hard));
    anchorsToggle.classList.toggle("active", hard);
    revealHardLabel.hidden = !hard;
    shareHardSeal.hidden = !hard;

    if (pistaBtn) {
      pistaBtn.disabled = hard;
      if (hard) {
        setPistaVisible(false);
        if (pistaBtnText) pistaBtnText.textContent = "Sin pistas";
        pistaBtn.title = "Pistas desactivadas en Modo Difícil";
      } else {
        if (pistaBtnText && (!lineKicker || lineKicker.hasAttribute("hidden"))) {
          pistaBtnText.textContent = "Pista";
        }
        pistaBtn.title = "Revelar pista geográfica";
      }
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
    if (drawPrompt) {
      drawPrompt.classList.add("hidden");
    }
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
    setPistaVisible(false);
    if (pistaBtn) {
      pistaBtn.style.display = meta.kicker ? "" : "none";
    }
    lineNameEl.textContent = meta.name;

    const activePrompt = meta.prompt || `Traza de memoria la ubicación, forma y extensión ${meta.articulatedName || ('del ' + meta.name)}`;
    showDrawPrompt(activePrompt);

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

    const layer = layersMeta[lid];
    const truthCoords = layer?.truthCoords || [];
    const tol = layer?.toleranceScale || 500.0;

    const finalizeScore = (data) => {
      state.drawnLines[lid] = pointsSnapshot;
      state.perLineScores[lid] = data.score;
      state.perLineTiers[lid] = data.tierTitle;
      state.perLinePhrases[lid] = data.phrase;
      saveRunState();
      showReveal(data.score, data.truth, data.tierTitle, data.phrase);
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
          anchorsToggle.disabled = false;
          updateListoState();
          updateBorrarState();
        });
    }
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

      // Obtener veredicto y frase directamente de MoreliaScoring
      if (typeof MoreliaScoring !== "undefined") {
        const v = MoreliaScoring.pickPhraseAndTier(globalScore);
        if (v.title) shareVerdictEl.textContent = v.title;
        if (v.phrase) sharePhraseEl.textContent = `"${v.phrase}"`;
      } else {
        fetch(`/api/verdict?score=${globalScore}`)
          .then((r) => r.json())
          .then((data) => {
            if (data.tier) shareVerdictEl.textContent = data.tier;
            if (data.phrase) sharePhraseEl.textContent = `"${data.phrase}"`;
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

    // Fondo
    ctx.fillStyle = hard ? "#f2f5ef" : "#f6f8f5";
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
      const badgeText = (meta.badge || lid.slice(0, 3)).toUpperCase();
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
        [[mapLeft + 45, mapTop + 45], [mapLeft + mapW - 45, mapTop + mapH - 45]],
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

    // Puntaje y Veredicto
    const globalScore = computeGlobalScore();
    ctx.textAlign = "center";
    ctx.fillStyle = "#34383c";
    ctx.font = `800 128px ${FONT_FAMILY}`;
    ctx.fillText(`${globalScore}`, SHARE_W / 2 - 45, 1276);

    ctx.font = `600 48px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(75, 79, 84, 0.45)";
    ctx.fillText("/100", SHARE_W / 2 + 90, 1276);

    ctx.font = `800 42px ${FONT_FAMILY}`;
    ctx.fillStyle = "#00833e";
    ctx.fillText(shareVerdictEl.textContent, SHARE_W / 2, 1338);

    ctx.font = `italic 500 24px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(75, 79, 84, 0.78)";
    ctx.fillText(sharePhraseEl.textContent, SHARE_W / 2, 1380);

    // Llamado a redes sociales (dinámico desde el DOM para reflejar de inmediato cualquier cambio en HTML)
    const shareSocialTextEl = document.querySelector(".share-social-text");
    const rawSocialText = shareSocialTextEl
      ? shareSocialTextEl.textContent.replace(/\s+/g, " ").trim()
      : "Tómale una foto a tu marcador, etiquétanos en tus redes sociales y compartimos tu foto, la foto con más likes se llevará una sorpresa a fin de mes.";

    const maxSocialWidth = SHARE_W - 140;
    ctx.textAlign = "center";
    let calloutFontSize = 21;

    function getCanvasWrappedLines(text, fontPx) {
      ctx.font = `600 ${fontPx}px ${FONT_FAMILY}`;
      const words = text.split(/\s+/);
      const lines = [];
      let curLine = words[0] || "";
      for (let i = 1; i < words.length; i++) {
        const test = curLine + " " + words[i];
        if (ctx.measureText(test).width <= maxSocialWidth) {
          curLine = test;
        } else {
          lines.push(curLine);
          curLine = words[i];
        }
      }
      if (curLine) lines.push(curLine);
      return lines;
    }

    let socialLines = getCanvasWrappedLines(rawSocialText, calloutFontSize);
    while (socialLines.length > 2 && calloutFontSize > 15) {
      calloutFontSize -= 1;
      socialLines = getCanvasWrappedLines(rawSocialText, calloutFontSize);
    }

    ctx.font = `600 ${calloutFontSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = "#34383c";

    let socialPillY = 1444;
    let cenefaY = 1506;
    let cenefaH = 26;

    if (socialLines.length <= 1) {
      ctx.fillText(socialLines[0] || rawSocialText, SHARE_W / 2, 1424);
      socialPillY = 1444;
      cenefaY = 1506;
    } else {
      ctx.fillText(socialLines[0], SHARE_W / 2, 1412);
      ctx.fillText(socialLines[1], SHARE_W / 2, 1438);
      socialPillY = 1456;
      cenefaY = 1512;
      cenefaH = 24;
    }

    // Identificadores de Redes Sociales (dinámicos desde el DOM o valores predeterminados)
    const socialTagEls = document.querySelectorAll(".share-social-tags .social-tag");
    let fbUser = "IMPLANmorelia";
    let igUser = "implan_morelia";
    if (socialTagEls.length >= 2) {
      const t0 = socialTagEls[0].textContent.trim();
      const t1 = socialTagEls[1].textContent.trim();
      if (t0) fbUser = t0;
      if (t1) igUser = t1;
    }

    const iconSize = 28;
    const gapIconText = 10;
    const sepGap = 22;

    ctx.font = `700 23px ${FONT_FAMILY}`;
    const fbW = ctx.measureText(fbUser).width;
    const igW = ctx.measureText(igUser).width;
    const sepW = ctx.measureText("·").width;

    const totalContentW = iconSize + gapIconText + fbW + sepGap + sepW + sepGap + iconSize + gapIconText + igW;
    const pillPadX = 30, pillH = socialLines.length > 1 ? 40 : 44;
    const pillW = totalContentW + pillPadX * 2;
    const pillX = (SHARE_W - pillW) / 2;
    const pillY = socialPillY;

    ctx.fillStyle = "rgba(0, 131, 62, 0.07)";
    ctx.strokeStyle = "rgba(0, 131, 62, 0.30)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.stroke();

    let curX = pillX + pillPadX;
    const iconY = pillY + (pillH - iconSize) / 2;
    const textBaselineY = pillY + (socialLines.length > 1 ? 28 : 30);

    // Logo e Identificador de Facebook
    drawCanvasFbIcon(ctx, curX, iconY, iconSize);
    curX += iconSize + gapIconText;

    ctx.textAlign = "left";
    ctx.fillStyle = "#34383c";
    ctx.fillText(fbUser, curX, textBaselineY);
    curX += fbW + sepGap;

    // Separador
    ctx.fillStyle = "rgba(75, 79, 84, 0.45)";
    ctx.fillText("·", curX, textBaselineY);
    curX += sepW + sepGap;

    // Logo e Identificador de Instagram
    drawCanvasIgIcon(ctx, curX, iconY, iconSize);
    curX += iconSize + gapIconText;

    ctx.fillStyle = "#34383c";
    ctx.fillText(igUser, curX, textBaselineY);
    ctx.textAlign = "center";

    // Cenefa institucional de movilidad sustentable
    if (brandCenefaImg.complete && brandCenefaImg.naturalWidth) {
      ctx.drawImage(brandCenefaImg, 50, cenefaY, SHARE_W - 100, cenefaH);
    }

    // Pie de página institucional
    ctx.font = `600 21px ${FONT_FAMILY}`;
    ctx.fillStyle = "rgba(75, 79, 84, 0.70)";
    const footerText = pName
      ? `Participante: ${pName} · IMPLAN Morelia · www.implanmorelia.org`
      : "IMPLAN Morelia · Instituto Municipal de Planeación · www.implanmorelia.org";
    ctx.fillText(footerText, SHARE_W / 2, 1572);
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
    a.download = `croquis-mental-morelia${nameSlug}-${isHardMode() ? 'dificil' : 'normal'}.png`;
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
      ? `¡Mira mi croquis mental de Morelia trazado de memoria por ${pName}! Saqué ${score}/100 en Mi Croquis Mental de Morelia (${hard ? 'Modo Difícil' : 'Modo Normal'})!`
      : (hard
        ? `Dibujé los ríos y ejes de Morelia en modo difícil y saqué ${score}/100 en Mi Croquis Mental de Morelia!`
        : `Dibujé los monumentos y ríos de Morelia de memoria y saqué ${score}/100 en Mi Croquis Mental de Morelia!`);

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

  // Panel de Datos e Investigación QGIS (IndexedDB)
  const qgisAdminBtn = document.getElementById("qgis-admin-btn");
  const qgisCountBadge = document.getElementById("qgis-count-badge");
  const qgisModal = document.getElementById("qgis-modal");
  const qgisModalCount = document.getElementById("qgis-modal-count");
  const exportarQgisBtn = document.getElementById("exportar-qgis-btn");
  const exportarJsonBtn = document.getElementById("exportar-json-btn");
  const limpiarQgisBtn = document.getElementById("limpiar-qgis-btn");
  const descargarGeojsonBtn = document.getElementById("descargar-geojson-btn");
  const webhookUrlInput = document.getElementById("webhook-url-input");
  const guardarWebhookBtn = document.getElementById("guardar-webhook-btn");
  const webhookStatusMsg = document.getElementById("webhook-status-msg");

  async function updateQgisBadge() {
    if (!window.MoreliaDB) return;
    try {
      const count = await MoreliaDB.getSessionCount();
      if (qgisCountBadge) qgisCountBadge.textContent = String(count);
      if (qgisModalCount) qgisModalCount.textContent = String(count);
    } catch (e) {
      console.warn("No se pudo leer conteo de IndexedDB:", e);
    }
  }

  function openQgisModal() {
    if (!qgisModal) return;
    updateQgisBadge();
    if (webhookUrlInput && window.MoreliaDB) {
      webhookUrlInput.value = MoreliaDB.getWebhookUrl() || "";
    }
    qgisModal.hidden = false;
    requestAnimationFrame(() => qgisModal.classList.add("visible"));
  }

  function closeQgisModal() {
    if (!qgisModal) return;
    qgisModal.classList.remove("visible");
    setTimeout(() => { qgisModal.hidden = true; }, 240);
  }

  qgisAdminBtn?.addEventListener("click", openQgisModal);
  qgisModal?.querySelector(".qgis-close-btn")?.addEventListener("click", closeQgisModal);
  qgisModal?.querySelector(".modal-backdrop")?.addEventListener("click", closeQgisModal);

  guardarWebhookBtn?.addEventListener("click", () => {
    if (!window.MoreliaDB || !webhookUrlInput) return;
    const url = webhookUrlInput.value.trim();
    MoreliaDB.setWebhookUrl(url);
    if (webhookStatusMsg) {
      webhookStatusMsg.textContent = url ? "✓ Webhook de Google guardado y listo" : "✓ Webhook desactivado";
      setTimeout(() => { if (webhookStatusMsg) webhookStatusMsg.textContent = ""; }, 3500);
    }
  });

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
      let layers = [];
      let anchors = [];
      let valle = null;

      // 1. PRIORIDAD: Datos cartográficos precargados (Cero riesgo de 'Failed to fetch' en GitHub Pages o file://)
      if (typeof window.MORELIA_DATA !== "undefined" && window.MORELIA_DATA.lineas) {
        if (typeof MoreliaScoring !== "undefined") {
          layers = MoreliaScoring.parseMoreliaLayers(window.MORELIA_DATA.lineas);
          anchors = MoreliaScoring.parseMoreliaAnchors(window.MORELIA_DATA.anchors);
        }
        valle = window.MORELIA_DATA.valle;
      } else {
        // 2. Fallback mediante fetch con ruta relativa dinámica
        try {
          const basePath = window.location.pathname.endsWith('.html')
            ? window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1)
            : window.location.pathname;
          const cleanBase = basePath.endsWith('/') ? basePath : (basePath + '/');

          const [layersGeo, anchorsGeo, valleData] = await Promise.all([
            fetch(cleanBase + "data/lineas_morelia.geojson").then((r) => r.json()),
            fetch(cleanBase + "data/morelia_anchors.geojson").then((r) => r.json()),
            fetch(cleanBase + "data/cd_morelia_pol.geojson").then((r) => r.json()).catch(() => fetch(cleanBase + "data/morelia_valle.geojson").then((r) => r.json()))
          ]);

          if (typeof MoreliaScoring !== "undefined") {
            layers = MoreliaScoring.parseMoreliaLayers(layersGeo);
            anchors = MoreliaScoring.parseMoreliaAnchors(anchorsGeo);
          }
          valle = valleData;
        } catch (fetchErr) {
          console.warn("Fallo fetch relativo, intentando endpoints /api/...", fetchErr);
          const [apiLayers, apiAnchors, apiValle] = await Promise.all([
            fetch("/api/layers").then((r) => r.json()),
            fetch("/api/anchors").then((r) => r.json()),
            fetch("/api/valle").then((r) => r.json())
          ]);
          layers = apiLayers;
          anchors = apiAnchors;
          valle = apiValle;
        }
      }

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
      updateQgisBadge();
    } catch (e) {
      console.error("Error inicializando Croquis Morelia:", e);
    }
  }

  init();
})();
