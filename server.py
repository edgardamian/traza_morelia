import os
import json
import time
from datetime import datetime
import glob
import re
import unicodedata
from typing import Dict, Any, List
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from scoring import evaluate_stroke, path_length_meters, pick_phrase_and_tier

app = FastAPI(title="Mi Croquis Mental de Morelia API", description="API de evaluación geográfica y captura de memoria urbana para Morelia")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
SAVED_DIR = os.path.join(BASE_DIR, "saved_maps")
STATIC_DIR = os.path.join(BASE_DIR, "static")

os.makedirs(SAVED_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

# Paleta armónica para capas cartográficas
LAYER_PALETTE = ['#c45b43', '#7c3aed', '#d97706', '#00acc1', '#1976d2', '#2e7d32', '#d81b60', '#e65100', '#00838f', '#3949ab']

# ==============================================================================
# CARGA Y PROCESAMIENTO DINÁMICO DE GEOJSON (COMPATIBLE CON QGIS / ARCGIS)
# ==============================================================================

def slugify(text: str) -> str:
    """Genera un slug limpio y seguro para identificadores de capa."""
    norm = unicodedata.normalize('NFKD', str(text)).encode('ascii', 'ignore').decode('ascii')
    clean = re.sub(r'[^\w\s-]', '', norm).strip().lower()
    return re.sub(r'[-\s]+', '-', clean)


def find_layer(layers: List[Dict[str, Any]], query_id: str) -> Any:
    """Busca una capa de forma flexible por id, slug, prefijos comunes o nombre."""
    if not query_id or not layers:
        return None
    qid = str(query_id).strip().lower()
    qslug = slugify(qid)

    # 1. Búsqueda exacta por ID o slug
    for l in layers:
        if l["id"].lower() == qid or l["id"].lower() == qslug:
            return l

    # 2. Búsqueda sin prefijos comunes (av-, el-, la-, rio-, etc.)
    def strip_prefix(s: str) -> str:
        return re.sub(r'^(av|ave|avenida|el|la|los|las|rio|calzada|andador)-', '', s)

    q_stripped = strip_prefix(qslug)
    for l in layers:
        if strip_prefix(l["id"].lower()) == q_stripped:
            return l

    # 3. Búsqueda por coincidencia de nombre
    for l in layers:
        if l["name"].lower() == qid or slugify(l["name"]) == qslug:
            return l

    # 4. Búsqueda por subcadena
    for l in layers:
        if q_stripped and q_stripped in strip_prefix(l["id"].lower()):
            return l

    return None


def articular_nombre(name: str) -> str:
    """Genera la articulación gramatical correcta en español para el nombre de la vía o elemento."""
    n = str(name).strip()
    n_lower = n.lower()
    if n_lower.startswith("el "):
        return "del " + n[3:]
    elif n_lower.startswith("la "):
        return "de la " + n[3:]
    elif n_lower.startswith("los "):
        return "de los " + n[4:]
    elif n_lower.startswith("las "):
        return "de las " + n[4:]
    elif n_lower.startswith("av "):
        return "de la Avenida " + n[3:]
    elif n_lower.startswith("av."):
        return "de la Avenida " + n[3:].lstrip()
    elif n_lower.startswith("avenida "):
        return "de la " + n
    elif n_lower.startswith("calzada la "):
        return "de la Calzada La " + n[11:]
    elif n_lower.startswith("calzada "):
        return "de la " + n
    elif n_lower.startswith("calle "):
        return "de la " + n
    elif n_lower.startswith("río ") or n_lower.startswith("rio "):
        return "del " + n
    elif n_lower.startswith("acueducto"):
        return "del " + n
    elif n_lower.startswith("libramiento"):
        return "del " + n
    elif n_lower.startswith("bosque ") or n_lower.startswith("parque ") or n_lower.startswith("centro "):
        return "del " + n
    else:
        return "de " + n


def compute_bbox(coords: List[List[float]]) -> List[float]:
    """Calcula un bounding box balanceado con margen y contexto urbano mínimo."""
    if not coords:
        return [-101.26, 19.65, -101.12, 19.74]
    lons = [pt[0] for pt in coords]
    lats = [pt[1] for pt in coords]
    min_lon, max_lon = min(lons), max(lons)
    min_lat, max_lat = min(lats), max(lats)
    center_lon = (min_lon + max_lon) / 2.0
    center_lat = (min_lat + max_lat) / 2.0
    dlon = max_lon - min_lon
    dlat = max_lat - min_lat

    # Asegurar un margen cómodo y un tamaño mínimo para ver la mancha urbana circundante (~6.5km lon x ~5km lat)
    MIN_SPAN_LON = 0.062
    MIN_SPAN_LAT = 0.046
    span_lon = max(dlon * 1.35, MIN_SPAN_LON)
    span_lat = max(dlat * 1.35, MIN_SPAN_LAT)

    return [
        round(center_lon - span_lon / 2.0, 4),
        round(center_lat - span_lat / 2.0, 4),
        round(center_lon + span_lon / 2.0, 4),
        round(center_lat + span_lat / 2.0, 4),
    ]


def clean_coords(raw_coords: Any) -> List[List[float]]:
    """Limpia y normaliza coordenadas WGS84 2D [lon, lat], ignorando elevación z si existe."""
    cleaned = []
    if not raw_coords:
        return cleaned
    for pt in raw_coords:
        if isinstance(pt, (list, tuple)) and len(pt) >= 2:
            cleaned.append([float(pt[0]), float(pt[1])])
    return cleaned


def load_layers_data() -> List[Dict[str, Any]]:
    """Carga capas maestras desde data/lineas_morelia.geojson (o fallback a morelia_layers.geojson)."""
    # Prioridad: lineas_morelia.geojson -> morelia_layers.geojson
    geojson_path = os.path.join(DATA_DIR, "lineas_morelia.geojson")
    if not os.path.exists(geojson_path):
        geojson_path = os.path.join(DATA_DIR, "morelia_layers.geojson")
    if not os.path.exists(geojson_path):
        return []

    try:
        with open(geojson_path, "r", encoding="utf-8") as f:
            fc = json.load(f)
            layers = []
            features = fc.get("features", [])
            seen_ids = set()

            for idx, feat in enumerate(features):
                props = feat.get("properties", {}) or {}
                geom = feat.get("geometry", {}) or {}
                geom_type = geom.get("type", "")
                
                coords = []
                if geom_type == "LineString":
                    coords = clean_coords(geom.get("coordinates", []))
                elif geom_type == "MultiLineString":
                    for seg in geom.get("coordinates", []):
                        coords.extend(clean_coords(seg))
                
                if len(coords) < 2:
                    continue

                # 1. Nombre y Slug ID
                raw_name = (props.get("Nombre") or props.get("nombre") or 
                            props.get("Name") or props.get("name") or 
                            props.get("NAME") or props.get("id") or f"Capa {idx+1}")
                name = str(raw_name).strip()
                
                raw_id = props.get("id") or props.get("ID") or slugify(name) or f"capa-{idx+1}"
                layer_id = slugify(raw_id)
                if layer_id in seen_ids:
                    layer_id = f"{layer_id}-{idx+1}"
                seen_ids.add(layer_id)

                # 2. Longitud y Tolerancia adaptativa (generosa para memoria espacial)
                line_len = path_length_meters(coords)
                try:
                    tol_scale = float(props.get("toleranceScale") or props.get("TOLERANCESCALE"))
                except (ValueError, TypeError):
                    tol_scale = float(round(max(380.0, min(1400.0, 240.0 + (line_len ** 0.5) * 6.0))))

                # 3. Categoría, Kicker y Color inteligente
                n_lower = name.lower()
                category = str(props.get("category") or props.get("CATEGORY") or "").strip()
                kicker = str(props.get("kicker") or props.get("KICKER") or "").strip()
                color = str(props.get("color") or props.get("COLOR") or "").strip()

                if not category or not kicker or not color:
                    if any(w in n_lower for w in ["chiquito"]):
                        category = category or "rio"
                        kicker = kicker or "hidrografía · río sur"
                        color = color or "#00acc1"
                    elif any(w in n_lower for w in ["grande"]):
                        category = category or "rio"
                        kicker = kicker or "hidrografía · río norte"
                        color = color or "#1976d2"
                    elif any(w in n_lower for w in ["río", "rio", "canal", "arroyo"]):
                        category = category or "rio"
                        kicker = kicker or "hidrografía · cauce fluvial"
                        color = color or "#0288d1"
                    elif any(w in n_lower for w in ["acueducto", "tarasca", "san diego", "monumento", "arcos"]):
                        category = category or "monumento"
                        kicker = kicker or "monumento histórico · acueducto"
                        color = color or "#fbc02d"
                    elif any(w in n_lower for w in ["libramiento", "periferico", "periférico", "circuito", "anillo"]):
                        category = category or "periferico"
                        kicker = kicker or "anillo vial · Paseo de la República"
                        color = color or "#7c3aed"
                    elif any(w in n_lower for w in ["madero"]):
                        category = category or "eje"
                        kicker = kicker or "eje vial · Centro Histórico"
                        color = color or "#f48fb1"
                    elif any(w in n_lower for w in ["ventura"]):
                        category = category or "eje"
                        kicker = kicker or "eje vial · Centro a Camelinas"
                        color = color or "#ea580c"
                    elif any(w in n_lower for w in ["huerta"]):
                        category = category or "eje"
                        kicker = kicker or "eje vial · Salida a Pátzcuaro"
                        color = color or "#2e7d32"
                    elif any(w in n_lower for w in ["morelos"]):
                        category = category or "eje"
                        kicker = kicker or "eje vial · Norte-Sur"
                        color = color or "#e91e63"
                    elif any(w in n_lower for w in ["calzada", "andador", "peatonal"]):
                        category = category or "andador"
                        kicker = kicker or "andador urbano · Morelia"
                        color = color or "#2e7d32"
                    else:
                        category = category or "eje"
                        kicker = kicker or "eje cartográfico · Morelia"
                        color = color or LAYER_PALETTE[idx % len(LAYER_PALETTE)]

                text_color = str(props.get("textColor") or props.get("TEXTCOLOR") or color)

                # 4. Badge abreviado
                badge = str(props.get("badge") or props.get("BADGE") or "").strip()
                if not badge:
                    clean_words = [w for w in re.split(r'[\s\.\-]+', name) if w.lower() not in [
                        'el', 'la', 'los', 'las', 'de', 'del', 'av', 'ave', 'avenida', 'calle', 'calzada', 'boulevard', 'blvd', 'rio', 'río', 'paseo'
                    ]]
                    if clean_words:
                        if len(clean_words) >= 2:
                            badge = ''.join(w[:2].upper() for w in clean_words[:2])[:4]
                        else:
                            badge = clean_words[0][:3].upper()
                    else:
                        badge = layer_id[:3].upper()

                # 5. Articulación gramatical y Pista corta (para el badge superior)
                articulated = articular_nombre(name)
                hint = str(props.get("hint") or props.get("HINT") or "").strip()
                if not hint:
                    if "chiquito" in n_lower:
                        hint = "A lo largo de Av. Solidaridad"
                    elif "grande" in n_lower:
                        hint = "Cruza el norte por Estadio Morelos"
                    elif "acueducto" in n_lower:
                        hint = "De Las Tarascas a Mil Cumbres"
                    elif "libramiento" in n_lower:
                        hint = "Circuito que rodea la ciudad"
                    elif "madero" in n_lower:
                        hint = "Cruza el Centro frente a Catedral"
                    elif "huerta" in n_lower:
                        hint = "Conecta con salida a Pátzcuaro"
                    elif "morelos" in n_lower:
                        hint = "Eje perpendicular junto a Catedral"
                    elif "ventura" in n_lower:
                        hint = "Del Acueducto a Av. Camelinas"
                    else:
                        hint = kicker[:32] if kicker else name

                # 6. Instrucción directa (prompt / letrero de misión) y descripción
                prompt = str(props.get("prompt") or props.get("PROMPT") or "").strip()
                if not prompt:
                    prompt = f"Traza de memoria la ubicación, forma y extensión {articulated}"

                desc = str(props.get("description") or props.get("DESCRIPTION") or "").strip()
                if not desc:
                    desc = f"Traza de memoria la ubicación, forma y extensión {articulated} sobre la mancha urbana de Morelia."

                diff_advice = str(props.get("difficultyAdvice") or props.get("DIFFICULTYADVICE") or f"Traza de memoria la ubicación, forma y extensión {articulated} sin referencias.")

                # 7. Bounding Box
                bbox = feat.get("bbox") or props.get("bbox")
                if not bbox or not isinstance(bbox, list) or len(bbox) < 4:
                    bbox = compute_bbox(coords)

                layer_item = {
                    "id": layer_id,
                    "name": name,
                    "articulatedName": articulated,
                    "kicker": kicker,
                    "badge": badge,
                    "hint": hint,
                    "prompt": prompt,
                    "category": category,
                    "color": color,
                    "textColor": text_color,
                    "description": desc,
                    "toleranceScale": tol_scale,
                    "difficultyAdvice": diff_advice,
                    "bbox": bbox,
                    "truthCoords": coords
                }
                layers.append(layer_item)
            return layers
    except Exception as e:
        print(f"Error al procesar capas cartográficas ({geojson_path}): {e}")
        return []


def load_anchors_data() -> List[Dict[str, Any]]:
    """Carga puntos de referencia desde data/morelia_anchors.geojson."""
    geojson_path = os.path.join(DATA_DIR, "morelia_anchors.geojson")
    if not os.path.exists(geojson_path):
        return []

    try:
        with open(geojson_path, "r", encoding="utf-8") as f:
            fc = json.load(f)
            anchors = []
            for feat in fc.get("features", []):
                props = feat.get("properties", {}) or {}
                geom = feat.get("geometry", {}) or {}
                coords = geom.get("coordinates", [0, 0])
                if isinstance(coords, (list, tuple)) and len(coords) >= 2:
                    anchors.append({
                        "name": str(props.get("name") or props.get("NAME") or "Punto de referencia"),
                        "lon": float(coords[0]),
                        "lat": float(coords[1]),
                        "category": str(props.get("category") or props.get("CATEGORY") or "referencia")
                    })
            return anchors
    except Exception as e:
        print(f"Error al procesar morelia_anchors.geojson: {e}")
        return []


def load_valle_data() -> Dict[str, Any]:
    """Carga el polígono urbano oficial de la ciudad de Morelia (cd_morelia_pol.geojson)."""
    city_pol_path = os.path.join(DATA_DIR, "cd_morelia_pol.geojson")
    if os.path.exists(city_pol_path):
        try:
            with open(city_pol_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error al procesar cd_morelia_pol.geojson: {e}")

    # Fallback si existe morelia_valle.geojson
    valle_path = os.path.join(DATA_DIR, "morelia_valle.geojson")
    if os.path.exists(valle_path):
        try:
            with open(valle_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error al procesar morelia_valle.geojson: {e}")
    return {"type": "FeatureCollection", "name": "cd_morelia_pol", "features": []}


class ScoreRequest(BaseModel):
    lineId: str
    points: List[List[float]]


class SessionRequest(BaseModel):
    clientId: str
    lines: Dict[str, List[List[float]]]
    metadata: Dict[str, Any] = {}


@app.get("/api/layers")
def get_layers():
    """Entrega el catálogo de capas y monumentos a trazar en Morelia (versión pública sin verdades)."""
    layers = load_layers_data()
    public = []
    for l in layers:
        p = dict(l)
        p.pop("truthCoords", None)
        public.append(p)
    return public


@app.get("/api/anchors")
def get_anchors():
    """Entrega los puntos de referencia urbanos de Morelia."""
    return load_anchors_data()


@app.get("/api/valle")
def get_valle():
    """Entrega la silueta del Valle de Guayangareo / Morelia."""
    return load_valle_data()


@app.post("/api/score")
def calculate_score(req: ScoreRequest):
    """Calcula la similitud espacial del trazo del usuario frente a la geometría real."""
    layers = load_layers_data()
    layer = find_layer(layers, req.lineId)

    if not layer:
        raise HTTPException(status_code=404, detail=f"Capa '{req.lineId}' no encontrada")

    truth = layer["truthCoords"]
    tol = layer.get("toleranceScale", 500.0)

    result = evaluate_stroke(req.points, truth, tol)
    return result


@app.get("/api/verdict")
def get_verdict(score: int = 0):
    """Obtiene la frase y nivel representativo de Morelia para un puntaje global usando MORELIA_TIER_PHRASES."""
    phrase, tier = pick_phrase_and_tier(max(0, min(100, score)))
    return {"tier": tier, "phrase": phrase, "score": score}


@app.post("/api/session")
def save_session(req: SessionRequest):
    """Guarda el mapa completo dibujado por el usuario en formato GeoJSON (RFC 7946) con nombre, día y hora."""
    layers = load_layers_data()
    scores = {}
    total_score = 0
    valid_count = 0

    for lid, points in req.lines.items():
        layer = find_layer(layers, lid)
        if layer:
            res = evaluate_stroke(points, layer["truthCoords"], layer.get("toleranceScale", 500.0))
            scores[layer["id"]] = res["score"]
            total_score += res["score"]
            valid_count += 1

    global_score = round(total_score / len(layers)) if layers else 0

    now = datetime.now()
    fecha_str = now.strftime("%Y-%m-%d")
    hora_str = now.strftime("%H-%M-%S")
    hora_legible = now.strftime("%H:%M:%S")
    iso_datetime = now.isoformat()
    dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    dia_semana = dias[now.weekday()]

    raw_name = str(req.metadata.get("playerName", "")).strip()
    player_name = raw_name if raw_name else "anonimo"
    name_slug = slugify(player_name)
    if not name_slug:
        name_slug = "anonimo"

    features = []
    for lid, points in req.lines.items():
        if not points or len(points) < 2:
            continue
        layer = find_layer(layers, lid)
        layer_name = layer["name"] if layer else lid
        layer_id = layer["id"] if layer else lid
        layer_color = layer.get("color", "#c45b43") if layer else "#c45b43"
        line_score = scores.get(layer_id, 0)
        length_m = round(path_length_meters(points), 1)

        feature = {
            "type": "Feature",
            "properties": {
                "id": layer_id,
                "nombre": layer_name,
                "color": layer_color,
                "puntaje": line_score,
                "longitud_metros": length_m,
                "participante": player_name,
                "fecha": fecha_str,
                "dia_semana": dia_semana,
                "hora": hora_legible,
                "dificultad": req.metadata.get("difficulty", "normal"),
                "clientId": req.clientId
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [[round(float(pt[0]), 6), round(float(pt[1]), 6)] for pt in points]
            }
        }
        features.append(feature)

    geojson_data = {
        "type": "FeatureCollection",
        "name": f"Mi Croquis Mental de Morelia - {player_name}",
        "crs": {
            "type": "name",
            "properties": {
                "name": "urn:ogc:def:crs:OGC:1.3:CRS84"
            }
        },
        "properties": {
            "participante": player_name,
            "fecha": fecha_str,
            "dia_semana": dia_semana,
            "hora": hora_legible,
            "fecha_hora": iso_datetime,
            "timestamp": int(time.time()),
            "puntaje_global": global_score,
            "dificultad": req.metadata.get("difficulty", "normal"),
            "total_capas_trazadas": len(features),
            "clientId": req.clientId,
            "perLineScores": scores,
            "metadatos": req.metadata
        },
        "features": features
    }

    filename = f"croquis_{name_slug}_{fecha_str}_{hora_str}.geojson"
    filepath = os.path.join(SAVED_DIR, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(geojson_data, f, indent=2, ensure_ascii=False)

    return {
        "status": "saved",
        "filename": filename,
        "format": "geojson",
        "participante": player_name,
        "fecha": fecha_str,
        "hora": hora_legible,
        "globalScore": global_score,
        "perLineScores": scores
    }


@app.get("/api/stats")
def get_stats():
    """Retorna estadísticas agregadas de la memoria colectiva de Morelia."""
    layers = load_layers_data()
    files = glob.glob(os.path.join(SAVED_DIR, "*.geojson")) + glob.glob(os.path.join(SAVED_DIR, "session_*.json"))
    total_sessions = len(files)

    score_sums = {l["id"]: 0 for l in layers}
    score_counts = {l["id"]: 0 for l in layers}
    global_sum = 0

    for fpath in files:
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                s = json.load(f)
                props = s.get("properties", s)
                g_score = props.get("puntaje_global", props.get("globalScore", 0))
                global_sum += g_score

                line_scores = props.get("perLineScores", {})
                for lid, sc in line_scores.items():
                    if lid in score_sums:
                        score_sums[lid] += sc
                        score_counts[lid] += 1
        except Exception:
            pass

    avg_per_layer = {}
    for lid in score_sums:
        avg_per_layer[lid] = round(score_sums[lid] / score_counts[lid], 1) if score_counts[lid] > 0 else 0

    return {
        "totalMapsDrawn": total_sessions,
        "averageGlobalScore": round(global_sum / total_sessions, 1) if total_sessions > 0 else 0,
        "averagePerLayer": avg_per_layer
    }


# Servir Frontend y Datos Cartográficos Estáticos
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")

@app.get("/")
def serve_index():
    index_path = os.path.join(BASE_DIR, "index.html")
    if not os.path.exists(index_path):
        index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return JSONResponse({"status": "Mi Croquis Mental de Morelia Backend Active", "docs": "/docs"})


if __name__ == "__main__":
    import uvicorn
    print("Iniciando servidor de Mi Croquis Mental de Morelia en http://localhost:8000 ...")
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
