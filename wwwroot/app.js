const state = { config: null, map: null, mapCrs: 'EPSG:3857', featureInfoFormat: 'text/plain', osm: null, navlogLayers: new Map(), layerInputs: new Map(), layerOrder: [], availableLayers: [], searchMarker: null };
const $ = (id) => document.getElementById(id);
const NAVLOG_WMS_URL = 'https://gdw.navlog.de/data/navlog/wms';
const STORAGE_KEYS = { kid: 'navlog-ipad-kid', settings: 'navlog-ipad-settings' };
// Statische App-Version für die PWA. Beim Ausliefern zusammen mit den ?v=-Tags anheben.
const APP_VERSION = '1.0.1';
const APP_BUILD = '2026-07-24';
const DEFAULT_CONFIG = { configured: false, title: 'NavLog Waldbrandkarte', centerLatitude: 49.696849, centerLongitude: 8.531227, zoom: 14, defaultLayers: [], showOpenStreetMap: false };
const INITIAL_LAYER_PATTERNS = [
  /^dtk0*25(?:\b|\s)/,
  /^waldbrand\s*poi(?:\b|\s)/,
  /^hydrant(?:en)?(?:\b|\s)/,
  /^rettungspunkte?(?:\b|\s)/
];

document.addEventListener('DOMContentLoaded', start);

async function start() {
  wireUi();
  try {
    state.config = loadLocalConfig();
    applyConfigToUi();
    if (!state.config.configured) {
      initMap('EPSG:3857');
      setStatus('NavLog-Zugang einrichten');
      $('setupDialog').showModal();
    } else {
      await loadCapabilities();
    }
  } catch (error) {
    setStatus('Start fehlgeschlagen');
    toast(error.message || 'Die Anwendung konnte nicht gestartet werden.');
  } finally {
    $('app').setAttribute('aria-busy', 'false');
  }
}

function wireUi() {
  $('layersButton').addEventListener('click', openPanel);
  $('searchButton').addEventListener('click', toggleSearch);
  $('searchForm').addEventListener('submit', searchMap);
  $('closePanel').addEventListener('click', closePanel);
  $('backdrop').addEventListener('click', closePanel);
  $('homeButton').addEventListener('click', () => state.map.setView([state.config.centerLatitude, state.config.centerLongitude], state.config.zoom));
  $('printButton').addEventListener('click', printMap);
  $('locateButton').addEventListener('click', locate);
  $('fullscreenButton').addEventListener('click', toggleFullscreen);
  $('osmToggle').addEventListener('change', toggleOsm);
  $('allLayersOff').addEventListener('click', turnAllLayersOff);
  $('restoreStartView').addEventListener('click', restoreStartView);
  $('setupForm').addEventListener('submit', saveKid);
  $('settingsForm').addEventListener('submit', saveSettings);
  $('resetAccessButton').addEventListener('click', resetAccess);
  $('closeQrDialog').addEventListener('click', () => $('qrDialog').close());
  $('qrDialog').addEventListener('click', event => { if (event.target === $('qrDialog')) $('qrDialog').close(); });
  document.addEventListener('click', event => {
    const button = event.target.closest('.coordinate-qr-button');
    if (button) showQrDialog(Number(button.dataset.lat), Number(button.dataset.lon));
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePanel(); });
}

function initMap(crsCode) {
  if (state.map) return;
  state.mapCrs = crsCode;
  const mapCrs = crsCode === 'EPSG:4326' ? L.CRS.EPSG4326 : L.CRS.EPSG3857;
  state.map = L.map('map', { zoomControl: true, crs: mapCrs }).setView([state.config.centerLatitude, state.config.centerLongitude], state.config.zoom);
  state.map.createPane('navlogBackgroundPane');
  state.map.getPane('navlogBackgroundPane').style.zIndex = '220';
  state.map.createPane('navlogOverlayPane');
  state.map.getPane('navlogOverlayPane').style.zIndex = '420';
  state.osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap-Mitwirkende'
  });
  const osmCompatible = crsCode === 'EPSG:3857';
  $('osmToggle').disabled = !osmCompatible;
  if (!osmCompatible) {
    $('osmToggle').checked = false;
    $('osmToggle').closest('label').title = 'Der NavLog-Dienst unterstützt in dieser Konfiguration kein Web-Mercator.';
  }
  if (state.config.showOpenStreetMap && osmCompatible) state.osm.addTo(state.map);
  state.map.on('click', queryMapPoint);
}

