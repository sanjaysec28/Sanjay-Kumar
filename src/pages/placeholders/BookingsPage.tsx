import React, { useEffect, useState, useMemo } from 'react';
import {
  CalendarDays,
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  Clock,
  User,
  Phone,
  Mail,
  QrCode,
  AlertTriangle,
  AlertCircle,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Sparkles,
  CreditCard,
  ArrowUpDown,
  FileText,
  UserCheck,
  UserX,
  Wallet,
  ShieldCheck,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { COLLECTIONS } from '../../firebase/collections';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from '../../router/Router';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/common/EmptyState';
import {
  normalizeBooking,
  type NormalizedBooking,
} from '../../firebase/types';
import {
  confirmBooking,
  completeBooking,
  cancelBooking,
  markBookingAttended,
  markBookingNotAttended,
} from '../../firebase/bookingService';

/**
 * Helper to format monetary values strictly in Indian Rupees (INR).
 * Never coerces missing/unrecorded prices to ₹0.
 */
const formatPriceINR = (price: number | null | undefined, isAvailable: boolean): string => {
  if (!isAvailable || price === null || price === undefined) {
    return 'Price unavailable';
  }
  return `₹${Number(price).toLocaleString('en-IN')}`;
};

/**
 * Helper to generate 1-2 letter initials from a customer name.
 */
const getInitials = (name: string): string => {
  const clean = (name || '').trim();
  if (!clean) return 'C';
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const BookingsPage: React.FC = () => {
  const { hasPermission, user, signInWithGoogle, error: authError, loading: authLoading } = useAuth();
  const { navigate } = useRouter();

  const canUpdate = hasPermission('bookings.update');
  const canCancel = hasPermission('bookings.cancel');

  // Bookings Data State
  const [bookings, setBookings] = useState<NormalizedBooking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Search, Filter & Sort State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [quickTab, setQuickTab] = useState<
    'all' | 'today' | 'upcoming' | 'pending' | 'completed' | 'not_attended' | 'cancelled' | 'unpaid'
  >('all');
  const [sortOrder, setSortOrder] = useState<'upcoming' | 'newest' | 'price-high' | 'price-low'>('upcoming');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 12;

  // Selected Booking for Detail Drawer & Digital Ticket Modal
  const [detailBooking, setDetailBooking] = useState<NormalizedBooking | null>(null);
  const [ticketModalBooking, setTicketModalBooking] = useState<NormalizedBooking | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Attendance Confirmation Modal State
  // Attendance Confirmation Modal State with Cash Recording
  const [attendanceModal, setAttendanceModal] = useState<{
    isOpen: boolean;
    booking: NormalizedBooking | null;
    action: 'attended' | 'not_attended';
    cashInput: string;
    isSubmitting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    booking: null,
    action: 'attended',
    cashInput: '',
    isSubmitting: false,
    error: null,
  });

  // Cancellation Modal State
  const [cancelModal, setCancelModal] = useState<{
    isOpen: boolean;
    booking: NormalizedBooking | null;
    reason: string;
    isSubmitting: boolean;
    error: string | null;
  }>({
    isOpen: false,
    booking: null,
    reason: '',
    isSubmitting: false,
    error: null,
  });

  // Action Loading State for Confirm/Complete
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Authoritative Timezone: Asia/Kolkata
  const salonTimezone = 'Asia/Kolkata';

  // Today date string in IST (YYYY-MM-DD)
  const todayStr = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: salonTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  }, [salonTimezone]);

  // 1. Subscribe to Firestore `users` (containing nested `concierge_requests` arrays)
  // and `bookings` collection (if top-level records exist), merging without duplication.
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const usersBookingsMap = new Map<string, NormalizedBooking>();
    const topLevelBookingsMap = new Map<string, NormalizedBooking>();

    const updateCombinedBookings = () => {
      const mergedMap = new Map<string, NormalizedBooking>();

      // 1. Add user concierge requests first
      usersBookingsMap.forEach((booking, id) => {
        mergedMap.set(id, booking);
      });

      // 2. Add or overlay top-level bookings
      topLevelBookingsMap.forEach((booking, id) => {
        mergedMap.set(id, booking);
      });

      const loaded = Array.from(mergedMap.values());
      setBookings(loaded);
      setLoading(false);
    };

    // Listener A: `users` collection to extract `concierge_requests` array
    const usersColRef = collection(db, COLLECTIONS.USERS);
    const unsubUsers = onSnapshot(
      usersColRef,
      (snapshot) => {
        usersBookingsMap.clear();

        snapshot.forEach((docSnap) => {
          const userData = docSnap.data() || {};
          const customerUid = docSnap.id;
          const defaultCustomerName = userData.displayName || userData.name || 'Client';
          const defaultCustomerEmail = userData.email || '';
          const defaultCustomerPhone = userData.phoneNumber || userData.phone || undefined;

          // Check for nested concierge_requests array
          const rawRequests = userData.concierge_requests || userData.conciergeRequests || userData.bookings;
          if (Array.isArray(rawRequests)) {
            rawRequests.forEach((req, idx) => {
              if (req && typeof req === 'object') {
                const reqId =
                  req.id ||
                  req.ticket_code ||
                  req.ticketCode ||
                  req.bookingId ||
                  `usr-req-${customerUid}-${idx}`;

                const enrichedData: Record<string, any> = {
                  ...req,
                  customerId: req.customerId || req.customer_id || customerUid,
                  customer_id: req.customer_id || req.customerId || customerUid,
                  customerName: req.customerName || req.customer_name || defaultCustomerName,
                  customer_name: req.customer_name || req.customerName || defaultCustomerName,
                  customerEmail: req.customerEmail || req.customer_email || defaultCustomerEmail,
                  customer_email: req.customer_email || req.customerEmail || defaultCustomerEmail,
                  customerPhone: req.customerPhone || req.customer_phone || defaultCustomerPhone,
                  customer_phone: req.customer_phone || req.customerPhone || defaultCustomerPhone,
                };

                usersBookingsMap.set(reqId, normalizeBooking(reqId, enrichedData));
              }
            });
          }
        });

        updateCombinedBookings();
      },
      (err: any) => {
        const errCode = err?.code || 'unknown';
        const errMsg = err?.message || 'Database query error';
        console.warn('Notice listening to users concierge_requests:', errCode, errMsg);
        if (errCode === 'permission-denied') {
          setError(
            'Missing or insufficient permissions to read users directory. Ensure your signed-in staff account has access.'
          );
        } else {
          setError(`Unable to load bookings from database: [${errCode}] ${errMsg}`);
        }
        setLoading(false);
      }
    );

    // Listener B: `bookings` collection (if top-level collection records exist)
    const bookingsColRef = collection(db, COLLECTIONS.BOOKINGS);
    const unsubBookings = onSnapshot(
      bookingsColRef,
      (snapshot) => {
        topLevelBookingsMap.clear();
        snapshot.forEach((docSnap) => {
          topLevelBookingsMap.set(docSnap.id, normalizeBooking(docSnap.id, docSnap.data()));
        });
        updateCombinedBookings();
      },
      (err: any) => {
        console.warn('Notice listening to top-level bookings:', err?.code, err?.message);
        updateCombinedBookings();
      }
    );

    return () => {
      unsubUsers();
      unsubBookings();
    };
  }, [user]);

  // Compute unique services list for the filter
  const uniqueServices = useMemo(() => {
    const set = new Set<string>();
    bookings.forEach((b) => {
      if (b.serviceName && b.serviceName.trim()) {
        set.add(b.serviceName.trim());
      }
    });
    return Array.from(set).sort();
  }, [bookings]);

  // Tab counts for distinct categories
  const tabCounts = useMemo(() => {
    return {
      all: bookings.length,
      today: bookings.filter((b) => b.date === todayStr && b.status !== 'cancelled').length,
      upcoming: bookings.filter(
        (b) =>
          (b.date || '') >= todayStr &&
          b.status !== 'cancelled' &&
          b.status !== 'completed' &&
          b.attendanceStatus !== 'attended'
      ).length,
      pending: bookings.filter((b) => b.status === 'pending').length,
      completed: bookings.filter(
        (b) =>
          (b.status === 'completed' || b.attendanceStatus === 'attended') &&
          b.attendanceStatus !== 'not_attended'
      ).length,
      not_attended: bookings.filter((b) => b.attendanceStatus === 'not_attended').length,
      cancelled: bookings.filter((b) => b.status === 'cancelled').length,
      unpaid: bookings.filter((b) => b.paymentStatus !== 'paid' && b.status !== 'cancelled').length,
    };
  }, [bookings, todayStr]);

  // Filter & Sort Strategy
  const filteredBookings = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    const filtered = bookings.filter((b) => {
      // 1. Quick Tab Matching (Section 4 Requirements)
      if (quickTab === 'today') {
        if (b.date !== todayStr || b.status === 'cancelled') return false;
      } else if (quickTab === 'upcoming') {
        if (
          (b.date || '') < todayStr ||
          b.status === 'cancelled' ||
          b.status === 'completed' ||
          b.attendanceStatus === 'attended'
        )
          return false;
      } else if (quickTab === 'pending') {
        if (b.status !== 'pending') return false;
      } else if (quickTab === 'completed') {
        if (
          (b.status !== 'completed' && b.attendanceStatus !== 'attended') ||
          b.attendanceStatus === 'not_attended'
        )
          return false;
      } else if (quickTab === 'not_attended') {
        if (b.attendanceStatus !== 'not_attended') return false;
      } else if (quickTab === 'cancelled') {
        if (b.status !== 'cancelled') return false;
      } else if (quickTab === 'unpaid') {
        if (b.paymentStatus === 'paid' || b.status === 'cancelled') return false;
      }

      // 2. Search Query (ID, ticket code, customer name, phone, service)
      if (q) {
        const matchesId = b.id.toLowerCase().includes(q);
        const matchesTicket = (b.ticketCode || '').toLowerCase().includes(q);
        const matchesCustomer = b.customerName.toLowerCase().includes(q);
        const matchesPhone = (b.customerPhone || '').toLowerCase().includes(q);
        const matchesService = b.serviceName.toLowerCase().includes(q);

        if (!matchesId && !matchesTicket && !matchesCustomer && !matchesPhone && !matchesService) {
          return false;
        }
      }

      // 3. Status Filter
      if (statusFilter !== 'all' && b.status !== statusFilter) {
        return false;
      }

      // 4. Payment Filter
      if (paymentFilter !== 'all' && b.paymentStatus !== paymentFilter) {
        return false;
      }

      // 5. Service Filter
      if (serviceFilter !== 'all' && b.serviceName !== serviceFilter) {
        return false;
      }

      // 6. Specific Date Filter
      if (dateFilter && b.date !== dateFilter) {
        return false;
      }

      return true;
    });

    // Apply Sorting
    return filtered.sort((a, b) => {
      if (sortOrder === 'upcoming') {
        const aUpcoming = (a.date || '') >= todayStr;
        const bUpcoming = (b.date || '') >= todayStr;
        if (aUpcoming && !bUpcoming) return -1;
        if (!aUpcoming && bUpcoming) return 1;
        if (aUpcoming && bUpcoming) {
          const d = (a.date || '').localeCompare(b.date || '');
          if (d !== 0) return d;
          return (a.time || '').localeCompare(b.time || '');
        }
        const d = (b.date || '').localeCompare(a.date || '');
        if (d !== 0) return d;
        return (b.time || '').localeCompare(a.time || '');
      } else if (sortOrder === 'newest') {
        const d = (b.date || '').localeCompare(a.date || '');
        if (d !== 0) return d;
        return (b.time || '').localeCompare(a.time || '');
      } else if (sortOrder === 'price-high') {
        const pA = a.isPriceAvailable && a.price !== null ? a.price : -1;
        const pB = b.isPriceAvailable && b.price !== null ? b.price : -1;
        return pB - pA;
      } else if (sortOrder === 'price-low') {
        const pA = a.isPriceAvailable && a.price !== null ? a.price : 99999999;
        const pB = b.isPriceAvailable && b.price !== null ? b.price : 99999999;
        return pA - pB;
      }
      return 0;
    });
  }, [bookings, searchQuery, statusFilter, paymentFilter, serviceFilter, dateFilter, quickTab, todayStr, sortOrder]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / pageSize));
  const paginatedBookings = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredBookings.slice(start, start + pageSize);
  }, [filteredBookings, currentPage, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, paymentFilter, serviceFilter, dateFilter, quickTab, sortOrder]);

  // Keep detailBooking in sync if bookings update in real-time
  useEffect(() => {
    if (detailBooking) {
      const refreshed = bookings.find((b) => b.id === detailBooking.id);
      if (refreshed) {
        setDetailBooking(refreshed);
      }
    }
  }, [bookings]);

  // Handle Confirm Booking
  const handleConfirm = async (booking: NormalizedBooking) => {
    if (!canUpdate) return;
    setProcessingId(booking.id);
    try {
      const res = await confirmBooking(booking.id, user?.uid, booking.customerId);
      showSuccess(res.message);
    } catch (err: any) {
      console.error('Error confirming booking:', err);
      setError(err?.message || 'Failed to confirm booking.');
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Mark Completed
  const handleComplete = async (booking: NormalizedBooking) => {
    if (!canUpdate) return;
    setProcessingId(booking.id);
    try {
      const res = await completeBooking(booking.id, user?.uid, booking.customerId);
      showSuccess(res.message);
    } catch (err: any) {
      console.error('Error marking booking completed:', err);
      setError(err?.message || 'Failed to mark booking as completed.');
    } finally {
      setProcessingId(null);
    }
  };

  // Helpers to initiate Attendance Modal with Cash Recording Defaults
  const openAttendedModal = (b: NormalizedBooking) => {
    // If booking has price, pre-fill with outstanding balance (or booking price if uncollected)
    const initialCash =
      b.isPriceAvailable && b.price !== null
        ? (b.balanceDue !== undefined && b.balanceDue !== null ? b.balanceDue : b.price).toString()
        : '0';

    setAttendanceModal({
      isOpen: true,
      booking: b,
      action: 'attended',
      cashInput: initialCash,
      isSubmitting: false,
      error: null,
    });
  };

  const openNotAttendedModal = (b: NormalizedBooking) => {
    setAttendanceModal({
      isOpen: true,
      booking: b,
      action: 'not_attended',
      cashInput: '0',
      isSubmitting: false,
      error: null,
    });
  };

  // Handle Attendance Action Execution from Confirmation Dialog
  const handleExecuteAttendance = async () => {
    const { booking, action, cashInput } = attendanceModal;
    if (!booking) return;

    setAttendanceModal((prev) => ({ ...prev, isSubmitting: true, error: null }));
    try {
      let res;
      if (action === 'attended') {
        const parsedCash = parseFloat(cashInput) || 0;
        if (parsedCash < 0) {
          setAttendanceModal((prev) => ({
            ...prev,
            isSubmitting: false,
            error: 'Cash collected amount cannot be negative.',
          }));
          return;
        }

        res = await markBookingAttended(booking.id, booking.customerId, user?.uid, parsedCash);
      } else {
        res = await markBookingNotAttended(booking.id, booking.customerId, user?.uid);
      }

      showSuccess(res.message);
      const recordedCash = action === 'attended' ? parseFloat(cashInput) || 0 : 0;

      setAttendanceModal({
        isOpen: false,
        booking: null,
        action: 'attended',
        cashInput: '',
        isSubmitting: false,
        error: null,
      });

      if (detailBooking?.id === booking.id) {
        setDetailBooking((prev) =>
          prev
            ? {
                ...prev,
                attendanceStatus: action,
                status: action === 'attended' ? 'completed' : prev.status,
                cashCollected: action === 'attended' ? recordedCash : prev.cashCollected,
                balanceDue:
                  action === 'attended' && prev.price !== null
                    ? Math.max(0, (prev.price ?? 0) - (prev.amountPaid || 0) - recordedCash)
                    : prev.balanceDue,
              }
            : null
        );
      }
    } catch (err: any) {
      console.error('Attendance recording error:', err);
      setAttendanceModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: err?.message || 'Failed to update attendance record. Check permissions.',
      }));
    }
  };

  // Execute Confirmed Cancellation
  const handleExecuteCancel = async () => {
    const { booking, reason } = cancelModal;
    if (!booking) return;

    if (!reason.trim()) {
      setCancelModal((prev) => ({ ...prev, error: 'Please enter a cancellation reason.' }));
      return;
    }

    setCancelModal((prev) => ({ ...prev, isSubmitting: true, error: null }));
    try {
      const res = await cancelBooking(booking.id, reason, user?.uid, booking.customerId);
      showSuccess(res.message);
      setCancelModal({
        isOpen: false,
        booking: null,
        reason: '',
        isSubmitting: false,
        error: null,
      });
      if (detailBooking?.id === booking.id) {
        setDetailBooking((prev) => (prev ? { ...prev, status: 'cancelled', cancellationReason: reason } : null));
      }
    } catch (err: any) {
      console.error('Cancellation error:', err);
      setCancelModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: err?.message || 'Cancellation failed. Please check permissions.',
      }));
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const showSuccess = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 4500);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge variant="blue">Confirmed</Badge>;
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="danger">Cancelled</Badge>;
      case 'pending':
      default:
        return <Badge variant="warning">Pending</Badge>;
    }
  };

  const getPaymentBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge variant="success">Paid</Badge>;
      case 'refunded':
        return <Badge variant="neutral">Refunded</Badge>;
      case 'pending':
      default:
        return <Badge variant="warning">Unpaid</Badge>;
    }
  };

  const getAttendanceBadge = (booking: NormalizedBooking) => {
    if (booking.status === 'cancelled') {
      return null;
    }
    if (booking.attendanceStatus === 'attended' || booking.status === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#F0FDF4] text-[#16A34A] border border-[#DCFCE7]">
          <CheckCircle2 className="w-3 h-3" /> Attended
        </span>
      );
    }
    if (booking.attendanceStatus === 'not_attended') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#FEF2F2] text-[#DC2626] border border-[#FEE2E2]">
          <UserX className="w-3 h-3" /> Not Attended
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#F3F4F6] text-[#6B7280]">
        <Clock className="w-3 h-3" /> Attendance Pending
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans">
      {/* 1. HEADER SECTION & SUMMARY METRICS */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold text-[#B7791F] uppercase tracking-wider block">
              MUSHA EMPIRE ADMIN PORTAL
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#171513] tracking-tight mt-0.5">
              Appointments & Attendance
            </h1>
            <p className="text-xs sm:text-sm text-[#6B7280] font-normal mt-1 max-w-2xl">
              Real-time salon appointment scheduling, client attendance recording, and INR payment tracking.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6B7280]">
              Timezone: <strong className="text-[#171513] font-semibold">Asia/Kolkata (IST)</strong>
            </span>
          </div>
        </div>

        {/* 8 COMPREHENSIVE FILTER TABS WITH LIVE COUNTS (Section 4) */}
        <div className="mt-4 pt-3.5 border-t border-[#F3F4F6] flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { key: 'all', label: `All Bookings (${tabCounts.all})` },
            { key: 'today', label: `Today (${tabCounts.today})` },
            { key: 'upcoming', label: `Upcoming (${tabCounts.upcoming})` },
            { key: 'pending', label: `Pending Confirmation (${tabCounts.pending})` },
            { key: 'completed', label: `Attended / Completed (${tabCounts.completed})` },
            { key: 'not_attended', label: `Not Attended (${tabCounts.not_attended})` },
            { key: 'cancelled', label: `Cancelled (${tabCounts.cancelled})` },
            { key: 'unpaid', label: `Payments Pending (${tabCounts.unpaid})` },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setQuickTab(tab.key as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                quickTab === tab.key
                  ? 'bg-[#171513] text-white shadow-xs'
                  : 'bg-[#F9FAFB] text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] border border-[#E5E7EB]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Unauthenticated / Sign-in required banner */}
        {!user && (
          <div className="mt-4 p-4 rounded-xl bg-[#FFFBEB] border border-[#FCD34D] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#92400E]">
            <div className="flex items-start sm:items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-[#D97706] shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <p className="font-bold text-[#78350F]">
                  Firebase Sign-In Required for Live Bookings
                </p>
                <p className="text-[#92400E] mt-0.5">
                  Firestore security rules require an authenticated staff user to read and stream appointments. Sign in with your authorized admin account.
                </p>
              </div>
            </div>
            <button
              onClick={() => signInWithGoogle()}
              disabled={authLoading}
              className="px-4 py-2 bg-[#B7791F] hover:bg-[#975A16] active:scale-95 text-white rounded-lg font-semibold text-xs transition-all shrink-0 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              {authLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <User className="w-3.5 h-3.5" />
                  <span>Sign In with Staff Account</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Authentication Error Alert */}
        {authError && (
          <div className="mt-4 p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] flex items-center justify-between text-xs text-[#DC2626]">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
              <span>{authError}</span>
            </div>
          </div>
        )}

        {/* Action Success Alert */}
        {actionSuccess && (
          <div className="mt-4 p-3.5 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7] flex items-center justify-between text-xs text-[#166534]">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button
              onClick={() => setActionSuccess(null)}
              className="text-[#166534] hover:text-[#14532D] font-bold cursor-pointer ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mt-4 p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] flex items-center justify-between text-xs text-[#DC2626]">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-[#DC2626] hover:text-[#991B1B] font-bold cursor-pointer ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 2. SEARCH, FILTER & SORT CONTROLS */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            {/* Search Input */}
            <div className="relative sm:col-span-2 lg:col-span-2">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9CA3AF]">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ticket code, customer, phone, service..."
                className="w-full pl-9 pr-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] placeholder-[#9CA3AF] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all min-h-[40px]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#9CA3AF] hover:text-[#171513]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all appearance-none cursor-pointer min-h-[40px]"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B7280]">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            {/* Payment Filter */}
            <div className="relative">
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all appearance-none cursor-pointer min-h-[40px]"
              >
                <option value="all">All Payments</option>
                <option value="paid">Paid</option>
                <option value="pending">Unpaid / Pending</option>
                <option value="refunded">Refunded</option>
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B7280]">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            {/* Service Filter */}
            <div className="relative">
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all appearance-none cursor-pointer min-h-[40px]"
              >
                <option value="all">All Services</option>
                {uniqueServices.map((svc) => (
                  <option key={svc} value={svc}>
                    {svc}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B7280]">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            {/* Sort Order */}
            <div className="relative">
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all appearance-none cursor-pointer min-h-[40px]"
              >
                <option value="upcoming">Upcoming First</option>
                <option value="newest">Newest First</option>
                <option value="price-high">Price: High to Low</option>
                <option value="price-low">Price: Low to High</option>
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B7280]">
                <ArrowUpDown className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Active Filter Chips & Clear Option */}
          {(searchQuery || statusFilter !== 'all' || serviceFilter !== 'all' || dateFilter || paymentFilter !== 'all' || sortOrder !== 'upcoming') && (
            <div className="mt-3 pt-3 border-t border-[#F3F4F6] flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[#6B7280]">Filters:</span>
                {searchQuery && <Badge variant="blue">Query: &quot;{searchQuery}&quot;</Badge>}
                {statusFilter !== 'all' && <Badge variant="neutral">Status: {statusFilter}</Badge>}
                {paymentFilter !== 'all' && <Badge variant="neutral">Payment: {paymentFilter}</Badge>}
                {serviceFilter !== 'all' && <Badge variant="gold">Service: {serviceFilter}</Badge>}
                {dateFilter && <Badge variant="neutral">Date: {dateFilter}</Badge>}
                {sortOrder !== 'upcoming' && <Badge variant="neutral">Sorted: {sortOrder}</Badge>}
              </div>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setServiceFilter('all');
                  setDateFilter('');
                  setPaymentFilter('all');
                  setSortOrder('upcoming');
                }}
                className="text-[#DC2626] hover:underline font-semibold cursor-pointer text-[11px]"
              >
                Reset Filters
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. RESPONSIVE CARD GRID VIEW */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <h2 className="text-base font-bold text-[#171513]">
              Appointments ({filteredBookings.length})
            </h2>
            <p className="text-xs text-[#6B7280]">
              Click any card to inspect full details, record client attendance, or manage status.
            </p>
          </div>
          <span className="text-xs text-[#6B7280] font-medium">
            Page {currentPage} of {totalPages}
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-[#E5E7EB] p-5 space-y-4 animate-pulse"
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-full bg-[#E5E7EB]"></div>
                  <div className="h-5 bg-[#E5E7EB] rounded w-20"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-[#E5E7EB] rounded w-32"></div>
                  <div className="h-3 bg-[#E5E7EB] rounded w-48"></div>
                </div>
                <div className="h-8 bg-[#E5E7EB] rounded"></div>
              </div>
            ))}
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E5E7EB] p-8">
            <EmptyState
              title={!user ? 'Sign in to access live bookings' : 'No bookings match your criteria'}
              description={
                !user
                  ? 'Firestore access requires an authenticated staff user. Sign in with your authorized admin account to view live customer bookings.'
                  : bookings.length === 0
                  ? 'No appointments have been booked yet in the shared database.'
                  : 'Try selecting a different view tab or clearing your filter criteria.'
              }
              icon={
                !user ? (
                  <AlertTriangle className="w-8 h-8 text-[#D97706]" />
                ) : (
                  <CalendarDays className="w-8 h-8 text-[#B7791F]" />
                )
              }
              action={
                !user ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => signInWithGoogle()}
                  >
                    Sign In to View Bookings
                  </Button>
                ) : bookings.length > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('all');
                      setServiceFilter('all');
                      setDateFilter('');
                      setPaymentFilter('all');
                      setQuickTab('all');
                    }}
                  >
                    Clear Filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            {/* 3-COLUMN DESKTOP / 2-COLUMN TABLET / 1-COLUMN MOBILE CARD GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {paginatedBookings.map((b) => {
                const initials = getInitials(b.customerName);
                const isCancelled = b.status === 'cancelled';
                const isAttended = b.attendanceStatus === 'attended' || b.status === 'completed';
                const isNotAttended = b.attendanceStatus === 'not_attended';

                return (
                  <div
                    key={b.id}
                    onClick={() => setDetailBooking(b)}
                    className="group relative bg-white rounded-2xl border border-[#E5E7EB] hover:border-[#D6A84F] hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] transition-all duration-200 cursor-pointer p-4 sm:p-5 flex flex-col justify-between"
                  >
                    <div>
                      {/* Top Row: Client Avatar + Name + Ticket Code Pill */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-[#FEF9EE] border border-[#FCEEC8] text-[#B7791F] font-bold text-xs flex items-center justify-center shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-sm text-[#171513] truncate group-hover:text-[#B7791F] transition-colors">
                              {b.customerName}
                            </h3>
                            <p className="text-[11px] text-[#6B7280] truncate">
                              {b.customerPhone || b.customerEmail || 'No contact specified'}
                            </p>
                          </div>
                        </div>

                        {/* Ticket / Reference Code */}
                        <div className="shrink-0 text-right">
                          <span className="inline-block font-mono font-bold text-[11px] text-[#B7791F] bg-[#FEF9EE] border border-[#FCEEC8] px-2 py-0.5 rounded-md">
                            {b.ticketCode || `#${b.id.slice(0, 8)}`}
                          </span>
                        </div>
                      </div>

                      {/* Middle: Service & Treatment info */}
                      <div className="mt-3.5 pt-3 border-t border-[#F3F4F6]">
                        <h4 className="font-semibold text-sm text-[#171513] line-clamp-1">
                          {b.serviceName}
                        </h4>
                        <div className="flex items-center gap-1.5 text-xs text-[#6B7280] mt-1">
                          <span>{b.category || 'Salon Service'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{b.durationMinutes || 60}m</span>
                          {b.gender && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{b.gender}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Schedule Bar */}
                      <div className="mt-3 py-2 px-3 rounded-xl bg-[#FAFBFD] border border-[#F3F4F6] flex items-center justify-between text-xs text-[#374151]">
                        <div className="flex items-center gap-1.5 font-medium">
                          <CalendarDays className="w-3.5 h-3.5 text-[#B7791F]" />
                          <span>{b.date || 'Date TBD'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[#6B7280]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{b.time ? `${b.time}${b.endTime ? ` - ${b.endTime}` : ''}` : 'Time TBD'}</span>
                        </div>
                      </div>

                      {/* Attendance Status Indicator */}
                      <div className="mt-2.5 flex items-center justify-between text-xs">
                        <span className="text-[11px] font-medium text-[#6B7280]">Attendance:</span>
                        {getAttendanceBadge(b)}
                      </div>
                    </div>

                    {/* Bottom: INR Price + Status Badges & Attendance Action Strip */}
                    <div className="mt-3.5 pt-3 border-t border-[#F3F4F6]">
                      <div className="flex items-center justify-between gap-2">
                        {/* Prominent INR Price */}
                        <div>
                          <span className="text-[10px] uppercase font-bold text-[#9CA3AF] tracking-wider block">
                            Booking Value
                          </span>
                          {b.isPriceAvailable && b.price !== null ? (
                            <div>
                              <span className="text-base sm:text-lg font-bold text-[#171513] tabular-nums tracking-tight">
                                ₹{b.price.toLocaleString('en-IN')}
                              </span>
                              {b.cashCollected !== undefined && b.cashCollected > 0 && (
                                <span className="text-[10px] text-[#16A34A] font-semibold block">
                                  Cash: ₹{b.cashCollected.toLocaleString('en-IN')}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs font-medium text-[#9CA3AF] italic">
                              Price unavailable
                            </span>
                          )}
                        </div>

                        {/* Status Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                          {getStatusBadge(b.status)}
                          {getPaymentBadge(b.paymentStatus)}
                        </div>
                      </div>

                      {/* Attendance Actions Row (Section 3 & 5) */}
                      {!isCancelled && canUpdate && (
                        <div
                          className="mt-3 pt-2.5 border-t border-[#F3F4F6] flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!isAttended && (
                            <button
                              onClick={() => openAttendedModal(b)}
                              className="flex-1 py-1 px-2 rounded-lg text-[11px] font-semibold bg-[#F0FDF4] text-[#16A34A] border border-[#DCFCE7] hover:bg-[#DCFCE7] transition-all flex items-center justify-center gap-1 cursor-pointer"
                              title="Confirm client arrival and cash collection"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Mark Attended</span>
                            </button>
                          )}

                          {!isNotAttended && (
                            <button
                              onClick={() => openNotAttendedModal(b)}
                              className={`py-1 px-2 rounded-lg text-[11px] font-semibold bg-[#FEF2F2] text-[#DC2626] border border-[#FEE2E2] hover:bg-[#FEE2E2] transition-all flex items-center justify-center gap-1 cursor-pointer ${
                                isAttended ? 'w-full' : 'flex-1'
                              }`}
                              title="Mark client not attended"
                            >
                              <UserX className="w-3.5 h-3.5" />
                              <span>Not Attended</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Interactive Secondary Strip */}
                      <div className="mt-2.5 pt-2 border-t border-[#F3F4F6] flex items-center justify-between text-xs">
                        <span className="text-[11px] font-semibold text-[#B7791F] group-hover:underline flex items-center gap-1">
                          View details <ChevronRight className="w-3 h-3" />
                        </span>

                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {/* Digital QR Ticket */}
                          {b.ticketCode && (
                            <button
                              onClick={() => setTicketModalBooking(b)}
                              title="Digital QR Ticket"
                              className="p-1.5 rounded-lg text-[#B7791F] hover:bg-[#FEF9EE] transition-colors cursor-pointer"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Quick Confirm */}
                          {canUpdate && b.status === 'pending' && (
                            <button
                              onClick={() => handleConfirm(b)}
                              disabled={processingId === b.id}
                              title="Confirm Booking"
                              className="p-1.5 rounded-lg text-[#16A34A] hover:bg-[#F0FDF4] transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Quick Cancel */}
                          {canCancel && !isCancelled && b.status !== 'completed' && (
                            <button
                              onClick={() =>
                                setCancelModal({
                                  isOpen: true,
                                  booking: b,
                                  reason: '',
                                  isSubmitting: false,
                                  error: null,
                                })
                              }
                              title="Cancel Appointment"
                              className="p-1.5 rounded-lg text-[#DC2626] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* PAGINATION CONTROLS */}
            {totalPages > 1 && (
              <div className="mt-6 p-4 bg-white rounded-2xl border border-[#E5E7EB] flex items-center justify-between text-xs text-[#6B7280]">
                <span>
                  Showing {(currentPage - 1) * pageSize + 1} to{' '}
                  {Math.min(currentPage * pageSize, filteredBookings.length)} of{' '}
                  {filteredBookings.length}
                </span>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
                  >
                    Prev
                  </Button>
                  <span className="px-2 font-bold text-[#171513]">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 4. APPOINTMENT DETAILS DRAWER */}
      {detailBooking && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-[#171513]/40 backdrop-blur-xs transition-opacity"
          onClick={() => setDetailBooking(null)}
        >
          <div
            className="w-full sm:max-w-xl bg-white h-full shadow-2xl flex flex-col z-50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-5 sm:p-6 border-b border-[#E5E7EB] flex items-start justify-between bg-white shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-[#B7791F] uppercase tracking-wider">
                    APPOINTMENT RECORD
                  </span>
                  <span className="font-mono text-xs text-[#6B7280]">
                    #{detailBooking.id.slice(0, 10)}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-[#171513] mt-1">
                  {detailBooking.serviceName}
                </h3>
              </div>

              <button
                onClick={() => setDetailBooking(null)}
                className="p-1.5 rounded-xl text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] cursor-pointer transition-colors"
                title="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1 text-xs text-[#171513]">
              {/* Quick Status Bar */}
              <div className="p-4 rounded-xl bg-[#FAFBFD] border border-[#E5E7EB] flex items-center justify-between flex-wrap gap-3">
                <div>
                  <span className="text-[#6B7280] text-[11px] block">Booking Status</span>
                  <div className="mt-1">{getStatusBadge(detailBooking.status)}</div>
                </div>

                <div>
                  <span className="text-[#6B7280] text-[11px] block">Payment Status</span>
                  <div className="mt-1">{getPaymentBadge(detailBooking.paymentStatus)}</div>
                </div>

                <div>
                  <span className="text-[#6B7280] text-[11px] block">Attendance</span>
                  <div className="mt-1">{getAttendanceBadge(detailBooking)}</div>
                </div>

                <div className="text-right">
                  <span className="text-[#6B7280] text-[11px] block">Digital Ticket</span>
                  <span className="font-mono font-bold text-xs text-[#B7791F]">
                    {detailBooking.ticketCode || 'None Assigned'}
                  </span>
                </div>
              </div>

              {/* Attendance Management Banner in Drawer (Section 3) */}
              {detailBooking.status !== 'cancelled' && canUpdate && (
                <div className="p-4 rounded-xl bg-[#FEF9EE] border border-[#FCEEC8] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-[#B7791F] uppercase tracking-wider">
                      Attendance Controls
                    </span>
                    {Boolean(detailBooking.attendanceMarkedAt) && (
                      <span className="text-[10px] text-[#8D580F]">
                        Marked:{' '}
                        {typeof detailBooking.attendanceMarkedAt === 'string'
                          ? new Date(detailBooking.attendanceMarkedAt).toLocaleString('en-IN', { timeZone: salonTimezone })
                          : 'Recorded'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant={detailBooking.attendanceStatus === 'attended' ? 'outline' : 'primary'}
                      size="sm"
                      onClick={() => openAttendedModal(detailBooking)}
                      leftIcon={<UserCheck className="w-3.5 h-3.5" />}
                      className={`flex-1 text-xs ${detailBooking.attendanceStatus !== 'attended' ? 'bg-[#16A34A] border-[#16A34A] hover:bg-[#15803D]' : ''}`}
                      disabled={detailBooking.attendanceStatus === 'attended'}
                    >
                      {detailBooking.attendanceStatus === 'attended' ? 'Attended ✓' : 'Mark Attended'}
                    </Button>
                    <Button
                      variant={detailBooking.attendanceStatus === 'not_attended' ? 'outline' : 'danger'}
                      size="sm"
                      onClick={() => openNotAttendedModal(detailBooking)}
                      leftIcon={<UserX className="w-3.5 h-3.5" />}
                      className="flex-1 text-xs"
                      disabled={detailBooking.attendanceStatus === 'not_attended'}
                    >
                      {detailBooking.attendanceStatus === 'not_attended' ? 'Not Attended ✓' : 'Mark Not Attended'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Client Information Section */}
              <div className="p-4 rounded-xl border border-[#E5E7EB] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-[#171513] flex items-center gap-1.5">
                    <User className="w-4 h-4 text-[#B7791F]" /> Client Details
                  </h4>
                  {detailBooking.customerId && (
                    <button
                      onClick={() => {
                        setDetailBooking(null);
                        navigate('/admin/customers');
                      }}
                      className="text-[#B7791F] font-semibold hover:underline cursor-pointer text-xs"
                    >
                      View Profile →
                    </button>
                  )}
                </div>

                <div className="space-y-2 text-xs pt-1">
                  <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                    <span className="text-[#6B7280]">Full Name:</span>
                    <span className="font-semibold text-[#171513]">{detailBooking.customerName}</span>
                  </div>

                  {detailBooking.customerPhone && (
                    <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                      <span className="text-[#6B7280]">Phone Number:</span>
                      <a
                        href={`tel:${detailBooking.customerPhone}`}
                        className="font-medium text-[#2563EB] hover:underline flex items-center gap-1"
                      >
                        <Phone className="w-3 h-3" />
                        {detailBooking.customerPhone}
                      </a>
                    </div>
                  )}

                  {detailBooking.customerEmail && (
                    <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                      <span className="text-[#6B7280]">Email Address:</span>
                      <a
                        href={`mailto:${detailBooking.customerEmail}`}
                        className="font-medium text-[#2563EB] hover:underline flex items-center gap-1"
                      >
                        <Mail className="w-3 h-3" />
                        {detailBooking.customerEmail}
                      </a>
                    </div>
                  )}

                  <div className="flex justify-between py-1">
                    <span className="text-[#6B7280]">Customer ID:</span>
                    <span className="font-mono text-[#6B7280]">
                      {detailBooking.customerId || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Appointment Schedule & Service Specifications */}
              <div className="p-4 rounded-xl border border-[#E5E7EB] space-y-3">
                <h4 className="font-bold text-sm text-[#171513] flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-[#B7791F]" /> Appointment & Treatment
                </h4>

                <div className="space-y-2 text-xs pt-1">
                  <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                    <span className="text-[#6B7280]">Scheduled Date:</span>
                    <span className="font-bold text-[#171513]">{detailBooking.date || 'TBD'}</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                    <span className="text-[#6B7280]">Time Slot:</span>
                    <span className="font-semibold text-[#171513]">
                      {detailBooking.time ? `${detailBooking.time}${detailBooking.endTime ? ` - ${detailBooking.endTime}` : ''}` : 'Anytime'}
                    </span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                    <span className="text-[#6B7280]">Treatment Name:</span>
                    <span className="font-semibold text-[#171513]">{detailBooking.serviceName}</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                    <span className="text-[#6B7280]">Category:</span>
                    <span className="font-medium text-[#171513]">{detailBooking.category || 'Salon Service'}</span>
                  </div>

                  <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                    <span className="text-[#6B7280]">Duration:</span>
                    <span className="font-medium text-[#171513]">{detailBooking.durationMinutes || 60} Minutes</span>
                  </div>

                  <div className="flex justify-between py-1">
                    <span className="text-[#6B7280]">Target Client:</span>
                    <span className="font-medium text-[#171513]">{detailBooking.gender || 'All Clients'}</span>
                  </div>
                </div>

                {/* Itemized Services if present */}
                {detailBooking.items && detailBooking.items.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#F3F4F6]">
                    <span className="font-bold text-xs text-[#171513] block mb-2">Itemized Services:</span>
                    <div className="space-y-1.5">
                      {detailBooking.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between items-center py-1 px-2.5 rounded-lg bg-[#FAFBFD] border border-[#F3F4F6]">
                          <span className="font-medium">{it.name}</span>
                          <span className="font-bold tabular-nums">
                            {it.price !== undefined ? formatPriceINR(it.price, true) : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Comprehensive Payment & Financial Breakdown (INR) */}
              <div className="p-4 rounded-xl border border-[#E5E7EB] space-y-3 bg-[#FAFBFD]">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-[#171513] flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-[#B7791F]" /> Financial Breakdown
                  </h4>
                  <span className="text-[11px] font-semibold text-[#6B7280]">
                    Indian Rupees (₹)
                  </span>
                </div>

                <div className="space-y-2 text-xs pt-1">
                  {/* Subtotal */}
                  <div className="flex justify-between py-1 border-b border-[#E5E7EB]">
                    <span className="text-[#6B7280]">Subtotal:</span>
                    <span className="font-semibold text-[#171513] tabular-nums">
                      {detailBooking.subtotal !== undefined
                        ? formatPriceINR(detailBooking.subtotal, true)
                        : formatPriceINR(detailBooking.price, detailBooking.isPriceAvailable)}
                    </span>
                  </div>

                  {/* Discount */}
                  {detailBooking.discount !== undefined && detailBooking.discount > 0 && (
                    <div className="flex justify-between py-1 border-b border-[#E5E7EB] text-[#16A34A]">
                      <span>Discount Applied:</span>
                      <span className="font-semibold tabular-nums">
                        - {formatPriceINR(detailBooking.discount, true)}
                      </span>
                    </div>
                  )}

                  {/* Final / Total Amount */}
                  <div className="flex justify-between py-1.5 border-b border-[#E5E7EB]">
                    <span className="font-bold text-[#171513]">Booking Price (Value):</span>
                    <span className="font-bold text-sm text-[#171513] tabular-nums">
                      {formatPriceINR(detailBooking.price, detailBooking.isPriceAvailable)}
                    </span>
                  </div>

                  {/* Amount Paid / Advance */}
                  <div className="flex justify-between py-1 border-b border-[#E5E7EB]">
                    <span className="text-[#6B7280]">Advance / Online Paid:</span>
                    <span className="font-semibold text-[#16A34A] tabular-nums">
                      {formatPriceINR(detailBooking.amountPaid ?? 0, true)}
                    </span>
                  </div>

                  {/* Cash Collected at Attendance */}
                  {detailBooking.cashCollected !== undefined && (
                    <div className="flex justify-between py-1 border-b border-[#E5E7EB]">
                      <span className="text-[#6B7280]">Cash Collected (at Attendance):</span>
                      <span className="font-bold text-[#16A34A] tabular-nums">
                        {formatPriceINR(detailBooking.cashCollected, true)}
                      </span>
                    </div>
                  )}

                  {/* Cash Receipt ID */}
                  {detailBooking.cashReceiptId && (
                    <div className="flex justify-between py-1 border-b border-[#E5E7EB]">
                      <span className="text-[#6B7280]">Cash Receipt ID:</span>
                      <span className="font-mono text-[11px] font-bold text-[#B7791F]">
                        {detailBooking.cashReceiptId}
                      </span>
                    </div>
                  )}

                  {/* Balance Due */}
                  <div className="flex justify-between py-1 border-b border-[#E5E7EB]">
                    <span className="text-[#6B7280]">Balance Due:</span>
                    <span className={`font-bold tabular-nums ${(detailBooking.balanceDue ?? 0) > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'}`}>
                      {detailBooking.balanceDue !== null && detailBooking.balanceDue !== undefined
                        ? formatPriceINR(detailBooking.balanceDue, true)
                        : detailBooking.isPriceAvailable && detailBooking.price !== null
                        ? formatPriceINR(Math.max(0, detailBooking.price - (detailBooking.amountPaid || 0) - (detailBooking.cashCollected || 0)), true)
                        : '—'}
                    </span>
                  </div>

                  {/* Payment Method & Transaction ID */}
                  <div className="flex justify-between py-1">
                    <span className="text-[#6B7280]">Payment Method:</span>
                    <span className="font-medium text-[#171513]">
                      {detailBooking.paymentMethod || 'Online / Razorpay'}
                    </span>
                  </div>

                  {detailBooking.transactionId && (
                    <div className="flex justify-between py-1">
                      <span className="text-[#6B7280]">Transaction Reference:</span>
                      <span className="font-mono text-[11px] text-[#6B7280]">
                        {detailBooking.transactionId}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Client Special Requests or Notes */}
              {detailBooking.notes && (
                <div className="p-4 rounded-xl bg-white border border-[#E5E7EB] text-xs space-y-1">
                  <h4 className="font-bold text-xs text-[#171513] flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-[#B7791F]" /> Client Instructions / Notes
                  </h4>
                  <p className="text-[#4B5563] leading-relaxed pt-1">{detailBooking.notes}</p>
                </div>
              )}

              {/* Cancellation Reason Notice */}
              {detailBooking.cancellationReason && (
                <div className="p-4 rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] text-xs space-y-1">
                  <span className="font-bold text-[#DC2626]">Cancellation Reason:</span>
                  <p className="text-[#7F1D1D] leading-relaxed">{detailBooking.cancellationReason}</p>
                </div>
              )}
            </div>

            {/* Drawer Fixed Footer Actions */}
            <div className="p-4 sm:p-5 border-t border-[#E5E7EB] bg-[#FAFBFD] flex items-center justify-between gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDetailBooking(null)}
              >
                Close
              </Button>

              <div className="flex items-center gap-2">
                {/* Digital Ticket button */}
                {detailBooking.ticketCode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTicketModalBooking(detailBooking);
                    }}
                    leftIcon={<QrCode className="w-3.5 h-3.5 text-[#B7791F]" />}
                  >
                    Ticket
                  </Button>
                )}

                {/* Cancel Action */}
                {canCancel && detailBooking.status !== 'cancelled' && detailBooking.status !== 'completed' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCancelModal({
                        isOpen: true,
                        booking: detailBooking,
                        reason: '',
                        isSubmitting: false,
                        error: null,
                      });
                    }}
                    className="text-[#DC2626] hover:bg-[#FEF2F2]"
                  >
                    Cancel
                  </Button>
                )}

                {/* Confirm Action */}
                {canUpdate && detailBooking.status === 'pending' && (
                  <Button
                    variant="gold"
                    size="sm"
                    onClick={() => handleConfirm(detailBooking)}
                    disabled={processingId === detailBooking.id}
                  >
                    Confirm Booking
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. ATTENDANCE CONFIRMATION & CASH COLLECTION MODAL (Section 3 & Cash Revenue Rule) */}
      {attendanceModal.isOpen && attendanceModal.booking && (() => {
        const b = attendanceModal.booking;
        const bookingPrice = b.isPriceAvailable && b.price !== null ? b.price : 0;
        const currentPaid = b.amountPaid ?? 0;
        const currentDue = b.balanceDue !== null && b.balanceDue !== undefined ? b.balanceDue : Math.max(0, bookingPrice - currentPaid);
        const enteredCash = Math.max(0, parseFloat(attendanceModal.cashInput) || 0);
        const remainingAfterCash = Math.max(0, bookingPrice - currentPaid - enteredCash);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs">
            <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-2xl max-w-lg w-full p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      attendanceModal.action === 'attended'
                        ? 'bg-[#F0FDF4] text-[#16A34A]'
                        : 'bg-[#FEF2F2] text-[#DC2626]'
                    }`}
                  >
                    {attendanceModal.action === 'attended' ? (
                      <UserCheck className="w-5 h-5" />
                    ) : (
                      <UserX className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#171513]">
                      {attendanceModal.action === 'attended'
                        ? 'Confirm Attendance & Record Cash'
                        : 'Mark Appointment Not Attended'}
                    </h3>
                    <p className="text-xs text-[#6B7280]">
                      Booking #{b.id.slice(0, 8)} • {b.customerName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setAttendanceModal({
                      isOpen: false,
                      booking: null,
                      action: 'attended',
                      cashInput: '',
                      isSubmitting: false,
                      error: null,
                    })
                  }
                  className="p-1 rounded-lg text-[#6B7280] hover:text-[#171513] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {attendanceModal.action === 'attended' ? (
                <div className="space-y-4">
                  <p className="text-xs text-[#4B5563] leading-relaxed">
                    Confirm that <strong className="text-[#171513]">{b.customerName}</strong> is present for <span className="font-medium text-[#171513]">{b.serviceName}</span>. Enter the actual cash collected at the counter to record official salon revenue.
                  </p>

                  {/* Financial Breakdown Summary Cards */}
                  <div className="grid grid-cols-3 gap-2 p-3 bg-[#FAFBFD] rounded-xl border border-[#E5E7EB] text-center">
                    <div className="p-1.5">
                      <span className="text-[10px] text-[#6B7280] block font-medium">Treatment Value</span>
                      <span className="text-xs font-bold text-[#171513] tabular-nums">
                        {formatPriceINR(b.price, b.isPriceAvailable)}
                      </span>
                    </div>
                    <div className="p-1.5 border-x border-[#E5E7EB]">
                      <span className="text-[10px] text-[#6B7280] block font-medium">Pre-Paid</span>
                      <span className="text-xs font-bold text-[#16A34A] tabular-nums">
                        {formatPriceINR(currentPaid, true)}
                      </span>
                    </div>
                    <div className="p-1.5">
                      <span className="text-[10px] text-[#6B7280] block font-medium">Current Balance</span>
                      <span className={`text-xs font-bold tabular-nums ${currentDue > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'}`}>
                        {formatPriceINR(currentDue, true)}
                      </span>
                    </div>
                  </div>

                  {/* Cash Collection Input Field */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-[#171513] flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5 text-[#B7791F]" />
                        Cash Received at Counter (₹)
                      </label>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setAttendanceModal((p) => ({ ...p, cashInput: currentDue.toString() }))}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#F0FDF4] text-[#16A34A] border border-[#DCFCE7] hover:bg-[#DCFCE7] cursor-pointer"
                        >
                          Full Cash (₹{currentDue.toLocaleString('en-IN')})
                        </button>
                        <button
                          type="button"
                          onClick={() => setAttendanceModal((p) => ({ ...p, cashInput: '0' }))}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#F3F4F6] text-[#4B5563] border border-[#E5E7EB] hover:bg-[#E5E7EB] cursor-pointer"
                        >
                          ₹0 (No Cash)
                        </button>
                      </div>
                    </div>

                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-[#6B7280]">
                        ₹
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={attendanceModal.cashInput}
                        onChange={(e) =>
                          setAttendanceModal((prev) => ({
                            ...prev,
                            cashInput: e.target.value,
                            error: null,
                          }))
                        }
                        placeholder="0.00"
                        autoFocus
                        className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-[#D1D5DB] focus:outline-hidden focus:border-[#B7791F] focus:ring-2 focus:ring-[#B7791F]/20 text-sm font-semibold tabular-nums text-[#171513]"
                      />
                    </div>

                    {/* Dynamic Balance Preview */}
                    <div className="flex items-center justify-between text-xs px-1 pt-0.5">
                      <span className="text-[#6B7280]">Remaining Balance After This Collection:</span>
                      <span className={`font-bold tabular-nums ${remainingAfterCash > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'}`}>
                        {formatPriceINR(remainingAfterCash, true)}
                      </span>
                    </div>
                  </div>

                  {/* Revenue Rule Notice */}
                  <div className="p-3 rounded-xl bg-[#FEF9EE] border border-[#FCEEC8] text-[11px] text-[#8D580F] flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-[#B7791F] shrink-0 mt-0.5" />
                    <span>
                      <strong>Cash Revenue Rule:</strong> Only the actual cash entered above will be recorded and counted towards verified salon cash revenue. Marking attended without cash collection records ₹0 revenue.
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#4B5563] leading-relaxed">
                  Confirm that <strong>{b.customerName}</strong> did not attend their scheduled appointment (<span className="font-medium text-[#171513]">{b.serviceName}</span>). This will mark the booking as <strong>Not Attended</strong> and release staff capacity. No cash revenue will be counted.
                </p>
              )}

              {attendanceModal.error && (
                <div className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FEE2E2] text-xs text-[#DC2626]">
                  {attendanceModal.error}
                </div>
              )}

              <div className="flex gap-2.5 pt-2">
                <Button
                  variant="outline"
                  size="md"
                  onClick={() =>
                    setAttendanceModal({
                      isOpen: false,
                      booking: null,
                      action: 'attended',
                      cashInput: '',
                      isSubmitting: false,
                      error: null,
                    })
                  }
                  className="flex-1"
                  disabled={attendanceModal.isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  variant={attendanceModal.action === 'attended' ? 'primary' : 'danger'}
                  size="md"
                  onClick={handleExecuteAttendance}
                  isLoading={attendanceModal.isSubmitting}
                  className={`flex-1 ${attendanceModal.action === 'attended' ? 'bg-[#16A34A] border-[#16A34A] hover:bg-[#15803D]' : ''}`}
                >
                  {attendanceModal.action === 'attended'
                    ? enteredCash > 0
                      ? `Record ₹${enteredCash.toLocaleString('en-IN')} & Attend`
                      : 'Confirm Attended (₹0 Cash)'
                    : 'Confirm Not Attended'}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 6. DIGITAL TICKET MODAL */}
      {ticketModalBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#E5E7EB] shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#F3F4F6]">
              <span className="text-[10px] font-bold text-[#B7791F] uppercase tracking-wider">
                Digital Verification Ticket
              </span>
              <button
                onClick={() => setTicketModalBooking(null)}
                className="p-1 rounded-lg text-[#6B7280] hover:text-[#171513] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Simulated Digital Ticket Card */}
            <div className="p-5 rounded-2xl bg-[#FAFBFD] border border-[#E5E7EB] space-y-4">
              <div>
                <h3 className="font-bold text-sm text-[#171513]">
                  {ticketModalBooking.serviceName}
                </h3>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  {ticketModalBooking.customerName}
                </p>
              </div>

              {/* QR Code Graphic Representation */}
              <div className="w-36 h-36 mx-auto bg-white p-3 rounded-2xl border border-[#E5E7EB] shadow-xs flex flex-col items-center justify-center">
                <QrCode className="w-28 h-28 text-[#171513]" />
              </div>

              {/* Ticket Code Tag */}
              <div>
                <button
                  onClick={() => handleCopy(ticketModalBooking.ticketCode || ticketModalBooking.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#E5E7EB] font-mono font-bold text-xs text-[#B7791F] hover:border-[#B7791F] transition-colors cursor-pointer"
                >
                  <span>{ticketModalBooking.ticketCode || ticketModalBooking.id}</span>
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-[#16A34A]" /> : <Copy className="w-3.5 h-3.5 text-[#6B7280]" />}
                </button>
              </div>

              <div className="text-[11px] text-[#6B7280] pt-2 border-t border-[#E5E7EB] space-y-1">
                <div className="flex justify-between">
                  <span>Date:</span>
                  <span className="font-bold text-[#171513]">{ticketModalBooking.date || 'TBD'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Time:</span>
                  <span className="font-bold text-[#171513]">{ticketModalBooking.time || 'TBD'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Price:</span>
                  <span className="font-bold text-[#171513]">
                    {formatPriceINR(ticketModalBooking.price, ticketModalBooking.isPriceAvailable)}
                  </span>
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setTicketModalBooking(null)}
              className="w-full"
            >
              Done
            </Button>
          </div>
        </div>
      )}

      {/* 7. CANCELLATION MODAL */}
      {cancelModal.isOpen && cancelModal.booking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#171513]">Cancel Appointment</h3>
                  <p className="text-xs text-[#6B7280]">
                    Booking #{cancelModal.booking.id.slice(0, 8)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCancelModal({ isOpen: false, booking: null, reason: '', isSubmitting: false, error: null })}
                className="p-1 rounded-lg text-[#6B7280] hover:text-[#171513] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#4B5563] leading-relaxed">
              Cancelling will update the booking status, void the digital verification ticket, and release the appointment schedule in the shared database.
            </p>

            {cancelModal.error && (
              <div className="p-3 rounded-lg bg-[#FEF2F2] border border-[#FEE2E2] text-xs text-[#DC2626]">
                {cancelModal.error}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#171513] mb-1">
                Reason for Cancellation <span className="text-[#DC2626]">*</span>
              </label>
              <textarea
                rows={3}
                value={cancelModal.reason}
                onChange={(e) => setCancelModal((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="e.g. Client requested reschedule, Salon schedule conflict..."
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] resize-none focus:outline-hidden focus:ring-2 focus:ring-[#DC2626]/30 focus:border-[#DC2626]"
              />
            </div>

            <div className="flex gap-2.5 pt-2">
              <Button
                variant="outline"
                size="md"
                onClick={() => setCancelModal({ isOpen: false, booking: null, reason: '', isSubmitting: false, error: null })}
                className="flex-1"
                disabled={cancelModal.isSubmitting}
              >
                Keep Booking
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={handleExecuteCancel}
                isLoading={cancelModal.isSubmitting}
                className="flex-1"
              >
                Confirm Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
