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
        "title": "Moreliano Taxista",
        "phrases": [
            "Traes el GPS implantado en el cerebro, ¡le atinaste hasta a los baches!",
            "Manejas el trazado de las calles como si tú hubieras construido media ciudad",
            "Parece que creciste nadando en el Río Chiquito (cuando estaba limpio)",
            "Se ve que si le sabes Lusitoo!",
            "Deberías de trabajar en SEDUM y Tránsito Municipal"
        ]
    },
    {
        "min": 75,
        "title": "Maestro de Obra del Libramiento",
        "phrases": [
            "Te ubicas perfecto sin necesidad de abrir Google Maps",
            "Sabes llegar a cualquier lado guiándote por la cantera",
            "Conoces la ciudad de memoria con una que otra duda razonable",
            "Reconoces la diferencia exacta entre Río Grande y Río Chiquito",
            "Morelia corre por tus venas, bien trazado"
        ]
    },
    {
        "min": 50,
        "title": "Turista Perdido en el bosque Cuauhtémoc",
        "phrases": [
            "Te ubicas en el Centro, pero te pierdes pasando el Libramiento",
            "Sabes llegar en Combi, pero no sabes cómo dibujarlo",
            "Casi le atinas, la cantera te guio a medias",
            "Si no ves la Catedral te desorientas un poquito",
            "Pasable, aunque el río te quedó un poco chueco"
        ]
    },
    {
        "min": 30,
        "title": "Foráneo en Examen de Admisión",
        "phrases": [
            "Confundes Las Tarascas con el Obelisco a Lázaro Cárdenas",
            "Tu río se fue a desembocar hasta Pátzcuaro",
            "Mandaste el Acueducto rumbo a Altozano",
            "Te fuiste a meter a Tarímbaro sin querer",
            "Con este croquis hasta la Combi gris se perdería"
        ]
    },
    {
        "min": 15,
        "title": "Visitante de Domingo en el Centro",
        "phrases": [
            "Para ti Morelia empieza y termina en los Portales",
            "¿Seguro que no estabas dibujando Uruapan?",
            "¿Venías manejando con los ojos cerrados o ibas esquivando marchas en Madero?",
            "Pensaste que el Río Grande era una calle peatonal",
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
    
    # Seleccionar la mejor alineación de sentido
    if mean_dist_fwd <= mean_dist_rev:
        mean_error = mean_dist_fwd
        max_error = max_dist_fwd
    else:
        mean_error = mean_dist_rev
        max_error = max_dist_rev
        
    # =========================================================================
    # =========================================================================
    # PARÁMETROS DE CALIBRACIÓN MANUAL (AJUSTA ESTOS VALORES PARA CAMBIAR LA DIFICULTAD)
    # =========================================================================
    # 1. MARGEN DE GRACIA (en metros):
    #    Si el error promedio del usuario es menor a esta distancia, NO se le restan puntos.
    #    (180.0m equivale a ~1.5 cuadras de Morelia. 250m = muy fácil, 80m = más difícil).
    GRACE_DISTANCE_METERS = 180.0

    # 2. MULTIPLICADOR DE TOLERANCIA POR CAPA:
    #    Multiplica la escala base de cada capa geográfica.
    #    (Mayor valor = calificaciones más altas para trazos desviados. Rango sugerido: 2.0 a 4.5).
    TOLERANCE_MULTIPLIER = 3.5

    # 3. TOLERANCIA MÍNIMA GENERAL (en metros):
    #    Garantiza una base generosa para todas las capas sin importar su tamaño.
    #    (Rango sugerido: 600.0 a 1200.0).
    MIN_TOLERANCE_METERS = 900.0

    # 4. EXPONENTE DE CURVA DE CAÍDA (FORMA DE LA NOTA):
    #    Controla qué tan rápido caen los puntos al alejarse de la línea.
    #    (1.8 o 2.0 crea una 'meseta' donde trazos cercanos sacan 90-100 pts. 1.0 cae rápido).
    DECAY_POWER = 1.8

    # 5. UMBRAL DE LONGITUD PARA CALIFICACIÓN COMPLETA (0.0 a 1.0):
    #    Si el usuario dibuja al menos este porcentaje de la longitud total (ej. 60%),
    #    recibe el 100% de los puntos de longitud (no se penaliza por faltar 1 o 2 cuadras al final).
    MIN_LENGTH_RATIO_FULL_CREDIT = 0.60
    # =========================================================================

    # 3. Factor de penalización por longitud
    len_drawn = path_length_meters(drawn_points)
    len_truth = path_length_meters(truth_points)
    
    if len_truth > 0 and len_drawn > 0:
        ratio = min(len_drawn, len_truth) / max(len_drawn, len_truth)
        if ratio >= MIN_LENGTH_RATIO_FULL_CREDIT:
            length_penalty = 1.0
        else:
            # Caída progresiva si solo dibujó un fragmento o punto
            length_penalty = math.pow(ratio / MIN_LENGTH_RATIO_FULL_CREDIT, 1.2)
    else:
        length_penalty = 0.0
        
    # 4. Cálculo de puntaje flexible con zona de gracia
    effective_error = max(0.0, mean_error - GRACE_DISTANCE_METERS)
    eff_scale = max(tolerance_scale * TOLERANCE_MULTIPLIER, MIN_TOLERANCE_METERS)
    norm_err = effective_error / eff_scale
    
    raw_score = 100.0 * math.exp(-math.pow(norm_err, DECAY_POWER))
    
    final_score = int(round(raw_score * length_penalty))
    final_score = max(0, min(100, final_score))
    
    phrase, title = pick_phrase_and_tier(final_score)
    
    return {
        "score": final_score,
        "meanErrorMeters": round(mean_error, 1),
        "maxErrorMeters": round(max_error, 1),
        "lengthDrawnMeters": round(len_drawn, 1),
        "lengthTruthMeters": round(len_truth, 1),
        "lengthRatio": round(length_penalty, 2),
        "tierTitle": title,
        "phrase": phrase,
        "truth": truth_points
    }
