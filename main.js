// Förenklad och optimerad main.js för Öppna Möllan 2025

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

const map = new maplibregl.Map({
  container: 'map',
  style: getBaseStyle(),
  center: defaultCenter,
  zoom: defaultZoom
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  map.setStyle(getBaseStyle(), { diff: false });
});

map.addControl(new maplibregl.NavigationControl());
map.addControl(new maplibregl.AttributionControl({
  compact: true,
  customAttribution: '&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}));

let activitySelect;

class ActivityControl {
  onAdd(map) {
    this._map = map;
    const container = document.createElement('div');
    container.className = 'maplibregl-ctrl maplibregl-ctrl-group activity-control';

    activitySelect = document.createElement('select');
    activitySelect.id = 'activityFilter';
    activitySelect.addEventListener('change', filterMarkers);
    container.appendChild(activitySelect);

    return container;
  }

  onRemove() {
    this._map = undefined;
  }
}

map.addControl(new ActivityControl(), 'top-left');

let userMarker, userLngLat;
const removeRouteBtn = document.getElementById('removeRouteBtn');
const addressMarkers = [];
const activitySet = new Set();

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(pos => {
    const lngLat = [pos.coords.longitude, pos.coords.latitude];
    userLngLat = lngLat;

    if (!userMarker) {
      const el = document.createElement('div');
      el.className = 'user-location-icon';
      userMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(lngLat)
        .setPopup(new maplibregl.Popup().setText('Du är här!'))
        .addTo(map);
      map.setCenter(lngLat);
    } else {
      userMarker.setLngLat(lngLat);
    }
  }, err => console.warn('Platsfel:', err.message), {
    enableHighAccuracy: true,
    maximumAge: 20000,
    timeout: 10000
  });
}

map.on('load', () => loadAddresses());
map.on('style.load', () => loadBuildings());

function loadBuildings() {
  fetch('data/byggnader_mollan.geojson', { cache: 'force-cache' })
    .then(res => res.json())
    .then(data => {
      map.addSource('buildings', { type: 'geojson', data });

      const labelLayer = map.getStyle().layers.find(l => l.type === 'symbol' && l.layout?.['text-field']);

      map.addLayer({
        id: 'buildings-extrusion',
        type: 'fill-extrusion',
        source: 'buildings',
        paint: {
          'fill-extrusion-color': '#f47c31',
          'fill-extrusion-height': 5,
          'fill-extrusion-opacity': 1
        }
      }, labelLayer?.id);
    })
    .catch(err => console.error('Byggnadsfel:', err));
}

function createPopupHTML(adress, aktivitet, lngLat) {
  return `
    <strong>Adress:</strong> ${adress}<br>
    <strong>Aktivitet:</strong> ${aktivitet}<br>
    <button class="btn route-btn" data-lat="${lngLat[1]}" data-lng="${lngLat[0]}">Visa rutt</button>
  `;
}

function loadAddresses() {
  fetch('data/adresser.geojson', { cache: 'force-cache' })
    .then(res => res.json())
    .then(data => {
      addressMarkers.forEach(obj => obj.marker.remove());
      addressMarkers.length = 0;
      activitySet.clear();

      const öppna = data.features.filter(f => f.properties.oppen === 'Ja');

      öppna.forEach(f => {
        const props = f.properties;
        const aktivitet = props.Aktivitet || 'Ingen aktivitet planerad';
        const adress = props.Adress || 'Okänd adress';
        const coordsList = f.geometry.type === 'MultiPoint' ? f.geometry.coordinates : [f.geometry.coordinates];

        coordsList.forEach(coord => {
          const lngLat = [coord[0], coord[1]];
          const el = document.createElement('img');
          el.src = 'blue-marker.png';
          el.className = 'address-marker';

          const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat(lngLat)
            .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(createPopupHTML(adress, aktivitet, lngLat)))
            .addTo(map);

          addressMarkers.push({ marker, aktivitet });
          activitySet.add(aktivitet);
        });
      });

      populateActivityOptions();
      filterMarkers();
    })
    .catch(err => console.error('Adressfel:', err));
}

document.addEventListener('click', e => {
  if (e.target.classList.contains('route-btn')) {
    const lat = parseFloat(e.target.dataset.lat);
    const lng = parseFloat(e.target.dataset.lng);
    routeTo([lng, lat]);
  }
});

function routeTo(destLngLat) {
  if (!userLngLat) return alert('Din plats är inte tillgänglig än!');

  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${userLngLat[0]},${userLngLat[1]};${destLngLat[0]},${destLngLat[1]}?overview=full&geometries=geojson&steps=false`;

  fetch(url)
    .then(res => res.json())
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
    .catch(err => console.error('Ruttfel:', err));
}

removeRouteBtn.addEventListener('click', () => {
  if (map.getLayer('route')) {
    map.removeLayer('route');
    map.removeSource('route');
  }
  removeRouteBtn.style.display = 'none';
});

function populateActivityOptions() {
  if (!activitySelect) return;
  const current = activitySelect.value || 'Alla';
  activitySelect.innerHTML = '<option value="Alla">Alla aktiviteter</option>';
  Array.from(activitySet).sort().forEach(act => {
    const opt = document.createElement('option');
    opt.value = act;
    opt.textContent = act;
    activitySelect.appendChild(opt);
  });
  activitySelect.value = current;
}

function filterMarkers() {
  if (!activitySelect) return;
  const val = activitySelect.value;
  addressMarkers.forEach(obj => {
    const show = val === 'Alla' || obj.aktivitet === val;
    obj.marker.getElement().style.display = show ? '' : 'none';
  });
}