async function loadCapabilities() {
  setStatus('NavLog-Layer werden geladen …');
  try {
    const response = await fetch(navlogUrl({ SERVICE: 'WMS', REQUEST: 'GetCapabilities', VERSION: '1.1.1' }));
    if (!response.ok) throw new Error(`NavLog antwortet mit Status ${response.status}`);
    const xml = new DOMParser().parseFromString(await response.text(), 'text/xml');
    const serviceError = xml.querySelector('ServiceException, ExceptionText, parsererror');
    if (serviceError) throw new Error(serviceError.textContent.trim());
    const supportedCrs = [...xml.querySelectorAll('SRS, CRS')].flatMap(node => node.textContent.trim().split(/\s+/));
    const mapCrs = supportedCrs.includes('EPSG:3857') || supportedCrs.includes('EPSG:900913') ? 'EPSG:3857' : 'EPSG:4326';
    state.featureInfoFormat = extractFeatureInfoFormat(xml);
    initMap(mapCrs);
    state.availableLayers = extractLayers(xml);
    if (state.config.useInitialLayerDefaults) state.config.defaultLayers = resolveInitialLayers(state.availableLayers);
    renderLayers();
    setStatus(`${state.availableLayers.length} NavLog-Layer verfügbar`);
  } catch (error) {
    initMap('EPSG:3857');
    $('layerList').innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
    setStatus('NavLog nicht erreichbar');
    toast('NavLog konnte nicht geladen werden. Bitte Zugang und Internetverbindung prüfen.');
  }
}

function extractLayers(xml) {
  return [...xml.querySelectorAll('Layer')].map(node => {
    const direct = (selector) => [...node.children].find(child => child.localName === selector)?.textContent?.trim();
    let current = node;
    let queryable = false;
    while (current?.localName === 'Layer') {
      if (current.hasAttribute('queryable')) {
        queryable = ['1', 'true'].includes(current.getAttribute('queryable').toLowerCase());
        break;
      }
      current = current.parentElement;
    }
    return { name: direct('Name'), title: direct('Title'), queryable };
  }).filter(layer => layer.name).filter((layer, index, all) => all.findIndex(other => other.name === layer.name) === index);
}

function resolveInitialLayers(layers) {
  const selected = [];
  for (const pattern of INITIAL_LAYER_PATTERNS) {
    const match = layers.find(layer => [layer.name, layer.title].some(value => pattern.test(normalizeLayerLabel(value))));
    if (match && !selected.includes(match.name)) selected.push(match.name);
  }
  return selected;
}

function normalizeLayerLabel(value) {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9äöüß]+/g, ' ').trim();
}

function extractFeatureInfoFormat(xml) {
  const request = [...xml.querySelectorAll('*')].find(node => node.localName === 'GetFeatureInfo');
  const formats = request ? [...request.querySelectorAll('*')].filter(node => node.localName === 'Format').map(node => node.textContent.trim()) : [];
  return formats.find(format => format.includes('json'))
    || formats.find(format => format === 'text/html')
    || formats.find(format => format === 'text/plain')
    || formats[0]
    || 'text/plain';
}

async function queryMapPoint(event) {
  const base = coordinatePopup(event.latlng.lat, event.latlng.lng);
  const queryableLayers = state.availableLayers.filter(layer => {
    const tile = state.navlogLayers.get(layer.name);
    return layer.queryable && tile && state.map.hasLayer(tile);
  });
  const popup = L.popup({ maxWidth: 420 }).setLatLng(event.latlng).setContent(queryableLayers.length ? `${base}<div class="feature-info muted">Symbolinformation wird geladen …</div>` : base).openOn(state.map);
  if (!queryableLayers.length) return;

  try {
    const size = state.map.getSize();
    const point = state.map.latLngToContainerPoint(event.latlng);
    const bounds = state.map.getBounds();
    const northWest = state.map.options.crs.project(bounds.getNorthWest());
    const southEast = state.map.options.crs.project(bounds.getSouthEast());
    const params = new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetFeatureInfo',
      LAYERS: queryableLayers.map(layer => layer.name).join(','),
      QUERY_LAYERS: queryableLayers.map(layer => layer.name).join(','),
      BBOX: [northWest.x, southEast.y, southEast.x, northWest.y].join(','),
      WIDTH: String(size.x), HEIGHT: String(size.y),
      X: String(Math.round(point.x)), Y: String(Math.round(point.y)),
      SRS: state.mapCrs, INFO_FORMAT: state.featureInfoFormat, FEATURE_COUNT: '10'
    });
    const response = await fetch(navlogUrl(Object.fromEntries(params)));
    if (!response.ok) throw new Error(`NavLog antwortet mit Status ${response.status}`);
    const info = await formatFeatureInfo(response, queryableLayers);
    if (state.map.hasLayer(popup)) popup.setContent(`${base}${info}`);
  } catch (error) {
    if (state.map.hasLayer(popup)) popup.setContent(`${base}<div class="feature-info muted">Für diesen Punkt konnte keine Symbolinformation abgerufen werden.</div>`);
  }
}

