/**
 * Component gallery (Stage 1C-3.2) — the deliverable for the owner's physical review, Checkpoint
 * C-1b, on the Galaxy A06 and the iPhone. DEVELOPMENT ONLY: it is reachable only when `__DEV__`
 * is true (Expo Go or a development build connected to the development server), from a row in
 * the More tab; release builds never show it.
 *
 * It shows every v2 token and kit component in its states, the owner's control hierarchy (B-4),
 * the light header with the B-3 Edit pencil, the contrast table, the icon set, layout classes and
 * motion — with a live readout of the screen size in dp, the layout class, the text scale and
 * Reduce Motion, so it can be checked at 100 %, 130 % and the largest text size. All data shown is
 * fictitious. Nothing here reads or writes shop data.
 */
import { useRef, useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { FadeIn, PressableScale } from '../../ui/animated';
import { motion } from '../../ui/motion';
import { useReducedMotion } from '../../ui/useReducedMotion';
import {
  AppText, BackButton, Banner, Button, Card, Chip, Divider, EmptyState, IconButton, ListRow, ScreenHeader, SectionHeader, Sheet,
  SkeletonRow, SkeletonStat, SkeletonText, Stat, StatusBadge, TextAction, TextField, UpdatedLine, useLayout, useToast,
  allowsTwoPanes, figuresPerRow, BREAKPOINTS, color, control, radius, space, text, type TextVariant,
} from '../../ui/kit';
import { BoxIcon, CloseIcon, EditIcon, ICONS, InfoIcon, PlusIcon, SearchIcon } from '../../ui/kit/icons';
import { FAILING_PAIRS, KIT_PAIRS, contrastRatio, minimumFor, passes } from '../../ui/kit/contrast';
import { parseCedis } from '../../lib/money';

const SECTIONS = [
  'Overview', 'Hierarchy', 'Buttons', 'Icon actions', 'Header', 'Inputs', 'Chips', 'Cards', 'Rows',
  'Banners', 'Feedback', 'Loading', 'Sheet', 'Typography', 'Colour', 'Contrast', 'Icons', 'Spacing', 'Layout', 'Motion',
] as const;
type Section = (typeof SECTIONS)[number];

export function ComponentGallery({ onClose }: { onClose: () => void }) {
  const layout = useLayout();
  const reduced = useReducedMotion();
  const { show, toast } = useToast();
  const scroll = useRef<ScrollViewInstance>(null);
  const offsets = useRef<Partial<Record<Section, number>>>({});
  const [active, setActive] = useState<Section>('Overview');

  const jump = (s: Section) => {
    setActive(s);
    const y = offsets.current[s];
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - space.xs), animated: !reduced });
  };
  const block = (s: Section, title: string, subtitle: string, children: ReactNode) => (
    <View key={s} onLayout={(e) => { offsets.current[s] = e.nativeEvent.layout.y; }} style={styles.block}>
      <SectionHeader title={title} subtitle={subtitle} />
      {children}
    </View>
  );

  const pad = layout.width === 'compact' ? space.md : space.lg;
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScreenHeader title="Component gallery" subtitle="Design system v2 · for your review (C-1b)" onBack={onClose}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.jumpBar}>
          {SECTIONS.map((s) => <Chip key={s} label={s} selected={active === s} onPress={() => jump(s)} />)}
        </ScrollView>
      </ScreenHeader>
      <ScrollView ref={scroll} contentContainerStyle={{ padding: pad, paddingBottom: space.xxl * 2 }}>
        <View style={styles.column}>
          {block('Overview', 'This screen', 'Development only. Fictitious examples; nothing here touches shop data.', <Overview />)}
          {block('Hierarchy', 'Control hierarchy (B-4)', 'Four levels, lightest to heaviest. Use the lightest level that stays clear.', <Hierarchy onToast={show} />)}
          {block('Buttons', 'Buttons', 'Kinds and states: normal, pressed (press and hold), disabled with a reason, busy.', <Buttons onToast={show} />)}
          {block('Icon actions', 'Icon actions', 'Only for universally clear actions. Each has a spoken label and a 48 dp target.', <IconActions onToast={show} />)}
          {block('Header', 'Screen header', 'Light header (V-2) with Back, the title and a compact Edit pencil (B-3).', <HeaderDemo onToast={show} />)}
          {block('Inputs', 'Text fields', 'Label above, hint or error below. Fields never open the keyboard by themselves.', <Inputs />)}
          {block('Chips', 'Chips and status badges', 'Selected chips show a tick, not only a colour. Status always has a word.', <Chips />)}
          {block('Cards', 'Cards and figures', 'Figures sit side by side and stack on narrow screens or at large text.', <Cards />)}
          {block('Rows', 'List rows', 'The whole row opens the item; a quiet text action sits underneath.', <Rows onToast={show} />)}
          {block('Banners', 'Banners', 'Full width under the header.', <Banners onToast={show} />)}
          {block('Feedback', 'Feedback', 'A short toast after a save; the "Updated" line.', <Feedback onToast={show} />)}
          {block('Loading', 'Loading', 'Skeletons shaped like the content; they stop pulsing under Reduce Motion.', <Loading />)}
          {block('Sheet', 'Bottom sheet', 'Height-limited and scrollable, so the iPhone keyboard cannot push it away.', <SheetDemo onToast={show} />)}
          {block('Typography', 'Typography', 'The phone\'s own font (Roboto on Android, San Francisco on iPhone). No text-size cap.', <Typography />)}
          {block('Colour', 'Colour roles', 'Screens use roles, not raw colours. The three corrections (V-3) are marked.', <Colours />)}
          {block('Contrast', 'Contrast table', 'Measured live: 4.5:1 for text, 3:1 for control outlines (WCAG 2.1 AA).', <Contrast />)}
          {block('Icons', 'Icon set', 'One family on a 24 dp grid, one stroke weight, drawn as shapes.', <Icons />)}
          {block('Spacing', 'Spacing and shape', 'Steps of 4 – 48 dp; 12 dp cards; 20 dp sheets; hairline borders, no shadows.', <Spacing />)}
          {block('Layout', 'Layout classes', 'Live for this screen. Provisional breakpoints, confirmed on the devices.', <LayoutDemo />)}
          {block('Motion', 'Motion', 'Short and purposeful; nothing moves under Reduce Motion.', <MotionDemo />)}
        </View>
      </ScrollView>
      {toast}
    </View>
  );
}

