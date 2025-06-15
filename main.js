const defaultCenter = [55.591988278009765, 13.011586184559851];
const defaultZoom = 16;

const map = L.map("map", {
  center: defaultCenter,
  zoom: defaultZoom
});

// Dark mode stöd
const prefersDark = window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

const styleUrl = prefersDark
  ? "https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json?api_key=9a2de762-ebe1-42e7-bcd2-0260d8917ae6"
  : "https://tiles.stadiamaps.com/styles/osm_bright.json?api_key=9a2de762-ebe1-42e7-bcd2-0260d8917ae6";

L.maplibreGL({
  style: styleUrl,
  attribution:
    '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// -------------------------- Användarposition ---------------------------
let userMarker;
let userLatLng;
const userIcon = L.divIcon({
  className: 'user-location-icon',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -9],
});

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    position => {
      userLatLng = [position.coords.latitude, position.coords.longitude];
      if (userMarker) {
        userMarker.setLatLng(userLatLng);
      } else {
        userMarker = L.marker(userLatLng, {
          icon: userIcon
        }).addTo(map).bindPopup("Du är här!");
      }
    },
    err => console.warn("Platsfel:", err.message),
    {
      enableHighAccuracy: true,
      maximumAge: 20000,
      timeout: 10000
    }
  );
}

// -------------------------- Routing ---------------------------
let routingControl;
const removeRouteBtn = document.getElementById("removeRouteBtn");

removeRouteBtn.addEventListener("click", () => {
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
    removeRouteBtn.style.display = "none";
  }
});

function routeTo(destinationLatLng) {
  if (!userLatLng) {
    alert("Din plats är inte tillgänglig än!");
    return;
  }
  if (routingControl) map.removeControl(routingControl);

  routingControl = L.Routing.control({
    waypoints: [L.latLng(userLatLng), L.latLng(destinationLatLng)],
    router: L.Routing.osrmv1({
      serviceUrl: "https://routing.openstreetmap.de/routed-foot/route/v1",
      profile: "foot"
    }),
    lineOptions: {
      styles: [{ color: "#67aae2", weight: 5 }]
    },
    createMarker: () => null,
    addWaypoints: false,
    draggableWaypoints: false,
    routeWhileDragging: false
  }).addTo(map);

  removeRouteBtn.style.display = "block";
}

// -------------------------- Google Formulär + GeoJSON ---------------------------
const aktivitetLayersLive = {};
const addressIcon = L.icon({
  iconUrl: "blue-marker.png",
  iconSize: [24, 24],
  iconAnchor: [12, 23],
  popupAnchor: [0, -30],
  shadowUrl: "https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png",
  shadowSize: [35, 35],
  shadowAnchor: [12, 35]
});

const SHEET_URL = 'https://opensheet.elk.sh/1t5ILyafrrFJNiO2V0QrqbZyFNgTdXcY7SujnOOQHbfI/Formulärsvar 1';