async function formatFeatureInfo(response, layers) {
  const contentType = response.headers.get('content-type') || state.featureInfoFormat;
  const text = await response.text();
  if (!text.trim()) return '<div class="feature-info muted">An dieser Stelle wurde kein abfragbares Symbol gefunden.</div>';

  if (contentType.includes('json')) {
    try {
      const data = JSON.parse(text);
      const rawFeatures = Array.isArray(data) ? data : data.features || [];
      const seenFeatures = new Set();
      const features = rawFeatures.filter(feature => {
        const properties = feature.properties || feature;
        const rescuePointNumber = properties.rp_nr ?? properties.RP_NR;
        const signature = rescuePointNumber != null
          ? `rettungspunkt:${rescuePointNumber}`
          : JSON.stringify(friendlyProperties(properties).map(entry => [entry.label, entry.value]));
        if (seenFeatures.has(signature)) return false;
        seenFeatures.add(signature);
        return true;
      });
      if (!features.length) return '<div class="feature-info muted">An dieser Stelle wurde kein abfragbares Symbol gefunden.</div>';
      const rescuePoints = features.filter(feature => {
        const properties = feature.properties || feature;
        return properties.rp_nr != null || properties.RP_NR != null;
      });
      const displayedFeatures = rescuePoints.length ? rescuePoints.slice(0, 1) : features.slice(0, 4);
      const blocks = displayedFeatures.map((feature, index) => {
        const properties = feature.properties || feature;
        const entries = friendlyProperties(properties);
        const isRescuePoint = properties.rp_nr != null || properties.RP_NR != null;
        if (!entries.length && !isRescuePoint) return '';
        const title = featureTitle(properties, layers[index] || layers[0]);
        const rows = title === 'Einsatzhinweis' && entries.length === 1 && entries[0].label === 'Hinweis'
          ? `<div class="feature-note">${escapeHtml(entries[0].value)}</div>`
          : entries.map(entry => `<div class="feature-row${entry.important ? ' important' : ''}"><span>${escapeHtml(entry.label)}</span><strong>${escapeHtml(entry.value)}</strong></div>`).join('');
        return `<section class="feature-card"><h4>${escapeHtml(title)}</h4>${rows}</section>`;
      }).filter(Boolean).join('');
      return blocks ? `<div class="feature-info"><strong>Information zum Symbol</strong>${blocks}</div>` : '<div class="feature-info muted">Für dieses Symbol liegen keine einsatzrelevanten Zusatzinformationen vor.</div>';
    } catch { }
  }

  const documentType = contentType.includes('html') ? 'text/html' : 'text/xml';
  const parsed = new DOMParser().parseFromString(text, documentType);
  const cleanText = (parsed.body?.textContent || parsed.documentElement?.textContent || text).replace(/\s+/g, ' ').trim();
  const serviceMessage = /no features|no results|keine objekte|kein objekt/i.test(cleanText);
  if (!cleanText || serviceMessage) return '<div class="feature-info muted">An dieser Stelle wurde kein abfragbares Symbol gefunden.</div>';
  return `<div class="feature-info"><strong>Symbolinformation</strong><p>${escapeHtml(cleanText.slice(0, 1800))}</p><small>Aktive Abfrage: ${escapeHtml(layers.map(layer => layer.title || layer.name).join(', '))}</small></div>`;
}

