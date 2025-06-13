function closeInfo() {
  document.getElementById("infoOverlay").style.display = "none";
}

const defaultCenter = [13.011586184559851, 55.591988278009765];
const defaultZoom = 16;

function getBaseStyle() {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const styleName = isDark ? 'alidade_smooth_dark' : 'alidade_smooth';
  return `https://tiles.stadiamaps.com/styles/${styleName}.json?api_key=9a2de762-ebe1-42e7-bcd2-0260d8917ae6`;
}

let map = new maplibregl.Map({
  container: 'map',
  style: getBaseStyle(),
  center: defaultCenter,
  zoom: defaultZoom
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  map.setStyle(getBaseStyle());
});

map.addControl(new maplibregl.NavigationControl());

let userMarker;
let userLngLat;
const removeRouteBtn = document.getElementById('removeRouteBtn');

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    position => {
      const lngLat = [position.coords.longitude, position.coords.latitude];
      userLngLat = lngLat;

      if (userMarker) {
        userMarker.setLngLat(lngLat);
      } else {
        userMarker = new maplibregl.Marker({ color: '#000' })
          .setLngLat(lngLat)
          .setPopup(new maplibregl.Popup().setText('Du är här!'))
          .addTo(map);
        map.setCenter(lngLat);
      }
    },
    error => {
      console.warn('Plats kunde inte hämtas:', error.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 20000,
      timeout: 10000
    }
  );
}

map.on('load', () => {
  loadBuildings();
  loadAddresses();
});

function loadBuildings() {
  fetch('data/byggnader_mollan.geojson', { cache: 'force-cache' })
    .then(r => r.json())
    .then(data => {
      map.addSource('buildings', { type: 'geojson', data });
      map.addLayer(
        {
          id: 'buildings-extrusion',
          type: 'fill-extrusion',
          source: 'buildings',
          paint: {
            'fill-extrusion-color': '#f47c31',
            'fill-extrusion-height': 5,
            'fill-extrusion-opacity': 1
          }
        },
        'road-label'
      );
    })
    .catch(err => console.error('Fel vid inläsning av byggnader:', err));
}

function loadAddresses() {
  fetch('data/adresser.geojson', { cache: 'force-cache' })
    .then(r => r.json())
    .then(data => {
      const filtered = data.features.filter(f => f.properties.oppen === 'Ja');

      filtered.forEach(feature => {
        const props = feature.properties;
        const aktivitet = props.Aktivitet ? props.Aktivitet : 'Ingen aktivitet planerad';
        const adress = props.Adress || 'Okänd adress';
        const coordsList =
          feature.geometry.type === 'MultiPoint'
            ? feature.geometry.coordinates
            : [feature.geometry.coordinates];

        coordsList.forEach(coord => {
          const lngLat = [coord[0], coord[1]];
          const popupContent = `
            <strong>Adress:</strong> ${adress}<br>
            <strong>Aktivitet:</strong> ${aktivitet}<br>
            <button class="btn route-btn" data-lat="${lngLat[1]}" data-lng="${lngLat[0]}" aria-label="Visa rutt till denna adress">Visa rutt</button>
          `;

          new maplibregl.Marker({ color: '#3fb1ce' })
            .setLngLat(lngLat)
            .setPopup(new maplibregl.Popup().setHTML(popupContent))
            .addTo(map);
        });
      });
    })
    .catch(err => console.error('Fel vid inläsning av adresser:', err));
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('route-btn')) {
    const lat = parseFloat(e.target.getAttribute('data-lat'));
    const lng = parseFloat(e.target.getAttribute('data-lng'));
    routeTo([lng, lat]);
  }
});

function routeTo(destLngLat) {
  if (!userLngLat) {
    alert('Din plats är inte tillgänglig än!');
    return;
  }
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${userLngLat[0]},${userLngLat[1]};${destLngLat[0]},${destLngLat[1]}?overview=full&geometries=geojson&steps=false`;
  fetch(url)
    .then(r => r.json())
    .then(data => {
      const geom = data.routes[0].geometry;

      if (map.getSource('route')) {
        map.removeLayer('route');
        map.removeSource('route');
      }
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: geom } });
      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#67aae2', 'line-width': 5 }
      });
      removeRouteBtn.style.display = 'block';
    })
    .catch(err => console.error('Fel vid rutt:', err));
}

removeRouteBtn.addEventListener('click', () => {
  if (map.getLayer('route')) {
    map.removeLayer('route');
    map.removeSource('route');
  }
  removeRouteBtn.style.display = 'none';
});
