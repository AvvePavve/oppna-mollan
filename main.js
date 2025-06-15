
import maplibregl from 'https://cdn.skypack.dev/maplibre-gl';

const defaultCenter = [13.011586184559851, 55.591988278009765];
const defaultZoom = 16;
const STADIA_API_KEY = '9a2de762-ebe1-42e7-bcd2-0260d8917ae6';
const SHEET_URL = 'https://opensheet.elk.sh/1t5ILyafrrFJNiO2V0QrqbZyFNgTdXcY7SujnOOQHbfI/Formulärsvar 1';

let userCoords = null;

const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const styleUrl = isDark
  ? `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json?api_key=${STADIA_API_KEY}`
  : `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${STADIA_API_KEY}`;

const map = new maplibregl.Map({
  container: 'map',
  style: styleUrl,
  center: defaultCenter,
  zoom: defaultZoom,
  hash: true
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');

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

  if (map.getSource('adresser')) {
    map.getSource('adresser').setData(adresserData);
  }

  const inkommandeAdresser = formSvar.map(f => f.adress);
  const matchadeAdresser = adresserData.features.map(f => normaliseraAdress(f.properties.Adress || ""));
  const omatchade = inkommandeAdresser.filter(a => !matchadeAdresser.includes(a));
  if (omatchade.length > 0) {
    console.warn("Formulärsvar utan matchande adress i GeoJSON:", omatchade);
  }
}

function läggTillLager(byggnaderData, adresserData) {
  map.loadImage('blue-marker.png', (err, image) => {
    if (!err && !map.hasImage('blue-marker')) {
      map.addImage('blue-marker', image);
    }

    if (!map.getSource('byggnader')) {
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
    }

    if (!map.getSource('adresser')) {
      map.addSource('adresser', {
        type: 'geojson',
        data: adresserData
      });
    }

    if (!map.getLayer('adresser-symboler')) {
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
    }

    uppdateraAktiviteter();
    setInterval(uppdateraAktiviteter, 120000);
  });
}

map.on('load', async () => {
  const [byggnaderData, adresserData] = await Promise.all([
    fetch('data/byggnader_mollan.geojson').then(res => res.json()),
    fetch('data/adresser.geojson').then(res => res.json())
  ]);
  läggTillLager(byggnaderData, adresserData);
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const newStyle = window.matchMedia('(prefers-color-scheme: dark)').matches
    ? `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json?api_key=${STADIA_API_KEY}`
    : `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${STADIA_API_KEY}`;
  map.setStyle(newStyle);
  map.once('style.load', async () => {
    const [byggnaderData, adresserData] = await Promise.all([
      fetch('data/byggnader_mollan.geojson').then(res => res.json()),
      fetch('data/adresser.geojson').then(res => res.json())
    ]);
    läggTillLager(byggnaderData, adresserData);
  });
});