/* ───────────── sections ───────────── */

function Overview() {
  const layout = useLayout();
  const reduced = useReducedMotion();
  const rows: [string, string][] = [
    ['Screen', `${layout.dp.width} × ${layout.dp.height} dp, ${layout.orientation}`],
    ['Layout class', `${layout.width}${layout.short ? ', short' : ''}`],
    ['Text size', `${Math.round(layout.fontScale * 100)} % of standard`],
    ['Reduce Motion', reduced ? 'On (or not yet known)' : 'Off'],
  ];
  return (
    <Card>
      {rows.map(([k, v], i) => (
        <View key={k}>
          {i > 0 ? <Divider /> : null}
          <View style={styles.kv} accessible accessibilityLabel={`${k}: ${v}`}>
            <AppText variant="body" tone="textSecondary" style={styles.flexShrink}>{k}</AppText>
            <AppText variant="label" style={styles.kvValue}>{v}</AppText>
          </View>
        </View>
      ))}
      <AppText variant="caption" tone="textSecondary">
        To review at other text sizes, change the phone's font size (Android: Settings › Display › Font size; iPhone: Settings › Accessibility › Display & Text Size › Larger Text) and come back; the figures above update.
      </AppText>
    </Card>
  );
}

function Hierarchy({ onToast }: { onToast: (m: string) => void }) {
  const levels: { n: string; name: string; use: string; demo: ReactNode }[] = [
    { n: '1', name: 'Icon action', use: 'Universally clear actions only: edit, close, add, search. Always spoken.',
      demo: <View style={styles.row}><IconButton icon={EditIcon} label="Edit product" tone="tonal" onPress={() => onToast('Edit tapped')} /><IconButton icon={CloseIcon} label="Close" onPress={() => onToast('Close tapped')} /></View> },
    { n: '2', name: 'Text action', use: 'Small actions where an icon alone would be unclear.',
      demo: <View style={styles.row}><TextAction label="Change price" onPress={() => onToast('Change price tapped')} /><TextAction label="See all" onPress={() => onToast('See all tapped')} /></View> },
    { n: '3', name: 'Medium button', use: 'Ordinary actions on a screen.',
      demo: <View style={styles.row}><Button label="Add category" kind="secondary" onPress={() => onToast('Add category tapped')} /></View> },
    { n: '4', name: 'Large primary', use: 'One genuinely important action, e.g. saving a product.',
      demo: <Button label="Save product" size="large" fullWidth onPress={() => onToast('Test Item 01 (fictitious) saved')} /> },
  ];
  return (
    <View style={styles.stack}>
      {levels.map((l) => (
        <Card key={l.n}>
          <View style={styles.levelHead}>
            <View style={styles.levelNo}><AppText variant="label" tone="brand">{l.n}</AppText></View>
            <View style={styles.flexShrink}>
              <AppText variant="label">{l.name}</AppText>
              <AppText variant="caption" tone="textSecondary">{l.use}</AppText>
            </View>
          </View>
          {l.demo}
        </Card>
      ))}
    </View>
  );
}

