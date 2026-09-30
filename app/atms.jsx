import React from 'react';
import { Linking, Text, View } from 'react-native';
import { colors } from '../src/theme';
import { styles } from '../src/styles/appStyles';
import { Action, Card, Divider, Field, Icon, LinkButton, Notice, SectionHeading } from '../src/ui/primitives';
import { useApp } from '../src/state/AppState';

export default function Atms() {
  const { notice, atmSearch, setAtmSearch, findAtms, busy, compact, atms } = useApp();

  return <>
    <SectionHeading title="Find an ATM" subtitle="Search by city, ZIP code, or street address." />
    <Notice text={notice} kind={notice.includes('sample') ? 'info' : 'error'} />
    <Card>
      <View style={[styles.searchRow, compact && styles.stack]}>
        <View style={{ flex: 1 }}><Field label="Location" value={atmSearch} onChangeText={setAtmSearch} placeholder="City, ZIP, or address" /></View>
        <Action onPress={findAtms} disabled={busy} icon="search-outline" style={{ marginTop: compact ? 0 : 23 }}>{busy ? 'Searching…' : 'Search ATMs'}</Action>
      </View>
      <Divider />
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
