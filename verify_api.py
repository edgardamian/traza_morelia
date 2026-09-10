import urllib.request
import json

base = 'http://127.0.0.1:8000'

# 1. Test Layers
layers = json.loads(urllib.request.urlopen(f'{base}/api/layers').read().decode('utf-8'))
print(f'1. GET /api/layers: {len(layers)} capas disponibles ({[l["name"] for l in layers]})')
assert len(layers) > 0, "No layers loaded"
first_layer = layers[0]

# 2. Test Anchors
anchors = json.loads(urllib.request.urlopen(f'{base}/api/anchors').read().decode('utf-8'))
print(f'2. GET /api/anchors: {len(anchors)} puntos de ancla ({[a["name"] for a in anchors[:4]]}...)')

# 3. Test Valle
valle = json.loads(urllib.request.urlopen(f'{base}/api/valle').read().decode('utf-8'))
print(f'3. GET /api/valle: {len(valle["features"])} features en GeoJSON')

# 4. Test Score for First Layer
req_data = json.dumps({
    'lineId': first_layer['id'],
    'points': [
        [-101.1715, 19.6970], [-101.1765, 19.6985], [-101.1825, 19.7009], [-101.1874, 19.7023]
    ]
}).encode('utf-8')
req = urllib.request.Request(f'{base}/api/score', data=req_data, headers={'Content-Type': 'application/json'})
score_res = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))
print(f'4. POST /api/score ({first_layer["name"]}): {score_res["score"]}/100 | Nivel: {score_res["tierTitle"]} | Frase: "{score_res["phrase"]}"')

# 4b. Test Score with Alias (e.g. 'acueducto')
req_alias_data = json.dumps({
    'lineId': 'acueducto',
    'points': [
        [-101.1715, 19.6970], [-101.1765, 19.6985], [-101.1825, 19.7009], [-101.1874, 19.7023]
    ]
}).encode('utf-8')
req_alias = urllib.request.Request(f'{base}/api/score', data=req_alias_data, headers={'Content-Type': 'application/json'})
score_alias_res = json.loads(urllib.request.urlopen(req_alias).read().decode('utf-8'))
print(f'4b. POST /api/score (Alias "acueducto"): {score_alias_res["score"]}/100 | Nivel: {score_alias_res["tierTitle"]}')

# 5. Test Session Save
sess_data = json.dumps({
    'clientId': 'test-user-morelia',
    'lines': {
        first_layer['id']: [[-101.1715, 19.6970], [-101.1874, 19.7023]],
        'rio-chiquito': [[-101.1480, 19.6720], [-101.1930, 19.6880], [-101.2268, 19.7075]]
    },
    'metadata': {'difficulty': 'normal'}
}).encode('utf-8')
req2 = urllib.request.Request(f'{base}/api/session', data=sess_data, headers={'Content-Type': 'application/json'})
sess_res = json.loads(urllib.request.urlopen(req2).read().decode('utf-8'))
print(f'5. POST /api/session: {sess_res["status"]} -> Score Global: {sess_res["globalScore"]}')

# 6. Test Stats
stats = json.loads(urllib.request.urlopen(f'{base}/api/stats').read().decode('utf-8'))
print(f'6. GET /api/stats: {stats["totalMapsDrawn"]} croquis guardados para investigacion urbana.')
