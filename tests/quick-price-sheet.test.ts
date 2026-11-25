/**
 * iPhone quick price change fix (S-32): a static guard on QuickPriceSheet's source.
 * The app has no React Native renderer in its tests, so the iOS keyboard and layout behaviour
 * itself needs the physical iPhone check; this test stops the known cause from coming back and
 * checks the save path is unchanged.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '../app/src/screens/products/ProductListScreen.tsx'), 'utf8');
const sheet = source.slice(source.indexOf('function QuickPriceSheet('), source.indexOf('const styles = StyleSheet.create('));
const styles = source.slice(source.indexOf('const styles = StyleSheet.create('));

describe('Quick price sheet (iPhone fix)', () => {
  it('QPS-01: the price field does not focus itself when the sheet opens (the iPhone number pad displaced the sheet)', () => {
    const field = sheet.match(/<Field label="New selling price \(GH₵\)"[\s\S]*?\/>/);
    expect(field).not.toBeNull();
    expect(field![0]).toContain('keyboardType="decimal-pad"');
    expect(field![0]).not.toMatch(/\bautoFocus\b/);
    // Nothing else in the sheet focuses the field programmatically either
    expect(sheet).not.toMatch(/\.focus\(\)/);
  });

  it('QPS-02: the sheet is bounded and scrolls, so the keyboard cannot push the field or buttons out of view', () => {
    expect(sheet).toMatch(/<FadeIn style=\{styles\.sheet\}>\s*<ScrollView contentContainerStyle=\{styles\.sheetContent\} keyboardShouldPersistTaps="handled"/);
    expect(styles).toMatch(/\bsheet: \{[^}]*maxHeight: '100%'/);
    expect(styles).toMatch(/\bsheetContent: \{[^}]*padding: space\.lg/);
    // iOS keeps the keyboard avoidance; Android is unchanged (no behaviour)
    expect(sheet).toContain("<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>");
  });

  it('QPS-03: the save logic and the ways to close the sheet are unchanged', () => {
    expect(sheet).toContain('const res = await products.changeSellingPrice(businessId, base, checked.value);');
    expect(sheet).toContain("if (res.ok) { onSaved(base, checked.value); return; }");
    expect(sheet).toContain('<Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>');
    expect(sheet).toContain('<Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={onClose} />');
    expect(sheet).toContain('<Button label="Cancel" kind="link" onPress={onClose} />');
  });
});
