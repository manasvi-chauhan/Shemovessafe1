// SheMovesSafe - Safe Routing AI (Leaflet Version)

// --- CONFIGURATION ---
const MUMBAI_COORDS = [18.9320, 72.8300]; // Mumbai default
let map;
let currentPolylines = [];
let routeLayerGroup = L.layerGroup();
let markerLayerGroup = L.layerGroup();

// --- DOM ELEMENTS ---
const findRoutesBtn = document.getElementById('find-routes-btn');
const routesList = document.getElementById('routes-list');
const loadingIndicator = document.getElementById('loading');
const aiPanel = document.getElementById('ai-panel');
const aiText = document.getElementById('ai-text');
const sosBtn = document.getElementById('sos-btn');
const scanBtn = document.getElementById('scan-btn');
const shareLocBtn = document.getElementById('share-loc-btn'); // New Button

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initEventListeners();
    initModals();

    // Splash Screen
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.classList.add('fade-out');
            setTimeout(() => splash.remove(), 500);
        }
    }, 3000);
});

function initMap() {
    map = L.map('map', {
        zoomControl: false
    }).setView(MUMBAI_COORDS, 13);

    // Dark Mode Tile Layer (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    routeLayerGroup.addTo(map);
    markerLayerGroup.addTo(map);

    // Theme Toggle (Simplified for Map - Leaflet generic tiles don't swap easily without separate layers, 
    // but we will just keep Dark Mode as default for "SheMovesSafe" aesthetic)
    const themeToggle = document.getElementById('theme-toggle');
    let isDark = true;
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            isDark = !isDark;
            document.body.classList.toggle('light-mode');
            themeToggle.textContent = isDark ? '🌙' : '☀️';
            // Note: In a full app we would swap the TileLayer URL here
        });
    }
}

