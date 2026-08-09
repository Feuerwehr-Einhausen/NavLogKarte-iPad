const state = { config: null, map: null, mapCrs: 'EPSG:3857', featureInfoFormat: 'text/plain', osm: null, navlogLayers: new Map(), layerInputs: new Map(), layerOrder: [], availableLayers: [], searchMarker: null, measure: { active: false, visible: true, mode: null, points: [], markers: [], tempLayer: null, group: null, saved: new Map(), editingId: null, editingBackup: null }, signs: { active: false, visible: true, selected: null, editingId: null, group: null, saved: new Map() }, ffeh: { active: false, visible: true, openOnly: false, selected: null, editingId: null, editingBackup: null, editingIsNew: false, editingHadLocal: false, group: null, markers: new Map(), repo: [] }, strassen: { visible: false, loading: null, features: [], group: null, timer: null }, weather: { marker: null }, presets: { manage: false } };
const $ = (id) => document.getElementById(id);
const NAVLOG_WMS_URL = 'https://gdw.navlog.de/data/navlog/wms';
const STORAGE_KEYS = { kid: 'navlog-ipad-kid', settings: 'navlog-ipad-settings' };
// Statische App-Version für die PWA. Beim Ausliefern zusammen mit den ?v=-Tags anheben.
const APP_VERSION = '1.6.1';
const APP_BUILD = '2026-08-09';
const DEFAULT_CONFIG = { configured: false, title: 'NavLog Waldbrandkarte', centerLatitude: 49.696849, centerLongitude: 8.531227, zoom: 14, defaultLayers: [], showOpenStreetMap: false, showFfehLayer: true, showStrassenLayer: false, showSignsLayer: true, showMeasureLayer: true, layerPresets: [] };
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
  // Erklärzeile im Layer-Panel mit exakt den Symbolen der Layerliste füllen.
  for (const icon of document.querySelectorAll('[data-layer-kind]')) icon.innerHTML = layerIconSvg(icon.dataset.layerKind);
  $('layersButton').addEventListener('click', openPanel);
  $('searchButton').addEventListener('click', toggleSearch);
  // Mit der Tastatur geöffnet (event.detail === 0) springt der Fokus in das Menü;
  // beim Tippen bleibt er am Knopf, sonst zöge die Ansicht unerwartet mit.
  $('menuButton').addEventListener('click', event => { toggleAppMenu(); if (event.detail === 0) $('appMenu').querySelector('.app-menu-item')?.focus(); });
  $('appMenu').addEventListener('keydown', moveAppMenuFocus);
  $('searchForm').addEventListener('submit', searchMap);
  $('closePanel').addEventListener('click', closePanel);
  $('backdrop').addEventListener('click', closePanel);
  $('homeButton').addEventListener('click', () => state.map.setView([state.config.centerLatitude, state.config.centerLongitude], state.config.zoom));
  $('printButton').addEventListener('click', printMap);
  $('legendButton').addEventListener('click', toggleLegendOverlay);
  $('legendClose').addEventListener('click', () => setLegendOverlay(false));
  $('locateButton').addEventListener('click', locate);
  $('fullscreenButton').addEventListener('click', toggleFullscreen);
  $('osmToggle').addEventListener('change', toggleOsm);
  $('allLayersOff').addEventListener('click', turnAllLayersOff);
  $('restoreStartView').addEventListener('click', restoreStartView);
  $('layerPresetManage').addEventListener('click', toggleLayerPresetManage);
  $('saveLayerPresetButton').addEventListener('click', openLayerPresetDialog);
  $('layerPresetForm').addEventListener('submit', saveLayerPreset);
  $('closeLayerPresetDialog').addEventListener('click', () => $('layerPresetDialog').close());
  $('layerPresetDialog').addEventListener('click', event => { if (event.target === $('layerPresetDialog')) $('layerPresetDialog').close(); });
  $('setupForm').addEventListener('submit', saveKid);
  // saveSettings bleibt unverändert; das Schließen hängt nur hinten dran.
  $('settingsForm').addEventListener('submit', async event => { await saveSettings(event); $('settingsDialog').close(); });
  $('openSettingsDialog').addEventListener('click', () => { closeAppMenu(); $('settingsDialog').showModal(); });
  $('closeSettingsDialog').addEventListener('click', () => $('settingsDialog').close());
  $('settingsDialog').addEventListener('click', event => { if (event.target === $('settingsDialog')) $('settingsDialog').close(); });
  $('resetAccessButton').addEventListener('click', () => { closeAppMenu(); resetAccess(); });
  $('measureButton').addEventListener('click', toggleMeasure);
  $('measureClose').addEventListener('click', closeMeasure);
  $('measureCollapse').addEventListener('click', () => setSheetCollapsed('measureBar', !$('measureBar').classList.contains('collapsed')));
  $('signCollapse').addEventListener('click', () => setSheetCollapsed('signBar', !$('signBar').classList.contains('collapsed')));
  $('measureUndo').addEventListener('click', undoMeasurePoint);
  $('measureFinish').addEventListener('click', () => finishMeasurement(true));
  $('measureClear').addEventListener('click', clearMeasurements);
  for (const button of document.querySelectorAll('.measure-mode')) button.addEventListener('click', () => { setMeasureMode(button.dataset.mode); collapseSheetOnPhone('measureBar'); });
  for (const button of document.querySelectorAll('.radius-preset')) button.addEventListener('click', () => { $('radiusInput').value = button.dataset.radius; updateWorkingMeasure(); });
  $('radiusInput').addEventListener('input', updateWorkingMeasure);
  $('ffehToggle').addEventListener('change', toggleFfehLayer);
  $('strassenToggle').addEventListener('change', toggleStrassenLayer);
  $('signsToggle').addEventListener('change', toggleSignsLayer);
  $('measureToggle').addEventListener('change', toggleMeasureLayer);
  $('ffehButton').addEventListener('click', toggleFfeh);
  $('ffehClose').addEventListener('click', () => closeFfeh());
  $('ffehCollapse').addEventListener('click', () => setSheetCollapsed('ffehBar', !$('ffehBar').classList.contains('collapsed')));
  $('ffehNameInput').addEventListener('input', () => onFfehOptionInput());
  $('ffehDescriptionInput').addEventListener('input', () => onFfehOptionInput());
  $('ffehCheckerInput').addEventListener('input', () => onFfehOptionInput());
  $('ffehAccessSelect').addEventListener('change', () => onFfehOptionInput());
  $('ffehStatusSelect').addEventListener('change', () => onFfehOptionInput(true));
  $('ffehSourceSelect').addEventListener('change', () => onFfehOptionInput(false, true));
  $('ffehOpenOnlyToggle').addEventListener('change', toggleFfehOpenOnly);
  $('ffehLocateAdd').addEventListener('click', addFfehPointAtLocation);
  $('ffehFinishEdit').addEventListener('click', finishFfehEditAndClose);
  $('ffehCancelEdit').addEventListener('click', cancelFfehEditAndClose);
  $('ffehExport').addEventListener('click', () => { closeAppMenu(); exportFfehPoints(); });
  $('ffehImport').addEventListener('click', () => { closeAppMenu(); $('ffehImportInput').click(); });
  $('ffehImportInput').addEventListener('change', event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) importFfehFile(file); });
  $('signsButton').addEventListener('click', toggleSigns);
  $('signClose').addEventListener('click', closeSigns);
  $('signClearAll').addEventListener('click', clearSigns);
  $('signLabelInput').addEventListener('input', onSignOptionInput);
  $('signRotationInput').addEventListener('input', onSignOptionInput);
  $('weatherButton').addEventListener('click', toggleWeather);
  $('closeWeather').addEventListener('click', closeWeather);
  $('weatherRefresh').addEventListener('click', refreshWeather);
  $('closeQrDialog').addEventListener('click', () => $('qrDialog').close());
  $('qrDialog').addEventListener('click', event => { if (event.target === $('qrDialog')) $('qrDialog').close(); });
  document.addEventListener('click', event => {
    // Tipp neben das Menü schließt es. Der eigene Knopf ist ausgenommen, sonst
    // würde sein Umschalten hier sofort wieder rückgängig gemacht.
    if (!$('appMenu').hidden && !event.target.closest?.('#appMenu, #menuButton')) closeAppMenu();
    const button = event.target.closest('.coordinate-qr-button');
    if (button) showQrDialog(Number(button.dataset.lat), Number(button.dataset.lon));
    const deleteButton = event.target.closest('.measure-delete-button');
    if (deleteButton) deleteMeasurement(deleteButton.dataset.id);
    const editButton = event.target.closest('.measure-edit-button');
    if (editButton) editMeasurement(editButton.dataset.id);
    const signDeleteButton = event.target.closest('.sign-delete-button');
    if (signDeleteButton) deleteSign(signDeleteButton.dataset.id);
    const signEditButton = event.target.closest('.sign-edit-button');
    if (signEditButton) editSign(signEditButton.dataset.id);
    const ffehDeleteButton = event.target.closest('.ffeh-delete-button');
    if (ffehDeleteButton) deleteFfehPoint(ffehDeleteButton.dataset.id);
    const presetChip = event.target.closest('.layer-preset-chip');
    if (presetChip) applyLayerPreset(presetChip.dataset.presetId);
    const presetDeleteButton = event.target.closest('.layer-preset-delete');
    if (presetDeleteButton) deleteLayerPreset(presetDeleteButton.dataset.presetId);
    const ffehEditButton = event.target.closest('.ffeh-edit-button');
    if (ffehEditButton) editFfehPoint(ffehEditButton.dataset.id);
    const ffehAssessButton = event.target.closest('.ffeh-assess-button');
    // Alles, was die Bewertung braucht, steht am Knopf selbst: Koordinaten und
    // Vorbefüllung. Kein Rückgriff auf einen Zwischenspeicher – siehe
    // ffehAssessHtml.
    if (ffehAssessButton) startFfehAssessment(Number(ffehAssessButton.dataset.lat), Number(ffehAssessButton.dataset.lon), ffehAssessButton.dataset.seed);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    // Nach dem Schließen per Escape gehört der Fokus zurück an den Burger-Knopf.
    const menueOffen = !$('appMenu').hidden;
    closePanel();
    closeAppMenu();
    if (menueOffen) $('menuButton').focus();
  });
  // Gemerkter Zustand der Kartenlegende; ohne Eintrag bleibt sie zugeklappt.
  if (loadLegendOpen()) setLegendOverlay(true);
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
  // Beschriftungen liegen über den NavLog-Overlays, aber unter den FFEH-Punkten
  // und fangen keine Kartenklicks ab (GetFeatureInfo bleibt unverändert).
  state.map.createPane('strassenPane');
  state.map.getPane('strassenPane').style.zIndex = '440';
  state.map.getPane('strassenPane').style.pointerEvents = 'none';
  state.map.createPane('ffehPane');
  state.map.getPane('ffehPane').style.zIndex = '460';
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
  L.control.scale({ imperial: false, maxWidth: 140 }).addTo(state.map);
  initMeasure();
  initSigns();
  initFfeh();
  initStrassen();
  state.map.on('click', queryMapPoint);
  // Die eigenen Layer stehen erst jetzt fest – Legende einmal nachziehen.
  renderLegend();
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

function queryMapPoint(event) {
  if (state.ffeh.active) { handleFfehClick(event); return; }
  if (state.signs.active) { handleSignClick(event); return; }
  if (state.measure.active) { handleMeasureClick(event); return; }
  showFeatureQuery(event);
}

// Symbolabfrage samt Koordinaten-Popup. Der Erkundungsmodus ruft sie auch bei
// offenem FFEH-Werkzeug auf – sonst wäre „⌖ Punkt bewerten“ nach der ersten
// Bewertung nicht mehr erreichbar, weil jeder Kartentipp im Werkzeug endet.
async function showFeatureQuery(event) {
  const base = coordinatePopup(event.latlng.lat, event.latlng.lng);
  // Erkundungsmodus: der Knopf steht unter der Symbolinformation und legt aus
  // jedem Kartenpunkt heraus einen eigenen FFEH-Punkt zur Bewertung an.
  // Ohne Antwort trägt der Knopf keine Vorbefüllung – der Lade- und der
  // Fehlerzweig verwenden genau diese Fassung (Quelle bleibt dann „karte“).
  const assess = ffehAssessHtml(event.latlng.lat, event.latlng.lng);
  const queryableLayers = state.availableLayers.filter(layer => {
    const tile = state.navlogLayers.get(layer.name);
    // Hintergrundkarten (DTK/DOP) melden sich in den Capabilities zwar als
    // abfragbar, liefern aber nur die Pixelfarbe unter dem Finger – ein Objekt
    // ohne jede einsatzrelevante Eigenschaft. Schlimmer noch: dieses leere
    // Rasterobjekt steht in der Antwort vor dem echten Symbol und hat die
    // Layerzuordnung des Treffers vergiftet (Name „DTK0025“, Quelle „Karte“).
    // Deshalb wird die Hintergrundkarte grundsätzlich nicht mit abgefragt.
    return layer.queryable && !isBackgroundLayer(layer) && tile && state.map.hasLayer(tile);
  });
  const popup = L.popup({ maxWidth: 420 }).setLatLng(event.latlng).setContent(queryableLayers.length ? `${base}<div class="feature-info muted">Symbolinformation wird geladen …</div>${assess}` : `${base}${assess}`).openOn(state.map);
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
      SRS: state.mapCrs, INFO_FORMAT: state.featureInfoFormat, FEATURE_COUNT: '10',
      // Toleranzparameter für gängige WMS-Server; unbekannte Parameter werden
      // ignoriert. Ohne Toleranz wertet ein Server nur wenige Pixel um X/Y aus –
      // ein Symbol muss dann pixelgenau getroffen werden, sonst kommt „kein
      // abfragbares Symbol“ zurück. Welche Software hinter gdw.navlog.de läuft,
      // ist uns nicht bekannt (kein Testzugang), deshalb alle drei Schreibweisen:
      // BUFFER (GeoServer), RADIUS (MapServer), FI_*_TOLERANCE (QGIS Server).
      BUFFER: '16', RADIUS: '16',
      FI_POINT_TOLERANCE: '24', FI_LINE_TOLERANCE: '12', FI_POLYGON_TOLERANCE: '8'
    });
    const response = await fetch(navlogUrl(Object.fromEntries(params)));
    if (!response.ok) throw new Error(`NavLog antwortet mit Status ${response.status}`);
    const info = await formatFeatureInfo(response, queryableLayers);
    // Der Bewerten-Knopf wird gemeinsam mit der Antwort neu gebaut und trägt
    // die Vorbefüllung als eigenes Datenattribut. Damit gehört jeder Knopf
    // genau zu der Abfrage, aus der er entstanden ist – auch wenn inzwischen
    // ein anderes Popup offen war oder Antworten in anderer Reihenfolge
    // eintreffen.
    if (state.map.hasLayer(popup)) popup.setContent(`${base}${info.html}${ffehAssessHtml(event.latlng.lat, event.latlng.lng, info.seed)}`);
  } catch (error) {
    if (state.map.hasLayer(popup)) popup.setContent(`${base}<div class="feature-info muted">Für diesen Punkt konnte keine Symbolinformation abgerufen werden.</div>${assess}`);
  }
}

// Liefert die Anzeige und – falls die Abfrage wirklich etwas gefunden hat –
// den Seed für „⌖ Punkt bewerten“. Der Seed ist ein reines Datenobjekt und
// wird vom Aufrufer an den Knopf gehängt; er wird nirgends zwischengespeichert.
// Rückgabe: { html, seed } mit seed === null, wenn nichts Zählbares zu sehen ist.
async function formatFeatureInfo(response, layers) {
  const ohneTreffer = html => ({ html, seed: null });
  const contentType = response.headers.get('content-type') || state.featureInfoFormat;
  const text = await response.text();
  if (!text.trim()) return ohneTreffer('<div class="feature-info muted">An dieser Stelle wurde kein abfragbares Symbol gefunden.</div>');

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
      if (!features.length) return ohneTreffer('<div class="feature-info muted">An dieser Stelle wurde kein abfragbares Symbol gefunden.</div>');
      const rescuePoints = features.filter(feature => {
        const properties = feature.properties || feature;
        return properties.rp_nr != null || properties.RP_NR != null;
      });
      const displayedFeatures = rescuePoints.length ? rescuePoints.slice(0, 1) : features.slice(0, 4);
      // Vorbefüllt wird aus dem Treffer, der auch wirklich etwas anzeigt.
      // Objekte ohne darstellbare Eigenschaft (z. B. Rasterpixel) dürfen den
      // sichtbaren Treffer nicht verdrängen.
      const treffer = displayedFeatures.find(feature => hasFeatureContent(feature.properties || feature)) || displayedFeatures[0];
      const blocks = displayedFeatures.map(feature => {
        const properties = feature.properties || feature;
        const entries = friendlyProperties(properties);
        const isRescuePoint = properties.rp_nr != null || properties.RP_NR != null;
        if (!entries.length && !isRescuePoint) return '';
        // Der Titel muss aus demselben Layer stammen wie die Vorbefüllung –
        // die Position in der Antwort sagt nichts über den Layer aus.
        const title = featureTitle(properties, featureLayer(feature, layers));
        const rows = title === 'Einsatzhinweis' && entries.length === 1 && entries[0].label === 'Hinweis'
          ? `<div class="feature-note">${escapeHtml(entries[0].value)}</div>`
          : entries.map(entry => `<div class="feature-row${entry.important ? ' important' : ''}"><span>${escapeHtml(entry.label)}</span><strong>${escapeHtml(entry.value)}</strong></div>`).join('');
        return `<section class="feature-card"><h4>${escapeHtml(title)}</h4>${rows}</section>`;
      }).filter(Boolean).join('');
      // Sobald mindestens eine Karte erscheint, steht unter dem Finger ein
      // echtes NavLog-Objekt – Hintergrundlayer sind von der Abfrage
      // ausgeschlossen, alles Übrige ist per Definition NavLog-Inhalt.
      if (!blocks) return ohneTreffer('<div class="feature-info muted">Für dieses Symbol liegen keine einsatzrelevanten Zusatzinformationen vor.</div>');
      return {
        html: `<div class="feature-info"><strong>Information zum Symbol</strong>${blocks}</div>`,
        seed: buildFfehSeed(treffer ? (treffer.properties || treffer) : null, featureLayer(treffer, layers))
      };
    } catch { }
  }

  const documentType = contentType.includes('html') ? 'text/html' : 'text/xml';
  const parsed = new DOMParser().parseFromString(text, documentType);
  const cleanText = (parsed.body?.textContent || parsed.documentElement?.textContent || text).replace(/\s+/g, ' ').trim();
  const serviceMessage = /no features|no results|keine objekte|kein objekt/i.test(cleanText);
  if (!cleanText || serviceMessage) return ohneTreffer('<div class="feature-info muted">An dieser Stelle wurde kein abfragbares Symbol gefunden.</div>');
  // Auch im Text-/HTML-Zweig gilt: angezeigter Inhalt heißt Treffer.
  return {
    html: `<div class="feature-info"><strong>Symbolinformation</strong><p>${escapeHtml(cleanText.slice(0, 1800))}</p><small>Aktive Abfrage: ${escapeHtml(layers.map(layer => layer.title || layer.name).join(', '))}</small></div>`,
    seed: buildFfehSeed(null, featureLayer(null, layers))
  };
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

