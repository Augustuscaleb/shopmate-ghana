import { Platform, StatusBar } from 'react-native';

/** Space for the status bar above green headers. */
export const TOP_INSET = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 48;
/**
 * Android 16 draws apps edge to edge, under the system navigation bar, and React Native cannot
 * report that bar's height without a native safe-area library. 48 dp clears the tallest standard
 * bar (three-button navigation).
 */
export const NAV_BAR_ALLOWANCE = Platform.OS === 'android' ? 48 : 24;
