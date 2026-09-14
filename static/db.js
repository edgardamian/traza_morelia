/**
 * ==============================================================================
 * BASE DE DATOS LOCAL OFFLINE - TRAZA MORELIA (INDEXEDDB)
 * Almacenamiento local persistente para ferias, talleres y uso web estático
 * ==============================================================================
 */

(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (root) {
    root.MoreliaDB = lib;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DB_NAME = 'TrazaMoreliaDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'sessions';

  let dbPromise = null;

  function getDB() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('timestamp', 'timestamp', { unique: false });
            store.createIndex('participante', 'participante', { unique: false });
            store.createIndex('fecha', 'fecha', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  function slugify(text) {
    return String(text || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Construye la FeatureCollection GeoJSON (RFC 7946) para una sesión.
   */
  function buildGeoJSON(sessionData, layersMeta = {}) {
    const now = new Date(sessionData.timestamp || Date.now());
    const fechaStr = now.toISOString().slice(0, 10);
    const horaLegible = now.toTimeString().slice(0, 8);
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaSemana = dias[now.getDay()];

    const rawName = String(sessionData.playerName || sessionData.participante || '').trim();
    const playerName = rawName || 'anonimo';

    const features = [];
    const lines = sessionData.lines || {};
    const scores = sessionData.perLineScores || {};

    for (const [lid, points] of Object.entries(lines)) {
      if (!points || points.length < 2) continue;
      const meta = layersMeta[lid] || {};
      const layerName = meta.name || lid;
      const layerColor = meta.color || '#c45b43';
      const lineScore = scores[lid] !== undefined ? scores[lid] : 0;

      let lengthM = 0;
      if (typeof MoreliaScoring !== 'undefined') {
        lengthM = Math.round(MoreliaScoring.pathLengthMeters(points) * 10) / 10;
      }

      features.push({
        type: 'Feature',
        properties: {
          id: lid,
          nombre: layerName,
          color: layerColor,
          puntaje: lineScore,
          longitud_metros: lengthM,
          participante: playerName,
          fecha: fechaStr,
          dia_semana: diaSemana,
          hora: horaLegible,
          dificultad: sessionData.difficulty || 'normal',
          clientId: sessionData.clientId || ''
        },
        geometry: {
          type: 'LineString',
          coordinates: points.map(pt => [
            Math.round(Number(pt[0]) * 1000000) / 1000000,
            Math.round(Number(pt[1]) * 1000000) / 1000000
          ])
        }
      });
    }

    return {
      type: 'FeatureCollection',
      name: `Mi Croquis Mental de Morelia - ${playerName}`,
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }
      },
      properties: {
        participante: playerName,
        fecha: fechaStr,
        dia_semana: diaSemana,
        hora: horaLegible,
        fecha_hora: now.toISOString(),
        timestamp: Math.floor(now.getTime() / 1000),
        puntaje_global: sessionData.globalScore || 0,
        dificultad: sessionData.difficulty || 'normal',
        total_capas_trazadas: features.length,
        clientId: sessionData.clientId || '',
        perLineScores: scores,
        metadatos: sessionData.metadata || {}
      },
      features
    };
  }

  /**
   * Guarda una sesión completa en IndexedDB.
   */
  async function saveSession(sessionData, layersMeta = {}) {
    const db = await getDB();
    const now = new Date();
    const id = `session_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`;
    const geojson = buildGeoJSON(sessionData, layersMeta);

    const record = {
      id,
      participante: geojson.properties.participante,
      fecha: geojson.properties.fecha,
      hora: geojson.properties.hora,
      timestamp: now.getTime(),
      dificultad: sessionData.difficulty || 'normal',
      globalScore: sessionData.globalScore || 0,
      perLineScores: sessionData.perLineScores || {},
      clientId: sessionData.clientId || '',
      lines: sessionData.lines || {},
      geojson
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);
      req.onsuccess = () => {
        // Enviar automáticamente a Google Sheets / Drive vía Webhook si está configurado
        sendToGoogleWebhook(record).catch((err) => console.warn("Fallo sincronización Google Webhook:", err));
        resolve(record);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Obtiene todas las sesiones guardadas.
   */
  async function getAllSessions() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const results = req.result || [];
        results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Obtiene la cantidad total de sesiones guardadas.
   */
  async function getSessionCount() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Descarga un archivo Blob al dispositivo del usuario.
   */
  function downloadBlob(content, filename, contentType = 'application/json') {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  /**
   * Exporta la sesión individual actual como archivo GeoJSON para el participante.
   */
  function exportIndividualGeoJSON(sessionData, layersMeta = {}) {
    const geojson = sessionData.geojson || buildGeoJSON(sessionData, layersMeta);
    const rawName = geojson.properties?.participante || 'anonimo';
    const nameSlug = slugify(rawName) || 'anonimo';
    const now = new Date();
    const fecha = now.toISOString().slice(0, 10);
    const hora = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const filename = `croquis_${nameSlug}_${fecha}_${hora}.geojson`;

    downloadBlob(JSON.stringify(geojson, null, 2), filename, 'application/geo+json');
    return filename;
  }

  /**
   * Exporta TODOS los croquis almacenados en un único archivo GeoJSON consolidado listo para QGIS.
   */
  async function exportConsolidatedGeoJSON() {
    const sessions = await getAllSessions();
    if (!sessions || sessions.length === 0) {
      alert('No hay croquis guardados en este navegador todavía.');
      return;
    }

    const allFeatures = [];
    for (const s of sessions) {
      const g = s.geojson;
      if (g && Array.isArray(g.features)) {
        for (const feat of g.features) {
          allFeatures.push({
            ...feat,
            properties: {
              session_id: s.id,
              participante: s.participante,
              fecha: s.fecha,
              hora: s.hora,
              puntaje_global: s.globalScore,
              dificultad: s.dificultad,
              ...(feat.properties || {})
            }
          });
        }
      }
    }

    const consolidated = {
      type: 'FeatureCollection',
      name: 'Croquis Mental de Morelia - Estudio Consolidado IMPLAN',
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }
      },
      properties: {
        titulo: 'Estudio de Percepción y Memoria Espacial de Morelia',
        autor: 'IMPLAN Morelia',
        total_sesiones: sessions.length,
        total_trazos: allFeatures.length,
        fecha_exportacion: new Date().toISOString()
      },
      features: allFeatures
    };

    const fechaStr = new Date().toISOString().slice(0, 10);
    const filename = `croquis_morelia_consolidado_qgis_${fechaStr}.geojson`;
    downloadBlob(JSON.stringify(consolidated, null, 2), filename, 'application/geo+json');
    return { count: sessions.length, features: allFeatures.length, filename };
  }

  /**
   * Exporta copia de seguridad completa en formato JSON.
   */
  async function exportSessionsJSON() {
    const sessions = await getAllSessions();
    const fechaStr = new Date().toISOString().slice(0, 10);
    const filename = `croquis_morelia_backup_${fechaStr}.json`;
    downloadBlob(JSON.stringify(sessions, null, 2), filename, 'application/json');
    return filename;
  }

  /**
   * Borra todas las sesiones guardadas en el navegador tras confirmación.
   */
  async function clearAllSessions() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  const LS_WEBHOOK_URL_KEY = 'croquis_morelia_webhook_url';

  function getWebhookUrl() {
    return localStorage.getItem(LS_WEBHOOK_URL_KEY) || (window.MORELIA_CONFIG && window.MORELIA_CONFIG.webhookUrl) || '';
  }

  function setWebhookUrl(url) {
    if (!url || typeof url !== 'string' || !url.trim()) {
      localStorage.removeItem(LS_WEBHOOK_URL_KEY);
      return '';
    }
    const cleanUrl = url.trim();
    localStorage.setItem(LS_WEBHOOK_URL_KEY, cleanUrl);
    return cleanUrl;
  }

  /**
   * Envía una sesión completa al Webhook de Google Apps Script (Sheets & Drive).
   */
  async function sendToGoogleWebhook(record, customWebhookUrl = null) {
    const url = customWebhookUrl || getWebhookUrl();
    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
      return { skipped: true, reason: 'Webhook URL no configurada' };
    }

    const payload = JSON.stringify({
      id: record.id,
      participante: record.participante,
      fecha: record.fecha,
      hora: record.hora,
      timestamp: record.timestamp,
      dificultad: record.dificultad,
      globalScore: record.globalScore,
      perLineScores: record.perLineScores,
      clientId: record.clientId,
      geojson: record.geojson,
      lines: record.lines
    });

    try {
      // Usar mode: 'no-cors' con 'text/plain' para que las redirecciones de Google Apps Script no sean bloqueadas
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: payload
      });

      console.log('✅ Croquis sincronizado exitosamente con Google Sheets y Google Drive');
      return { success: true };
    } catch (err) {
      console.warn('⚠️ Error enviando al Webhook de Google:', err);
      return { success: false, error: err };
    }
  }

  return {
    getDB,
    saveSession,
    getAllSessions,
    getSessionCount,
    buildGeoJSON,
    exportIndividualGeoJSON,
    exportConsolidatedGeoJSON,
    exportSessionsJSON,
    clearAllSessions,
    downloadBlob,
    slugify,
    getWebhookUrl,
    setWebhookUrl,
    sendToGoogleWebhook
  };
}));
