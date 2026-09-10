import json
import os
import math

os.makedirs("data", exist_ok=True)
os.makedirs("saved_maps", exist_ok=True)

def haversine(lon1, lat1, lon2, lat2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def poly_len(coords):
    return sum(haversine(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]) for i in range(1, len(coords)))

def bbox(coords, pad=0.012):
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return [round(min(lons) - pad, 5), round(min(lats) - pad, 5), round(max(lons) + pad, 5), round(max(lats) + pad, 5)]

# Geometrías WGS84 de alta fidelidad para Morelia, Michoacán

# 1. Río Chiquito (Cañadas/Filtros Viejos -> Av. Solidaridad -> Confluencia Tres Puentes)
coords_rio_chiquito = [
    [-101.1480, 19.6720], [-101.1545, 19.6780], [-101.1598, 19.6835],
    [-101.1640, 19.6865], [-101.1710, 19.6890], [-101.1775, 19.6898],
    [-101.1830, 19.6888], [-101.1878, 19.6882], [-101.1930, 19.6880], # Ventura Puente / Juárez
    [-101.1985, 19.6885], [-101.2040, 19.6898], [-101.2095, 19.6920], # Calz. La Huerta
    [-101.2150, 19.6965], [-101.2195, 19.7010], [-101.2235, 19.7045],
    [-101.2268, 19.7075]  # Confluencia con Río Grande en Tres Puentes
]

# 2. Río Grande (Noroeste Manantiales/Estadio -> Confluencia -> Norte -> Salida Salamanca -> Salida Charo)
coords_rio_grande = [
    [-101.2650, 19.7080], [-101.2520, 19.7110], [-101.2420, 19.7125],
    [-101.2330, 19.7115], [-101.2268, 19.7075], # Confluencia Tres Puentes
    [-101.2200, 19.7130], [-101.2110, 19.7185], [-101.2010, 19.7210], # Av. Michoacán
    [-101.1920, 19.7225], [-101.1830, 19.7220], [-101.1740, 19.7205], # Morelos Norte / Tec
    [-101.1620, 19.7180], [-101.1500, 19.7170], [-101.1380, 19.7160], # Salida Charo
    [-101.1220, 19.7150], [-101.1050, 19.7130]  # Hacia Atapaneo
]

# 3. Acueducto de Morelia (Filtros Viejos / Ventura Puente -> Las Tarascas)
coords_acueducto = [
    [-101.1715, 19.6970], [-101.1738, 19.6976], [-101.1765, 19.6985],
    [-101.1798, 19.6998], [-101.1825, 19.7009], [-101.1848, 19.7018],
    [-101.1865, 19.7022], [-101.1874, 19.7023]  # Fuente de las Tarascas
]

# 4. Calzada Fray Antonio de San Miguel / San Diego (Las Tarascas -> Santuario de Guadalupe)
coords_calzada = [
    [-101.1873, 19.7023], [-101.1855, 19.7025], [-101.1838, 19.7027],
    [-101.1820, 19.7029], [-101.1802, 19.7031], [-101.1785, 19.7033] # Santuario de Guadalupe
]

# 5. Av. Francisco I. Madero (Obelisco Lázaro Cárdenas -> Catedral -> Las Tarascas -> Salida Charo)
coords_av_madero = [
    [-101.2280, 19.7015], [-101.2180, 19.7016], [-101.2114, 19.7018], # Obelisco Lázaro Cárdenas
    [-101.2050, 19.7020], [-101.1980, 19.7022], [-101.1923, 19.7024], # Frente a Catedral
    [-101.1874, 19.7023], # Las Tarascas
    [-101.1810, 19.7022], [-101.1730, 19.7020], [-101.1600, 19.7015],
    [-101.1480, 19.7010]  # Salida a Charo
]

# 6. Libramiento / Paseo de la República (Circuito periférico cerrado de Morelia)
coords_libramiento = [
    [-101.2420, 19.7030], [-101.2435, 19.7150], [-101.2380, 19.7280], # Poniente / Estadio
    [-101.2250, 19.7360], [-101.2080, 19.7390], [-101.1920, 19.7375], # Norte / Tec
    [-101.1750, 19.7320], [-101.1580, 19.7230], [-101.1470, 19.7090], # Noreste / Salida Charo
    [-101.1480, 19.6920], [-101.1550, 19.6800], [-101.1670, 19.6720], # Oriente / Camelinas
    [-101.1820, 19.6680], [-101.1980, 19.6700], [-101.2140, 19.6750], # Sur / Casa Gobierno / La Huerta
    [-101.2310, 19.6840], [-101.2390, 19.6940], [-101.2420, 19.7030]  # Cierre del circuito
]

