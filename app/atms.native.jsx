import React from 'react';
import { Linking, Text, View } from 'react-native';
import { colors } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Field, Icon, LinkButton, SectionHeading } from '../src/ui/primitives';
import { useApp } from '../src/state/AppState';

// Native ATM search: search field and button on the canvas, results in one list card. Notices appear as the shell's toast.
export default function Atms() {
  const { atmSearch, setAtmSearch, findAtms, busy, atms } = useApp();

  return <>
    <SectionHeading title="Find an ATM" />
    <Field label="Location" value={atmSearch} onChangeText={setAtmSearch} placeholder="City, ZIP, or address" />
    <Action onPress={findAtms} disabled={busy} icon="search-outline" style={[styles.nativeFullAction, { marginBottom: 16 }]}>{busy ? 'Searching…' : 'Search ATMs'}</Action>
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
          <LinkButton onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(atm.address)}`)} icon="open-outline">Directions</LinkButton>
        </View>
      </View>) : <Text style={styles.emptyText}>No ATMs found for this location.</Text>}
    </Card>
  </>;
}
