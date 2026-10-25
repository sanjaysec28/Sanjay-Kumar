import React, { useEffect, useState, useMemo } from 'react';
import {
  collection,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { COLLECTIONS } from '../../firebase/collections';
import { useAuth } from '../../context/AuthContext';
import { useRouter } from '../../router/Router';
import {
  normalizeBooking,
  type NormalizedBooking,
} from '../../firebase/types';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState } from '../../components/common/EmptyState';
import {
  Printer,
  Calendar,
  Wallet,
  Receipt,
  UserCheck,
  CreditCard,
  AlertCircle,
  RefreshCw,
  FileSpreadsheet,
  ArrowLeft,
  Building2,
  CheckCircle2,
} from 'lucide-react';

/**
 * Checks if a booking's cash collection or appointment corresponds to the selected date in Asia/Kolkata timezone.
 */
function checkIsDateMatch(booking: NormalizedBooking, targetDateStr: string, timeZone = 'Asia/Kolkata'): boolean {
  // 1. If cash was collected at a specific timestamp, check that date first
  if (booking.cashCollectedAt) {
    let dateObj: Date | null = null;
    if (typeof booking.cashCollectedAt === 'string') {
      dateObj = new Date(booking.cashCollectedAt);
    } else if (
      booking.cashCollectedAt &&
      typeof (booking.cashCollectedAt as any).toDate === 'function'
    ) {
      dateObj = (booking.cashCollectedAt as any).toDate();
    }
    if (dateObj && !isNaN(dateObj.getTime())) {
      try {
        const cashDateStr = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(dateObj);
        if (cashDateStr === targetDateStr) return true;
      } catch {
        // Fallback
      }
    }
  }

  // 2. Check appointment scheduled date
  if (booking.date) {
    if (booking.date === targetDateStr) return true;
    try {
      const parsed = new Date(booking.date);
      if (!isNaN(parsed.getTime())) {
        const appointmentDateStr = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(parsed);
        if (appointmentDateStr === targetDateStr) return true;
      }
    } catch {
      // Fallback
    }
  }

  return false;
}

