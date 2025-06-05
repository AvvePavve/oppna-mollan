function closeInfo() {
  document.getElementById("infoOverlay").style.display = "none";
}

const map = L.map('map').setView([55.5928, 13.0060], 16);

L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CartoDB',
  subdomains: 'abcd',
  detectRetina: true
}).addTo(map);

map.createPane('userPane');
map.getPane('userPane').style.zIndex = 1000;

let userMarker;
let userLatLng;
let routingControl;
const removeRouteBtn = document.getElementById('removeRouteBtn');

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

const addressIcon = L.icon({
  iconUrl: 'marker.png',
  iconSize: [40, 40],
  iconAnchor: [10, 30],
  popupAnchor: [1, -25],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
  shadowSize: [41, 41]
  shadowAnchor: [13, 41] // justerar skuggposition
});

fetch('data/adresser.geojson')
  .then(response => response.json())
  .then(data => {
    const filtered = data.features.filter(f => f.properties.oppen === "Ja");

    filtered.forEach(feature => {
      const props = feature.properties;

      if (feature.geometry.type === "MultiPoint") {
        feature.geometry.coordinates.forEach(coord => {
          const latLng = [coord[1], coord[0]];

          const marker = L.marker(latLng, { icon: addressIcon });

          const popupContent = `
            <strong>Adress:</strong> ${props.Adress}<br>
            <strong>Aktivitet:</strong> ${props.Aktivitet}<br>
            <button class="route-btn" onclick='routeTo([${latLng}])'>Visa rutt</button>
          `;

          marker.bindPopup(popupContent);
          marker.addTo(map);
        });
      }

      if (feature.geometry.type === "Point") {
        const coord = feature.geometry.coordinates;
        const latLng = [coord[1], coord[0]];

        const marker = L.marker(latLng, { icon: addressIcon });

        const popupContent = `
          <strong>Adress:</strong> ${props.Adress}<br>
          <strong>Aktivitet:</strong> ${props.Aktivitet}<br>
          <button class="route-btn" onclick='routeTo([${latLng}])'>Visa rutt</button>
        `;

        marker.bindPopup(popupContent);
        marker.addTo(map);
      }
    });
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
