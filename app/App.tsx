import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { readConfig } from './src/config/env';

// Stage 1 placeholder screen. Real screens (03-screens.md) start in Stage 2.
const colours = {
  shopGreen: '#0B6B4F',
  warmWhite: '#FAF8F3',
  ink: '#1C1B19',
  stone: '#5A5550',
  danger: '#B42318',
};

export default function App() {
  const config = readConfig();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ShopMate Ghana</Text>
      <Text style={styles.subtitle}>Project foundation (Stage 1)</Text>
      {config.ok ? (
        <Text style={styles.ok}>Configuration found.</Text>
      ) : (
        config.problems.map((problem) => (
          <Text key={problem} style={styles.problem}>
            {problem}
          </Text>
        ))
      )}
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colours.warmWhite,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  title: { fontSize: 28, fontWeight: '700', color: colours.shopGreen },
  subtitle: { fontSize: 16, color: colours.stone, marginTop: 4, marginBottom: 16 },
  ok: { fontSize: 16, color: colours.ink },
  problem: { fontSize: 16, color: colours.danger, textAlign: 'center', marginTop: 4 },
});
