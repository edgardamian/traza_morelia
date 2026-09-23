# Mi Croquis Mental de Morelia 🗺️✨

Plataforma interactiva para poner a prueba la memoria espacial y percepción geográfica de las y los morelianos, desarrollada en colaboración con el **Instituto Municipal de Planeación de Morelia (IMPLAN Morelia)**.

El juego invita a trazar de memoria los 8 elementos clave de la estructura urbana de la ciudad:
1. **Río Grande** (Río principal del norte)
2. **Río Chiquito** (Flujo hídrico sur)
3. **El Libramiento** (Anillo periférico)
4. **Acueducto de Morelia** (Monumento histórico de cantera)
5. **Avenida Madero** (Eje poniente-oriente)
6. **Av Morelos** (Eje norte-sur)
7. **Calzada la Huerta** (Eje vial a Pátzcuaro)
8. **Calzada Ventura Puente** (Conexión Acueducto a Camelinas)

El motor espacial (`scoring.py`) evalúa la precisión geométrica, escala, orientación y completitud de cada trazo frente a la cartografía oficial georreferenciada (WGS84).

---

## 🚀 Requisitos Previos

- **Python 3.9 o superior** (compatible con Python 3.10, 3.11, 3.12, 3.13, 3.14)
- Navegador web moderno (Chrome, Edge, Firefox, Safari)

---

## 📦 Instalación

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/edgardamian/traza_morelia.git
   cd traza_morelia
   ```

2. **Instalar dependencias:**
   ```bash
   pip install -r requirements.txt
   ```

---

## 🎮 Ejecución

### Opción 1: Con Python directamente
```bash
cd /d D:\bitacora_investigacion\2026\3T_TRIMESTRE\3T_PLATAFORMA_DE_DIBUJO_ESTATICA
py -3.14 server.py
```
O usando Uvicorn:
```bash
uvicorn server:app --reload --port 8000
```

### Opción 2: En Windows (Acceso rápido)
Haz doble clic en el archivo: 
```
iniciar_servidor.bat
```

Una vez iniciado el servidor, abre tu navegador en:
👉 **[http://localhost:8000](http://localhost:8000)**

---

## 📁 Estructura del Proyecto

```text
traza_morelia/
├── data/
│   ├── lineas_morelia.geojson    # Trazos oficiales georreferenciados de las 8 capas
│   ├── cd_morelia_pol.geojson    # Polígono oficial de la mancha urbana de Morelia
│   ├── pol_morelia.geojson       # 21 polígonos guía de apoyo para Modo Fácil
│   ├── morelia_anchors.geojson   # Puntos de referencia y anclajes urbanos
│   ├── morelia_valle.geojson     # Silueta cartográfica base
│   └── morelia_data.js           # Bundle estático offline de todas las capas
├── static/
│   ├── index.html                # Interfaz para servidor estático /static
│   ├── style.css                 # Sistema de diseño, estética Cantera Rosa e IMPLAN
│   ├── app.js                    # Lógica interactiva en cliente, D3.js y exportación HD
│   ├── scoring.js                # Motor de evaluación geométrica en cliente (JS)
│   ├── db.js                     # Almacenamiento local IndexedDB y sincronización
│   ├── vendor/
│   │   └── d3.v7.min.js          # Librería D3.js para proyección y manipulación SVG
│   └── img/                      # Logotipos oficiales (IMPLAN, Escudo Morelia, SIGEM) y stickers
├── index.html                    # Interfaz principal de juego y modales (raíz)
├── server.py                     # Servidor FastAPI y endpoints REST
├── scoring.py                    # Motor de evaluación geométrica y similitud espacial (Python)
├── google_apps_script.js         # Webhook para sincronización con Google Sheets y Google Drive
├── test_scoring.py               # Pruebas unitarias del motor de calificación matemática
├── test_full_stack.py            # Pruebas de integración de endpoints y recursos estáticos
├── requirements.txt              # Dependencias de Python
├── iniciar_servidor.bat          # Script de arranque en Windows
└── README.md                     # Documentación general
```

---

## 🏛️ Créditos y Autoría

- **Desarrollado para:** Instituto Municipal de Planeación de Morelia (IMPLAN Morelia) y H. Ayuntamiento de Morelia.
- **Geofest / SIGEM Morelia**