function Buttons({ onToast }: { onToast: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const save = () => { setBusy(true); setTimeout(() => { setBusy(false); onToast('Price saved'); }, 1500); };
  return (
    <Card>
      <AppText variant="caption" tone="textSecondary">Primary · secondary · quiet · destructive</AppText>
      <View style={styles.wrap}>
        <Button label="Save" onPress={() => onToast('Saved')} />
        <Button label="Cancel" kind="secondary" onPress={() => onToast('Cancelled')} />
        <Button label="Skip" kind="quiet" onPress={() => onToast('Skipped')} />
      </View>
      <Button label="Archive product" kind="destructive" onPress={() => Alert.alert('Archive Test Item 01?', 'Nothing is deleted. You can restore it at any time.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Archive', style: 'destructive', onPress: () => onToast('Archived (example only)') },
      ])} />
      <Divider />
      <AppText variant="caption" tone="textSecondary">With an icon · busy · disabled with a reason</AppText>
      <Button label="Add product" icon={PlusIcon} onPress={() => onToast('Add product tapped')} />
      <Button label="Save price" busy={busy} onPress={save} />
      <Button label="Save changes" disabled disabledReason="Needs internet. Your typing is kept." onPress={() => undefined} />
    </Card>
  );
}

function IconActions({ onToast }: { onToast: (m: string) => void }) {
  return (
    <Card>
      <View style={styles.wrap}>
        {([['plain', 'Plain'], ['tonal', 'Tonal'], ['header', 'On a header']] as const).map(([tone, name]) => (
          <View key={tone} style={styles.iconDemo}>
            <View style={[styles.iconSwatch, tone === 'header' && { backgroundColor: color.headerBg }]}>
              <IconButton icon={EditIcon} label={`Edit (${name})`} tone={tone} onPress={() => onToast(`${name} icon tapped`)} />
            </View>
            <AppText variant="caption" tone="textSecondary">{name}</AppText>
          </View>
        ))}
        <View style={styles.iconDemo}>
          <View style={styles.iconSwatch}>
            <IconButton icon={EditIcon} label="Edit product" disabled disabledReason="Archived. Restore it to make changes." onPress={() => undefined} />
          </View>
          <AppText variant="caption" tone="textSecondary">Disabled</AppText>
        </View>
      </View>
      <AppText variant="caption" tone="textSecondary">The visible circle is 40 dp; the touch area is 48 × 48 dp. With TalkBack or VoiceOver on, each is read by its label, e.g. "Edit product, button".</AppText>
    </Card>
  );
}

function HeaderDemo({ onToast }: { onToast: (m: string) => void }) {
  return (
    <View style={styles.headerFrame}>
      <View style={styles.headerPreview}>
        <View style={styles.headerTop}>
          <BackButton accessibilityLabel="Back (example)" onPress={() => onToast('Back tapped')} />
          <IconButton icon={EditIcon} label="Edit product" tone="header" onPress={() => onToast('Edit tapped')} />
        </View>
        <AppText variant="title">Test Item 01 (fictitious)</AppText>
        <AppText variant="body" tone="textSecondary">Test Drinks (fictitious)</AppText>
        <View style={styles.row}>
          <StatusBadge label="24 sachets · In stock" tone="success" />
        </View>
        <UpdatedLine label="Updated 10:42" failed={false} />
      </View>
      <View style={styles.headerBody}>
        <AppText variant="caption" tone="textSecondary">Selling price</AppText>
        <AppText variant="display" number>GH₵ 1.75</AppText>
        <AppText variant="body" tone="textSecondary">per sachet</AppText>
      </View>
    </View>
  );
}