function normaliseraAdress(adress) {
  return adress
    .toLowerCase()
    .replace(/[^a-z0-9åäö\s]/gi, '')
    .replace(/\d{3}\s?\d{2}/g, '')
    .replace(/malmö/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function uppdateraAktiviteterFrånGoogleFormulär() {
  try {
    const response = await fetch(SHEET_URL);
    const formData = await response.json();

    const formSvar = formData.map(row => ({
      adress: normaliseraAdress(row["📍 Gatuadress till din innergård"] || ""),
      aktivitet: row["🕺 Vad kommer hända på innergården?"] || "Ingen aktivitet angiven"
    }));

    const geoRes = await fetch("data/adresser.geojson");
    const geoJson = await geoRes.json();

    geoJson.features.forEach(feature => {
      const geoAdress = normaliseraAdress(feature.properties.Adress || "");
      const match = formSvar.find(entry => geoAdress === entry.adress);
      if (match) {
        feature.properties.Aktivitet = match.aktivitet;
        feature.properties.oppen = "Ja";
      } else {
        feature.properties.oppen = "Nej";
        delete feature.properties.Aktivitet;
      }
    });

    for (const layer of Object.values(aktivitetLayersLive)) {
      layer.clearLayers();
    }

    const filtered = geoJson.features.filter(f => f.properties.oppen === "Ja");

    filtered.forEach(feature => {
      const aktivitet = feature.properties.Aktivitet;
      const coords = feature.geometry.type === "MultiPoint"
        ? feature.geometry.coordinates
        : [feature.geometry.coordinates];

      coords.forEach(coord => {
        const latLng = [coord[1], coord[0]];
        const marker = L.marker(latLng, { icon: addressIcon });
        const popup = `
          <strong>Adress:</strong> ${feature.properties.Adress}<br>
          <strong>Aktivitet:</strong> ${aktivitet}<br>
          <button class="btn route-btn" data-lat="${latLng[0]}" data-lng="${latLng[1]}">Visa rutt</button>
        `;
        marker.bindPopup(popup);
        if (!aktivitetLayersLive[aktivitet]) {
          aktivitetLayersLive[aktivitet] = L.layerGroup();
        }
        aktivitetLayersLive[aktivitet].addLayer(marker);
      });
    });

    const overlayMaps = {};
    for (const [aktivitet, layer] of Object.entries(aktivitetLayersLive)) {
      overlayMaps[aktivitet] = layer;
      layer.addTo(map);
    }

    L.control.layers(null, overlayMaps, {
      collapsed: true,
      position: "topright"
    }).addTo(map);

  } catch (err) {
    console.error("Fel vid formulärintegration:", err);
  }
}

uppdateraAktiviteterFrånGoogleFormulär();
setInterval(uppdateraAktiviteterFrånGoogleFormulär, 2 * 60 * 1000);

document.addEventListener("click", function (e) {
  if (e.target.classList.contains("route-btn")) {
    const lat = parseFloat(e.target.getAttribute("data-lat"));
    const lng = parseFloat(e.target.getAttribute("data-lng"));
    routeTo([lat, lng]);
  }
});

// -------------------------- Byggnader ---------------------------
const buildingOffset = { lng: -0.00002, lat: 0.00007 };

function cloneGeoJSON(geojson) {
  return {
    ...geojson,
    features: geojson.features.map(f => ({
      ...f,
      geometry: JSON.parse(JSON.stringify(f.geometry)),
      properties: { ...f.properties }
    }))
  };
}

function addBuildingSidesFromLayer(layerGroup) {
  const wallColor = "#faf4b7";
  layerGroup.eachLayer(layer => {
    const geom = layer.feature && layer.feature.geometry;
    if (geom && geom.type === "Polygon") {
      const coords = geom.coordinates[0];
      for (let i = 0; i < coords.length - 1; i++) {
        const base1 = coords[i];
        const base2 = coords[i + 1];
        const top1 = [base1[0] + buildingOffset.lng, base1[1] + buildingOffset.lat];
        const top2 = [base2[0] + buildingOffset.lng, base2[1] + buildingOffset.lat];
        const wallCoords = [[base1, base2, top2, top1, base1]];
        const wallFeature = {
          type: "Feature",
          geometry: { type: "Polygon", coordinates: wallCoords }
        };
        L.geoJSON(wallFeature, {
          style: {
            color: wallColor,
            weight: 0.5,
            fillColor: wallColor,
            fillOpacity: 1
          }
        }).addTo(map);
      }
    }
  });
}

fetch("data/byggnader_mollan.geojson", { cache: "force-cache" })
  .then(response => response.json())
  .then(data => {
    const offsetData = cloneGeoJSON(data);
    offsetData.features.forEach(feature => {
      if (feature.geometry.type === "Polygon") {
        feature.geometry.coordinates[0] = feature.geometry.coordinates[0].map(coord => [
          coord[0] + buildingOffset.lng,
          coord[1] + buildingOffset.lat
        ]);
      }
    });
    const takLayer = L.geoJSON(offsetData, {
      style: {
        color: "#f47c31",
        weight: 1,
        fillColor: "#f47c31",
        fillOpacity: 1
      }
    });
    const originalLayer = L.geoJSON(data);
    addBuildingSidesFromLayer(originalLayer);
    takLayer.addTo(map);
  })
  .catch(err => console.error("Fel vid inläsning av byggnader:", err));