function friendlyProperties(properties) {
  const rescuePointNumber = properties.rp_nr ?? properties.RP_NR;
  if (rescuePointNumber != null) {
    const rescueEntries = [];
    const location = properties.ortsbeschr ?? properties.ORTSBESCHR ?? properties.ortsbeschreibung;
    const sign = properties.schild ?? properties.SCHILD;
    const accessible = properties.frei ?? properties.FREI;
    if (location) rescueEntries.push({ label: 'Lage', value: String(location).trim(), important: false, priority: 1 });
    if (sign && !/^(0|nein|false)$/i.test(String(sign))) rescueEntries.push({ label: 'Beschilderung', value: 'Vorhanden', important: false, priority: 2 });
    if (accessible && !/^(0|nein|false)$/i.test(String(accessible))) rescueEntries.push({ label: 'Zufahrt', value: 'Frei zugänglich', important: false, priority: 3 });
    return rescueEntries;
  }
  const hidden = new Set([
    'red_band', 'green_band', 'blue_band', 'alpha_band', 'oid', 'topologie',
    'uuid', 'act_date', 'action_date', 'objectid', 'fid', 'insert_date',
    'wgs_breite', 'wgs_laenge', 'urheber', 'bundesland', 'in_edges',
    'geaendert_am', 'geaendert_von', 'geändert_am', 'geändert_von',
    'erstellt_am', 'erstellt_von', 'created_at', 'created_by', 'updated_at', 'updated_by'
  ]);
  const labels = {
    name: 'Bezeichnung', bezeichnung: 'Bezeichnung', beschreibung: 'Beschreibung',
    wendemoeglichkeit_typ: 'Wendemöglichkeit', wendemöglichkeit_typ: 'Wendemöglichkeit',
    breite: 'Breite', laenge: 'Länge', länge: 'Länge', hoehe: 'Höhe', höhe: 'Höhe',
    tonnage: 'Zulässige Tonnage', gewicht: 'Gewicht', durchfahrtshoehe: 'Durchfahrtshöhe',
    durchfahrtsbreite: 'Durchfahrtsbreite', bemerkung: 'Hinweis', kommentar: 'Hinweis', comment: 'Hinweis', hinweis: 'Hinweis',
    status: 'Status', nummer: 'Nummer', kennung: 'Kennung', eigentuemer: 'Eigentümer',
    zustaendigkeit: 'Zuständigkeit', wasserentnahmestelle: 'Wasserentnahmestelle'
  };
  const entries = [];
  for (const [rawKey, rawValue] of Object.entries(properties)) {
    const key = rawKey.toLowerCase();
    if (hidden.has(key) || rawValue === null || rawValue === '' || typeof rawValue === 'object') continue;
    if (key === 'id' && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(rawValue))) continue;
    if ((key === 'name' || key === 'bezeichnung' || key === 'objektart') && /^\d+(?:\.0)?$/.test(String(rawValue))) continue;
    if (key === 'angabe' && /^0(?:\.0)?$/.test(String(rawValue))) continue;
    if (key === 'typ' && (properties.wendemoeglichkeit_typ != null || properties['wendemöglichkeit_typ'] != null || /^\d+(?:\.0)?$/.test(String(rawValue)))) continue;

    let value = String(rawValue).trim();
    let important = false;
    if (key === 'wendemoeglichkeit_typ' || key === 'wendemöglichkeit_typ') {
      const types = {
        '0': 'Nicht näher bestimmt',
        '1': 'Wendeplatte für Solofahrzeug (mind. 12 m)',
        '2': 'Wendeplatte für Gliederzug (mind. 20 m)',
        '3': 'Wendehammer für Solofahrzeug (mind. 12 m tief)',
        '4': 'Wendehammer für Gliederzug (mind. 25 m tief)',
        '5': 'Keine Wendemöglichkeit', '6': 'Wegende'
      };
      value = types[value.replace(/\.0$/, '')] || value;
      important = ['5', '6'].includes(String(rawValue).replace(/\.0$/, ''));
    } else if (/^(true|false)$/i.test(value)) {
      value = value.toLowerCase() === 'true' ? 'Ja' : 'Nein';
    }
    const label = labels[key] || rawKey.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
    entries.push({ label, value, important, priority: important ? 0 : (key === 'name' || key === 'bezeichnung' ? 1 : 5) });
  }
  return entries.sort((a, b) => a.priority - b.priority).slice(0, 10);
}

