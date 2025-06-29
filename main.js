// === Hjälpfunktioner ===
const utils = {
  async getUserLocation({ highAccuracy = true, timeout = 10000 } = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation stöds inte av din webbläsare."));
      } else {
        navigator.geolocation.getCurrentPosition(
          pos => resolve([pos.coords.latitude, pos.coords.longitude]),
          err => reject(new Error("Kunde inte hämta din plats: " + err.message)),
          { enableHighAccuracy: highAccuracy, timeout }
        );
      }
    });
  },

  normaliseraAdress(adress) {
    return adress
      .toLowerCase()
      .replace(/[^a-z0-9åäö\s]/gi, '')
      .replace(/\d{3}\s?\d{2}/g, '')
      .replace(/malmö/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  createPopupHtml({ adress, aktivitet, latlng }) {
    return `
      ${adress ? `<strong>Adress:</strong> ${adress}<br>` : ""}
      <strong>Aktivitet:</strong> ${aktivitet}<br>
      <button class="btn route-btn" data-lat="${latlng[0]}" data-lng="${latlng[1]}">Visa rutt</button>
    `;
  },

  getOrCreateLayerGroup(store, key) {
    if (!store[key]) {
      store[key] = L.layerGroup();
    }
    return store[key];
  },

  toggleMenu(open) {
    if (open) {
      menuDrawer.classList.add("open");
      document.body.classList.add("no-scroll");
    } else {
      menuDrawer.classList.remove("open");
      document.body.classList.remove("no-scroll");
    }
  }
};

// === Ikoner ===
const icons = {
  user: L.divIcon({
    className: 'user-location-icon',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -9]
  }),
  address: L.icon({
    iconUrl: 'GPS.svg',
    iconSize: [13, 22],
    iconAnchor: [6, 22],
    popupAnchor: [0, -22]
  }),
  gaza: L.icon({
    iconUrl: 'Logotyp_Nal.svg',
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -38]
  })
};

// === Kartinitiering ===
const lightTiles = L.tileLayer('https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png', {
  minZoom: 0,
  maxZoom: 20,
  attribution: '&copy; <a href="https://www.stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
});

const map = L.map('map', { layers: [lightTiles], zoomControl: false })
  .setView([55.591988278009765, 13.011586184559851], 16)
  .setMaxBounds(L.latLngBounds([55.53, 12.90], [55.65, 13.12]))
  .setMinZoom(14)
  .setMaxZoom(20);

map.on('drag', () => map.panInsideBounds(map.getMaxBounds(), { animate: false }));

// === Användarposition ===
map.createPane('userPane').style.zIndex = 1000;
let userMarker = null;
let userLatLng = null;
let routingControl = null;

L.Control.Locate = L.Control.extend({
  onAdd: function() {
    const container = L.DomUtil.create('div', 'leaflet-control');
    const link = L.DomUtil.create('a', 'leaflet-bar leaflet-control-locate', container);
    link.href = '#';
    link.title = 'Visa min plats';
    L.DomEvent.on(link, 'click', L.DomEvent.stop).on(link, 'click', async () => {
      try {
        const latlng = await utils.getUserLocation();
        userLatLng = latlng;
        if (!userMarker) {
          userMarker = L.marker(latlng, { icon: icons.user, pane: 'userPane' }).addTo(map).bindPopup("Du är här!");
        } else {
          userMarker.setLatLng(latlng);
        }
        map.setView(latlng, 16);
        userMarker.openPopup();
      } catch (err) {
        alert(err.message);
      }
    });
    return container;
  },
  onRemove: function() {}
});

L.control.locate = opts => new L.Control.Locate(opts);
L.control.locate({ position: 'topleft' }).addTo(map);

// === Byggnader ===
const buildingOffset = { lng: -0.00002, lat: 0.00007 };

function addBuildingSidesFromLayer(layerGroup) {
  const wallColor = '#faf4b7';
  layerGroup.eachLayer(layer => {
    const coords = layer.feature?.geometry?.coordinates?.[0];
    if (coords) {
      for (let i = 0; i < coords.length - 1; i++) {
        const base1 = coords[i];
        const base2 = coords[i + 1];
        const top1 = [base1[0] + buildingOffset.lng, base1[1] + buildingOffset.lat];
        const top2 = [base2[0] + buildingOffset.lng, base2[1] + buildingOffset.lat];
        L.geoJSON({
          type: "Feature",
          geometry: { type: "Polygon", coordinates: [[base1, base2, top2, top1, base1]] }
        }, {
          style: { color: wallColor, weight: 0.5, fillColor: wallColor, fillOpacity: 1 }
        }).addTo(map);
      }
    }
  });
}

fetch('data/byggnader_mollan_rev.geojson')
  .then(res => res.json())
  .then(data => {
    const offsetData = JSON.parse(JSON.stringify(data));
    offsetData.features.forEach(f => {
      if (f.geometry.type === "Polygon") {
        f.geometry.coordinates[0] = f.geometry.coordinates[0].map(c => [
          c[0] + buildingOffset.lng,
          c[1] + buildingOffset.lat
        ]);
      }
    });
    L.geoJSON(data).eachLayer(l => addBuildingSidesFromLayer(L.layerGroup([l])));
    L.geoJSON(offsetData, {
      style: { color: '#f47c31', weight: 1, fillColor: '#f47c31', fillOpacity: 1 }
    }).addTo(map);
  });

// === Aktiviteter ===
const aktivitetLayersLive = {};
let layerControl = null;
let cachedGeoJson = null;
let lastUpdate = 0;

