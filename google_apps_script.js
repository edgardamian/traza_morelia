/**
 * ==============================================================================
 * TRAZA MORELIA - WEBHOOK PARA GOOGLE SHEETS & GOOGLE DRIVE
 * Instituto Municipal de Planeación de Morelia (IMPLAN Morelia)
 * ==============================================================================
 * 
 * INSTRUCCIONES DE INSTALACIÓN (2 MINUTOS):
 * 1. Abre https://script.google.com con tu cuenta de Google (del IMPLAN o personal).
 * 2. Haz clic en "Nuevo proyecto".
 * 3. Borra todo el código que haya en el editor y pega este archivo completo.
 * 4. Arriba en el menú, haz clic en "Implementar" (Deploy) -> "Nueva implementación".
 * 5. En el engrane selecciona tipo: "Aplicación web" (Web App).
 *    - Descripción: "Webhook Traza Morelia"
 *    - Ejecutar como: "Yo" (tu cuenta)
 *    - Quién tiene acceso: "Cualquier usuario" (Anyone - incluso anónimos).
 * 6. Haz clic en "Implementar", autoriza los permisos de Drive y Sheets.
 * 7. Copia la "URL de la aplicación web" (termina en /exec) y pégala en tu proyecto.
 * ==============================================================================
 */

// Nombre de la carpeta en Google Drive donde se guardarán los archivos GeoJSON
const DRIVE_FOLDER_NAME = "Traza_Morelia_GeoJSON";

// Nombre de la hoja de cálculo en Google Sheets
const SHEET_NAME = "Registro_Croquis_Morelia";

/**
 * Endpoint GET para verificar que el Webhook está activo desde cualquier navegador.
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "online",
    mensaje: "Webhook de Traza Morelia (IMPLAN) activo y listo para recibir datos.",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Endpoint POST que recibe los datos de cada sesión y los guarda en Sheets y Drive.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        mensaje: "Cuerpo de solicitud vacío"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    const now = new Date();

    // 1. Obtener o crear la carpeta en Google Drive
    const driveFolder = getOrCreateFolder(DRIVE_FOLDER_NAME);

    // 2. Nombre seguro para el participante y archivo
    const participante = (data.participante || "anonimo").replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_ -]/g, "").trim() || "anonimo";
    const timestampStr = Utilities.formatDate(now, "America/Mexico_City", "yyyyMMdd_HHmmss");
    const fileName = `croquis_${participante}_${timestampStr}.geojson`;

    // 3. Guardar archivo GeoJSON en Google Drive
    const geojsonObj = data.geojson || {};
    const fileContent = JSON.stringify(geojsonObj, null, 2);
    const driveFile = driveFolder.createFile(fileName, fileContent, "application/geo+json");
    const driveFileUrl = driveFile.getUrl();

    // 4. Guardar registro en Google Sheets
    const sheet = getOrCreateSheet(SHEET_NAME);
    const scores = data.perLineScores || {};

    // Extraer puntajes específicos por cada una de las 8 capas de Morelia
    const acueductoScore = getScoreForLayer(scores, ["acueducto", "acueducto-de-morelia"]);
    const libramientoScore = getScoreForLayer(scores, ["libramiento", "el-libramiento"]);
    const maderoScore = getScoreForLayer(scores, ["madero", "avenida-madero", "av-madero"]);
    const chiquitoScore = getScoreForLayer(scores, ["rio-chiquito", "chiquito"]);
    const grandeScore = getScoreForLayer(scores, ["rio-grande", "grande"]);
    const huertaScore = getScoreForLayer(scores, ["calzada-la-huerta", "la-huerta", "huerta"]);
    const morelosScore = getScoreForLayer(scores, ["av-morelos", "morelos", "avenida-morelos"]);
    const venturaScore = getScoreForLayer(scores, ["ventura-puente", "calzada-ventura-puente"]);

    const fechaLegible = Utilities.formatDate(now, "America/Mexico_City", "yyyy-MM-dd");
    const horaLegible = Utilities.formatDate(now, "America/Mexico_City", "HH:mm:ss");

    // Fila de datos
    const row = [
      now.toISOString(),                         // A: Marca de tiempo ISO
      fechaLegible,                              // B: Fecha local
      horaLegible,                               // C: Hora local
      participante,                              // D: Nombre o apodo
      data.dificultad || "normal",               // E: Modo de juego
      data.globalScore !== undefined ? data.globalScore : (data.puntaje_global || 0), // F: Puntaje global
      Object.keys(data.lines || data.geojson?.features || {}).length,                // G: Capas trazadas
      acueductoScore,                            // H: Acueducto
      libramientoScore,                          // I: El Libramiento
      maderoScore,                               // J: Av. Madero
      chiquitoScore,                             // K: Río Chiquito
      grandeScore,                               // L: Río Grande
      huertaScore,                               // M: Calzada la Huerta
      morelosScore,                              // N: Av. Morelos
      venturaScore,                              // O: Calzada Ventura Puente
      driveFileUrl,                              // P: Enlace al GeoJSON en Drive
      data.id || data.clientId || `ses-${now.getTime()}` // Q: ID de Sesión
    ];

    sheet.appendRow(row);

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      mensaje: "Sesión registrada correctamente en Google Sheets y Drive.",
      driveFileUrl: driveFileUrl,
      fileName: fileName
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Busca o crea la carpeta en la raíz de Google Drive.
 */
function getOrCreateFolder(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

/**
 * Busca o crea la hoja de cálculo con encabezados oficiales.
 */
function getOrCreateSheet(sheetName) {
  const files = DriveApp.getFilesByName(sheetName);
  let spreadsheet;
  if (files.hasNext()) {
    spreadsheet = SpreadsheetApp.open(files.next());
  } else {
    spreadsheet = SpreadsheetApp.create(sheetName);
  }

  const sheet = spreadsheet.getActiveSheet();
  
  // Si la hoja está vacía, agregar encabezados con estilo
  if (sheet.getLastRow() === 0) {
    const headers = [
      "Timestamp (UTC)",
      "Fecha (Morelia)",
      "Hora (Morelia)",
      "Participante",
      "Dificultad",
      "Puntaje Global (/100)",
      "Capas Trazadas",
      "Acueducto",
      "Libramiento",
      "Av. Madero",
      "Río Chiquito",
      "Río Grande",
      "Calzada La Huerta",
      "Av. Morelos",
      "Calzada Ventura Puente",
      "Enlace GeoJSON (Drive)",
      "ID Sesión"
    ];
    sheet.appendRow(headers);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#00833e");
    headerRange.setFontColor("#ffffff");
    headerRange.setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/**
 * Helper para buscar el puntaje de una capa de forma flexible por IDs alternativos.
 */
function getScoreForLayer(scores, candidates) {
  if (!scores || typeof scores !== "object") return "";
  for (const c of candidates) {
    for (const k of Object.keys(scores)) {
      if (k.toLowerCase() === c.toLowerCase() || k.toLowerCase().includes(c.toLowerCase())) {
        return scores[k];
      }
    }
  }
  return "";
}
