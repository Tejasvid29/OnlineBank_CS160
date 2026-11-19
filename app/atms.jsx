import React, { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { colors } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Field, Icon, LinkButton, Notice, SectionHeading } from '../src/ui/primitives';
import { AtmTerminal } from '../src/components/AtmTerminal';
import { AtmMap } from '../src/components/AtmMap';
import { useApp } from '../src/state/AppState';

export default function Atms() {
  const { notice, atmSearch, setAtmSearch, findAtms, findAtmsNear, busy, compact, atms, atmOrigin, setNotice } = useApp();
  const [locating, setLocating] = useState(false);
  const [atmInUse, setAtmInUse] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // Browser geolocation: asks the user for permission, then searches around their coordinates.
  function locateMe() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setNotice('Your browser does not support location. Search by city, ZIP, or address instead.'); return; }
    setLocating(true); setNotice('');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => { try { await findAtmsNear(coords); } finally { setLocating(false); } },
      (error) => {
        setLocating(false);
        setNotice(error.code === 1 ? 'Location access is blocked. Allow it in your browser settings, or search by city, ZIP, or address.' : 'Your location is not available. Search by city, ZIP, or address instead.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  }

  return <>
    <SectionHeading title="Find an ATM" subtitle="Search by city, ZIP code, or street address, or use your current location." />
    <Notice text={notice} kind={notice.includes('sample') ? 'info' : 'error'} />
    <Card>
      <View style={[styles.searchRow, compact && styles.stack]}>
        <View style={{ flex: 1 }}><Field label="Location" value={atmSearch} onChangeText={setAtmSearch} placeholder="City, ZIP, or address" /></View>
        <Action onPress={findAtms} disabled={busy || locating} icon="search-outline" style={{ marginTop: compact ? 0 : 23 }}>{busy && !locating ? 'Searching…' : 'Search ATMs'}</Action>
        <Action variant="secondary" onPress={locateMe} disabled={busy || locating} icon="locate-outline" style={{ marginTop: compact ? 0 : 23 }}>{locating ? 'Finding your location…' : 'Use my current location'}</Action>
      </View>
    </Card>
    <View style={{ flexDirection: compact ? 'column-reverse' : 'row', gap: 16, alignItems: 'flex-start' }}>
    <Card style={{ flex: 1, width: compact ? '100%' : undefined }}>
      {atms.length ? atms.map((atm) => <React.Fragment key={atm.id}><View style={[styles.atmRow, atm.id === selectedId && { backgroundColor: colors.sky }]}>
        <View style={styles.atmIcon}><Icon name="location-outline" size={22} /></View>
        <Pressable style={{ flex: 1 }} onPress={() => setSelectedId(atm.id)}>
          <Text style={styles.rowTitle}>{atm.name}</Text>
          <Text style={styles.rowSub}>{atm.address}</Text>
          <Text style={[styles.rowSub, { color: colors.green }]}>{atm.hours}</Text>
        </Pressable>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.distance}>{atm.distance || 'Nearby'}</Text>
          <LinkButton onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(atm.latitude != null && atm.longitude != null ? `${atm.latitude},${atm.longitude}` : atm.address)}`)} icon="open-outline">Directions</LinkButton>
          <LinkButton onPress={() => setAtmInUse(atmInUse === atm.id ? null : atm.id)} icon="card-outline">{atmInUse === atm.id ? 'Leave ATM' : 'Use this ATM'}</LinkButton>
        </View>
      </View>
      {atmInUse === atm.id && <AtmTerminal atm={atm} onClose={() => setAtmInUse(null)} />}</React.Fragment>) : <Text style={styles.emptyText}>No ATMs found for this location.</Text>}
    </Card>
    <View style={{ flex: 1, width: compact ? '100%' : undefined }}><AtmMap atms={atms} origin={atmOrigin} selectedId={selectedId} onSelect={setSelectedId} height={compact ? 280 : 420} /></View>
    </View>
    <Text style={[styles.rowSub, { marginTop: 8 }]}>Powered by Geoapify · © OpenStreetMap contributors</Text>
  </>;
}
