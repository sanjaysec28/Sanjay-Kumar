import React, { useEffect, useState, useMemo } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  UserCheck,
  UserX,
  Clock,
  Mail,
  Phone,
  Calendar,
  AlertCircle,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  Shield,
  Briefcase,
  AlertTriangle,
  Lock,
  Sparkles,
} from 'lucide-react';
import { collection, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { COLLECTIONS } from '../../firebase/collections';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/common/EmptyState';
import {
  type UserProfile,
  type UserRole,
  ADMIN_AUTHORIZED_ROLES,
} from '../../firebase/types';
import { ROLE_PERMISSIONS_MATRIX, type Permission } from '../../auth/permissions';

export const StaffPage: React.FC = () => {
  const { role: currentUserRole, userProfile: currentProfile, hasPermission, user } = useAuth();

  const canViewStaff = hasPermission('staff.view');
  const canUpdateStaff = hasPermission('staff.update');
  const canManagePermissions = hasPermission('staff.permissions');
  const isSuperAdminUser = currentUserRole === 'admin';

  // Data State
  const [staffList, setStaffList] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'pending'>('all');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Selected Staff for Detail Modal
  const [selectedStaff, setSelectedStaff] = useState<UserProfile | null>(null);

  // Edit / Role Change Modal
  const [editingStaff, setEditingStaff] = useState<UserProfile | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('stylist');
  const [editStatus, setEditStatus] = useState<'active' | 'suspended' | 'pending'>('active');
  const [editDepartment, setEditDepartment] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Subscribe to Users collection
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    // In preview or unauthenticated mode, do not attach snapshot listener
    if (!user) {
      if (currentProfile) {
        setStaffList([currentProfile]);
      } else {
        setStaffList([]);
      }
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const usersColRef = collection(db, COLLECTIONS.USERS);

    const unsubscribe = onSnapshot(
      usersColRef,
      (snapshot) => {
        const loaded: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const role = (data.role || 'customer') as UserRole;
          // Filter ONLY internal authorized staff roles
          if (ADMIN_AUTHORIZED_ROLES.includes(role)) {
            loaded.push({
              uid: docSnap.id,
              email: data.email || '',
              displayName: data.displayName || data.name || '',
              phoneNumber: data.phoneNumber || data.phone || undefined,
              role,
              createdAt: data.createdAt || data.created_at || null,
              updatedAt: data.updatedAt || data.updated_at || null,
              status: (data.status as 'active' | 'suspended' | 'pending') || 'active',
              notes: data.notes || undefined,
              avatarUrl: data.avatarUrl || undefined,
              lastSignInTime: data.lastSignInTime || data.last_sign_in || undefined,
              department: data.department || undefined,
              specialization: Array.isArray(data.specialization) ? data.specialization : undefined,
            });
          }
        });
        setStaffList(loaded);
        setLoading(false);
      },
      (err) => {
        console.warn('Notice listening to staff members in users collection:', err.message);
        setError('Unable to load staff directory from database.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, currentProfile]);

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    return staffList.filter((member) => {
      // Role filter
      if (roleFilter !== 'all' && member.role !== roleFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        const memberStatus = member.status || 'active';
        if (memberStatus !== statusFilter) return false;
      }

      // Search query (name, email, phone, UID)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = member.displayName?.toLowerCase().includes(q);
        const emailMatch = member.email?.toLowerCase().includes(q);
        const phoneMatch = member.phoneNumber?.toLowerCase().includes(q);
        const uidMatch = member.uid?.toLowerCase().includes(q);
        if (!nameMatch && !emailMatch && !phoneMatch && !uidMatch) {
          return false;
        }
      }

      return true;
    });
  }, [staffList, roleFilter, statusFilter, searchQuery]);

  // Paginated staff
  const totalPages = Math.max(1, Math.ceil(filteredStaff.length / pageSize));
  const paginatedStaff = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredStaff.slice(startIndex, startIndex + pageSize);
  }, [filteredStaff, currentPage, pageSize]);

  // Format timestamp helper
  const formatTimestamp = (val: unknown): string => {
    if (!val) return 'Never recorded';
    try {
      if (typeof val === 'object' && val !== null && 'seconds' in val) {
        return new Date((val as { seconds: number }).seconds * 1000).toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
      }
      const d = new Date(val as string | number);
      if (isNaN(d.getTime())) return 'Never recorded';
      return d.toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return 'Never recorded';
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (member: UserProfile) => {
    setEditingStaff(member);
    setEditRole(member.role);
    setEditStatus(member.status || 'active');
    setEditDepartment(member.department || '');
    setActionFeedback(null);
  };

  // Save Role / Profile Status changes with RBAC & Anti-Self-Promotion enforcement
  const handleSaveStaffChanges = async () => {
    if (!editingStaff || !db) return;

    // Security check 1: Anti-Self-Promotion / Self-Modification safeguard
    if (editingStaff.uid === currentProfile?.uid) {
      if (editRole !== editingStaff.role) {
        setActionFeedback({
          type: 'error',
          message: 'Security Violation: Users cannot promote or alter their own privileged role.',
        });
        return;
      }
    }

    // Security check 2: Only Admins can assign or change 'admin' roles
    if (editRole === 'admin' && !isSuperAdminUser) {
      setActionFeedback({
        type: 'error',
        message: 'Unauthorized: Only an existing Super Admin can grant Admin privileges.',
      });
      return;
    }

    // Security check 3: Non-admins cannot edit admin accounts
    if (editingStaff.role === 'admin' && !isSuperAdminUser) {
      setActionFeedback({
        type: 'error',
        message: 'Permission Denied: Only Super Admins can modify Admin accounts.',
      });
      return;
    }

    setActionLoading(true);
    setActionFeedback(null);

    try {
      const staffDocRef = doc(db, COLLECTIONS.USERS, editingStaff.uid);
      await updateDoc(staffDocRef, {
        role: editRole,
        status: editStatus,
        department: editDepartment.trim() || null,
        updatedAt: serverTimestamp(),
        updatedBy: currentProfile?.uid || 'admin',
      });

      setActionFeedback({
        type: 'success',
        message: `Staff member ${editingStaff.displayName || editingStaff.email} updated successfully.`,
      });

      setTimeout(() => {
        setEditingStaff(null);
        setActionFeedback(null);
      }, 1400);
    } catch (err: any) {
      console.error('Failed to update staff member:', err);
      setActionFeedback({
        type: 'error',
        message: err.message || 'Failed to update staff record. Check Firestore permissions.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const getRoleBadgeVariant = (roleName: UserRole) => {
    switch (roleName) {
      case 'admin':
        return 'danger';
      case 'manager':
        return 'warning';
      case 'receptionist':
        return 'blue';
      case 'stylist':
        return 'success';
      case 'cashier':
        return 'neutral';
      default:
        return 'neutral';
    }
  };

  const getStatusBadgeVariant = (statusName?: string) => {
    switch (statusName) {
      case 'active':
        return 'success';
      case 'suspended':
        return 'danger';
      case 'pending':
        return 'warning';
      default:
        return 'success';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Musha Empire Admin
            </span>
            <span className="text-xs text-stone-300">•</span>
            <span className="text-xs font-medium text-stone-500">Security & Personnel</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Internal Staff Management
          </h1>
          <p className="text-sm font-medium text-stone-500 mt-1">
            Manage authenticated team credentials, role authorization tiers, and operational profiles.
          </p>
        </div>

        {/* Quick Role Breakdown Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral" className="text-xs font-semibold px-2.5 py-1">
            Total Staff: {staffList.length}
          </Badge>
          <Badge variant="danger" className="text-xs font-semibold px-2.5 py-1">
            Admins: {staffList.filter((s) => s.role === 'admin').length}
          </Badge>
          <Badge variant="warning" className="text-xs font-semibold px-2.5 py-1">
            Managers: {staffList.filter((s) => s.role === 'manager').length}
          </Badge>
          <Badge variant="success" className="text-xs font-semibold px-2.5 py-1">
            Stylists: {staffList.filter((s) => s.role === 'stylist').length}
          </Badge>
        </div>
      </div>

      {/* Security Banner / Context */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 flex items-start gap-3">
        <Lock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <strong className="font-semibold text-amber-950">Credential Protection Guarantee:</strong>{' '}
          All staff accounts are backed by Firebase Authentication. Passwords, auth tokens, and session keys are never stored in client profiles or visible in the portal. Role modifications immediately enforce the system-wide RBAC matrix.
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search staff by name, email, phone, or UID..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-4 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 font-medium"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Role Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-stone-400 shrink-0" />
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setCurrentPage(1);
                }}
                aria-label="Filter by staff role"
                className="px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-800 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
              >
                <option value="all">All Roles ({staffList.length})</option>
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="receptionist">Receptionist</option>
                <option value="stylist">Stylist</option>
                <option value="cashier">Cashier</option>
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                aria-label="Filter by account status"
                className="px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-800 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="suspended">Suspended Only</option>
                <option value="pending">Pending Onboarding</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Staff Table and Mobile Cards */}
      <Card>
        <CardHeader className="py-4 px-5 border-b border-stone-100 flex flex-row items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-stone-900">
              Staff Directory ({filteredStaff.length})
            </h2>
            <p className="text-xs font-medium text-stone-500">
              Showing active operational staff and designated roles.
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-stone-500">
              <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium">Loading staff records...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-stone-900">{error}</p>
              <p className="text-xs text-stone-500 mt-1">Please verify Firestore configuration and security rules.</p>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="p-12">
              <EmptyState
                icon={<ShieldCheck className="w-8 h-8 text-stone-400" />}
                title="No staff members found"
                description={
                  searchQuery || roleFilter !== 'all' || statusFilter !== 'all'
                    ? 'No staff members match the current filter criteria.'
                    : 'No internal staff profiles currently exist in the database.'
                }
              />
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm text-stone-700">
                  <thead className="bg-stone-50/80 text-xs font-semibold uppercase text-stone-500 border-b border-stone-200">
                    <tr>
                      <th className="px-5 py-3.5">Staff Member</th>
                      <th className="px-5 py-3.5">Assigned Role</th>
                      <th className="px-5 py-3.5">Contact Details</th>
                      <th className="px-5 py-3.5">Account Status</th>
                      <th className="px-5 py-3.5">Last Sign In</th>
                      <th className="px-5 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {paginatedStaff.map((member) => (
                      <tr key={member.uid} className="hover:bg-stone-50/60 transition-colors">
                        {/* Member & UID */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-xs shrink-0">
                              {member.displayName
                                ? member.displayName
                                    .split(' ')
                                    .map((n) => n[0])
                                    .join('')
                                    .slice(0, 2)
                                    .toUpperCase()
                                : member.email.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                                {member.displayName || 'Staff Member'}
                                {member.uid === currentProfile?.uid && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                                    You
                                  </span>
                                )}
                              </div>
                              <div className="text-xs font-mono text-stone-400 mt-0.5">
                                UID: {member.uid.slice(0, 10)}...
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Assigned Role */}
                        <td className="px-5 py-4">
                          <div className="flex flex-col items-start gap-1">
                            <Badge
                              variant={getRoleBadgeVariant(member.role)}
                              className="text-xs uppercase font-semibold tracking-wide"
                            >
                              {member.role}
                            </Badge>
                            {member.department && (
                              <span className="text-[11px] text-stone-500 font-medium">
                                {member.department}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Contact Details */}
                        <td className="px-5 py-4">
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-1.5 text-stone-700 font-medium">
                              <Mail className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                              <span>{member.email || '—'}</span>
                            </div>
                            {member.phoneNumber && (
                              <div className="flex items-center gap-1.5 text-stone-500">
                                <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                                <span>{member.phoneNumber}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-5 py-4">
                          <Badge
                            variant={getStatusBadgeVariant(member.status)}
                            className="capitalize text-xs font-medium"
                          >
                            {member.status || 'active'}
                          </Badge>
                        </td>

                        {/* Last Sign In */}
                        <td className="px-5 py-4 text-xs text-stone-500">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                            <span>{formatTimestamp(member.lastSignInTime)}</span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setSelectedStaff(member)}
                              className="text-xs font-semibold py-1 px-2.5 h-auto"
                            >
                              Details
                            </Button>

                            {canUpdateStaff && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleOpenEdit(member)}
                                className="text-xs font-semibold py-1 px-2.5 h-auto"
                              >
                                Edit Role
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-stone-100">
                {paginatedStaff.map((member) => (
                  <div key={member.uid} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-xs">
                          {member.displayName
                            ? member.displayName
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)
                                .toUpperCase()
                            : member.email.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold text-stone-900 text-sm flex items-center gap-1.5">
                            {member.displayName || 'Staff Member'}
                            {member.uid === currentProfile?.uid && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                                You
                              </span>
                            )}
                          </h3>
                          <p className="text-xs text-stone-400 font-mono">UID: {member.uid.slice(0, 10)}...</p>
                        </div>
                      </div>
                      <Badge variant={getRoleBadgeVariant(member.role)} className="text-xs uppercase font-semibold">
                        {member.role}
                      </Badge>
                    </div>

                    <div className="bg-stone-50 rounded-lg p-2.5 text-xs space-y-1.5">
                      <div className="flex items-center gap-2 text-stone-700">
                        <Mail className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                        <span className="truncate">{member.email || '—'}</span>
                      </div>
                      {member.phoneNumber && (
                        <div className="flex items-center gap-2 text-stone-500">
                          <Phone className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          <span>{member.phoneNumber}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1 border-t border-stone-200/60 text-[11px] text-stone-500">
                        <span>Status: <strong className="capitalize">{member.status || 'active'}</strong></span>
                        <span>Last Sign-In: {formatTimestamp(member.lastSignInTime)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedStaff(member)}
                        className="text-xs font-semibold py-1 px-3 h-auto"
                      >
                        Details
                      </Button>
                      {canUpdateStaff && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleOpenEdit(member)}
                          className="text-xs font-semibold py-1 px-3 h-auto"
                        >
                          Edit Role
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="p-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500 font-medium">
                  <div>
                    Page {currentPage} of {totalPages} ({filteredStaff.length} members)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 text-xs"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1 text-xs"
                    >
                      Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Staff Detail View Modal */}
      {selectedStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-sm">
                  {selectedStaff.displayName
                    ? selectedStaff.displayName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()
                    : selectedStaff.email.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">
                    {selectedStaff.displayName || 'Staff Profile'}
                  </h3>
                  <p className="text-xs text-stone-500">Personnel Record & Privileges</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStaff(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 bg-stone-50 rounded-lg p-3">
                <div>
                  <span className="text-xs font-semibold text-stone-400 uppercase">Assigned Role</span>
                  <div className="mt-1">
                    <Badge variant={getRoleBadgeVariant(selectedStaff.role)} className="capitalize font-semibold text-xs">
                      {selectedStaff.role}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-xs font-semibold text-stone-400 uppercase">Account Status</span>
                  <div className="mt-1">
                    <Badge variant={getStatusBadgeVariant(selectedStaff.status)} className="capitalize font-semibold text-xs">
                      {selectedStaff.status || 'active'}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-stone-500 uppercase">Contact & Authentication</h4>
                <div className="bg-white border border-stone-200 rounded-lg p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500">Email Address:</span>
                    <span className="font-semibold text-stone-900">{selectedStaff.email || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500">Phone Number:</span>
                    <span className="font-medium text-stone-800">{selectedStaff.phoneNumber || 'Not provided'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500">User UID:</span>
                    <span className="font-mono text-stone-600 text-[11px]">{selectedStaff.uid}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-500">Last Sign-In:</span>
                    <span className="font-medium text-stone-800">{formatTimestamp(selectedStaff.lastSignInTime)}</span>
                  </div>
                </div>
              </div>

              {/* Granted Permissions under Role */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-stone-500 uppercase flex items-center justify-between">
                  <span>Authoritative Permissions</span>
                  <span className="text-[11px] text-amber-700 font-bold">
                    {ROLE_PERMISSIONS_MATRIX[selectedStaff.role]?.length || 0} Grants
                  </span>
                </h4>
                <div className="bg-stone-50 rounded-lg p-3 max-h-40 overflow-y-auto border border-stone-200/80">
                  <div className="flex flex-wrap gap-1.5">
                    {ROLE_PERMISSIONS_MATRIX[selectedStaff.role]?.map((perm) => (
                      <span
                        key={perm}
                        className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-white text-stone-700 border border-stone-200 shadow-2xs"
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-stone-100 bg-stone-50 flex items-center justify-between">
              <span className="text-xs text-stone-400">Read-only authoritative view</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedStaff(null)}
                className="text-xs font-semibold"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Role Modal */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Edit Role & Privileges
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Update operational assignment for {editingStaff.displayName || editingStaff.email}
                </p>
              </div>
              <button
                onClick={() => setEditingStaff(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Feedback Alert */}
              {actionFeedback && (
                <div
                  className={`p-3 rounded-lg text-xs font-medium flex items-start gap-2 ${
                    actionFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {actionFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{actionFeedback.message}</span>
                </div>
              )}

              {/* Self-Promotion Warning if editing oneself */}
              {editingStaff.uid === currentProfile?.uid && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-start gap-2">
                  <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    You are editing your own profile. In accordance with security protocol, you cannot modify your own role tier.
                  </span>
                </div>
              )}

              {/* Role Selector */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase mb-1.5">
                  Assigned Staff Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  disabled={editingStaff.uid === currentProfile?.uid}
                  aria-label="Select staff role assignment"
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="stylist">Stylist (Service scheduling & customer view)</option>
                  <option value="receptionist">Receptionist (Bookings, clients & catalog)</option>
                  <option value="cashier">Cashier (Billing & payment updates)</option>
                  <option value="manager">Manager (Operations, team & service CMS)</option>
                  {isSuperAdminUser && (
                    <option value="admin">Admin (Full administrative authority)</option>
                  )}
                </select>
                <p className="text-[11px] text-stone-500 mt-1">
                  Enforces strict RBAC permissions across all modules immediately upon saving.
                </p>
              </div>

              {/* Account Status */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase mb-1.5">
                  Account Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  aria-label="Select account status"
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                >
                  <option value="active">Active (Full operational access)</option>
                  <option value="suspended">Suspended (Access blocked)</option>
                  <option value="pending">Pending (Awaiting onboarding review)</option>
                </select>
              </div>

              {/* Department */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase mb-1.5">
                  Department / Specialty (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Master Colorist, Front Desk, Salon Operations"
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                />
              </div>
            </div>

            <div className="p-4 border-t border-stone-100 bg-stone-50 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditingStaff(null)}
                disabled={actionLoading}
                className="text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveStaffChanges}
                disabled={actionLoading}
                className="text-xs font-semibold"
              >
                {actionLoading ? 'Saving...' : 'Save Role Changes'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
