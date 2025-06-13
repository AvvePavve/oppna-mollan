function closeInfo() {
  document.getElementById("infoOverlay").style.display = "none";
}

const lightTiles = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.{ext}?api_key=9a2de762-ebe1-42e7-bcd2-0260d8917ae6', {
  minZoom: 0,
  maxZoom: 20,
  attribution: '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  ext: 'png'
});

const darkTiles = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.{ext}?api_key=9a2de762-ebe1-42e7-bcd2-0260d8917ae6', {
  minZoom: 0,
  maxZoom: 20,
  attribution: '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  ext: 'png'
});

const defaultCenter = [55.591988278009765, 13.011586184559851];
const defaultZoom = 16;
const map = L.map('map', { layers: [] }).setView(defaultCenter, defaultZoom);

function setBaseMap() {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (isDark) {
    if (map.hasLayer(lightTiles)) map.removeLayer(lightTiles);
    if (!map.hasLayer(darkTiles)) darkTiles.addTo(map);
  } else {
    if (map.hasLayer(darkTiles)) map.removeLayer(darkTiles);
    if (!map.hasLayer(lightTiles)) lightTiles.addTo(map);
  }
}
setBaseMap();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setBaseMap);

map.createPane('userPane');
map.getPane('userPane').style.zIndex = 1000;

let userMarker;
let userLatLng;
let routingControl;
const removeRouteBtn = document.getElementById('removeRouteBtn');

const userIcon = L.divIcon({
  className: 'user-location-icon',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -9],
});

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    position => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      userLatLng = [lat, lng];

      if (userMarker) {
        userMarker.setLatLng(userLatLng);
      } else {
        userMarker = L.marker(userLatLng, {
          icon: userIcon,
          pane: 'userPane'
        }).addTo(map).bindPopup("Du är här!");

        map.setView(userLatLng, 16);
      }
    },
    error => {
      console.warn("Plats kunde inte hämtas:", error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 20000,
      timeout: 10000
    }
  );
}

const addressIcon = L.icon({
  iconUrl: 'blue-marker.png',
  iconSize: [24, 24],
  iconAnchor: [12, 23],
  popupAnchor: [0, -30],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
  shadowSize: [35, 35],
  shadowAnchor: [12, 35]
});

// ===== 3D-byggnader =====
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
  const wallColor = '#faf4b7';
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
fetch('data/byggnader_mollan.geojson', { cache: "force-cache" })
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
        color: '#f47c31',
        weight: 1,
        fillColor: '#f47c31',
        fillOpacity: 1
      }
    });
    const originalLayer = L.geoJSON(data);
    addBuildingSidesFromLayer(originalLayer);
    takLayer.addTo(map);
  })
  .catch(err => console.error("Fel vid inläsning av byggnader:", err));

const aktivitetLayersLive = {};
const SHEET_URL = 'https://opensheet.elk.sh/1t5ILyafrrFJNiO2V0QrqbZyFNgTdXcY7SujnOOQHbfI/Formulärsvar 1';

function normaliseraAdress(adress) {
  const match = adress.match(/[a-zåäö]+(?:gatan|vägen|torget)\s?\d+[a-d]?/i);
  const ren = match ? match[0] : adress;
  return ren
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
    if (!Array.isArray(formData)) throw new Error("Datan från formuläret kunde inte tolkas som en lista.");

    const formSvar = formData.map(row => ({
      adress: normaliseraAdress(row["📍 Gatuadress till din innergård"] || ""),
      aktivitet: row["🕺 Vad kommer hända på innergården?"] || "Ingen aktivitet angiven"
    }));

    const geoRes = await fetch('data/adresser.geojson');
    const geoJson = await geoRes.json();

    geoJson.features.forEach(feature => {
      const geoAdress = normaliseraAdress(feature.properties.Adress || "");
      const match = formSvar.find(entry => geoAdress === entry.adress);
      if (match) {
        feature.properties.Aktivitet = match.aktivitet;
        feature.properties.oppen = "Ja";
      } else {
        feature.properties.oppen = "Nej";
      }
    });

    const filtered = geoJson.features.filter(f => f.properties.oppen === "Ja");
    for (const layer of Object.values(aktivitetLayersLive)) {
      layer.clearLayers();
    }

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

    Object.values(aktivitetLayersLive).forEach(layer => layer.addTo(map));
  } catch (err) {
    console.error("Fel vid formulärintegration:", err);
  }
}

uppdateraAktiviteterFrånGoogleFormulär();
setInterval(uppdateraAktiviteterFrånGoogleFormulär, 120000);

document.addEventListener('click', function (e) {
  if (e.target.classList.contains('route-btn')) {
    const lat = parseFloat(e.target.getAttribute('data-lat'));
    const lng = parseFloat(e.target.getAttribute('data-lng'));
    routeTo([lat, lng]);
  }
});

function routeTo(destinationLatLng) {
  if (!userLatLng) {
    alert("Din plats är inte tillgänglig än!");
    return;
  }
  if (routingControl) {
    map.removeControl(routingControl);
  }
  routingControl = L.Routing.control({
    waypoints: [L.latLng(userLatLng), L.latLng(destinationLatLng)],
    show: false,
    addWaypoints: false,
    draggableWaypoints: false,
    routeWhileDragging: false,
    createMarker: () => null,
    lineOptions: { styles: [{ color: '#67aae2', weight: 5 }] },
    router: L.Routing.osrmv1({
      serviceUrl: 'https://routing.openstreetmap.de/routed-foot/route/v1',
      profile: 'foot',
      language: 'sv',
      steps: false
    })
  }).addTo(map);

  removeRouteBtn.style.display = 'block';
}

removeRouteBtn.addEventListener('click', () => {
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
    removeRouteBtn.style.display = 'none';
  }
});
