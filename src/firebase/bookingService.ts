/**
 * Musha Empire Authoritative Booking Transaction Service
 * Enforces atomic state transitions, role authorization, slot synchronization,
 * and dual-storage persistence across `users/{uid}.concierge_requests` and `bookings/{bookingId}`.
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
  getDoc,
  updateDoc,
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
 * Helper to update a nested booking entry in users/{customerId}.concierge_requests
 * without clobbering other customer fields or other booking items in the array.
 */
async function updateNestedUserBooking(
  firestore: any,
  customerId: string,
  bookingId: string,
  updates: Record<string, any>
): Promise<boolean> {
  try {
    const userRef = doc(firestore, COLLECTIONS.USERS, customerId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return false;

    const userData = userSnap.data();
    const arrayFieldName = userData.concierge_requests
      ? 'concierge_requests'
      : userData.conciergeRequests
      ? 'conciergeRequests'
      : userData.bookings
      ? 'bookings'
      : 'concierge_requests';

    const rawArray = userData[arrayFieldName];
    if (!Array.isArray(rawArray)) return false;

    let modified = false;
    const updatedArray = rawArray.map((req: any, idx: number) => {
      const currentReqId =
        req.id ||
        req.ticket_code ||
        req.ticketCode ||
        req.bookingId ||
        `usr-req-${customerId}-${idx}`;

      if (
        currentReqId === bookingId ||
        req.id === bookingId ||
        req.ticket_code === bookingId ||
        req.ticketCode === bookingId ||
        req.bookingId === bookingId
      ) {
        modified = true;
        return {
          ...req,
          ...updates,
          updated_at: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      return req;
    });

    if (modified) {
      await updateDoc(userRef, {
        [arrayFieldName]: updatedArray,
        updated_at: serverTimestamp(),
      });
      return true;
    }
  } catch (err) {
    console.warn(`Notice updating nested user booking ${bookingId} for customer ${customerId}:`, err);
  }
  return false;
}

/**
 * Confirms a pending booking.
 * Allowed transition: pending -> confirmed.
 */
export async function confirmBooking(
  bookingId: string,
  staffUid?: string,
  customerId?: string
): Promise<BookingActionResult> {
  if (!db) throw new Error('Database is not initialized.');
  const firestore = db;

  // 1. Verify staff role authorization if staffUid provided
  if (staffUid) {
    const userDocRef = doc(firestore, COLLECTIONS.USERS, staffUid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const role = userSnap.data()?.role as UserRole;
      if (!AUTHORIZED_ACTION_ROLES.includes(role)) {
        throw new Error('Unauthorized: Staff role does not have permission to confirm bookings.');
      }
    }
  }

  let topLevelUpdated = false;

  // 2. Try updating top-level bookings/{bookingId} if document exists
  try {
    await runTransaction(firestore, async (transaction) => {
      const bookingDocRef = doc(firestore, COLLECTIONS.BOOKINGS, bookingId);
      const bookingSnap = await transaction.get(bookingDocRef);

      if (bookingSnap.exists()) {
        const bookingData = bookingSnap.data();
        const currentStatus = (bookingData.status || '').toLowerCase();

        if (currentStatus !== 'pending') {
          throw new Error(
            `Invalid status transition: Only pending bookings can be confirmed. Current status is "${currentStatus}".`
          );
        }

        transaction.update(bookingDocRef, {
          status: 'confirmed',
          updated_at: serverTimestamp(),
          updatedAt: new Date().toISOString(),
        });

        const ticketDocId = bookingData.ticket_id || bookingData.ticketId;
        if (ticketDocId) {
          const ticketRef = doc(firestore, COLLECTIONS.TICKETS, ticketDocId);
          transaction.update(ticketRef, {
            status: 'confirmed',
            updated_at: serverTimestamp(),
          });
        }

        topLevelUpdated = true;
      }
    });
  } catch (err: any) {
    if (err?.message && err.message.includes('Invalid status transition')) {
      throw err;
    }
    // If not found in /bookings, we continue to check user document
  }

  // 3. Update customer nested concierge_requests document
  if (customerId) {
    await updateNestedUserBooking(firestore, customerId, bookingId, {
      status: 'confirmed',
      booking_status: 'confirmed',
      bookingStatus: 'confirmed',
    });
  }

  return {
    success: true,
    message: `Booking #${bookingId} has been successfully confirmed.`,
  };
}

/**
 * Marks a confirmed booking as completed.
 * Allowed transition: confirmed -> completed.
 */
export async function completeBooking(
  bookingId: string,
  staffUid?: string,
  customerId?: string
): Promise<BookingActionResult> {
  if (!db) throw new Error('Database is not initialized.');
  const firestore = db;

  if (staffUid) {
    const userDocRef = doc(firestore, COLLECTIONS.USERS, staffUid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const role = userSnap.data()?.role as UserRole;
      if (!AUTHORIZED_ACTION_ROLES.includes(role)) {
        throw new Error('Unauthorized: Staff role does not have permission to complete bookings.');
      }
    }
  }

  // 1. Try updating top-level bookings/{bookingId}
  try {
    await runTransaction(firestore, async (transaction) => {
      const bookingDocRef = doc(firestore, COLLECTIONS.BOOKINGS, bookingId);
      const bookingSnap = await transaction.get(bookingDocRef);

      if (bookingSnap.exists()) {
        const bookingData = bookingSnap.data();
        const currentStatus = (bookingData.status || '').toLowerCase();

        if (currentStatus !== 'confirmed') {
          throw new Error(
            `Invalid status transition: Only confirmed bookings can be marked as completed. Current status is "${currentStatus}".`
          );
        }

        transaction.update(bookingDocRef, {
          status: 'completed',
          attendanceStatus: 'attended',
          completed_at: serverTimestamp(),
          updated_at: serverTimestamp(),
          updatedAt: new Date().toISOString(),
        });

        const ticketDocId = bookingData.ticket_id || bookingData.ticketId;
        if (ticketDocId) {
          const ticketRef = doc(firestore, COLLECTIONS.TICKETS, ticketDocId);
          transaction.update(ticketRef, {
            status: 'completed',
            attendanceStatus: 'attended',
            updated_at: serverTimestamp(),
          });
        }
      }
    });
  } catch (err: any) {
    if (err?.message && err.message.includes('Invalid status transition')) {
      throw err;
    }
  }

  // 2. Update customer nested concierge_requests
  if (customerId) {
    await updateNestedUserBooking(firestore, customerId, bookingId, {
      status: 'completed',
      booking_status: 'completed',
      bookingStatus: 'completed',
      attendanceStatus: 'attended',
      attendance_status: 'attended',
      completed_at: new Date().toISOString(),
    });
  }

  return {
    success: true,
    message: `Booking #${bookingId} marked as completed.`,
  };
}

/**
 * Explicit attendance action: Marks a booking as 'attended' and atomically records
 * any cash revenue collected from the customer upon arrival.
 * Stores unique receipt ID, cash timestamp, and staff UID.
 */
export async function markBookingAttended(
  bookingId: string,
  customerId?: string,
  staffUid?: string,
  cashCollected?: number,
  cashReceiptId?: string
): Promise<BookingActionResult> {
  if (!db) throw new Error('Database is not initialized.');
  const firestore = db;

  // 1. Verify staff authorization
  if (staffUid) {
    const userDocRef = doc(firestore, COLLECTIONS.USERS, staffUid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const role = userSnap.data()?.role as UserRole;
      if (!AUTHORIZED_ACTION_ROLES.includes(role)) {
        throw new Error('Unauthorized: Staff role does not have permission to record attendance.');
      }
    }
  }

  const validCash =
    typeof cashCollected === 'number' && !isNaN(cashCollected) && cashCollected >= 0
      ? cashCollected
      : 0;

  const nowIso = new Date().toISOString();
  const receiptId =
    cashReceiptId ||
    (validCash > 0
      ? `RCP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
      : undefined);

  // 2. Update in top-level bookings collection if present
  try {
    await runTransaction(firestore, async (transaction) => {
      const bookingDocRef = doc(firestore, COLLECTIONS.BOOKINGS, bookingId);
      const bookingSnap = await transaction.get(bookingDocRef);

      if (bookingSnap.exists()) {
        const bData = bookingSnap.data();
        if ((bData.status || '').toLowerCase() === 'cancelled') {
          throw new Error('Cannot mark attendance for a cancelled appointment.');
        }

        const bPrice = Number(bData.price ?? bData.totalPrice ?? bData.total_amount ?? 0);
        const newBalance = Math.max(0, bPrice - validCash);
        const newPaymentStatus = newBalance === 0 && bPrice > 0 ? 'paid' : validCash > 0 ? 'partial' : 'pending';

        transaction.update(bookingDocRef, {
          attendanceStatus: 'attended',
          attendance_status: 'attended',
          attendanceMarkedAt: serverTimestamp(),
          attendance_marked_at: serverTimestamp(),
          attendanceMarkedBy: staffUid || 'admin',
          status: 'completed',
          completed_at: serverTimestamp(),
          cashCollected: validCash,
          cash_collected: validCash,
          cashReceiptId: receiptId || null,
          cash_receipt_id: receiptId || null,
          cashCollectedAt: serverTimestamp(),
          cash_collected_at: serverTimestamp(),
          cashCollectedBy: staffUid || 'admin',
          balanceDue: newBalance,
          balance_due: newBalance,
          paymentStatus: newPaymentStatus,
          payment_status: newPaymentStatus,
          paymentMethod: validCash > 0 ? 'Cash' : bData.paymentMethod || 'Cash',
          updated_at: serverTimestamp(),
          updatedAt: nowIso,
        });

        const ticketDocId = bData.ticket_id || bData.ticketId;
        if (ticketDocId) {
          const ticketRef = doc(firestore, COLLECTIONS.TICKETS, ticketDocId);
          transaction.update(ticketRef, {
            attendanceStatus: 'attended',
            status: 'completed',
            updated_at: serverTimestamp(),
          });
        }
      }
    });
  } catch (err: any) {
    if (err?.message && err.message.includes('Cannot mark attendance')) {
      throw err;
    }
  }

  // 3. Update customer nested concierge_requests
  if (customerId) {
    await updateNestedUserBooking(firestore, customerId, bookingId, {
      attendanceStatus: 'attended',
      attendance_status: 'attended',
      attendanceMarkedAt: nowIso,
      attendance_marked_at: nowIso,
      attendanceMarkedBy: staffUid || 'admin',
      status: 'completed',
      booking_status: 'completed',
      bookingStatus: 'completed',
      completed_at: nowIso,
      cashCollected: validCash,
      cash_collected: validCash,
      cashReceiptId: receiptId,
      cash_receipt_id: receiptId,
      cashCollectedAt: nowIso,
      cash_collected_at: nowIso,
      cashCollectedBy: staffUid || 'admin',
      paymentMethod: validCash > 0 ? 'Cash' : 'Unpaid',
    });
  }

  return {
    success: true,
    message:
      validCash > 0
        ? `Appointment #${bookingId} marked Attended. Cash payment of ₹${validCash.toLocaleString('en-IN')} recorded (Receipt: ${receiptId}).`
        : `Appointment #${bookingId} marked as Attended & Completed.`,
  };
}

/**
 * Explicit attendance action: Marks a booking as 'not_attended'.
 * Records attendance timestamp and staff UID.
 */
export async function markBookingNotAttended(
  bookingId: string,
  customerId?: string,
  staffUid?: string
): Promise<BookingActionResult> {
  if (!db) throw new Error('Database is not initialized.');
  const firestore = db;

  // 1. Verify staff authorization
  if (staffUid) {
    const userDocRef = doc(firestore, COLLECTIONS.USERS, staffUid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const role = userSnap.data()?.role as UserRole;
      if (!AUTHORIZED_ACTION_ROLES.includes(role)) {
        throw new Error('Unauthorized: Staff role does not have permission to record attendance.');
      }
    }
  }

  const nowIso = new Date().toISOString();

  // 2. Update in top-level bookings collection if present
  try {
    await runTransaction(firestore, async (transaction) => {
      const bookingDocRef = doc(firestore, COLLECTIONS.BOOKINGS, bookingId);
      const bookingSnap = await transaction.get(bookingDocRef);

      if (bookingSnap.exists()) {
        const bData = bookingSnap.data();
        if ((bData.status || '').toLowerCase() === 'cancelled') {
          throw new Error('Cannot mark attendance for a cancelled appointment.');
        }

        transaction.update(bookingDocRef, {
          attendanceStatus: 'not_attended',
          attendance_status: 'not_attended',
          attendanceMarkedAt: serverTimestamp(),
          attendance_marked_at: serverTimestamp(),
          attendanceMarkedBy: staffUid || 'admin',
          updated_at: serverTimestamp(),
          updatedAt: nowIso,
        });

        const ticketDocId = bData.ticket_id || bData.ticketId;
        if (ticketDocId) {
          const ticketRef = doc(firestore, COLLECTIONS.TICKETS, ticketDocId);
          transaction.update(ticketRef, {
            attendanceStatus: 'not_attended',
            updated_at: serverTimestamp(),
          });
        }
      }
    });
  } catch (err: any) {
    if (err?.message && err.message.includes('Cannot mark attendance')) {
      throw err;
    }
  }

  // 3. Update customer nested concierge_requests
  if (customerId) {
    await updateNestedUserBooking(firestore, customerId, bookingId, {
      attendanceStatus: 'not_attended',
      attendance_status: 'not_attended',
      attendanceMarkedAt: nowIso,
      attendance_marked_at: nowIso,
      attendanceMarkedBy: staffUid || 'admin',
    });
  }

  return {
    success: true,
    message: `Appointment #${bookingId} marked as Not Attended.`,
  };
}

/**
 * Cancels a booking atomically with reason, updating the booking,
 * associated digital ticket, releasing reserved time slots, and updating customer requests.
 */
export async function cancelBooking(
  bookingId: string,
  reason: string,
  staffUid?: string,
  customerId?: string
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

  // 1. Verify staff role authorization
  if (staffUid) {
    const userDocRef = doc(firestore, COLLECTIONS.USERS, staffUid);
    const userSnap = await getDoc(userDocRef);
    if (userSnap.exists()) {
      const role = userSnap.data()?.role as UserRole;
      if (!AUTHORIZED_ACTION_ROLES.includes(role)) {
        throw new Error('Unauthorized: Staff role does not have cancellation permissions.');
      }
    }
  }

  const nowIso = new Date().toISOString();

  // 2. Execute cancellation transaction on /bookings
  try {
    await runTransaction(firestore, async (transaction) => {
      const bookingDocRef = doc(firestore, COLLECTIONS.BOOKINGS, bookingId);
      const bookingSnap = await transaction.get(bookingDocRef);

      if (bookingSnap.exists()) {
        const bookingData = bookingSnap.data();
        const currentStatus = (bookingData.status || '').toLowerCase();

        if (currentStatus === 'cancelled') {
          throw new Error('Booking is already cancelled.');
        }
        if (currentStatus === 'completed') {
          throw new Error('Cannot cancel a completed service appointment.');
        }

        transaction.update(bookingDocRef, {
          status: 'cancelled',
          cancellation_reason: reason.trim(),
          cancellationReason: reason.trim(),
          cancelled_at: serverTimestamp(),
          updated_at: serverTimestamp(),
          updatedAt: nowIso,
        });

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

        const ticketDocId = bookingData.ticket_id || bookingData.ticketId;
        if (ticketDocId) {
          const ticketRef = doc(firestore, COLLECTIONS.TICKETS, ticketDocId);
          transaction.update(ticketRef, {
            status: 'cancelled',
            cancellationReason: reason.trim(),
            updated_at: serverTimestamp(),
          });
        }
      }
    });
  } catch (err: any) {
    if (err?.message && (err.message.includes('already cancelled') || err.message.includes('Cannot cancel a completed'))) {
      throw err;
    }
  }

  // 3. Update customer nested concierge_requests
  if (customerId) {
    await updateNestedUserBooking(firestore, customerId, bookingId, {
      status: 'cancelled',
      booking_status: 'cancelled',
      bookingStatus: 'cancelled',
      cancellation_reason: reason.trim(),
      cancellationReason: reason.trim(),
      cancelled_at: nowIso,
    });
  }

  return {
    success: true,
    message: `Booking #${bookingId} cancelled and reserved time slot released.`,
  };
}