layers = [
    {
        "id": "rio-chiquito",
        "name": "Río Chiquito",
        "kicker": "hidrografía · río sur",
        "badge": "RCh",
        "category": "rio",
        "color": "#00acc1",
        "textColor": "#007c91",
        "description": "Cruza el suroriente de Morelia por Av. Solidaridad hasta Tres Puentes donde se une al Río Grande.",
        "truthCoords": coords_rio_chiquito,
        "bbox": bbox(coords_rio_chiquito, 0.015),
        "toleranceScale": 650.0,
        "difficultyAdvice": "Nace en San José de las Torres, atraviesa Av. Solidaridad y confluye en Tres Puentes."
    },
    {
        "id": "rio-grande",
        "name": "Río Grande",
        "kicker": "hidrografía · río norte",
        "badge": "RG",
        "category": "rio",
        "color": "#1976d2",
        "textColor": "#115293",
        "description": "El principal cauce fluvial del norte que atraviesa la cuenca de poniente a oriente rumbo a Atapaneo.",
        "truthCoords": coords_rio_grande,
        "bbox": bbox(coords_rio_grande, 0.018),
        "toleranceScale": 750.0,
        "difficultyAdvice": "Pasa cerca del Estadio Morelos, cruza el norte de la ciudad y sigue hacia la salida a Charo."
    },
    {
        "id": "acueducto",
        "name": "El Acueducto",
        "kicker": "monumento · 253 arcos",
        "badge": "AC",
        "category": "monumento",
        "color": "#c45b43",
        "textColor": "#9b3c25",
        "description": "Los emblemáticos 253 arcos de cantera rosa construidos en el siglo XVIII por Fray Antonio de San Miguel.",
        "truthCoords": coords_acueducto,
        "bbox": bbox(coords_acueducto, 0.007),
        "toleranceScale": 220.0,
        "difficultyAdvice": "Inicia en la zona de Los Filtros Viejos y concluye en la Fuente de las Tarascas / Villalongín."
    },
    {
        "id": "calzada-san-diego",
        "name": "Calzada San Diego",
        "kicker": "andador · Fray Antonio de San Miguel",
        "badge": "CSD",
        "category": "andador",
        "color": "#2e7d32",
        "textColor": "#1b5e20",
        "description": "El andador peatonal arbolado que conecta la Fuente de las Tarascas con el Santuario de Guadalupe.",
        "truthCoords": coords_calzada,
        "bbox": bbox(coords_calzada, 0.006),
        "toleranceScale": 160.0,
        "difficultyAdvice": "Línea recta arbolada entre la Fuente de las Tarascas y el Templo de San Diego."
    },
    {
        "id": "av-madero",
        "name": "Avenida Madero",
        "kicker": "eje vial · Centro Histórico",
        "badge": "MAD",
        "category": "eje",
        "color": "#d97706",
        "textColor": "#b45309",
        "description": "La arteria principal de Morelia que divide la ciudad y pasa frente a la majestuosa Catedral.",
        "truthCoords": coords_av_madero,
        "bbox": bbox(coords_av_madero, 0.012),
        "toleranceScale": 450.0,
        "difficultyAdvice": "Eje recto de poniente a oriente: del Obelisco Lázaro Cárdenas hasta la salida a Charo pasando por Catedral."
    },
    {
        "id": "libramiento",
        "name": "El Libramiento",
        "kicker": "anillo vial · Paseo de la República",
        "badge": "LIB",
        "category": "periferico",
        "color": "#7c3aed",
        "textColor": "#6d28d9",
        "description": "El anillo periférico que circunvala la mancha urbana de Morelia conectando todas las salidas.",
        "truthCoords": coords_libramiento,
        "bbox": bbox(coords_libramiento, 0.022),
        "toleranceScale": 850.0,
        "difficultyAdvice": "El gran circuito circular que abraza la ciudad conectando las salidas a Quiroga, Salamanca, Charo y Pátzcuaro."
    }
]

