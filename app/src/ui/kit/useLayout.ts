/** The current layout class and text scale, updated on rotation, split screen and text-size changes. */
import { useWindowDimensions } from 'react-native';
import { layoutClass, type LayoutClass } from './layoutClass';

export function useLayout(): LayoutClass & { fontScale: number } {
  const { width, height, fontScale } = useWindowDimensions();
  return { ...layoutClass(width, height), fontScale };
}
