/**
 * AppText (spec 08 §4; plan decision P-4): the native system font only — no fontFamily, no font
 * file. Text always scales with the phone's text-size setting, with NO cap (no
 * maxFontSizeMultiplier, never allowFontScaling={false}); long text wraps rather than being cut.
 */
import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { color, text, type ColorRole, type TextVariant } from './tokens';

export type AppTextProps = Omit<TextProps, 'style' | 'maxFontSizeMultiplier' | 'allowFontScaling'> & {
  variant?: TextVariant;
  tone?: ColorRole;
  /** Bold, tabular figures for money and quantities (spec 08 §4 "Number"). */
  number?: boolean;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
  children: ReactNode;
};

export function AppText({ variant = 'body', tone = 'textPrimary', number = false, align, style, children, ...rest }: AppTextProps) {
  return (
    <Text
      {...rest}
      style={[
        text[variant],
        { color: color[tone] },
        number && { fontWeight: '700', fontVariant: ['tabular-nums'] },
        align ? { textAlign: align } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}
