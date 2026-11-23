import { StyleSheet, Text, View } from 'react-native';

/**
 * Small line icons drawn with plain views, so no icon font or new dependency is needed.
 * They are always shown next to a text label (D-04: never icon-only). If Material Symbols
 * are adopted later (spec 08 §6), these can be swapped one for one.
 */
type IconProps = { colour: string; size?: number };

/** Dashboard: four tiles. */
export function GridIcon({ colour, size = 24 }: IconProps) {
  const cell = size * 0.4;
  return (
    <View style={[styles.box, { width: size, height: size }]} accessible={false}>
      <View style={[styles.wrapRow, { gap: size * 0.12, width: size * 0.92 }]}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: cell, height: cell, borderRadius: size * 0.1, borderWidth: 2, borderColor: colour }} />
        ))}
      </View>
    </View>
  );
}

/** Sales: a receipt with lines. */
export function ReceiptIcon({ colour, size = 24 }: IconProps) {
  return (
    <View style={[styles.box, { width: size, height: size }]} accessible={false}>
      <View style={{ width: size * 0.7, height: size * 0.88, borderWidth: 2, borderColor: colour, borderRadius: size * 0.1, padding: size * 0.1, gap: size * 0.1, justifyContent: 'center' }}>
        {[0.85, 1, 0.6].map((w, i) => (
          <View key={i} style={{ height: 2, width: `${w * 100}%`, backgroundColor: colour, borderRadius: 1 }} />
        ))}
      </View>
    </View>
  );
}

/** Stock: a box with a lid band. */
export function BoxIcon({ colour, size = 24 }: IconProps) {
  return (
    <View style={[styles.box, { width: size, height: size }]} accessible={false}>
      <View style={{ width: size * 0.86, height: size * 0.76, borderWidth: 2, borderColor: colour, borderRadius: size * 0.08, alignItems: 'center' }}>
        <View style={{ width: '100%', height: size * 0.22, borderBottomWidth: 2, borderColor: colour }} />
        <View style={{ width: size * 0.26, height: 2, backgroundColor: colour, marginTop: size * 0.1, borderRadius: 1 }} />
      </View>
    </View>
  );
}

/** Reports: three bars. */
export function BarsIcon({ colour, size = 24 }: IconProps) {
  const bar = size * 0.2;
  return (
    <View style={[styles.box, { width: size, height: size, flexDirection: 'row', alignItems: 'flex-end', gap: size * 0.1, paddingBottom: size * 0.08 }]} accessible={false}>
      {[0.45, 0.8, 0.6].map((h, i) => (
        <View key={i} style={{ width: bar, height: size * h, backgroundColor: colour, borderRadius: size * 0.06 }} />
      ))}
    </View>
  );
}

/** Add: a plus sign. */
export function PlusIcon({ colour, size = 24 }: IconProps) {
  const t = Math.max(2, size * 0.12);
  return (
    <View style={[styles.box, { width: size, height: size }]} accessible={false}>
      <View style={{ position: 'absolute', width: size * 0.7, height: t, backgroundColor: colour, borderRadius: t }} />
      <View style={{ position: 'absolute', width: t, height: size * 0.7, backgroundColor: colour, borderRadius: t }} />
    </View>
  );
}

/** Attention: an exclamation mark in a circle (always paired with words). */
export function AlertIcon({ colour, size = 24 }: IconProps) {
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: colour }]} accessible={false}>
      <Text style={{ color: colour, fontWeight: '800', fontSize: size * 0.6, lineHeight: size * 0.75 }} allowFontScaling={false}>!</Text>
    </View>
  );
}

/** Back: a chevron. */
export function ChevronLeftIcon({ colour, size = 24 }: IconProps) {
  const arm = size * 0.42;
  return (
    <View style={[styles.box, { width: size, height: size }]} accessible={false}>
      <View style={{ width: arm, height: arm, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderColor: colour, transform: [{ rotate: '45deg' }], marginLeft: size * 0.15 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
});
