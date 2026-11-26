/**
 * The redrawn icon set (Stage 1C-3.2; spec 08 §7, decision I-1): one consistent family on a 24 dp
 * grid, one stroke weight, rounded ends, drawn from plain views — no SVG or icon-font package, and
 * no text characters (so icons never need a text-scaling exception). Icons are decorative to
 * screen readers; the control that holds one always carries the spoken label.
 */
import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

export type IconProps = { colour: string; size?: number };
export type Icon = (p: IconProps) => ReactNode;

/** The stroke weight for every icon, scaled with its size (2 dp at 24 dp). */
function stroke(size: number): number {
  return Math.max(1.5, Math.round((size / 12) * 2) / 2);
}

function Frame({ size, children }: { size: number; children: ReactNode }) {
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </View>
  );
}

/** A rounded bar: the building block of most glyphs. */
function Bar({ length, thickness, colour, style }: { length: number; thickness: number; colour: string; style?: ViewStyle }) {
  return <View style={[{ width: length, height: thickness, borderRadius: thickness / 2, backgroundColor: colour }, style]} />;
}

function Chevron({ colour, size = 24, direction }: IconProps & { direction: 'left' | 'right' | 'down' }) {
  const s = stroke(size);
  const arm = size * 0.36;
  const rotate = direction === 'left' ? '45deg' : direction === 'right' ? '-135deg' : '-45deg';
  const shift = direction === 'left' ? { marginLeft: arm * 0.35 } : direction === 'right' ? { marginRight: arm * 0.35 } : { marginTop: -arm * 0.35 };
  return (
    <Frame size={size}>
      <View style={[{ width: arm, height: arm, borderLeftWidth: s, borderBottomWidth: s, borderColor: colour, borderBottomLeftRadius: s / 2, transform: [{ rotate }] }, shift]} />
    </Frame>
  );
}

export const BackIcon: Icon = (p) => <Chevron {...p} direction="left" />;
export const ForwardIcon: Icon = (p) => <Chevron {...p} direction="right" />;
export const ExpandIcon: Icon = (p) => <Chevron {...p} direction="down" />;

export const CloseIcon: Icon = ({ colour, size = 24 }) => {
  const s = stroke(size);
  const l = size * 0.72;
  return (
    <Frame size={size}>
      <Bar length={l} thickness={s} colour={colour} style={{ position: 'absolute', transform: [{ rotate: '45deg' }] }} />
      <Bar length={l} thickness={s} colour={colour} style={{ position: 'absolute', transform: [{ rotate: '-45deg' }] }} />
    </Frame>
  );
};

export const PlusIcon: Icon = ({ colour, size = 24 }) => {
  const s = stroke(size);
  const l = size * 0.66;
  return (
    <Frame size={size}>
      <Bar length={l} thickness={s} colour={colour} style={{ position: 'absolute' }} />
      <Bar length={l} thickness={s} colour={colour} style={{ position: 'absolute', transform: [{ rotate: '90deg' }] }} />
    </Frame>
  );
};

export const CheckIcon: Icon = ({ colour, size = 24 }) => {
  const s = stroke(size);
  return (
    <Frame size={size}>
      <View style={{ width: size * 0.3, height: size * 0.56, borderRightWidth: s, borderBottomWidth: s, borderColor: colour, borderBottomRightRadius: s / 2, transform: [{ rotate: '45deg' }], marginTop: -size * 0.1 }} />
    </Frame>
  );
};

export const EditIcon: Icon = ({ colour, size = 24 }) => {
  const s = stroke(size);
  const w = size * 0.26;
  return (
    <Frame size={size}>
      <View style={{ alignItems: 'center', transform: [{ rotate: '45deg' }] }}>
        <View style={{ width: w, height: size * 0.14, borderWidth: s, borderColor: colour, borderTopLeftRadius: s, borderTopRightRadius: s, marginBottom: 1 }} />
        <View style={{ width: w, height: size * 0.42, borderWidth: s, borderColor: colour }} />
        <View style={{ width: 0, height: 0, borderLeftWidth: w / 2, borderRightWidth: w / 2, borderTopWidth: size * 0.17, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colour }} />
      </View>
    </Frame>
  );
};

export const SearchIcon: Icon = ({ colour, size = 24 }) => {
  const s = stroke(size);
  const d = size * 0.56;
  return (
    <Frame size={size}>
      <View style={{ width: d, height: d, borderRadius: d / 2, borderWidth: s, borderColor: colour, marginRight: size * 0.14, marginBottom: size * 0.14 }} />
      <Bar length={size * 0.3} thickness={s} colour={colour} style={{ position: 'absolute', right: size * 0.1, bottom: size * 0.2, transform: [{ rotate: '45deg' }] }} />
    </Frame>
  );
};

/** A circle with a mark: "i" (info) or "!" (alert), both drawn as shapes. */
function MarkCircle({ colour, size = 24, alert }: IconProps & { alert: boolean }) {
  const s = stroke(size);
  const d = size * 0.84;
  const dot = <View style={{ width: s + 0.5, height: s + 0.5, borderRadius: s, backgroundColor: colour }} />;
  const bar = <Bar length={size * 0.28} thickness={s} colour={colour} style={{ transform: [{ rotate: '90deg' }], marginVertical: size * 0.1 }} />;
  return (
    <Frame size={size}>
      <View style={{ width: d, height: d, borderRadius: d / 2, borderWidth: s, borderColor: colour, alignItems: 'center', justifyContent: 'center' }}>
        {alert ? <>{bar}{dot}</> : <>{dot}{bar}</>}
      </View>
    </Frame>
  );
}

