import os
from flask import Flask, jsonify, request, send_from_directory
import random
# import google.generativeai as genai

app = Flask(__name__, static_folder='.')

# --- MOCK LOCATIONS (FOR DEMO PURPOSES) ---
LOCATIONS = {
    "start": (19.0760, 72.8777),  # Mumbai
    "end": (19.0896, 72.8656)
}

def generate_mock_routes(start_lat, start_lng, end_lat, end_lng):
    """
    Generates 3 mock routes compatible with frontend expectations
    """

    return [
        {
            "id": "r_green",
            "name": "Main Route (Green)",
            "time": "9 min",
            "dist": "7.4 km",
            "safetyScore": 98,
            "level": "safe",
            "colorCode": "#22c55e",
            "polylines": {
                "type": "LineString",
                "coordinates": [
                    [start_lng, start_lat],
                    [(start_lng + end_lng) / 2, (start_lat + end_lat) / 2],
                    [end_lng, end_lat]
                ]
            }
        },
        {
            "id": "r_yellow",
            "name": "Walker's Path (Yellow)",
            "time": "9 min",
            "dist": "7.4 km",
            "safetyScore": 85,
            "level": "moderate",
            "colorCode": "#eab308",
            "polylines": {
                "type": "LineString",
                "coordinates": [
                    [start_lng, start_lat],
                    [start_lng + 0.01, start_lat + 0.005],
                    [end_lng, end_lat]
                ]
            }
        },
        {
            "id": "r_red",
            "name": "Shortcut (Red)",
            "time": "13 min",
            "dist": "9.4 km",
            "safetyScore": 60,
            "level": "risky",
            "colorCode": "#ef4444",
            "polylines": {
                "type": "LineString",
                "coordinates": [
                    [start_lng, start_lat],
                    [start_lng - 0.01, start_lat - 0.005],
                    [end_lng, end_lat]
                ]
            }
        }
    ]


# ================================
# COMMUNITY SAFETY DATA (GLOBAL)
# ================================

# Current safety score visible to all women
# Base (original) safety score for each route
# Community adjustment per unique route
# Example key: "Mumbai|Andheri|Bandra|r_red"
route_adjustments = {}

def make_route_key(start, end, route_id):
    return f"{start}->{end}:{route_id}"


# Store all ratings (1–5) given by women
route_ratings = {
    "r_green": [],
    "r_yellow": [],
    "r_red": []
}



# --- CONFIGURATION ---
# Replace with your actual Gemini API key or set it as an environment variable
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY") 

# if GEMINI_API_KEY != "YOUR_GEMINI_API_KEY":
#     genai.configure(api_key=GEMINI_API_KEY)

# ... (omitted mock data) ...

# --- ROUTES ---

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)

@app.route('/api/get_routes', methods=['POST'])
def get_routes():
    data = request.json
    # In a real app, we'd use Google Maps Directions API here to get actual polylines
    # For this hackathon MVP, we generate mock paths based on start point
    # We ignore the actual text input for coords but use them to generate "variations"
    
    # Just for demo, use the global LOCATIONS or fallback
    # In a real app we would geocode the user's text input
    start_lat = LOCATIONS['start'][0]
    start_lng = LOCATIONS['start'][1]
    end_lat = LOCATIONS['end'][0]
    end_lng = LOCATIONS['end'][1]
    
    routes = generate_mock_routes(start_lat, start_lng, end_lat, end_lng)
    return jsonify({"routes": routes})

@app.route("/api/get_adjustment", methods=["POST"])
def get_adjustment():
    data = request.json
    route_key = make_route_key(
        data["start"],
        data["end"],
        data["route_id"]
    )
    return jsonify({
        "adjustment": route_adjustments.get(route_key, 0)
    })


@app.route('/api/analyze_safety', methods=['POST'])
def analyze_safety():
    data = request.json
    route_id = data.get('route_id')
    features = data.get('features', [])
    safety_score = data.get('safety_score')
    
    prompt = f"""
    Act as a safety expert for a pedestrian navigation app.
    Analyze the following route attributes:
    - Safety Score: {safety_score}/100
    - Environmental Features: {', '.join(features)}
    
    Provide a concise (2-3 sentences) safety advice warning or recommendation for a user walking this route alone at night.
    """
    
    if GEMINI_API_KEY == "YOUR_GEMINI_API_KEY":
        # Fallback if no key provided
        advice = "Gemini API Key missing. Simulation: "
        if safety_score > 80:
            advice += "This route is well-lit and populated. It is the recommended choice for safety."
        elif safety_score < 50:
            advice += "Caution: This route has poor lighting and isolation. Avoid if traveling alone at night."
        else:
            advice += "Moderate risk. Stay alert and keep to main paths where possible."
        return jsonify({"analysis": advice})
    
    # Gemini AI disabled for hackathon demo
        return jsonify({
    "analysis": "AI analysis unavailable. Safety score is based on community reports from women travelers."
})
    
@app.route("/api/rate_route", methods=["POST"])
def rate_route():
    data = request.json
    route_id = data["route_id"]
    rating = int(data["rating"])
    start = data["start"]
    end = data["end"]

    route_key = make_route_key(start, end, route_id)

    # Initialize adjustment if first time
    if route_key not in route_adjustments:
        route_adjustments[route_key] = 0

    # Gradual adjustment logic
    if rating == 1:
        delta = -10
    elif rating == 2:
        delta = -8
    elif rating == 3:
        delta = 0
    elif rating == 4:
        delta = +3
    else:
        delta = +5

    route_adjustments[route_key] += delta

    return jsonify({"status": "ok"})


@app.route("/api/get_scores", methods=["GET"])
def get_scores():
    return jsonify(route_scores)


if __name__ == '__main__':
    app.run(debug=True)
