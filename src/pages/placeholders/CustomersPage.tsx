import React, { useEffect, useState, useMemo } from 'react';
import {
  Users,
  Search,
  Filter,
  Eye,
  Calendar,
  DollarSign,
  Phone,
  Mail,
  User,
  CalendarDays,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  QrCode,
  X,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { COLLECTIONS } from '../../firebase/collections';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/common/EmptyState';
import {
  normalizeBooking,
  type NormalizedBooking,
  type UserProfile,
  type CustomerSummary,
  ADMIN_AUTHORIZED_ROLES,
} from '../../firebase/types';

export const CustomersPage: React.FC = () => {
  const { hasPermission, role, user } = useAuth();

  // Raw Data State
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [bookings, setBookings] = useState<NormalizedBooking[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'with_bookings' | 'zero_bookings'>('all');
  const [registrationDateFilter, setRegistrationDateFilter] = useState<string>('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 12;

  // Selected Customer for Profile Detail Modal
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);

  // 1. Subscribe to `users` and `bookings` collections
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    // In preview or unauthenticated mode, do not attach snapshot listener
    if (!user) {
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const usersColRef = collection(db, COLLECTIONS.USERS);
    const bookingsColRef = collection(db, COLLECTIONS.BOOKINGS);

    const unsubUsers = onSnapshot(
      usersColRef,
      (snapshot) => {
        const loaded: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          loaded.push({
            uid: docSnap.id,
            email: data.email || '',
            displayName: data.displayName || data.name || '',
            phoneNumber: data.phoneNumber || data.phone || undefined,
            role: data.role || 'customer',
            createdAt: data.createdAt || data.created_at || null,
            updatedAt: data.updatedAt || data.updated_at || null,
          });
        });
        setUsers(loaded);
      },
      (err) => {
        console.warn('Notice listening to users collection:', err.message);
        setError('Unable to load client directory from database.');
        setLoading(false);
      }
    );

    const unsubBookings = onSnapshot(
      bookingsColRef,
      (snapshot) => {
        const loaded: NormalizedBooking[] = [];
        snapshot.forEach((docSnap) => {
          loaded.push(normalizeBooking(docSnap.id, docSnap.data()));
        });
        setBookings(loaded);
        setLoading(false);
      },
      (err) => {
        console.warn('Notice listening to bookings collection for customers:', err.message);
        setLoading(false);
      }
    );

    return () => {
      unsubUsers();
      unsubBookings();
    };
  }, [user]);

  // 2. Aggregate Customers: EXCLUDE staff accounts and compute metrics from genuine bookings
  const customerList: CustomerSummary[] = useMemo(() => {
    // Filter out staff roles from users collection
    const genuineCustomers = users.filter((u) => !ADMIN_AUTHORIZED_ROLES.includes(u.role));
    const processedUids = new Set<string>();
    const processedEmails = new Set<string>();

    const list: CustomerSummary[] = genuineCustomers.map((c) => {
      processedUids.add(c.uid);
      if (c.email && c.email.trim()) {
        processedEmails.add(c.email.toLowerCase().trim());
      }

      // Find all bookings belonging to this customer by UID or matching email
      const userBookings = bookings.filter((b) => {
        if (b.customerId && b.customerId === c.uid) return true;
        if (c.email && b.customerEmail && b.customerEmail.toLowerCase().trim() === c.email.toLowerCase().trim()) return true;
        return false;
      });

      const completedVisits = userBookings.filter((b) => b.status === 'completed').length;
      const cancelledVisits = userBookings.filter((b) => b.status === 'cancelled').length;

      // Lifetime spend: calculated only from verified 'paid' bookings
      const lifetimeSpend = userBookings
        .filter((b) => b.paymentStatus === 'paid')
        .reduce((sum, b) => sum + (b.price || 0), 0);

      // Most recent booking date
      const sortedBookings = [...userBookings].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const lastBookingDate = sortedBookings.length > 0 ? sortedBookings[0].date : undefined;

      return {
        uid: c.uid,
        email: c.email || 'No email provided',
        name: c.displayName || 'Client',
        phone: c.phoneNumber,
        createdAt: c.createdAt,
        bookingCount: userBookings.length,
        completedVisits,
        cancelledVisits,
        lifetimeSpend,
        lastBookingDate,
      };
    });

    // Also include clients with concierge booking requests who may not have a user profile yet
    const unprofiledClientsMap = new Map<string, {
      uid: string;
      email: string;
      name: string;
      phone?: string;
      bookings: NormalizedBooking[];
    }>();

    bookings.forEach((b) => {
      const emailKey = b.customerEmail ? b.customerEmail.toLowerCase().trim() : '';
      const uidKey = b.customerId ? b.customerId.trim() : '';

      // Skip if already represented in genuine users
      if ((uidKey && processedUids.has(uidKey)) || (emailKey && processedEmails.has(emailKey))) {
        return;
      }

      const compositeKey = uidKey || emailKey || b.customerPhone || b.id;
      if (!unprofiledClientsMap.has(compositeKey)) {
        unprofiledClientsMap.set(compositeKey, {
          uid: uidKey || `client-${compositeKey}`,
          email: b.customerEmail || 'No email provided',
          name: b.customerName || 'Client',
          phone: b.customerPhone,
          bookings: [],
        });
      }
      unprofiledClientsMap.get(compositeKey)!.bookings.push(b);
    });

    unprofiledClientsMap.forEach((entry) => {
      const userBookings = entry.bookings;
      const completedVisits = userBookings.filter((b) => b.status === 'completed').length;
      const cancelledVisits = userBookings.filter((b) => b.status === 'cancelled').length;
      const lifetimeSpend = userBookings
        .filter((b) => b.paymentStatus === 'paid')
        .reduce((sum, b) => sum + (b.price || 0), 0);
      const sortedBookings = [...userBookings].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const lastBookingDate = sortedBookings.length > 0 ? sortedBookings[0].date : undefined;

      list.push({
        uid: entry.uid,
        email: entry.email,
        name: entry.name,
        phone: entry.phone,
        createdAt: userBookings[userBookings.length - 1]?.createdAt || null,
        bookingCount: userBookings.length,
        completedVisits,
        cancelledVisits,
        lifetimeSpend,
        lastBookingDate,
      });
    });

    return list;
  }, [users, bookings]);

  // 3. Filter Strategy
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return customerList.filter((c) => {
      // Search Matching
      if (q) {
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesEmail = c.email.toLowerCase().includes(q);
        const matchesPhone = (c.phone || '').toLowerCase().includes(q);
        const matchesUid = c.uid.toLowerCase().includes(q);

        if (!matchesName && !matchesEmail && !matchesPhone && !matchesUid) {
          return false;
        }
      }

      // Activity Filter
      if (activityFilter === 'with_bookings' && c.bookingCount === 0) {
        return false;
      }
      if (activityFilter === 'zero_bookings' && c.bookingCount > 0) {
        return false;
      }

      // Registration Date Filter
      if (registrationDateFilter && c.createdAt) {
        const createdDateStr =
          typeof c.createdAt === 'string'
            ? c.createdAt.split('T')[0]
            : typeof c.createdAt === 'object' && c.createdAt !== null && 'seconds' in c.createdAt
            ? new Date((c.createdAt as any).seconds * 1000).toISOString().split('T')[0]
            : '';
        if (createdDateStr && createdDateStr !== registrationDateFilter) {
          return false;
        }
      }

      return true;
    });
  }, [customerList, searchQuery, activityFilter, registrationDateFilter]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  // Reset page when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activityFilter, registrationDateFilter]);

  // Find bookings for the selected customer modal
  const selectedCustomerBookings = useMemo(() => {
    if (!selectedCustomer) return [];
    return bookings
      .filter((b) => {
        if (b.customerId && b.customerId === selectedCustomer.uid) return true;
        if (selectedCustomer.email && b.customerEmail && b.customerEmail.toLowerCase() === selectedCustomer.email.toLowerCase()) return true;
        return false;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [selectedCustomer, bookings]);

  // Format date helper
  const formatRegistrationDate = (createdAt?: unknown) => {
    if (!createdAt) return 'Unknown';
    if (typeof createdAt === 'string') {
      try {
        return new Date(createdAt).toLocaleDateString();
      } catch {
        return createdAt.split('T')[0];
      }
    }
    if (typeof createdAt === 'object' && createdAt !== null && 'seconds' in createdAt) {
      return new Date((createdAt as any).seconds * 1000).toLocaleDateString();
    }
    return 'Unknown';
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
              Customer Directory
            </h1>
            <p className="text-xs sm:text-sm text-[#6B7280] font-normal mt-1 max-w-2xl">
              Inspect registered salon clients, lifetime appointment frequency, and verified spend.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-[#6B7280]">
              Total Clients: <strong className="text-[#171513] font-bold">{customerList.length}</strong>
            </span>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mt-4 p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] flex items-center justify-between text-xs text-[#DC2626]">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. SEARCH & FILTER CONTROLS */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search Input */}
            <div className="relative sm:col-span-2">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9CA3AF]">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by customer name, email, phone, or ID..."
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

            {/* Activity Filter */}
            <div>
              <select
                value={activityFilter}
                onChange={(e) => setActivityFilter(e.target.value as any)}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white min-h-[40px] cursor-pointer"
              >
                <option value="all">All Clients ({customerList.length})</option>
                <option value="with_bookings">With Booking History</option>
                <option value="zero_bookings">No Bookings Yet</option>
              </select>
            </div>

            {/* Registration Date Filter */}
            <div>
              <input
                type="date"
                value={registrationDateFilter}
                onChange={(e) => setRegistrationDateFilter(e.target.value)}
                title="Filter by Registration Date"
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-medium text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white min-h-[40px]"
              />
            </div>
          </div>

          {/* Active Filter Chips */}
          {(searchQuery || activityFilter !== 'all' || registrationDateFilter) && (
            <div className="mt-3 pt-3 border-t border-[#F3F4F6] flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[#6B7280]">Active Filters:</span>
                {searchQuery && <Badge variant="blue">Query: &quot;{searchQuery}&quot;</Badge>}
                {activityFilter !== 'all' && (
                  <Badge variant="neutral">
                    {activityFilter === 'with_bookings' ? 'Has Bookings' : 'No Bookings'}
                  </Badge>
                )}
                {registrationDateFilter && (
                  <Badge variant="neutral">Registered: {registrationDateFilter}</Badge>
                )}
              </div>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActivityFilter('all');
                  setRegistrationDateFilter('');
                }}
                className="text-[#DC2626] hover:underline font-semibold cursor-pointer text-[11px]"
              >
                Reset Filters
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. CUSTOMERS TABLE & MOBILE CARDS */}
      <Card>
        <CardHeader
          title={`Registered Clients (${filteredCustomers.length})`}
          subtitle="Genuine client accounts excluding salon staff members"
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
          ) : filteredCustomers.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No customers found"
                description={
                  customerList.length === 0
                    ? 'No client accounts have been registered yet.'
                    : 'No clients match your search criteria.'
                }
                icon={<Users className="w-8 h-8 text-[#B7791F]" />}
                action={
                  customerList.length > 0 ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearchQuery('');
                        setActivityFilter('all');
                        setRegistrationDateFilter('');
                      }}
                    >
                      Reset Filters
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
                      <th className="py-3.5 pl-6 pr-4">Client</th>
                      <th className="py-3.5 px-4">Contact</th>
                      <th className="py-3.5 px-4">Joined Date</th>
                      <th className="py-3.5 px-4 text-center">Bookings</th>
                      <th className="py-3.5 px-4 text-center">Completed</th>
                      <th className="py-3.5 px-4">Lifetime Spend</th>
                      <th className="py-3.5 px-4">Last Visit</th>
                      <th className="py-3.5 pl-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F4F6]">
                    {paginatedCustomers.map((c) => (
                      <tr key={c.uid} className="hover:bg-[#F9FAFB] transition-colors">
                        {/* Avatar & Name */}
                        <td className="py-4 pl-6 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#FEF9EE] border border-[#FCEEC8] text-[#B7791F] font-bold flex items-center justify-center shrink-0 text-xs">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-bold text-[#171513] text-sm block">
                                {c.name}
                              </span>
                              <span className="font-mono text-[10px] text-[#9CA3AF]">
                                ID: #{c.uid.slice(0, 8)}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Contact Details */}
                        <td className="py-4 px-4">
                          <div className="space-y-0.5">
                            <span className="text-[#171513] block font-medium">{c.email}</span>
                            {c.phone ? (
                              <span className="text-[11px] text-[#6B7280] block">{c.phone}</span>
                            ) : (
                              <span className="text-[10px] text-[#9CA3AF] italic">No phone</span>
                            )}
                          </div>
                        </td>

                        {/* Joined Date */}
                        <td className="py-4 px-4 text-[#6B7280]">
                          {formatRegistrationDate(c.createdAt)}
                        </td>

                        {/* Bookings Count */}
                        <td className="py-4 px-4 text-center">
                          <span className="px-2 py-0.5 rounded-md bg-[#F7F8FA] border border-[#E5E7EB] font-bold text-[#171513]">
                            {c.bookingCount}
                          </span>
                        </td>

                        {/* Completed Visits */}
                        <td className="py-4 px-4 text-center">
                          <span className="font-bold text-[#16A34A]">{c.completedVisits}</span>
                        </td>

                        {/* Lifetime Spend */}
                        <td className="py-4 px-4 font-bold text-[#171513]">
                          ${c.lifetimeSpend.toFixed(2)}
                        </td>

                        {/* Last Visit */}
                        <td className="py-4 px-4 text-[#6B7280]">
                          {c.lastBookingDate || <span className="text-[#9CA3AF] italic">None</span>}
                        </td>

                        {/* Action Buttons */}
                        <td className="py-4 pl-4 pr-6 text-right">
                          <button
                            onClick={() => setSelectedCustomer(c)}
                            title="View Profile & Booking History"
                            className="p-1.5 rounded-lg text-[#B7791F] hover:bg-[#FEF9EE] transition-colors cursor-pointer inline-flex items-center gap-1 font-semibold text-xs"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Profile</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE RESPONSIVE CARDS VIEW */}
              <div className="lg:hidden p-4 space-y-3">
                {paginatedCustomers.map((c) => (
                  <div
                    key={c.uid}
                    className="p-4 rounded-xl border border-[#E5E7EB] bg-white space-y-3 hover:border-[#D6A84F] transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-[#FEF9EE] border border-[#FCEEC8] text-[#B7791F] font-bold flex items-center justify-center shrink-0 text-xs">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-[#171513]">{c.name}</h3>
                          <p className="text-xs text-[#6B7280]">{c.email}</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-bold text-sm text-[#171513] block">
                          ${c.lifetimeSpend.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-[#6B7280]">Lifetime Spend</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-[#6B7280] pt-2 border-t border-[#F3F4F6]">
                      <span>{c.bookingCount} Bookings ({c.completedVisits} Completed)</span>
                      <span>Last: {c.lastBookingDate || 'Never'}</span>
                    </div>

                    <div className="flex items-center justify-end pt-2 border-t border-[#F3F4F6]">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedCustomer(c)}
                        leftIcon={<Eye className="w-3.5 h-3.5" />}
                        className="text-xs w-full sm:w-auto"
                      >
                        View Client Profile
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* PAGINATION CONTROLS */}
              {totalPages > 1 && (
                <div className="p-4 border-t border-[#E5E7EB] flex items-center justify-between text-xs text-[#6B7280]">
                  <span>
                    Showing {(currentPage - 1) * pageSize + 1} to{' '}
                    {Math.min(currentPage * pageSize, filteredCustomers.length)} of{' '}
                    {filteredCustomers.length}
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

      {/* 4. CUSTOMER DETAIL MODAL */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col my-auto overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-[#E5E7EB] flex items-center justify-between bg-[#FAFBFD]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-[#FEF9EE] border border-[#FCEEC8] text-[#B7791F] font-bold flex items-center justify-center text-sm">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#171513]">
                    {selectedCustomer.name}
                  </h3>
                  <p className="text-xs text-[#6B7280]">
                    Registered: {formatRegistrationDate(selectedCustomer.createdAt)}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-1 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Content */}
            <div className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
              {/* Summary Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-[#FAFBFD] border border-[#E5E7EB] text-center">
                  <span className="text-[10px] text-[#6B7280] uppercase tracking-wider block">Total Bookings</span>
                  <span className="text-lg font-bold text-[#171513] mt-0.5 block">{selectedCustomer.bookingCount}</span>
                </div>

                <div className="p-3 rounded-xl bg-[#F0FDF4] border border-[#DCFCE7] text-center">
                  <span className="text-[10px] text-[#166534] uppercase tracking-wider block">Completed</span>
                  <span className="text-lg font-bold text-[#16A34A] mt-0.5 block">{selectedCustomer.completedVisits}</span>
                </div>

                <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] text-center">
                  <span className="text-[10px] text-[#991B1B] uppercase tracking-wider block">Cancelled</span>
                  <span className="text-lg font-bold text-[#DC2626] mt-0.5 block">{selectedCustomer.cancelledVisits}</span>
                </div>

                <div className="p-3 rounded-xl bg-[#FEF9EE] border border-[#FCEEC8] text-center">
                  <span className="text-[10px] text-[#B7791F] uppercase tracking-wider block">Verified Spend</span>
                  <span className="text-lg font-bold text-[#B7791F] mt-0.5 block">${selectedCustomer.lifetimeSpend.toFixed(2)}</span>
                </div>
              </div>

              {/* Contact Information */}
              <div className="p-4 rounded-xl border border-[#E5E7EB] space-y-2">
                <h4 className="font-bold text-[#171513]">Contact & Profile Info</h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                    <span className="text-[#6B7280]">Email Address:</span>
                    <a
                      href={`mailto:${selectedCustomer.email}`}
                      className="font-semibold text-[#2563EB] hover:underline flex items-center gap-1"
                    >
                      <Mail className="w-3 h-3" />
                      {selectedCustomer.email}
                    </a>
                  </div>

                  {selectedCustomer.phone && (
                    <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                      <span className="text-[#6B7280]">Phone Number:</span>
                      <a
                        href={`tel:${selectedCustomer.phone}`}
                        className="font-semibold text-[#2563EB] hover:underline flex items-center gap-1"
                      >
                        <Phone className="w-3 h-3" />
                        {selectedCustomer.phone}
                      </a>
                    </div>
                  )}

                  <div className="flex justify-between py-1">
                    <span className="text-[#6B7280]">Customer ID:</span>
                    <span className="font-mono text-[#6B7280]">{selectedCustomer.uid}</span>
                  </div>
                </div>
              </div>

              {/* Booking History Table */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-[#171513]">Appointment History</h4>
                  <span className="text-[#6B7280] text-[11px]">
                    {selectedCustomerBookings.length} records found
                  </span>
                </div>

                {selectedCustomerBookings.length === 0 ? (
                  <div className="p-6 text-center border border-[#E5E7EB] rounded-xl bg-[#F9FAFB] text-[#6B7280]">
                    No appointment reservations found for this customer.
                  </div>
                ) : (
                  <div className="border border-[#E5E7EB] rounded-xl overflow-hidden divide-y divide-[#F3F4F6]">
                    {selectedCustomerBookings.map((b) => (
                      <div key={b.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-[#FAFBFD] transition-colors">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#171513]">{b.serviceName}</span>
                            {getStatusBadge(b.status)}
                          </div>
                          <span className="text-[#6B7280] text-[11px] block mt-0.5">
                            {b.date} at {b.time} • Ticket: {b.ticketCode || `#${b.id.slice(0, 6)}`}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="font-bold text-[#171513] block">
                            {b.isPriceAvailable && b.price !== null ? `₹${b.price.toLocaleString('en-IN')}` : '—'}
                          </span>
                          <span className="text-[10px] text-[#6B7280] capitalize">
                            {b.paymentStatus}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[#E5E7EB] flex items-center justify-end bg-[#FAFBFD]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedCustomer(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
