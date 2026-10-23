/**
 * Musha Empire Authoritative Booking Transaction Service
 * Enforces atomic state transitions, role authorization, and slot synchronization.
 */

import {
  doc,
  runTransaction,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from './config';
import { COLLECTIONS } from './collections';
import type { UserRole } from './types';

export interface BookingActionResult {
  success: boolean;
  message: string;
}

const AUTHORIZED_ACTION_ROLES: UserRole[] = ['admin', 'manager', 'receptionist'];

/**
 * Confirms a pending booking.
 * Allowed transition: pending -> confirmed.
 */
export async function confirmBooking(
  bookingId: string,
  staffUid?: string
): Promise<BookingActionResult> {
  if (!db) throw new Error('Database is not initialized.');
  const firestore = db;

  return await runTransaction(firestore, async (transaction) => {
    // 1. Verify staff role authorization if UID provided
    if (staffUid) {
      const userDocRef = doc(firestore, COLLECTIONS.USERS, staffUid);
      const userSnap = await transaction.get(userDocRef);
      if (userSnap.exists()) {
        const role = userSnap.data()?.role as UserRole;
        if (!AUTHORIZED_ACTION_ROLES.includes(role)) {
          throw new Error('Unauthorized: Staff role does not have permission to confirm bookings.');
        }
      }
    }

    // 2. Fetch authoritative booking record
    const bookingDocRef = doc(firestore, COLLECTIONS.BOOKINGS, bookingId);
    const bookingSnap = await transaction.get(bookingDocRef);

    if (!bookingSnap.exists()) {
      throw new Error(`Booking #${bookingId} was not found in the database.`);
    }

    const bookingData = bookingSnap.data();
    const currentStatus = (bookingData.status || '').toLowerCase();

    // 3. State machine validation
    if (currentStatus !== 'pending') {
      throw new Error(
        `Invalid status transition: Only pending bookings can be confirmed. Current status is "${currentStatus}".`
      );
    }

    // 4. Update booking atomically
    transaction.update(bookingDocRef, {
      status: 'confirmed',
      updated_at: serverTimestamp(),
      updatedAt: new Date().toISOString(),
    });

    // 5. Update associated digital ticket or pass if reference exists
    const ticketDocId = bookingData.ticket_id || bookingData.ticketId;
    if (ticketDocId) {
      const ticketRef = doc(firestore, COLLECTIONS.TICKETS, ticketDocId);
      transaction.update(ticketRef, {
        status: 'confirmed',
        updated_at: serverTimestamp(),
      });
    }

    return {
      success: true,
      message: `Booking #${bookingId} has been successfully confirmed.`,
    };
  });
}

/**
 * Marks a confirmed booking as completed.
 * Allowed transition: confirmed -> completed.
 */
export async function completeBooking(
  bookingId: string,
  staffUid?: string
): Promise<BookingActionResult> {
  if (!db) throw new Error('Database is not initialized.');
  const firestore = db;

  return await runTransaction(firestore, async (transaction) => {
    // 1. Verify staff role authorization
    if (staffUid) {
      const userDocRef = doc(firestore, COLLECTIONS.USERS, staffUid);
      const userSnap = await transaction.get(userDocRef);
      if (userSnap.exists()) {
        const role = userSnap.data()?.role as UserRole;
        if (!AUTHORIZED_ACTION_ROLES.includes(role)) {
          throw new Error('Unauthorized: Staff role does not have permission to complete bookings.');
        }
      }
    }

    // 2. Fetch authoritative booking record
    const bookingDocRef = doc(firestore, COLLECTIONS.BOOKINGS, bookingId);
    const bookingSnap = await transaction.get(bookingDocRef);

    if (!bookingSnap.exists()) {
      throw new Error(`Booking #${bookingId} was not found.`);
    }

    const bookingData = bookingSnap.data();
    const currentStatus = (bookingData.status || '').toLowerCase();

    // 3. State machine validation
    if (currentStatus !== 'confirmed') {
      throw new Error(
        `Invalid status transition: Only confirmed bookings can be marked as completed. Current status is "${currentStatus}".`
      );
    }

    // 4. Update booking atomically
    transaction.update(bookingDocRef, {
      status: 'completed',
      completed_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      updatedAt: new Date().toISOString(),
    });

    // 5. Update associated ticket if reference exists
    const ticketDocId = bookingData.ticket_id || bookingData.ticketId;
    if (ticketDocId) {
      const ticketRef = doc(firestore, COLLECTIONS.TICKETS, ticketDocId);
      transaction.update(ticketRef, {
        status: 'completed',
        updated_at: serverTimestamp(),
      });
    }

    return {
      success: true,
      message: `Booking #${bookingId} marked as completed.`,
    };
  });
}

/**
 * Cancels a booking atomically with reason, updating the booking,
 * associated digital ticket, and releasing reserved time slots.
 * Terminal states (completed, cancelled) cannot be cancelled.
 */
export async function cancelBooking(
  bookingId: string,
  reason: string,
  staffUid?: string
): Promise<BookingActionResult> {
  if (!db) throw new Error('Database is not initialized.');
  const firestore = db;

  if (!reason || !reason.trim()) {
    throw new Error('A valid cancellation reason is required.');
  }

  // Pre-query slot ID associated with this booking if exists
  let slotDocId: string | null = null;
  try {
    const slotsCol = collection(firestore, COLLECTIONS.SLOTS);
    const qSlot = query(slotsCol, where('bookedByBookingId', '==', bookingId), limit(1));
    const snap = await getDocs(qSlot);
    if (!snap.empty) {
      slotDocId = snap.docs[0].id;
    }
  } catch (err) {
    console.warn('Slot reference check notice:', err);
  }

  // Execute atomic cancellation transaction
  return await runTransaction(firestore, async (transaction) => {
    // 1. Verify staff role authorization
    if (staffUid) {
      const userDocRef = doc(firestore, COLLECTIONS.USERS, staffUid);
      const userSnap = await transaction.get(userDocRef);
      if (userSnap.exists()) {
        const role = userSnap.data()?.role as UserRole;
        if (!AUTHORIZED_ACTION_ROLES.includes(role)) {
          throw new Error('Unauthorized: Staff role does not have cancellation permissions.');
        }
      }
    }

    // 2. Fetch authoritative booking record
    const bookingDocRef = doc(firestore, COLLECTIONS.BOOKINGS, bookingId);
    const bookingSnap = await transaction.get(bookingDocRef);

    if (!bookingSnap.exists()) {
      throw new Error(`Booking #${bookingId} was not found.`);
    }

    const bookingData = bookingSnap.data();
    const currentStatus = (bookingData.status || '').toLowerCase();

    // 3. State machine validation
    if (currentStatus === 'cancelled') {
      throw new Error('Booking is already cancelled.');
    }
    if (currentStatus === 'completed') {
      throw new Error('Cannot cancel a completed service appointment.');
    }

    // 4. Update booking record
    transaction.update(bookingDocRef, {
      status: 'cancelled',
      cancellation_reason: reason.trim(),
      cancellationReason: reason.trim(),
      cancelled_at: serverTimestamp(),
      updated_at: serverTimestamp(),
      updatedAt: new Date().toISOString(),
    });

    // 5. Release reserved slot if document ID was identified
    if (slotDocId) {
      const slotRef = doc(firestore, COLLECTIONS.SLOTS, slotDocId);
      const slotSnap = await transaction.get(slotRef);
      if (slotSnap.exists()) {
        transaction.update(slotRef, {
          isAvailable: true,
          bookedByBookingId: null,
          updated_at: serverTimestamp(),
        });
      }
    }

    // 6. Update associated ticket if reference exists
    const ticketDocId = bookingData.ticket_id || bookingData.ticketId;
    if (ticketDocId) {
      const ticketRef = doc(firestore, COLLECTIONS.TICKETS, ticketDocId);
      transaction.update(ticketRef, {
        status: 'cancelled',
        cancellationReason: reason.trim(),
        updated_at: serverTimestamp(),
      });
    }

    return {
      success: true,
      message: `Booking #${bookingId} cancelled and reserved time slot released.`,
    };
  });
}