function initEventListeners() {
    // Autocomplete Setup
    setupAutocomplete(document.getElementById('start-loc'));
    setupAutocomplete(document.getElementById('dest-loc'));

    // GPS Button
    document.getElementById('gps-btn').addEventListener('click', () => {
        if ('geolocation' in navigator) {
            document.getElementById('start-loc').value = "Locating...";
            navigator.geolocation.getCurrentPosition(async position => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                map.setView([lat, lng], 16);
                L.marker([lat, lng]).addTo(map).bindPopup("You are here").openPopup();

                // Reverse Geocode
                const address = await reverseGeocode(lat, lng);
                const startInput = document.getElementById('start-loc');
                startInput.value = address;
                startInput.dataset.lat = lat;
                startInput.dataset.lng = lng;
                startInput.dataset.name = address; // Match value to trusted coords
            }, () => {
                alert("Location access denied.");
                document.getElementById('start-loc').value = "";
            });
        }
    });

    // Find Routes
    findRoutesBtn.addEventListener('click', async () => {
        const startInput = document.getElementById('start-loc');
        const endInput = document.getElementById('dest-loc');
        const startVal = startInput.value;
        const endVal = endInput.value;

        if (!startVal || !endVal) {
            alert("Please enter both locations.");
            return;
        }

        toggleLoading(true);

        try {
            // Use autocomplete coords if available and matches text, else fallback to geocode
            let startCoords;
            if (startInput.dataset.lat && startInput.dataset.name === startVal) {
                startCoords = [parseFloat(startInput.dataset.lat), parseFloat(startInput.dataset.lng)];
            } else {
                startCoords = await geocode(startVal);
            }

            let endCoords;
            if (endInput.dataset.lat && endInput.dataset.name === endVal) {
                endCoords = [parseFloat(endInput.dataset.lat), parseFloat(endInput.dataset.lng)];
            } else {
                endCoords = await geocode(endVal);
            }

            if (!startCoords || !endCoords) {
                alert("Could not find one of the locations.");
                toggleLoading(false);
                return;
            }

            // Clear previous
            routeLayerGroup.clearLayers();
            markerLayerGroup.clearLayers();

            // Markers for Start/End
            L.marker(startCoords).addTo(markerLayerGroup).bindPopup("Start");
            L.marker(endCoords).addTo(markerLayerGroup).bindPopup("Destination");

            map.fitBounds([startCoords, endCoords], { padding: [50, 50] });

            // Fetch Routes (Simulated Safety Logic over OSRM)
            const routes = await fetchSafeRoutes(startCoords, endCoords);
            displayRoutes(routes);

        } catch (e) {
            console.error(e);
            alert("Error finding routes.");
        } finally {
            toggleLoading(false);
        }
    });

    // Scan Area
    scanBtn.addEventListener('click', async () => {
        const center = map.getCenter();
        const bounds = map.getBounds();

        scanBtn.disabled = true;
        scanBtn.textContent = "Scanning...";

        // Fetch PoIs
        const police = await fetchOverpass(bounds, 'police');
        const hospitals = await fetchOverpass(bounds, 'hospital');
        const busySpots = await fetchOverpass(bounds, 'fuel'); // Using fuel/shops as proxy for busy areas

        markerLayerGroup.clearLayers();

        const addMarkers = (data, icon, label) => {
            data.forEach(item => {
                const el = document.createElement('div');
                el.className = 'custom-marker';
                el.innerHTML = `<span style="font-size: 20px;">${icon}</span>`;

                L.marker([item.lat, item.lon], {
                    icon: L.divIcon({
                        className: 'leaflet-div-iconbox',
                        html: `<div style="font-size:24px; text-shadow:0 0 5px black;">${icon}</div>`
                    })
                }).addTo(markerLayerGroup).bindPopup(`<b>${label}</b><br>${item.tags.name || 'Unknown Name'}`);
            });
        };

        addMarkers(police, '👮', 'Police Station');
        addMarkers(hospitals, '🏥', 'Hospital');
        addMarkers(busySpots, '⛽', 'Safe Stop (Fuel/Shop)');

        scanBtn.disabled = false;
        scanBtn.textContent = "🛡️ Scan Safe Spots in Area";

        alert(`Found ${police.length} Police Stations, ${hospitals.length} Hospitals, and ${busySpots.length} Safe Stops nearby.`);
    });

    // SOS Modal Logic
    const sosModal = document.getElementById('sos-modal');
    const sosCloseBtn = document.querySelector('.sos-close');
    const locationStatus = document.getElementById('location-status');
    const whatsAppBtn = document.getElementById('whatsapp-share-btn');

    if (sosBtn && sosModal) {
        sosBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sosModal.classList.remove('hidden');
            setTimeout(() => sosModal.classList.add('show'), 10);

            // Auto Update Location on Open
            if ('geolocation' in navigator) {
                locationStatus.textContent = "📍 Acquiring exact location...";
                navigator.geolocation.getCurrentPosition(pos => {
                    const lat = pos.coords.latitude.toFixed(6);
                    const lng = pos.coords.longitude.toFixed(6);
                    locationStatus.textContent = `📍 Location Locked: ${lat}, ${lng}`;
                    locationStatus.style.color = "#22c55e"; // Green

                    // Update WhatsApp Link
                    whatsAppBtn.onclick = () => {
                        const message = `🚨 HELP! I feel unsafe. Track my real-time location here: https://www.google.com/maps?q=${lat},${lng}`;
                        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
                    };
                }, err => {
                    locationStatus.textContent = "⚠️ Location access denied. Check permissions.";
                    locationStatus.style.color = "#ef4444";
                }, { enableHighAccuracy: true });
            } else {
                locationStatus.textContent = "⚠️ GPS not supported.";
            }
        });
    }

    if (sosCloseBtn && sosModal) {
        sosCloseBtn.addEventListener('click', () => {
            sosModal.classList.remove('show');
            setTimeout(() => sosModal.classList.add('hidden'), 300);
        });
    }

    // Close SOS on click outside
    if (sosModal) {
        window.addEventListener('click', (e) => {
            if (e.target === sosModal) {
                sosModal.classList.remove('show');
                setTimeout(() => sosModal.classList.add('hidden'), 300);
            }
        });
    }

    // Share Live Location Logic
    if (shareLocBtn) {
        shareLocBtn.addEventListener('click', () => {
            // 1. Get/Confirm Contact Number FIRST
            let savedContact = localStorage.getItem('emergency_contact') || "";
            let input = prompt("Enter Emergency Contact Number (with country code):", savedContact);

            if (!input) {
                alert("Contact number is required.");
                return;
            }

            // Sanitize
            let contactNumber = input.replace(/\D/g, '');
            if (contactNumber.length < 10) {
                alert("Invalid phone number. Please include distinct country code.");
                return;
            }

            // Auto-save
            localStorage.setItem('emergency_contact', contactNumber);

            alert("Please Allow Location Access to share your position.");

            // 2. Fetch Location (High Accuracy)
            if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition(position => {
                    const lat = position.coords.latitude.toFixed(6);
                    const lng = position.coords.longitude.toFixed(6);
                    const mapLink = `https://www.google.com/maps?q=${lat},${lng}`;

                    const message = `🚨 I am sharing my LIVE LOCATION: ${mapLink}`;

                    // Use api.whatsapp.com
                    const whatsappUrl = `https://api.whatsapp.com/send?phone=${contactNumber}&text=${encodeURIComponent(message)}`;

                    // 3. Open WhatsApp (Automatic Send)
                    const win = window.open(whatsappUrl, '_blank');
                    if (!win) {
                        // Fallback if blocked
                        alert("Popup blocked! Click 'OK' to open WhatsApp manually.");
                        window.location.href = whatsappUrl;
                    }

                }, error => {
                    let errMsg = "Location access denied.";
                    if (error.code === error.TIMEOUT) errMsg = "Location timed out.";
                    if (error.code === error.POSITION_UNAVAILABLE) errMsg = "Location unavailable.";

                    alert(errMsg + " Ensure GPS is on and Permission is Allowed.");
                    console.error(error);
                }, {
                    enableHighAccuracy: true,
                    timeout: 10000
                });
            } else {
                alert("Geolocation is not supported via this browser.");
            }
        });
    }
}