function featureTitle(properties, layer) {
  const rescuePointNumber = properties.rp_nr ?? properties.RP_NR;
  if (rescuePointNumber != null) return `Rettungspunkt ${rescuePointNumber}`;
  if (properties.wendemoeglichkeit_typ != null || properties['wendemöglichkeit_typ'] != null) return 'Wendemöglichkeit';
  if (properties.kommentar || properties.comment || properties.hinweis || properties.bemerkung) return 'Einsatzhinweis';
  const objectTypes = {
    '1': 'Brücke', '2': 'Kurve', '3': 'Durchfahrt', '4': 'Unterführung', '5': 'Wendemöglichkeit',
    '6': 'Schranke', '7': 'Platz', '8': 'Verkehrszeichen', '9': 'Verbindungsobjekt'
  };
  const typeName = objectTypes[String(properties.typ).replace(/\.0$/, '')];
  const descriptive = [properties.bezeichnung, properties.name, properties.objektart].find(value => value && !/^\d+(?:\.0)?$/.test(String(value)));
  return descriptive || typeName || layer?.title || layer?.name || 'Kartenobjekt';
}

function renderLayers() {
  const list = $('layerList');
  state.layerInputs.clear();
  list.replaceChildren();
  if (!state.availableLayers.length) {
    list.innerHTML = '<p class="muted">Der Dienst meldet keine auswählbaren Layer.</p>';
    return;
  }
  for (const layer of state.availableLayers) {
    const label = document.createElement('label');
    label.className = 'layer-item';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.config.defaultLayers.includes(layer.name);
    input.addEventListener('change', () => toggleNavlogLayer(layer, input.checked));
    state.layerInputs.set(layer.name, input);
    const icon = document.createElement('span');
    const kind = layerKind(layer);
    icon.className = `layer-icon ${kind}`;
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = layerIconSvg(kind);
    const text = document.createElement('span');
    text.textContent = layer.title || layer.name;
    label.append(input, icon, text);
    list.append(label);
  }
  for (const layerName of state.config.defaultLayers) {
    const layer = state.availableLayers.find(item => item.name === layerName);
    if (layer && state.layerInputs.has(layerName)) toggleNavlogLayer(layer, true);
  }
}

function toggleNavlogLayer(layer, enabled, updateLegend = true) {
  if (enabled) {
    if (isBackgroundLayer(layer)) {
      if (state.osm && state.map.hasLayer(state.osm)) state.map.removeLayer(state.osm);
      $('osmToggle').checked = false;
      for (const otherLayer of state.availableLayers.filter(item => item.name !== layer.name && isBackgroundLayer(item))) {
        const otherTile = state.navlogLayers.get(otherLayer.name);
        if (otherTile && state.map.hasLayer(otherTile)) state.map.removeLayer(otherTile);
        const otherInput = state.layerInputs.get(otherLayer.name);
        if (otherInput) otherInput.checked = false;
        state.layerOrder = state.layerOrder.filter(name => name !== otherLayer.name);
      }
    }
    if (!state.navlogLayers.has(layer.name)) {
      const pane = isBackgroundLayer(layer) ? 'navlogBackgroundPane' : 'navlogOverlayPane';
      const tile = L.tileLayer.wms(navlogUrl(), { layers: layer.name, format: 'image/png', transparent: true, version: '1.1.1', attribution: 'NavLog', pane });
      state.navlogLayers.set(layer.name, tile);
    }
    state.navlogLayers.get(layer.name).addTo(state.map);
    state.layerOrder = state.layerOrder.filter(name => name !== layer.name);
    state.layerOrder.push(layer.name);
    state.navlogLayers.get(layer.name).bringToFront();
  } else {
    const tile = state.navlogLayers.get(layer.name);
    if (tile) state.map.removeLayer(tile);
    state.layerOrder = state.layerOrder.filter(name => name !== layer.name);
  }
  if (updateLegend) renderLegend();
}

function isBackgroundLayer(layer) {
  const value = `${layer.name} ${layer.title || ''}`.toLowerCase();
  return /(^|\W)(dtk\d*|dop\d*|luftbild|orthophoto|topographische?\s+karten?|hintergrundkarte)(\W|$)/i.test(value);
}

function layerKind(layer) {
  if (isBackgroundLayer(layer)) return 'background';
  const value = `${layer.name} ${layer.title || ''}`.toLowerCase();
  if (/(punkt|poi|hydrant|rettung|wasser|schranke|platz|objekt|symbol)/i.test(value)) return 'points';
  if (/(weg|straße|strasse|route|verbindung|fahrbahn|netz)/i.test(value)) return 'routes';
  return 'thematic';
}

