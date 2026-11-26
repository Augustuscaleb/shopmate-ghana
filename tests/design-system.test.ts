/**
 * Stage 1C-3.2 design system and component gallery: static guards on the sources (plan §7
 * 1C-3.2 acceptance; spec 08 rev 2; owner decisions B-3, B-4). How things look and feel needs the
 * owner's review on the phones (Checkpoint C-1b); these keep the agreed rules from slipping.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const app = join(__dirname, '../app');
const kitDir = join(app, 'src/ui/kit');
const read = (p: string) => readFileSync(p, 'utf8');
/** Source without comments, so a rule named in a comment ("no fontFamily") isn't mistaken for a use. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const kitFiles = readdirSync(kitDir).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts')).map((f) => ({ name: f, src: read(join(kitDir, f)) }));
const gallery = read(join(app, 'src/screens/dev/ComponentGallery.tsx'));
const home = read(join(app, 'src/screens/HomeScreen.tsx'));
const reviewed = [...kitFiles, { name: 'ComponentGallery.tsx', src: gallery }].map((f) => ({ name: f.name, src: code(f.src) }));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

describe('Design system v2 and gallery (Stage 1C-3.2)', () => {
  it('DS-01: system font only: no fontFamily in the kit or the gallery, and no font files in the app', () => {
    for (const f of reviewed) expect(f.src, f.name).not.toMatch(/fontFamily/);
    const fonts = walk(join(app, 'assets')).filter((p) => /\.(ttf|otf|woff2?)$/i.test(p));
    expect(fonts).toEqual([]);
  });

  it('DS-02: no text-scaling cap anywhere in the kit or the gallery', () => {
    for (const f of reviewed) {
      expect(f.src, f.name).not.toMatch(/maxFontSizeMultiplier\s*=|maxFontSizeMultiplier:/);
      expect(f.src, f.name).not.toMatch(/allowFontScaling\s*=\s*\{\s*false\s*\}/);
    }
  });

  it('DS-03: colours come only from the tokens: no raw hex colours outside tokens.ts and contrast.ts', () => {
    for (const f of reviewed.filter((x) => x.name !== 'tokens.ts' && x.name !== 'contrast.ts')) {
      expect(f.src.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? [], f.name).toEqual([]);
    }
  });

  it('DS-04: no text smaller than the 14 sp caption is set in the kit or the gallery', () => {
    for (const f of reviewed) {
      for (const m of f.src.matchAll(/fontSize:\s*(\d+)/g)) expect(Number(m[1]), f.name).toBeGreaterThanOrEqual(14);
    }
  });

  it('DS-05: fields never focus themselves (the iPhone sheet fix): no autoFocus and no .focus() in the kit or gallery', () => {
    for (const f of reviewed) {
      expect(f.src, f.name).not.toMatch(/\bautoFocus\b(?!['"])/);
      expect(f.src, f.name).not.toMatch(/\.focus\(\)/);
    }
    // The text field type removes autoFocus, so a screen can't pass it
    expect(kitFiles.find((f) => f.name === 'TextField.tsx')!.src).toContain("'autoFocus'");
  });

  it('DS-06: no existing screen is redesigned: only the gallery imports the new kit', () => {
    const screens = walk(join(app, 'src/screens')).filter((p) => p.endsWith('.tsx') && !p.includes(`${join('src', 'screens', 'dev')}`));
    for (const p of screens) expect(read(p), p).not.toMatch(/ui\/kit/);
  });

  it('DS-07: the gallery is reachable only in development (__DEV__), from the More tab, and Android Back closes it', () => {
    expect(home).toContain('if (__DEV__ && galleryOpen) return <ComponentGallery onClose={() => setGalleryOpen(false)} />;');
    expect(home).toContain('onOpenGallery={__DEV__ ? () => setGalleryOpen(true) : undefined}');
    expect(home).toContain('{__DEV__ && onOpenGallery ? (');
    expect(home).toContain('if (galleryOpen) { setGalleryOpen(false); return true; }');
  });

  it('DS-08: B-4: large buttons only for genuinely important actions in the gallery', () => {
    const large = [...gallery.matchAll(/<Button label="([^"]+)"[^>]*size="large"/g)].map((m) => m[1]);
    expect(large.length).toBeGreaterThan(0);
    expect(large.every((l) => /^Save /.test(l)), large.join(', ')).toBe(true);
  });

  it('DS-09: every icon-only control in the kit and the gallery has a spoken label', () => {
    for (const f of reviewed) {
      for (const m of f.src.matchAll(/<IconButton\b[^>]*>/g)) expect(m[0], f.name).toMatch(/label=/);
    }
    expect(kitFiles.find((f) => f.name === 'controls.tsx')!.src).toMatch(/accessibilityLabel=\{label\}/);
  });

  it('DS-10: the gallery reads and writes no shop data', () => {
    expect(gallery).not.toMatch(/services\/|supabase|ProductsService|\.rpc\(/);
  });
});