function Inputs() {
  const [name, setName] = useState('Test Item 01 (fictitious)');
  const [price, setPrice] = useState('');
  const [touched, setTouched] = useState(false);
  const parsed = parseCedis(price);
  return (
    <Card>
      <TextField label="Product name" value={name} onChangeText={setName} hint="Up to 100 characters." maxLength={100} />
      <TextField label="Selling price" prefix="GH₵" value={price} onChangeText={(t) => { setPrice(t); setTouched(true); }}
        keyboardType="decimal-pad" placeholder="0.00" error={touched && !parsed.ok ? parsed.error : undefined}
        hint="Type an amount, or something like 1.234 to see the error." />
      <TextField label="Stock you have now" value="12" onChangeText={() => undefined} disabled hint="Disabled example: stock changes only through Restock and Adjust stock." />
    </Card>
  );
}

function Chips() {
  const [sel, setSel] = useState('All');
  return (
    <Card>
      <View style={styles.wrap}>
        {['All', 'Drinks', 'Provisions', 'No category'].map((c) => <Chip key={c} label={c} selected={sel === c} onPress={() => setSel(c)} />)}
        <Chip label="Search" selected={false} icon={SearchIcon} onPress={() => setSel('All')} />
      </View>
      <Divider />
      <View style={styles.wrap}>
        <StatusBadge label="In stock" tone="success" />
        <StatusBadge label="Low" tone="warning" />
        <StatusBadge label="Out of stock" tone="danger" />
        <StatusBadge label="Negative" tone="danger" />
        <StatusBadge label="Archived" tone="neutral" />
        <StatusBadge label="MoMo" tone="info" />
      </View>
    </Card>
  );
}

function Cards() {
  const layout = useLayout();
  const perRow = figuresPerRow(layout, layout.fontScale);
  const stats = [
    { label: 'In stock', value: '24 sachets', detail: 'Low at 5' },
    { label: 'Average cost (about)', value: 'GH₵ 1.10', detail: 'per sachet' },
    { label: 'Margin (about)', value: 'GH₵ 0.65', detail: '37 %', detailTone: 'success' as const },
    { label: 'Stock value (about)', value: 'GH₵ 26.40', detail: 'Stock × average cost' },
  ];
  return (
    <View style={styles.stack}>
      <View style={styles.grid}>
        {stats.map((s) => (
          <Card key={s.label} style={{ flexBasis: perRow === 1 ? '100%' : perRow === 2 ? '46%' : '22%', flexGrow: 1 }}>
            <Stat label={s.label} value={s.value} detail={s.detail} detailTone={s.detailTone}
              help={s.label.startsWith('Average') ? <InfoIcon colour={color.brand} size={16} /> : undefined} />
          </Card>
        ))}
      </View>
      <AppText variant="caption" tone="textSecondary">{perRow} per row now ({layout.width}, text {Math.round(layout.fontScale * 100)} %).</AppText>
      <Card>
        <AppText variant="heading">A card</AppText>
        <AppText variant="body" tone="textSecondary">White surface, 12 dp corners and a hairline border. No shadow, so it stays smooth on the Galaxy A06.</AppText>
      </Card>
    </View>
  );
}

function Rows({ onToast }: { onToast: (m: string) => void }) {
  const rows = [
    { title: 'Test Item 01 (fictitious)', sub: 'Test Drinks · per sachet', value: 'GH₵ 1.75', badge: <StatusBadge label="24 · In stock" tone="success" /> },
    { title: 'Test Item 05 (fictitious)', sub: 'Test Provisions · per tin', value: 'GH₵ 2.75', badge: <StatusBadge label="3 · Low" tone="warning" /> },
    { title: 'Test Item 07 with a much longer fictitious product name that wraps', sub: 'No category · per piece', value: 'GH₵ 3.25', badge: <StatusBadge label="0 · Out of stock" tone="danger" /> },
  ];
  return (
    <View style={styles.listCard}>
      {rows.map((r, i) => (
        <View key={r.title}>
          {i > 0 ? <Divider /> : null}
          <ListRow title={r.title} subtitle={r.sub} value={r.value} badge={r.badge} onPress={() => onToast(`Opens ${r.title}`)}
            action={{ label: 'Change price', onPress: () => onToast('Change price tapped'), accessibilityLabel: `Change price of ${r.title}` }} />
        </View>
      ))}
    </View>
  );
}