function layerIconSvg(kind) {
  if (kind === 'background') return '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="m3 5 5-2 8 3 5-2v15l-5 2-8-3-5 2V5Zm5-2v15m8-12v15"/></svg>';
  if (kind === 'points') return '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"/></svg>';
  if (kind === 'routes') return '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 4v4c0 3 3 3 3 6v6m11-16v5c0 3-6 3-6 6v5M3 4h4m10 0h4M6 20h4m1 0h4"/></svg>';
  return '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m12 3 9 5-9 5-9-5 9-5Zm-7.7 9L12 16.3 19.7 12 21 14l-9 5-9-5 1.3-2Z"/></svg>';
}

function turnAllLayersOff() {
  for (const layer of state.availableLayers) {
    const input = state.layerInputs.get(layer.name);
    if (input) input.checked = false;
    toggleNavlogLayer(layer, false, false);
  }
  renderLegend();
  toast('Alle NavLog-Layer sind ausgeschaltet.');
}

function restoreStartView() {
  for (const layer of state.availableLayers) {
    const input = state.layerInputs.get(layer.name);
    if (input) input.checked = false;
    toggleNavlogLayer(layer, false, false);
  }
  for (const layerName of state.config.defaultLayers) {
    const layer = state.availableLayers.find(item => item.name === layerName);
    const input = state.layerInputs.get(layerName);
    if (!layer || !input) continue;
    input.checked = true;
    toggleNavlogLayer(layer, true, false);
  }
  $('osmToggle').checked = state.config.showOpenStreetMap && !$('osmToggle').disabled;
  toggleOsm();
  state.map.setView([state.config.centerLatitude, state.config.centerLongitude], state.config.zoom);
  renderLegend();
  toast('Gespeicherte Startansicht wiederhergestellt.');
}

function renderLegend() {
  const active = state.availableLayers.filter(layer => {
    const tile = state.navlogLayers.get(layer.name);
    return tile && state.map.hasLayer(tile);
  });
  buildLegend($('legendList'), active, 'Noch kein Layer aktiviert.');
  buildLegend($('printLegendList'), active, 'Keine NavLog-Layer aktiviert.');
}

function buildLegend(list, active, emptyText) {
  list.replaceChildren();
  if (!active.length) {
    const message = document.createElement('p');
    message.className = 'muted';
    message.textContent = emptyText;
    list.append(message);
    return;
  }
  for (const layer of active) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    const title = document.createElement('strong');
    title.textContent = layer.title || layer.name;
    const image = document.createElement('img');
    image.alt = `Legende für ${layer.title || layer.name}`;
    image.src = navlogUrl({ SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetLegendGraphic', FORMAT: 'image/png', LAYER: layer.name });
    image.addEventListener('error', () => {
      image.remove();
      const message = document.createElement('p');
      message.className = 'error';
      message.textContent = 'Für diesen Layer liefert NavLog keine separate Legende.';
      item.append(message);
    }, { once: true });
    item.append(title, image);
    list.append(item);
  }
}

function openPanel() { $('panel').classList.add('open'); $('panel').setAttribute('aria-hidden', 'false'); $('layersButton').setAttribute('aria-expanded', 'true'); $('backdrop').hidden = false; }
function closePanel() { $('panel').classList.remove('open'); $('panel').setAttribute('aria-hidden', 'true'); $('layersButton').setAttribute('aria-expanded', 'false'); $('backdrop').hidden = true; }
function toggleOsm() {
  if ($('osmToggle').checked) {
    for (const layer of state.availableLayers.filter(isBackgroundLayer)) {
      const tile = state.navlogLayers.get(layer.name);
      if (tile && state.map.hasLayer(tile)) state.map.removeLayer(tile);
      const input = state.layerInputs.get(layer.name);
      if (input) input.checked = false;
      state.layerOrder = state.layerOrder.filter(name => name !== layer.name);
    }
    state.osm.addTo(state.map);
    renderLegend();
  } else {
    state.map.removeLayer(state.osm);
  }
}

function printMap() {
  closePanel();
  $('searchBox').hidden = true;
  $('searchButton').setAttribute('aria-expanded', 'false');
  renderLegend();
  state.map.invalidateSize(false);
  window.print();
}

function toggleSearch() {
  const box = $('searchBox');
  box.hidden = !box.hidden;
  $('searchButton').setAttribute('aria-expanded', String(!box.hidden));
  if (!box.hidden) $('searchInput').focus();
}

async function searchMap(event) {
  event.preventDefault();
  const query = $('searchInput').value.trim();
  const results = $('searchResults');
  if (!query) return;
  results.innerHTML = '<p class="muted">Suche läuft …</p>';

  const coordinate = parseCoordinate(query);
  if (coordinate) {
    showSearchResult(coordinate.lat, coordinate.lon, `Koordinate ${coordinate.lat.toFixed(6)}, ${coordinate.lon.toFixed(6)}`);
    results.replaceChildren();
    return;
  }

  const mgrsCoordinate = parseMgrs(query);
  if (mgrsCoordinate) {
    showSearchResult(mgrsCoordinate.lat, mgrsCoordinate.lon, `MGRS ${mgrsCoordinate.mgrs}`);
    results.replaceChildren();
    return;
  }

  try {
    const searchUrl = new URL('https://nominatim.openstreetmap.org/search');
    searchUrl.search = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '6', countrycodes: 'de', q: query });
    const response = await fetch(searchUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Die Adresssuche ist momentan nicht erreichbar.');
    const matches = await response.json();
    results.replaceChildren();
    if (!matches.length) {
      results.innerHTML = '<p class="muted">Keine Treffer gefunden.</p>';
      return;
    }
    for (const match of matches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-result';
      button.textContent = match.display_name;
      button.addEventListener('click', () => showSearchResult(Number(match.lat), Number(match.lon), match.display_name));
      results.append(button);
    }
  } catch (error) {
    results.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
  }
}