// Trägt das Objekt überhaupt etwas Anzeigbares? Rasterpixel der Hintergrund-
// karte bestehen nur aus ausgeblendeten Farbbändern und sind damit leer.
function hasFeatureContent(properties) {
  return properties.rp_nr != null || properties.RP_NR != null || friendlyProperties(properties).length > 0;
}

// Die Antwort benennt den Treffer meist als „layername.id“. Damit lässt sich
// der Layer bestimmen, aus dem er wirklich stammt – wichtig für die Frage, ob
// unter dem Finger ein NavLog-Symbol oder nur ein Weg liegt.
function featureLayer(feature, layers) {
  // Nur ein abfragbarer Layer aktiv: die Zuordnung ist ohnehin eindeutig.
  if (layers.length <= 1) return layers[0];
  const id = String(feature?.id ?? '');
  const treffer = layers.find(layer => id === layer.name || id.startsWith(`${layer.name}.`));
  if (treffer) return treffer;
  // Ohne verwertbare id raten wir: Wer ein Symbol antippt, trifft weit
  // wahrscheinlicher einen Punkt-Layer als einen Wege- oder Flächenlayer.
  // Der frühere Rückfall auf layers[0] hat den Treffer dem erstbesten Layer
  // zugeschlagen und damit Quelle und Name verfälscht.
  return layers.find(layer => layerKind(layer) === 'points') || layers[0];
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
  return descriptiveName(properties) || typeName || layer?.title || layer?.name || 'Kartenobjekt';
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
  // Hintergrundkarte zuerst aktivieren: Ihre Kacheln stehen dann vorn in der
  // NavLog-Warteschlange und sind als Erste sichtbar.
  const startLayers = state.config.defaultLayers
    .map(name => state.availableLayers.find(item => item.name === name))
    .filter(layer => layer && state.layerInputs.has(layer.name));
  for (const layer of [...startLayers.filter(isBackgroundLayer), ...startLayers.filter(layer => !isBackgroundLayer(layer))]) {
    toggleNavlogLayer(layer, true);
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
      const tile = new NavlogWmsLayer(navlogUrl(), { layers: layer.name, format: 'image/png', transparent: true, version: '1.1.1', attribution: 'NavLog', pane });
      attachNavlogTileRetry(tile);
      if (isBackgroundLayer(layer)) attachBackgroundLoadHint(tile, layer);
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

// Beim Start laufen Dutzende WMS-Anfragen gleichzeitig; weist der Dienst
// einzelne ab, bleiben die Kacheln bei Leaflet sonst dauerhaft leer (typisch:
// die Hintergrundkarte fehlt sporadisch). Gescheiterte Kacheln werden deshalb
// mit Abstand bis zu zweimal neu angefordert.
// Der NavLog-Dienst verkraftet nur wenige gleichzeitige Renderings pro
// Kunden-ID: Ein Schwall (Seitenstart, Layerwechsel, mehrere Geräte) führt zu
// reihenweise abgewiesenen Kacheln – sichtbar als graue Hintergrundkarte.
// Deshalb laufen alle NavLog-Kachelanfragen über eine gemeinsame Warteschlange
// mit fester Obergrenze; der Rest wartet, statt abgewiesen zu werden.
const NAVLOG_MAX_PARALLEL = 6;
const navlogQueue = { aktiv: 0, wartend: [] };

function navlogQueueNext() {
  while (navlogQueue.aktiv < NAVLOG_MAX_PARALLEL && navlogQueue.wartend.length) {
    const job = navlogQueue.wartend.shift();
    if (job.abgebrochen) continue;
    navlogQueue.aktiv++;
    job.gestartet = true;
    job.start();
  }
}

function navlogQueueDone(job) {
  if (!job.gestartet || job.beendet) return;
  job.beendet = true;
  navlogQueue.aktiv = Math.max(0, navlogQueue.aktiv - 1);
  navlogQueueNext();
}

const NavlogWmsLayer = L.TileLayer.WMS.extend({
  createTile(coords, done) {
    const tile = document.createElement('img');
    tile.alt = '';
    tile.setAttribute('role', 'presentation');
    const job = { abgebrochen: false, gestartet: false, beendet: false };
    job.start = () => { tile.src = this.getTileUrl(coords); };
    tile._navlogJob = job;
    L.DomEvent.on(tile, 'load', () => { navlogQueueDone(job); done(null, tile); });
    L.DomEvent.on(tile, 'error', event => { navlogQueueDone(job); done(event, tile); });
    navlogQueue.wartend.push(job);
    navlogQueueNext();
    return tile;
  },
  // Weggeschobene/entfernte Kacheln geben ihren Platz in der Schlange frei.
  _removeTile(key) {
    const tile = this._tiles[key]?.el;
    if (tile?._navlogJob) { tile._navlogJob.abgebrochen = true; navlogQueueDone(tile._navlogJob); }
    return L.TileLayer.WMS.prototype._removeTile.call(this, key);
  }
});

function attachNavlogTileRetry(tile) {
  tile.on('tileerror', event => {
    const img = event.tile;
    const versuch = (img._navlogRetry || 0) + 1;
    if (versuch > 4 || !img.src) return;
    img._navlogRetry = versuch;
    const src = img.src.replace(/&nlretry=\d+/, '');
    // Ansteigender Abstand (1,5 s → 12 s): Der Dienst weist unter dem
    // Anfrageschwall eines Seitenstarts die teuren Kacheln zunächst ab und
    // braucht spürbar Zeit, bis er wieder liefert.
    setTimeout(() => {
      // Nur wiederholen, wenn die Kachel noch angezeigt werden soll.
      if (img.isConnected) img.src = `${src}&nlretry=${versuch}`;
    }, 1500 * Math.pow(2, versuch - 1));
  });
}

// Ladefortschritt der Hintergrundkarte in der Statuszeile: zeigt beim Aufbau
// „X von Y Kacheln" (plus Fehlversuche, die die Warteschlange wiederholt) und
// räumt sich nach dem vollständigen Laden selbst wieder weg.
function attachBackgroundLoadHint(tile, layer) {
  const zaehler = { angefragt: 0, geladen: 0, fehler: 0 };
  let timer;
  const zeigen = (fertig = false) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (fertig || zaehler.geladen >= zaehler.angefragt) {
        setStatus(`${state.availableLayers.length} NavLog-Layer verfügbar`);
        return;
      }
      const fehler = zaehler.fehler ? ` · ${zaehler.fehler} Fehlversuche (wird wiederholt)` : '';
      setStatus(`${layer.title || layer.name}: ${zaehler.geladen} von ${zaehler.angefragt} Kacheln geladen${fehler}`);
    }, fertig ? 1200 : 350);
  };
  // Jede neue Ladeserie (Start, Zoom, Verschieben) beginnt mit frischen Zahlen.
  tile.on('loading', () => { zaehler.angefragt = 0; zaehler.geladen = 0; zaehler.fehler = 0; });
  tile.on('tileloadstart', () => { zaehler.angefragt++; zeigen(); });
  tile.on('tileload', () => { zaehler.geladen++; zeigen(); });
  tile.on('tileerror', () => { zaehler.fehler++; zeigen(); });
  tile.on('load', () => zeigen(true));
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
  // „Alles aus" gilt auch für OSM und die eigenen Layer (FFEH, Straßen,
  // Zeichen, Messungen) – jeweils nur schalten, wenn gerade an.
  if ($('osmToggle').checked) { $('osmToggle').checked = false; toggleOsm(); }
  const eigene = [['ffehToggle', toggleFfehLayer], ['strassenToggle', toggleStrassenLayer], ['signsToggle', toggleSignsLayer], ['measureToggle', toggleMeasureLayer]];
  for (const [id, schalten] of eigene) {
    if ($(id).checked) { $(id).checked = false; schalten(); }
  }
  renderLegend();
  toast('Alle Layer sind ausgeschaltet.');
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
  $('ffehToggle').checked = state.config.showFfehLayer !== false;
  toggleFfehLayer();
  $('strassenToggle').checked = state.config.showStrassenLayer === true;
  toggleStrassenLayer();
  $('signsToggle').checked = state.config.showSignsLayer !== false;
  toggleSignsLayer();
  $('measureToggle').checked = state.config.showMeasureLayer !== false;
  toggleMeasureLayer();
  state.map.setView([state.config.centerLatitude, state.config.centerLongitude], state.config.zoom);
  renderLegend();
  toast('Gespeicherte Startansicht wiederhergestellt.');
}

// ── Layersets ─────────────────────────────────────────────────────────────
// Benannte Layerauswahlen für den schnellen Wechsel zwischen Lagen. Sie liegen
// im bestehenden settings-Eintrag, sind aber vollständig von der Startansicht
// getrennt: Layersets merken nur, welche Layer an sind – nie einen
// Kartenausschnitt. Gespeichert werden Layernamen, keine Listenpositionen,
// damit eine geänderte GetCapabilities-Antwort die Sets nicht verschiebt.
const MAX_LAYER_PRESETS = 12;
const MAX_LAYER_PRESET_NAME = 30;

// Fremde oder veraltete Einträge im localStorage dürfen die Anzeige nicht
// zerlegen – deshalb wird jedes Feld auf seinen erwarteten Typ gebracht.
function sanitizeLayerPresets(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === 'object')
    .map(item => ({
      id: String(item.id || crypto.randomUUID()),
      name: String(item.name ?? '').trim().slice(0, MAX_LAYER_PRESET_NAME),
      navlogLayers: Array.isArray(item.navlogLayers) ? item.navlogLayers.filter(name => typeof name === 'string') : [],
      osm: item.osm === true,
      ffeh: item.ffeh === true,
      strassen: item.strassen === true,
      // Sets aus älteren Ständen kennen die beiden Werkzeugebenen noch nicht.
      // Sie waren damals immer sichtbar – genau so gelten sie weiter.
      zeichen: item.zeichen !== false,
      messungen: item.messungen !== false
    }))
    .filter(item => item.name)
    .slice(0, MAX_LAYER_PRESETS);
}

function layerPresets() { return state.config?.layerPresets ?? []; }

function findLayerPreset(id) { return layerPresets().find(preset => preset.id === id) || null; }

// Schreibt ausschließlich layerPresets in den gespeicherten settings-Eintrag.
// Alles andere (Titel, Mittelpunkt, Zoom, Startlayer) wird unverändert
// übernommen – ein Layerset darf die Startansicht nie überschreiben.
function persistLayerPresets(presets) {
  let gespeichert = {};
  try { gespeichert = JSON.parse(localStorage.getItem(STORAGE_KEYS.settings) || '{}') || {}; }
  catch { gespeichert = {}; }
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ ...gespeichert, layerPresets: presets }));
    state.config.layerPresets = presets;
    return true;
  } catch (error) {
    toast(error.message || 'Das Layerset konnte nicht gespeichert werden.');
    return false;
  }
}

// Der Ist-Zustand aller schaltbaren Layer. layerOrder hält die NavLog-Layer in
// der Reihenfolge, in der sie eingeschaltet wurden – dieselbe Quelle nutzt auch
// die Startansicht.
function currentLayerSelection() {
  return {
    navlogLayers: state.layerOrder.filter(name => {
      const tile = state.navlogLayers.get(name);
      return tile && state.map?.hasLayer(tile);
    }),
    osm: $('osmToggle').checked,
    ffeh: $('ffehToggle').checked,
    strassen: $('strassenToggle').checked,
    zeichen: $('signsToggle').checked,
    messungen: $('measureToggle').checked
  };
}

// Nur Layer, die der Dienst aktuell meldet, lassen sich schalten.
function presetNavlogLayers(preset) {
  return preset.navlogLayers.filter(name => state.availableLayers.some(layer => layer.name === name));
}

function sameLayerNames(a, b) {
  return a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
}

function matchesLayerPreset(preset) {
  const ist = currentLayerSelection();
  if (ist.osm !== preset.osm || ist.ffeh !== preset.ffeh || ist.strassen !== preset.strassen) return false;
  if (ist.zeichen !== preset.zeichen || ist.messungen !== preset.messungen) return false;
  // Ohne geladene Capabilities lässt sich der NavLog-Anteil nicht beurteilen:
  // ein Set mit NavLog-Layern gilt dann nie als aktiv.
  if (!state.availableLayers.length && preset.navlogLayers.length) return false;
  return sameLayerNames(ist.navlogLayers, presetNavlogLayers(preset));
}

function renderLayerPresets() {
  const list = $('layerPresetList');
  if (!list) return;
  const presets = layerPresets();
  list.replaceChildren();
  if (!presets.length) {
    state.presets.manage = false;
    $('layerPresetManage').hidden = true;
    $('layerPresetManage').setAttribute('aria-pressed', 'false');
    const hinweis = document.createElement('p');
    hinweis.className = 'muted layer-preset-empty';
    hinweis.textContent = 'Noch keine Layersets – über ⋮ speichern.';
    list.append(hinweis);
    return;
  }
  $('layerPresetManage').hidden = false;
  for (const preset of presets) {
    const eintrag = document.createElement('span');
    eintrag.className = 'layer-preset';
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'layer-preset-chip';
    chip.dataset.presetId = preset.id;
    chip.setAttribute('aria-pressed', 'false');
    // Namen gehen ausschließlich über textContent in die Seite; das ist
    // strenger als escapeHtml, weil gar kein Markup entstehen kann.
    chip.textContent = preset.name;
    chip.title = preset.name;
    eintrag.append(chip);
    const loeschen = document.createElement('button');
    loeschen.type = 'button';
    loeschen.className = 'layer-preset-delete';
    loeschen.dataset.presetId = preset.id;
    loeschen.hidden = !state.presets.manage;
    loeschen.setAttribute('aria-label', `Layerset ${preset.name} löschen`);
    loeschen.textContent = '×';
    eintrag.append(loeschen);
    list.append(eintrag);
  }
  updateActivePresetMarks();
}

// Markiert das Set, dessen gespeicherter Zustand genau dem Ist-Zustand
// entspricht. Nach jedem Umschalten von Hand erlischt die Markierung.
function updateActivePresetMarks() {
  const list = $('layerPresetList');
  if (!list) return;
  for (const chip of list.querySelectorAll('.layer-preset-chip')) {
    const preset = findLayerPreset(chip.dataset.presetId);
    const aktiv = Boolean(preset) && matchesLayerPreset(preset);
    chip.setAttribute('aria-pressed', String(aktiv));
    chip.classList.toggle('active', aktiv);
  }
}

function toggleLayerPresetManage() {
  state.presets.manage = !state.presets.manage;
  $('layerPresetManage').setAttribute('aria-pressed', String(state.presets.manage));
  renderLayerPresets();
}

