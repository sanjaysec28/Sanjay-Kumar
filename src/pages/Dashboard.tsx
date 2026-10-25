import React, { useEffect, useState, useMemo } from 'react';
import {
  Users,
  CalendarCheck2,
  CalendarClock,
  ArrowRight,
  Sparkles,
  CalendarDays,
  Tag,
  Clock,
  Store,
  RefreshCw,
  AlertCircle,
  Plus,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  UserCheck,
  UserX,
  Wallet,
  Receipt,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../firebase/collections';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../router/Router';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/common/EmptyState';
import { PermissionGate } from '../components/auth/PermissionGate';
import {
  normalizeBooking,
  type NormalizedBooking,
  type SalonSettings,
} from '../firebase/types';

interface MetricCardState {
  label: string;
  value: string;
  isNoData: boolean;
  subtext: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  badgeLabel?: string;
  badgeVariant?: 'gold' | 'blue' | 'success' | 'warning' | 'danger' | 'neutral';
}

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { navigate } = useRouter();

  // Loading & Error states
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Firestore Real Data
  const [customerCount, setCustomerCount] = useState<number | null>(null);
  const [allBookings, setAllBookings] = useState<NormalizedBooking[]>([]);
  const [salonSettings, setSalonSettings] = useState<SalonSettings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);

  // Modal / Toast for "New Booking" quick action
  const [showNewBookingNotice, setShowNewBookingNotice] = useState<boolean>(false);

  // Authoritative Timezone: Configured salon timezone or default to Asia/Kolkata
  const salonTimezone = salonSettings?.timezone || 'Asia/Kolkata';

  // Compute today's date in salon timezone (YYYY-MM-DD)
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

  // Formatted display date for header
  const formattedToday = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: salonTimezone,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date());
    } catch {
      return new Date().toDateString();
    }
  }, [salonTimezone]);

  // Subscribe to real-time Firestore data
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    let unsubUsers: (() => void) | null = null;
    let unsubBookings: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;

    const usersBookingsMap = new Map<string, NormalizedBooking>();
    const topLevelBookingsMap = new Map<string, NormalizedBooking>();

    const updateCombinedBookings = () => {
      const mergedMap = new Map<string, NormalizedBooking>();
      usersBookingsMap.forEach((b, id) => mergedMap.set(id, b));
      topLevelBookingsMap.forEach((b, id) => mergedMap.set(id, b));
      const loaded = Array.from(mergedMap.values());
      loaded.sort((a, b) => {
        const dateDiff = (b.date || '').localeCompare(a.date || '');
        if (dateDiff !== 0) return dateDiff;
        return (b.time || '').localeCompare(a.time || '');
      });
      setAllBookings(loaded);
      setLoading(false);
      setIsRefreshing(false);
    };

    try {
      // 1. Listen to customers and nested concierge_requests in `users` collection
      if (user) {
        const usersColRef = collection(db, COLLECTIONS.USERS);
        unsubUsers = onSnapshot(
          usersColRef,
          (snapshot) => {
            let count = 0;
            usersBookingsMap.clear();

            snapshot.forEach((docSnap) => {
              const data = docSnap.data() as any;
              const customerUid = docSnap.id;

              // Count registered customers
              if (data.role === 'customer' || !data.role) {
                count++;
              }

              // Extract concierge_requests
              const rawRequests = data.concierge_requests || data.conciergeRequests || data.bookings;
              if (Array.isArray(rawRequests)) {
                rawRequests.forEach((req, idx) => {
                  if (req && typeof req === 'object') {
                    const reqId =
                      req.id ||
                      req.ticket_code ||
                      req.ticketCode ||
                      req.bookingId ||
                      `dash-req-${customerUid}-${idx}`;

                    usersBookingsMap.set(
                      reqId,
                      normalizeBooking(reqId, {
                        ...req,
                        customerId: req.customerId || req.customer_id || customerUid,
                        customerName: req.customerName || req.customer_name || data.displayName || data.name || 'Client',
                        customerEmail: req.customerEmail || req.customer_email || data.email || '',
                        customerPhone: req.customerPhone || req.customer_phone || data.phoneNumber || data.phone || undefined,
                      })
                    );
                  }
                });
              }
            });

            setCustomerCount(count > 0 ? count : 0);
            updateCombinedBookings();
          },
          (err) => {
            console.warn('Notice: Firestore users listener notice:', err.message);
            setCustomerCount(null);
            updateCombinedBookings();
          }
        );

        // 2. Listen to top-level bookings collection
        const bookingsColRef = collection(db, COLLECTIONS.BOOKINGS);
        unsubBookings = onSnapshot(
          bookingsColRef,
          (snapshot) => {
            topLevelBookingsMap.clear();
            snapshot.forEach((docSnap) => {
              topLevelBookingsMap.set(docSnap.id, normalizeBooking(docSnap.id, docSnap.data()));
            });
            updateCombinedBookings();
          },
          (err) => {
            console.warn('Notice: Firestore bookings listener notice:', err.message);
            updateCombinedBookings();
          }
        );
      } else {
        setCustomerCount(null);
        setAllBookings([]);
        setLoading(false);
        setIsRefreshing(false);
      }

      // 3. Listen to salon settings from `settings/salon`
      const settingsDocRef = doc(db, COLLECTIONS.SETTINGS, 'salon');
      unsubSettings = onSnapshot(
        settingsDocRef,
        (docSnap) => {
          setSettingsLoaded(true);
          if (docSnap.exists()) {
            setSalonSettings(docSnap.data() as SalonSettings);
          } else {
            setSalonSettings(null);
          }
        },
        () => {
          setSettingsLoaded(true);
          setSalonSettings(null);
        }
      );
    } catch (err: unknown) {
      console.warn('Notice in Firestore subscription setup:', err);
      setError('Unable to load dashboard data.');
      setLoading(false);
      setIsRefreshing(false);
    }

    return () => {
      if (unsubUsers) unsubUsers();
      if (unsubBookings) unsubBookings();
      if (unsubSettings) unsubSettings();
    };
  }, [user]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  // Helper to determine if an authorized cash collection occurred today in the salon timezone
  const checkIsCashCollectedToday = (b: NormalizedBooking, targetDate: string, tz: string): boolean => {
    if (b.status === 'cancelled') return false;
    const isAttended = b.attendanceStatus === 'attended' || b.status === 'completed';
    if (!isAttended) return false;
    const cash = b.cashCollected ?? 0;
    if (cash <= 0) return false;

    const rawTs =
      b.cashCollectedAt ||
      b.attendanceMarkedAt ||
      b.paymentTimestamp ||
      (b.raw as any)?.cash_collected_at ||
      (b.raw as any)?.attendance_marked_at;

    if (rawTs) {
      let d: Date | null = null;
      if (typeof rawTs === 'string' || typeof rawTs === 'number') {
        d = new Date(rawTs);
      } else if (typeof (rawTs as any)?.toDate === 'function') {
        d = (rawTs as any).toDate();
      }

      if (d && !isNaN(d.getTime())) {
        try {
          const paymentDateStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(d);
          return paymentDateStr === targetDate;
        } catch {
          // Fallback
        }
      }
    }

    // Fallback: If appointment was scheduled for today and recorded cash upon attendance
    if (b.date === targetDate && cash > 0) {
      return true;
    }

    return false;
  };

  // Derive authoritative metrics based ONLY on real Firestore data
  const metrics = useMemo(() => {
    // 1. Today's bookings
    const todayBookingsList = allBookings.filter(
      (b) => b.date === todayStr && b.status !== 'cancelled'
    );
    const todayBookingsCount = todayBookingsList.length;

    // 2. Upcoming appointments (scheduled from today onward, not cancelled, completed, or attended)
    const upcomingList = allBookings.filter(
      (b) =>
        (b.date || '') >= todayStr &&
        b.status !== 'cancelled' &&
        b.status !== 'completed' &&
        b.attendanceStatus !== 'attended'
    );
    const upcomingCount = upcomingList.length;

    // 3. Completed appointments (explicitly marked completed or attended)
    const completedList = allBookings.filter(
      (b) => b.status === 'completed' || b.attendanceStatus === 'attended'
    );
    const completedCount = completedList.length;

    // 4. Not attended appointments
    const notAttendedList = allBookings.filter(
      (b) => b.attendanceStatus === 'not_attended'
    );
    const notAttendedCount = notAttendedList.length;

    // 5. Today's Cash Revenue: strictly counted only when client is attended with recorded cash received
    const todayCashList = allBookings.filter((b) => checkIsCashCollectedToday(b, todayStr, salonTimezone));
    const todayPaidCount = todayCashList.length;
    const todayRevenue = todayCashList.reduce((sum, b) => sum + (b.cashCollected ?? 0), 0);

    // 6. Total Cash Revenue: sum of all cash confirmed across attended visits
    const allAttendedCashList = allBookings.filter(
      (b) =>
        b.status !== 'cancelled' &&
        (b.attendanceStatus === 'attended' || b.status === 'completed') &&
        (b.cashCollected ?? 0) > 0
    );
    const totalPaidCount = allAttendedCashList.length;
    const totalRevenue = allAttendedCashList.reduce((sum, b) => sum + (b.cashCollected ?? 0), 0);

    // 7. Pending / Outstanding Balances: bookings with uncollected balances
    const outstandingBookings = allBookings.filter((b) => {
      if (b.status === 'cancelled') return false;
      const bPrice = b.isPriceAvailable && b.price !== null ? b.price : null;
      if (bPrice === null) return true;
      const covered = (b.cashCollected ?? 0) > 0 ? (b.cashCollected ?? 0) : b.amountPaid;
      return covered < bPrice;
    });
    const pendingPaymentsCount = outstandingBookings.length;
    let unpricedPendingCount = 0;
    const pendingBalanceSum = outstandingBookings.reduce((sum, b) => {
      if (b.balanceDue !== null && b.balanceDue !== undefined) {
        return sum + b.balanceDue;
      }
      if (b.isPriceAvailable && b.price !== null) {
        const covered = (b.cashCollected ?? 0) > 0 ? (b.cashCollected ?? 0) : b.amountPaid;
        return sum + Math.max(0, b.price - covered);
      }
      unpricedPendingCount++;
      return sum;
    }, 0);

    return {
      todayBookingsCount,
      upcomingCount,
      completedCount,
      notAttendedCount,
      todayPaidCount,
      todayRevenue,
      totalPaidCount,
      totalRevenue,
      pendingPaymentsCount,
      pendingBalanceSum,
      unpricedPendingCount,
      statusCounts: {
        confirmed: allBookings.filter((b) => b.status === 'confirmed').length,
        completed: completedCount,
        pending: allBookings.filter((b) => b.status === 'pending').length,
        cancelled: allBookings.filter((b) => b.status === 'cancelled').length,
      },
    };
  }, [allBookings, todayStr, salonTimezone]);

  // Upcoming appointments list for the table preview
  const upcomingAppointmentsList = useMemo(() => {
    return allBookings
      .filter(
        (b) =>
          (b.date || '') >= todayStr &&
          b.status !== 'cancelled' &&
          b.status !== 'completed' &&
          b.attendanceStatus !== 'attended'
      )
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }, [allBookings, todayStr]);

  // Recent bookings (top 6 latest)
  const recentBookingsList = useMemo(() => allBookings.slice(0, 6), [allBookings]);

  // 8 Mandatory Real-Time Metric Cards
  const metricCards: MetricCardState[] = [
    {
      label: 'TOTAL CUSTOMERS',
      value:
        customerCount !== null && customerCount > 0
          ? customerCount.toLocaleString('en-IN')
          : 'No data yet',
      isNoData: customerCount === null || customerCount === 0,
      subtext:
        customerCount !== null && customerCount > 0
          ? 'Authoritative registered clients'
          : 'No client records in users collection',
      icon: Users,
      accentColor: '#2563EB',
      badgeLabel: customerCount !== null && customerCount > 0 ? 'Live DB' : undefined,
      badgeVariant: 'blue',
    },
    {
      label: "TODAY'S BOOKINGS",
      value: metrics.todayBookingsCount > 0 ? metrics.todayBookingsCount.toString() : '0',
      isNoData: metrics.todayBookingsCount === 0,
      subtext:
        metrics.todayBookingsCount > 0
          ? `Appointments scheduled for ${todayStr} (IST)`
          : `No appointments scheduled for today`,
      icon: CalendarCheck2,
      accentColor: '#B7791F',
      badgeLabel: metrics.todayBookingsCount > 0 ? 'Today' : undefined,
      badgeVariant: 'gold',
    },
    {
      label: 'UPCOMING APPOINTMENTS',
      value: metrics.upcomingCount > 0 ? metrics.upcomingCount.toString() : '0',
      isNoData: metrics.upcomingCount === 0,
      subtext:
        metrics.upcomingCount > 0
          ? 'Active reservations ahead'
          : 'No upcoming scheduled visits',
      icon: CalendarClock,
      accentColor: '#3B82F6',
      badgeLabel: metrics.upcomingCount > 0 ? 'Scheduled' : undefined,
      badgeVariant: 'blue',
    },
    {
      label: "TODAY'S CASH REVENUE",
      value:
        metrics.todayRevenue > 0
          ? `₹${metrics.todayRevenue.toLocaleString('en-IN')}`
          : metrics.todayPaidCount === 0
          ? '₹0'
          : 'Price unrecorded',
      isNoData: metrics.todayRevenue === 0 && metrics.todayPaidCount === 0,
      subtext:
        metrics.todayPaidCount > 0
          ? `${metrics.todayPaidCount} cash collection${metrics.todayPaidCount === 1 ? '' : 's'} recorded today`
          : 'No cash collected today',
      icon: CreditCard,
      accentColor: '#16A34A',
      badgeLabel: metrics.todayRevenue > 0 ? 'Cash IST' : undefined,
      badgeVariant: 'success',
    },
    {
      label: 'TOTAL CASH REVENUE',
      value:
        metrics.totalRevenue > 0
          ? `₹${metrics.totalRevenue.toLocaleString('en-IN')}`
          : '₹0',
      isNoData: metrics.totalRevenue === 0,
      subtext:
        metrics.totalPaidCount > 0
          ? `${metrics.totalPaidCount} attended cash transaction${metrics.totalPaidCount === 1 ? '' : 's'}`
          : 'No attended cash payments in DB',
      icon: Wallet,
      accentColor: '#16A34A',
      badgeLabel: metrics.totalRevenue > 0 ? 'Attended Cash' : undefined,
      badgeVariant: 'success',
    },
    {
      label: 'COMPLETED APPOINTMENTS',
      value: metrics.completedCount > 0 ? metrics.completedCount.toString() : '0',
      isNoData: metrics.completedCount === 0,
      subtext:
        metrics.completedCount > 0
          ? 'Attended and finished salon visits'
          : 'No completed appointments yet',
      icon: UserCheck,
      accentColor: '#16A34A',
      badgeLabel: metrics.completedCount > 0 ? 'Attended' : undefined,
      badgeVariant: 'success',
    },
    {
      label: 'NOT ATTENDED',
      value: metrics.notAttendedCount > 0 ? metrics.notAttendedCount.toString() : '0',
      isNoData: metrics.notAttendedCount === 0,
      subtext:
        metrics.notAttendedCount > 0
          ? 'Marked not attended by salon admin'
          : 'No unattended visits recorded',
      icon: UserX,
      accentColor: '#DC2626',
      badgeLabel: metrics.notAttendedCount > 0 ? 'No-Show' : undefined,
      badgeVariant: 'danger',
    },
    {
      label: 'PENDING PAYMENTS',
      value:
        metrics.pendingBalanceSum > 0
          ? `₹${metrics.pendingBalanceSum.toLocaleString('en-IN')}`
          : metrics.pendingPaymentsCount > 0
          ? `${metrics.pendingPaymentsCount} pending`
          : '₹0',
      isNoData: metrics.pendingPaymentsCount === 0,
      subtext:
        metrics.pendingPaymentsCount > 0
          ? `${metrics.pendingPaymentsCount} unpaid booking${metrics.pendingPaymentsCount === 1 ? '' : 's'}${
              metrics.unpricedPendingCount > 0 ? ` (${metrics.unpricedPendingCount} unpriced)` : ''
            }`
          : 'All active bookings settled',
      icon: AlertTriangle,
      accentColor: '#D97706',
      badgeLabel: metrics.pendingPaymentsCount > 0 ? 'Outstanding' : undefined,
      badgeVariant: 'warning',
    },
  ];

  // Helper for badge variant based on booking status
  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'confirmed':
        return 'success';
      case 'completed':
        return 'blue';
      case 'pending':
        return 'warning';
      case 'cancelled':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* 1. DASHBOARD HEADER */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold text-[#B7791F] uppercase tracking-wider block">
              MUSHA EMPIRE ADMIN PORTAL
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#171513] tracking-tight mt-0.5">
              Live Salon Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-[#6B7280] font-normal mt-1 max-w-2xl">
              Real-time salon operations, INR revenue tracking, and client attendance monitoring for {salonTimezone}.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2.5 shrink-0">
            {/* Dynamic Real Date Indicator in IST */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] text-xs font-semibold text-[#171513]">
              <Clock className="w-3.5 h-3.5 text-[#B7791F]" />
              <span>{formattedToday} ({salonTimezone === 'Asia/Kolkata' ? 'IST' : salonTimezone})</span>
            </div>

            {/* Cash Revenue Report Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/admin/analytics')}
              leftIcon={<Receipt className="w-3.5 h-3.5 text-[#B7791F]" />}
              className="min-h-[38px] text-[#B7791F] border-[#FCEEC8] bg-[#FEF9EE] hover:bg-[#FDF2D9]"
            >
              Cash Revenue Report
            </Button>

            {/* Controlled Refresh Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualRefresh}
              isLoading={isRefreshing}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
              className="min-h-[38px]"
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Global Error Banner if Firestore failed */}
        {error && (
          <div className="mt-4 p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] flex items-center justify-between text-xs text-[#DC2626]">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={handleManualRefresh}
              className="font-bold underline hover:text-[#991B1B] cursor-pointer ml-2"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* 2. 8 REAL-TIME METRIC CARDS (2 ROWS OF 4) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((card, index) => {
          const Icon = card.icon;

          if (loading) {
            return (
              <Card key={index} className="p-5 animate-pulse">
                <div className="flex items-center justify-between mb-3">
                  <div className="h-3 bg-[#E5E7EB] rounded w-28"></div>
                  <div className="w-8 h-8 rounded-lg bg-[#E5E7EB]"></div>
                </div>
                <div className="h-7 bg-[#E5E7EB] rounded w-20 my-2"></div>
                <div className="h-3 bg-[#E5E7EB] rounded w-36 mt-3"></div>
              </Card>
            );
          }

          return (
            <Card
              key={index}
              className="p-5 flex flex-col justify-between hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.05)] transition-all duration-200"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
                    {card.label}
                  </span>
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${card.accentColor}12`, color: card.accentColor }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                </div>

                <div className="mt-1">
                  <p
                    className={`tracking-tight tabular-nums ${
                      card.isNoData
                        ? 'text-base font-semibold text-[#9CA3AF] italic'
                        : 'text-2xl font-bold text-[#171513]'
                    }`}
                  >
                    {card.value}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#F3F4F6] flex items-center justify-between text-[11px]">
                <span className="text-[#6B7280] font-normal truncate max-w-[170px]" title={card.subtext}>
                  {card.subtext}
                </span>
                {card.badgeLabel && card.badgeVariant && (
                  <Badge variant={card.badgeVariant} className="text-[10px] px-1.5 py-0 shrink-0">
                    {card.badgeLabel}
                  </Badge>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* 3. QUICK ACTIONS ROW */}
      <Card>
        <CardHeader
          title="Quick Actions"
          subtitle="Instant administrative shortcuts to salon management modules"
        />
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* New Booking Button */}
            <PermissionGate permission="bookings.create">
              <button
                onClick={() => setShowNewBookingNotice(true)}
                className="p-3.5 rounded-xl border border-[#E5E7EB] hover:border-[#B7791F] hover:bg-[#FEF9EE] text-left transition-all group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-[#FEF9EE] text-[#B7791F] flex items-center justify-center mb-2 border border-[#FCEEC8]">
                  <Plus className="w-4 h-4" />
                </div>
                <p className="text-xs font-semibold text-[#171513] group-hover:text-[#B7791F]">
                  + New Booking
                </p>
                <p className="text-[11px] text-[#6B7280] mt-0.5">Create appointment</p>
              </button>
            </PermissionGate>

            {/* Manage Services Button */}
            <PermissionGate permission="services.view">
              <button
                onClick={() => navigate('/admin/services')}
                className="p-3.5 rounded-xl border border-[#E5E7EB] hover:border-[#B7791F] hover:bg-[#FEF9EE] text-left transition-all group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-[#F7F8FA] group-hover:bg-white text-[#B7791F] flex items-center justify-center mb-2 border border-[#E5E7EB]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <p className="text-xs font-semibold text-[#171513] group-hover:text-[#B7791F]">
                  Manage Services
                </p>
                <p className="text-[11px] text-[#6B7280] mt-0.5">Pricing & treatments</p>
              </button>
            </PermissionGate>

            {/* View Customers Button */}
            <PermissionGate permission="customers.view">
              <button
                onClick={() => navigate('/admin/customers')}
                className="p-3.5 rounded-xl border border-[#E5E7EB] hover:border-[#2563EB] hover:bg-[#EFF6FF] text-left transition-all group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-[#F7F8FA] group-hover:bg-white text-[#2563EB] flex items-center justify-center mb-2 border border-[#E5E7EB]">
                  <Users className="w-4 h-4" />
                </div>
                <p className="text-xs font-semibold text-[#171513] group-hover:text-[#2563EB]">
                  View Customers
                </p>
                <p className="text-[11px] text-[#6B7280] mt-0.5">Client accounts</p>
              </button>
            </PermissionGate>

            {/* Manage Offers Button */}
            <PermissionGate permission="offers.view">
              <button
                onClick={() => navigate('/admin/offers')}
                className="p-3.5 rounded-xl border border-[#E5E7EB] hover:border-[#16A34A] hover:bg-[#F0FDF4] text-left transition-all group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-[#F7F8FA] group-hover:bg-white text-[#16A34A] flex items-center justify-center mb-2 border border-[#E5E7EB]">
                  <Tag className="w-4 h-4" />
                </div>
                <p className="text-xs font-semibold text-[#171513] group-hover:text-[#16A34A]">
                  Manage Offers
                </p>
                <p className="text-[11px] text-[#6B7280] mt-0.5">Seasonal discounts</p>
              </button>
            </PermissionGate>
          </div>

          {showNewBookingNotice && (
            <div className="mt-4 p-4 rounded-xl bg-[#FEF9EE] border border-[#FCEEC8] flex items-start justify-between gap-3 text-xs">
              <div>
                <p className="font-bold text-[#B7791F]">Booking Creation Flow</p>
                <p className="text-[#8D580F] mt-0.5 leading-relaxed">
                  Appointments submitted by clients or created through the Bookings portal automatically sync in real-time to this dashboard.
                </p>
              </div>
              <button
                onClick={() => setShowNewBookingNotice(false)}
                className="text-[#B7791F] font-semibold underline hover:text-[#78350F] cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. MAIN GRID: BOOKING ACTIVITY & SALON STATUS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT 2 COLUMNS: BOOKING ACTIVITY */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader
              title="Booking Activity"
              subtitle="Live status distribution across all registered salon bookings"
              action={
                <Badge variant="neutral">
                  Total Records: {allBookings.length}
                </Badge>
              }
            />
            <CardContent>
              {loading ? (
                <div className="space-y-3 py-4 animate-pulse">
                  <div className="h-4 bg-[#E5E7EB] rounded w-full"></div>
                  <div className="h-4 bg-[#E5E7EB] rounded w-5/6"></div>
                  <div className="h-4 bg-[#E5E7EB] rounded w-3/4"></div>
                </div>
              ) : allBookings.length === 0 ? (
                <EmptyState
                  title="No booking activity yet"
                  description="Booking activity will appear here once appointments are created."
                  icon={<CalendarDays className="w-5 h-5 text-[#B7791F]" />}
                />
              ) : (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {/* Confirmed */}
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-[#16A34A] flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Confirmed
                        </span>
                        <span className="text-[#171513]">
                          {metrics.statusCounts.confirmed} ({Math.round((metrics.statusCounts.confirmed / allBookings.length) * 100)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
                        <div
                          className="h-full bg-[#16A34A] rounded-full transition-all duration-300"
                          style={{
                            width: `${(metrics.statusCounts.confirmed / allBookings.length) * 100}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Pending */}
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-[#D97706] flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          Pending
                        </span>
                        <span className="text-[#171513]">
                          {metrics.statusCounts.pending} ({Math.round((metrics.statusCounts.pending / allBookings.length) * 100)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
                        <div
                          className="h-full bg-[#D97706] rounded-full transition-all duration-300"
                          style={{
                            width: `${(metrics.statusCounts.pending / allBookings.length) * 100}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Completed */}
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-[#2563EB] flex items-center gap-1.5">
                          <CalendarCheck2 className="w-3.5 h-3.5" />
                          Completed / Attended
                        </span>
                        <span className="text-[#171513]">
                          {metrics.statusCounts.completed} ({Math.round((metrics.statusCounts.completed / allBookings.length) * 100)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
                        <div
                          className="h-full bg-[#2563EB] rounded-full transition-all duration-300"
                          style={{
                            width: `${(metrics.statusCounts.completed / allBookings.length) * 100}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Cancelled */}
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-[#DC2626] flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Cancelled
                        </span>
                        <span className="text-[#171513]">
                          {metrics.statusCounts.cancelled} ({Math.round((metrics.statusCounts.cancelled / allBookings.length) * 100)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
                        <div
                          className="h-full bg-[#DC2626] rounded-full transition-all duration-300"
                          style={{
                            width: `${(metrics.statusCounts.cancelled / allBookings.length) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT 1 COLUMN: SALON STATUS CARD */}
        <div>
          <Card className="h-full flex flex-col justify-between">
            <div>
              <CardHeader
                title="Salon Status"
                subtitle="Operational configuration from settings/salon"
              />
              <CardContent>
                {loading ? (
                  <div className="space-y-3 py-2 animate-pulse">
                    <div className="h-4 bg-[#E5E7EB] rounded w-3/4"></div>
                    <div className="h-4 bg-[#E5E7EB] rounded w-1/2"></div>
                  </div>
                ) : !settingsLoaded || !salonSettings ? (
                  <div className="py-4 text-center">
                    <div className="w-9 h-9 rounded-full bg-[#F7F8FA] border border-[#E5E7EB] flex items-center justify-center mx-auto mb-2 text-[#6B7280]">
                      <Store className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-semibold text-[#171513]">
                      Salon settings not configured
                    </p>
                    <p className="text-[11px] text-[#6B7280] mt-1 max-w-xs mx-auto">
                      Settings document in settings/salon has not been initialized.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between items-center py-1 border-b border-[#F3F4F6]">
                      <span className="text-[#6B7280]">Salon Name</span>
                      <span className="font-semibold text-[#171513]">
                        {salonSettings.salonName || salonSettings.name || 'Musha Empire'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-[#F3F4F6]">
                      <span className="text-[#6B7280]">Operating State</span>
                      <Badge variant="success">
                        {salonSettings.status || salonSettings.operatingState || 'Operational'}
                      </Badge>
                    </div>

                    <div className="flex justify-between items-center py-1 border-b border-[#F3F4F6]">
                      <span className="text-[#6B7280]">Timezone</span>
                      <span className="font-semibold text-[#171513]">
                        {salonSettings.timezone || 'Asia/Kolkata'}
                      </span>
                    </div>

                    {salonSettings.phone && (
                      <div className="flex justify-between items-center py-1 border-b border-[#F3F4F6]">
                        <span className="text-[#6B7280]">Contact Phone</span>
                        <span className="font-semibold text-[#171513]">
                          {salonSettings.phone}
                        </span>
                      </div>
                    )}

                    {salonSettings.email && (
                      <div className="flex justify-between items-center py-1">
                        <span className="text-[#6B7280]">Contact Email</span>
                        <span className="font-semibold text-[#171513] truncate max-w-[150px]">
                          {salonSettings.email}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </div>

            <div className="p-4 bg-[#FAFBFD] border-t border-[#E5E7EB] rounded-b-xl flex items-center justify-between text-[11px] text-[#6B7280]">
              <span>Shared Backend State</span>
              <span className="font-semibold text-[#16A34A]">Synchronized</span>
            </div>
          </Card>
        </div>
      </div>

      {/* 5. UPCOMING APPOINTMENTS SECTION */}
      <Card>
        <CardHeader
          title="Upcoming Appointments"
          subtitle="Authoritative schedule of upcoming salon reservations"
          action={
            <PermissionGate permission="bookings.view">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin/bookings')}
                rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
              >
                View Full Calendar
              </Button>
            </PermissionGate>
          }
        />
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-xs text-[#6B7280] animate-pulse">
              Retrieving upcoming appointments from Firestore...
            </div>
          ) : upcomingAppointmentsList.length === 0 ? (
            <EmptyState
              title="No upcoming appointments"
              description="Scheduled client appointments will be displayed here as they are booked."
              icon={<CalendarClock className="w-5 h-5 text-[#2563EB]" />}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[600px]">
                <thead>
                  <tr className="border-b border-[#E5E7EB] text-[#6B7280] font-semibold">
                    <th className="pb-3 pl-2">Customer</th>
                    <th className="pb-3">Service</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Time</th>
                    <th className="pb-3">Duration</th>
                    <th className="pb-3 text-right pr-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {upcomingAppointmentsList.slice(0, 5).map((app) => (
                    <tr key={app.id} className="hover:bg-[#F9FAFB] transition-colors">
                      <td className="py-3 pl-2 font-semibold text-[#171513]">
                        {app.customerName}
                      </td>
                      <td className="py-3 text-[#4B5563]">{app.serviceName}</td>
                      <td className="py-3 text-[#6B7280]">{app.date}</td>
                      <td className="py-3 text-[#6B7280]">{app.time || '-'}</td>
                      <td className="py-3 text-[#6B7280]">
                        {app.durationMinutes ? `${app.durationMinutes} min` : '-'}
                      </td>
                      <td className="py-3 text-right pr-2">
                        <Badge variant={getStatusBadgeVariant(app.status)}>
                          {app.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 6. RECENT BOOKINGS SECTION */}
      <Card>
        <CardHeader
          title="Recent Bookings"
          subtitle="Latest appointments received in Firestore"
          action={
            <PermissionGate permission="bookings.view">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/admin/bookings')}
                rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
              >
                All Bookings
              </Button>
            </PermissionGate>
          }
        />
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-xs text-[#6B7280] animate-pulse">
              Loading recent booking records...
            </div>
          ) : recentBookingsList.length === 0 ? (
            <EmptyState
              title="No recent bookings"
              description="Appointments submitted through the customer app will show here in real-time."
              icon={<CalendarDays className="w-5 h-5 text-[#B7791F]" />}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[620px]">
                <thead>
                  <tr className="border-b border-[#E5E7EB] text-[#6B7280] font-semibold">
                    <th className="pb-3 pl-2">Customer</th>
                    <th className="pb-3">Service</th>
                    <th className="pb-3">Date</th>
                    <th className="pb-3">Time</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right pr-2">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {recentBookingsList.map((b) => (
                    <tr key={b.id} className="hover:bg-[#F9FAFB] transition-colors">
                      <td className="py-3 pl-2 font-semibold text-[#171513]">
                        {b.customerName}
                      </td>
                      <td className="py-3 text-[#4B5563]">{b.serviceName}</td>
                      <td className="py-3 text-[#6B7280]">{b.date}</td>
                      <td className="py-3 text-[#6B7280]">{b.time || '-'}</td>
                      <td className="py-3">
                        <Badge variant={getStatusBadgeVariant(b.status)}>
                          {b.status}
                        </Badge>
                      </td>
                      <td className="py-3 text-right pr-2">
                        <div className="font-semibold text-[#171513] tabular-nums">
                          {b.isPriceAvailable && b.price !== null
                            ? `₹${b.price.toLocaleString('en-IN')}`
                            : '—'}
                        </div>
                        <div className="text-[10px] text-[#6B7280] mt-0.5 capitalize">
                          {b.paymentStatus === 'paid' ? (
                            <span className="text-[#16A34A] font-medium">Paid</span>
                          ) : (
                            <span className="text-[#D97706] font-medium">Unpaid</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
