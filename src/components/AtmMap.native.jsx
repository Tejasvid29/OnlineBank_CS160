import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../theme';

const hasCoords = (atm) => atm.latitude != null && atm.longitude != null && Number.isFinite(Number(atm.latitude)) && Number.isFinite(Number(atm.longitude));

// Leaflet (pinned) runs inside the WebView; React Native pushes data in with window.setData(...) and receives marker taps via postMessage.
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0}</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var map = L.map('map', { zoomControl: true }).setView([37.7749, -122.4194], 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
var layer = L.layerGroup().addTo(map);
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
window.setData = function (data) {
  layer.clearLayers();
  var points = [];
  data.atms.forEach(function (atm) {
    var selected = atm.id === data.selectedId;
    var marker = L.circleMarker([atm.latitude, atm.longitude], { radius: selected ? 12 : 9, color: '#fff', weight: 2, fillColor: selected ? '${colors.navy}' : '${colors.blue}', fillOpacity: 1 });
    marker.bindPopup('<b>' + esc(atm.name) + '</b><br>' + esc(atm.address));
    marker.on('click', function () { window.ReactNativeWebView.postMessage(JSON.stringify({ select: atm.id })); });
    marker.addTo(layer);
    points.push([atm.latitude, atm.longitude]);
  });
  if (data.origin) {
    L.circleMarker([data.origin.latitude, data.origin.longitude], { radius: 8, color: '#fff', weight: 2, fillColor: '${colors.green}', fillOpacity: 1 }).bindPopup('You are here').addTo(layer);
    points.push([data.origin.latitude, data.origin.longitude]);
  }
  if (data.fit && points.length === 1) map.setView(points[0], 15);
  else if (data.fit && points.length) map.fitBounds(points, { padding: [32, 32], maxZoom: 16 });
};
window.ReactNativeWebView.postMessage(JSON.stringify({ ready: true }));
</script></body></html>`;

// Native map: Leaflet + OpenStreetMap tiles inside a WebView (needs network for the Leaflet files and tiles).
export function AtmMap({ atms, origin, selectedId, onSelect, height = 260 }) {
  const webview = useRef(null);
  const [ready, setReady] = useState(false);
  const fitKey = useRef('');
  const mapped = atms.filter(hasCoords).map(({ id, name, address, latitude, longitude }) => ({ id, name, address, latitude: Number(latitude), longitude: Number(longitude) }));

  useEffect(() => {
    if (!ready || !webview.current) return;
    // Only re-fit the view when the result set changes, not when a marker is selected.
    const key = mapped.map((atm) => atm.id).join(',') + JSON.stringify(origin);
    const fit = key !== fitKey.current;
    fitKey.current = key;
    webview.current.injectJavaScript(`window.setData(${JSON.stringify({ atms: mapped, origin, selectedId, fit })}); true;`);
  }, [ready, atms, origin, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function onMessage(event) {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.ready) setReady(true);
      else if (message.select != null && onSelect) onSelect(message.select);
    } catch { /* Ignore malformed messages. */ }
  }

  return <View testID="atm-map" style={{ height, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
    <WebView ref={webview} originWhitelist={['*']} source={{ html: PAGE }} onMessage={onMessage} javaScriptEnabled domStorageEnabled nestedScrollEnabled />
  </View>;
}
