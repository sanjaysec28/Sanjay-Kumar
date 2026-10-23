import React, { useEffect, useState, useMemo } from 'react';
import {
  CalendarDays,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Eye,
  Clock,
  DollarSign,
  Tag,
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
  ExternalLink,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { COLLECTIONS } from '../../firebase/collections';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from '../../router/Router';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge, type BadgeVariant } from '../../components/ui/Badge';
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
} from '../../firebase/bookingService';

export const BookingsPage: React.FC = () => {
  const { hasPermission, role, user, signInWithGoogle, error: authError, loading: authLoading } = useAuth();
  const { navigate } = useRouter();

  const canUpdate = hasPermission('bookings.update');
  const canCancel = hasPermission('bookings.cancel');

  // Bookings Data State
  const [bookings, setBookings] = useState<NormalizedBooking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [quickTab, setQuickTab] = useState<'all' | 'today' | 'upcoming' | 'completed' | 'cancelled'>('all');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 12;

  // Selected Booking for Detail Modal / Digital Ticket
  const [detailBooking, setDetailBooking] = useState<NormalizedBooking | null>(null);
  const [ticketModalBooking, setTicketModalBooking] = useState<NormalizedBooking | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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

  // 1. Subscribe to Firestore `bookings` collection
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const bookingsColRef = collection(db, COLLECTIONS.BOOKINGS);
    // Real-time listener
    const unsubscribe = onSnapshot(
      bookingsColRef,
      (snapshot) => {
        const loaded: NormalizedBooking[] = [];
        snapshot.forEach((docSnap) => {
          loaded.push(normalizeBooking(docSnap.id, docSnap.data()));
        });

        // Default sort: newest date & time first
        loaded.sort((a, b) => {
          const dateDiff = (b.date || '').localeCompare(a.date || '');
          if (dateDiff !== 0) return dateDiff;
          return (b.time || '').localeCompare(a.time || '');
        });

        setBookings(loaded);
        setLoading(false);
      },
      (err: any) => {
        const errCode = err?.code || 'unknown';
        const errMsg = err?.message || 'Database query error';
        console.warn('Notice listening to bookings collection:', errCode, errMsg);
        
        if (errCode === 'permission-denied') {
          setError(
            'Missing or insufficient permissions to read bookings collection. Please ensure your signed-in account is listed with an authorized staff role (admin, manager, receptionist) in the users collection or has rules deployed.'
          );
        } else {
          setError(`Unable to load bookings from database: [${errCode}] ${errMsg}`);
        }
        setLoading(false);
      }
    );

    return () => unsubscribe();
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

  // Today date string (YYYY-MM-DD)
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Filter Bookings Strategy
  const filteredBookings = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return bookings.filter((b) => {
      // 1. Quick Tab Matching
      if (quickTab === 'today') {
        if (b.date !== todayStr) return false;
      } else if (quickTab === 'upcoming') {
        if (b.date < todayStr || b.status === 'cancelled' || b.status === 'completed') return false;
      } else if (quickTab === 'completed') {
        if (b.status !== 'completed') return false;
      } else if (quickTab === 'cancelled') {
        if (b.status !== 'cancelled') return false;
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
  }, [bookings, searchQuery, statusFilter, paymentFilter, serviceFilter, dateFilter, quickTab, todayStr]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / pageSize));
  const paginatedBookings = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredBookings.slice(start, start + pageSize);
  }, [filteredBookings, currentPage, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, paymentFilter, serviceFilter, dateFilter, quickTab]);

  // Handle Confirm Booking
  const handleConfirm = async (booking: NormalizedBooking) => {
    if (!canUpdate) return;
    setProcessingId(booking.id);
    try {
      const res = await confirmBooking(booking.id, user?.uid);
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
      const res = await completeBooking(booking.id, user?.uid);
      showSuccess(res.message);
    } catch (err: any) {
      console.error('Error marking booking completed:', err);
      setError(err?.message || 'Failed to mark booking as completed.');
    } finally {
      setProcessingId(null);
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
      const res = await cancelBooking(booking.id, reason, user?.uid);
      showSuccess(res.message);
      setCancelModal({
        isOpen: false,
        booking: null,
        reason: '',
        isSubmitting: false,
        error: null,
      });
      if (detailBooking?.id === booking.id) {
        setDetailBooking((prev) => prev ? { ...prev, status: 'cancelled', cancellationReason: reason } : null);
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
        return <Badge variant="warning">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans">
      {/* 1. HEADER SECTION */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold text-[#B7791F] uppercase tracking-wider block">
              MUSHA EMPIRE ADMIN
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#171513] tracking-tight mt-0.5">
              Bookings & Appointments
            </h1>
            <p className="text-xs sm:text-sm text-[#6B7280] font-normal mt-1 max-w-2xl">
              Monitor, confirm, complete, and manage client appointment reservations in real-time.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-xs text-[#6B7280]">
              Total Records: <strong className="text-[#171513] font-bold">{bookings.length}</strong>
            </span>
          </div>
        </div>

        {/* Quick Filter Tabs */}
        <div className="mt-4 pt-3.5 border-t border-[#F3F4F6] flex items-center gap-2 overflow-x-auto">
          {[
            { key: 'all', label: `All (${bookings.length})` },
            {
              key: 'today',
              label: `Today (${bookings.filter((b) => b.date === todayStr).length})`,
            },
            {
              key: 'upcoming',
              label: `Upcoming (${bookings.filter((b) => b.date >= todayStr && b.status !== 'cancelled' && b.status !== 'completed').length})`,
            },
            {
              key: 'completed',
              label: `Completed (${bookings.filter((b) => b.status === 'completed').length})`,
            },
            {
              key: 'cancelled',
              label: `Cancelled (${bookings.filter((b) => b.status === 'cancelled').length})`,
            },
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
                  Firestore security rules require an authenticated staff user to read and listen to the <code className="bg-[#FEF3C7] px-1 py-0.5 rounded font-mono font-semibold">bookings</code> collection. Sign in with your authorized admin account to stream real appointments.
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

        {/* Success Alert */}
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

      {/* 2. SEARCH & FILTER CONTROLS */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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

            {/* Date Filter */}
            <div>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-medium text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white min-h-[40px]"
              />
            </div>
          </div>

          {/* Active Filter Chips */}
          {(searchQuery || statusFilter !== 'all' || serviceFilter !== 'all' || dateFilter || paymentFilter !== 'all') && (
            <div className="mt-3 pt-3 border-t border-[#F3F4F6] flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[#6B7280]">Filters:</span>
                {searchQuery && <Badge variant="blue">Query: &quot;{searchQuery}&quot;</Badge>}
                {statusFilter !== 'all' && <Badge variant="neutral">Status: {statusFilter}</Badge>}
                {serviceFilter !== 'all' && <Badge variant="gold">Service: {serviceFilter}</Badge>}
                {dateFilter && <Badge variant="neutral">Date: {dateFilter}</Badge>}
              </div>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setServiceFilter('all');
                  setDateFilter('');
                  setPaymentFilter('all');
                }}
                className="text-[#DC2626] hover:underline font-semibold cursor-pointer text-[11px]"
              >
                Reset Filters
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. BOOKINGS TABLE & MOBILE CARDS */}
      <Card>
        <CardHeader
          title={`Appointments (${filteredBookings.length})`}
          subtitle="Authoritative booking entries recorded in shared Firestore"
          action={
            <span className="text-[11px] text-[#6B7280]">
              Page {currentPage} of {totalPages}
            </span>
          }
        />
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-[#F3F4F6] animate-pulse">
                  <div className="space-y-2">
                    <div className="h-4 bg-[#E5E7EB] rounded w-36"></div>
                    <div className="h-3 bg-[#E5E7EB] rounded w-48"></div>
                  </div>
                  <div className="h-6 bg-[#E5E7EB] rounded w-20"></div>
                </div>
              ))}
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title={!user ? 'Sign in to access live bookings' : 'No bookings match your criteria'}
                description={
                  !user
                    ? 'Firestore access requires an authenticated staff user. Sign in with your authorized admin account to view live customer bookings.'
                    : bookings.length === 0
                    ? 'No appointments have been booked yet in the shared database.'
                    : 'Try clearing your search keyword, date, or status filters.'
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
              {/* DESKTOP TABLE VIEW */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] bg-[#FAFBFD] text-[#6B7280] font-semibold">
                      <th className="py-3.5 pl-6 pr-4">Ticket / Ref</th>
                      <th className="py-3.5 px-4">Client</th>
                      <th className="py-3.5 px-4">Treatment</th>
                      <th className="py-3.5 px-4">Schedule</th>
                      <th className="py-3.5 px-4">Price</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Payment</th>
                      <th className="py-3.5 pl-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F4F6]">
                    {paginatedBookings.map((b) => (
                      <tr key={b.id} className="hover:bg-[#F9FAFB] transition-colors">
                        {/* Ticket Code & ID */}
                        <td className="py-4 pl-6 pr-4">
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-[#B7791F]">
                              {b.ticketCode || 'NO-TICKET'}
                            </span>
                            <span className="block font-mono text-[10px] text-[#9CA3AF]">
                              #{b.id.slice(0, 8)}
                            </span>
                          </div>
                        </td>

                        {/* Customer Details */}
                        <td className="py-4 px-4">
                          <div>
                            <span className="font-bold text-[#171513] text-sm block">
                              {b.customerName}
                            </span>
                            {b.customerPhone && (
                              <span className="text-[11px] text-[#6B7280] block">
                                {b.customerPhone}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Treatment Service */}
                        <td className="py-4 px-4">
                          <div>
                            <span className="font-semibold text-[#171513] block">
                              {b.serviceName}
                            </span>
                            <div className="flex items-center gap-1 text-[11px] text-[#6B7280] mt-0.5">
                              {b.durationMinutes && <span>{b.durationMinutes} min</span>}
                              {b.gender && <span>• {b.gender}</span>}
                            </div>
                          </div>
                        </td>

                        {/* Schedule Date & Time */}
                        <td className="py-4 px-4">
                          <div>
                            <span className="font-bold text-[#171513] block">
                              {b.date || 'TBD'}
                            </span>
                            <span className="text-[11px] text-[#6B7280] flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3" />
                              {b.time ? `${b.time}${b.endTime ? ` - ${b.endTime}` : ''}` : 'Anytime'}
                            </span>
                          </div>
                        </td>

                        {/* Historical Price */}
                        <td className="py-4 px-4 font-bold text-[#171513]">
                          ${b.price.toFixed(2)}
                        </td>

                        {/* Status */}
                        <td className="py-4 px-4">
                          {getStatusBadge(b.status)}
                        </td>

                        {/* Payment */}
                        <td className="py-4 px-4">
                          {getPaymentBadge(b.paymentStatus)}
                        </td>

                        {/* Actions */}
                        <td className="py-4 pl-4 pr-6 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Details Button */}
                            <button
                              onClick={() => setDetailBooking(b)}
                              title="View Details"
                              className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Digital Ticket Button */}
                            {b.ticketCode && (
                              <button
                                onClick={() => setTicketModalBooking(b)}
                                title="Digital Ticket"
                                className="p-1.5 rounded-lg text-[#B7791F] hover:bg-[#FEF9EE] transition-colors cursor-pointer"
                              >
                                <QrCode className="w-4 h-4" />
                              </button>
                            )}

                            {/* Confirm Action (if pending) */}
                            {canUpdate && b.status === 'pending' && (
                              <button
                                onClick={() => handleConfirm(b)}
                                disabled={processingId === b.id}
                                title="Confirm Appointment"
                                className="p-1.5 rounded-lg text-[#16A34A] hover:bg-[#F0FDF4] transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                              </button>
                            )}

                            {/* Complete Action (if confirmed) */}
                            {canUpdate && b.status === 'confirmed' && (
                              <button
                                onClick={() => handleComplete(b)}
                                disabled={processingId === b.id}
                                title="Mark Completed"
                                className="p-1.5 rounded-lg text-[#2563EB] hover:bg-[#EFF6FF] transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <Sparkles className="w-4 h-4" />
                              </button>
                            )}

                            {/* Cancel Action (if pending or confirmed) */}
                            {canCancel && b.status !== 'cancelled' && b.status !== 'completed' && (
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
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE RESPONSIVE CARDS VIEW */}
              <div className="lg:hidden p-4 space-y-3">
                {paginatedBookings.map((b) => (
                  <div
                    key={b.id}
                    className="p-4 rounded-xl border border-[#E5E7EB] bg-white space-y-3 hover:border-[#D6A84F] transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-[#B7791F]">
                          {b.ticketCode || `#${b.id.slice(0, 8)}`}
                        </span>
                        <h3 className="text-sm font-bold text-[#171513] mt-0.5">
                          {b.customerName}
                        </h3>
                        <p className="text-xs text-[#6B7280]">
                          {b.serviceName}
                        </p>
                      </div>

                      <div className="text-right space-y-1">
                        <span className="font-bold text-sm text-[#171513] block">
                          ${b.price.toFixed(2)}
                        </span>
                        {getStatusBadge(b.status)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-[#6B7280] pt-2 border-t border-[#F3F4F6]">
                      <span className="font-medium text-[#171513]">
                        {b.date} • {b.time || 'TBD'}
                      </span>
                      {getPaymentBadge(b.paymentStatus)}
                    </div>

                    {/* Mobile Action Buttons */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F3F4F6]">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetailBooking(b)}
                        leftIcon={<Eye className="w-3.5 h-3.5" />}
                        className="text-xs min-h-[36px]"
                      >
                        Details
                      </Button>

                      {b.ticketCode && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTicketModalBooking(b)}
                          leftIcon={<QrCode className="w-3.5 h-3.5 text-[#B7791F]" />}
                          className="text-xs min-h-[36px]"
                        >
                          Ticket
                        </Button>
                      )}

                      {canUpdate && b.status === 'pending' && (
                        <Button
                          variant="gold"
                          size="sm"
                          onClick={() => handleConfirm(b)}
                          disabled={processingId === b.id}
                          className="text-xs min-h-[36px]"
                        >
                          Confirm
                        </Button>
                      )}

                      {canUpdate && b.status === 'confirmed' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleComplete(b)}
                          disabled={processingId === b.id}
                          className="text-xs min-h-[36px]"
                        >
                          Complete
                        </Button>
                      )}

                      {canCancel && b.status !== 'cancelled' && b.status !== 'completed' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCancelModal({
                              isOpen: true,
                              booking: b,
                              reason: '',
                              isSubmitting: false,
                              error: null,
                            })
                          }
                          className="text-xs text-[#DC2626] hover:bg-[#FEF2F2] min-h-[36px]"
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* PAGINATION CONTROLS */}
              {totalPages > 1 && (
                <div className="p-4 border-t border-[#E5E7EB] flex items-center justify-between text-xs text-[#6B7280]">
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
        </CardContent>
      </Card>

      {/* 4. BOOKING DETAIL MODAL / DRAWER */}
      {detailBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col my-auto overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-[#E5E7EB] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-[#B7791F] uppercase tracking-wider">
                  Appointment Reservation
                </span>
                <h3 className="text-base font-bold text-[#171513]">
                  Booking #{detailBooking.id.slice(0, 10)}
                </h3>
              </div>
              <button
                onClick={() => setDetailBooking(null)}
                className="p-1 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Status and Ticket Banner */}
              <div className="p-3.5 rounded-xl bg-[#FAFBFD] border border-[#E5E7EB] flex items-center justify-between">
                <div>
                  <span className="text-[#6B7280] block text-[11px]">Status</span>
                  <div className="mt-1">{getStatusBadge(detailBooking.status)}</div>
                </div>

                <div className="text-right">
                  <span className="text-[#6B7280] block text-[11px]">Digital Ticket Code</span>
                  <span className="font-mono font-bold text-xs text-[#B7791F]">
                    {detailBooking.ticketCode || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Customer Information Section */}
              <div className="p-3.5 rounded-xl border border-[#E5E7EB] space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-[#171513]">Client Details</h4>
                  {detailBooking.customerId && (
                    <button
                      onClick={() => {
                        setDetailBooking(null);
                        navigate('/admin/customers');
                      }}
                      className="text-[#B7791F] font-semibold hover:underline cursor-pointer text-[11px]"
                    >
                      View Profile →
                    </button>
                  )}
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                    <span className="text-[#6B7280]">Name:</span>
                    <span className="font-semibold text-[#171513]">{detailBooking.customerName}</span>
                  </div>

                  {detailBooking.customerPhone && (
                    <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                      <span className="text-[#6B7280]">Phone:</span>
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
                    <div className="flex justify-between py-1">
                      <span className="text-[#6B7280]">Email:</span>
                      <a
                        href={`mailto:${detailBooking.customerEmail}`}
                        className="font-medium text-[#2563EB] hover:underline flex items-center gap-1"
                      >
                        <Mail className="w-3 h-3" />
                        {detailBooking.customerEmail}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Service & Treatment Details (Historical Authoritative) */}
              <div className="p-3.5 rounded-xl border border-[#E5E7EB] space-y-2">
                <h4 className="font-bold text-[#171513]">Service & Treatment</h4>
                <div className="space-y-1">
                  <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                    <span className="text-[#6B7280]">Treatment Name:</span>
                    <span className="font-bold text-[#171513]">{detailBooking.serviceName}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                    <span className="text-[#6B7280]">Duration:</span>
                    <span className="font-medium text-[#171513]">{detailBooking.durationMinutes || 60} Minutes</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                    <span className="text-[#6B7280]">Gender Applicability:</span>
                    <span className="font-medium text-[#171513]">{detailBooking.gender || 'All'}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-[#6B7280]">Authoritative Price:</span>
                    <span className="font-bold text-[#171513] text-sm">
                      ${detailBooking.price.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Schedule and Appointment Date */}
              <div className="p-3.5 rounded-xl border border-[#E5E7EB] space-y-2">
                <h4 className="font-bold text-[#171513]">Schedule</h4>
                <div className="space-y-1">
                  <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                    <span className="text-[#6B7280]">Appointment Date:</span>
                    <span className="font-bold text-[#171513]">{detailBooking.date}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                    <span className="text-[#6B7280]">Time Slot:</span>
                    <span className="font-medium text-[#171513]">
                      {detailBooking.time} {detailBooking.endTime ? `- ${detailBooking.endTime}` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-[#6B7280]">Payment Status:</span>
                    <span>{getPaymentBadge(detailBooking.paymentStatus)}</span>
                  </div>
                </div>
              </div>

              {/* Cancellation Reason if cancelled */}
              {detailBooking.cancellationReason && (
                <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] text-xs space-y-1">
                  <span className="font-bold text-[#DC2626]">Cancellation Reason:</span>
                  <p className="text-[#7F1D1D]">{detailBooking.cancellationReason}</p>
                </div>
              )}

              {/* Client Notes if any */}
              {detailBooking.notes && (
                <div className="p-3 rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] text-xs space-y-1">
                  <span className="font-bold text-[#6B7280]">Special Notes:</span>
                  <p className="text-[#171513]">{detailBooking.notes}</p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-4 border-t border-[#E5E7EB] flex items-center justify-end gap-2 bg-[#FAFBFD]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDetailBooking(null)}
              >
                Close
              </Button>

              {canUpdate && detailBooking.status === 'pending' && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => {
                    handleConfirm(detailBooking);
                    setDetailBooking((prev) => prev ? { ...prev, status: 'confirmed' } : null);
                  }}
                >
                  Confirm Appointment
                </Button>
              )}

              {canUpdate && detailBooking.status === 'confirmed' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    handleComplete(detailBooking);
                    setDetailBooking((prev) => prev ? { ...prev, status: 'completed' } : null);
                  }}
                >
                  Mark Completed
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. DIGITAL TICKET MODAL */}
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
                  <span className="font-bold text-[#171513]">{ticketModalBooking.date}</span>
                </div>
                <div className="flex justify-between">
                  <span>Time:</span>
                  <span className="font-bold text-[#171513]">{ticketModalBooking.time}</span>
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

      {/* 6. CANCELLATION MODAL */}
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
              Cancelling will update the booking state, mark the digital ticket as cancelled, and atomically release the reserved appointment slot in the schedule.
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
