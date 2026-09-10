# 📓 Bitácora de Investigación y Desarrollo
## Proyecto: Plataforma de Dibujo Geográfico y Memoria Colectiva Urbana (Croquis Morelia)
**Fecha de corte:** 19 de Agosto de 2026  
**Ubicación:** `d:\bitacora_investigacion\2026\3T_TRIMESTRE\3T_PLATAFORMA_DIBUJO_GEOGRAFICO`  
**Entorno de Ejecución:** Python 3.14 (FastAPI + Uvicorn), D3.js v7, HTML5 / Vanilla CSS  

---

### 1. Resumen Ejecutivo
Se desarrolló una plataforma web interactiva de **percepción espacial y memoria colectiva urbana** diseñada específicamente para la ciudad de **Morelia, Michoacán**. El sistema permite a los ciudadanos y participantes trazar "de memoria" sobre un lienzo digital en blanco los elementos estructurales más significativos del territorio (ríos, acueducto, calzadas, ejes viales y libramiento), evaluando matemáticamente su fidelidad espacial contra la cartografía georreferenciada oficial y recopilando datos para análisis de planificación urbana (IMPLAN / SIGEM).

---

### 2. Estructura y Arquitectura del Proyecto

```
3T_PLATAFORMA_DIBUJO_GEOGRAFICO/
├── BITACORA_INVESTIGACION.md     # Este documento de seguimiento
├── server.py                     # Servidor REST API (FastAPI / Uvicorn) y servicio de archivos estáticos
├── scoring.py                    # Motor de evaluación geométrica WGS84 e invarianza de sentido
├── extract_morelia_geo.py        # Pipeline de extracción y geoprocesamiento desde OpenStreetMap
├── generate_morelia_data.py      # Generador auxiliar de coordenadas maestras de Morelia
├── fetch_osm.py                  # Pruebas de Overpass API para Morelia
├── test_scoring.py               # Suite de pruebas unitarias del algoritmo de evaluación
├── test_full_stack.py            # Verificación integral de respuestas HTTP y assets estáticos
├── verify_api.py                 # Script de prueba funcional de todos los endpoints
│
├── data/                         # Capas base y cartografía de referencia (100% GeoJSON estándar)
│   ├── lineas_morelia.geojson    # Capas maestras activas editables en QGIS (sólo requiere campo 'Nombre')
│   ├── cd_morelia_pol.geojson    # Polígono oficial de la Ciudad de Morelia (MultiPolygon GeoJSON)
│   ├── morelia_anchors.geojson   # 16 puntos de ancla urbanos (Catedral, Tarascas, etc.) como Point GeoJSON
│   └── morelia_layers.geojson    # Capas históricas de referencia inicial
│
├── saved_maps/                   # Repositorio de sesiones de mapas trazados por usuarios (JSON)
│
└── static/                       # Frontend SPA (Single Page Application)
    ├── index.html                # Estructura semántica, lienzo SVG y modales
    ├── style.css                 # Sistema de diseño con identidad Cantera Rosa y modo difícil
    ├── app.js                    # Lógica interactiva D3.js v7, captura pointer y renderizado
    └── vendor/
        └── d3.v7.min.js          # Librería D3.js v7 empaquetada localmente (offline-ready)
```

---

### 3. Motor de Calificación Espacial (`scoring.py`)

1. **Remuestreo Equidistante por Longitud de Arco:**
   - La polilínea dibujada por el usuario y la polilínea real se remuestrean a $N=100$ puntos exactamente equidistantes a lo largo de su trayectoria.
2. **Invarianza de Dirección:**
   - Se calcula la distancia ortodrómica Haversine punto a punto en sentido directo ($A \to B$) y en sentido inverso ($B \to A$), seleccionando la orientación que minimiza el error medio. Esto evita penalizar al usuario si dibuja de poniente a oriente o viceversa.
3. **Penalización por Proporción de Longitud:**
   - Se aplica un factor $\text{ratio} = \left(\frac{\min(L_{\text{draw}}, L_{\text{truth}})}{\max(L_{\text{draw}}, L_{\text{truth}})}\right)^{0.5}$ para penalizar intentos de dibujar sólo un punto o un trazo diminuto.
4. **Calibración a Escala Urbana:**
   - Puntaje $S = 100 \times \exp\left(-\left(\frac{\text{error\_medio}}{\text{escala\_tolerancia}}\right)^{0.85}\right) \times \text{penalización}$.
