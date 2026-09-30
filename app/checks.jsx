import React from 'react';
import { Text, View } from 'react-native';
import { styles } from '../src/styles/appStyles';
import { Card, Icon, SectionHeading } from '../src/ui/primitives';

export default function Checks() {
  return <>
    <SectionHeading title="Deposit checks" subtitle="Check deposit is available in the mobile app." />
    <Card style={styles.infoCard}>
      <Icon name="phone-portrait-outline" size={27} />
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>Use your phone to deposit a check</Text>
        <Text style={styles.bodyText}>The project design reserves image capture and check processing for mobile. Sign in to the mobile app, photograph the front and back of the check, and follow the review steps there.</Text>
      </View>
    </Card>
  </>;
}
