import urllib.request
import json

base = "http://127.0.0.1:8000"

endpoints = [
    ("/", "text/html"),
    ("/static/style.css", "text/css"),
    ("/static/app.js", "application/javascript"),
    ("/static/vendor/d3.v7.min.js", "application/javascript"),
    ("/api/layers", "application/json"),
    ("/api/anchors", "application/json"),
    ("/api/valle", "application/json"),
    ("/api/pol_morelia", "application/json"),
    ("/data/pol_morelia.geojson", "application/json"),
    ("/api/stats", "application/json"),
    ("/api/verdict?score=85", "application/json")
]

print("=== VERIFICACION INTEGRAL DE RECURSOS Y SERVICIOS DE CROQUIS MORELIA ===")

for path, expected_type in endpoints:
    url = f"{base}{path}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        code = resp.getcode()
        length = len(resp.read())
        print(f"[OK] {path:30} -> Status {code} | {length:7} bytes")
        assert code == 200, f"Expected 200 for {path}, got {code}"

print("\nTodos los archivos estaticos, librerias y endpoints API responden 200 OK!")
