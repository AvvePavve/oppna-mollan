function closeInfo() {
  document.getElementById("infoOverlay").style.display = "none";
}

const map = L.map('map').setView([55.5928, 13.0060], 16);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CartoDB',
  subdomains: 'abcd',
  detectRetina: true
}).addTo(map);

// Användarens plats
map.createPane('userPane');
map.getPane('userPane').style.zIndex = 1000;

let userMarker;
let userLatLng;
let routingControl;
const removeRouteBtn = document.getElementById('removeRouteBtn');

// Hämta användarens plats
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

// Adresser
const addressIcon = L.icon({
  iconUrl: 'marker.png',
  iconSize: [20, 30],
  iconAnchor: [10, 30],
  popupAnchor: [1, -25],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
  shadowSize: [41, 41]
});

fetch('data/adresser.geojson')
  .then(response => response.json())
  .then(data => {
    const filtered = data.features.filter(f => f.properties.oppen === "Ja");

    L.geoJSON({ type: "FeatureCollection", features: filtered }, {
      pointToLayer: (feature, latlng) => L.marker(latlng, { icon: addressIcon }),
      onEachFeature: (feature, layer) => {
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
  });

// Ruttplanering med gång/cykel via OpenRouteService
function routeTo(destinationLatLng) {
  if (!userLatLng) {
    alert("Din plats är inte tillgänglig än!");
    return;
  }

  console.log("Routing från:", userLatLng, "till:", destinationLatLng);

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
    router: new L.Routing.OpenRouteService('5b3ce3597851110001cf62484916249796ab4c6a9c1f947e1859b8d8', {
      profile: 'foot-walking', // Alternativ: 'cycling-regular'
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
