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
    return "¡Sigue paseando por Morelia es la única forma de conocerla!", "Turista primeriso"

def get_cumulative_distances(coords: List[List[float]]) -> List[float]:
    """Calcula la distancia acumulada en metros para cada vértice de una polilínea."""
    cum = [0.0]
    for i in range(1, len(coords)):
        d = haversine_distance_meters(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1])
        cum.append(cum[-1] + d)
    return cum

def project_point_on_polyline(px: float, py: float, coords: List[List[float]], cum_dist: List[float]) -> Tuple[float, float]:
    """
    Proyecta ortogonalmente un punto (px, py) sobre la polilínea coords.
    Retorna:
    - Distancia mínima en metros al segmento más cercano.
    - Fracción de longitud de arco (0.0 a 1.0) a lo largo de la polilínea.
    """
    best_dist = float("inf")
    best_arc = 0.0
    total_len = cum_dist[-1]
    
    for i in range(len(coords) - 1):
        ax, ay = coords[i]
        bx, by = coords[i+1]
        dx = (bx - ax) * 111000.0 * math.cos(py * math.pi / 180.0)
        dy = (by - ay) * 111000.0
        dpx = (px - ax) * 111000.0 * math.cos(py * math.pi / 180.0)
        dpy = (py - ay) * 111000.0
        seg_len_sq = dx * dx + dy * dy
        if seg_len_sq == 0.0:
            d = math.hypot(dpx, dpy)
            t = 0.0
        else:
            t = max(0.0, min(1.0, (dpx * dx + dpy * dy) / seg_len_sq))
            proj_x = dpx - t * dx
            proj_y = dpy - t * dy
            d = math.hypot(proj_x, proj_y)
            
        if d < best_dist:
            best_dist = d
            seg_len = math.sqrt(seg_len_sq)
            best_arc = cum_dist[i] + t * seg_len
            
    frac = best_arc / total_len if total_len > 0.0 else 0.0
    return best_dist, frac