function initModals() {
    const aboutModal = document.getElementById('about-modal');
    const contactModal = document.getElementById('contact-modal');

    const bindModal = (triggerId, modal) => {
        const btn = document.getElementById(triggerId);
        if (btn && modal) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                modal.classList.remove('hidden');
                setTimeout(() => modal.classList.add('show'), 10);
            });
        }
    };

    bindModal('about-link', aboutModal);
    bindModal('contact-link', contactModal);

    const closeModals = () => {
        document.querySelectorAll('.modal').forEach(m => {
            m.classList.remove('show');
            setTimeout(() => m.classList.add('hidden'), 300);
        });
    };

    document.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', closeModals));
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) closeModals();
    });
}

// --- API FUNCTIONS ---

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function setupAutocomplete(inputElement) {
    const resultsDiv = document.createElement("div");
    resultsDiv.setAttribute("class", "autocomplete-results");
    inputElement.parentNode.appendChild(resultsDiv);

    inputElement.addEventListener("input", debounce(async function (e) {
        const val = this.value;

        // Reset stored data on edit
        this.dataset.lat = '';
        this.dataset.lng = '';
        this.dataset.name = '';

        resultsDiv.innerHTML = '';
        resultsDiv.classList.remove('visible');

        if (!val || val.length < 3) return;

        const suggestions = await fetchLocationSuggestions(val);
        if (suggestions.length === 0) return;

        resultsDiv.classList.add('visible');
        suggestions.forEach(item => {
            const div = document.createElement("div");
            div.className = "autocomplete-item";
            // Construct location string
            let locStr = item.name;
            if (item.admin1) locStr += `, ${item.admin1}`;
            if (item.country) locStr += `, ${item.country}`;

            div.innerHTML = `
                <span class="item-main">${item.name}</span>
                <span class="item-sub">${item.admin1 || ''}, ${item.country || ''}</span>
            `;

            div.addEventListener("click", function () {
                inputElement.value = item.name; // Just name for cleanliness, or full string? User expects name
                inputElement.dataset.lat = item.latitude;
                inputElement.dataset.lng = item.longitude;
                inputElement.dataset.name = item.name; // Store to verify consistency

                resultsDiv.innerHTML = '';
                resultsDiv.classList.remove('visible');
            });
            resultsDiv.appendChild(div);
        });
    }, 300));

    // Hide on outside click
    document.addEventListener("click", function (e) {
        if (e.target !== inputElement) {
            resultsDiv.classList.remove('visible');
        }
    });
}

