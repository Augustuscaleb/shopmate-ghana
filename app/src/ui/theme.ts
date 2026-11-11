/** Design tokens (spec 08, provisionally approved). */
export const colours = {
  shopGreen: '#0B6B4F',
  deepGreen: '#084C38',
  marketGold: '#F4B400',
  warmWhite: '#FAF8F3',
  surface: '#FFFFFF',
  ink: '#1C1B19',
  stone: '#5A5550',
  sand: '#E4DFD5',
  ok: '#1E7F4F',
  warnText: '#8A5300',
  warnBg: '#FFF4D6',
  danger: '#B42318',
  dangerBg: '#FDECEA',
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

export const type = {
  keyFigure: 32,
  title: 22,
  section: 18,
  body: 16,
  caption: 14, // never smaller (D-02)
} as const;

export const touch = { min: 48, primaryButton: 56 } as const;