function Banners({ onToast }: { onToast: (m: string) => void }) {
  return (
    <View style={styles.stack}>
      <Banner tone="offline" message="You're offline. Saving changes needs internet; your typing is kept." action={{ label: 'Check again', onPress: () => onToast('Checking…') }} />
      <Banner tone="warning" title="Couldn't refresh" message="The price and stock below are from 10:42 and may have changed." action={{ label: 'Try again', onPress: () => onToast('Refreshing…') }} />
      <Banner tone="danger" message="We couldn't load this product. Please try again." />
      <Banner tone="info" message="This product was changed on another device. The latest details are shown." />
      <Banner tone="success" message="Test Item 01 (fictitious) saved." />
    </View>
  );
}

function Feedback({ onToast }: { onToast: (m: string) => void }) {
  return (
    <Card>
      <Button label="Show a toast" kind="secondary" onPress={() => onToast('Test Item 01 (fictitious) saved')} />
      <Divider />
      <UpdatedLine label="Updated 10:42" failed={false} />
      <UpdatedLine label="Last updated 10:42 · couldn't refresh" failed onRetry={() => onToast('Refreshing…')} />
    </Card>
  );
}

function Loading() {
  const [loading, setLoading] = useState(true);
  return (
    <View style={styles.stack}>
      {loading ? (
        <>
          <SkeletonRow />
          <View style={styles.grid}><View style={styles.half}><SkeletonStat /></View><View style={styles.half}><SkeletonStat /></View></View>
          <Card><SkeletonText lines={3} /></Card>
        </>
      ) : (
        <FadeIn>
          <EmptyState icon={BoxIcon} title="No products yet" body="Add the items you sell, with their selling price."
            action={<Button label="Add your first product" icon={PlusIcon} onPress={() => setLoading(true)} />} />
        </FadeIn>
      )}
      <TextAction label={loading ? 'Show the loaded (empty) state' : 'Show loading again'} onPress={() => setLoading((l) => !l)} />
    </View>
  );
}

