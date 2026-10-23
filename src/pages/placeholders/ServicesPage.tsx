import React, { useEffect, useState, useMemo } from 'react';
import {
  Sparkles,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  Eye,
  AlertTriangle,
  Clock,
  DollarSign,
  Layers,
  Users2,
  RefreshCw,
  X,
  ChevronDown,
  AlertCircle,
  Check,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  getDocs,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { COLLECTIONS } from '../../firebase/collections';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { PermissionGate } from '../../components/auth/PermissionGate';
import {
  normalizeService,
  type NormalizedService,
  VALID_DURATIONS,
  VALID_GENDERS,
} from '../../firebase/types';

export const ServicesPage: React.FC = () => {
  const { hasPermission, role } = useAuth();

  // Permissions for current user
  const canCreate = hasPermission('services.create');
  const canUpdate = hasPermission('services.update');
  const canDelete = hasPermission('services.delete');

  // Service Data State
  const [services, setServices] = useState<NormalizedService[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedGender, setSelectedGender] = useState<string>('all');

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingService, setEditingService] = useState<NormalizedService | null>(null);
  const [detailsService, setDetailsService] = useState<NormalizedService | null>(null);

  // Confirmation Modal State (Deactivate / Delete)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'deactivate' | 'delete';
    service: NormalizedService | null;
    isCheckingBookings?: boolean;
    hasHistoricalBookings?: boolean;
    bookingCount?: number;
  }>({
    isOpen: false,
    type: 'deactivate',
    service: null,
  });

  // Form Field State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    customCategory: '',
    gender: 'Women',
    durationMinutes: 60,
    price: '',
    isActive: true,
    imageUrl: '',
    featured: false,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // 1. Subscribe to Firestore `services` collection
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const servicesColRef = collection(db, COLLECTIONS.SERVICES);
    const unsubscribe = onSnapshot(
      servicesColRef,
      (snapshot) => {
        const loaded: NormalizedService[] = [];
        snapshot.forEach((docSnap) => {
          loaded.push(normalizeService(docSnap.id, docSnap.data()));
        });
        // Sort alphabetically by category, then by name
        loaded.sort((a, b) => {
          if (a.category !== b.category) {
            return a.category.localeCompare(b.category);
          }
          return a.name.localeCompare(b.name);
        });
        setServices(loaded);
        setLoading(false);
      },
      (err) => {
        console.warn('Notice listening to services collection:', err.message);
        setError('Unable to load services from database.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Compute unique categories present in loaded records
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => {
      if (s.category && s.category.trim()) {
        set.add(s.category.trim());
      }
    });
    return Array.from(set).sort();
  }, [services]);

  // Client-side filtering strategy (instant response without excessive reads)
  const filteredServices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return services.filter((s) => {
      // Search matching
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q);

      // Category matching
      const matchesCategory =
        selectedCategory === 'all' || s.category === selectedCategory;

      // Status matching
      const matchesStatus =
        selectedStatus === 'all' ||
        (selectedStatus === 'active' && s.isActive) ||
        (selectedStatus === 'inactive' && !s.isActive);

      // Gender matching
      const matchesGender =
        selectedGender === 'all' ||
        s.gender.toLowerCase() === selectedGender.toLowerCase() ||
        s.gender === 'All';

      return matchesSearch && matchesCategory && matchesStatus && matchesGender;
    });
  }, [services, searchQuery, selectedCategory, selectedStatus, selectedGender]);

  // Open Form for Adding
  const handleOpenAdd = () => {
    setEditingService(null);
    setFormData({
      name: '',
      description: '',
      category: availableCategories[0] || 'Hair Styling',
      customCategory: '',
      gender: 'Women',
      durationMinutes: 60,
      price: '',
      isActive: true,
      imageUrl: '',
      featured: false,
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  // Open Form for Editing
  const handleOpenEdit = (service: NormalizedService) => {
    setEditingService(service);
    const isCustom = !availableCategories.includes(service.category);
    setFormData({
      name: service.name,
      description: service.description,
      category: isCustom ? '__custom__' : service.category,
      customCategory: isCustom ? service.category : '',
      gender: service.gender,
      durationMinutes: service.durationMinutes,
      price: service.price.toString(),
      isActive: service.isActive,
      imageUrl: service.imageUrl || '',
      featured: service.featured,
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  // Validate form fields before saving
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Service name is required.';
    }

    const effectiveCategory =
      formData.category === '__custom__' ? formData.customCategory.trim() : formData.category;
    if (!effectiveCategory) {
      errors.category = 'Category is required.';
    }

    const priceNum = Number(formData.price);
    if (formData.price === '' || isNaN(priceNum) || priceNum < 0) {
      errors.price = 'Price must be a valid non-negative number.';
    }

    if (!VALID_DURATIONS.includes(formData.durationMinutes as (typeof VALID_DURATIONS)[number])) {
      errors.duration = 'Duration must be 30, 60, 90, or 120 minutes.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Handler for Add / Edit
  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || !db) return;

    setIsSubmitting(true);
    setError(null);

    const effectiveCategory =
      formData.category === '__custom__'
        ? formData.customCategory.trim()
        : formData.category;

    const payload = {
      name: formData.name.trim(),
      description: formData.description.trim(),
      category: effectiveCategory,
      gender: formData.gender,
      duration_minutes: Number(formData.durationMinutes),
      durationMinutes: Number(formData.durationMinutes),
      price: Number(formData.price),
      active: Boolean(formData.isActive),
      isActive: Boolean(formData.isActive),
      status: formData.isActive ? 'active' : 'inactive',
      image_url: formData.imageUrl.trim() || null,
      imageUrl: formData.imageUrl.trim() || null,
      featured: Boolean(formData.featured),
      updated_at: new Date().toISOString(),
    };

    try {
      if (editingService) {
        // Edit existing service: preserve original created_at and raw fields
        const serviceDocRef = doc(db, COLLECTIONS.SERVICES, editingService.id);
        await updateDoc(serviceDocRef, {
          ...editingService.raw,
          ...payload,
          created_at: editingService.raw.created_at || editingService.createdAt || new Date().toISOString(),
        });
        showSuccess(`Service "${payload.name}" updated successfully.`);
      } else {
        // Create new service
        const newPayload = {
          ...payload,
          created_at: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        const servicesColRef = collection(db, COLLECTIONS.SERVICES);
        await addDoc(servicesColRef, newPayload);
        showSuccess(`New service "${payload.name}" created successfully.`);
      }

      setIsFormOpen(false);
      setEditingService(null);
    } catch (err: unknown) {
      console.error('Error saving service:', err);
      setError('Failed to save service. Please check your network and permissions.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle active state directly
  const handleToggleActive = async (service: NormalizedService) => {
    if (!canUpdate || !db) return;
    try {
      const nextActiveState = !service.isActive;
      const serviceDocRef = doc(db, COLLECTIONS.SERVICES, service.id);
      await updateDoc(serviceDocRef, {
        active: nextActiveState,
        isActive: nextActiveState,
        status: nextActiveState ? 'active' : 'inactive',
        updated_at: new Date().toISOString(),
      });
      showSuccess(
        `Service "${service.name}" ${nextActiveState ? 'activated' : 'deactivated'}.`
      );
    } catch (err: unknown) {
      console.error('Error updating service status:', err);
      setError('Failed to update service availability state.');
    }
  };

  // Open confirmation modal for Deactivate or Delete
  const handleOpenConfirm = async (type: 'deactivate' | 'delete', service: NormalizedService) => {
    if (!db) return;

    if (type === 'delete') {
      // Check if service is referenced by historical bookings
      setConfirmModal({
        isOpen: true,
        type: 'delete',
        service,
        isCheckingBookings: true,
        hasHistoricalBookings: false,
      });

      try {
        const bookingsColRef = collection(db, COLLECTIONS.BOOKINGS);
        // Check for reference by service_id or serviceId
        const q1 = query(bookingsColRef, where('service_id', '==', service.id), limit(10));
        const snap1 = await getDocs(q1);

        let count = snap1.size;
        if (count === 0) {
          const q2 = query(bookingsColRef, where('serviceId', '==', service.id), limit(10));
          const snap2 = await getDocs(q2);
          count = snap2.size;
        }

        setConfirmModal((prev) => ({
          ...prev,
          isCheckingBookings: false,
          hasHistoricalBookings: count > 0,
          bookingCount: count,
        }));
      } catch (err) {
        console.warn('Booking reference check notice:', err);
        setConfirmModal((prev) => ({
          ...prev,
          isCheckingBookings: false,
          hasHistoricalBookings: false,
        }));
      }
    } else {
      setConfirmModal({
        isOpen: true,
        type: 'deactivate',
        service,
      });
    }
  };

  // Execute Confirmed Action
  const handleExecuteConfirm = async () => {
    const { service, type, hasHistoricalBookings } = confirmModal;
    if (!service || !db) return;

    try {
      if (type === 'delete') {
        // If bookings reference this service, do NOT hard-delete!
        if (hasHistoricalBookings) {
          // Deactivate instead to preserve historical integrity
          const serviceDocRef = doc(db, COLLECTIONS.SERVICES, service.id);
          await updateDoc(serviceDocRef, {
            active: false,
            isActive: false,
            status: 'inactive',
            updated_at: new Date().toISOString(),
          });
          showSuccess(
            `Service "${service.name}" was deactivated instead of deleted to protect historical booking records.`
          );
        } else {
          // Safe to delete because no historical bookings reference it
          const serviceDocRef = doc(db, COLLECTIONS.SERVICES, service.id);
          await deleteDoc(serviceDocRef);
          showSuccess(`Service "${service.name}" was removed.`);
        }
      } else {
        // Deactivate action
        const serviceDocRef = doc(db, COLLECTIONS.SERVICES, service.id);
        await updateDoc(serviceDocRef, {
          active: false,
          isActive: false,
          status: 'inactive',
          updated_at: new Date().toISOString(),
        });
        showSuccess(`Service "${service.name}" deactivated.`);
      }
    } catch (err: unknown) {
      console.error('Error executing action:', err);
      setError('Action failed. Please verify administrative permissions.');
    } finally {
      setConfirmModal({ isOpen: false, type: 'deactivate', service: null });
    }
  };

  const showSuccess = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => {
      setActionSuccess(null);
    }, 4500);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans">
      {/* 1. HEADER SECTION */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold text-[#B7791F] uppercase tracking-wider block">
              MUSHA EMPIRE ADMIN
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#171513] tracking-tight mt-0.5">
              Services CMS
            </h1>
            <p className="text-xs sm:text-sm text-[#6B7280] font-normal mt-1 max-w-2xl">
              Manage treatments, pricing, duration, availability, and customer-facing service information.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2.5 shrink-0">
            {/* Add Service Button - PermissionGate guarded */}
            <PermissionGate permission="services.create">
              <Button
                variant="gold"
                size="md"
                onClick={handleOpenAdd}
                leftIcon={<Plus className="w-4 h-4" />}
                className="w-full sm:w-auto shadow-xs"
              >
                + Add Service
              </Button>
            </PermissionGate>
          </div>
        </div>

        {/* Success Toast / Notification */}
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

        {/* Error Notification */}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Search Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9CA3AF]">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search treatments or categories..."
                className="w-full pl-9 pr-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] placeholder-[#9CA3AF] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all font-normal min-h-[40px]"
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

            {/* Category Filter */}
            <div className="relative">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all appearance-none cursor-pointer min-h-[40px]"
              >
                <option value="all">All Categories ({services.length})</option>
                {availableCategories.map((cat) => {
                  const count = services.filter((s) => s.category === cat).length;
                  return (
                    <option key={cat} value={cat}>
                      {cat} ({count})
                    </option>
                  );
                })}
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B7280]">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as 'all' | 'active' | 'inactive')}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all appearance-none cursor-pointer min-h-[40px]"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B7280]">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            {/* Gender Filter */}
            <div className="relative">
              <select
                value={selectedGender}
                onChange={(e) => setSelectedGender(e.target.value)}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all appearance-none cursor-pointer min-h-[40px]"
              >
                <option value="all">All Genders</option>
                <option value="women">Women</option>
                <option value="men">Men</option>
                <option value="other">Other / Unisex</option>
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B7280]">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Active Filter Chips bar */}
          {(searchQuery || selectedCategory !== 'all' || selectedStatus !== 'all' || selectedGender !== 'all') && (
            <div className="mt-3 pt-3 border-t border-[#F3F4F6] flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[#6B7280] font-normal">Active Filters:</span>
                {searchQuery && (
                  <Badge variant="blue">Query: &quot;{searchQuery}&quot;</Badge>
                )}
                {selectedCategory !== 'all' && (
                  <Badge variant="gold">Category: {selectedCategory}</Badge>
                )}
                {selectedStatus !== 'all' && (
                  <Badge variant={selectedStatus === 'active' ? 'success' : 'neutral'}>
                    Status: {selectedStatus}
                  </Badge>
                )}
                {selectedGender !== 'all' && (
                  <Badge variant="neutral">Gender: {selectedGender}</Badge>
                )}
              </div>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                  setSelectedStatus('all');
                  setSelectedGender('all');
                }}
                className="text-[#DC2626] hover:underline font-semibold cursor-pointer text-[11px]"
              >
                Clear All Filters
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. MAIN SERVICES CONTENT: TABLE ON DESKTOP, CARDS ON MOBILE */}
      <Card>
        <CardHeader
          title={`Salon Services Catalog (${filteredServices.length})`}
          subtitle="Authoritative catalog synchronized in real-time with customer booking engine"
          action={
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[#6B7280] hidden sm:inline">
                Role: <strong className="font-semibold capitalize text-[#B7791F]">{role}</strong>
              </span>
            </div>
          }
        />
        <CardContent className="p-0">
          {loading ? (
            /* Loading Skeleton Rows */
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-[#F3F4F6] animate-pulse">
                  <div className="space-y-2">
                    <div className="h-4 bg-[#E5E7EB] rounded w-48"></div>
                    <div className="h-3 bg-[#E5E7EB] rounded w-32"></div>
                  </div>
                  <div className="h-6 bg-[#E5E7EB] rounded w-16"></div>
                  <div className="h-6 bg-[#E5E7EB] rounded w-20"></div>
                </div>
              ))}
            </div>
          ) : filteredServices.length === 0 ? (
            /* Empty State */
            <div className="p-6">
              {services.length === 0 ? (
                <EmptyState
                  title="No services yet"
                  description="Add treatments to the authoritative catalog so clients can discover and book them."
                  icon={<Sparkles className="w-6 h-6 text-[#B7791F]" />}
                  action={
                    canCreate ? (
                      <Button variant="gold" size="sm" onClick={handleOpenAdd} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                        Add your first service
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <EmptyState
                  title="No matching services found"
                  description="Try adjusting your search terms or filter selections."
                  icon={<Search className="w-6 h-6 text-[#6B7280]" />}
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedCategory('all');
                        setSelectedStatus('all');
                        setSelectedGender('all');
                      }}
                    >
                      Reset Filters
                    </Button>
                  }
                />
              )}
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE VIEW (hidden on mobile, visible on lg screens) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] bg-[#FAFBFD] text-[#6B7280] font-semibold">
                      <th className="py-3.5 pl-6 pr-4">Service</th>
                      <th className="py-3.5 px-4">Category</th>
                      <th className="py-3.5 px-3">Gender</th>
                      <th className="py-3.5 px-3">Duration</th>
                      <th className="py-3.5 px-4">Price</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 pl-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F4F6]">
                    {filteredServices.map((service) => (
                      <tr key={service.id} className="hover:bg-[#F9FAFB] transition-colors">
                        {/* Service Name & Snippet */}
                        <td className="py-4 pl-6 pr-4">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-[#FEF9EE] border border-[#FCEEC8] text-[#B7791F] flex items-center justify-center shrink-0 font-bold">
                              <Sparkles className="w-4 h-4 text-[#B7791F]" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[#171513] text-sm truncate">
                                  {service.name}
                                </span>
                                {service.featured && (
                                  <Badge variant="gold" className="text-[10px] px-1.5 py-0">
                                    Featured
                                  </Badge>
                                )}
                              </div>
                              {service.description && (
                                <p className="text-[11px] text-[#6B7280] line-clamp-1 mt-0.5 max-w-xs">
                                  {service.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="py-4 px-4 font-semibold text-[#171513]">
                          <span className="px-2 py-0.5 rounded-md bg-[#F7F8FA] border border-[#E5E7EB] text-[11px]">
                            {service.category}
                          </span>
                        </td>

                        {/* Gender */}
                        <td className="py-4 px-3 text-[#4B5563] font-medium">
                          {service.gender}
                        </td>

                        {/* Duration */}
                        <td className="py-4 px-3 text-[#171513] font-medium">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-[#6B7280]" />
                            {service.durationMinutes} min
                          </span>
                        </td>

                        {/* Price */}
                        <td className="py-4 px-4 font-bold text-[#171513] text-sm">
                          ${service.price.toFixed(2)}
                        </td>

                        {/* Status Badge */}
                        <td className="py-4 px-4">
                          <Badge variant={service.isActive ? 'success' : 'neutral'}>
                            {service.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>

                        {/* Actions */}
                        <td className="py-4 pl-4 pr-6 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Details Button */}
                            <button
                              onClick={() => setDetailsService(service)}
                              title="View Details"
                              className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Edit Button - PermissionGate guarded */}
                            {canUpdate && (
                              <button
                                onClick={() => handleOpenEdit(service)}
                                title="Edit Service"
                                className="p-1.5 rounded-lg text-[#B7791F] hover:bg-[#FEF9EE] transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}

                            {/* Toggle Active Button - PermissionGate guarded */}
                            {canUpdate && (
                              <button
                                onClick={() => handleToggleActive(service)}
                                title={service.isActive ? 'Deactivate Service' : 'Activate Service'}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  service.isActive
                                    ? 'text-[#DC2626] hover:bg-[#FEF2F2]'
                                    : 'text-[#16A34A] hover:bg-[#F0FDF4]'
                                }`}
                              >
                                {service.isActive ? (
                                  <XCircle className="w-4 h-4" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4" />
                                )}
                              </button>
                            )}

                            {/* Delete/Archive Button - PermissionGate guarded */}
                            {canDelete && (
                              <button
                                onClick={() => handleOpenConfirm('delete', service)}
                                title="Delete or Archive Service"
                                className="p-1.5 rounded-lg text-[#DC2626] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE RESPONSIVE CARDS VIEW (visible on < lg screens) */}
              <div className="lg:hidden p-4 space-y-3">
                {filteredServices.map((service) => (
                  <div
                    key={service.id}
                    className="p-4 rounded-xl border border-[#E5E7EB] bg-white hover:border-[#D6A84F] transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-[#171513]">
                            {service.name}
                          </h3>
                          {service.featured && (
                            <Badge variant="gold" className="text-[10px] px-1 py-0">
                              Featured
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-[#6B7280] mt-0.5 line-clamp-2">
                          {service.description || 'No description provided.'}
                        </p>
                      </div>

                      <Badge variant={service.isActive ? 'success' : 'neutral'} className="shrink-0">
                        {service.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    {/* Meta info tags */}
                    <div className="flex items-center gap-2 flex-wrap text-xs pt-1 border-t border-[#F3F4F6]">
                      <span className="px-2 py-0.5 rounded bg-[#F7F8FA] border border-[#E5E7EB] text-[#4B5563] font-medium">
                        {service.category}
                      </span>
                      <span className="flex items-center gap-1 text-[#4B5563]">
                        <Clock className="w-3.5 h-3.5 text-[#6B7280]" />
                        {service.durationMinutes} min
                      </span>
                      <span className="text-[#4B5563]">
                        Gender: {service.gender}
                      </span>
                      <span className="font-bold text-[#171513] ml-auto text-sm">
                        ${service.price.toFixed(2)}
                      </span>
                    </div>

                    {/* Mobile Action Buttons */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F3F4F6]">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetailsService(service)}
                        leftIcon={<Eye className="w-3.5 h-3.5" />}
                        className="text-xs min-h-[36px]"
                      >
                        Details
                      </Button>

                      {canUpdate && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(service)}
                          leftIcon={<Edit2 className="w-3.5 h-3.5 text-[#B7791F]" />}
                          className="text-xs min-h-[36px]"
                        >
                          Edit
                        </Button>
                      )}

                      {canUpdate && (
                        <Button
                          variant={service.isActive ? 'outline' : 'gold'}
                          size="sm"
                          onClick={() => handleToggleActive(service)}
                          className="text-xs min-h-[36px]"
                        >
                          {service.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 4. ADD / EDIT SERVICE MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col my-auto">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#E5E7EB] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#171513]">
                  {editingService ? 'Edit Treatment Service' : 'Add New Service'}
                </h3>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  Authoritative parameters used by customer app and slot booking engine.
                </p>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveService} className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Service Name */}
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Service Name <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Royal Keratin Hair Spa"
                  required
                  className={`w-full px-3 py-2 bg-[#F9FAFB] border rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all ${
                    formErrors.name ? 'border-[#DC2626]' : 'border-[#E5E7EB]'
                  }`}
                />
                {formErrors.name && (
                  <p className="text-[11px] text-[#DC2626] mt-1">{formErrors.name}</p>
                )}
              </div>

              {/* Category Selection */}
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Category <span className="text-[#DC2626]">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all cursor-pointer"
                >
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="__custom__">+ Enter New Category</option>
                </select>

                {formData.category === '__custom__' && (
                  <input
                    type="text"
                    value={formData.customCategory}
                    onChange={(e) => setFormData({ ...formData, customCategory: e.target.value })}
                    placeholder="Enter new category name..."
                    className="w-full mt-2 px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white"
                  />
                )}
                {formErrors.category && (
                  <p className="text-[11px] text-[#DC2626] mt-1">{formErrors.category}</p>
                )}
              </div>

              {/* Price & Duration Row */}
              <div className="grid grid-cols-2 gap-3">
                {/* Price */}
                <div>
                  <label className="block text-xs font-semibold text-[#171513] mb-1">
                    Price ($) <span className="text-[#DC2626]">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6B7280]">
                      <DollarSign className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="0.00"
                      required
                      className={`w-full pl-8 pr-3 py-2 bg-[#F9FAFB] border rounded-xl text-xs font-bold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all ${
                        formErrors.price ? 'border-[#DC2626]' : 'border-[#E5E7EB]'
                      }`}
                    />
                  </div>
                  {formErrors.price && (
                    <p className="text-[11px] text-[#DC2626] mt-1">{formErrors.price}</p>
                  )}
                </div>

                {/* Duration */}
                <div>
                  <label className="block text-xs font-semibold text-[#171513] mb-1">
                    Duration (Minutes) <span className="text-[#DC2626]">*</span>
                  </label>
                  <select
                    value={formData.durationMinutes}
                    onChange={(e) => setFormData({ ...formData, durationMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all cursor-pointer"
                  >
                    {VALID_DURATIONS.map((dur) => (
                      <option key={dur} value={dur}>
                        {dur} Minutes
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Gender Applicability */}
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Target Audience / Gender <span className="text-[#DC2626]">*</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {VALID_GENDERS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setFormData({ ...formData, gender: g })}
                      className={`py-2 px-2 text-xs font-semibold rounded-lg border text-center transition-all cursor-pointer ${
                        formData.gender === g
                          ? 'bg-[#FEF9EE] text-[#B7791F] border-[#B7791F]'
                          : 'bg-[#F9FAFB] text-[#4B5563] border-[#E5E7EB] hover:bg-white'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  placeholder="Detailed description of treatment, benefits, and steps included..."
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all resize-none"
                />
              </div>

              {/* Image / Media Reference */}
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Media Image Reference (Optional)
                </label>
                <input
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  placeholder="https://res.cloudinary.com/... or media URL"
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white"
                />
                <p className="text-[10px] text-[#6B7280] mt-1">
                  Optional image asset linked to the customer booking lookbook.
                </p>
              </div>

              {/* Toggles (Active & Featured) */}
              <div className="pt-2 border-t border-[#F3F4F6] flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#171513]">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 rounded text-[#B7791F] focus:ring-[#B7791F]"
                  />
                  <span>Active for Online Bookings</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#171513]">
                  <input
                    type="checkbox"
                    checked={formData.featured}
                    onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                    className="w-4 h-4 rounded text-[#B7791F] focus:ring-[#B7791F]"
                  />
                  <span>Featured Service</span>
                </label>
              </div>

              {/* Form Buttons */}
              <div className="pt-4 border-t border-[#E5E7EB] flex items-center justify-end gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => setIsFormOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="gold"
                  size="md"
                  isLoading={isSubmitting}
                  className="shadow-xs"
                >
                  {editingService ? 'Save Changes' : 'Create Service'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. SERVICE DETAILS DRAWER / MODAL */}
      {detailsService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-[#B7791F] uppercase tracking-wider">
                  Service Details
                </span>
                <h3 className="text-lg font-bold text-[#171513]">
                  {detailsService.name}
                </h3>
              </div>
              <button
                onClick={() => setDetailsService(null)}
                className="p-1 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-[#FAFBFD] rounded-xl border border-[#E5E7EB] space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Category:</span>
                <span className="font-semibold text-[#171513]">{detailsService.category}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Target Audience:</span>
                <span className="font-semibold text-[#171513]">{detailsService.gender}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Duration:</span>
                <span className="font-semibold text-[#171513]">{detailsService.durationMinutes} Minutes</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Price:</span>
                <span className="font-bold text-[#171513] text-sm">${detailsService.price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Booking Status:</span>
                <Badge variant={detailsService.isActive ? 'success' : 'neutral'}>
                  {detailsService.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#6B7280]">Homepage Featured:</span>
                <span className="font-semibold text-[#171513]">{detailsService.featured ? 'Yes' : 'No'}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-[#171513] mb-1">Description:</h4>
              <p className="text-xs text-[#4B5563] leading-relaxed bg-[#F9FAFB] p-3 rounded-lg border border-[#E5E7EB]">
                {detailsService.description || 'No description provided.'}
              </p>
            </div>

            {detailsService.imageUrl && (
              <div>
                <h4 className="text-xs font-semibold text-[#171513] mb-1">Media Reference:</h4>
                <a
                  href={detailsService.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#2563EB] underline truncate block"
                >
                  {detailsService.imageUrl}
                </a>
              </div>
            )}

            <div className="pt-2 flex gap-2">
              {canUpdate && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => {
                    const s = detailsService;
                    setDetailsService(null);
                    handleOpenEdit(s);
                  }}
                  leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                  className="flex-1"
                >
                  Edit Service
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDetailsService(null)}
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 6. CONFIRMATION MODAL (DEACTIVATE OR DELETE) */}
      {confirmModal.isOpen && confirmModal.service && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xl max-w-md w-full p-6 text-center space-y-4">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
                confirmModal.type === 'delete' ? 'bg-[#FEF2F2] text-[#DC2626]' : 'bg-[#FEF9EE] text-[#B7791F]'
              }`}
            >
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#171513]">
                {confirmModal.type === 'delete' ? 'Delete Service?' : 'Deactivate Service?'}
              </h3>
              <p className="text-xs text-[#6B7280] mt-1 font-semibold">
                &quot;{confirmModal.service.name}&quot;
              </p>
            </div>

            {/* Content explanation */}
            {confirmModal.type === 'delete' ? (
              confirmModal.isCheckingBookings ? (
                <div className="p-3 rounded-xl bg-[#F9FAFB] text-xs text-[#6B7280] animate-pulse">
                  Checking for historical booking references...
                </div>
              ) : confirmModal.hasHistoricalBookings ? (
                <div className="p-3.5 rounded-xl bg-[#FFFBEB] border border-[#FEF3C7] text-xs text-[#92400E] text-left leading-relaxed space-y-1">
                  <p className="font-bold text-[#B45309]">Historical Reference Protection Active</p>
                  <p>
                    This service is referenced by <strong>{confirmModal.bookingCount}</strong> existing customer booking(s).
                  </p>
                  <p className="text-[11px] text-[#78350F]">
                    To preserve historical appointment logs and client receipts, this service will be <strong>deactivated</strong> instead of deleted.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[#4B5563] leading-relaxed">
                  No historical bookings reference this service. It will be permanently removed from the catalog.
                </p>
              )
            ) : (
              <p className="text-xs text-[#4B5563] leading-relaxed">
                Deactivating this service prevents new bookings from being scheduled on the website, while safely preserving historical appointments.
              </p>
            )}

            <div className="flex gap-2.5 pt-2">
              <Button
                variant="outline"
                size="md"
                onClick={() => setConfirmModal({ isOpen: false, type: 'deactivate', service: null })}
                className="flex-1 justify-center"
              >
                Cancel
              </Button>
              <Button
                variant={confirmModal.type === 'delete' ? 'danger' : 'gold'}
                size="md"
                onClick={handleExecuteConfirm}
                className="flex-1 justify-center"
                disabled={confirmModal.isCheckingBookings}
              >
                {confirmModal.type === 'delete'
                  ? confirmModal.hasHistoricalBookings
                    ? 'Deactivate Safely'
                    : 'Confirm Delete'
                  : 'Deactivate'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
