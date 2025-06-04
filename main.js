function closeInfo() {
  document.getElementById("infoOverlay").style.display = "none";
}

const map = L.map('map').setView([55.5928, 13.0060], 16);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CartoDB',
  subdomains: 'abcd',
  detectRetina: true
}).addTo(map);

// Skapa separat pane för användarens position
map.createPane('userPane');
map.getPane('userPane').style.zIndex = 1000;

let userMarker;
let userLatLng;
let routingControl;
let addressLayer = null;
const removeRouteBtn = document.getElementById('removeRouteBtn');

// Geolocation
if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    function (position) {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      userLatLng = [lat, lng];

      if (userMarker) {
        userMarker.setLatLng(userLatLng);
      } else {
        userMarker = L.circleMarker(userLatLng, {
          radius: 5,
          color: '#007bff',
          fillColor: '#007bff',
          fillOpacity: 1,
          weight: 1,
          pane: 'userPane'
        }).addTo(map).bindPopup("Du är här!").openPopup();

        map.setView(userLatLng, 16);
      }
    },
    function (error) {
      console.warn("Plats kunde inte hämtas:", error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 20000
    }
  );
}

// Byggnader
fetch('data/byggnader_mollan.geojson')
  .then(response => response.json())
  .then(data => {
    L.geoJSON(data, {
      style: {
        color: '#ea4644',
        weight: 1,
        fillColor: '#f7a7a6',
        fillOpacity: 0.6
      }
    }).addTo(map);
  });

// Gårdar (geojson_example)
fetch('data/geojson_example.geojson')
  .then(response => response.json())
  .then(data => {
    L.geoJSON(data, {
      onEachFeature: function (feature, layer) {
        if (feature.properties) {
          let popupContent = '';
          for (let key in feature.properties) {
            popupContent += `<strong>${key}</strong>: ${feature.properties[key]}<br>`;
          }

          const coords = feature.geometry.coordinates;
          const latLng = [coords[1], coords[0]]; // säkerställ [lat, lng]
          popupContent += `<button class="route-btn" onclick='routeTo([${latLng}])'>Visa rutt</button>`;
          layer.bindPopup(popupContent);
        }
      }
    }).addTo(map);
  });

// Ikon
const addressIcon = L.icon({
  iconUrl: 'marker.png',
  iconSize: [30, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
  shadowSize: [41, 41]
});

// Globala GeoJSON-data för adresser
let allAddressData = [];

// Ladda in adresser en gång
fetch('data/adresser.geojson')
  .then(response => response.json())
  .then(data => {
    allAddressData = data.features.filter(f => f.properties.oppen === "Ja");
    populateActivityFilter(allAddressData);
    renderAddressLayer();
  });

// Rendera filtrerat lager
function renderAddressLayer() {
  const selectedActivity = document.getElementById("activityFilter").value;

  const filtered = selectedActivity === "alla"
    ? allAddressData
    : allAddressData.filter(f => f.properties.Aktivitet === selectedActivity);

  if (addressLayer) {
    map.removeLayer(addressLayer);
  }

  addressLayer = L.geoJSON({ type: "FeatureCollection", features: filtered }, {
    pointToLayer: function (feature, latlng) {
      return L.marker(latlng, { icon: addressIcon });
    },
    onEachFeature: function (feature, layer) {
      const props = feature.properties;
      const coords = feature.geometry.coordinates[0];
      const latLng = [coords[1], coords[0]];

      const popupContent = `
        <strong>Adress:</strong> ${props.Adress}<br>
        <strong>Aktivitet:</strong> ${props.Aktivitet}<br>
        <button class="route-btn" onclick='routeTo([${latLng}])'>Visa rutt</button>
      `;
      layer.bindPopup(popupContent);
    }
  }).addTo(map);
}

// Populera dropdown med unika aktiviteter
function populateActivityFilter(features) {
  const select = document.getElementById("activityFilter");
  const uniqueActivities = Array.from(new Set(features.map(f => f.properties.Aktivitet))).sort();

  select.innerHTML = `<option value="alla">Alla aktiviteter</option>`;
  uniqueActivities.forEach(activity => {
    select.innerHTML += `<option value="${activity}">${activity}</option>`;
  });

  select.addEventListener("change", renderAddressLayer);
}

// Routing
function routeTo(destinationLatLng) {
  if (!userLatLng) {
    alert("Din plats är inte tillgänglig än!");
    return;
  }

  // Säkerställ lat/lng
  if (
    Array.isArray(destinationLatLng) &&
    destinationLatLng.length === 2 &&
    destinationLatLng[0] > destinationLatLng[1]
  ) {
    destinationLatLng = [destinationLatLng[1], destinationLatLng[0]];
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
    }
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
