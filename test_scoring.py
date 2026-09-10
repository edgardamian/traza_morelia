from scoring import evaluate_stroke, resample_polyline, haversine_distance_meters, pick_phrase_and_tier
import os
import json

from server import load_layers_data

layers = load_layers_data()


print("=== PRUEBAS DEL MOTOR DE SIMILITUD Y CALIFICACIÓN DE CROQUIS MORELIA ===")

for layer in layers:
    truth = layer["truthCoords"]
    tol = layer["toleranceScale"]
    name = layer["name"]
    
    # 1. Trazo exacto
    res_exact = evaluate_stroke(truth, truth, tol)
    print(f"\n[{name}] Trazo Exacto -> Score: {res_exact['score']}/100 | Error: {res_exact['meanErrorMeters']}m | Nivel: {res_exact['tierTitle']}")
    assert res_exact['score'] == 100, f"Expected 100 for exact match, got {res_exact['score']}"
    
    # 2. Trazo inverso (dibujado de derecha a izquierda en vez de izquierda a derecha)
    truth_rev = truth[::-1]
    res_rev = evaluate_stroke(truth_rev, truth, tol)
    print(f"[{name}] Trazo Invertido -> Score: {res_rev['score']}/100 | Error: {res_rev['meanErrorMeters']}m")
    assert res_rev['score'] == 100, f"Expected 100 for reversed match, got {res_rev['score']}"
    
    # 3. Trazo ligeramente desviado (~110m, ~1 cuadra de Morelia)
    shifted_slight = [[p[0], p[1] + 0.0010] for p in truth]
    res_slight = evaluate_stroke(shifted_slight, truth, tol)
    print(f"[{name}] Desviación 1 Cuadra (111m) -> Score: {res_slight['score']}/100 | Error: {res_slight['meanErrorMeters']}m | Nivel: {res_slight['tierTitle']}")
    assert res_slight['score'] >= 60, f"Expected >= 60 for 1-block error, got {res_slight['score']}"
    
    # 4. Caso límite: Dibujar solo un puntito o 50m en una capa larga
    stub = [truth[0], [truth[0][0] + 0.0005, truth[0][1] + 0.0005]]
    res_stub = evaluate_stroke(stub, truth, tol)
    print(f"[{name}] Intento de trampa (trazo de 50m) -> Score: {res_stub['score']}/100 | Ratio: {res_stub['lengthRatio']}")
    assert res_stub['score'] <= 25, f"Expected penalty score <= 25, got {res_stub['score']}"

print("\n¡Todas las pruebas de calificación matemática pasaron con éxito total!")
