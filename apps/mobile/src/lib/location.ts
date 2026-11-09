import * as Location from 'expo-location';

import { LogEvents } from '@linestepper/shared';

import { getZipCenter } from '@/data/reference';

import { logger } from './logger';

/**
 * Locations for the "near" event search. All on the device or in our own
 * database: the phone's GPS (or the browser's location prompt on the web),
 * and ZIP code centers in Supabase. Per the PRD, precise location is never
 * stored; it's rounded and sent with the search only.
 */

export interface Coords {
  lat: number;
  lng: number;
}

export const RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;
export type RadiusMiles = (typeof RADIUS_OPTIONS)[number];
export const DEFAULT_RADIUS: RadiusMiles = 25;

export function isZip(value: string): boolean {
  return /^[0-9]{5}$/.test(value);
}

/** The center of a ZIP area, or null if the ZIP isn't a real one. */
export async function lookupZip(zip: string): Promise<Coords | null> {
  if (!isZip(zip)) return null;
  const { data } = await getZipCenter(zip);
  return data ?? null;
}

export type DeviceLocationResult = Coords | 'denied' | 'unavailable';

/**
 * Asks for location while the app is in use, then reads it. The result is
 * rounded to about half a mile, which is plenty for a radius search.
 */
export async function getDeviceLocation(): Promise<DeviceLocationResult> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return 'denied';
    const position =
      (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    const round = (n: number) => Math.round(n * 100) / 100;
    return { lat: round(position.coords.latitude), lng: round(position.coords.longitude) };
  } catch (err) {
    logger.warn(LogEvents.locationFailed, { message: (err as Error).message });
    return 'unavailable';
  }
}

/** Straight-line distance in miles (same formula as the database search). */
export function distanceMiles(a: Coords, b: Coords): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}