export const InfoIcon: Icon = (p) => <MarkCircle {...p} alert={false} />;
export const AlertIcon: Icon = (p) => <MarkCircle {...p} alert />;

export const MenuIcon: Icon = ({ colour, size = 24 }) => {
  const s = stroke(size);
  return (
    <Frame size={size}>
      <View style={{ gap: size * 0.16 }}>
        {[0, 1, 2].map((i) => <Bar key={i} length={size * 0.7} thickness={s} colour={colour} />)}
      </View>
    </Frame>
  );
};

export const MoreIcon: Icon = ({ colour, size = 24 }) => {
  const d = stroke(size) + 1.5;
  return (
    <Frame size={size}>
      <View style={{ flexDirection: 'row', gap: size * 0.14 }}>
        {[0, 1, 2].map((i) => <View key={i} style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: colour }} />)}
      </View>
    </Frame>
  );
};

export const BoxIcon: Icon = ({ colour, size = 24 }) => {
  const s = stroke(size);
  return (
    <Frame size={size}>
      <View style={{ width: size * 0.78, height: size * 0.66, borderWidth: s, borderColor: colour, borderRadius: s * 1.5, alignItems: 'center' }}>
        <View style={{ width: '100%', height: size * 0.2, borderBottomWidth: s, borderColor: colour }} />
        <Bar length={size * 0.2} thickness={s} colour={colour} style={{ marginTop: size * 0.08 }} />
      </View>
    </Frame>
  );
};

export const TagIcon: Icon = ({ colour, size = 24 }) => {
  const s = stroke(size);
  return (
    <Frame size={size}>
      <View style={{ width: size * 0.74, height: size * 0.48, borderWidth: s, borderColor: colour, borderRadius: size * 0.12, justifyContent: 'center', paddingLeft: size * 0.1 }}>
        <View style={{ width: size * 0.13, height: size * 0.13, borderRadius: size, borderWidth: s, borderColor: colour }} />
      </View>
    </Frame>
  );
};

export const ReceiptIcon: Icon = ({ colour, size = 24 }) => {
  const s = stroke(size);
  return (
    <Frame size={size}>
      <View style={{ width: size * 0.64, height: size * 0.84, borderWidth: s, borderColor: colour, borderRadius: s * 1.5, padding: size * 0.1, gap: size * 0.1, justifyContent: 'center' }}>
        {[1, 0.75, 0.5].map((w, i) => <Bar key={i} length={size * 0.38 * w} thickness={s} colour={colour} />)}
      </View>
    </Frame>
  );
};

export const GridIcon: Icon = ({ colour, size = 24 }) => {
  const s = stroke(size);
  const cell = size * 0.34;
  return (
    <Frame size={size}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: cell * 2 + size * 0.12, gap: size * 0.12 }}>
        {[0, 1, 2, 3].map((i) => <View key={i} style={{ width: cell, height: cell, borderRadius: s * 1.5, borderWidth: s, borderColor: colour }} />)}
      </View>
    </Frame>
  );
};

export const ChartIcon: Icon = ({ colour, size = 24 }) => {
  const s = stroke(size) + 0.5;
  return (
    <Frame size={size}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: size * 0.12, height: size * 0.7 }}>
        {[0.45, 0.8, 0.6].map((h, i) => <View key={i} style={{ width: s + 1, height: size * 0.7 * h, borderRadius: s, backgroundColor: colour }} />)}
      </View>
    </Frame>
  );
};

export const PersonIcon: Icon = ({ colour, size = 24 }) => {
  const s = stroke(size);
  return (
    <Frame size={size}>
      <View style={{ alignItems: 'center', gap: size * 0.06 }}>
        <View style={{ width: size * 0.34, height: size * 0.34, borderRadius: size, borderWidth: s, borderColor: colour }} />
        <View style={{ width: size * 0.66, height: size * 0.3, borderTopLeftRadius: size * 0.33, borderTopRightRadius: size * 0.33, borderWidth: s, borderBottomWidth: 0, borderColor: colour }} />
      </View>
    </Frame>
  );
};

/** The whole set, named, for the gallery. */
export const ICONS: readonly { name: string; icon: Icon; meaning: string }[] = [
  { name: 'Back', icon: BackIcon, meaning: 'Go back (always with the word "Back")' },
  { name: 'Forward', icon: ForwardIcon, meaning: 'Opens the next screen in a row' },
  { name: 'Expand', icon: ExpandIcon, meaning: 'Shows more' },
  { name: 'Close', icon: CloseIcon, meaning: 'Close a sheet or message' },
  { name: 'Add', icon: PlusIcon, meaning: 'Add a new item' },
  { name: 'Done', icon: CheckIcon, meaning: 'Selected, saved, done' },
  { name: 'Edit', icon: EditIcon, meaning: 'Edit (B-3: icon-only allowed)' },
  { name: 'Search', icon: SearchIcon, meaning: 'Search' },
  { name: 'Info', icon: InfoIcon, meaning: 'How this works' },
  { name: 'Alert', icon: AlertIcon, meaning: 'Something needs attention' },
  { name: 'Menu', icon: MenuIcon, meaning: 'More choices (with a word)' },
  { name: 'More', icon: MoreIcon, meaning: 'More actions (with a word)' },
  { name: 'Stock', icon: BoxIcon, meaning: 'Products and stock' },
  { name: 'Category', icon: TagIcon, meaning: 'Categories' },
  { name: 'Sales', icon: ReceiptIcon, meaning: 'Sales and receipts' },
  { name: 'Today', icon: GridIcon, meaning: 'Today dashboard' },
  { name: 'Reports', icon: ChartIcon, meaning: 'Reports' },
  { name: 'People', icon: PersonIcon, meaning: 'Customers and staff' },
];