export const AnalyticsPage: React.FC = () => {
  const { user, userProfile } = useAuth();
  const { navigate } = useRouter();
  const salonTimezone = 'Asia/Kolkata';

  // Current today string in IST (YYYY-MM-DD)
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

  // Selected audit date for report
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [bookings, setBookings] = useState<NormalizedBooking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reportGeneratedTime, setReportGeneratedTime] = useState<string>('');

  // Update generation timestamp
  useEffect(() => {
    try {
      const now = new Date();
      setReportGeneratedTime(
        now.toLocaleString('en-IN', {
          timeZone: salonTimezone,
          dateStyle: 'medium',
          timeStyle: 'medium',
        })
      );
    } catch {
      setReportGeneratedTime(new Date().toLocaleString());
    }
  }, [selectedDate]);

  // Real-time Firestore synchronization
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
      usersBookingsMap.forEach((booking, id) => mergedMap.set(id, booking));
      topLevelBookingsMap.forEach((booking, id) => mergedMap.set(id, booking));
      setBookings(Array.from(mergedMap.values()));
      setLoading(false);
    };

    // 1. Subscribe to users collection (nested concierge_requests)
    const unsubUsers = onSnapshot(
      collection(db, COLLECTIONS.USERS),
      (snapshot) => {
        usersBookingsMap.clear();
        snapshot.forEach((docSnap) => {
          const userData = docSnap.data() || {};
          const customerUid = docSnap.id;
          const defaultName = userData.displayName || userData.name || 'Client';
          const defaultEmail = userData.email || '';
          const defaultPhone = userData.phoneNumber || userData.phone || undefined;

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

                const enriched: Record<string, any> = {
                  ...req,
                  customerId: req.customerId || req.customer_id || customerUid,
                  customerName: req.customerName || req.customer_name || defaultName,
                  customerEmail: req.customerEmail || req.customer_email || defaultEmail,
                  customerPhone: req.customerPhone || req.customer_phone || defaultPhone,
                };

                usersBookingsMap.set(reqId, normalizeBooking(reqId, enriched));
              }
            });
          }
        });
        updateCombinedBookings();
      },
      (err) => {
        console.warn('Error reading users for analytics:', err);
        setError('Notice: Real-time user collections sync error. Check authorization.');
        setLoading(false);
      }
    );

    // 2. Subscribe to top-level bookings collection
    const unsubBookings = onSnapshot(
      collection(db, COLLECTIONS.BOOKINGS),
      (snapshot) => {
        topLevelBookingsMap.clear();
        snapshot.forEach((docSnap) => {
          topLevelBookingsMap.set(docSnap.id, normalizeBooking(docSnap.id, docSnap.data()));
        });
        updateCombinedBookings();
      },
      (err) => {
        console.warn('Notice listening to top-level bookings:', err);
      }
    );

    return () => {
      unsubUsers();
      unsubBookings();
    };
  }, []);

  // Filter bookings for the selected date
  const dateBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (b.status === 'cancelled') return false;
      return checkIsDateMatch(b, selectedDate, salonTimezone);
    });
  }, [bookings, selectedDate, salonTimezone]);

  // Financial aggregates for the selected date
  const stats = useMemo(() => {
    let totalBookingValue = 0;
    let totalCashCollected = 0;
    let totalAdvancePaid = 0;
    let totalBalanceDue = 0;
    let attendedCount = 0;
    let notAttendedCount = 0;
    let pendingCount = 0;
    let cashTransactionsCount = 0;

    dateBookings.forEach((b) => {
      const isAttended = b.attendanceStatus === 'attended' || b.status === 'completed';
      const isNotAttended = b.attendanceStatus === 'not_attended';
      const price = b.isPriceAvailable && b.price !== null ? b.price : 0;
      const cash = b.cashCollected ?? 0;
      const advance = b.amountPaid ?? 0;

      if (isAttended) {
        attendedCount++;
        totalBookingValue += price;
        totalCashCollected += cash;
        totalAdvancePaid += advance;
        if (cash > 0) cashTransactionsCount++;
        const balance = b.balanceDue !== null && b.balanceDue !== undefined
          ? b.balanceDue
          : Math.max(0, price - advance - cash);
        totalBalanceDue += balance;
      } else if (isNotAttended) {
        notAttendedCount++;
      } else {
        pendingCount++;
        totalBookingValue += price;
        totalBalanceDue += price - advance;
      }
    });

    const totalCollectedOverall = totalCashCollected + totalAdvancePaid;
    const collectionRate =
      totalBookingValue > 0 ? Math.round((totalCollectedOverall / totalBookingValue) * 100) : 0;

    return {
      totalBookingValue,
      totalCashCollected,
      totalAdvancePaid,
      totalBalanceDue,
      attendedCount,
      notAttendedCount,
      pendingCount,
      cashTransactionsCount,
      totalCollectedOverall,
      collectionRate,
    };
  }, [dateBookings]);

  // Formatted selected date string for print header
  const formattedSelectedDate = useMemo(() => {
    try {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Trigger print dialog
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans">
      {/* Print Specific CSS to ensure clean A4 bill formatting */}
      <style>{`
        @media print {
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print, header, aside, nav, button {
            display: none !important;
          }
          .printable-report {
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            border: none !important;
            box-shadow: none !important;
          }
          .print-break-inside-avoid {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          @page {
            size: A4 portrait;
            margin: 12mm 10mm 12mm 10mm;
          }
        }
      `}</style>

      {/* Screen Controls Header (Hidden on Print) */}
      <div className="no-print bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={() => navigate('/admin')}
                className="text-xs font-semibold text-[#6B7280] hover:text-[#171513] flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
              </button>
              <span className="text-xs text-[#D1D5DB]">/</span>
              <span className="text-xs font-bold text-[#B7791F] uppercase tracking-wider">
                Financial Operations
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#171513] tracking-tight">
              Cash Revenue Report & Audit
            </h1>
            <p className="text-xs sm:text-sm text-[#6B7280] mt-1">
              Authoritative cash revenue collections recorded upon appointment attendance for Musha Empire Luxury Salon ({salonTimezone}).
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2.5 shrink-0">
            {/* Print / Save PDF Button */}
            <Button
              variant="primary"
              size="md"
              onClick={handlePrint}
              leftIcon={<Printer className="w-4 h-4" />}
              className="bg-[#B7791F] border-[#B7791F] hover:bg-[#975A16] shadow-sm cursor-pointer"
            >
              Print / Save PDF Bill
            </Button>
          </div>
        </div>

        {/* Date Selector Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#F3F4F6]">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#B7791F]" />
            <label htmlFor="audit-date" className="text-xs font-bold text-[#171513]">
              Audit Date:
            </label>
            <input
              id="audit-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-[#D1D5DB] text-xs font-semibold text-[#171513] bg-[#F9FAFB] focus:outline-hidden focus:border-[#B7791F]"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedDate(todayStr)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                selectedDate === todayStr
                  ? 'bg-[#B7791F] text-white'
                  : 'bg-[#F3F4F6] text-[#4B5563] hover:bg-[#E5E7EB]'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => {
                const y = new Date();
                y.setDate(y.getDate() - 1);
                setSelectedDate(y.toISOString().split('T')[0]);
              }}
              className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#F3F4F6] text-[#4B5563] hover:bg-[#E5E7EB] transition-colors cursor-pointer"
            >
              Yesterday
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] text-xs text-[#DC2626] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Screen KPI Overview Cards (Hidden on Print) */}
      <div className="no-print grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Cash Collected Today */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E5E7EB] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
              Cash Revenue Collected
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#F0FDF4] text-[#16A34A] flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#16A34A] tabular-nums">
            ₹{stats.totalCashCollected.toLocaleString('en-IN')}
          </div>
          <span className="text-[11px] text-[#6B7280] mt-1 block">
            {stats.cashTransactionsCount} cash payment{stats.cashTransactionsCount === 1 ? '' : 's'} recorded
          </span>
        </div>

        {/* Metric 2: Attended Appointments */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E5E7EB] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
              Attended Visits
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#FEF9EE] text-[#B7791F] flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#171513] tabular-nums">
            {stats.attendedCount}
          </div>
          <span className="text-[11px] text-[#6B7280] mt-1 block">
            {stats.notAttendedCount} marked not attended
          </span>
        </div>

        {/* Metric 3: Total Treatment Value */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E5E7EB] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
              Total Billed Service Value
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#F3F4F6] text-[#4B5563] flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-[#171513] tabular-nums">
            ₹{stats.totalBookingValue.toLocaleString('en-IN')}
          </div>
          <span className="text-[11px] text-[#6B7280] mt-1 block">
            {stats.collectionRate}% revenue realization
          </span>
        </div>

        {/* Metric 4: Outstanding Balance */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E5E7EB] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
              Outstanding Balance Due
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className={`mt-2 text-2xl font-bold tabular-nums ${stats.totalBalanceDue > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'}`}>
            ₹{stats.totalBalanceDue.toLocaleString('en-IN')}
          </div>
          <span className="text-[11px] text-[#6B7280] mt-1 block">
            {stats.totalBalanceDue > 0 ? 'Pending counter collection' : 'Fully settled'}
          </span>
        </div>
      </div>

      {/* ========================================================= */}
      {/* PRINTABLE BILL / REPORT CONTAINER (Optimized for Paper & PDF) */}
      {/* ========================================================= */}
      <div className="printable-report bg-white rounded-2xl border border-[#E5E7EB] p-6 sm:p-8 shadow-xs space-y-6">
        {/* Salon Official Billing Header */}
        <div className="border-b-2 border-[#171513] pb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Building2 className="w-6 h-6 text-[#B7791F]" />
              <h2 className="text-xl sm:text-2xl font-black text-[#171513] tracking-wider uppercase font-serif">
                Musha Empire Luxury Salon
              </h2>
            </div>
            <p className="text-xs text-[#4B5563] font-medium">
              Official Daily Cash Revenue & Attendance Ledger
            </p>
            <p className="text-[11px] text-[#6B7280]">
              Musha Empire Admin Portal • Certified Financial Audit Record
            </p>
          </div>

          <div className="text-left sm:text-right space-y-1 text-xs">
            <div className="inline-block px-3 py-1 rounded-md bg-[#FEF9EE] border border-[#FCEEC8] text-[#8D580F] font-bold text-xs uppercase tracking-wider">
              Cash Audit Statement
            </div>
            <p className="text-[#171513] font-bold pt-1">
              Date: <span className="font-semibold">{formattedSelectedDate}</span>
            </p>
            <p className="text-[#6B7280] text-[11px]">
              Generated: {reportGeneratedTime} ({salonTimezone === 'Asia/Kolkata' ? 'IST' : salonTimezone})
            </p>
            <p className="text-[#6B7280] text-[11px]">
              Staff Auditor: {userProfile?.displayName || user?.displayName || user?.email || 'Authorized Staff'}
            </p>
          </div>
        </div>

        {/* Daily Financial Summary Ledger Box */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-[#FAFBFD] border border-[#E5E7EB] text-xs">
          <div>
            <span className="text-[#6B7280] block text-[11px] font-medium">Attended Clients</span>
            <span className="text-base font-bold text-[#171513]">{stats.attendedCount} Clients</span>
          </div>
          <div>
            <span className="text-[#6B7280] block text-[11px] font-medium">Billed Treatment Value</span>
            <span className="text-base font-bold text-[#171513] tabular-nums">
              ₹{stats.totalBookingValue.toLocaleString('en-IN')}
            </span>
          </div>
          <div>
            <span className="text-[#6B7280] block text-[11px] font-medium">Advance / Online Paid</span>
            <span className="text-base font-bold text-[#16A34A] tabular-nums">
              ₹{stats.totalAdvancePaid.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="bg-[#F0FDF4] p-2 rounded-lg border border-[#DCFCE7]">
            <span className="text-[#15803D] block text-[11px] font-bold uppercase tracking-wider">
              Total Cash Collected
            </span>
            <span className="text-lg font-black text-[#15803D] tabular-nums">
              ₹{stats.totalCashCollected.toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Transaction-wise Breakdown Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-[#171513] flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-[#B7791F]" />
              Transaction-wise Breakdown ({dateBookings.length} Record{dateBookings.length === 1 ? '' : 's'})
            </h3>
            <span className="text-[11px] text-[#6B7280]">
              Currency: Indian Rupee (₹)
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-[#6B7280] flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#B7791F]" />
              Loading real-time records...
            </div>
          ) : dateBookings.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#6B7280] bg-[#FAFBFD] rounded-xl border border-dashed border-[#E5E7EB]">
              No booking records or attendance recorded for {formattedSelectedDate}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-[#E5E7EB] bg-[#FAFBFD] text-[#4B5563] text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3 font-bold">#</th>
                    <th className="py-2.5 px-3 font-bold">Receipt ID</th>
                    <th className="py-2.5 px-3 font-bold">Booking Ref</th>
                    <th className="py-2.5 px-3 font-bold">Customer</th>
                    <th className="py-2.5 px-3 font-bold">Treatment / Service</th>
                    <th className="py-2.5 px-3 font-bold text-right">Value</th>
                    <th className="py-2.5 px-3 font-bold text-right">Cash Received</th>
                    <th className="py-2.5 px-3 font-bold text-right">Balance Due</th>
                    <th className="py-2.5 px-3 font-bold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {dateBookings.map((b, idx) => {
                    const isAttended = b.attendanceStatus === 'attended' || b.status === 'completed';
                    const isNotAttended = b.attendanceStatus === 'not_attended';
                    const cash = b.cashCollected ?? 0;
                    const price = b.isPriceAvailable && b.price !== null ? b.price : 0;
                    const advance = b.amountPaid ?? 0;
                    const balance = b.balanceDue !== null && b.balanceDue !== undefined
                      ? b.balanceDue
                      : Math.max(0, price - advance - cash);

                    return (
                      <tr key={b.id} className="hover:bg-[#FAFBFD] print-break-inside-avoid">
                        <td className="py-2.5 px-3 font-mono text-[#6B7280]">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-[#B7791F]">
                          {b.cashReceiptId || (cash > 0 ? `RCP-${b.id.slice(0, 6).toUpperCase()}` : '—')}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#171513]">
                          {b.ticketCode || b.id.slice(0, 8)}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-[#171513] block">{b.customerName}</span>
                          {b.customerPhone && (
                            <span className="text-[10px] text-[#6B7280]">{b.customerPhone}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-medium text-[#171513] block">{b.serviceName}</span>
                          <span className="text-[10px] text-[#6B7280]">{b.category || 'Salon Service'}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-[#171513]">
                          {b.isPriceAvailable && b.price !== null ? `₹${b.price.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold tabular-nums text-[#16A34A]">
                          {cash > 0 ? `₹${cash.toLocaleString('en-IN')}` : '₹0'}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-bold tabular-nums ${balance > 0 ? 'text-[#DC2626]' : 'text-[#6B7280]'}`}>
                          {b.isPriceAvailable && b.price !== null ? `₹${balance.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {isAttended ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#F0FDF4] text-[#16A34A] border border-[#DCFCE7]">
                              Attended
                            </span>
                          ) : isNotAttended ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#FEF2F2] text-[#DC2626] border border-[#FEE2E2]">
                              No-Show
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#FEF9EE] text-[#B7791F] border border-[#FCEEC8]">
                              Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#171513] bg-[#F9FAFB] font-bold text-xs">
                    <td colSpan={5} className="py-3 px-3 text-right uppercase tracking-wider text-[#171513]">
                      Total Daily Cash Collections:
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-[#171513]">
                      ₹{stats.totalBookingValue.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-[#16A34A] text-sm font-black">
                      ₹{stats.totalCashCollected.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-[#DC2626]">
                      ₹{stats.totalBalanceDue.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* Verification Sign-off & Audit Declaration (Essential for Print/PDF) */}
        <div className="pt-8 border-t border-[#E5E7EB] grid grid-cols-2 gap-8 text-xs text-[#4B5563] print-break-inside-avoid">
          <div className="space-y-8">
            <div className="h-10 border-b border-dashed border-[#9CA3AF]"></div>
            <div>
              <p className="font-bold text-[#171513]">Prepared / Verified by (Cashier / Front-Desk)</p>
              <p className="text-[10px] text-[#6B7280]">Name & Signature • Date & Time</p>
            </div>
          </div>

          <div className="space-y-8">
            <div className="h-10 border-b border-dashed border-[#9CA3AF]"></div>
            <div>
              <p className="font-bold text-[#171513]">Approved by (Salon Manager / General Admin)</p>
              <p className="text-[10px] text-[#6B7280]">Official Approval • Musha Empire Luxury Salon</p>
            </div>
          </div>
        </div>

        {/* Audit Statement Footer */}
        <div className="pt-4 border-t border-[#F3F4F6] text-center text-[10px] text-[#9CA3AF]">
          Notice: Musha Empire Admin Portal implements an idempotent cash collection model. Revenue is recognized strictly upon verified client attendance and counter cash receipt confirmation.
        </div>
      </div>
    </div>
  );
};