function SheetDemo({ onToast }: { onToast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState('1.75');
  const parsed = parseCedis(price);
  return (
    <Card>
      <AppText variant="body" tone="textSecondary">The field does not focus itself; tap it to open the number pad. The sheet stays in view.</AppText>
      <Button label="Open the price sheet" kind="secondary" onPress={() => setOpen(true)} />
      <Sheet visible={open} title="Change price" subtitle="Test Item 01 (fictitious) · now GH₵ 1.75" onClose={() => setOpen(false)}>
        <TextField label="New selling price" prefix="GH₵" value={price} onChangeText={setPrice} keyboardType="decimal-pad"
          error={parsed.ok ? undefined : parsed.error} hint="The change is recorded in the shop's history." selectTextOnFocus />
        <Button label="Save price" size="large" fullWidth disabled={!parsed.ok} disabledReason="Enter a valid amount."
          onPress={() => { setOpen(false); onToast('Price is now GH₵ ' + price + ' (example only)'); }} />
        <View style={styles.center}><TextAction label="Cancel" onPress={() => setOpen(false)} /></View>
      </Sheet>
    </Card>
  );
}

function Typography() {
  const order: [TextVariant, string][] = [
    ['display', 'GH₵ 1,240.50'], ['displaySmall', 'GH₵ 312.00'], ['title', 'Products'], ['heading', 'Today\'s sales'],
    ['body', 'Fill in what you know; you can change it later.'], ['label', 'Selling price'], ['caption', 'Updated 10:42'],
  ];
  return (
    <Card>
      {order.map(([v, sample], i) => (
        <View key={v} style={styles.typeRow}>
          {i > 0 ? <Divider /> : null}
          <AppText variant="caption" tone="textSecondary">{v} · {text[v].fontSize} sp · weight {text[v].fontWeight}</AppText>
          <AppText variant={v} number={v.startsWith('display')}>{sample}</AppText>
        </View>
      ))}
      <AppText variant="caption" tone="textSecondary">Money and stock use tabular figures, so columns line up: GH₵ 1.10 · GH₵ 11.00 · GH₵ 111.00</AppText>
    </Card>
  );
}

const ROLE_NOTES: Partial<Record<keyof typeof color, string>> = {
  headerBg: 'New (V-3): light header', controlBorder: 'New (V-3): control outlines', success: 'Corrected (V-3)',
  divider: 'Decorative only', accent: 'Dark text only',
};

function Colours() {
  const roles = (Object.keys(color) as (keyof typeof color)[]).filter((r) => r !== 'scrim');
  return (
    <View style={styles.grid}>
      {roles.map((r) => (
        <View key={r} style={styles.swatchCard} accessible accessibilityLabel={`${r}, ${color[r]}${ROLE_NOTES[r] ? `, ${ROLE_NOTES[r]}` : ''}`}>
          <View style={[styles.swatch, { backgroundColor: color[r] }]} />
          <AppText variant="caption" style={styles.bold}>{r}</AppText>
          <AppText variant="caption" tone="textSecondary">{color[r]}</AppText>
          {ROLE_NOTES[r] ? <AppText variant="caption" tone="brand">{ROLE_NOTES[r]}</AppText> : null}
        </View>
      ))}
    </View>
  );
}

function Contrast() {
  const line = (p: (typeof KIT_PAIRS)[number], used: boolean) => {
    const ok = passes(p);
    return (
      <View key={p.label} style={styles.contrastRow} accessible accessibilityLabel={`${p.label}: ${contrastRatio(p.fg, p.bg)} to 1, ${ok ? 'pass' : 'fail'}`}>
        <View style={[styles.contrastSample, { backgroundColor: p.bg }]}><AppText variant="label" style={{ color: p.fg }}>Aa</AppText></View>
        <View style={styles.flexShrink}>
          <AppText variant="caption">{p.label}</AppText>
          <AppText variant="caption" tone="textSecondary">{contrastRatio(p.fg, p.bg).toFixed(2)} : 1 · needs {minimumFor(p.use)}</AppText>
        </View>
        <StatusBadge label={ok ? 'Pass' : used ? 'Fail' : 'Fail · not used'} tone={ok ? 'success' : 'danger'} />
      </View>
    );
  };
  return (
    <Card>
      {KIT_PAIRS.map((p) => line(p, true))}
      <Divider />
      <AppText variant="caption" tone="textSecondary">Pairs that fail, and are therefore never used:</AppText>
      {FAILING_PAIRS.map((p) => line(p, false))}
    </Card>
  );
}

function Icons() {
  return (
    <View style={styles.grid}>
      {ICONS.map(({ name, icon: Glyph, meaning }) => (
        <View key={name} style={styles.iconCell} accessible accessibilityLabel={`${name} icon: ${meaning}`}>
          <Glyph colour={color.textPrimary} size={24} />
          <AppText variant="caption" style={styles.bold} align="center">{name}</AppText>
          <AppText variant="caption" tone="textSecondary" align="center">{meaning}</AppText>
        </View>
      ))}
    </View>
  );
}

function Spacing() {
  return (
    <Card>
      {Object.entries(space).map(([k, v]) => (
        <View key={k} style={styles.spaceRow}>
          <AppText variant="caption" tone="textSecondary" style={styles.spaceLabel}>{v} dp</AppText>
          <View style={{ width: v * 3, height: 12, borderRadius: 3, backgroundColor: color.brand }} />
        </View>
      ))}
      <Divider />
      <View style={styles.wrap}>
        {([['Small · 8', radius.sm], ['Card · 12', radius.md], ['Sheet · 20', radius.sheet]] as const).map(([label, r]) => (
          <View key={label} style={styles.iconDemo}>
            <View style={{ width: 64, height: 48, borderRadius: r, borderWidth: control.hairline, borderColor: color.controlBorder, backgroundColor: color.bg }} />
            <AppText variant="caption" tone="textSecondary">{label}</AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

function LayoutDemo() {
  const layout = useLayout();
  const rows: [string, string][] = [
    ['Width class', `${layout.width} (compact < ${BREAKPOINTS.medium}, medium < ${BREAKPOINTS.expanded}, expanded ≥ ${BREAKPOINTS.expanded} dp)`],
    ['Height', layout.short ? `short (under ${BREAKPOINTS.shortHeight} dp)` : `regular (${BREAKPOINTS.shortHeight} dp or more)`],
    ['Screen padding', `${layout.width === 'compact' ? 16 : 24} dp`],
    ['Products list and Details side by side', allowsTwoPanes(layout) ? 'Yes' : 'No (one screen at a time)'],
    ['Figures per row', String(figuresPerRow(layout, layout.fontScale))],
  ];
  return (
    <Card>
      {rows.map(([k, v], i) => (
        <View key={k}>
          {i > 0 ? <Divider /> : null}
          <View style={styles.kvStack} accessible accessibilityLabel={`${k}: ${v}`}>
            <AppText variant="caption" tone="textSecondary">{k}</AppText>
            <AppText variant="label">{v}</AppText>
          </View>
        </View>
      ))}
      <AppText variant="caption" tone="textSecondary">The app is still portrait-only; landscape is unlocked in 1C-3.5. These values follow the screen now, and will follow rotation then.</AppText>
    </Card>
  );
}

function MotionDemo() {
  const reduced = useReducedMotion();
  const [replay, setReplay] = useState(0);
  return (
    <Card>
      <AppText variant="body">Reduce Motion is <AppText variant="label">{reduced ? 'on (or not yet known)' : 'off'}</AppText>.</AppText>
      <AppText variant="caption" tone="textSecondary">Press {motion.quick} ms · content {motion.standard} ms · success {motion.emphasis} ms · press scale {Math.round(motion.pressScale * 100)} %</AppText>
      <PressableScale accessibilityRole="button" accessibilityLabel="Press and hold to feel the press feedback" onPress={() => undefined} style={styles.pressDemo}>
        <AppText variant="label" tone="brand" align="center">Press and hold me</AppText>
      </PressableScale>
      <FadeIn animationKey={String(replay)}>
        <View style={styles.fadeDemo}><AppText variant="label" align="center">Content appears like this</AppText></View>
      </FadeIn>
      <TextAction label="Replay" onPress={() => setReplay((r) => r + 1)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  column: { width: '100%', maxWidth: 720, alignSelf: 'center', gap: space.xl },
  block: { gap: space.sm },
  jumpBar: { gap: space.xs, paddingTop: space.xs, paddingRight: space.md },
  stack: { gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'flex-start' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  half: { flexBasis: '46%', flexGrow: 1 },
  center: { alignItems: 'center' },
  flexShrink: { flexShrink: 1 },
  bold: { fontWeight: '700' },
  kv: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', columnGap: space.md, paddingVertical: space.xs },
  kvValue: { flexShrink: 1, textAlign: 'right' },
  kvStack: { gap: 2, paddingVertical: space.xs },
  levelHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  levelNo: { width: 28, height: 28, borderRadius: 14, backgroundColor: color.successBg, alignItems: 'center', justifyContent: 'center' },
  iconDemo: { alignItems: 'center', gap: space.xxs, minWidth: 72 },
  iconSwatch: { padding: space.xxs, borderRadius: radius.md, backgroundColor: color.surface },
  headerFrame: { borderRadius: radius.md, overflow: 'hidden', borderWidth: control.hairline, borderColor: color.divider },
  headerPreview: { backgroundColor: color.headerBg, padding: space.md, paddingTop: space.xs, gap: space.xxs, borderBottomWidth: control.hairline, borderBottomColor: color.divider },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: -space.xs },
  headerBody: { backgroundColor: color.bg, padding: space.md, gap: 2 },
  listCard: { backgroundColor: color.surface, borderRadius: radius.md, borderWidth: control.hairline, borderColor: color.divider, overflow: 'hidden' },
  typeRow: { gap: 2, paddingTop: space.xxs },
  swatchCard: { flexBasis: '30%', flexGrow: 1, minWidth: 100, gap: 2, padding: space.xs, backgroundColor: color.surface, borderRadius: radius.md, borderWidth: control.hairline, borderColor: color.divider },
  swatch: { height: 40, borderRadius: radius.sm, borderWidth: control.hairline, borderColor: color.divider, marginBottom: space.xxs },
  contrastRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  contrastSample: { width: 48, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: control.hairline, borderColor: color.divider },
  iconCell: { flexBasis: '30%', flexGrow: 1, minWidth: 96, alignItems: 'center', gap: space.xxs, padding: space.sm, backgroundColor: color.surface, borderRadius: radius.md, borderWidth: control.hairline, borderColor: color.divider },
  spaceRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  spaceLabel: { width: 52 },
  pressDemo: { minHeight: control.touchTarget, justifyContent: 'center', borderRadius: radius.md, borderWidth: 1.5, borderColor: color.brand, backgroundColor: color.successBg },
  fadeDemo: { padding: space.md, borderRadius: radius.md, backgroundColor: color.headerBg },
});