def extract_subpolyline_by_arc(coords: List[List[float]], cum_dist: List[float], start_frac: float, end_frac: float) -> List[List[float]]:
    """Extrae el sub-tramo continuo de la polilínea entre dos fracciones de longitud de arco."""
    total_len = cum_dist[-1]
    d_start = start_frac * total_len
    d_end = end_frac * total_len
    if d_start > d_end:
        d_start, d_end = d_end, d_start
        reverse = True
    else:
        reverse = False
        
    pts = []
    # Punto de inicio interpolado
    for i in range(len(coords) - 1):
        if cum_dist[i] <= d_start <= cum_dist[i+1]:
            seg_len = cum_dist[i+1] - cum_dist[i]
            t = (d_start - cum_dist[i]) / seg_len if seg_len > 0.0 else 0.0
            pts.append([coords[i][0] + t * (coords[i+1][0] - coords[i][0]),
                        coords[i][1] + t * (coords[i+1][1] - coords[i][1])])
            break
            
    # Vértices intermedios reales
    for i in range(len(coords)):
        if d_start < cum_dist[i] < d_end:
            pts.append(coords[i])
            
    # Punto final interpolado
    for i in range(len(coords) - 1):
        if cum_dist[i] <= d_end <= cum_dist[i+1]:
            seg_len = cum_dist[i+1] - cum_dist[i]
            t = (d_end - cum_dist[i]) / seg_len if seg_len > 0.0 else 0.0
            pts.append([coords[i][0] + t * (coords[i+1][0] - coords[i][0]),
                        coords[i][1] + t * (coords[i+1][1] - coords[i][1])])
            break
            
    if len(pts) < 2:
        pts = [coords[0], coords[-1]]
    if reverse:
        pts = pts[::-1]
    return pts

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
    len_drawn = path_length_meters(drawn_points)
    len_truth = path_length_meters(truth_points)
    
    # Detectar si es un circuito cerrado o anillo (inicio y fin cercanos a menos de 600m, ej. El Libramiento)
    is_loop = haversine_distance_meters(truth_points[0][0], truth_points[0][1], truth_points[-1][0], truth_points[-1][1]) < 600.0

    if is_loop:
        res_truth = resample_polyline(truth_points, num_samples)
        best_mean = float("inf")
        res_truth_best = res_truth

        for candidate in [res_truth, res_truth[::-1]]:
            for k in range(num_samples):
                shifted = candidate[k:] + candidate[:k]
                sum_d = sum(haversine_distance_meters(res_drawn[i][0], res_drawn[i][1], shifted[i][0], shifted[i][1]) for i in range(num_samples))
                mean_d = sum_d / num_samples
                if mean_d < best_mean:
                    best_mean = mean_d
                    res_truth_best = shifted
        mean_error = best_mean
        max_error = max(haversine_distance_meters(res_drawn[i][0], res_drawn[i][1], res_truth_best[i][0], res_truth_best[i][1]) for i in range(num_samples))
    else:
        # 1. Comparación contra el trazo completo (sentido directo e inverso)
        res_truth_full = resample_polyline(truth_points, num_samples)
        err_fwd_full = sum(haversine_distance_meters(res_drawn[i][0], res_drawn[i][1], res_truth_full[i][0], res_truth_full[i][1]) for i in range(num_samples)) / num_samples
        res_truth_rev = res_truth_full[::-1]
        err_rev_full = sum(haversine_distance_meters(res_drawn[i][0], res_drawn[i][1], res_truth_rev[i][0], res_truth_rev[i][1]) for i in range(num_samples)) / num_samples
        best_full = min(err_fwd_full, err_rev_full)
        best_truth = res_truth_full if err_fwd_full <= err_rev_full else res_truth_rev
        
        # 2. Alineación por sub-tramo: detecta si el usuario dibujó con gran precisión un tramo sustancial
        # (ej. trazar el Río Chiquito desde Monumento a Filtros Viejos sin desfase artificial por no trazar Tres Puentes)
        cum = get_cumulative_distances(truth_points)
        d0, s0 = project_point_on_polyline(res_drawn[0][0], res_drawn[0][1], truth_points, cum)
        d1, s1 = project_point_on_polyline(res_drawn[-1][0], res_drawn[-1][1], truth_points, cum)
        
        arc_coverage = abs(s1 - s0)
        max_endpoint_dist = max(d0, d1)
        if arc_coverage > 0.10 and max_endpoint_dist < tolerance_scale * 2.5:
            sub_truth = extract_subpolyline_by_arc(truth_points, cum, s0, s1)
            res_sub = resample_polyline(sub_truth, num_samples)
            err_fwd_sub = sum(haversine_distance_meters(res_drawn[i][0], res_drawn[i][1], res_sub[i][0], res_sub[i][1]) for i in range(num_samples)) / num_samples
            err_rev_sub = sum(haversine_distance_meters(res_drawn[i][0], res_drawn[i][1], res_sub[::-1][i][0], res_sub[::-1][i][1]) for i in range(num_samples)) / num_samples
            best_sub = min(err_fwd_sub, err_rev_sub)
            if best_sub < best_full:
                mean_error = best_sub
                res_truth_best = res_sub if err_fwd_sub <= err_rev_sub else res_sub[::-1]
            else:
                mean_error = best_full
                res_truth_best = best_truth
        else:
            mean_error = best_full
            res_truth_best = best_truth
            
        max_error = max(haversine_distance_meters(res_drawn[i][0], res_drawn[i][1], res_truth_best[i][0], res_truth_best[i][1]) for i in range(num_samples))

    # =========================================================================
    # PARÁMETROS DE CALIBRACIÓN: 3 INDICADORES (LARGO, FORMA Y UBICACIÓN)
    # =========================================================================
    # 1. INDICADOR DE LARGO:
    #    Si dibuja al menos el 50% de la longitud real, obtiene 100 pts en largo
    #    (reconoce el tramo urbano principal en su mapa mental sin penalización).
    UMBRAL_LARGO_COMPLETO = 0.50

    # 2. INDICADOR DE UBICACIÓN (Distancia al lugar real en Morelia):
    #    - GRACIA_UBICACION_METROS: Si está a menos de 100m (~1 cuadra), saca 100 pts.
    #    - TOLERANCIA_UBICACION_METROS: Proporcional al tamaño real (8% de longitud, mín 600m).
    GRACIA_UBICACION_METROS = 100.0
    TOLERANCIA_UBICACION_METROS = max(len_truth * 0.08, 600.0)

    # 3. INDICADOR DE FORMA:
    #    - GRACIA_FORMA_METROS: Margen de flexibilidad para dibujo a mano alzada.
    #    - TOLERANCIA_FORMA_METROS: Margen de silueta (6% de longitud, mín 500m).
    GRACIA_FORMA_METROS = 200.0
    TOLERANCIA_FORMA_METROS = max(len_truth * 0.06, 500.0)

    # 4. PESOS DE CADA INDICADOR EN LA CALIFICACIÓN FINAL
    PESO_UBICACION = 0.80
    PESO_FORMA     = 0.10
    PESO_LARGO     = 0.10
    # =========================================================================

    # 1. CÁLCULO DEL INDICADOR DE LARGO
    ratio_largo = (min(len_drawn, len_truth) / max(len_drawn, len_truth)) if max(len_drawn, len_truth) > 0.0 else 0.0
    score_largo = 100.0 * min(1.0, ratio_largo / UMBRAL_LARGO_COMPLETO) if UMBRAL_LARGO_COMPLETO > 0.0 else 100.0
    score_largo = max(0.0, min(100.0, score_largo))

    # 2. CÁLCULO DEL INDICADOR DE UBICACIÓN
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
        dx_d = (res_drawn[i][0] - cx_drawn) * 111000.0 * cos_lat
        dy_d = (res_drawn[i][1] - cy_drawn) * 111000.0
        dx_t = (res_truth_best[i][0] - cx_truth) * 111000.0 * cos_lat
        dy_t = (res_truth_best[i][1] - cy_truth) * 111000.0
        sum_shape_err += math.hypot(dx_d - dx_t, dy_d - dy_t)

    shape_error_meters = sum_shape_err / num_samples
    error_forma = max(0.0, shape_error_meters - GRACIA_FORMA_METROS)
    score_forma = 100.0 * math.exp(-math.pow(error_forma / TOLERANCIA_FORMA_METROS, 1.8))
    score_forma = max(0.0, min(100.0, score_forma))

    # 4. CALIFICACIÓN FINAL COMBINADA
    score_base = (PESO_UBICACION * score_ubicacion) + (PESO_FORMA * score_forma) + (PESO_LARGO * score_largo)
    
    # Factor de completitud con curva cóncava suave:
    # No castiga de forma desmedida trazos reales de 50%-70%, pero neutraliza trazos de trampa diminutos (<50m).
    factor_completitud = min(1.0, math.sqrt(ratio_largo / UMBRAL_LARGO_COMPLETO)) if UMBRAL_LARGO_COMPLETO > 0.0 else 1.0
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
