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

// Gårdar
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

          const coords = feature.geometry.coordinates.slice().reverse();

          layer.on('popupopen', () => {
            const popup = L.DomUtil.create('div');
            popup.innerHTML = popupContent;

            const button = L.DomUtil.create('button', 'route-btn', popup);
            button.textContent = 'Visa rutt';
            button.style.marginTop = '6px';
            button.addEventListener('click', () => routeTo(coords));

            layer.setPopupContent(popup);
          });

          layer.bindPopup('Laddar...');
        }
      }
    }).addTo(map);
  });

// Adresser
const addressIcon = L.icon({
  iconUrl: 'marker.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
  shadowSize: [41, 41]
});

let allAddressFeatures = [];
let addressLayer;

function renderAddressMarkers(filteredFeatures) {
  if (addressLayer) {
    map.removeLayer(addressLayer);
  }

  addressLayer = L.geoJSON({ type: "FeatureCollection", features: filteredFeatures }, {
    pointToLayer: function (feature, latlng) {
      return L.marker(latlng, { icon: addressIcon });
    },
    onEachFeature: function (feature, layer) {
      const props = feature.properties;
      const coords = feature.geometry.coordinates.slice().reverse();

      let popupContent = `
        <strong>Adress:</strong> ${props.Adress}<br>
        <strong>Aktivitet:</strong> ${props.Aktivitet}<br>
      `;

      layer.on('popupopen', () => {
        const popup = L.DomUtil.create('div');
        popup.innerHTML = popupContent;

        const button = L.DomUtil.create('button', 'route-btn', popup);
        button.textContent = 'Visa rutt';
        button.style.marginTop = '6px';
        button.addEventListener('click', () => routeTo(coords));

        layer.setPopupContent(popup);
      });

      layer.bindPopup('Laddar...');
    }
  }).addTo(map);
}

fetch('data/adresser.geojson')
  .then(response => response.json())
  .then(data => {
    allAddressFeatures = data.features.filter(f => f.properties.oppen === "Ja");
    renderAddressMarkers(allAddressFeatures);

    const activitySet = new Set(allAddressFeatures.map(f => f.properties.Aktivitet).filter(Boolean));
    const filterSelect = document.getElementById('activityFilter');

    Array.from(activitySet).sort().forEach(activity => {
      const option = document.createElement('option');
      option.value = activity;
      option.textContent = activity;
      filterSelect.appendChild(option);
    });

    filterSelect.addEventListener('change', () => {
      const selected = filterSelect.value;
      if (selected === 'alla') {
        renderAddressMarkers(allAddressFeatures);
      } else {
        const filtered = allAddressFeatures.filter(f => f.properties.Aktivitet === selected);
        renderAddressMarkers(filtered);
      }
    });
  });

function routeTo(destinationLatLng) {
  if (!userLatLng) {
    alert("Din plats är inte tillgänglig än!");
    return;
  }

  console.log("Skapar rutt från", userLatLng, "till", destinationLatLng);

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
    router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' })
  }).on('routingerror', function (e) {
    console.error("Routingfel:", e.error);
    alert("Kunde inte hitta en rutt.");
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