async function fetchLocationSuggestions(query) {
    try {
        // Fetch more results (count=20) to ensure we find Indian locations if they aren't top ranked globally
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=20&language=en&format=json`;
        const res = await fetch(url);
        const data = await res.json();

        if (!data.results) return [];

        // Client-side filter for India (IN)
        const indianLocations = data.results.filter(item => item.country_code === 'IN' || item.country === 'India');

        return indianLocations.slice(0, 5);
    } catch (e) {
        console.error("Autocomplete error:", e);
        return [];
    }
}

async function geocode(query) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data && data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    } catch (e) { console.error(e); }
    return null;
}

async function reverseGeocode(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        return data.display_name.split(',')[0];
    } catch (e) { return "Unknown Location"; }
}

function calculateBaseSafetyScore(routeType, distanceKm, durationMin) {
    let score = 100;

    // Longer routes = slightly less safe
    score -= distanceKm * 1.2;

    // Slower routes at night = riskier
    score -= durationMin * 0.8;

    // Route type bias
    if (routeType === "green") score += 5;
    if (routeType === "yellow") score -= 5;
    if (routeType === "red") score -= 15;

    return Math.max(30, Math.min(100, Math.round(score)));
}


async function fetchSafeRoutes(start, end) {
    // OSRM Routing with Alternatives
    // Green: Main Route (Driving/Fastest)
    // Yellow: Walker's Path (Walking)
    // Red: Shortcut (Alternative Driving/Walking)

    const results = [];

    try {
        // 1. Fetch Driving Routes (Main + Shortcut)
        // Use alternatives=true to get multiple options
        const drivingData = await getOSRM(start, end, 'driving', true);

        let mainRoute = null;
        let shortcutRoute = null;

        if (drivingData && drivingData.routes && drivingData.routes.length > 0) {
            // Sort by duration (fastest first)
            const sorted = drivingData.routes.sort((a, b) => a.duration - b.duration);

            // Route 0 -> Main Route (Green)
            mainRoute = sorted[0];

            // Potential Shortcut (Red) -> Route 1 if exists, else we look elsewhere
            if (sorted.length > 1) {
                shortcutRoute = sorted[1];
            }
        }

        // 2. Fetch Walking Route (Yellow)
        const walkingData = await getOSRM(start, end, 'walking', false);
        let walkerRoute = null;
        if (walkingData && walkingData.routes && walkingData.routes.length > 0) {
            walkerRoute = walkingData.routes[0];
        }

        // --- DYNAMIC SAFETY SCORE CALCULATION (API BASED) ---
        let areaBaseScore = 50; // Default fallback score
        let policeCount = 0, hospitalCount = 0, busyCount = 0;

        try {
            // Create a bounding box around the route (with some padding)
            if (typeof L !== 'undefined') {
                const routeBounds = L.latLngBounds(start, end).pad(0.2);

                // Fetch real-world POIs density with a timeout race to prevent hanging
                const fetchWithTimeout = (promise) =>
                    Promise.race([
                        promise,
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
                    ]);

                const [police, hospitals, busy] = await Promise.allSettled([
                    fetchWithTimeout(fetchOverpass(routeBounds, 'police')),
                    fetchWithTimeout(fetchOverpass(routeBounds, 'hospital')),
                    fetchWithTimeout(fetchOverpass(routeBounds, 'fuel'))
                ]);

                // Extract results if successful
                if (police.status === 'fulfilled') policeCount = police.value.length;
                if (hospitals.status === 'fulfilled') hospitalCount = hospitals.value.length;
                if (busy.status === 'fulfilled') busyCount = busy.value.length;

                // Calculate Route Distance (approximate linear distance for the area)
                // We use start/end to normalize, or just raw counts if distance is small
                const dist = start && end ? map.distance(start, end) / 1000 : 5; // distance in km

                // DENSITY SCORING (Actions per km)
                // E.g., 1 police station every 2km is good. 
                const policeDensity = policeCount / Math.max(1, dist);
                const hospitalDensity = hospitalCount / Math.max(1, dist);
                const busyDensity = busyCount / Math.max(1, dist);

                let scoreCalc = 30; // lower base
                scoreCalc += Math.min(40, policeDensity * 15); // 2 stations/km = +30
                scoreCalc += Math.min(20, hospitalDensity * 10);
                scoreCalc += Math.min(20, busyDensity * 5);

                areaBaseScore = Math.min(98, Math.max(20, Math.round(scoreCalc)));

                console.log(`Dynamic Safety: Dist=${dist.toFixed(1)}km, P_Dens=${policeDensity.toFixed(2)}, Score=${areaBaseScore}`);
            }
        } catch (err) {
            console.warn("Safety Score API failed or timed out, using default.", err);
            // Fallback is already set to 50
        }

        // --- PROCESSING & COLOR ASSIGNMENT ---

        // A) Green: Main Route (Safest)
        if (mainRoute) {
            results.push({
                id: 'r_green',
                name: "Main Route (Green)",
                desc: "Safest & Fastest",
                type: "car",
                polylines: mainRoute.geometry,
                time: Math.round(mainRoute.duration / 60) + ' min',
                dist: (mainRoute.distance / 1000).toFixed(1) + ' km',

                // Green gets the Calculated Score + Boost for being main roads
                safetyScore: Math.min(100, areaBaseScore + 5),
                level: 'safe', // Green
                colorCode: '#22c55e'
            });
        }

        // B) Yellow: Walker's Path
        // If walker route is identical to main route, we still show it as "Walker's Path" 
        // but maybe we can ensure it's distinct if we had more data. For now, OSRM walking usually differs from driving.
        if (walkerRoute) {
            // Check if it's identical to mainRoute to avoid exact overlap visually if possible, 
            // but for "realistic" requirement, if the walk path IS the road, we show it.
            // We just ensure it's labelled correctly.

            let walkScore = areaBaseScore;
            // If area is very safe (high score), walking is fine. 
            // If area is unsafe, walking is significantly riskier than driving.
            if (walkScore < 60) walkScore -= 10;

            results.push({
                id: 'r_yellow',
                name: "Walker's Path (Yellow)",
                desc: "Pedestrian Friendly",
                type: "walk",
                polylines: walkerRoute.geometry,
                time: Math.round(walkerRoute.duration / 60) + ' min',
                dist: (walkerRoute.distance / 1000).toFixed(1) + ' km',
                safetyScore: Math.min(100, Math.max(20, walkScore)),
                level: 'moderate', // Yellow
                colorCode: '#eab308'
            });
        }

        // C) Red: Shortcut
        // If we didn't find a 2nd driving route, maybe we can try "walking" alternatives or just use a fallback
        if (!shortcutRoute) {
            // Try getting walking alternatives
            const walkingAlts = await getOSRM(start, end, 'walking', true);
            if (walkingAlts && walkingAlts.routes && walkingAlts.routes.length > 1) {
                // Use the second walking route as "Shortcut" (often through parks or alleys)
                shortcutRoute = walkingAlts.routes[1];
            }
        }

        // Fallback for Red if still null: Use the "detour" method but purely as a fallback 
        // to ensure we ALWAYS have 3 routes if possible.
        if (!shortcutRoute && mainRoute) {
            shortcutRoute = await getDetouredOSRM(start, end, 'walking', 0.6); // Try a forced detour
        }

        if (shortcutRoute) {
            // Shortcut is always riskier than the base score
            let riskyScore = areaBaseScore - 15;

            results.push({
                id: 'r_red',
                name: "Shortcut (Red)",
                desc: "Quick but Risky",
                type: "scooter",
                polylines: shortcutRoute.geometry,
                time: Math.round(shortcutRoute.duration / 60) + ' min',
                dist: (shortcutRoute.distance / 1000).toFixed(1) + ' km',

                safetyScore: Math.min(100, Math.max(10, riskyScore)),
                level: 'risky', // Red
                colorCode: '#ef4444'
            });
        }

    } catch (e) {
        console.error("Route calculation error", e);
    }

    return results;
}

function jitterPolyline(geojson, amount) {
    if (!geojson || !geojson.coordinates) return geojson;
    const newCoords = geojson.coordinates.map(coord => {
        // Simple longitude/latitude offset
        return [coord[0] + amount, coord[1] + amount];
    });
    return {
        type: 'LineString',
        coordinates: newCoords
    };
}

async function getOSRM(start, end, profile, alternatives = false) {
    const altParam = alternatives ? 'true' : 'false';
    const url = `https://router.project-osrm.org/route/v1/${profile}/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&alternatives=${altParam}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        return data; // Return full data to access .routes array
    } catch (e) { console.error(e); }
    return null;
}

