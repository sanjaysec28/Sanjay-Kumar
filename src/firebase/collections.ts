/**
 * Musha Empire Firestore Collection Names
 * These MUST match the existing collections in the shared Firebase project.
 * Do not rename or create divergent collection paths.
 */

import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from './config';
import type {
  UserProfile,
  ServiceItem,
  OfferItem,
  GalleryItem,
  SalonSettings,
  BookingItem,
  TimeSlot,
  SupportTicket,
} from './types';

export const COLLECTIONS = {
  USERS: 'users',
  SERVICES: 'services',
  OFFERS: 'offers',
  GALLERY: 'gallery',
  SETTINGS: 'settings',
  BOOKINGS: 'bookings',
  SLOTS: 'slots',
  PUBLIC_AVAILABILITY: 'public_availability',
  AVAILABILITY: 'availability',
  TICKETS: 'tickets',
} as const;

// Safe helper for collection reference
export function getCollectionRef<T>(collectionName: string): CollectionReference<T> | null {
  if (!db) return null;
  return collection(db, collectionName) as CollectionReference<T>;
}

// Safe helper for document reference
export function getDocumentRef<T>(collectionName: string, docId: string): DocumentReference<T> | null {
  if (!db) return null;
  return doc(db, collectionName, docId) as DocumentReference<T>;
}

// Specific typed collection getters
export const getCollections = {
  users: () => getCollectionRef<UserProfile>(COLLECTIONS.USERS),
  services: () => getCollectionRef<ServiceItem>(COLLECTIONS.SERVICES),
  offers: () => getCollectionRef<OfferItem>(COLLECTIONS.OFFERS),
  gallery: () => getCollectionRef<GalleryItem>(COLLECTIONS.GALLERY),
  settings: () => getCollectionRef<SalonSettings>(COLLECTIONS.SETTINGS),
  bookings: () => getCollectionRef<BookingItem>(COLLECTIONS.BOOKINGS),
  slots: () => getCollectionRef<TimeSlot>(COLLECTIONS.SLOTS),
  publicAvailability: () => getCollectionRef<Record<string, unknown>>(COLLECTIONS.PUBLIC_AVAILABILITY),
  availability: () => getCollectionRef<Record<string, unknown>>(COLLECTIONS.AVAILABILITY),
  tickets: () => getCollectionRef<SupportTicket>(COLLECTIONS.TICKETS),
};