async function uppdateraAktiviteterFrånGoogleFormulär() {
  if (Date.now() - lastUpdate < 60000) return;
  lastUpdate = Date.now();
  try {
    const [formRes, geoRes] = await Promise.all([
      fetch('https://opensheet.elk.sh/1t5ILyafrrFJNiO2V0QrqbZyFNgTdXcY7SujnOOQHbfI/Formulärsvar 1'),
      cachedGeoJson ? Promise.resolve({ json: () => cachedGeoJson }) : fetch('data/adresser_rev.geojson')
    ]);
    const formData = await formRes.json();
    if (!cachedGeoJson) cachedGeoJson = await geoRes.json();
    const geoJson = JSON.parse(JSON.stringify(cachedGeoJson));

    const formSvar = formData.map(row => ({
      adress: utils.normaliseraAdress(row["📍 Gatuadress till din innergård"] || ""),
      aktivitet: row["🕺 Vad kommer hända på innergården?"] || "Ingen aktivitet angiven",
      kategori: row["Kategori"] || "Övrigt"
    }));

    geoJson.features.forEach(f => {
      const geoAdress = utils.normaliseraAdress(f.properties.beladress || "");
      const match = formSvar.find(entry => geoAdress === entry.adress);
      if (match) {
        f.properties = { ...f.properties, Aktivitet: match.aktivitet, Kategori: match.kategori, oppen: "Ja" };
      } else {
        f.properties = { ...f.properties, oppen: "Nej" };
      }
    });

    Object.values(aktivitetLayersLive).forEach(l => l.clearLayers());
    geoJson.features.filter(f => f.properties.oppen === "Ja").forEach(f => {
      const coords = f.geometry.type === "MultiPoint" ? f.geometry.coordinates : [f.geometry.coordinates];
      coords.forEach(c => {
        const latlng = [c[1], c[0]];
        const marker = L.marker(latlng, { icon: icons.address }).bindPopup(
          utils.createPopupHtml({ adress: f.properties.beladress, aktivitet: f.properties.Aktivitet, latlng })
        );
        utils.getOrCreateLayerGroup(aktivitetLayersLive, f.properties.Kategori).addLayer(marker);
      });
    });

    if (layerControl) map.removeControl(layerControl);
    layerControl = L.control.layers(null, aktivitetLayersLive, { collapsed: true, position: 'topright' }).addTo(map);
  } catch (err) {
    console.error("Fel vid formulärintegration:", err);
  }
}
uppdateraAktiviteterFrånGoogleFormulär();
setInterval(uppdateraAktiviteterFrånGoogleFormulär, 120000);

// === Rutter ===
async function routeTo(destinationLatLng) {
  if (!userLatLng) {
    document.getElementById("spinnerOverlay").style.display = "flex";
    try {
      userLatLng = await utils.getUserLocation();
      if (!userMarker) {
        userMarker = L.marker(userLatLng, { icon: icons.user, pane: 'userPane' }).addTo(map).bindPopup("Du är här!");
      } else {
        userMarker.setLatLng(userLatLng);
      }
    } catch (err) {
      alert(err.message);
      return;
    } finally {
      document.getElementById("spinnerOverlay").style.display = "none";
    }
  }

  map.setView(userLatLng, 16);
  if (routingControl) map.removeControl(routingControl);
  routingControl = L.Routing.control({
    waypoints: [L.latLng(userLatLng), L.latLng(destinationLatLng)],
    show: false,
    addWaypoints: false,
    draggableWaypoints: false,
    createMarker: () => null,
    lineOptions: { styles: [{ color: '#67aae2', weight: 5 }] },
    router: L.Routing.osrmv1({
      serviceUrl: 'https://routing.openstreetmap.de/routed-foot/route/v1',
      profile: 'foot',
      language: 'sv',
      steps: false
    })
  }).addTo(map);
  removeRouteBtn.style.display = 'block';
}

// === Event delegation ===
document.addEventListener('click', e => {
  if (e.target.matches('.route-btn')) {
    const lat = parseFloat(e.target.dataset.lat);
    const lng = parseFloat(e.target.dataset.lng);
    routeTo([lat, lng]);
  } else if (e.target.matches('[data-overlay]')) {
    e.preventDefault();
    utils.toggleMenu(false);
    openOverlay(e.target.dataset.overlay);
  }
});

// === Rensa rutt ===
removeRouteBtn.addEventListener('click', () => {
  if (routingControl) {
    map.removeControl(routingControl);
    routingControl = null;
    removeRouteBtn.style.display = 'none';
  }
});

// === Meny ===
menuToggle.addEventListener("click", () => utils.toggleMenu(!menuDrawer.classList.contains("open")));
menuClose.addEventListener("click", () => utils.toggleMenu(false));
document.addEventListener("click", e => {
  if (!menuDrawer.contains(e.target) && !menuToggle.contains(e.target)) utils.toggleMenu(false);
});

// === Overlays ===
function openOverlay(id) {
  const el = document.getElementById(id);
  if (el) {
    setTimeout(() => {
      el.style.display = "flex";
      requestAnimationFrame(() => {
        el.classList.add("show");
        document.body.classList.add("no-scroll");
      });
    }, 300);
  }
}
function closeOverlay(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove("show");
    setTimeout(() => {
      el.style.display = "none";
      document.body.classList.remove("no-scroll");
    }, 300);
  }
}

// === Viewport höjd ===
function fixViewportHeight() {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
}
window.addEventListener('resize', fixViewportHeight);
window.addEventListener('orientationchange', fixViewportHeight);
window.addEventListener('focus', fixViewportHeight);
window.addEventListener('touchstart', () => setTimeout(fixViewportHeight, 300));
fixViewportHeight();
