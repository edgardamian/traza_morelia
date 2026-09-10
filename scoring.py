"""
Motor de similitud geométrica y calificación para Croquis Morelia.
Calcula la fidelidad espacial entre trazos dibujados por el usuario
y la geometría real georreferenciada (WGS84) mediante remuestreo
equidistante por longitud de arco e invarianza de sentido.
"""

import math
from typing import List, Tuple, Dict, Any

def haversine_distance_meters(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Calcula la distancia ortodrómica en metros entre dos coordenadas WGS84."""
    R = 6371000.0  # Radio terrestre en metros
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def path_length_meters(coords: List[List[float]]) -> float:
    """Calcula la longitud total de una polilínea en metros."""
    if len(coords) < 2:
        return 0.0
    total = 0.0
    for i in range(1, len(coords)):
        total += haversine_distance_meters(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1])
    return total

def resample_polyline(coords: List[List[float]], num_points: int = 100) -> List[List[float]]:
    """
    Remuestrea una polilínea a N puntos exactamente equidistantes
    a lo largo de su longitud acumulada.
    """
    if not coords:
        return []
    if len(coords) == 1 or num_points <= 1:
        return [coords[0] for _ in range(num_points)]
    
    # Calcular distancias acumuladas
    cum_dists = [0.0]
    for i in range(1, len(coords)):
        seg_dist = haversine_distance_meters(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1])
        cum_dists.append(cum_dists[-1] + seg_dist)
        
    total_len = cum_dists[-1]
    if total_len <= 1e-6:
        return [coords[0] for _ in range(num_points)]
    
    step = total_len / (num_points - 1)
    resampled = [coords[0]]
    curr_seg = 0
    
    for i in range(1, num_points - 1):
        target_dist = i * step
        while curr_seg < len(cum_dists) - 1 and cum_dists[curr_seg + 1] < target_dist:
            curr_seg += 1
            
        seg_start = cum_dists[curr_seg]
        seg_end = cum_dists[curr_seg + 1]
        seg_len = seg_end - seg_start
        
        if seg_len > 1e-6:
            t = (target_dist - seg_start) / seg_len
            lon = coords[curr_seg][0] + t * (coords[curr_seg + 1][0] - coords[curr_seg][0])
            lat = coords[curr_seg][1] + t * (coords[curr_seg + 1][1] - coords[curr_seg][1])
        else:
            lon, lat = coords[curr_seg][0], coords[curr_seg][1]
            
        resampled.append([lon, lat])
        
    resampled.append(coords[-1])
    return resampled

MORELIA_TIER_PHRASES = [
    {
        "min": 85,
        "title": "Mapa Mental Moreliano",
        "phrases": [
            "Traes Morelia perfectamente trazada en la cabeza",            
            "Traes el GPS implantado en el cerebro, ¡Taxista!",
            "Manejas el trazado de las calles como si tú hubieras construido media ciudad",
            "Parece que creciste nadando en el Río Chiquito",
            "Se ve que si le sabes Lusitoo!",
            "Ese trazo trae brújula propia.",
            "Aquí hay talento cartográfico. El IMPLAN toma nota 👀"
        ]
    },
    {
        "min": 75,
        "title": "Rutero Moreliano",
        "phrases": [
            "Te ubicas perfecto sin necesidad de abrir Google Maps",
            "Sabes llegar a cualquier lado guiándote por la cantera",
            "Conoces la ciudad de memoria con una que otra duda razonable",
            "Reconoces la diferencia exacta entre Río Grande y Río Chiquito",
            "Una que otra curva se fue de paseo, pero vas muy bien.",
            "Morelia corre por tus venas, bien trazado"
        ]
    },
    {
        "min": 50,
        "title": "Perdido en el bosque Cuauhtémoc",
        "phrases": [
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
        "min": 30,
        "title": "Recién llegado a Morelia",
        "phrases": [
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
        "min": 15,
        "title": "Primer Paseo por Morelia",
        "phrases": [
            "Para ti Morelia empieza y termina en los Portales",
            "¿Seguro que no estabas dibujando Uruapan?",
            "¿Venías manejando con los ojos cerrados o ibas esquivando marchas en la Madero?",
            "Pensaste que el Río Grande era una calle peatonal",
            "Puede que el río haya tomado vacaciones, pero el siguiente trazo puede salir mejor",
            "La ciudad sigue ahí. Ahora hay que encontrarla",
            "Ni con Waze en la mano te salvas de esta, ¡vuelve a intentarlo!"
        ]
    }
]

def pick_phrase_and_tier(score: int) -> Tuple[str, str]:
    import random
    for tier in MORELIA_TIER_PHRASES:
        if score >= tier["min"]:
            phrase = random.choice(tier["phrases"])
            return phrase, tier["title"]
    return "¡Sigue practicando tu croquis de Morelia!", "Visitante"

def evaluate_stroke(drawn_points: List[List[float]], truth_points: List[List[float]], tolerance_scale: float = 500.0) -> Dict[str, Any]:
    """
    Evalúa la similitud entre el trazo del usuario y la geometría real con un modelo
    amigable, flexible y adaptado a la memoria espacial humana.
    - tolerance_scale: escala base de tolerancia en metros.
    """
    if len(drawn_points) < 2 or len(truth_points) < 2:
        phrase, title = pick_phrase_and_tier(0)
        return {
            "score": 0,
            "meanErrorMeters": 9999.0,
            "maxErrorMeters": 9999.0,
            "lengthRatio": 0.0,
            "tierTitle": title,
            "phrase": phrase,
            "truth": truth_points
        }
        
    num_samples = 100
    res_drawn = resample_polyline(drawn_points, num_samples)
    res_truth = resample_polyline(truth_points, num_samples)
    
    # 1. Distancia en sentido directo (A -> B)
    sum_dist_fwd = 0.0
    max_dist_fwd = 0.0
    for i in range(num_samples):
        d = haversine_distance_meters(res_drawn[i][0], res_drawn[i][1], res_truth[i][0], res_truth[i][1])
        sum_dist_fwd += d
        if d > max_dist_fwd:
            max_dist_fwd = d
    mean_dist_fwd = sum_dist_fwd / num_samples
    
    # 2. Distancia en sentido inverso (B -> A)
    res_truth_rev = res_truth[::-1]
    sum_dist_rev = 0.0
    max_dist_rev = 0.0
    for i in range(num_samples):
        d = haversine_distance_meters(res_drawn[i][0], res_drawn[i][1], res_truth_rev[i][0], res_truth_rev[i][1])
        sum_dist_rev += d
        if d > max_dist_rev:
            max_dist_rev = d
    mean_dist_rev = sum_dist_rev / num_samples
    
    # Seleccionar la mejor alineación de sentido (directo vs inverso)
    if mean_dist_fwd <= mean_dist_rev:
        mean_error = mean_dist_fwd
        max_error = max_dist_fwd
        res_truth_best = res_truth
    else:
        mean_error = mean_dist_rev
        max_error = max_dist_rev
        res_truth_best = res_truth_rev
    # Longitudes reales de los trazos
    len_drawn = path_length_meters(drawn_points)
    len_truth = path_length_meters(truth_points)

    # =========================================================================
    # PARÁMETROS DE CALIBRACIÓN: 3 INDICADORES (LARGO, FORMA Y UBICACIÓN)
    # Modifica estos valores para ajustar qué tan estricta es la evaluación.
    # =========================================================================
    # 1. INDICADOR DE LARGO (0 a 100 pts):
    #    Si dibuja al menos el 80% de la longitud real, obtiene 100 pts en largo.
    UMBRAL_LARGO_COMPLETO = 0.80

    # 2. INDICADOR DE UBICACIÓN (0 a 100 pts):
    #    - GRACIA_UBICACION_METROS: Si está a menos de esta distancia (100m = ~1 cuadra), saca 100 pts.
    #    - TOLERANCIA_UBICACION_METROS: Proporcional al tamaño real (8% de la longitud, mín. 600m).
    #      Para una calle corta de 2 km = 600m. Para el Libramiento de 26 km = ~2,100m.
    GRACIA_UBICACION_METROS = 100.0
    TOLERANCIA_UBICACION_METROS = max(len_truth * 0.08, 600.0)

    # 3. INDICADOR DE FORMA (0 a 100 pts): 
    #    - GRACIA_FORMA_METROS: Margen de flexibilidad para pequeñas irregularidades al dibujar a mano.
    #    - TOLERANCIA_FORMA_METROS: Tolerancia para la silueta (6% de la longitud, mín. 500m).
    GRACIA_FORMA_METROS = 100.0
    TOLERANCIA_FORMA_METROS = max(len_truth * 0.06, 500.0)

    # 4. PESOS DE CADA INDICADOR EN LA CALIFICACIÓN FINAL
    PESO_UBICACION = 0.65  
    PESO_FORMA     = 0.20   
    PESO_LARGO     = 0.15   
    # =========================================================================

    # 1. CÁLCULO DEL INDICADOR DE LARGO
    ratio_largo = (min(len_drawn, len_truth) / max(len_drawn, len_truth)) if max(len_drawn, len_truth) > 0 else 0.0
    
    if ratio_largo >= UMBRAL_LARGO_COMPLETO:
        score_largo = 100.0
    else:
        score_largo = 100.0 * (ratio_largo / UMBRAL_LARGO_COMPLETO)
    score_largo = max(0.0, min(100.0, score_largo))

    # 2. CÁLCULO DEL INDICADOR DE UBICACIÓN (Distancia al lugar real en Morelia)
    error_ubicacion = max(0.0, mean_error - GRACIA_UBICACION_METROS)
    score_ubicacion = 100.0 * math.exp(-math.pow(error_ubicacion / TOLERANCIA_UBICACION_METROS, 1.8))
    score_ubicacion = max(0.0, min(100.0, score_ubicacion))

    # 3. CÁLCULO DEL INDICADOR DE FORMA (Silueta centrada sin importar el desplazamiento)
    cx_drawn = sum(p[0] for p in res_drawn) / num_samples
    cy_drawn = sum(p[1] for p in res_drawn) / num_samples
    cx_truth = sum(p[0] for p in res_truth_best) / num_samples
    cy_truth = sum(p[1] for p in res_truth_best) / num_samples

    cos_lat = math.cos((cy_drawn + cy_truth) * 0.5 * math.pi / 180.0)
    sum_shape_err = 0.0
    for i in range(num_samples):
        dx_d = (res_drawn[i][0] - cx_drawn) * 111000 * cos_lat
        dy_d = (res_drawn[i][1] - cy_drawn) * 111000
        dx_t = (res_truth_best[i][0] - cx_truth) * 111000 * cos_lat
        dy_t = (res_truth_best[i][1] - cy_truth) * 111000
        sum_shape_err += math.hypot(dx_d - dx_t, dy_d - dy_t)

    shape_error_meters = sum_shape_err / num_samples
    error_forma = max(0.0, shape_error_meters - GRACIA_FORMA_METROS)
    score_forma = 100.0 * math.exp(-math.pow(error_forma / TOLERANCIA_FORMA_METROS, 1.8))
    score_forma = max(0.0, min(100.0, score_forma))

    # 4. CALIFICACIÓN FINAL COMBINADA
    score_base = (PESO_UBICACION * score_ubicacion) + (PESO_FORMA * score_forma) + (PESO_LARGO * score_largo)
    factor_completitud = min(1.0, ratio_largo / UMBRAL_LARGO_COMPLETO) if UMBRAL_LARGO_COMPLETO > 0 else 1.0
    final_score = int(round(score_base * factor_completitud))
    final_score = max(0, min(100, final_score))

    phrase, title = pick_phrase_and_tier(final_score)

    return {
        "score": final_score,
        "scoreUbicacion": int(round(score_ubicacion)),
        "scoreForma": int(round(score_forma)),
        "scoreLargo": int(round(score_largo)),
        "meanErrorMeters": round(mean_error, 1),
        "maxErrorMeters": round(max_error, 1),
        "shapeErrorMeters": round(shape_error_meters, 1),
        "lengthDrawnMeters": round(len_drawn, 1),
        "lengthTruthMeters": round(len_truth, 1),
        "lengthRatio": round(ratio_largo, 2),
        "tierTitle": title,
        "phrase": phrase,
        "truth": truth_points
    }
