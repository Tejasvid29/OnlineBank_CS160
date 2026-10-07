import React, { useState } from 'react';
import { Alert, Linking, Platform, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { colors } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Field, Icon, LinkButton, SectionHeading } from '../src/ui/primitives';
import { useApp } from '../src/state/AppState';

const googleDirections = (destination) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;

// Open turn-by-turn directions in the platform's maps app: Apple Maps on iOS, Google Maps on Android
// (the https link opens the app when installed, the browser otherwise).
async function openDirections(atm) {
  const destination = atm.latitude != null && atm.longitude != null ? `${atm.latitude},${atm.longitude}` : atm.address;
  const url = Platform.OS === 'ios' ? `maps://?daddr=${encodeURIComponent(destination)}` : googleDirections(destination);
  try { await Linking.openURL(url); } catch { await Linking.openURL(googleDirections(destination)); }
}

// Native ATM search: current location or a typed place, results in one list card. Notices appear as the shell's toast.
export default function Atms() {
  const { atmSearch, setAtmSearch, findAtms, findAtmsNear, busy, atms, setNotice } = useApp();
  const [locating, setLocating] = useState(false);

  async function locateMe() {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        if (permission.canAskAgain) setNotice('Location access is needed to find ATMs near you. You can still search by place.');
        else Alert.alert('Location access is off', 'Allow location access for CS160 Bank in Settings, or search by city, ZIP, or address.', [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }]);
        return;
      }
      const position = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 }) || await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      let label;
      try {
        const [place] = await Location.reverseGeocodeAsync(position.coords);
        label = place ? [place.city, place.region].filter(Boolean).join(', ') : undefined;
      } catch { /* The ATM search does not need a place name. */ }
      await findAtmsNear(position.coords, label);
    } catch { setNotice('Your location is not available. Check that location services are turned on.'); }
    finally { setLocating(false); }
  }

  return <>
    <SectionHeading title="Find an ATM" />
    <Action variant="secondary" onPress={locateMe} disabled={busy || locating} icon="locate-outline" style={[styles.nativeFullAction, { marginBottom: 16 }]}>{locating ? 'Finding your location…' : 'Use my current location'}</Action>
    <Field label="Or search by place" value={atmSearch} onChangeText={setAtmSearch} placeholder="City, ZIP, or address" />
    <Action onPress={findAtms} disabled={busy || locating} icon="search-outline" style={[styles.nativeFullAction, { marginBottom: 16 }]}>{busy && !locating ? 'Searching…' : 'Search ATMs'}</Action>
    <Card style={styles.nativeListCard}>
      {atms.length ? atms.map((atm) => <View key={atm.id} style={styles.atmRow}>
        <View style={styles.atmIcon}><Icon name="location-outline" size={22} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{atm.name}</Text>
          <Text style={styles.rowSub}>{atm.address}</Text>
          <Text style={[styles.rowSub, { color: colors.green }]}>{atm.hours}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.distance}>{atm.distance || 'Nearby'}</Text>
          <LinkButton onPress={() => openDirections(atm)} icon="navigate-outline">Directions</LinkButton>
        </View>
      </View>) : <Text style={styles.emptyText}>No ATMs found for this location.</Text>}
    </Card>
  </>;
}
