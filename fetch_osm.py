import urllib.request
import urllib.parse
import json

def fetch_overpass(query):
    url = "https://overpass-api.de/api/interpreter"
    data = urllib.parse.urlencode({'data': query}).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'User-Agent': 'CroquisMorelia/1.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))

# Bounding box for Morelia urban area: [19.60, -101.30, 19.78, -101.10]
query = """[out:json][timeout:30];
(
  way["name"="Río Chiquito"](19.65,-101.25,19.72,-101.12);
  way["name"="Río Grande"](19.68,-101.30,19.76,-101.10);
  way["historic"="aqueduct"](19.68,-101.22,19.72,-101.15);
  way["name"="Calzada Fray Antonio de San Miguel"](19.69,-101.20,19.71,-101.17);
  way["name"="Avenida Francisco I. Madero Oriente"](19.69,-101.22,19.72,-101.14);
  way["name"="Avenida Francisco I. Madero Poniente"](19.69,-101.26,19.72,-101.18);
  relation["boundary"="administrative"]["admin_level"="8"]["name"="Morelia"];
);
out geom;
"""

try:
    data = fetch_overpass(query)
    print(f"Total elements: {len(data.get('elements', []))}")
    for elem in data.get('elements', []):
        tags = elem.get('tags', {})
        print(f"- {elem.get('type')}: {tags.get('name')} | {tags.get('historic')} | {tags.get('waterway')} | {tags.get('highway')}")
except Exception as e:
    print(f"Error fetching: {e}")