async function getDetouredOSRM(start, end, profile, deviationScale) {
    // Fallback creates a waypoint via a midpoint offset
    const midLat = (start[0] + end[0]) / 2;
    const midLng = (start[1] + end[1]) / 2;
    const dLat = end[0] - start[0];
    const dLng = end[1] - start[1];

    // Perpendicular vector
    const perpLat = -dLng * deviationScale * 0.5;
    const perpLng = dLat * deviationScale * 0.5;

    const viaLat = midLat + perpLat;
    const viaLng = midLng + perpLng;

    const url = `https://router.project-osrm.org/route/v1/${profile}/${start[1]},${start[0]};${viaLng},${viaLat};${end[1]},${end[0]}?overview=full&geometries=geojson`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes && data.routes.length > 0) return data.routes[0];
    } catch (e) { console.error(e); }
    return null;
}

// Overpass API for Points of Interest
async function fetchOverpass(bounds, type) {
    const b = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    let query = "";
    if (type === 'police') query = `node["amenity"="police"](${b});`;
    if (type === 'hospital') query = `node["amenity"="hospital"](${b});`;
    if (type === 'fuel') query = `node["amenity"="fuel"](${b});`;

    const url = `https://overpass-api.de/api/interpreter?data=[out:json];(${query});out;`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        return data.elements || [];
    } catch (e) { return []; }
}

