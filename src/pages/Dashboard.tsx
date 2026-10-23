import React, { useEffect, useState } from 'react';
import {
  Users,
  CalendarCheck2,
  CalendarClock,
  DollarSign,
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
  HelpCircle,
  Percent,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  limit,
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
  type UserProfile,
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
  const { userProfile, role, user } = useAuth();
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

    try {
      // 1. Listen to customers in `users` collection only if authenticated
      if (user) {
        const usersColRef = collection(db, COLLECTIONS.USERS);
        const usersQuery = query(usersColRef, limit(50));
        unsubUsers = onSnapshot(
          usersQuery,
          (snapshot) => {
            let count = 0;
            snapshot.forEach((docSnap) => {
              const data = docSnap.data() as UserProfile;
              // Only count customer accounts
              if (data.role === 'customer' || !data.role) {
                count++;
              }
            });
            setCustomerCount(count > 0 ? count : 0);
          },
          (err) => {
            console.warn('Notice: Firestore users listener notice:', err.message);
            setCustomerCount(null);
          }
        );

        // 2. Listen to real bookings in `bookings` collection only if authenticated
        const bookingsColRef = collection(db, COLLECTIONS.BOOKINGS);
        const bookingsQuery = query(bookingsColRef, limit(40));
        unsubBookings = onSnapshot(
          bookingsQuery,
          (snapshot) => {
            const loaded: NormalizedBooking[] = [];
            snapshot.forEach((docSnap) => {
              loaded.push(normalizeBooking(docSnap.id, docSnap.data()));
            });
            // Sort by date & time descending (latest first)
            loaded.sort((a, b) => {
              const dateA = `${a.date} ${a.time}`;
              const dateB = `${b.date} ${b.time}`;
              return dateB.localeCompare(dateA);
            });
            setAllBookings(loaded);
            setLoading(false);
            setIsRefreshing(false);
          },
          (err) => {
            console.warn('Notice: Firestore bookings listener notice:', err.message);
            setAllBookings([]);
            setLoading(false);
            setIsRefreshing(false);
          }
        );
      } else {
        // In preview mode
        setCustomerCount(null);
        setAllBookings([]);
        setLoading(false);
        setIsRefreshing(false);
      }

      // 3. Listen to salon settings from `settings/salon` (Public read allowed)
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
    // Simulates quick pulse while real-time listeners maintain authoritative data
    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  };

  // Derive authoritative metrics based ONLY on real Firestore data
  const todayStr = new Date().toISOString().split('T')[0];

  // Today's bookings count
  const todayBookingsList = allBookings.filter(
    (b) => b.date === todayStr && b.status !== 'cancelled'
  );
  const todayBookingsCount = todayBookingsList.length;

  // Upcoming appointments (future date or today with future/pending status)
  const upcomingAppointmentsList = allBookings
    .filter((b) => b.date >= todayStr && b.status !== 'cancelled')
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const upcomingCount = upcomingAppointmentsList.length;

  // Revenue: calculated ONLY from authoritative paid bookings (not cancelled)
  const paidBookings = allBookings.filter(
    (b) => b.paymentStatus === 'paid' && b.status !== 'cancelled' && b.price > 0
  );
  const authoritativeRevenue = paidBookings.reduce((sum, b) => sum + b.price, 0);

  // Status Distribution for Booking Activity
  const statusCounts = {
    confirmed: allBookings.filter((b) => b.status === 'confirmed').length,
    completed: allBookings.filter((b) => b.status === 'completed').length,
    pending: allBookings.filter((b) => b.status === 'pending').length,
    cancelled: allBookings.filter((b) => b.status === 'cancelled').length,
  };
  const totalBookingsCount = allBookings.length;

  // Recent bookings (top 6 latest)
  const recentBookingsList = allBookings.slice(0, 6);

  // Dynamic Date string
  const formattedToday = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  // 4 Summary Metrics Configuration
  const metricCards: MetricCardState[] = [
    {
      label: 'TOTAL CUSTOMERS',
      value:
        customerCount !== null && customerCount > 0
          ? customerCount.toLocaleString()
          : 'No customers yet',
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
      value:
        todayBookingsCount > 0 ? todayBookingsCount.toString() : 'No data yet',
      isNoData: todayBookingsCount === 0,
      subtext:
        todayBookingsCount > 0
          ? `Appointments scheduled for ${todayStr}`
          : 'No bookings scheduled for today',
      icon: CalendarCheck2,
      accentColor: '#B7791F',
      badgeLabel: todayBookingsCount > 0 ? 'Today' : undefined,
      badgeVariant: 'gold',
    },
    {
      label: 'UPCOMING APPOINTMENTS',
      value:
        upcomingCount > 0 ? upcomingCount.toString() : 'No data yet',
      isNoData: upcomingCount === 0,
      subtext:
        upcomingCount > 0
          ? 'Active reservations from today onward'
          : 'No upcoming scheduled appointments',
      icon: CalendarClock,
      accentColor: '#16A34A',
      badgeLabel: upcomingCount > 0 ? 'Scheduled' : undefined,
      badgeVariant: 'success',
    },
    {
      label: 'REVENUE',
      value:
        authoritativeRevenue > 0
          ? `$${authoritativeRevenue.toLocaleString()}`
          : 'No payment data yet',
      isNoData: authoritativeRevenue === 0,
      subtext:
        authoritativeRevenue > 0
          ? `${paidBookings.length} paid booking${paidBookings.length === 1 ? '' : 's'} collected`
          : 'No paid appointments recorded in database',
      icon: DollarSign,
      accentColor: '#16A34A',
      badgeLabel: authoritativeRevenue > 0 ? 'Authoritative' : undefined,
      badgeVariant: 'success',
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
              MUSHA EMPIRE ADMIN
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#171513] tracking-tight mt-0.5">
              Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-[#6B7280] font-normal mt-1 max-w-2xl">
              Real-time salon operations, appointment schedule, and client volume overview.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2.5 shrink-0">
            {/* Dynamic Real Date Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#F7F8FA] border border-[#E5E7EB] text-xs font-semibold text-[#171513]">
              <Clock className="w-3.5 h-3.5 text-[#B7791F]" />
              <span>{formattedToday}</span>
            </div>

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

      {/* 2. SUMMARY CARDS (4 PREMIUM CARDS) */}
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
                    className={`tracking-tight ${
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

          {/* New Booking Notice Modal/Drawer (Prompt 3 placeholder notification) */}
          {showNewBookingNotice && (
            <div className="mt-4 p-4 rounded-xl bg-[#FEF9EE] border border-[#FCEEC8] flex items-start justify-between gap-3 text-xs">
              <div>
                <p className="font-bold text-[#B7791F]">Booking Creation Flow</p>
                <p className="text-[#8D580F] mt-0.5 leading-relaxed">
                  The appointment creation wizard will be activated in the upcoming Booking Management module.
                  Existing bookings from the customer web application continue to sync directly to this dashboard.
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
                  Total Records: {totalBookingsCount}
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
              ) : totalBookingsCount === 0 ? (
                <EmptyState
                  title="No booking activity yet"
                  description="Booking activity will appear here once appointments are created."
                  icon={<CalendarDays className="w-5 h-5 text-[#B7791F]" />}
                />
              ) : (
                <div className="space-y-4">
                  {/* Status distribution bars based on REAL data */}
                  <div className="space-y-3">
                    {/* Confirmed */}
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-[#16A34A] flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Confirmed
                        </span>
                        <span className="text-[#171513]">
                          {statusCounts.confirmed} ({Math.round((statusCounts.confirmed / totalBookingsCount) * 100)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
                        <div
                          className="h-full bg-[#16A34A] rounded-full transition-all duration-300"
                          style={{
                            width: `${(statusCounts.confirmed / totalBookingsCount) * 100}%`,
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
                          {statusCounts.pending} ({Math.round((statusCounts.pending / totalBookingsCount) * 100)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
                        <div
                          className="h-full bg-[#D97706] rounded-full transition-all duration-300"
                          style={{
                            width: `${(statusCounts.pending / totalBookingsCount) * 100}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Completed */}
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-[#2563EB] flex items-center gap-1.5">
                          <CalendarCheck2 className="w-3.5 h-3.5" />
                          Completed
                        </span>
                        <span className="text-[#171513]">
                          {statusCounts.completed} ({Math.round((statusCounts.completed / totalBookingsCount) * 100)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
                        <div
                          className="h-full bg-[#2563EB] rounded-full transition-all duration-300"
                          style={{
                            width: `${(statusCounts.completed / totalBookingsCount) * 100}%`,
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
                          {statusCounts.cancelled} ({Math.round((statusCounts.cancelled / totalBookingsCount) * 100)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
                        <div
                          className="h-full bg-[#DC2626] rounded-full transition-all duration-300"
                          style={{
                            width: `${(statusCounts.cancelled / totalBookingsCount) * 100}%`,
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

                    {salonSettings.timezone && (
                      <div className="flex justify-between items-center py-1 border-b border-[#F3F4F6]">
                        <span className="text-[#6B7280]">Timezone</span>
                        <span className="font-semibold text-[#171513]">
                          {salonSettings.timezone}
                        </span>
                      </div>
                    )}

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
                        <div className="font-semibold text-[#171513]">
                          {b.price > 0 ? `$${b.price}` : '-'}
                        </div>
                        <div className="text-[10px] text-[#6B7280] mt-0.5 capitalize">
                          {b.paymentStatus === 'paid' ? (
                            <span className="text-[#16A34A] font-medium">Paid</span>
                          ) : (
                            <span className="text-[#D97706] font-medium">Pending Pay</span>
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
