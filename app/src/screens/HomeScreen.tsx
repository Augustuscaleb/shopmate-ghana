import { StyleSheet, Text, View } from 'react-native';
import { Button, Notice, Screen } from '../ui/components';
import { colours, space, type } from '../ui/theme';
import type { Business, Device } from '../services/account';

/** Stage 1B placeholder for S-10 Today. Business features start in later stages. */
export function HomeScreen({ business, device, onSignOut }: { business: Business; device: Device; onSignOut: () => void }) {
  return (
    <Screen title={business.name} subtitle="You're set up. Sales, stock and customers come in the next stages.">
      <View style={styles.card}>
        <Row label="Shop reference" value={business.reference_code} />
        <Row label="This phone" value={`Device ${device.deviceCode}`} />
        <Row label="Plan" value="Pilot (all features free)" />
      </View>
      <Notice text="Test version: please use made-up data only until the pilot starts." />
      <Button label="Log out" kind="secondary" onPress={onSignOut} />
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colours.surface, borderColor: colours.sand, borderWidth: 1, borderRadius: 12, padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  label: { fontSize: type.body, color: colours.stone },
  value: { fontSize: type.body, fontWeight: '700', color: colours.ink },
});