# Conversión y exportación exclusiva a GeoJSON estándar (QGIS / ArcGIS / RFC 7946)

layers_features = []
for l in layers:
    feat = {
        "type": "Feature",
        "properties": {
            "id": l["id"],
            "name": l["name"],
            "kicker": l["kicker"],
            "badge": l["badge"],
            "category": l["category"],
            "color": l["color"],
            "textColor": l["textColor"],
            "description": l["description"],
            "toleranceScale": float(l["toleranceScale"]),
            "difficultyAdvice": l["difficultyAdvice"]
        },
        "bbox": l["bbox"],
        "geometry": {
            "type": "LineString",
            "coordinates": l["truthCoords"]
        }
    }
    layers_features.append(feat)

layers_geojson = {
    "type": "FeatureCollection",
    "name": "morelia_layers",
    "crs": {
        "type": "name",
        "properties": {
            "name": "urn:ogc:def:crs:OGC:1.3:CRS84"
        }
    },
    "features": layers_features
}

with open("data/morelia_layers.geojson", "w", encoding="utf-8") as f:
    json.dump(layers_geojson, f, indent=2, ensure_ascii=False)

anchors = [
    { "name": "Catedral de Morelia", "lat": 19.7024, "lon": -101.1923, "category": "centro" },
    { "name": "Las Tarascas", "lat": 19.7023, "lon": -101.1874, "category": "monumento" },
    { "name": "Estadio Morelos", "lat": 19.7289, "lon": -101.2333, "category": "norte" },
    { "name": "Zoológico Benito Juárez", "lat": 19.6843, "lon": -101.1932, "category": "sur" },
    { "name": "Bosque Cuauhtémoc", "lat": 19.7002, "lon": -101.1824, "category": "parque" },
    { "name": "Obelisco Lázaro Cárdenas", "lat": 19.7018, "lon": -101.2114, "category": "poniente" },
    { "name": "Santuario de Guadalupe", "lat": 19.7032, "lon": -101.1785, "category": "oriente" },
    { "name": "Tres Puentes (Confluencia)", "lat": 19.7075, "lon": -101.2268, "category": "rio" },
    { "name": "Altozano / La Loma", "lat": 19.6582, "lon": -101.1872, "category": "loma" },
    { "name": "CECONEXPO", "lat": 19.6828, "lon": -101.1782, "category": "sur" },
    { "name": "Los Filtros Viejos", "lat": 19.6890, "lon": -101.1620, "category": "rio" },
    { "name": "Plaza Las Américas", "lat": 19.6895, "lon": -101.1668, "category": "camelinas" },
    { "name": "Manantial Mintzita", "lat": 19.6450, "lon": -101.2780, "category": "agua" },
    { "name": "Ciudad Universitaria (UMSNH)", "lat": 19.6898, "lon": -101.2015, "category": "universidad" }
]

anchors_features = []
for a in anchors:
    feat = {
        "type": "Feature",
        "properties": {
            "name": a["name"],
            "category": a["category"]
        },
        "geometry": {
            "type": "Point",
            "coordinates": [round(a["lon"], 5), round(a["lat"], 5)]
        }
    }
    anchors_features.append(feat)

anchors_geojson = {
    "type": "FeatureCollection",
    "name": "morelia_anchors",
    "crs": {
        "type": "name",
        "properties": {
            "name": "urn:ogc:def:crs:OGC:1.3:CRS84"
        }
    },
    "features": anchors_features
}

with open("data/morelia_anchors.geojson", "w", encoding="utf-8") as f:
    json.dump(anchors_geojson, f, indent=2, ensure_ascii=False)

print("Archivos GeoJSON de Morelia generados exitosamente en data/:")
print(" - data/morelia_layers.geojson")
print(" - data/morelia_anchors.geojson")
if os.path.exists("data/cd_morelia_pol.geojson"):
    print(" - data/cd_morelia_pol.geojson (Polígono oficial de la ciudad)")
for l in layers:
    print(f"   * {l['name']}: {len(l['truthCoords'])} pts, {poly_len(l['truthCoords']):.1f}m")


