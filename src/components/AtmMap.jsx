import React, { useEffect } from 'react';
import { View } from 'react-native';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { colors } from '../theme';

const hasCoords = (atm) => Number.isFinite(Number(atm.latitude)) && atm.latitude !== null && Number.isFinite(Number(atm.longitude)) && atm.longitude !== null;
const FALLBACK_CENTER = [37.7749, -122.4194];

// Re-fit the view to the ATMs (and the user's position) whenever the results change.
function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(points, { padding: [32, 32], maxZoom: 16 });
  }, [map, points]);
  return null;
}

// Web map: Leaflet + OpenStreetMap tiles. ATMs are circle markers (no image assets needed); the user's position is green.
export function AtmMap({ atms, origin, selectedId, onSelect, height = 380 }) {
  const mapped = atms.filter(hasCoords);
  const points = [...mapped.map((atm) => [Number(atm.latitude), Number(atm.longitude)]), ...(origin ? [[origin.latitude, origin.longitude]] : [])];
  const key = points.map((point) => point.join(',')).join('|');
  const stablePoints = React.useMemo(() => points, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return <View testID="atm-map" style={{ height, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
    <MapContainer center={stablePoints[0] || FALLBACK_CENTER} zoom={13} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <FitBounds points={stablePoints} />
      {mapped.map((atm) => {
        const selected = atm.id === selectedId;
        return <CircleMarker key={atm.id} center={[Number(atm.latitude), Number(atm.longitude)]} radius={selected ? 12 : 9}
          pathOptions={{ color: colors.white, weight: 2, fillColor: selected ? colors.navy : colors.blue, fillOpacity: 1 }}
          eventHandlers={{ click: () => onSelect && onSelect(atm.id) }}>
          <Popup><strong>{atm.name}</strong><br />{atm.address}</Popup>
        </CircleMarker>;
      })}
      {origin && <CircleMarker center={[origin.latitude, origin.longitude]} radius={8} pathOptions={{ color: colors.white, weight: 2, fillColor: colors.green, fillOpacity: 1 }}><Popup>You are here</Popup></CircleMarker>}
    </MapContainer>
  </View>;
}
