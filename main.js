import maplibregl from 'https://cdn.skypack.dev/maplibre-gl';

const defaultCenter = [13.011586184559851, 55.591988278009765];
const defaultZoom = 16;
const STADIA_API_KEY = '9a2de762-ebe1-42e7-bcd2-0260d8917ae6';
const SHEET_URL = 'https://opensheet.elk.sh/1t5ILyafrrFJNiO2V0QrqbZyFNgTdXcY7SujnOOQHbfI/Formulärsvar 1';

let userCoords = null;
let routeId = null;

const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const styleUrl = isDark
  ? `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json?api_key=${STADIA_API_KEY}`
  : `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${STADIA_API_KEY}`;

const map = new maplibregl.Map({
  container: 'map',
  style: styleUrl,
  center: defaultCenter,
  zoom: defaultZoom
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const newStyle = window.matchMedia('(prefers-color-scheme: dark)').matches
    ? `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json?api_key=${STADIA_API_KEY}`
    : `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${STADIA_API_KEY}`;
  map.setStyle(newStyle);
});

function normaliseraAdress(adress) {
  return adress
    .toLowerCase()
    .replace(/[^a-z0-9åäö\s]/gi, '')
    .replace(/\d{3}\s?\d{2}/g, '')
    .replace(/malmö/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function uppdateraAktiviteter() {
  const [adresserRes, formDataRes] = await Promise.all([
    fetch('data/adresser.geojson'),
    fetch(SHEET_URL)
  ]);

  const adresserData = await adresserRes.json();

  let formDataRaw;
  try {
    formDataRaw = await formDataRes.json();
  } catch (err) {
    console.error("Kunde inte tolka formulärdata som JSON:", err);
    return;
  }

  if (!Array.isArray(formDataRaw)) {
    console.error("Formulärdata är inte en lista:", formDataRaw);
    return;
  }

  const formSvar = formDataRaw.map(row => ({
    adress: normaliseraAdress(row["📍 Gatuadress till din innergård"] || ""),
    aktivitet: row["🕺 Vad kommer hända på innergården?"] || "Ingen aktivitet angiven"
  }));

  adresserData.features.forEach(feature => {
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

  if (map.isStyleLoaded() && map.getSource('adresser')) {
    map.getSource('adresser').setData(adresserData);
  } else {
    map.once('style.load', () => {
      if (map.getSource('adresser')) {
        map.getSource('adresser').setData(adresserData);
      }
    });
  }

  // Debug: visa omatchade adresser
  const inkommandeAdresser = formSvar.map(f => f.adress);
  const matchadeAdresser = adresserData.features.map(f => normaliseraAdress(f.properties.Adress || ""));
  const omatchade = inkommandeAdresser.filter(a => !matchadeAdresser.includes(a));
  if (omatchade.length > 0) {
    console.warn("Formulärsvar utan matchande adress i GeoJSON:", omatchade);
  }
}

async function visaRutt(destLngLat) {
  if (!userCoords) {
    alert("Din plats är inte tillgänglig ännu.");
    return;
  }
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${userCoords.join(',')};${destLngLat.join(',')}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const json = await res.json();
  const route = json.routes[0].geometry;

  if (map.getSource('route')) {
    map.getSource('route').setData({ type: 'Feature', geometry: route });
  } else {
    map.addSource('route', {
      type: 'geojson',
      data: { type: 'Feature', geometry: route }
    });
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': '#67aae2',
        'line-width': 5
      }
    });
  }

  // Visa ta bort-knapp
  const removeBtn = document.getElementById('removeRouteBtn');
  if (removeBtn) removeBtn.style.display = 'block';
} 

// Ta bort ruttfunktion
window.taBortRutt = function () {
  if (map.getSource('route')) {
    map.removeLayer('route-line');
    map.removeSource('route');
  }
  const removeBtn = document.getElementById('removeRouteBtn');
  if (removeBtn) removeBtn.style.display = 'none';
}

map.on('load', async () => {
  const byggnaderData = await fetch('data/byggnader_mollan.geojson').then(res => res.json());
  const adresserData = await fetch('data/adresser.geojson').then(res => res.json());

  map.addSource('byggnader', {
    type: 'geojson',
    data: byggnaderData
  });

  map.addLayer({
    id: 'tak',
    type: 'fill',
    source: 'byggnader',
    paint: {
      'fill-color': '#f47c31',
      'fill-opacity': 1
    }
  });

  map.addSource('adresser', {
    type: 'geojson',
    data: adresserData
  });

  // Säkerställ att vi lägger till laget först, även utan bild
  map.addLayer({
    id: 'adresser-symboler',
    type: 'symbol',
    source: 'adresser',
    filter: ['==', ['get', 'oppen'], 'Ja'],
    layout: {
      'icon-image': 'blue-marker',
      'icon-size': 0.9,
      'icon-anchor': 'bottom'
    }
  });

  map.loadImage('blue-marker.png', (err, image) => {
    if (!err && !map.hasImage('blue-marker')) {
      map.addImage('blue-marker', image);
    }

    // Ikon läggs in i laget direkt — redan definierat ovan
  });
  });

  map.on('click', 'adresser-symboler', (e) => {
    const props = e.features[0].properties;
    const lngLat = e.lngLat.toArray();
    const html = `
      <strong>Adress:</strong> ${props.Adress}<br>
      <strong>Aktivitet:</strong> ${props.Aktivitet || 'Ingen aktivitet'}<br>
      <button onclick='visaRutt([${lngLat}])' class='btn route-btn'>Visa rutt</button>
    `;
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);
  });

  map.on('mouseenter', 'adresser-symboler', () => {
    map.getCanvas().style.cursor = 'pointer';
  });
  map.on('mouseleave', 'adresser-symboler', () => {
    map.getCanvas().style.cursor = '';
  });

  await uppdateraAktiviteter();
  setInterval(uppdateraAktiviteter, 120000);
});

navigator.geolocation?.watchPosition(pos => {
  userCoords = [pos.coords.longitude, pos.coords.latitude];

  if (!map.getSource('user')) {
    map.addSource('user', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: userCoords
            }
          }
        ]
      }
    });

    map.addLayer({
      id: 'user-marker',
      type: 'circle',
      source: 'user',
      paint: {
        'circle-radius': 8,
        'circle-color': '#6278b3',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff'
      }
    });
  } else {
    map.getSource('user').setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: userCoords
          }
        }
      ]
    });
  }

  // map.flyTo({ center: userCoords, zoom: 16 }); // Inaktiverad för att undvika att störa användaren
}, err => {
  console.warn('Kunde inte hämta plats:', err.message);
}, {
  enableHighAccuracy: true,
  maximumAge: 20000,
  timeout: 10000
});