// Stellt exakt den gespeicherten Layerzustand her. Der Kartenausschnitt bleibt
// bewusst unangetastet – dafür ist die Startansicht zuständig.
async function applyLayerPreset(id) {
  const preset = findLayerPreset(id);
  if (!preset) return;
  const navlogFehlt = !state.availableLayers.length && preset.navlogLayers.length > 0;
  // Nur die Unterschiede schalten: Ein bereits aktiver Layer (z. B. die DTK)
  // bleibt unangetastet – Entfernen und sofortiges Wiederhinzufügen lässt
  // Leaflet-Kachellayer sonst bis zur nächsten Kartenbewegung leer.
  const soll = new Set(preset.navlogLayers);
  const istAktiv = (name) => {
    const tile = state.navlogLayers.get(name);
    return Boolean(tile && state.map.hasLayer(tile));
  };
  for (const layer of state.availableLayers) {
    if (soll.has(layer.name) || !istAktiv(layer.name)) continue;
    const input = state.layerInputs.get(layer.name);
    if (input) input.checked = false;
    toggleNavlogLayer(layer, false, false);
  }
  // OSM vor den NavLog-Layern: ein Hintergrundlayer aus dem Set schaltet es
  // anschließend selbst wieder ab, umgekehrt ginge die Reihenfolge verloren.
  const osmSoll = preset.osm && !$('osmToggle').disabled;
  if ($('osmToggle').checked !== osmSoll) {
    $('osmToggle').checked = osmSoll;
    toggleOsm();
  }
  for (const name of preset.navlogLayers) {
    const layer = state.availableLayers.find(item => item.name === name);
    const input = state.layerInputs.get(name);
    // Layer, die der Dienst nicht mehr meldet, werden still übersprungen.
    if (!layer || !input) continue;
    input.checked = true;
    if (!istAktiv(name)) toggleNavlogLayer(layer, true, false);
  }
  if ($('ffehToggle').checked !== preset.ffeh) {
    $('ffehToggle').checked = preset.ffeh;
    toggleFfehLayer();
  }
  if ($('signsToggle').checked !== preset.zeichen) {
    $('signsToggle').checked = preset.zeichen;
    toggleSignsLayer();
  }
  if ($('measureToggle').checked !== preset.messungen) {
    $('measureToggle').checked = preset.messungen;
    toggleMeasureLayer();
  }
  // Der Hinweis kommt vor dem Laden der Straßendaten, damit eine mögliche
  // Fehlermeldung von dort als letzte stehen bleibt.
  toast(navlogFehlt
    ? `Layerset „${preset.name}“ angewendet – NavLog-Layer fehlen, solange der Dienst nicht erreichbar ist.`
    : `Layerset „${preset.name}“ angewendet.`);
  if ($('strassenToggle').checked !== preset.strassen) {
    $('strassenToggle').checked = preset.strassen;
    await toggleStrassenLayer();
  }
  renderLegend();
}

function openLayerPresetDialog() {
  closeAppMenu();
  $('layerPresetName').value = '';
  $('layerPresetSummary').textContent = layerPresetSummary(currentLayerSelection());
  $('layerPresetDialog').showModal();
}

function layerPresetSummary(selection) {
  const teile = [`${selection.navlogLayers.length} NavLog-Layer`];
  if (selection.osm) teile.push('OpenStreetMap');
  if (selection.ffeh) teile.push('Waldbrand POI FFEH');
  if (selection.strassen) teile.push('Straßenbezeichnungen');
  if (selection.zeichen) teile.push('Taktische Zeichen');
  if (selection.messungen) teile.push('Messungen & Absperrungen');
  return `Gespeichert wird: ${teile.join(', ')}.`;
}

async function saveLayerPreset(event) {
  event.preventDefault();
  const name = $('layerPresetName').value.trim().slice(0, MAX_LAYER_PRESET_NAME);
  if (!name) { toast('Bitte einen Namen für das Layerset eingeben.'); return; }
  const presets = [...layerPresets()];
  const vorhanden = presets.findIndex(preset => preset.name.toLowerCase() === name.toLowerCase());
  if (vorhanden < 0 && presets.length >= MAX_LAYER_PRESETS) {
    toast(`Es sind höchstens ${MAX_LAYER_PRESETS} Layersets möglich. Bitte zuerst eines löschen.`);
    return;
  }
  if (vorhanden >= 0 && !await confirmAction(`Layerset „${presets[vorhanden].name}“ mit der aktuellen Layerauswahl überschreiben?`, 'Überschreiben')) return;
  const preset = { id: vorhanden >= 0 ? presets[vorhanden].id : crypto.randomUUID(), name, ...currentLayerSelection() };
  if (vorhanden >= 0) presets[vorhanden] = preset; else presets.push(preset);
  if (!persistLayerPresets(presets)) return;
  renderLayerPresets();
  $('layerPresetDialog').close();
  toast(`Layerset „${name}“ gespeichert.`);
}

async function deleteLayerPreset(id) {
  const preset = findLayerPreset(id);
  if (!preset) return;
  if (!await confirmAction(`Layerset „${preset.name}“ wirklich löschen?`)) return;
  if (!persistLayerPresets(layerPresets().filter(item => item.id !== id))) return;
  renderLayerPresets();
  toast(`Layerset „${preset.name}“ gelöscht.`);
}

// Zwei Ziele mit demselben Inhalt: das Overlay auf der Karte und die Drucklegende.
const LEGEND_TARGETS = ['legendOverlayList', 'printLegendList'];

function renderLegend() {
  const active = state.availableLayers.filter(layer => {
    const tile = state.navlogLayers.get(layer.name);
    return tile && state.map.hasLayer(tile);
  });
  const ownLayers = state.ffeh.visible || state.strassen.visible;
  buildLegend($('legendOverlayList'), active, ownLayers ? 'Kein NavLog-Layer aktiviert.' : 'Noch kein Layer aktiviert.');
  buildLegend($('printLegendList'), active, 'Keine NavLog-Layer aktiviert.');
  // Die eigenen Layer kommen nicht vom WMS und brauchen eine feste Legende.
  if (state.strassen.visible) for (const id of LEGEND_TARGETS) $(id).prepend(strassenLegendItem());
  if (state.ffeh.visible) for (const id of LEGEND_TARGETS) $(id).prepend(ffehLegendItem());
  // Jede Layeränderung läuft hier vorbei – der passende Ort, um die Markierung
  // des aktiven Layersets nachzuziehen.
  updateActivePresetMarks();
}

// ── Legende als Kartenüberlagerung ────────────────────────────────────────
// Im Layer-Panel war die Legende beim Arbeiten in der Karte nicht sichtbar.
// Sie liegt deshalb als ein-/ausklappbares Panel über der Karte; ihr Zustand
// bleibt auf dem Gerät gemerkt (Standard: zugeklappt).
const LEGEND_STORAGE = 'navlog-ipad-legend';

function loadLegendOpen() {
  try { return localStorage.getItem(LEGEND_STORAGE) === 'offen'; }
  catch { return false; }
}

function toggleLegendOverlay() { setLegendOverlay($('legendOverlay').hidden); }

// „merken“ ist falsch, wenn nicht der Nutzer, sondern ein anderes Bedienfeld die
// Legende zur Seite schiebt: das Öffnen eines Werkzeugs darf die gemerkte
// Entscheidung nicht überschreiben.
function setLegendOverlay(open, merken = true) {
  const overlay = $('legendOverlay');
  const geaendert = overlay.hidden === open;
  overlay.hidden = !open;
  // Auf dem Smartphone liegt die Legende über der linken Bedienspalte (CSS).
  document.body.classList.toggle('legend-open', open);
  $('legendButton').setAttribute('aria-expanded', String(open));
  $('legendButton').setAttribute('aria-label', open ? 'Legende ausblenden' : 'Legende anzeigen');
  // Der zuletzt gewählte Zustand gilt auch nach einem Neustart der App.
  if (geaendert && merken) { try { localStorage.setItem(LEGEND_STORAGE, open ? 'offen' : 'zu'); } catch { } }
  if (!open) return;
  // Suchfeld und Legende teilen sich den Platz links oben.
  $('searchBox').hidden = true;
  $('searchButton').setAttribute('aria-expanded', 'false');
  renderLegend();
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

function openPanel() { closeAppMenu(); $('panel').classList.add('open'); $('panel').setAttribute('aria-hidden', 'false'); $('layersButton').setAttribute('aria-expanded', 'true'); $('backdrop').hidden = false; }
function closePanel() { closeAppMenu(); $('panel').classList.remove('open'); $('panel').setAttribute('aria-hidden', 'true'); $('layersButton').setAttribute('aria-expanded', 'false'); $('backdrop').hidden = true; }

// ── Verwaltungsmenü (⋮ im Panel-Kopf) ─────────────────────────────────────
// Bewusst ohne gemerkten Zustand: Das Menü startet immer zu.
function toggleAppMenu() { $('appMenu').hidden ? openAppMenu() : closeAppMenu(); }

function openAppMenu() {
  $('appMenu').hidden = false;
  $('menuButton').setAttribute('aria-expanded', 'true');
}

function closeAppMenu() {
  $('appMenu').hidden = true;
  $('menuButton').setAttribute('aria-expanded', 'false');
}

// Pfeiltasten führen durch das Menü, wie es role="menu" erwarten lässt.
function moveAppMenuFocus(event) {
  const richtung = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
  if (!richtung && event.key !== 'Home' && event.key !== 'End') return;
  const eintraege = [...$('appMenu').querySelectorAll('.app-menu-item')];
  if (!eintraege.length) return;
  event.preventDefault();
  if (event.key === 'Home') return eintraege[0].focus();
  if (event.key === 'End') return eintraege[eintraege.length - 1].focus();
  const index = eintraege.indexOf(document.activeElement);
  eintraege[(index + richtung + eintraege.length) % eintraege.length].focus();
}
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
    // Ohne OSM ändert sich die Legende nicht, wohl aber die Layerauswahl.
    updateActivePresetMarks();
  }
}

function printMap() {
  closePanel();
  closeAppMenu();
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
  // Suchfeld und Legende belegen denselben Platz links oben.
  if (!box.hidden) { closeAppMenu(); setLegendOverlay(false, false); $('searchInput').focus(); }
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

async function resetAccess() {
  if (!await confirmAction('NavLog-Zugang auf diesem iPad wirklich löschen und neu eingeben?', 'Zugang löschen')) return;
  localStorage.removeItem(STORAGE_KEYS.kid);
  window.location.reload();
}

function confirmAction(message, confirmLabel = 'Löschen') {
  const dialog = $('confirmDialog');
  $('confirmMessage').textContent = message;
  $('confirmAcceptButton').textContent = confirmLabel;
  dialog.returnValue = '';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
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
    showOpenStreetMap: $('osmToggle').checked,
    showFfehLayer: $('ffehToggle').checked,
    showStrassenLayer: $('strassenToggle').checked,
    showSignsLayer: $('signsToggle').checked,
    showMeasureLayer: $('measureToggle').checked,
    // Die Layersets stehen im selben Eintrag und dürfen beim Speichern der
    // Startansicht nicht verloren gehen.
    layerPresets: layerPresets()
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
  $('ffehToggle').checked = state.config.showFfehLayer !== false;
  $('strassenToggle').checked = state.config.showStrassenLayer === true;
  $('signsToggle').checked = state.config.showSignsLayer !== false;
  $('measureToggle').checked = state.config.showMeasureLayer !== false;
  $('appVersion').textContent = `v${APP_VERSION} · Stand ${APP_BUILD}`;
  renderLayerPresets();
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
    useInitialLayerDefaults: !hasSavedLayerSelection,
    layerPresets: sanitizeLayerPresets(settings.layerPresets)
  };
}

function navlogUrl(params = {}) {
  const url = new URL(NAVLOG_WMS_URL);
  const kid = localStorage.getItem(STORAGE_KEYS.kid)?.trim();
  if (kid) url.searchParams.set('kid', kid);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

// ── Messwerkzeuge (Strecke, Fläche, Absperrkreis) ──────────────────────────
const MEASURE_STORAGE = 'navlog-ipad-measurements';
const LINE_STYLE = { color: '#9f1d20', weight: 4, dashArray: '6 8', interactive: false };
const AREA_STYLE = { color: '#9f1d20', weight: 3, fillColor: '#9f1d20', fillOpacity: 0.12, interactive: false };
const CIRCLE_STYLE = { color: '#9f1d20', weight: 3, dashArray: '4 8', fillColor: '#9f1d20', fillOpacity: 0.09, interactive: false };

function initMeasure() {
  state.measure.group = L.layerGroup();
  state.measure.visible = state.config.showMeasureLayer !== false;
  $('measureToggle').checked = state.measure.visible;
  if (state.measure.visible) state.measure.group.addTo(state.map);
  for (const item of loadMeasurements()) drawSavedMeasurement(item);
}

// Der Schalter im Panel nimmt nur die Kartenebene weg – die Messungen bleiben
// vollständig im localStorage und kommen beim Einschalten unverändert zurück.
function toggleMeasureLayer() {
  state.measure.visible = $('measureToggle').checked;
  if (!state.measure.group) return;
  if (state.measure.visible) {
    state.measure.group.addTo(state.map);
  } else {
    // Erst das Werkzeug sauber schließen (eine angefangene Messung wird dabei
    // gespeichert), dann ausblenden – sonst bliebe eine Bearbeitung an einer
    // unsichtbaren Geometrie hängen.
    if (state.measure.active) closeMeasure();
    state.map.removeLayer(state.measure.group);
  }
  updateActivePresetMarks();
}

function loadMeasurements() {
  try {
    const items = JSON.parse(localStorage.getItem(MEASURE_STORAGE) || '[]');
    if (!Array.isArray(items)) return [];
    let migrated = false;
    for (const item of items) if (!item.id) { item.id = crypto.randomUUID(); migrated = true; }
    if (migrated) localStorage.setItem(MEASURE_STORAGE, JSON.stringify(items));
    return items;
  } catch { return []; }
}

function persistMeasurement(item) {
  const items = loadMeasurements();
  items.push(item);
  try { localStorage.setItem(MEASURE_STORAGE, JSON.stringify(items)); } catch { }
}

function drawSavedMeasurement(item) {
  const label = { permanent: true, direction: 'top', className: 'measure-label' };
  const clickable = { interactive: true, bubblingMouseEvents: false };
  let layer = null;
  if (item.type === 'circle' && item.points.length === 1 && item.radius > 0) {
    layer = L.circle(item.points[0], { radius: item.radius, ...CIRCLE_STYLE, ...clickable })
      .bindTooltip(`Absperrung r = ${formatDistance(item.radius)}`, { ...label, direction: 'center' });
  } else if (item.type === 'area' && item.points.length >= 3) {
    layer = L.polygon(item.points, { ...AREA_STYLE, ...clickable })
      .bindTooltip(formatArea(geodesicArea(item.points)), { ...label, direction: 'center' });
  } else if (item.type === 'distance' && item.points.length >= 2) {
    layer = L.polyline(item.points, { ...LINE_STYLE, ...clickable })
      .bindTooltip(distanceLabel(pathLength(item.points)), label);
  }
  if (!layer) return;
  layer.on('click', event => onSavedShapeClick(item, event));
  layer.addTo(state.measure.group);
  state.measure.saved.set(item.id, layer);
}

function onSavedShapeClick(item, event) {
  // Ein anderes aktives Werkzeug behält Vorrang, damit über gespeicherte
  // Messungen hinweg weitergearbeitet werden kann.
  if (state.ffeh.active) { handleFfehClick(event); return; }
  if (state.signs.active) { handleSignClick(event); return; }
  if (state.measure.active) { handleMeasureClick(event); return; }
  const description = measurementDescription(item);
  L.popup().setLatLng(event.latlng).setContent(
    `<div class="measure-popup"><strong>${escapeHtml(description.title)}</strong><p>${escapeHtml(description.value)}</p><div class="measure-popup-actions"><button type="button" class="measure-edit-button" data-id="${item.id}">Bearbeiten</button><button type="button" class="measure-delete-button" data-id="${item.id}">Löschen</button></div></div>`
  ).openOn(state.map);
}

function editMeasurement(id) {
  const item = loadMeasurements().find(entry => entry.id === id);
  if (!item) return;
  state.map.closePopup();
  removeMeasurement(id);
  if ($('measureBar').hidden) toggleMeasure();
  setMeasureMode(item.type);
  state.measure.editingId = item.id;
  state.measure.editingBackup = item;
  if (item.type === 'circle') $('radiusInput').value = String(Math.round(item.radius));
  for (const point of item.points) {
    state.measure.points.push([point[0], point[1]]);
    addVertexMarker(point, state.measure.points.length - 1);
  }
  updateWorkingMeasure();
  toast('Punkte verschieben, dann mit „Fertig“ speichern.');
}

function measurementDescription(item) {
  if (item.type === 'circle') return { title: 'Absperrkreis', value: `Radius ${formatDistance(item.radius)}` };
  if (item.type === 'area') return { title: 'Fläche', value: formatArea(geodesicArea(item.points)) };
  return { title: 'Strecke', value: distanceLabel(pathLength(item.points)) };
}

function removeMeasurement(id) {
  const layer = state.measure.saved.get(id);
  if (layer) { state.measure.group.removeLayer(layer); state.measure.saved.delete(id); }
  const items = loadMeasurements().filter(item => item.id !== id);
  try { localStorage.setItem(MEASURE_STORAGE, JSON.stringify(items)); } catch { }
}

function deleteMeasurement(id) {
  removeMeasurement(id);
  state.map.closePopup();
  toast('Messung gelöscht.');
}

// Auf dem Smartphone verdecken die Werkzeugleisten sonst die halbe Karte.
// Nach der Auswahl klappen sie auf Kopfzeile plus Aktionen zusammen.
const TOOL_SHEETS = {
  measureBar: { toggle: 'measureCollapse', name: 'Messwerkzeuge' },
  signBar: { toggle: 'signCollapse', name: 'Taktische Zeichen' },
  ffehBar: { toggle: 'ffehCollapse', name: 'FFEH-Punkte' }
};

function isPhoneLayout() { return window.matchMedia('(max-width:699px), (max-height:519px)').matches; }

function setSheetCollapsed(sheetId, collapsed) {
  const sheet = TOOL_SHEETS[sheetId];
  if (!sheet) return;
  $(sheetId).classList.toggle('collapsed', collapsed);
  const toggle = $(sheet.toggle);
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.setAttribute('aria-label', `${sheet.name} ${collapsed ? 'ausklappen' : 'einklappen'}`);
}

function collapseSheetOnPhone(sheetId) {
  if (isPhoneLayout()) setSheetCollapsed(sheetId, true);
}

function toggleMeasure() {
  if ($('measureBar').hidden) {
    if (state.signs.active) closeSigns();
    if (state.ffeh.active) closeFfeh();
    // Man kann nicht bearbeiten, was man nicht sieht: das Werkzeug holt seine
    // Kartenebene bei Bedarf selbst zurück.
    if (!state.measure.visible) { $('measureToggle').checked = true; toggleMeasureLayer(); }
    // Die Legende würde das Werkzeug-Sheet überlagern und tritt zurück.
    setLegendOverlay(false, false);
    setSheetCollapsed('measureBar', false);
    $('measureBar').hidden = false;
    state.measure.active = true;
    $('measureButton').setAttribute('aria-expanded', 'true');
    closePanel();
    closeAppMenu();
    $('searchBox').hidden = true;
    $('searchButton').setAttribute('aria-expanded', 'false');
    state.map.getContainer().classList.add('measuring');
    setMeasureMode(state.measure.mode || 'distance');
  } else {
    closeMeasure();
  }
}

function closeMeasure() {
  finishMeasurement(true);
  state.measure.active = false;
  $('measureBar').hidden = true;
  $('measureButton').setAttribute('aria-expanded', 'false');
  state.map.getContainer().classList.remove('measuring');
}

function setMeasureMode(mode) {
  finishMeasurement(true);
  state.measure.mode = mode;
  for (const button of document.querySelectorAll('.measure-mode')) button.classList.toggle('active', button.dataset.mode === mode);
  $('circleRadiusRow').hidden = mode !== 'circle';
  $('measureHint').textContent = modeHint(mode);
}

function modeHint(mode) {
  if (mode === 'circle') return 'Mittelpunkt antippen – Radius per Vorwahl, Eingabe oder Tippen auf den Rand.';
  if (mode === 'area') return 'Eckpunkte der Fläche antippen (mindestens drei). Punkte sind verschiebbar.';
  return 'Punkte entlang der Strecke antippen. Punkte sind verschiebbar.';
}

function handleMeasureClick(event) {
  const measure = state.measure;
  if (!measure.mode) return;
  const point = [event.latlng.lat, event.latlng.lng];
  if (measure.mode === 'circle') {
    if (!measure.points.length) {
      measure.points.push(point);
      addVertexMarker(point, 0);
    } else {
      $('radiusInput').value = String(Math.max(10, Math.round(L.latLng(measure.points[0]).distanceTo(event.latlng))));
    }
  } else {
    measure.points.push(point);
    addVertexMarker(point, measure.points.length - 1);
  }
  updateWorkingMeasure();
}

function addVertexMarker(point, index) {
  const marker = L.marker(point, { draggable: true, icon: L.divIcon({ className: 'measure-vertex', iconSize: [26, 26] }) }).addTo(state.measure.group);
  marker.on('drag', () => {
    const position = marker.getLatLng();
    state.measure.points[index] = [position.lat, position.lng];
    updateWorkingMeasure();
  });
  state.measure.markers.push(marker);
}

function circleRadius() {
  const value = Number($('radiusInput').value);
  return Number.isFinite(value) && value >= 10 ? Math.min(value, 10000) : 50;
}

function updateWorkingMeasure() {
  const measure = state.measure;
  if (measure.tempLayer) { measure.group.removeLayer(measure.tempLayer); measure.tempLayer = null; }
  let hint = '';
  if (measure.mode === 'distance' && measure.points.length >= 2) {
    measure.tempLayer = L.polyline(measure.points, LINE_STYLE);
    hint = `Strecke: ${distanceLabel(pathLength(measure.points))}`;
  } else if (measure.mode === 'area' && measure.points.length >= 3) {
    measure.tempLayer = L.polygon(measure.points, AREA_STYLE);
    hint = `Fläche: ${formatArea(geodesicArea(measure.points))}`;
  } else if (measure.mode === 'circle' && measure.points.length) {
    measure.tempLayer = L.circle(measure.points[0], { radius: circleRadius(), ...CIRCLE_STYLE });
    hint = `Absperrkreis: Radius ${formatDistance(circleRadius())}`;
  }
  if (measure.tempLayer) measure.tempLayer.addTo(measure.group);
  if (hint) $('measureHint').textContent = hint;
}

function finishMeasurement(save) {
  const measure = state.measure;
  const valid = (measure.mode === 'distance' && measure.points.length >= 2)
    || (measure.mode === 'area' && measure.points.length >= 3)
    || (measure.mode === 'circle' && measure.points.length === 1);
  if (save && valid) {
    const item = { id: measure.editingId || crypto.randomUUID(), type: measure.mode, points: measure.points };
    if (measure.mode === 'circle') item.radius = circleRadius();
    persistMeasurement(item);
    drawSavedMeasurement(item);
  } else if (save && measure.editingId && measure.editingBackup) {
    // Bearbeitung ohne gültiges Ergebnis abgebrochen – Original wiederherstellen.
    persistMeasurement(measure.editingBackup);
    drawSavedMeasurement(measure.editingBackup);
  }
  measure.editingId = null;
  measure.editingBackup = null;
  if (measure.tempLayer) { measure.group.removeLayer(measure.tempLayer); measure.tempLayer = null; }
  for (const marker of measure.markers) measure.group.removeLayer(marker);
  measure.markers = [];
  measure.points = [];
  if (measure.mode && state.measure.active) $('measureHint').textContent = modeHint(measure.mode);
}

function undoMeasurePoint() {
  const measure = state.measure;
  if (!measure.points.length) return;
  measure.points.pop();
  const marker = measure.markers.pop();
  if (marker) measure.group.removeLayer(marker);
  $('measureHint').textContent = modeHint(measure.mode);
  updateWorkingMeasure();
}

async function clearMeasurements() {
  if (!await confirmAction('Alle Messungen und Absperrbereiche wirklich löschen?')) return;
  finishMeasurement(false);
  state.measure.group.clearLayers();
  state.measure.saved.clear();
  localStorage.removeItem(MEASURE_STORAGE);
  toast('Alle Messungen wurden gelöscht.');
}

function pathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += L.latLng(points[i - 1]).distanceTo(L.latLng(points[i]));
  return total;
}