function parseCoordinate(text) {
  const match = text.match(/^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/);
  if (!match) return null;
  const lat = Number(match[1].replace(',', '.'));
  const lon = Number(match[2].replace(',', '.'));
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { lat, lon } : null;
}

function parseMgrs(text) {
  const normalized = text.toUpperCase().replace(/\s+/g, '');
  if (!/^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z]{2}(?:\d{2}){1,5}$/.test(normalized)) return null;
  try {
    const point = mgrs.toPoint(normalized);
    return { lon: Number(point[0]), lat: Number(point[1]), mgrs: formatMgrs(normalized) };
  } catch {
    return null;
  }
}

function toMgrs(lat, lon) {
  try { return formatMgrs(mgrs.forward([lon, lat], 5)); }
  catch { return 'außerhalb des MGRS-Bereichs'; }
}

function formatMgrs(value) {
  const normalized = value.toUpperCase().replace(/\s+/g, '');
  const match = normalized.match(/^(\d{1,2}[C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d+)$/);
  if (!match || match[3].length % 2 !== 0) return normalized;
  const half = match[3].length / 2;
  return `${match[1]} ${match[2]} ${match[3].slice(0, half)} ${match[3].slice(half)}`;
}

function coordinatePopup(lat, lon, heading = 'Koordinaten') {
  const qrIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 3h8v8H3V3Zm2 2v4h4V5H5Zm8-2h8v8h-8V3Zm2 2v4h4V5h-4ZM3 13h8v8H3v-8Zm2 2v4h4v-4H5Zm8-2h3v3h-3v-3Zm5 0h3v5h-2v-3h-1v-2Zm-5 5h2v3h-2v-3Zm4-1h2v2h2v2h-4v-4Z"/></svg>';
  return `<div class="coordinate-block"><div><strong>${heading}</strong><br>GPS: ${lat.toFixed(6)}, ${lon.toFixed(6)}<br>MGRS: ${toMgrs(lat, lon)}</div><button class="coordinate-qr-button" type="button" data-lat="${lat}" data-lon="${lon}" aria-label="QR-Code für dieses Ziel anzeigen" title="QR-Code anzeigen">${qrIcon}</button></div>`;
}

function showQrDialog(lat, lon) {
  const navigationUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lon.toFixed(6)}`;
  const container = $('qrCode');
  container.replaceChildren();
  new QRCode(container, {
    text: navigationUrl,
    width: 240,
    height: 240,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });
  $('qrCoordinates').innerHTML = `GPS: ${lat.toFixed(6)}, ${lon.toFixed(6)}<br>MGRS: ${toMgrs(lat, lon)}`;
  $('qrNavigationLink').href = navigationUrl;
  $('qrDialog').showModal();
}

function showSearchResult(lat, lon, label) {
  if (state.searchMarker) state.map.removeLayer(state.searchMarker);
  state.searchMarker = L.marker([lat, lon]).addTo(state.map).bindPopup(`${coordinatePopup(lat, lon, 'Suchtreffer')}<br>${escapeHtml(label)}`).openPopup();
  state.map.setView([lat, lon], Math.max(state.map.getZoom(), 15));
  $('searchBox').hidden = true;
  $('searchButton').setAttribute('aria-expanded', 'false');
}

function locate() {
  setStatus('Standort wird ermittelt …');
  state.map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
  state.map.once('locationfound', event => { L.circleMarker(event.latlng, { radius: 9, color: '#fff', weight: 3, fillColor: '#1769aa', fillOpacity: 1 }).addTo(state.map).bindPopup(`${coordinatePopup(event.latlng.lat, event.latlng.lng, 'Eigener Standort')}<br>Genauigkeit: etwa ${Math.round(event.accuracy)} m`).openPopup(); setStatus('Standort angezeigt'); });
  state.map.once('locationerror', () => { setStatus('Standort nicht verfügbar'); toast('Der Standort konnte nicht ermittelt werden. Bitte Browserfreigabe prüfen.'); });
}

async function toggleFullscreen() {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); }
  catch { toast('Vollbild wird von diesem Browser nicht unterstützt.'); }
}

async function saveKid(event) {
  event.preventDefault();
  $('setupError').textContent = '';
  try {
    const kid = $('kidInput').value.trim();
    if (!kid || kid.length > 256) throw new Error('Bitte eine gültige NavLog-Kunden-ID eingeben.');
    localStorage.setItem(STORAGE_KEYS.kid, kid);
    window.location.reload();
  } catch (error) { $('setupError').textContent = error.message; }
}

function resetAccess() {
  if (!window.confirm('NavLog-Zugang auf diesem iPad wirklich löschen und neu eingeben?')) return;
  localStorage.removeItem(STORAGE_KEYS.kid);
  window.location.reload();
}

async function saveSettings(event) {
  event.preventDefault();
  const center = state.map.getCenter();
  const enabled = state.layerOrder.filter(name => {
    const tile = state.navlogLayers.get(name);
    return tile && state.map.hasLayer(tile);
  });
  const next = {
    title: $('settingTitle').value.trim() || 'NavLog Waldbrandkarte',
    centerLatitude: center.lat,
    centerLongitude: center.lng,
    zoom: state.map.getZoom(),
    defaultLayers: enabled,
    showOpenStreetMap: $('osmToggle').checked
  };
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(next));
    state.config = { ...state.config, ...next };
    applyConfigToUi();
    toast('Aktuelle Ansicht wurde als Startansicht gespeichert.');
  } catch (error) { toast(error.message); }
}

function applyConfigToUi() {
  document.title = state.config.title;
  $('title').textContent = state.config.title;
  $('printTitle').textContent = state.config.title;
  $('settingTitle').value = state.config.title;
  $('settingLat').value = Number(state.config.centerLatitude).toFixed(6);
  $('settingLon').value = Number(state.config.centerLongitude).toFixed(6);
  $('settingZoom').value = state.config.zoom;
  $('osmToggle').checked = state.config.showOpenStreetMap;
  $('appVersion').textContent = `v${APP_VERSION} · Stand ${APP_BUILD}`;
}

function loadLocalConfig() {
  let settings = {};
  try { settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || '{}'); }
  catch { settings = {}; }
  const kid = localStorage.getItem(STORAGE_KEYS.kid)?.trim();
  const hasSavedLayerSelection = Array.isArray(settings.defaultLayers);
  return {
    ...DEFAULT_CONFIG,
    ...settings,
    configured: Boolean(kid),
    defaultLayers: hasSavedLayerSelection ? settings.defaultLayers : [],
    useInitialLayerDefaults: !hasSavedLayerSelection
  };
}

function navlogUrl(params = {}) {
  const url = new URL(NAVLOG_WMS_URL);
  const kid = localStorage.getItem(STORAGE_KEYS.kid)?.trim();
  if (kid) url.searchParams.set('kid', kid);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function setStatus(text) { $('status').textContent = text; }
let toastTimer;
function toast(text) { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').classList.add('show'); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4200); }
function escapeHtml(text) { const node = document.createElement('span'); node.textContent = text; return node.innerHTML; }

window.addEventListener('beforeprint', () => {
  renderLegend();
  state.map?.invalidateSize(false);
});
window.addEventListener('afterprint', () => setTimeout(() => state.map?.invalidateSize(false), 50));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