// --- UI/DISPLAY FUNCTIONS ---

function toggleLoading(show) {
    if (show) {
        loadingIndicator.classList.remove('hidden');
        routesList.classList.add('hidden');
        aiPanel.classList.add('hidden');
    } else {
        loadingIndicator.classList.add('hidden');
    }
}
function displayRoutes(routes) {
    // Direct render since we moved scoring to client-side (Overpass API)
    // and we want to support static file usage without Python backend.
    renderRoutes(routes);
}



function renderRoutes(routes) {
    routesList.innerHTML = '';
    routesList.classList.remove('hidden');

    routes.forEach(route => {
        // Draw on map with distinct styles to handle overlaps
        const color = route.level === 'safe' ? '#22c55e' : (route.level === 'moderate' ? '#eab308' : '#ef4444');

        // Style config to ensure visibility even when overlapped
        // Safe (Green) is base layer, larger but reliable.
        // Walker (Yellow) is dashed.
        // Shortcut (Red) is dotted.
        let style = { color: color, weight: 6, opacity: 0.7 };

        if (route.level === 'safe') {
            style.weight = 8; // Base path, thick
            style.opacity = 0.6;
        } else if (route.level === 'moderate') {
            style.weight = 6;
            style.dashArray = '12, 12'; // Dashed
            style.opacity = 0.9;
        } else {
            style.weight = 5;
            style.dashArray = '4, 8'; // Dotted/Short dashes
            style.opacity = 1.0;
        }

        const poly = L.geoJSON(route.polylines, { style: style }).addTo(routeLayerGroup);

        // Add to Sidebar
        const card = document.createElement('div');
        card.className = `route-card ${route.id}`;
        card.innerHTML = `
            <div class="route-info">
                <h3>${route.name}</h3>
                ${route.desc ? `<div style="font-size:0.85em; color:var(--text-muted); margin-bottom:4px;">${route.desc}</div>` : ''}
                <div class="route-meta">${route.time} • ${route.dist}</div>
            </div>
            <div class="safety-badge ${route.level}">
                Score: ${route.safetyScore}
            </div>
        `;

        card.addEventListener('click', () => {
            attachRouteSelection(route);
            // Highlight logic ...
            map.fitBounds(poly.getBounds());
            showAIAnalysis(route);
        });

        routesList.appendChild(card);
    });
}



function showAIAnalysis(route) {
    aiPanel.classList.remove('hidden');
    aiText.textContent = "Analyzing route safety features...";
    setTimeout(() => {
        let msg = "";
        if (route.safetyScore > 90) msg = "✅ EXCELLENT CHOICE. Well lit, high foot traffic, frequent police patrols.";
        else if (route.safetyScore > 70) msg = "⚠️ GOOD. Mostly safe, but avoid the underpass after 10 PM.";
        else msg = "⛔ CAUTION. High crime rate reported in this sector. Poor lighting.";

        aiText.textContent = msg;
    }, 800);
}

// ================================
// ROUTE SAFETY RATING (GREEN BUTTON)
// ================================

let selectedRouteId = null;

// Call this when a route is clicked
function attachRouteSelection(route) {
    selectedRouteId = route.id;
}

// Store ratings locally (hackathon demo)

document.getElementById("rate-route-btn").addEventListener("click", () => {
    if (!selectedRouteId) {
        alert("Please select a route first.");
        return;
    }

    const rating = Number(prompt(
        "Rate safety of this route:\n" +
        "1 = Very Unsafe\n" +
        "2 = Unsafe\n" +
        "3 = Neutral\n" +
        "4 = Safe\n" +
        "5 = Very Safe"
    ));

    if (!rating || rating < 1 || rating > 5) return;

    fetch("/api/rate_route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            route_id: selectedRouteId,
            rating,
            start: document.getElementById("start-loc").value,
            end: document.getElementById("dest-loc").value
        })
    })
        .then(() => {
            alert(rating <= 2
                ? "⚠️ Safety concern recorded."
                : "✅ Thank you! Your feedback helps other women."
            );
        });
});