// Geodätische Fläche über sphärischen Exzess (Kugelnäherung, ausreichend für Einsatzflächen).
function geodesicArea(points) {
  if (points.length < 3) return 0;
  const rad = Math.PI / 180;
  const radius = 6378137;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [lat1, lng1] = points[i];
    const [lat2, lng2] = points[(i + 1) % points.length];
    sum += (lng2 - lng1) * rad * (2 + Math.sin(lat1 * rad) + Math.sin(lat2 * rad));
  }
  return Math.abs(sum * radius * radius / 2);
}

function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(2).replace('.', ',')} km` : `${Math.round(meters)} m`;
}

function formatArea(squareMeters) {
  return squareMeters >= 10000
    ? `${(squareMeters / 10000).toFixed(2).replace('.', ',')} ha`
    : `${Math.round(squareMeters).toLocaleString('de-DE')} m²`;
}

function distanceLabel(meters) {
  return `${formatDistance(meters)} · ≈ ${Math.ceil(meters / 20)} × B-Schlauch (20 m)`;
}

// ── Taktische Zeichen (eigener Kontext, getrennt von den Messwerkzeugen) ───
const SIGN_STORAGE = 'navlog-ipad-signs';
const SIGN_BASE = 'vendor/taktische-zeichen/';
const SIGN_GROUPS = [
  { title: 'Lage', signs: [
    { key: 'flaechenbrand', name: 'Flächenbrand' },
    { key: 'entstehungsbrand', name: 'Entstehungsbrand' },
    { key: 'vollbrand', name: 'Vollbrand' },
    { key: 'gefahr', name: 'Gefahr' },
    { key: 'richtung', name: 'Ausbreitungsrichtung', rotatable: true },
    { key: 'ankerpunkt', name: 'Ankerpunkt' },
    { key: 'lookout', name: 'Lookout (Beobachtungsposten)' }
  ] },
  { title: 'Führung', signs: [
    { key: 'einsatzleitung', name: 'Einsatzleitung' },
    { key: 'einsatzabschnitt', name: 'Einsatzabschnittsleitung' },
    { key: 'bereitstellungsraum', name: 'Bereitstellungsraum' },
    { key: 'lotsenstelle', name: 'Lotsenstelle' },
    { key: 'hubschrauberlandeplatz', name: 'Hubschrauberlandeplatz' }
  ] },
  { title: 'Kräfte', signs: [
    { key: 'elw1', name: 'ELW 1' },
    { key: 'elw2', name: 'ELW 2' },
    { key: 'tlf', name: 'Tanklöschfahrzeug' },
    { key: 'loeschfahrzeug', name: 'Löschfahrzeug' },
    { key: 'geraetewagen', name: 'Gerätewagen' },
    { key: 'mehrzweckfahrzeug', name: 'Mehrzweckfahrzeug' },
    { key: 'schlauchwagen', name: 'Schlauchwagen' },
    { key: 'sw2000', name: 'Schlauchwagen 2000 KatS' },
    { key: 'wechsellader', name: 'Wechselladerfahrzeug' },
    { key: 'rettungswagen', name: 'Rettungswagen' },
    { key: 'drohne', name: 'Drohne' },
    { key: 'loeschgruppe', name: 'Löschgruppe' },
    { key: 'hubschrauber', name: 'Hubschrauber' }
  ] },
  { title: 'Wasser', signs: [
    { key: 'wasserentnahme', name: 'Wasserentnahmestelle' }
  ] }
];
const SIGN_INDEX = new Map(SIGN_GROUPS.flatMap(group => group.signs).map(sign => [sign.key, sign]));

function initSigns() {
  state.signs.group = L.layerGroup();
  state.signs.visible = state.config.showSignsLayer !== false;
  $('signsToggle').checked = state.signs.visible;
  if (state.signs.visible) state.signs.group.addTo(state.map);
  renderSignPalette();
  for (const item of loadSigns()) drawSign(item);
}

// Wie bei den Messungen: der Schalter betrifft nur die Kartenebene, die
// gesetzten Zeichen bleiben im localStorage stehen.
function toggleSignsLayer() {
  state.signs.visible = $('signsToggle').checked;
  if (!state.signs.group) return;
  if (state.signs.visible) {
    state.signs.group.addTo(state.map);
    // Leaflet legt die Ziehgriffe beim Hinzufügen neu an – sie müssen dem
    // Werkzeugzustand folgen, sonst lassen sich Zeichen ungewollt verschieben.
    setSignDragging(state.signs.active);
  } else {
    if (state.signs.active) closeSigns();
    state.map.removeLayer(state.signs.group);
  }
  updateActivePresetMarks();
}

function setSignDragging(enabled) {
  for (const marker of state.signs.saved.values()) {
    if (enabled) marker.dragging?.enable();
    else marker.dragging?.disable();
  }
}

function renderSignPalette() {
  const palette = $('signPalette');
  palette.replaceChildren();
  for (const group of SIGN_GROUPS) {
    const title = document.createElement('h3');
    title.textContent = group.title;
    palette.append(title);
    const row = document.createElement('div');
    row.className = 'sign-palette-row';
    for (const sign of group.signs) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sign-symbol';
      button.dataset.sign = sign.key;
      button.title = sign.name;
      button.setAttribute('aria-label', sign.name);
      const image = document.createElement('img');
      image.src = `${SIGN_BASE}${sign.key}.svg`;
      image.alt = '';
      button.append(image);
      button.addEventListener('click', () => { selectSign(sign.key); collapseSheetOnPhone('signBar'); });
      row.append(button);
    }
    palette.append(row);
  }
}

function toggleSigns() { $('signBar').hidden ? openSigns() : closeSigns(); }

function openSigns() {
  if (state.measure.active) closeMeasure();
  if (state.ffeh.active) closeFfeh();
  // Ausgeblendete Zeichen wären nicht bearbeitbar – der Layer kommt zurück.
  if (!state.signs.visible) { $('signsToggle').checked = true; toggleSignsLayer(); }
  setLegendOverlay(false, false);
  setSheetCollapsed('signBar', false);
  $('signBar').hidden = false;
  state.signs.active = true;
  $('signsButton').setAttribute('aria-expanded', 'true');
  closePanel();
  closeAppMenu();
  $('searchBox').hidden = true;
  $('searchButton').setAttribute('aria-expanded', 'false');
  state.map.getContainer().classList.add('measuring');
  setSignDragging(true);
  if (state.signs.selected) selectSign(state.signs.selected);
  else setSignHint('Zeichen wählen und auf der Karte platzieren.');
}

function closeSigns() {
  state.signs.active = false;
  state.signs.editingId = null;
  $('signBar').hidden = true;
  $('signsButton').setAttribute('aria-expanded', 'false');
  if (!state.measure.active) state.map.getContainer().classList.remove('measuring');
  setSignDragging(false);
}

function selectSign(key) {
  const sign = SIGN_INDEX.get(key);
  if (!sign) return;
  state.signs.selected = key;
  state.signs.editingId = null;
  for (const button of document.querySelectorAll('.sign-symbol')) button.classList.toggle('active', button.dataset.sign === key);
  $('signRotationRow').hidden = !sign.rotatable;
  if (sign.rotatable) updateSignRotationUi();
  setSignHint(`${sign.name}: auf die Karte tippen zum Platzieren.`);
}

function updateSignRotationUi() {
  const degrees = Number($('signRotationInput').value) || 0;
  $('signRotationValue').textContent = `${degrees}° ${compassLabel(degrees)}`;
  $('signRotationPreview').style.transform = `rotate(${degrees - 90}deg)`;
}

function handleSignClick(event) {
  if (!state.signs.selected) { setSignHint('Bitte zuerst ein Zeichen aus der Palette wählen.'); return; }
  const sign = SIGN_INDEX.get(state.signs.selected);
  const item = {
    id: crypto.randomUUID(),
    key: state.signs.selected,
    lat: event.latlng.lat,
    lng: event.latlng.lng,
    label: $('signLabelInput').value.trim()
  };
  if (sign?.rotatable) item.rotation = Number($('signRotationInput').value) || 0;
  persistSign(item);
  drawSign(item);
}

function drawSign(item) {
  const marker = L.marker([item.lat, item.lng], { icon: signIcon(item), draggable: true, bubblingMouseEvents: false });
  marker.on('click', event => onSignMarkerClick(item.id, event));
  marker.on('dragend', () => {
    const position = marker.getLatLng();
    updateSign(item.id, { lat: position.lat, lng: position.lng });
  });
  marker.addTo(state.signs.group);
  // Bei ausgeblendetem Layer gibt es noch keinen Ziehgriff – toggleSignsLayer
  // zieht ihn beim Einblenden nach.
  if (!state.signs.active) marker.dragging?.disable();
  state.signs.saved.set(item.id, marker);
}

function signIcon(item) {
  const sign = SIGN_INDEX.get(item.key);
  // Der Richtungspfeil der Bibliothek zeigt nach Osten; 0° soll Norden sein.
  const rotation = sign?.rotatable ? ` style="transform:rotate(${Math.round((item.rotation || 0) - 90)}deg)"` : '';
  const label = item.label ? `<span class="sign-marker-label">${escapeHtml(item.label)}</span>` : '';
  return L.divIcon({ className: 'sign-marker', iconSize: [48, 48], iconAnchor: [24, 24], html: `<img src="${SIGN_BASE}${item.key}.svg" alt="${escapeHtml(sign?.name || '')}"${rotation}>${label}` });
}

function onSignMarkerClick(id, event) {
  // Ein anderes aktives Werkzeug behält Vorrang, damit über Zeichen hinweg
  // weitergearbeitet werden kann.
  if (state.ffeh.active) { handleFfehClick(event); return; }
  if (state.measure.active) { handleMeasureClick(event); return; }
  const item = loadSigns().find(entry => entry.id === id);
  if (!item) return;
  const sign = SIGN_INDEX.get(item.key);
  if (state.signs.active) { startSignEdit(item, sign); return; }
  L.popup().setLatLng(event.latlng).setContent(
    `<div class="measure-popup"><strong>${escapeHtml(sign?.name || 'Taktisches Zeichen')}</strong>${item.label ? `<p>${escapeHtml(item.label)}</p>` : ''}<div class="measure-popup-actions"><button type="button" class="sign-edit-button" data-id="${item.id}">Bearbeiten</button><button type="button" class="sign-delete-button" data-id="${item.id}">Löschen</button></div></div>`
  ).openOn(state.map);
}

function startSignEdit(item, sign) {
  state.signs.editingId = item.id;
  state.signs.selected = null;
  // Zum Bearbeiten werden Beschriftung und Richtung gebraucht.
  setSheetCollapsed('signBar', false);
  for (const button of document.querySelectorAll('.sign-symbol')) button.classList.remove('active');
  $('signLabelInput').value = item.label || '';
  $('signRotationRow').hidden = !sign?.rotatable;
  if (sign?.rotatable) {
    $('signRotationInput').value = String(Math.round(item.rotation || 0));
    updateSignRotationUi();
  }
  setSignHint(`${sign?.name || 'Zeichen'} bearbeiten: ziehen zum Verschieben, Beschriftung und Richtung wirken sofort.`);
}

function editSign(id) {
  state.map.closePopup();
  if ($('signBar').hidden) openSigns();
  const item = loadSigns().find(entry => entry.id === id);
  if (!item) return;
  startSignEdit(item, SIGN_INDEX.get(item.key));
}

function onSignOptionInput() {
  updateSignRotationUi();
  const id = state.signs.editingId;
  if (!id) return;
  const item = loadSigns().find(entry => entry.id === id);
  if (!item) return;
  const changes = { label: $('signLabelInput').value.trim() };
  if (SIGN_INDEX.get(item.key)?.rotatable) changes.rotation = Number($('signRotationInput').value) || 0;
  updateSign(id, changes);
}

function updateSign(id, changes) {
  const items = loadSigns();
  const item = items.find(entry => entry.id === id);
  if (!item) return;
  Object.assign(item, changes);
  saveSigns(items);
  const marker = state.signs.saved.get(id);
  if (marker) {
    marker.setLatLng([item.lat, item.lng]);
    marker.setIcon(signIcon(item));
  }
}

function loadSigns() {
  try {
    const items = JSON.parse(localStorage.getItem(SIGN_STORAGE) || '[]');
    return Array.isArray(items) ? items : [];
  } catch { return []; }
}

function saveSigns(items) {
  try { localStorage.setItem(SIGN_STORAGE, JSON.stringify(items)); } catch { }
}

function persistSign(item) {
  const items = loadSigns();
  items.push(item);
  saveSigns(items);
}

function removeSign(id) {
  const marker = state.signs.saved.get(id);
  if (marker) { state.signs.group.removeLayer(marker); state.signs.saved.delete(id); }
  saveSigns(loadSigns().filter(item => item.id !== id));
  if (state.signs.editingId === id) state.signs.editingId = null;
}

function deleteSign(id) {
  removeSign(id);
  state.map.closePopup();
  toast('Zeichen gelöscht.');
}

async function clearSigns() {
  if (!await confirmAction('Alle taktischen Zeichen wirklich löschen?')) return;
  state.signs.group.clearLayers();
  state.signs.saved.clear();
  state.signs.editingId = null;
  localStorage.removeItem(SIGN_STORAGE);
  toast('Alle taktischen Zeichen wurden gelöscht.');
}

function setSignHint(text) { $('signHint').textContent = text; }

// ── Eigene FFEH-Punkte (Waldbrand POI der Feuerwehr Einhausen) ─────────────
// Repo-Bestand (data/waldbrand-poi-ffeh.geojson) plus lokales Overlay im
// localStorage: gleiche id überschreibt, Tombstones blenden aus.
const FFEH_STORAGE = 'navlog-ipad-ffeh';
// Der Prüfername wird einmal eingegeben und für die nächsten Bewertungen gemerkt.
const FFEH_CHECKER_STORAGE = 'navlog-ipad-pruefer';
const FFEH_DATA_URL = 'data/waldbrand-poi-ffeh.geojson';
// „kurz“ ist die sichtbare Beschriftung der Kachel, „name“ bleibt der volle Titel.
const FFEH_CATEGORIES = [
  { key: 'wasserentnahme', name: 'Wasserentnahmestelle', kurz: 'Wasserentn.', svg: 'wasserentnahme.svg' },
  { key: 'hydrant', name: 'Hydrant', kurz: 'Hydrant', svg: 'hydrant.svg' },
  { key: 'brunnen', name: 'Brunnen', kurz: 'Brunnen', svg: 'loeschbrunnen.svg' },
  { key: 'zisterne', name: 'Zisterne', kurz: 'Zisterne', svg: 'zisterne.svg' },
  { key: 'loeschteich', name: 'Löschteich', kurz: 'Löschteich', svg: 'loeschteich.svg' },
  { key: 'schranke', name: 'Schranke', kurz: 'Schranke', text: 'SR' },
  { key: 'gefahrenstelle', name: 'Gefahrenstelle', kurz: 'Gefahr', svg: 'gefahr.svg' },
  { key: 'treffpunkt', name: 'Treffpunkt', kurz: 'Treffpunkt', text: 'TP' },
  { key: 'sonstiges', name: 'Sonstiges', kurz: 'Sonstiges', text: '?' }
];
const FFEH_INDEX = new Map(FFEH_CATEGORIES.map(category => [category.key, category]));
const FFEH_STATUS = [
  { key: 'offen', name: 'Offen (noch nicht geprüft)', color: '#8a8f8a' },
  { key: 'brauchbar', name: 'Brauchbar', color: '#2f7d32' },
  { key: 'eingeschraenkt', name: 'Eingeschränkt brauchbar', color: '#c08a00' },
  { key: 'unbrauchbar', name: 'Unbrauchbar', color: '#9f1d20' },
  { key: 'nicht_auffindbar', name: 'Nicht auffindbar', color: '#4a4f4b' }
];
const FFEH_STATUS_INDEX = new Map(FFEH_STATUS.map(status => [status.key, status]));
// Die Quelle sagt, worauf die Bewertung beruht – nicht, dass NavLog-Daten
// übernommen wurden. „navlog“ heißt: An dieser Stelle steht ein NavLog-Symbol,
// das wir bewertet haben; die Karte legt dafür nur einen Statusring darum.
const FFEH_SOURCES = [
  { key: 'navlog', name: 'NavLog-Symbol (bewertet)' },
  { key: 'karte', name: 'In der Karte erfasst' },
  { key: 'vor_ort', name: 'Vor Ort erkundet' }
];
const FFEH_SOURCE_INDEX = new Map(FFEH_SOURCES.map(source => [source.key, source]));

function initFfeh() {
  state.ffeh.group = L.layerGroup();
  state.ffeh.visible = state.config.showFfehLayer !== false;
  $('ffehToggle').checked = state.ffeh.visible;
  if (state.ffeh.visible) state.ffeh.group.addTo(state.map);
  renderFfehPalette();
  renderFfehStatusOptions();
  renderFfehSourceOptions();
  renderFfehLayer();
  state.map.on('zoomend', updateFfehZoom);
  updateFfehZoom();
  loadFfehRepo().then(renderFfehLayer);
}

async function loadFfehRepo() {
  try {
    const response = await fetch(FFEH_DATA_URL);
    if (!response.ok) throw new Error(`Status ${response.status}`);
    const data = await response.json();
    state.ffeh.repo = (Array.isArray(data?.features) ? data.features : []).map(featureToFfehPoint).filter(Boolean);
  } catch { state.ffeh.repo = []; }
}

function renderFfehPalette() {
  const palette = $('ffehPalette');
  palette.replaceChildren();
  for (const category of FFEH_CATEGORIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ffeh-symbol-button';
    button.dataset.category = category.key;
    button.title = category.name;
    button.setAttribute('aria-label', category.name);
    // Symbol plus Klartext: die Kürzel allein sind im Einsatz nicht selbsterklärend.
    button.innerHTML = `${ffehSymbolHtml(category)}<span class="ffeh-symbol-name">${escapeHtml(category.kurz || category.name)}</span>`;
    // Während einer Bearbeitung bleibt das Sheet offen, sonst verschwinden „Fertig“ und „Abbrechen“.
    button.addEventListener('click', () => { selectFfehCategory(category.key); if (!state.ffeh.editingId) collapseSheetOnPhone('ffehBar'); });
    palette.append(button);
  }
}

function renderFfehStatusOptions() {
  const select = $('ffehStatusSelect');
  select.replaceChildren();
  for (const status of FFEH_STATUS) {
    const option = document.createElement('option');
    option.value = status.key;
    option.textContent = status.name;
    select.append(option);
  }
}

// Die Quelle ist korrigierbar: eine falsch geratene Herkunft darf nicht
// dauerhaft in den Daten und in der Markerdarstellung stehen bleiben.
function renderFfehSourceOptions() {
  const select = $('ffehSourceSelect');
  select.replaceChildren();
  for (const source of FFEH_SOURCES) {
    const option = document.createElement('option');
    option.value = source.key;
    option.textContent = source.name;
    select.append(option);
  }
}

function ffehSymbolHtml(category) {
  return category.svg
    ? `<img src="${SIGN_BASE}${category.svg}" alt="">`
    : `<span class="ffeh-symbol-text">${escapeHtml(category.text)}</span>`;
}

function ffehCategory(key) { return FFEH_INDEX.get(key) || FFEH_INDEX.get('sonstiges'); }
function ffehStatus(key) { return FFEH_STATUS_INDEX.get(key) || FFEH_STATUS[0]; }
function todayIso() { return new Date().toISOString().slice(0, 10); }

// ── Datenhaltung: Repo-Bestand + lokales Overlay ───────────────────────────
function loadFfehLocal() {
  try {
    const items = JSON.parse(localStorage.getItem(FFEH_STORAGE) || '[]');
    return Array.isArray(items) ? items.map(migrateFfehItem) : [];
  } catch { return []; }
}

// Altbestand: Das Feld hieß früher „erreichbar_tlf“. Beim Lesen wird es auf
// „erreichbar_lf“ gezogen, damit alte Geräte- und Dateistände nicht brechen.
function migrateFfehItem(item) {
  if (!item || typeof item !== 'object' || !('erreichbar_tlf' in item)) return item;
  const { erreichbar_tlf, ...rest } = item;
  if (rest.erreichbar_lf === undefined) rest.erreichbar_lf = typeof erreichbar_tlf === 'boolean' ? erreichbar_tlf : null;
  return rest;
}

function saveFfehLocal(items) {
  try { localStorage.setItem(FFEH_STORAGE, JSON.stringify(items)); } catch { }
}

function ffehTombstones() { return loadFfehLocal().filter(item => item?.geloescht && item.id); }

function mergedFfehPoints() {
  const merged = new Map();
  for (const point of state.ffeh.repo) merged.set(point.id, { ...point, offiziell: true });
  for (const local of loadFfehLocal()) {
    if (!local?.id) continue;
    if (local.geloescht) merged.delete(local.id);
    else merged.set(local.id, { ...local, offiziell: false });
  }
  return [...merged.values()];
}

function findFfehPoint(id) { return mergedFfehPoints().find(point => point.id === id) || null; }

// Zentraler Einstieg zum Anlegen und Ändern: schreibt immer ins lokale Overlay.
function upsertFfehPoint(point) {
  if (!point?.id) return null;
  const items = loadFfehLocal().filter(item => item.id !== point.id);
  const { offiziell, ...stored } = point;
  items.push(stored);
  saveFfehLocal(items);
  refreshFfehPoint(stored.id);
  return stored;
}

function refreshFfehPoint(id) {
  const marker = state.ffeh.markers.get(id);
  const point = findFfehPoint(id);
  // Bei aktivem Filter kann eine Statusentscheidung den Punkt aus der Arbeitsliste nehmen.
  if (!marker || !point || !istFfehSichtbar(point)) { renderFfehLayer(); return; }
  marker.setLatLng([point.lat, point.lng]);
  marker.setIcon(ffehIcon(point));
  // setIcon erzeugt das Marker-Element neu, die Hervorhebung muss danach zurück.
  highlightFfehMarker(state.ffeh.editingId);
  updateFfehProgress();
}

function updateFfehPoint(id, changes) {
  const current = findFfehPoint(id);
  if (!current) return null;
  return upsertFfehPoint({ ...current, ...changes });
}

function renderFfehLayer() {
  if (!state.ffeh.group) return;
  state.ffeh.group.clearLayers();
  state.ffeh.markers.clear();
  for (const point of visibleFfehPoints()) drawFfehPoint(point);
  highlightFfehMarker(state.ffeh.editingId);
  updateFfehProgress();
}

// Der gerade bearbeitete Punkt wird auf der Karte hervorgehoben, damit klar ist,
// welchen Marker man ziehen kann.
function highlightFfehMarker(id) {
  for (const [key, marker] of state.ffeh.markers) marker.getElement()?.classList.toggle('editing', Boolean(id) && key === id);
}

// Arbeitsliste: der Filter „Nur offene zeigen“ wirkt nur zur Laufzeit. Der gerade
// bearbeitete Punkt bleibt immer sichtbar – sonst verschwindet der Marker mit der
// Statusentscheidung mitten in der Bearbeitung und lässt sich nicht mehr ziehen.
function istFfehSichtbar(point) {
  return !state.ffeh.openOnly || ffehStatus(point.status).key === 'offen' || point.id === state.ffeh.editingId;
}

function visibleFfehPoints() {
  return mergedFfehPoints().filter(istFfehSichtbar);
}

function toggleFfehOpenOnly() {
  state.ffeh.openOnly = $('ffehOpenOnlyToggle').checked;
  renderFfehLayer();
  setFfehHint(state.ffeh.openOnly ? 'Filter aktiv: Es werden nur noch offene Punkte angezeigt.' : 'Filter aus: Alle Punkte werden wieder angezeigt.');
}

// Fortschritt zählt immer über den gesamten Bestand, unabhängig vom Filter.
function updateFfehProgress() {
  const points = mergedFfehPoints();
  const assessed = points.filter(point => ffehStatus(point.status).key !== 'offen').length;
  $('ffehProgress').textContent = points.length
    ? `${assessed} von ${points.length} Punkten bewertet`
    : 'Noch keine Punkte erfasst.';
}

function drawFfehPoint(point) {
  const marker = L.marker([point.lat, point.lng], { icon: ffehIcon(point), draggable: true, bubblingMouseEvents: false, pane: 'ffehPane' });
  marker.on('click', event => onFfehMarkerClick(point.id, event));
  marker.on('dragend', () => {
    const position = marker.getLatLng();
    updateFfehPoint(point.id, { lat: position.lat, lng: position.lng });
  });
  marker.addTo(state.ffeh.group);
  if (!state.ffeh.active) marker.dragging?.disable();
  state.ffeh.markers.set(point.id, marker);
}

// Verschieben ist nur im Werkzeugmodus erlaubt; ausgeblendete Marker haben
// noch keinen Drag-Handler, deshalb überall optional.
function setFfehDragging(enabled) {
  for (const marker of state.ffeh.markers.values()) {
    if (enabled) marker.dragging?.enable();
    else marker.dragging?.disable();
  }
}

// Offen = gestrichelter Ring (noch nichts entschieden), nicht auffindbar =
// durchgestrichener Ring, sonst durchgezogen in der Statusfarbe.
function ffehRingClass(status) {
  if (status.key === 'offen') return ' ffeh-ring-open';
  if (status.key === 'nicht_auffindbar') return ' ffeh-ring-missing';
  return '';
}

function ffehIcon(point) {
  const status = ffehStatus(point.status);
  const label = point.name ? `<span class="ffeh-marker-label">${escapeHtml(point.name)}</span>` : '';
  // Punkte aus NavLog sitzen auf einem eigenen Rastersymbol der Karte. Ein
  // volles Kategoriesymbol würde es verdecken, deshalb liegt hier nur ein
  // zentrierter Statusring darum – die Mitte bleibt frei, das Original lesbar.
  // 52 px außen: groß genug, um das Rastersymbol wirklich zu umfassen, und mit
  // dem Finger sicher zu treffen (Maße identisch in .ffeh-ring in app.css).
  if (point.quelle === 'navlog') {
    // Unter dem Ring steht als Hinweis die Beschreibung (gekürzt), damit die
    // Erkundungsinfo direkt am Symbol lesbar ist.
    const hintText = point.beschreibung ? (point.beschreibung.length > 80 ? `${point.beschreibung.slice(0, 79)}…` : point.beschreibung) : '';
    const hint = hintText ? `<span class="ffeh-marker-label ffeh-marker-hint">${escapeHtml(hintText)}</span>` : '';
    const ringLabel = label || hint ? `<span class="ffeh-ring-caption">${label}${hint}</span>` : '';
    return L.divIcon({
      className: 'ffeh-marker', iconSize: [52, 52], iconAnchor: [26, 26],
      html: `<span class="ffeh-ring${ffehRingClass(status)}" style="--ffeh-status:${status.color}"></span>${ringLabel}`
    });
  }
  const category = ffehCategory(point.kategorie);
  const missing = point.status === 'nicht_auffindbar' ? ' missing' : '';
  return L.divIcon({
    className: 'ffeh-marker', iconSize: [44, 44], iconAnchor: [22, 22],
    html: `<span class="ffeh-symbol${missing}" style="--ffeh-status:${status.color}">${ffehSymbolHtml(category)}</span>${label}`
  });
}

// ── Zoomabhängige Darstellung ─────────────────────────────────────────────
// In Übersichtsstufen sind 44-px-Marker viel zu präsent. Gesteuert wird das
// über eine Klasse am Kartencontainer und reine CSS-Transforms; die Icons
// selbst werden nie neu aufgebaut (sonst ruckelt jedes Zoomen auf dem iPad).
const FFEH_ZOOM_CLASSES = ['ffeh-zoom-hidden', 'ffeh-zoom-s', 'ffeh-zoom-m', 'ffeh-zoom-l', 'ffeh-zoom-xl', 'ffeh-zoom-xxl'];
const FFEH_ZOOM_HINT = 'Übersichtsmaßstab: Die Punkte werden nur klein angezeigt. Zum Bewerten bitte näher heranzoomen.';

function ffehZoomClass(zoom) {
  if (zoom < 12) return 'ffeh-zoom-hidden';
  if (zoom < 14) return 'ffeh-zoom-s';
  if (zoom < 16) return 'ffeh-zoom-m';
  // NavLog zeichnet seine Rastersymbole in hohen Stufen deutlich größer;
  // der Statusring wächst mit, sonst verschwindet er im Symbol.
  if (zoom < 17) return 'ffeh-zoom-l';
  if (zoom < 18) return 'ffeh-zoom-xl';
  return 'ffeh-zoom-xxl';
}

function updateFfehZoom() {
  if (!state.map) return;
  const zoom = state.map.getZoom();
  let name = ffehZoomClass(zoom);
  // Im Werkzeugmodus bleiben die Punkte auch in der Übersicht sichtbar –
  // bewerten kann man nur, was man sieht.
  const forced = name === 'ffeh-zoom-hidden' && state.ffeh.active;
  if (forced) name = 'ffeh-zoom-s';
  const container = state.map.getContainer();
  for (const cls of FFEH_ZOOM_CLASSES) container.classList.toggle(cls, cls === name);
  if (forced) setFfehHint(FFEH_ZOOM_HINT);
}

function toggleFfehLayer() {
  state.ffeh.visible = $('ffehToggle').checked;
  if (!state.ffeh.group) return;
  if (state.ffeh.visible) {
    state.ffeh.group.addTo(state.map);
    setFfehDragging(state.ffeh.active);
  } else {
    state.map.removeLayer(state.ffeh.group);
    if (state.ffeh.active) closeFfeh();
  }
  renderLegend();
}

// ── Werkzeugmodus ─────────────────────────────────────────────────────────
const FFEH_IDLE_HINT = 'Kategorie wählen und auf die Karte tippen. Vorhandene Punkte antippen zum Bearbeiten oder ziehen zum Verschieben.';

function toggleFfeh() { $('ffehBar').hidden ? openFfeh() : closeFfeh(); }

function openFfeh() {
  if (state.measure.active) closeMeasure();
  if (state.signs.active) closeSigns();
  if (!state.ffeh.visible) { $('ffehToggle').checked = true; toggleFfehLayer(); }
  setLegendOverlay(false, false);
  setSheetCollapsed('ffehBar', false);
  $('ffehBar').hidden = false;
  state.ffeh.active = true;
  $('ffehButton').setAttribute('aria-expanded', 'true');
  closePanel();
  closeAppMenu();
  $('searchBox').hidden = true;
  $('searchButton').setAttribute('aria-expanded', 'false');
  state.map.getContainer().classList.add('measuring');
  setFfehDragging(true);
  updateFfehEditActions();
  if (state.ffeh.selected) selectFfehCategory(state.ffeh.selected);
  else setFfehHint(FFEH_IDLE_HINT);
  // Setzt gegebenenfalls den Übersichtshinweis und holt ausgeblendete Punkte zurück.
  updateFfehZoom();
}

// Schließt das Werkzeug. „meldung“ ist eine bereits feststehende Rückmeldung
// (etwa aus „Abbrechen“), die hier nur noch mitgesendet wird.
// Das × schließt nur das Werkzeug – ein laufender Punkt wird behalten, nie verworfen.
// Alle Botschaften teilen sich einen einzigen Toast, sonst überschreibt der
// Filterhinweis die Speicher- oder Verwurfsmeldung sofort wieder.
function closeFfeh(meldung = '') {
  const gespeichert = finishFfehEdit(false);
  state.ffeh.active = false;
  $('ffehBar').hidden = true;
  $('ffehButton').setAttribute('aria-expanded', 'false');
  if (!state.measure.active && !state.signs.active) state.map.getContainer().classList.remove('measuring');
  setFfehDragging(false);
  updateFfehZoom();
  const hinweise = [];
  if (meldung) hinweise.push(meldung);
  if (gespeichert) hinweise.push('Punkt gespeichert.');
  if (state.ffeh.openOnly) hinweise.push('Der Filter „Nur offene zeigen“ bleibt aktiv, bis die Karte neu geladen wird.');
  if (hinweise.length) toast(hinweise.join(' '));
}

// „✓ Fertig“ und „Abbrechen“ beenden nicht nur die Bearbeitung, sondern schließen
// das Werkzeug gleich mit: nach einer Bewertung ist das Sheet erledigt und müsste
// sonst extra über × weggetippt werden. Beide Wege laufen über closeFfeh, damit es
// bei genau einem Toast bleibt. Der Erkundungskreislauf bleibt erhalten – der
// nächste Kartentipp öffnet wieder die Symbolabfrage mit „⌖ Punkt bewerten“.
// Reines Anlegen über die Palette schließt nichts, dort bleibt das Sheet offen.
function finishFfehEditAndClose() { closeFfeh(); }
function cancelFfehEditAndClose() { closeFfeh(cancelFfehEdit(false)); }

function selectFfehCategory(key) {
  const category = FFEH_INDEX.get(key);
  if (!category) return;
  markFfehCategory(key);
  if (state.ffeh.editingId) {
    updateFfehPoint(state.ffeh.editingId, { kategorie: key });
    setFfehHint(`Kategorie geändert: ${category.name}.`);
    return;
  }
  state.ffeh.selected = key;
  setFfehHint(`${category.name}: auf die Karte tippen zum Anlegen.`);
}

function markFfehCategory(key) {
  for (const button of document.querySelectorAll('.ffeh-symbol-button')) button.classList.toggle('active', button.dataset.category === key);
}

function handleFfehClick(event) {
  // Eine laufende Bearbeitung wird nur über „✓ Fertig“ oder „Abbrechen“ beendet,
  // damit ein Tipp daneben nichts stillschweigend abschließt.
  if (state.ffeh.editingId) {
    setFfehHint('Bearbeitung läuft: Marker ziehen zum Verschieben, danach „✓ Fertig“ oder „Abbrechen“ tippen.');
    return;
  }
  // Ohne gewählte Kategorie ist der Tipp eine Erkundung: Symbolinformation
  // öffnen und darüber „⌖ Punkt bewerten“ anbieten. Ohne diesen Weg endet jeder
  // Kartentipp im Werkzeug und die Bewertung wäre je Sitzung nur einmal
  // erreichbar – nach „✓ Fertig“ käme das Formular nie wieder.
  if (!state.ffeh.selected) {
    setFfehHint('Symbolinformation wird geöffnet: „⌖ Punkt bewerten“ legt hier einen Punkt an. Für ein eigenes Symbol zuerst eine Kategorie wählen.');
    showFeatureQuery(event);
    return;
  }
  const category = ffehCategory(state.ffeh.selected);
  const point = {
    id: crypto.randomUUID(),
    kategorie: category.key,
    name: $('ffehNameInput').value.trim(),
    beschreibung: $('ffehDescriptionInput').value.trim(),
    status: 'offen',
    quelle: 'karte',
    erreichbar_lf: null,
    geprueft_am: null,
    geprueft_von: null,
    erstellt_am: new Date().toISOString(),
    lat: event.latlng.lat,
    lng: event.latlng.lng
  };
  upsertFfehPoint(point);
  $('ffehNameInput').value = '';
  $('ffehDescriptionInput').value = '';
  setFfehHint(`${point.name || category.name} angelegt. Zum Bewerten antippen oder weiteren Punkt setzen.`);
}

// ── Erkundungsmodus: drei Wege, ein gemeinsames Bewertungsformular ─────────
// Weg 1 (NavLog-POI) und Weg 2 (Rastersymbol) starten im Koordinaten-Popup,
// Weg 3 über die eigene GPS-Position. Alle drei erzeugen dasselbe Datenmodell.
// Der Knopf trägt alles bei sich: Koordinaten und – sobald die Abfrage
// geantwortet hat – die Vorbefüllung als JSON im Datenattribut. Vorher gab es
// dafür einen Zwischenspeicher (state.lastQuery), der über Koordinaten und
// Zeitpunkt wiedergefunden werden musste; am Gerät hat diese Wiederfindung
// versagt. Ein Datenattribut kann gar nicht zur falschen Abfrage gehören.
function ffehAssessHtml(lat, lng, seed = null) {
  const seedAttribut = seed ? ` data-seed="${escapeAttribute(JSON.stringify(seed))}"` : '';
  return `<div class="ffeh-assess-row"><button type="button" class="ffeh-assess-button" data-lat="${lat}" data-lon="${lng}"${seedAttribut}>⌖ Punkt bewerten</button><small>Legt hier einen eigenen FFEH-Punkt an und öffnet die Bewertung.</small></div>`;
}

// Vorbefüllung aus einem angezeigten Treffer. Layer und Eigenschaften dienen
// nur noch der Kategorie- und Namensvorgabe; die Quelle ist bei jedem
// angezeigten Objekt „navlog“ (siehe FFEH_SOURCES).
function buildFfehSeed(properties, layer) {
  return {
    name: ffehNameFromProperties(properties, layer),
    beschreibung: ffehHintFromProperties(properties),
    kategorie: guessFfehCategory(properties, layer),
    quelle: 'navlog',
    treffer: true
  };
}

// Seed vom Knopf lesen. Fremder oder beschädigter Inhalt darf die Bewertung
// nicht verhindern – dann wird ohne Vorbefüllung weitergemacht.
function parseFfehSeed(rohwert) {
  if (!rohwert) return null;
  try {
    const seed = JSON.parse(rohwert);
    if (!seed || typeof seed !== 'object' || !seed.treffer) return null;
    return {
      name: String(seed.name || '').slice(0, 60),
      beschreibung: String(seed.beschreibung || '').slice(0, 200),
      kategorie: ffehCategory(seed.kategorie).key,
      quelle: ffehSourceKey(seed.quelle),
      treffer: true
    };
  } catch {
    return null;
  }
}

// Der Titel der Abfrage ist der beste Namensvorschlag. Verworfen wird der
// generische Platzhalter und jeder Rückfall auf einen Layertitel, der kein
// Punkt-Layer ist: „DTK0025“ oder „Waldwege und Rückegassen“ benennen kein
// Objekt. „Rettungspunkt 1234“ oder „Hydranten“ bleiben brauchbar, auch wenn
// sie dem Titel eines Punkt-Layers gleichen.
function ffehNameFromProperties(properties, layer) {
  if (!properties) return '';
  const title = String(featureTitle(properties, layer) || '').trim();
  if (!title || title === 'Kartenobjekt') return '';
  // „Einsatzhinweis“ ist eine Textsorte, kein Name. Falls das Objekt zusätzlich
  // eine Bezeichnung trägt, wird die genommen, sonst bleibt der Name leer –
  // der Freitext selbst landet in der Beschreibung (ffehHintFromProperties).
  if (title === 'Einsatzhinweis') return descriptiveName(properties).slice(0, 60);
  if (isNonPointLayerLabel(title)) return '';
  return title.slice(0, 60);
}

// Bezeichnende Eigenschaft eines Objekts, ohne reine Zahlenschlüssel.
function descriptiveName(properties) {
  const value = [properties.bezeichnung, properties.name, properties.objektart].find(item => item && !/^\d+(?:\.0)?$/.test(String(item)));
  return value ? String(value).trim() : '';
}

// Gleicht der Vorschlag dem Titel eines Layers, der keine Punkte führt, dann
// stammt er aus dem Rückfall in featureTitle und benennt nichts.
function isNonPointLayerLabel(title) {
  const label = normalizeLayerLabel(title);
  if (!label) return false;
  return state.availableLayers.some(layer => layerKind(layer) !== 'points'
    && (normalizeLayerLabel(layer.title) === label || normalizeLayerLabel(layer.name) === label));
}

// Freitext-Hinweise aus NavLog (Telefonnummern, Auflagen, Zufahrtsregeln) sind
// für die Erkundung wertvoll und werden in die Beschreibung übernommen.
// 200 Zeichen entsprechen der Feldlänge von #ffehDescriptionInput.
function ffehHintFromProperties(properties) {
  if (!properties) return '';
  const hint = friendlyProperties(properties).find(entry => entry.label === 'Hinweis');
  return hint ? String(hint.value).trim().slice(0, 200) : '';
}

// Kategorie-Heuristik über Layer- und Eigenschaftstexte der NavLog-Abfrage.
function guessFfehCategory(properties, layer) {
  const values = Object.entries(properties || {}).map(([key, value]) => `${key} ${value}`).join(' ');
  const haystack = `${layer?.title || ''} ${layer?.name || ''} ${values}`.toLowerCase();
  if (/hydrant/.test(haystack)) return 'hydrant';
  if (/brunnen/.test(haystack)) return 'brunnen';
  if (/zisterne/.test(haystack)) return 'zisterne';
  if (/teich|gewässer|gewaesser/.test(haystack)) return 'loeschteich';
  if (/wasser|entnahme|saugstelle/.test(haystack)) return 'wasserentnahme';
  if (/rettungspunkt|treffpunkt/.test(haystack)) return 'treffpunkt';
  if (/schranke/.test(haystack)) return 'schranke';
  // Punkt-Layer der Waldbrandkarte zeigen fast nur Wasserstellen. Als Vorgabe
  // für Datenmodell und Export ist das brauchbarer als „Sonstiges“.
  return layer && layerKind(layer) === 'points' ? 'wasserentnahme' : 'sonstiges';
}

// Großzügige Regel (ausdrücklicher Nutzerwunsch): Hat die Abfrage überhaupt ein
// Objekt mit Inhalt angezeigt, dann steht dort ein NavLog-Symbol – auch ein
// Einsatzhinweis oder eine Wendemöglichkeit ist eines. Hintergrundlayer werden
// gar nicht erst abgefragt, also bleibt nichts Fremdes übrig. Ohne Seed (Knopf
// aus dem Lade- oder Fehlerzweig, oder gar keine Abfrage) bleibt es bei
// „In der Karte erfasst“. Die Quelle ist im Formular jederzeit korrigierbar.
function startFfehAssessment(lat, lng, rohwert) {
  const seed = parseFfehSeed(rohwert);
  createFfehAssessment(lat, lng, seed?.quelle || 'karte', seed);
}

function createFfehAssessment(lat, lng, quelle, seed = null) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Der neue Punkt muss sichtbar sein, sonst bewertet man ins Leere.
  if (!state.ffeh.visible) { $('ffehToggle').checked = true; toggleFfehLayer(); }
  const category = ffehCategory(seed?.kategorie);
  const point = {
    id: crypto.randomUUID(),
    // Ohne Vorschlag bleibt der Name leer – der Kategoriename als Vorgabe hat
    // dazu geführt, dass viele Punkte gleich hießen.
    kategorie: category.key,
    name: seed?.name || '',
    // Ein Freitext-Hinweis aus der Symbolabfrage ist der Einstieg in die
    // Erkundung – lieber vorbefüllt und korrigierbar als verloren.
    beschreibung: seed?.beschreibung || '',
    status: 'offen',
    quelle,
    erreichbar_lf: null,
    geprueft_am: null,
    geprueft_von: null,
    erstellt_am: new Date().toISOString(),
    lat, lng
  };
  upsertFfehPoint(point);
  editFfehPoint(point.id, true);
  // „Vorbefüllt“ nur behaupten, wenn wirklich etwas aus der Abfrage übernommen wurde.
  const vorbefuellt = Boolean(seed?.name) || Boolean(seed?.beschreibung) || (Boolean(seed?.kategorie) && seed.kategorie !== 'sonstiges');
  // Bei einem NavLog-Symbol ist die Palette ausgeblendet – dann nicht zur
  // Kategorie auffordern, sondern gleich zu Name und Status.
  setFfehHint(`Neuer Punkt (${ffehSourceName(quelle)})${vorbefuellt ? ', vorbefüllt aus NavLog-Symbolinfo' : ''}: `
    + (quelle === 'navlog'
      ? 'Name prüfen und Status setzen. Zum Schluss „✓ Fertig“ tippen.'
      : 'Kategorie prüfen, Name eintragen und Status setzen. Zum Schluss „✓ Fertig“ tippen.'));
  return point;
}

function ffehSourceName(key) { return FFEH_SOURCE_INDEX.get(key)?.name || 'In der Karte erfasst'; }
function ffehSourceKey(key) { return FFEH_SOURCE_INDEX.has(key) ? key : 'karte'; }

// Weg 3: einmalige Ortung, Punkt an der eigenen Position anlegen.
function addFfehPointAtLocation() {
  if (!state.map) return;
  setFfehHint('Standort wird ermittelt …');
  state.map.once('locationfound', onFfehLocationFound);
  state.map.once('locationerror', onFfehLocationError);
  state.map.locate({ setView: false, enableHighAccuracy: true, timeout: 15000 });
}

function onFfehLocationFound(event) {
  state.map.off('locationerror', onFfehLocationError);
  state.map.setView(event.latlng, Math.max(state.map.getZoom(), 17));
  const point = createFfehAssessment(event.latlng.lat, event.latlng.lng, 'vor_ort');
  if (point) setFfehHint(`Vor Ort angelegt (Genauigkeit etwa ${Math.round(event.accuracy)} m). Bitte Kategorie wählen und bewerten.`);
}

function onFfehLocationError() {
  state.map.off('locationfound', onFfehLocationFound);
  setFfehHint('Standort nicht verfügbar. Punkt bitte durch Tippen auf die Karte anlegen.');
  toast('Der Standort konnte nicht ermittelt werden. Bitte Browserfreigabe prüfen.');
}

function onFfehMarkerClick(id, event) {
  // Andere Werkzeuge behalten Vorrang, damit über Punkten weitergearbeitet werden kann.
  if (state.measure.active) { handleMeasureClick(event); return; }
  if (state.signs.active) { handleSignClick(event); return; }
  const point = findFfehPoint(id);
  if (!point) return;
  if (state.ffeh.active) {
    // Erneutes Antippen desselben Punktes darf den gesicherten Ausgangszustand
    // nicht überschreiben; der Wechsel auf einen anderen schließt sauber ab.
    if (state.ffeh.editingId === point.id) { setFfehHint('Punkt ist in Bearbeitung: Marker ziehen zum Verschieben, danach „✓ Fertig“ oder „Abbrechen“.'); return; }
    if (state.ffeh.editingId) finishFfehEdit();
    startFfehEdit(point);
    return;
  }
  L.popup({ maxWidth: 340 }).setLatLng(event.latlng).setContent(ffehPopupHtml(point)).openOn(state.map);
}

// Bewertungs- und Bearbeitungsformular: füllt das Sheet mit dem Punkt.
// „neu“ markiert einen gerade erst angelegten Punkt – „Abbrechen“ entfernt ihn
// dann wieder, statt einen Ausgangszustand zurückzuholen.
function startFfehEdit(point, neu = false) {
  state.ffeh.editingId = point.id;
  state.ffeh.editingIsNew = neu;
  state.ffeh.editingBackup = neu ? null : JSON.parse(JSON.stringify(point));
  // Ohne bisherigen lokalen Eintrag stellt „Abbrechen“ den reinen Repo-Stand her.
  state.ffeh.editingHadLocal = neu || loadFfehLocal().some(item => item?.id === point.id);
  state.ffeh.selected = null;
  setSheetCollapsed('ffehBar', false);
  markFfehCategory(point.kategorie);
  $('ffehNameInput').value = point.name || '';
  $('ffehDescriptionInput').value = point.beschreibung || '';
  $('ffehStatusSelect').value = ffehStatus(point.status).key;
  $('ffehAccessSelect').value = point.erreichbar_lf === true ? 'ja' : point.erreichbar_lf === false ? 'nein' : '';
  $('ffehCheckerInput').value = point.geprueft_von || loadFfehChecker();
  $('ffehSourceSelect').value = ffehSourceKey(point.quelle);
  updateFfehEditActions();
  highlightFfehMarker(point.id);
  setFfehHint(`${point.name || ffehCategory(point.kategorie).name} bearbeiten: Marker auf der Karte ziehen zum Verschieben. Zum Schluss „✓ Fertig“ tippen.`);
}

function endFfehEdit() {
  if (!state.ffeh.editingId) return;
  state.ffeh.editingId = null;
  state.ffeh.editingBackup = null;
  state.ffeh.editingIsNew = false;
  state.ffeh.editingHadLocal = false;
  markFfehCategory(null);
  $('ffehNameInput').value = '';
  $('ffehDescriptionInput').value = '';
  $('ffehStatusSelect').value = 'offen';
  $('ffehAccessSelect').value = '';
  $('ffehCheckerInput').value = '';
  $('ffehSourceSelect').value = 'karte';
  updateFfehEditActions();
  highlightFfehMarker(null);
  // Der bearbeitete Punkt war vom Filter ausgenommen – jetzt gilt er wieder.
  if (state.ffeh.openOnly) renderFfehLayer();
}

// Im Leerlauf steht der GPS-Knopf im Sheet, während der Bearbeitung der Abschluss.
function updateFfehEditActions() {
  const editing = Boolean(state.ffeh.editingId);
  $('ffehIdleActions').hidden = editing;
  $('ffehEditActions').hidden = !editing;
  updateFfehCategoryChoice();
}

// Bei einem NavLog-Punkt bleibt das Rastersymbol der Karte stehen, der eigene
// Punkt legt nur den Statusring darum. Eine Kategorie-Auswahl würde dort eine
// Wirkung vortäuschen, die auf der Karte gar nicht sichtbar wird – gespeichert
// (und exportiert) wird sie trotzdem. Im Leerlauf bleibt die Palette sichtbar.
function updateFfehCategoryChoice() {
  const navlog = Boolean(state.ffeh.editingId) && ffehSourceKey($('ffehSourceSelect').value) === 'navlog';
  $('ffehPalette').hidden = navlog;
  $('ffehCategoryNote').hidden = !navlog;
}

// „✓ Fertig“: Eingaben sind bereits gespeichert, hier wird nur sauber abgeschlossen.
// Rückgabe: ob wirklich eine Bearbeitung lief. Beim Schließen des Werkzeugs
// übernimmt closeFfeh die Rückmeldung, damit nicht zwei Toasts kollidieren.
function finishFfehEdit(mitHinweis = true) {
  if (!state.ffeh.editingId) return false;
  endFfehEdit();
  setFfehHint(FFEH_IDLE_HINT);
  if (mitHinweis) toast('Punkt gespeichert.');
  return true;
}

// „Abbrechen“: Ausgangszustand zurückholen, neu angelegte Punkte wieder entfernen.
// Rückgabe: die Rückmeldung an die Einsatzkraft. Wird das Werkzeug im selben Zug
// geschlossen, übernimmt closeFfeh sie – sonst kollidieren zwei Toasts.
function cancelFfehEdit(mitHinweis = true) {
  const { editingId: id, editingBackup: backup, editingIsNew: neu, editingHadLocal: hadLocal } = state.ffeh;
  if (!id) return '';
  endFfehEdit();
  let meldung = '';
  if (neu || !hadLocal) {
    // Nie „echt“ gewesen beziehungsweise vorher nur im Repo-Bestand: kein Tombstone,
    // nur der lokale Eintrag verschwindet.
    saveFfehLocal(loadFfehLocal().filter(item => item?.id !== id));
    renderFfehLayer();
    meldung = neu ? 'Neuer Punkt verworfen.' : 'Änderungen verworfen.';
  } else if (backup) {
    upsertFfehPoint(backup);
    meldung = 'Änderungen verworfen.';
  }
  setFfehHint(FFEH_IDLE_HINT);
  if (meldung && mitHinweis) toast(meldung);
  return meldung;
}

function onFfehOptionInput(statusChanged = false, sourceChanged = false) {
  const id = state.ffeh.editingId;
  if (!id) return;
  const access = $('ffehAccessSelect').value;
  const changes = {
    name: $('ffehNameInput').value.trim(),
    beschreibung: $('ffehDescriptionInput').value.trim(),
    status: ffehStatus($('ffehStatusSelect').value).key,
    // Die Quelle steuert seit dem Statusring auch die Darstellung.
    // updateFfehPoint zieht über refreshFfehPoint das Markersymbol nach.
    quelle: ffehSourceKey($('ffehSourceSelect').value),
    erreichbar_lf: access === 'ja' ? true : access === 'nein' ? false : null,
    geprueft_von: $('ffehCheckerInput').value.trim() || null
  };
  // Der Prüfstempel entsteht erst mit einer Statusentscheidung.
  if (statusChanged) changes.geprueft_am = changes.status === 'offen' ? null : todayIso();
  saveFfehChecker(changes.geprueft_von);
  updateFfehPoint(id, changes);
  // Ohne Prüfername nur ein dezenter Hinweis, keine Sperre.
  if (statusChanged) setFfehHint(changes.status !== 'offen' && !changes.geprueft_von
    ? 'Status gesetzt. Bitte noch „Geprüft von“ eintragen – der Name wird für weitere Bewertungen gemerkt.'
    : `Status gesetzt: ${ffehStatus(changes.status).name}.`);
  // Mit der Quelle wechselt die Darstellung – und damit auch, ob die
  // Kategorie-Palette überhaupt etwas bewirkt.
  if (sourceChanged) updateFfehCategoryChoice();
  if (sourceChanged) setFfehHint(changes.quelle === 'navlog'
    ? 'Quelle geändert: Der Punkt legt jetzt nur einen Statusring um das NavLog-Symbol, die Kategorie wird nicht überzeichnet.'
    : `Quelle geändert: ${ffehSourceName(changes.quelle)}. Der Punkt zeigt wieder das volle Kategoriesymbol.`);
}

function loadFfehChecker() {
  try { return localStorage.getItem(FFEH_CHECKER_STORAGE) || ''; }
  catch { return ''; }
}

function saveFfehChecker(name) {
  if (!name) return;
  try { localStorage.setItem(FFEH_CHECKER_STORAGE, name); } catch { }
}

function editFfehPoint(id, neu = false) {
  state.map.closePopup();
  if ($('ffehBar').hidden) openFfeh();
  const point = findFfehPoint(id);
  if (!point) return;
  // Aus einem offen gebliebenen Popup heraus kann ein Wechsel mitten in einer
  // Bearbeitung kommen. Der alte Punkt wird still abgeschlossen – seine Eingaben
  // sind längst gespeichert – damit Sicherung und Knöpfe zum neuen Punkt passen.
  if (state.ffeh.editingId && state.ffeh.editingId !== id) endFfehEdit();
  startFfehEdit(point, neu);
}

async function deleteFfehPoint(id) {
  const point = findFfehPoint(id);
  if (!point) return;
  if (!await confirmAction(`„${point.name || 'Punkt'}“ wirklich löschen?`)) return;
  const official = state.ffeh.repo.some(entry => entry.id === id);
  const items = loadFfehLocal().filter(item => item.id !== id);
  // Offizielle Punkte bleiben in der Datei – lokal blendet ein Tombstone sie aus.
  if (official) items.push({ id, geloescht: true, geloescht_am: new Date().toISOString() });
  saveFfehLocal(items);
  if (state.ffeh.editingId === id) endFfehEdit();
  state.map.closePopup();
  renderFfehLayer();
  toast(official ? 'Offizieller Punkt lokal ausgeblendet.' : 'Punkt gelöscht.');
}

function setFfehHint(text) { $('ffehHint').textContent = text; }

// ── Popup und Legende ─────────────────────────────────────────────────────
function ffehPopupHtml(point) {
  const category = ffehCategory(point.kategorie);
  const status = ffehStatus(point.status);
  const access = point.erreichbar_lf === true ? 'Ja' : point.erreichbar_lf === false ? 'Nein' : 'Unbekannt';
  const checked = point.geprueft_am
    ? `${formatIsoDate(point.geprueft_am)}${point.geprueft_von ? ` · ${escapeHtml(point.geprueft_von)}` : ''}`
    : 'Noch nicht geprüft';
  const rows = [
    ['Kategorie', escapeHtml(category.name)],
    ['Status', `<span class="ffeh-status-value" style="color:${status.color}">${escapeHtml(status.name)}</span>`],
    ['Mit LF anfahrbar', access],
    ['Geprüft', checked],
    ['Quelle', escapeHtml(FFEH_SOURCE_INDEX.get(point.quelle)?.name || point.quelle || '')]
  ].map(([label, value]) => `<div class="ffeh-popup-row"><span>${label}</span><strong>${value}</strong></div>`).join('');
  const description = point.beschreibung ? `<p>${escapeHtml(point.beschreibung)}</p>` : '';
  const origin = point.offiziell ? 'Offizieller Datenbestand' : 'Lokaler Entwurf auf diesem Gerät';
  return `<div class="measure-popup ffeh-popup"><strong>${escapeHtml(point.name || category.name)}</strong>`
    + `<div class="ffeh-popup-rows">${rows}</div>${description}`
    + `<div class="ffeh-origin muted">${origin}</div>`
    + coordinatePopup(point.lat, point.lng)
    + `<div class="measure-popup-actions"><button type="button" class="ffeh-edit-button" data-id="${escapeHtml(point.id)}">Bearbeiten</button><button type="button" class="ffeh-delete-button" data-id="${escapeHtml(point.id)}">Löschen</button></div></div>`;
}

function formatIsoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(String(value)) : date.toLocaleDateString('de-DE');
}

function ffehLegendItem() {
  const item = document.createElement('div');
  item.className = 'legend-item ffeh-legend';
  const title = document.createElement('strong');
  title.textContent = 'Waldbrand POI FFEH (eigene Punkte)';
  item.append(title);
  for (const status of FFEH_STATUS) {
    const row = document.createElement('div');
    row.className = 'ffeh-legend-row';
    const dot = document.createElement('span');
    dot.className = `ffeh-legend-dot${status.key === 'nicht_auffindbar' ? ' missing' : ''}`;
    dot.style.setProperty('--ffeh-status', status.color);
    const text = document.createElement('span');
    text.textContent = status.name;
    row.append(dot, text);
    item.append(row);
  }
  // Punkte aus NavLog tragen statt eines eigenen Symbols nur den Statusring.
  const ringRow = document.createElement('div');
  ringRow.className = 'ffeh-legend-row';
  const ring = document.createElement('span');
  ring.className = 'ffeh-legend-ring';
  ring.style.setProperty('--ffeh-status', ffehStatus('brauchbar').color);
  const ringText = document.createElement('span');
  ringText.textContent = 'Statusring um NavLog-Symbol';
  ringRow.append(ring, ringText);
  item.append(ringRow);
  const note = document.createElement('small');
  note.textContent = 'Farbiger Ring am Symbol = Status der Stelle. Punkte mit der Quelle „NavLog-Symbol“ bekommen kein eigenes '
    + 'Symbol, sondern nur einen offenen Statusring um das Kartensymbol: gestrichelt = offen, durchgestrichen = nicht auffindbar.';
  item.append(note);
  return item;
}

// ── Export und Import ─────────────────────────────────────────────────────
function ffehPointToFeature(point) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(point.lng.toFixed(6)), Number(point.lat.toFixed(6))] },
    properties: {
      id: point.id,
      kategorie: point.kategorie,
      name: point.name || '',
      beschreibung: point.beschreibung || '',
      status: point.status,
      quelle: point.quelle,
      erreichbar_lf: point.erreichbar_lf ?? null,
      geprueft_am: point.geprueft_am || null,
      geprueft_von: point.geprueft_von || null,
      erstellt_am: point.erstellt_am || null
    }
  };
}

// Anfahrbarkeit aus einer Datei lesen: neues Feld zuerst, sonst der Altbestand.
function ffehAccessValue(properties) {
  if (typeof properties?.erreichbar_lf === 'boolean') return properties.erreichbar_lf;
  if (typeof properties?.erreichbar_tlf === 'boolean') return properties.erreichbar_tlf;
  return null;
}

function featureToFfehPoint(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates)) return null;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const properties = feature.properties || {};
  // Fremde Dateien werden wie Nutzereingaben behandelt: alles auf Zeichenketten
  // begrenzen, damit später weder Markup noch Objekte in die Oberfläche geraten.
  return {
    id: String(properties.id || crypto.randomUUID()).slice(0, 80),
    kategorie: ffehCategory(properties.kategorie).key,
    name: String(properties.name || '').slice(0, 120),
    beschreibung: String(properties.beschreibung || '').slice(0, 500),
    status: ffehStatus(properties.status).key,
    quelle: FFEH_SOURCE_INDEX.has(properties.quelle) ? properties.quelle : 'karte',
    // Fallback auf das alte Feld „erreichbar_tlf“ aus früheren Exporten.
    erreichbar_lf: ffehAccessValue(properties),
    geprueft_am: properties.geprueft_am ? String(properties.geprueft_am).slice(0, 40) : null,
    geprueft_von: properties.geprueft_von ? String(properties.geprueft_von).slice(0, 40) : null,
    erstellt_am: properties.erstellt_am ? String(properties.erstellt_am).slice(0, 40) : new Date().toISOString(),
    lat, lng
  };
}

function exportFfehPoints() {
  const features = mergedFfehPoints().map(ffehPointToFeature);
  const data = {
    type: 'FeatureCollection',
    name: 'Waldbrand POI FFEH',
    erzeugt_am: new Date().toISOString(),
    geloescht: ffehTombstones().map(item => ({ id: item.id, geloescht: true, geloescht_am: item.geloescht_am || null })),
    features
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/geo+json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `waldbrand-poi-ffeh-${todayIso()}.geojson`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast(`${features.length} Punkte exportiert.`);
}

// Bei gleicher id gewinnt der jüngere Prüf- beziehungsweise Erstellstempel.
function ffehStamp(point) { return String(point?.geprueft_am || point?.erstellt_am || ''); }

async function importFfehFile(file) {
  let data = null;
  try { data = JSON.parse(await file.text()); }
  catch { toast('Die Datei konnte nicht gelesen werden.'); return; }
  const incoming = (Array.isArray(data?.features) ? data.features : []).map(featureToFfehPoint).filter(Boolean);
  const tombstones = (Array.isArray(data?.geloescht) ? data.geloescht : []).filter(item => item?.id);
  if (!incoming.length && !tombstones.length) { toast('Die Datei enthält keine FFEH-Punkte.'); return; }
  const local = new Map(loadFfehLocal().filter(item => item?.id).map(item => [item.id, item]));
  const current = new Map(mergedFfehPoints().map(point => [point.id, point]));
  let created = 0, updated = 0, removed = 0, unchanged = 0;
  for (const point of incoming) {
    const existing = current.get(point.id);
    if (!existing) { local.set(point.id, point); created++; }
    else if (ffehStamp(point) > ffehStamp(existing)) { local.set(point.id, point); updated++; }
    else unchanged++;
  }
  for (const stone of tombstones) {
    if (local.get(stone.id)?.geloescht || !current.has(stone.id)) { unchanged++; continue; }
    local.set(stone.id, { id: stone.id, geloescht: true, geloescht_am: stone.geloescht_am || new Date().toISOString() });
    removed++;
  }
  saveFfehLocal([...local.values()]);
  endFfehEdit();
  renderFfehLayer();
  toast(`Import: ${created} neu, ${updated} aktualisiert, ${removed} gelöscht, ${unchanged} unverändert.`);
}

// ── Straßenbezeichnungen (eigener Overlay-Layer) ───────────────────────────
// Auf der NavLog-DTK25 sind Straßennummern grün wie Schneisennamen beschriftet.
// Der Layer legt deshalb Wegweiser-Schilder und Straßennamen über die Karte –
// reine Beschriftung, keine flächige Übermalung. Die Daten kommen aus dem Repo
// und werden erst beim ersten Einschalten geladen.
const STRASSEN_DATA_URL = 'data/strassen.geojson';
// Ausdünnung: Bildschirmraster in Pixeln, pro Zelle höchstens ein Label.
const STRASSEN_RASTER = 140;
const STRASSEN_MAX_LABELS = 80;
const STRASSEN_MAX_LINIEN = 300;
const STRASSEN_MAX_KANDIDATEN = 600;
const STRASSEN_NAME_ZOOM = 15;
// Zoomstaffelung nach Bedeutung: erst A und B, dann L, dann K, zuletzt Namen.
const STRASSEN_ARTEN = {
  A: { klasse: 'autobahn', name: 'Autobahn', zoom: 11, rang: 0, farbe: '#12468f', gewicht: 4, beispiel: 'A 5' },
  B: { klasse: 'bundesstrasse', name: 'Bundesstraße', zoom: 11, rang: 1, farbe: '#a58200', gewicht: 3.5, beispiel: 'B 47' },
  L: { klasse: 'landstrasse', name: 'Landesstraße', zoom: 12, rang: 2, farbe: '#3c423d', gewicht: 3, beispiel: 'L 3261' },
  K: { klasse: 'kreisstrasse', name: 'Kreisstraße', zoom: 13, rang: 3, farbe: '#3c423d', gewicht: 2.5, beispiel: 'K 31' }
};

function initStrassen() {
  state.strassen.group = L.layerGroup();
  state.map.on('moveend zoomend resize', scheduleStrassenRefresh);
  $('strassenToggle').checked = state.config.showStrassenLayer === true;
  if ($('strassenToggle').checked) toggleStrassenLayer();
}

// Pannen und Zoomen lösen mehrere Ereignisse aus; einmal neu aufbauen genügt.
function scheduleStrassenRefresh() {
  if (!state.strassen.visible) return;
  clearTimeout(state.strassen.timer);
  state.strassen.timer = setTimeout(refreshStrassenLabels, 90);
}

async function toggleStrassenLayer() {
  state.strassen.visible = $('strassenToggle').checked;
  if (!state.strassen.group) return;
  if (!state.strassen.visible) {
    state.map.removeLayer(state.strassen.group);
    state.strassen.group.clearLayers();
    renderLegend();
    return;
  }
  const geladen = await loadStrassenData();
  if (!geladen) {
    $('strassenToggle').checked = false;
    state.strassen.visible = false;
    toast('Die Straßenbezeichnungen konnten nicht geladen werden.');
    renderLegend();
    return;
  }
  // Während des Ladens kann der Layer längst wieder ausgeschaltet worden sein.
  if (!state.strassen.visible) return;
  state.strassen.group.addTo(state.map);
  refreshStrassenLabels();
  renderLegend();
}

// Einmaliges, verzögertes Laden; parallele Aufrufe teilen sich dasselbe Promise.
function loadStrassenData() {
  if (state.strassen.features.length) return Promise.resolve(true);
  if (!state.strassen.loading) {
    state.strassen.loading = fetch(STRASSEN_DATA_URL)
      .then(response => { if (!response.ok) throw new Error(`Status ${response.status}`); return response.json(); })
      .then(data => {
        const strassen = (Array.isArray(data?.features) ? data.features : []).map(prepareStrasse).filter(Boolean);
        // Wichtige Straßen zuerst: sie belegen die Rasterzellen vor den Ortsstraßen.
        strassen.sort((a, b) => a.rang - b.rang);
        state.strassen.features = strassen;
        return strassen.length > 0;
      })
      .catch(() => false)
      .finally(() => { state.strassen.loading = null; });
  }
  return state.strassen.loading;
}

// GeoJSON-Linie in ein schlankes Objekt mit Bezeichnung, Punkten und Umring.
function prepareStrasse(feature) {
  const koordinaten = feature?.geometry?.coordinates;
  if (feature?.geometry?.type !== 'LineString' || !Array.isArray(koordinaten) || koordinaten.length < 2) return null;
  const punkte = [];
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const eintrag of koordinaten) {
    const lng = Number(eintrag?.[0]);
    const lat = Number(eintrag?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    punkte.push([lat, lng]);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
  }
  if (punkte.length < 2) return null;
  const properties = feature.properties || {};
  const ref = String(properties.ref || '').trim();
  const name = String(properties.name || '').trim();
  const kennung = ref.charAt(0).toUpperCase();
  const art = STRASSEN_ARTEN[kennung] ? kennung : null;
  const text = (art ? ref : name || ref).slice(0, 60);
  if (!text) return null;
  return {
    text, punkte, art,
    minZoom: art ? STRASSEN_ARTEN[art].zoom : STRASSEN_NAME_ZOOM,
    rang: art ? STRASSEN_ARTEN[art].rang : 9,
    minLat, maxLat, minLng, maxLng
  };
}

// Kompletter Neuaufbau je Kartenausschnitt: nur sichtbare Straßen, gestaffelt
// nach Zoomstufe und ausgedünnt über das Bildschirmraster.
function refreshStrassenLabels() {
  const strassen = state.strassen;
  if (!state.map || !strassen.group || !strassen.visible) return;
  strassen.group.clearLayers();
  if (!strassen.features.length) return;
  const zoom = state.map.getZoom();
  const bounds = state.map.getBounds().pad(0.15);
  const kandidaten = [];
  let linien = 0;
  for (const strasse of strassen.features) {
    if (zoom < strasse.minZoom || !strasseInBounds(strasse, bounds)) continue;
    // Dezente Linie nur für nummerierte Straßen, damit der Verlauf erkennbar ist.
    if (strasse.art && linien < STRASSEN_MAX_LINIEN) {
      L.polyline(strasse.punkte, strassenLinienStil(strasse.art)).addTo(strassen.group);
      linien++;
    }
    if (kandidaten.length >= STRASSEN_MAX_KANDIDATEN) continue;
    const anker = strassenAnker(strasse, bounds);
    if (anker) kandidaten.push({ strasse, anker, punkt: state.map.latLngToContainerPoint(anker) });
  }
  for (const kandidat of waehleStrassenLabels(kandidaten)) {
    L.marker(kandidat.anker, { icon: strassenIcon(kandidat.strasse), interactive: false, keyboard: false, pane: 'strassenPane' }).addTo(strassen.group);
  }
}

function strasseInBounds(strasse, bounds) {
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();
  return strasse.maxLat >= southWest.lat && strasse.minLat <= northEast.lat
    && strasse.maxLng >= southWest.lng && strasse.minLng <= northEast.lng;
}

// Beschriftet wird die Mitte eines Segments, das im Ausschnitt liegt.
function strassenAnker(strasse, bounds) {
  const mitten = [];
  for (let i = 1; i < strasse.punkte.length; i++) {
    const mitte = [(strasse.punkte[i - 1][0] + strasse.punkte[i][0]) / 2, (strasse.punkte[i - 1][1] + strasse.punkte[i][1]) / 2];
    if (bounds.contains(mitte)) mitten.push(mitte);
  }
  if (mitten.length) return mitten[Math.floor(mitten.length / 2)];
  return strasse.punkte.find(punkt => bounds.contains(punkt)) || null;
}

function strassenZelle(punkt, groesse = STRASSEN_RASTER) {
  return `${Math.floor(punkt.x / groesse)}:${Math.floor(punkt.y / groesse)}`;
}

// Ausdünnung: pro Rasterzelle höchstens ein Label, in Reihenfolge der Kandidaten
// (nach Rang sortiert). So gewinnen A und B vor Ortsstraßennamen.
function waehleStrassenLabels(kandidaten, maxLabels = STRASSEN_MAX_LABELS) {
  const belegt = new Set();
  const gewaehlt = [];
  for (const kandidat of kandidaten) {
    if (gewaehlt.length >= maxLabels) break;
    const zelle = strassenZelle(kandidat.punkt);
    if (belegt.has(zelle)) continue;
    belegt.add(zelle);
    gewaehlt.push(kandidat);
  }
  return gewaehlt;
}

function strassenLinienStil(art) {
  const info = STRASSEN_ARTEN[art];
  return { color: info.farbe, weight: info.gewicht, opacity: 0.38, lineCap: 'round', lineJoin: 'round', smoothFactor: 2, interactive: false, pane: 'strassenPane' };
}

function strassenIcon(strasse) {
  const html = strasse.art
    ? `<span class="strassen-badge ${STRASSEN_ARTEN[strasse.art].klasse}">${escapeHtml(strasse.text)}</span>`
    : `<span class="strassen-name">${escapeHtml(strasse.text)}</span>`;
  return L.divIcon({ className: 'strassen-label', iconSize: null, html });
}

function strassenLegendItem() {
  const item = document.createElement('div');
  item.className = 'legend-item strassen-legend';
  const title = document.createElement('strong');
  title.textContent = 'Straßenbezeichnungen';
  item.append(title);
  for (const art of ['A', 'B', 'L']) {
    const info = STRASSEN_ARTEN[art];
    const row = document.createElement('div');
    row.className = 'strassen-legend-row';
    const badge = document.createElement('span');
    badge.className = `strassen-badge ${info.klasse}`;
    badge.textContent = info.beispiel;
    const text = document.createElement('span');
    text.textContent = art === 'L' ? 'Landes- und Kreisstraße' : info.name;
    row.append(badge, text);
    item.append(row);
  }
  const note = document.createElement('small');
  note.textContent = 'Ortsstraßennamen erscheinen ab Zoomstufe 15 als dunkler Text mit weißem Rand.';
  item.append(note);
  return item;
}

// ── Wind und Wetter (Open-Meteo, ohne API-Schlüssel) ───────────────────────
const WEATHER_STORAGE = 'navlog-ipad-weather';

function toggleWeather() {
  if ($('weatherBox').hidden) {
    $('weatherBox').hidden = false;
    $('weatherButton').setAttribute('aria-expanded', 'true');
    closePanel();
    closeAppMenu();
    const cached = loadWeatherCache();
    if (cached) renderWeather(cached, true);
    refreshWeather();
  } else {
    closeWeather();
  }
}

function closeWeather() {
  $('weatherBox').hidden = true;
  $('weatherButton').setAttribute('aria-expanded', 'false');
  removeWindMarker();
}

function loadWeatherCache() {
  try {
    const entry = JSON.parse(localStorage.getItem(WEATHER_STORAGE) || 'null');
    return entry?.data?.current ? entry : null;
  } catch { return null; }
}

async function refreshWeather() {
  const center = state.map.getCenter();
  $('weatherMeta').textContent = 'Wetterdaten werden geladen …';
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: center.lat.toFixed(4), longitude: center.lng.toFixed(4),
      current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      hourly: 'wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      wind_speed_unit: 'kmh', timezone: 'auto', forecast_days: '2'
    });
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Wetterdienst antwortet mit Status ${response.status}`);
    const data = await response.json();
    if (!data?.current) throw new Error('Unerwartete Antwort des Wetterdienstes.');
    const entry = { fetchedAt: Date.now(), lat: center.lat, lon: center.lng, data };
    try { localStorage.setItem(WEATHER_STORAGE, JSON.stringify(entry)); } catch { }
    renderWeather(entry, false);
  } catch {
    const cached = loadWeatherCache();
    if (cached) {
      renderWeather(cached, true);
      toast('Wetterdaten momentan nicht abrufbar – letzter gespeicherter Stand wird angezeigt.');
    } else {
      $('weatherContent').innerHTML = '<p class="error">Wetterdaten konnten nicht geladen werden. Bitte Internetverbindung prüfen.</p>';
      $('weatherMeta').textContent = '';
    }
  }
}

