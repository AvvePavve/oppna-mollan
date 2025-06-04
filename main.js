// Stäng informationsrutan
function closeInfo() {
  document.getElementById("infoOverlay").style.display = "none";
}

// Initiera karta
const map = L.map('map').setView([55.5928, 13.0060], 16);

// Kartbakgrund
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap &copy; CartoDB',
  subdomains: 'abcd',
  detectRetina: true
}).addTo(map);

// Användarens platsmarkör i egen "pane" överst
map.createPane('userPane');
map.getPane('userPane').style.zIndex = 1000;

let userMarker;
let userLatLng;
let routingControl;
const removeRouteBtn = document.getElementById('removeRouteBtn');

// Hantera geolokalisering
if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    position => {
      userLatLng = [position.coords.latitude, position.coords.longitude];

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
    error => {
      console.warn("Plats kunde inte hämtas:", error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 20000
    }
  );
}

// Lägg till byggnadspolygoner
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

// Skapa nytt pane för att punkterna hamnar ovanför byggnader
map.createPane('addressPane');
map.getPane('addressPane').style.zIndex = 650;

// Lägg till punktlagret från adresser.geojson med filter, popup och routing
fetch('data/adresser.geojson')
  .then(response => response.json())
  .then(data => {
    L.geoJSON(data, {
      filter: function (feature) {
        return feature.properties.oppen === "Ja";
      },
      pointToLayer: function (feature, latlng) {
        return L.circleMarker(latlng, {
          radius: 6,
          fillColor: '#007bff',
          color: '#fff',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.9,
          pane: 'addressPane'
        });
      },
      onEachFeature: function (feature, layer) {
        const props = feature.properties;
        const adress = props.Adress || 'Okänd adress';
        const aktivitet = props.Aktivitet || 'Ingen aktivitet angiven';
        const coords = feature.geometry.coordinates.slice().reverse();

        const popupContent = `
          <strong>Adress:</strong> ${adress}<br>
          <strong>Aktivitet:</strong> ${aktivitet}<br>
          <button class="route-btn" onclick='routeTo([${coords}])'>Visa rutt</button>
        `;

        layer.bindPopup(popupContent);
      }
    }).addTo(map);
  });

// Lägg till punkter med popup och ruttknapp
fetch('data/geojson_example.geojson')
  .then(response => response.json())
  .then(data => {
    L.geoJSON(data, {
      onEachFeature: (feature, layer) => {
        if (feature.properties) {
          let popupContent = '';
          for (const key in feature.properties) {
            popupContent += `<strong>${key}</strong>: ${feature.properties[key]}<br>`;
          }

          const coords = feature.geometry.coordinates.slice().reverse();
          popupContent += `<button class="route-btn" onclick='routeTo([${coords}])'>Visa rutt</button>`;
          layer.bindPopup(popupContent);
        }
      }
    }).addTo(map);
  });

// Starta rutt från användare till punkt
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
    }
  }).addTo(map);

  removeRouteBtn.style.display = 'block';
}

// Rensa rutt
removeRouteBtn.addEventListener('click', () => {
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
    removeRouteBtn.style.display = 'none';
  }
});
