// === Kartinitiering ===
function closeInfo() {
  document.getElementById("infoOverlay").style.display = "none";
}

const lightTiles = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  {
    attribution: '&copy; OpenStreetMap &copy; CartoDB',
    subdomains: 'abcd',
    detectRetina: true
  }
);
const darkTiles = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  {
    attribution: '&copy; OpenStreetMap &copy; CartoDB',
    subdomains: 'abcd',
    detectRetina: true
  }
);

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

// === Användarposition ===
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

// === Extrudera byggnadsväggar ===
function addBuildingSidesFromLayer(layerGroup, options = {}) {
  const wallColor = options.wallColor || '#c55';
  const baseOffset = options.offsetPerLevel || 0.00002;
  const defaultLevels = options.defaultLevels || 3;

  layerGroup.eachLayer(layer => {
    const feature = layer.feature;
    if (!feature || feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon") return;

    const levels = parseInt(feature.properties["building:levels"]) || defaultLevels;
    const offsetLng = -baseOffset * levels;
    const offsetLat = -baseOffset * levels;

    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;

    polygons.forEach(polygon => {
      const outer = polygon[0];

      for (let i = 0; i < outer.length - 1; i++) {
        const p1 = outer[i];
        const p2 = outer[i + 1];
        const p1_offset = [p1[0] + offsetLng, p1[1] + offsetLat];
        const p2_offset = [p2[0] + offsetLng, p2[1] + offsetLat];

        const wallCoords = [[p1, p2, p2_offset, p1_offset, p1]];

        const wallFeature = {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: wallCoords
          }
        };

        L.geoJSON(wallFeature, {
          style: {
            color: wallColor,
            weight: 0.5,
            fillColor: wallColor,
            fillOpacity: 1.0
          }
        }).addTo(map);
      }
    });
  });
}

// === Lägg till OSM-byggnader med 3D-effekt ===
fetch('data/export.geojson', { cache: "force-cache" })
  .then(response => response.json())
  .then(data => {
    const byggnaderLayer = L.geoJSON(data, {
      style: {
        color: '#ea4644',
        weight: 1,
        fillColor: '#f7a7a6',
        fillOpacity: 1.0
      }
    }).addTo(map);

    addBuildingSidesFromLayer(byggnaderLayer, {
      wallColor: '#b03d3c',
      offsetPerLevel: 0.000015, // Mjuk extrusion
      defaultLevels: 3
    });
  });

// === Adressmarkörer ===
const addressIcon = L.icon({
  iconUrl: 'marker.png',
  iconSize: [44, 44],
  iconAnchor: [22, 35],
  popupAnchor: [0, -35],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
  shadowSize: [41, 41],
  shadowAnchor: [13, 41]
});

const aktivitetLayers = {};

fetch('data/adresser.geojson', { cache: "force-cache" })
  .then(response => response.json())
  .then(data => {
    const filtered = data.features.filter(f => f.properties.oppen === "Ja");

    filtered.forEach(feature => {
      const props = feature.properties;
      const aktivitet = props.Aktivitet || "Ingen aktivitet planerad";
      const adress = props.Adress || "Okänd adress";

      const coordsList = feature.geometry.type === "MultiPoint"
        ? feature.geometry.coordinates
        : [feature.geometry.coordinates];

      coordsList.forEach(coord => {
        const latLng = [coord[1], coord[0]];
        const marker = L.marker(latLng, { icon: addressIcon });

        const popupContent = `
          <strong>Adress:</strong> ${adress}<br>
          <strong>Aktivitet:</strong> ${aktivitet}<br>
          <button class="btn route-btn" data-lat="${latLng[0]}" data-lng="${latLng[1]}" aria-label="Visa rutt till denna adress">Visa rutt</button>
        `;

        marker.bindPopup(popupContent);

        if (!aktivitetLayers[aktivitet]) {
          aktivitetLayers[aktivitet] = L.layerGroup();
        }
        aktivitetLayers[aktivitet].addLayer(marker);
      });
    });

    Object.values(aktivitetLayers).forEach(layer => layer.addTo(map));
    L.control.layers(null, aktivitetLayers, { collapsed: true }).addTo(map);
  });

// === Routingfunktion ===
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
    waypoints: [
      L.latLng(userLatLng),
      L.latLng(destinationLatLng)
    ],
    show: false,
    addWaypoints: false,
    draggableWaypoints: false,
    routeWhileDragging: false,
    createMarker: () => null,
    lineOptions: {
      styles: [{ color: '#ea4644', weight: 5 }]
    },
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