5. **Niveles y Veredictos Morelianos:**
   - **90 - 100 pts:** *Moreliano de Cepa* ("Te sabes las calles mejor que chofer de Ruta Gris")
   - **75 - 89 pts:** *Guayangareo en el Corazón* ("Te ubicas perfecto sin necesidad de abrir Google Maps")
   - **50 - 74 pts:** *Moreliano en Combi* ("Te ubicas en el Centro pero te pierdes pasando el Libramiento")
   - **25 - 49 pts:** *Te Ahogaste en el Río* ("Confundes Las Tarascas con el Obelisco a Lázaro Cárdenas")
   - **0 - 24 pts:** *Turista en el Tranvía* ("Para ti Morelia empieza y termina en los Portales")

---

### 4. Capas Activas y Adaptación Dinámica (`data/lineas_morelia.geojson`)

El archivo principal de capas para evaluar a los usuarios es **`data/lineas_morelia.geojson`**. Está diseñado para que cualquier persona en el IMPLAN o equipo de investigación pueda **abrirlo en QGIS, agregar nuevas líneas o quitar existentes libremente**, sin necesidad de configurar campos complejos:

- **Requisito mínimo:** Únicamente dejar el campo **`Nombre`** en la tabla de atributos de la capa (ej. `"Av. Acueducto"`, `"El Libramiento"`, `"Avenida Madero"`, `"Río Chiquito"`, `"Río Grande"`).
- **Motor de Adaptación Inteligente en `server.py`:**
  1. **Generación automática de ID:** Crea slugs limpios y únicos (`av-acueducto`, `el-libramiento`, etc.).
  2. **Detección semántica de categoría y color:** Reconoce automáticamente palabras clave como *río*, *acueducto*, *libramiento*, *madero*, *calzada* para asignar categoría, color temático y kickers urbanos (o asigna colores balanceados de la paleta).
  3. **Generación de Badges:** Genera medallones abreviados (ej. `ACU`, `LIB`, `MAD`, `CHI`, `GRA`).
  4. **Cálculo dinámico de Bounding Box y Tolerancia:** Calcula automáticamente la escala de tolerancia basada en la longitud real de la vía ($160 + \sqrt{L} \times 4.4$ metros).
  5. **Resolución flexible de consultas:** Permite consultar los endpoints de puntuación por ID exacto, slug sin prefijos o nombre.

#### 5 Capas Activas Iniciales:
1. **Av. Acueducto:** Cantera rosa, 10 vértices clave / 253 arcos.
2. **El Libramiento:** Anillo periférico Paseo de la República (281 vértices).
3. **Avenida Madero:** Eje arterial poniente-oriente cruzando el Centro Histórico (120 vértices).
4. **Río Chiquito:** Hidrografía sur por Av. Solidaridad (50 vértices).
5. **Río Grande:** Hidrografía norte (28 vértices).

#### Puntos de Referencia y Anclas (`data/morelia_anchors.geojson`):
- 16 puntos de referencia urbanos georreferenciados (Catedral, Tarascas, Estadio Morelos, Zoológico, etc.).

---

### 5. Estado de Pruebas y Correcciones Realizadas

- **Pruebas Unitarias (`test_scoring.py`):** 100% superadas (pruebas de trazo exacto, trazo inverso, desviación de 1 cuadra ~111m y detección de trampas por trazo corto).
- **Verificación de API (`test_full_stack.py` y `verify_api.py`):** Todos los endpoints y archivos estáticos responden con código HTTP `200 OK`.
- **Corrección de Especificidad CSS en `[hidden]`:**
  - *Problema:* `#final-sheet { display: flex; }` en CSS anulaba el atributo HTML `<div id="final-sheet" hidden>`, mostrando la tarjeta final de inmediato.
  - *Solución:* Se agregó `[hidden] { display: none !important; }` en `static/style.css`, garantizando que el lienzo de dibujo sea lo primero visible y la tarjeta sólo aparezca al completar el croquis.

---

### 6. LANZAR EL SERVIDOR

1. **Iniciar el Servidor:**
   ```powershell
   cd /d D:\bitacora_investigacion\2026\3T_TRIMESTRE\3T_PLATAFORMA_DIBUJO_GEOGRAFICO
   py -3.14 server.py
   ```
2. **Abrir la Aplicación en el Navegador:**
   - URL: **`http://localhost:8000`**

---

### 7. Pendientes y Próximos Pasos (Roadmap)

- [ ] **Exportación SIG (IMPLAN):** Endpoint para descargar todas las sesiones guardadas en `saved_maps/` como una capa **GeoJSON unificada o Shapefile** para análisis espacial en QGIS / ArcGIS.
- [ ] **Panel de Estadísticas y Heatmap Colectivo (`/admin`):** Vista para visualizar la superposición térmica de todos los trazos de los ciudadanos sobre Morelia.
- [ ] **Nuevas Capas Opcionales:** *Calzada Juárez*, *Av. Camelinas* o *Boulevard García de León*.
- [ ] **Modo Multijugador / Desafío:** Enlace compartible para desafiar a amigos con la misma semilla de orden de capas.
