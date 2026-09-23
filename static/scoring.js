/**
 * ==============================================================================
 * MOTOR DE SIMILITUD GEOMÉTRICA Y CALIFICACIÓN - TRAZA MORELIA
 * Vanilla JavaScript (ES6) · Evaluación Espacial WGS84 en Navegador
 * ==============================================================================
 */

(function (root, factory) {
  const lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  }
  if (root) {
    root.MoreliaScoring = lib;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Radio terrestre medio en metros (WGS84)
  const EARTH_RADIUS_METERS = 6371000.0;

  const LAYER_PALETTE = ['#c45b43', '#7c3aed', '#d97706', '#00acc1', '#1976d2', '#2e7d32', '#d81b60', '#e65100', '#00838f', '#3949ab'];

  function slugify(text) {
    return String(text || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function articularNombre(name) {
    const n = String(name || '').trim();
    const nLower = n.toLowerCase();
    if (nLower.startsWith('el ')) return 'del ' + n.slice(3);
    if (nLower.startsWith('la ')) return 'de la ' + n.slice(3);
    if (nLower.startsWith('los ')) return 'de los ' + n.slice(4);
    if (nLower.startsWith('las ')) return 'de las ' + n.slice(4);
    if (nLower.startsWith('av ')) return 'de la Avenida ' + n.slice(3);
    if (nLower.startsWith('av.')) return 'de la Avenida ' + n.slice(3).trim();
    if (nLower.startsWith('avenida ')) return 'de la ' + n;
    if (nLower.startsWith('calzada la ')) return 'de la Calzada La ' + n.slice(11);
    if (nLower.startsWith('calzada ')) return 'de la ' + n;
    if (nLower.startsWith('calle ')) return 'de la ' + n;
    if (nLower.startsWith('río ') || nLower.startsWith('rio ')) return 'del ' + n;
    if (nLower.startsWith('acueducto')) return 'del ' + n;
    if (nLower.startsWith('libramiento')) return 'del ' + n;
    if (nLower.startsWith('bosque ') || nLower.startsWith('parque ') || nLower.startsWith('centro ')) return 'del ' + n;
    return 'de ' + n;
  }

  function computeBbox(coords) {
    if (!coords || coords.length === 0) return [-101.26, 19.65, -101.12, 19.74];
    const lons = coords.map(pt => pt[0]);
    const lats = coords.map(pt => pt[1]);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const centerLon = (minLon + maxLon) / 2.0;
    const centerLat = (minLat + maxLat) / 2.0;
    const dlon = maxLon - minLon;
    const dlat = maxLat - minLat;

    const MIN_SPAN_LON = 0.062;
    const MIN_SPAN_LAT = 0.046;
    const spanLon = Math.max(dlon * 1.35, MIN_SPAN_LON);
    const spanLat = Math.max(dlat * 1.35, MIN_SPAN_LAT);

    return [
      Math.round((centerLon - spanLon / 2.0) * 10000) / 10000,
      Math.round((centerLat - spanLat / 2.0) * 10000) / 10000,
      Math.round((centerLon + spanLon / 2.0) * 10000) / 10000,
      Math.round((centerLat + spanLat / 2.0) * 10000) / 10000
    ];
  }

  function cleanCoords(geom) {
    if (!geom) return [];
    const type = geom.type;
    const coords = [];
    if (type === 'LineString') {
      const raw = geom.coordinates || [];
      for (const pt of raw) {
        if (Array.isArray(pt) && pt.length >= 2) coords.push([Number(pt[0]), Number(pt[1])]);
      }
    } else if (type === 'MultiLineString') {
      for (const seg of (geom.coordinates || [])) {
        for (const pt of seg) {
          if (Array.isArray(pt) && pt.length >= 2) coords.push([Number(pt[0]), Number(pt[1])]);
        }
      }
    }
    return coords;
  }

  function getAttr(props, ...candidates) {
    if (!props || typeof props !== 'object') return '';
    for (const key of candidates) {
      if (props[key] !== undefined && props[key] !== null) {
        const val = String(props[key]).trim();
        if (val) return val;
      }
    }
    // Búsqueda insensible a mayúsculas/minúsculas para campos creados o editados en QGIS
    const lowerMap = {};
    for (const k of Object.keys(props)) {
      lowerMap[k.toLowerCase()] = props[k];
    }
    for (const key of candidates) {
      const lower = key.toLowerCase();
      if (lowerMap[lower] !== undefined && lowerMap[lower] !== null) {
        const val = String(lowerMap[lower]).trim();
        if (val) return val;
      }
    }
    return '';
  }

  function parseMoreliaLayers(geojson) {
    if (!geojson || !Array.isArray(geojson.features)) return [];
    const layers = [];
    const seenIds = new Set();

    geojson.features.forEach((feat, idx) => {
      const props = feat.properties || {};
      const coords = cleanCoords(feat.geometry);
      if (coords.length < 2) return;

      const rawName = getAttr(props, 'Nombre', 'nombre', 'Name', 'name', 'titulo', 'etiqueta', 'label') || `Capa ${idx + 1}`;
      const name = String(rawName).trim();
      const rawId = getAttr(props, 'id', 'ID', 'slug', 'capa_id') || slugify(name) || `capa-${idx + 1}`;
      let layerId = slugify(rawId);
      if (seenIds.has(layerId)) layerId = `${layerId}-${idx + 1}`;
      seenIds.add(layerId);

      const lineLen = pathLengthMeters(coords);
      let tolScale = Number(getAttr(props, 'toleranceScale', 'tolerancescale', 'tolerancia'));
      if (isNaN(tolScale) || tolScale <= 0) {
        tolScale = Math.round(Math.max(380.0, Math.min(1400.0, 240.0 + Math.sqrt(lineLen) * 6.0)));
      }

      const nLower = name.toLowerCase();
      let category = getAttr(props, 'category', 'categoria', 'tipo');
      
      // Pista editable directamente desde QGIS (kicker, pista, hint, ayuda, desc_corta)
      let kicker = getAttr(props, 'kicker', 'kiker', 'pista', 'pistas', 'hint', 'ayuda', 'descripcion_corta', 'desc_corta');
      let color = getAttr(props, 'color', 'colour', 'hex', 'stroke', 'line_color');

      if (!category || !color) {
        if (nLower.includes('chiquito')) {
          category = category || 'rio';
          color = color || '#00acc1';
        } else if (nLower.includes('grande')) {
          category = category || 'rio';
          color = color || '#1976d2';
        } else if (['río', 'rio', 'canal', 'arroyo'].some(w => nLower.includes(w))) {
          category = category || 'rio';
          color = color || '#0288d1';
        } else if (['acueducto', 'tarasca', 'san diego', 'monumento', 'arcos'].some(w => nLower.includes(w))) {
          category = category || 'monumento';
          color = color || '#fbc02d';
        } else if (['libramiento', 'periferico', 'periférico', 'circuito', 'anillo'].some(w => nLower.includes(w))) {
          category = category || 'periferico';
          color = color || '#7c3aed';
        } else if (nLower.includes('madero')) {
          category = category || 'eje';
          color = color || '#f48fb1';
        } else if (nLower.includes('ventura')) {
          category = category || 'eje';
          color = color || '#ea580c';
        } else if (nLower.includes('huerta')) {
          category = category || 'eje';
          color = color || '#2e7d32';
        } else if (nLower.includes('morelos')) {
          category = category || 'eje';
          color = color || '#e91e63';
        } else if (['calzada', 'andador', 'peatonal'].some(w => nLower.includes(w))) {
          category = category || 'andador';
          color = color || '#2e7d32';
        } else {
          category = category || 'eje';
          color = color || LAYER_PALETTE[idx % LAYER_PALETTE.length];
        }
      }

      const textColor = getAttr(props, 'textColor', 'textcolor', 'color_texto', 'colortexto') || color;

      // Abreviatura editable directamente desde QGIS (badge, abrev, abreviatura, sigla, siglas, etc.)
      let badge = getAttr(props, 'badge', 'abrev', 'abreviatura', 'sigla', 'siglas', 'acronimo', 'codigo', 'tag');
      if (!badge) {
        const cleanWords = name.split(/[\s\.\-]+/).filter(w => !['el', 'la', 'los', 'las', 'de', 'del', 'av', 'ave', 'avenida', 'calle', 'calzada', 'boulevard', 'blvd', 'rio', 'río', 'paseo'].includes(w.toLowerCase()));
        if (cleanWords.length >= 2) {
          badge = (cleanWords[0].slice(0, 2) + cleanWords[1].slice(0, 2)).toUpperCase().slice(0, 4);
        } else if (cleanWords.length === 1) {
          badge = cleanWords[0].slice(0, 3).toUpperCase();
        } else {
          badge = layerId.slice(0, 3).toUpperCase();
        }
      }

      const articulated = articularNombre(name);
      // La pista es EXCLUSIVAMENTE lo que el usuario define en lineas_morelia.geojson (kicker/pista)
      let hint = kicker;

      let prompt = getAttr(props, 'prompt', 'mision', 'instruccion');
      if (!prompt) prompt = `Traza de memoria la ubicación, forma y extensión ${articulated}`;

      let desc = getAttr(props, 'description', 'descripcion', 'desc');
      if (!desc) desc = `Traza de memoria la ubicación, forma y extensión ${articulated} sobre la mancha urbana de Morelia.`;

      const diffAdvice = getAttr(props, 'difficultyAdvice', 'dificultad_consejo') || `Traza de memoria la ubicación, forma y extensión ${articulated} sin referencias.`;

      let bbox = feat.bbox || props.bbox;
      if (!bbox || !Array.isArray(bbox) || bbox.length < 4) {
        bbox = computeBbox(coords);
      }

      layers.push({
        id: layerId,
        name,
        articulatedName: articulated,
        kicker,
        hint,
        pista: hint,
        badge,
        abrev: badge,
        abreviatura: badge,
        prompt,
        category,
        color,
        textColor,
        description: desc,
        toleranceScale: tolScale,
        difficultyAdvice: diffAdvice,
        bbox,
        lengthMeters: Math.round(lineLen * 10) / 10,
        truthCoords: coords
      });
    });

    return layers;
  }

  function parseMoreliaAnchors(geojson) {
    if (!geojson || !Array.isArray(geojson.features)) return [];
    const anchors = [];
    geojson.features.forEach(feat => {
      const props = feat.properties || {};
      const coords = feat.geometry?.coordinates || [0, 0];
      if (Array.isArray(coords) && coords.length >= 2) {
        anchors.push({
          name: String(props.name || props.NAME || 'Punto de referencia'),
          lon: Number(coords[0]),
          lat: Number(coords[1]),
          category: String(props.category || props.CATEGORY || 'referencia')
        });
      }
    });
    return anchors;
  }

  /**
   * Distancia ortodrómica Haversine en metros entre dos coordenadas WGS84 [lon, lat].
   */
  function haversineDistanceMeters(lon1, lat1, lon2, lat2) {
    const toRad = Math.PI / 180.0;
    const phi1 = lat1 * toRad;
    const phi2 = lat2 * toRad;
    const deltaPhi = (lat2 - lat1) * toRad;
    const deltaLambda = (lon2 - lon1) * toRad;

    const sinHalfPhi = Math.sin(deltaPhi / 2.0);
    const sinHalfLambda = Math.sin(deltaLambda / 2.0);

    const a = sinHalfPhi * sinHalfPhi + Math.cos(phi1) * Math.cos(phi2) * sinHalfLambda * sinHalfLambda;
    const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1.0 - a)));
    return EARTH_RADIUS_METERS * c;
  }

  /**
   * Longitud total acumulada de una polilínea [[lon, lat], ...] en metros.
   */
  function pathLengthMeters(coords) {
    if (!coords || coords.length < 2) return 0.0;
    let total = 0.0;
    for (let i = 1; i < coords.length; i++) {
      total += haversineDistanceMeters(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
    }
    return total;
  }

  /**
   * Remuestrea una polilínea a N puntos exactamente equidistantes por longitud de arco.
   */
  function resamplePolyline(coords, numPoints = 100) {
    if (!coords || coords.length === 0) return [];
    if (coords.length === 1 || numPoints <= 1) {
      return Array.from({ length: numPoints }, () => [coords[0][0], coords[0][1]]);
    }

    const cumDists = [0.0];
    for (let i = 1; i < coords.length; i++) {
      const segDist = haversineDistanceMeters(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
      cumDists.push(cumDists[cumDists.length - 1] + segDist);
    }

    const totalLen = cumDists[cumDists.length - 1];
    if (totalLen <= 1e-6) {
      return Array.from({ length: numPoints }, () => [coords[0][0], coords[0][1]]);
    }

    const step = totalLen / (numPoints - 1);
    const resampled = [[coords[0][0], coords[0][1]]];
    let currSeg = 0;

    for (let i = 1; i < numPoints - 1; i++) {
      const targetDist = i * step;
      while (currSeg < cumDists.length - 1 && cumDists[currSeg + 1] < targetDist) {
        currSeg++;
      }

      const segStart = cumDists[currSeg];
      const segEnd = cumDists[currSeg + 1];
      const segLen = segEnd - segStart;

      let lon, lat;
      if (segLen > 1e-6) {
        const t = (targetDist - segStart) / segLen;
        lon = coords[currSeg][0] + t * (coords[currSeg + 1][0] - coords[currSeg][0]);
        lat = coords[currSeg][1] + t * (coords[currSeg + 1][1] - coords[currSeg][1]);
      } else {
        lon = coords[currSeg][0];
        lat = coords[currSeg][1];
      }
      resampled.push([lon, lat]);
    }

    resampled.push([coords[coords.length - 1][0], coords[coords.length - 1][1]]);
    return resampled;
  }

  const MORELIA_TIER_PHRASES = [
    {
      level: 5,
      min: 85,
      title: "Nivel 5: GPS Moreliano",
      sticker: "nivel5_gps_moreliano.png",
      phrases: [
        "Tu trazo tiene brújula propia.",
        "Traes Morelia perfectamente trazada en la cabeza",
        "Traes el GPS implantado en el cerebro, ¡Taxista!",
        "Manejas el trazado de las calles como si tú hubieras construido media ciudad",
        "Parece que creciste nadando en el Río Chiquito",
        "Se ve que si le sabes Lusitoo!",
        "Aquí hay talento cartográfico. El IMPLAN toma nota 👀"
      ]
    },
    {
      level: 4,
      min: 75,
      title: "Nivel 4: Conocimiento Moreliano",
      sticker: "nivel4_conocimiento_moreliano.png",
      phrases: [
        "Te ubicas muy bien, incluso sin ver un mapa.",
        "Te ubicas perfecto sin necesidad de abrir Google Maps",
        "Sabes llegar a cualquier lado guiándote por la cantera",
        "Conoces la ciudad de memoria con una que otra duda razonable",
        "Reconoces la diferencia exacta entre Río Grande y Río Chiquito",
        "Una que otra curva se fue de paseo, pero vas muy bien.",
        "Morelia corre por tus venas, bien trazado"
      ]
    },
    {
      level: 3,
      min: 50,
      title: "Nivel 3: Perdido en el bosque Cuauhtémoc",
      sticker: "nivel3_perdido_en_el_bosque_cuahutemoc.png",
      phrases: [
        "La intuición te ayudó, aunque algunos trazos improvisaron.",
        "Te ubicas en el Centro, pero te pierdes pasando el Libramiento",
        "Sabes llegar en Combi, pero no sabes cómo dibujarlo",
        "Casi le atinas, la cantera te guio a medias",
        "Si no ves la Catedral te desorientas un poquito",
        "Te falta dar otra vuelta por Morelia para dominar el mapa",
        "Buen intento: el territorio siempre tiene una que otra sorpresa",
        "Pasable, aunque el río te quedó un poco chueco"
      ]
    },
    {
      level: 2,
      min: 30,
      title: "Nivel 2: Mood despistado",
      sticker: "nivel2_mood_despistado.png",
      phrases: [
        "Hay potencial cartográfico: solo falta afinar el trazo.",
        "Confundes Las Tarascas con el Obelisco a Lázaro Cárdenas",
        "Tu río se fue a desembocar hasta Pátzcuaro",
        "Mandaste el Acueducto rumbo a Altozano",
        "Te metiste a Charo sin querer",
        "La intención es lo que cuenta; el río tomó otra ruta",
        "Hay talento, sólo falta apoyarlo",
        "No perdiste Morelia, la estás reconstruyendo",
        "Con este croquis hasta la Combi gris se perdería"
      ]
    },
    {
      level: 1,
      min: 0,
      title: "Nivel 1: Recién llegado a Morelia",
      sticker: "nivel1_recien_llegado_a_morelia.png",
      phrases: [
        "Tu Morelia sufrió una actualización inesperada.",
        "Para ti Morelia empieza y termina en los Portales",
        "¿Seguro que no estabas dibujando Uruapan?",
        "¿Venías manejando con los ojos cerrados o ibas esquivando marchas en la Madero?",
        "Pensaste que el Río Grande era una calle peatonal",
        "Puede que el río haya tomado vacaciones, pero el siguiente trazo puede salir mejor",
        "La ciudad sigue ahí. Ahora hay que encontrarla",
        "Ni con Waze en la mano te salvas de esta, ¡vuelve a intentarlo!",
        "¡Sigue paseando por Morelia es la única forma de conocerla!"
      ]
    }
  ];

  function getStickerUrl(filename) {
    if (!filename) return '';
    if (filename.startsWith('http') || filename.startsWith('/') || filename.startsWith('./')) {
      return filename;
    }
    const isStaticSubdir = (typeof window !== 'undefined' && window.location.pathname.includes('/static/')) ||
      (typeof document !== 'undefined' && Boolean(document.querySelector('script[src*="./scoring.js"]')));
    return (isStaticSubdir ? './img/stickers/' : './static/img/stickers/') + filename;
  }

  function getStickerByLevel(level) {
    const tier = MORELIA_TIER_PHRASES.find(t => t.level === Number(level));
    return tier ? tier.sticker : 'nivel1_recien_llegado_a_morelia.png';
  }

  function pickPhraseAndTier(score) {
    const s = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    for (const tier of MORELIA_TIER_PHRASES) {
      if (s >= tier.min) {
        const phrase = tier.phrases[Math.floor(Math.random() * tier.phrases.length)];
        return {
          phrase,
          title: tier.title,
          level: tier.level,
          sticker: tier.sticker,
          stickerUrl: getStickerUrl(tier.sticker)
        };
      }
    }
    const lastTier = MORELIA_TIER_PHRASES[MORELIA_TIER_PHRASES.length - 1];
    return {
      phrase: lastTier.phrases[0],
      title: lastTier.title,
      level: lastTier.level,
      sticker: lastTier.sticker,
      stickerUrl: getStickerUrl(lastTier.sticker)
    };
  }

  function getCumulativeDistances(coords) {
    const cum = [0.0];
    for (let i = 1; i < coords.length; i++) {
      const d = haversineDistanceMeters(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
      cum.push(cum[cum.length - 1] + d);
    }
    return cum;
  }

  function projectPointOnPolyline(px, py, coords, cumDist) {
    let bestDist = Infinity;
    let bestArc = 0.0;
    const totalLen = cumDist[cumDist.length - 1];

    for (let i = 0; i < coords.length - 1; i++) {
      const ax = coords[i][0];
      const ay = coords[i][1];
      const bx = coords[i + 1][0];
      const by = coords[i + 1][1];

      const cosPy = Math.cos(py * Math.PI / 180.0);
      const dx = (bx - ax) * 111000.0 * cosPy;
      const dy = (by - ay) * 111000.0;
      const dpx = (px - ax) * 111000.0 * cosPy;
      const dpy = (py - ay) * 111000.0;

      const segLenSq = dx * dx + dy * dy;
      let d, t;
      if (segLenSq === 0.0) {
        d = Math.hypot(dpx, dpy);
        t = 0.0;
      } else {
        t = Math.max(0.0, Math.min(1.0, (dpx * dx + dpy * dy) / segLenSq));
        const projX = dpx - t * dx;
        const projY = dpy - t * dy;
        d = Math.hypot(projX, projY);
      }

      if (d < bestDist) {
        bestDist = d;
        const segLen = Math.sqrt(segLenSq);
        bestArc = cumDist[i] + t * segLen;
      }
    }

    const frac = totalLen > 0.0 ? (bestArc / totalLen) : 0.0;
    return { dist: bestDist, frac };
  }

  function extractSubpolylineByArc(coords, cumDist, startFrac, endFrac) {
    const totalLen = cumDist[cumDist.length - 1];
    let dStart = startFrac * totalLen;
    let dEnd = endFrac * totalLen;
    let reverse = false;

    if (dStart > dEnd) {
      const tmp = dStart;
      dStart = dEnd;
      dEnd = tmp;
      reverse = true;
    }

    const pts = [];
    // Punto inicial interpolado
    for (let i = 0; i < coords.length - 1; i++) {
      if (cumDist[i] <= dStart && dStart <= cumDist[i + 1]) {
        const segLen = cumDist[i + 1] - cumDist[i];
        const t = segLen > 0.0 ? (dStart - cumDist[i]) / segLen : 0.0;
        pts.push([
          coords[i][0] + t * (coords[i + 1][0] - coords[i][0]),
          coords[i][1] + t * (coords[i + 1][1] - coords[i][1])
        ]);
        break;
      }
    }

    // Vértices intermedios
    for (let i = 0; i < coords.length; i++) {
      if (dStart < cumDist[i] && cumDist[i] < dEnd) {
        pts.push([coords[i][0], coords[i][1]]);
      }
    }

    // Punto final interpolado
    for (let i = 0; i < coords.length - 1; i++) {
      if (cumDist[i] <= dEnd && dEnd <= cumDist[i + 1]) {
        const segLen = cumDist[i + 1] - cumDist[i];
        const t = segLen > 0.0 ? (dEnd - cumDist[i]) / segLen : 0.0;
        pts.push([
          coords[i][0] + t * (coords[i + 1][0] - coords[i][0]),
          coords[i][1] + t * (coords[i + 1][1] - coords[i][1])
        ]);
        break;
      }
    }

    if (pts.length < 2) {
      pts.length = 0;
      pts.push([coords[0][0], coords[0][1]], [coords[coords.length - 1][0], coords[coords.length - 1][1]]);
    }

    if (reverse) {
      pts.reverse();
    }
    return pts;
  }

  /**
   * Evalúa la fidelidad entre el trazo del usuario y la cartografía real (WGS84).
   */
  function evaluateStroke(drawnPoints, truthPoints, toleranceScale = 500.0) {
    if (!drawnPoints || drawnPoints.length < 2 || !truthPoints || truthPoints.length < 2) {
      const { phrase, title, level, sticker, stickerUrl } = pickPhraseAndTier(0);
      return {
        score: 0,
        scoreUbicacion: 0,
        scoreForma: 0,
        scoreLargo: 0,
        meanErrorMeters: 9999.0,
        maxErrorMeters: 9999.0,
        shapeErrorMeters: 9999.0,
        lengthDrawnMeters: 0.0,
        lengthTruthMeters: 0.0,
        lengthRatio: 0.0,
        tierTitle: title,
        tierLevel: level,
        tierSticker: sticker,
        stickerUrl: stickerUrl,
        phrase: phrase,
        truth: truthPoints || []
      };
    }

    const numSamples = 100;
    const resDrawn = resamplePolyline(drawnPoints, numSamples);
    const lenDrawn = pathLengthMeters(drawnPoints);
    const lenTruth = pathLengthMeters(truthPoints);

    // ¿Es un anillo / circuito cerrado? (ej. Libramiento de Morelia: extremos < 600m)
    const isLoop = haversineDistanceMeters(truthPoints[0][0], truthPoints[0][1], truthPoints[truthPoints.length - 1][0], truthPoints[truthPoints.length - 1][1]) < 600.0;

    let meanError = Infinity;
    let maxError = 0;
    let resTruthBest = null;

    if (isLoop) {
      const resTruth = resamplePolyline(truthPoints, numSamples);
      const resTruthRev = [...resTruth].reverse();

      for (const candidate of [resTruth, resTruthRev]) {
        for (let k = 0; k < numSamples; k++) {
          let sumD = 0;
          for (let i = 0; i < numSamples; i++) {
            const candIdx = (i + k) % numSamples;
            sumD += haversineDistanceMeters(resDrawn[i][0], resDrawn[i][1], candidate[candIdx][0], candidate[candIdx][1]);
          }
          const meanD = sumD / numSamples;
          if (meanD < meanError) {
            meanError = meanD;
            resTruthBest = Array.from({ length: numSamples }, (_, i) => candidate[(i + k) % numSamples]);
          }
        }
      }

      maxError = 0;
      for (let i = 0; i < numSamples; i++) {
        const d = haversineDistanceMeters(resDrawn[i][0], resDrawn[i][1], resTruthBest[i][0], resTruthBest[i][1]);
        if (d > maxError) maxError = d;
      }
    } else {
      // 1. Comparación contra el trazo completo (directo e inverso)
      const resTruthFull = resamplePolyline(truthPoints, numSamples);
      const resTruthRev = [...resTruthFull].reverse();

      let sumFwd = 0;
      let sumRev = 0;
      for (let i = 0; i < numSamples; i++) {
        sumFwd += haversineDistanceMeters(resDrawn[i][0], resDrawn[i][1], resTruthFull[i][0], resTruthFull[i][1]);
        sumRev += haversineDistanceMeters(resDrawn[i][0], resDrawn[i][1], resTruthRev[i][0], resTruthRev[i][1]);
      }
      const errFwdFull = sumFwd / numSamples;
      const errRevFull = sumRev / numSamples;

      const bestFull = Math.min(errFwdFull, errRevFull);
      const bestTruth = errFwdFull <= errRevFull ? resTruthFull : resTruthRev;

      // 2. Alineación inteligente por sub-tramo
      const cum = getCumulativeDistances(truthPoints);
      const proj0 = projectPointOnPolyline(resDrawn[0][0], resDrawn[0][1], truthPoints, cum);
      const proj1 = projectPointOnPolyline(resDrawn[resDrawn.length - 1][0], resDrawn[resDrawn.length - 1][1], truthPoints, cum);

      const arcCoverage = Math.abs(proj1.frac - proj0.frac);
      const maxEndpointDist = Math.max(proj0.dist, proj1.dist);

      if (arcCoverage > 0.10 && maxEndpointDist < toleranceScale * 2.5) {
        const subTruth = extractSubpolylineByArc(truthPoints, cum, proj0.frac, proj1.frac);
        const resSub = resamplePolyline(subTruth, numSamples);
        const resSubRev = [...resSub].reverse();

        let sumSubFwd = 0;
        let sumSubRev = 0;
        for (let i = 0; i < numSamples; i++) {
          sumSubFwd += haversineDistanceMeters(resDrawn[i][0], resDrawn[i][1], resSub[i][0], resSub[i][1]);
          sumSubRev += haversineDistanceMeters(resDrawn[i][0], resDrawn[i][1], resSubRev[i][0], resSubRev[i][1]);
        }
        const errFwdSub = sumSubFwd / numSamples;
        const errRevSub = sumSubRev / numSamples;
        const bestSub = Math.min(errFwdSub, errRevSub);

        if (bestSub < bestFull) {
          meanError = bestSub;
          resTruthBest = errFwdSub <= errRevSub ? resSub : resSubRev;
        } else {
          meanError = bestFull;
          resTruthBest = bestTruth;
        }
      } else {
        meanError = bestFull;
        resTruthBest = bestTruth;
      }

      maxError = 0;
      for (let i = 0; i < numSamples; i++) {
        const d = haversineDistanceMeters(resDrawn[i][0], resDrawn[i][1], resTruthBest[i][0], resTruthBest[i][1]);
        if (d > maxError) maxError = d;
      }
    }

    // =========================================================================
    // CALIBRACIÓN DE INDICADORES (UBICACIÓN, FORMA Y LARGO)
    // =========================================================================
    const UMBRAL_LARGO_COMPLETO = 0.50;

    const GRACIA_UBICACION_METROS = 100.0;
    const TOLERANCIA_UBICACION_METROS = Math.max(lenTruth * 0.08, 600.0);

    const GRACIA_FORMA_METROS = 200.0;
    const TOLERANCIA_FORMA_METROS = Math.max(lenTruth * 0.06, 500.0);

    const PESO_UBICACION = 0.80;
    const PESO_FORMA = 0.10;
    const PESO_LARGO = 0.10;

    // 1. Indicador de Largo
    const maxLen = Math.max(lenDrawn, lenTruth);
    const minLen = Math.min(lenDrawn, lenTruth);
    const ratioLargo = maxLen > 0.0 ? (minLen / maxLen) : 0.0;
    let scoreLargo = UMBRAL_LARGO_COMPLETO > 0.0 ? 100.0 * Math.min(1.0, ratioLargo / UMBRAL_LARGO_COMPLETO) : 100.0;
    scoreLargo = Math.max(0.0, Math.min(100.0, scoreLargo));

    // 2. Indicador de Ubicación
    const errorUbicacion = Math.max(0.0, meanError - GRACIA_UBICACION_METROS);
    let scoreUbicacion = 100.0 * Math.exp(-Math.pow(errorUbicacion / TOLERANCIA_UBICACION_METROS, 1.8));
    scoreUbicacion = Math.max(0.0, Math.min(100.0, scoreUbicacion));

    // 3. Indicador de Forma (Centrado de siluetas)
    let cxDrawn = 0;
    let cyDrawn = 0;
    let cxTruth = 0;
    let cyTruth = 0;
    for (let i = 0; i < numSamples; i++) {
      cxDrawn += resDrawn[i][0];
      cyDrawn += resDrawn[i][1];
      cxTruth += resTruthBest[i][0];
      cyTruth += resTruthBest[i][1];
    }
    cxDrawn /= numSamples;
    cyDrawn /= numSamples;
    cxTruth /= numSamples;
    cyTruth /= numSamples;

    const cosLat = Math.cos((cyDrawn + cyTruth) * 0.5 * Math.PI / 180.0);
    let sumShapeErr = 0.0;
    for (let i = 0; i < numSamples; i++) {
      const dxD = (resDrawn[i][0] - cxDrawn) * 111000.0 * cosLat;
      const dyD = (resDrawn[i][1] - cyDrawn) * 111000.0;
      const dxT = (resTruthBest[i][0] - cxTruth) * 111000.0 * cosLat;
      const dyT = (resTruthBest[i][1] - cyTruth) * 111000.0;
      sumShapeErr += Math.hypot(dxD - dxT, dyD - dyT);
    }
    const shapeErrorMeters = sumShapeErr / numSamples;
    const errorForma = Math.max(0.0, shapeErrorMeters - GRACIA_FORMA_METROS);
    let scoreForma = 100.0 * Math.exp(-Math.pow(errorForma / TOLERANCIA_FORMA_METROS, 1.8));
    scoreForma = Math.max(0.0, Math.min(100.0, scoreForma));

    // 4. Calificación Final Combinada
    const scoreBase = (PESO_UBICACION * scoreUbicacion) + (PESO_FORMA * scoreForma) + (PESO_LARGO * scoreLargo);
    const factorCompletitud = UMBRAL_LARGO_COMPLETO > 0.0 ? Math.min(1.0, Math.sqrt(ratioLargo / UMBRAL_LARGO_COMPLETO)) : 1.0;
    let finalScore = Math.round(scoreBase * factorCompletitud);
    finalScore = Math.max(0, Math.min(100, finalScore));

    const { phrase, title, level, sticker, stickerUrl } = pickPhraseAndTier(finalScore);

    return {
      score: finalScore,
      scoreUbicacion: Math.round(scoreUbicacion),
      scoreForma: Math.round(scoreForma),
      scoreLargo: Math.round(scoreLargo),
      meanErrorMeters: Math.round(meanError * 10) / 10,
      maxErrorMeters: Math.round(maxError * 10) / 10,
      shapeErrorMeters: Math.round(shapeErrorMeters * 10) / 10,
      lengthDrawnMeters: Math.round(lenDrawn * 10) / 10,
      lengthTruthMeters: Math.round(lenTruth * 10) / 10,
      lengthRatio: Math.round(ratioLargo * 100) / 100,
      tierTitle: title,
      tierLevel: level,
      tierSticker: sticker,
      stickerUrl: stickerUrl,
      phrase: phrase,
      truth: truthPoints
    };
  }

  return {
    haversineDistanceMeters,
    pathLengthMeters,
    resamplePolyline,
    pickPhraseAndTier,
    evaluateStroke,
    parseMoreliaLayers,
    parseMoreliaAnchors,
    slugify,
    articularNombre,
    getStickerUrl,
    getStickerByLevel,
    MORELIA_TIER_PHRASES
  };
}));