function renderWeather(entry, stale) {
  const current = entry.data.current;
  const windFrom = current.wind_direction_10m;
  const windTo = (windFrom + 180) % 360;
  let html = `<div class="weather-wind">${windArrowSvg(windTo, 'big')}<div><strong>Wind aus ${compassLabel(windFrom)} (${Math.round(windFrom)}°)</strong><span>weht nach ${compassLabel(windTo)} · ${Math.round(current.wind_speed_10m)} km/h, Böen ${Math.round(current.wind_gusts_10m)} km/h</span></div></div>`;
  html += '<div class="weather-current">'
    + weatherTile(`${String(current.temperature_2m).replace('.', ',')} °C`, 'Temperatur')
    + weatherTile(`${Math.round(current.relative_humidity_2m)} %`, 'Luftfeuchte')
    + weatherTile(`${String(current.precipitation).replace('.', ',')} mm`, 'Niederschlag')
    + '</div>';

  const hourly = entry.data.hourly;
  let rows = '';
  let shiftNotice = '';
  const start = hourly?.time ? hourly.time.findIndex(time => time > current.time) : -1;
  if (start >= 0) {
    for (let i = start; i < Math.min(start + 12, hourly.time.length); i++) {
      const hourFrom = hourly.wind_direction_10m[i];
      const warn = angleDiff(hourFrom, windFrom) > 45;
      if (warn && !shiftNotice) shiftNotice = `Winddrehung angekündigt: gegen ${hourly.time[i].slice(11, 16)} Uhr auf Wind aus ${compassLabel(hourFrom)}.`;
      rows += `<div class="forecast-row${warn ? ' warn' : ''}"><span>${hourly.time[i].slice(11, 16)}</span>${windArrowSvg((hourFrom + 180) % 360)}<span>aus ${compassLabel(hourFrom)}</span><span>${Math.round(hourly.wind_speed_10m[i])} / ${Math.round(hourly.wind_gusts_10m[i])} km/h</span></div>`;
    }
  }
  if (shiftNotice) html += `<p class="weather-note warn">⚠ ${shiftNotice}</p>`;
  if (rows) html += `<div class="weather-forecast"><h3>Wind – nächste 12 Stunden (Mittel / Böen)</h3>${rows}</div>`;
  $('weatherContent').innerHTML = html;

  const time = new Date(entry.fetchedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  $('weatherMeta').textContent = `Kartenmitte ${entry.lat.toFixed(3)}, ${entry.lon.toFixed(3)} · Stand ${time} Uhr${stale ? ' · möglicherweise nicht aktuell' : ''}`;
  $('weatherMeta').classList.toggle('warn', Boolean(stale));
  updateWindMarker(entry, windTo);
}

function weatherTile(value, label) {
  return `<div class="weather-tile"><strong>${value}</strong><span>${label}</span></div>`;
}

function windArrowSvg(degreesTo, extraClass = '') {
  return `<svg class="wind-arrow ${extraClass}" viewBox="0 0 24 24" aria-hidden="true" style="transform:rotate(${Math.round(degreesTo)}deg)"><path fill="currentColor" d="M12 2 18.5 20 12 15.6 5.5 20Z"/></svg>`;
}

function compassLabel(degrees) {
  return ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

function angleDiff(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function updateWindMarker(entry, degreesTo) {
  removeWindMarker();
  const icon = L.divIcon({ className: 'wind-map-marker', iconSize: [44, 44], html: windArrowSvg(degreesTo, 'map') });
  state.weather.marker = L.marker([entry.lat, entry.lon], { icon, interactive: false }).addTo(state.map);
}

function removeWindMarker() {
  if (state.weather.marker) { state.map.removeLayer(state.weather.marker); state.weather.marker = null; }
}

function setStatus(text) { $('status').textContent = text; }
let toastTimer;
function toast(text) { clearTimeout(toastTimer); $('toast').textContent = text; $('toast').classList.add('show'); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4200); }
function escapeHtml(text) { const node = document.createElement('span'); node.textContent = text; return node.innerHTML; }
// Für Attributwerte reicht escapeHtml nicht: Anführungszeichen bleiben dort
// stehen und würden ein Attribut vorzeitig schließen (JSON besteht daraus).
function escapeAttribute(text) { return escapeHtml(text).replace(/"/g, '&quot;'); }

window.addEventListener('beforeprint', () => {
  renderLegend();
  state.map?.invalidateSize(false);
  // Der Druckausschnitt ist schmaler – Schilder für die neue Größe neu setzen.
  refreshStrassenLabels();
});
window.addEventListener('afterprint', () => setTimeout(() => state.map?.invalidateSize(false), 50));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  // Kachel-Statistik aus dem Service Worker: zeigt im ⋮-Menü, wie viele
  // Kacheln aus dem Speicher kamen – der Beleg, ob der Kachel-Cache greift.
  navigator.serviceWorker.addEventListener('message', event => {
    const daten = event.data;
    if (daten?.typ !== 'kachelStatistik') return;
    const feld = $('tileCacheStat');
    if (!feld) return;
    const fehler = daten.ablageFehler ? ` · ${daten.ablageFehler} Ablagefehler` : '';
    feld.textContent = `Kacheln seit App-Start: ${daten.treffer} aus Speicher · ${daten.netz} aus Netz${fehler}`;
    feld.hidden = false;
  });
}
