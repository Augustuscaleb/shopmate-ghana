/**
 * Purposeful motion built on React Native's own Animated API (no animation library). Only opacity
 * and transform are animated, always on the native driver; everything respects reduced motion
 * (docs/stages/STAGE-1C-2-VISUAL-DESIGN.md §3).
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { duration, entranceAction, entranceFrom, motion, shouldLoop } from './motion';
import { useReducedMotion } from './useReducedMotion';
import { colours, radius } from './theme';

const easeOut = Easing.out(Easing.cubic);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle>; children: ReactNode };

/**
 * Touch feedback: a quick, subtle press-in scale. The caller's style (including flex layout)
 * stays on the pressable itself. Disabled presses don't animate.
 */
export function PressableScale({ style, children, disabled, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  // Under reduced motion there is no scaling at all (the pressable's own feedback remains).
  const to = (value: number) => {
    if (reduced) { scale.setValue(1); return; }
    Animated.timing(scale, { toValue: value, duration: duration(motion.quick, reduced), easing: easeOut, useNativeDriver: true }).start();
  };
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => { if (!disabled) to(motion.pressScale); onPressIn?.(e); }}
      onPressOut={(e) => { to(1); onPressOut?.(e); }}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * Entrance: fades in and rises a few dp when it first appears and whenever `animationKey`
 * changes (e.g. a new tab). Under reduced motion (including before the phone's setting is
 * known) it snaps to the final state; if motion becomes reduced mid-entrance, it snaps at once.
 */
export function FadeIn({ children, delay = 0, animationKey, style }: {
  children: ReactNode; delay?: number; animationKey?: string; style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const start = entranceFrom(reduced);
  const opacity = useRef(new Animated.Value(start.opacity)).current;
  const translateY = useRef(new Animated.Value(start.translateY)).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);

  const snap = () => {
    running.current?.stop();
    running.current = null;
    opacity.setValue(1);
    translateY.setValue(0);
  };

  // Starts an entrance only when the content (key) changes, never on a setting change.
  useEffect(() => {
    if (entranceAction(reducedRef.current) === 'snap') { snap(); return; }
    const from = entranceFrom(false);
    opacity.setValue(from.opacity);
    translateY.setValue(from.translateY);
    const d = duration(motion.standard, false);
    const anim = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: d, delay, easing: easeOut, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: d, delay, easing: easeOut, useNativeDriver: true }),
    ]);
    running.current = anim;
    anim.start(() => { if (running.current === anim) running.current = null; });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationKey]);

  // Motion turned off (or not yet known): finish immediately.
  useEffect(() => { if (reduced) snap(); }, [reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** Loading placeholder with a slow pulse; static under reduced motion. Hidden from screen readers. */
export function Skeleton({ width, height, rounded = radius.sm, style }: {
  width: number | `${number}%`; height: number; rounded?: number; style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    if (!shouldLoop(reduced)) { opacity.setValue(0.55); return; }
    const half = motion.pulse / 2;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: half, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.55, duration: half, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduced, opacity]);
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: rounded, backgroundColor: colours.sand, opacity }, style]}
    />
  );
}
