import React, { useEffect, useState, useMemo } from 'react';
import {
  Tag,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  Eye,
  AlertTriangle,
  Clock,
  Calendar,
  X,
  ChevronDown,
  AlertCircle,
  Copy,
  Check,
  Percent,
  DollarSign,
  Sparkles,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  addDoc,
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
  normalizeOffer,
  type NormalizedOffer,
} from '../../firebase/types';

export const OffersPage: React.FC = () => {
  const { hasPermission, role } = useAuth();

  const canCreate = hasPermission('offers.create');
  const canUpdate = hasPermission('offers.update');
  const canDelete = hasPermission('offers.delete');

  // Offer Data State
  const [offers, setOffers] = useState<NormalizedOffer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedValidity, setSelectedValidity] = useState<'all' | 'active' | 'scheduled' | 'expired'>('all');

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingOffer, setEditingOffer] = useState<NormalizedOffer | null>(null);
  const [detailsOffer, setDetailsOffer] = useState<NormalizedOffer | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'deactivate' | 'delete';
    offer: NormalizedOffer | null;
  }>({
    isOpen: false,
    type: 'deactivate',
    offer: null,
  });

  // Form Field State
  const todayDateStr = new Date().toISOString().split('T')[0];
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    discount: '',
    discountType: 'percentage' as 'percentage' | 'fixed',
    promoCode: '',
    validFrom: todayDateStr,
    validUntil: '',
    isActive: true,
    featured: false,
    terms: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // 1. Subscribe to Firestore `offers` collection
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const offersColRef = collection(db, COLLECTIONS.OFFERS);
    const unsubscribe = onSnapshot(
      offersColRef,
      (snapshot) => {
        const loaded: NormalizedOffer[] = [];
        snapshot.forEach((docSnap) => {
          loaded.push(normalizeOffer(docSnap.id, docSnap.data()));
        });
        // Sort: Active first, then by validUntil ascending
        loaded.sort((a, b) => {
          if (a.isActive !== b.isActive) {
            return a.isActive ? -1 : 1;
          }
          return b.validUntil.localeCompare(a.validUntil);
        });
        setOffers(loaded);
        setLoading(false);
      },
      (err) => {
        console.warn('Notice listening to offers collection:', err.message);
        setError('Unable to load offers from database.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Client-side filtering strategy
  const filteredOffers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return offers.filter((o) => {
      // Search matching
      const matchesSearch =
        !q ||
        o.title.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q) ||
        (o.promoCode && o.promoCode.toLowerCase().includes(q));

      // Status matching
      const matchesStatus =
        selectedStatus === 'all' ||
        (selectedStatus === 'active' && o.isActive) ||
        (selectedStatus === 'inactive' && !o.isActive);

      // Validity matching
      const matchesValidity =
        selectedValidity === 'all' || o.validityState === selectedValidity;

      return matchesSearch && matchesStatus && matchesValidity;
    });
  }, [offers, searchQuery, selectedStatus, selectedValidity]);

  // Open Form for Adding
  const handleOpenAdd = () => {
    setEditingOffer(null);
    setFormData({
      title: '',
      description: '',
      discount: '',
      discountType: 'percentage',
      promoCode: '',
      validFrom: todayDateStr,
      validUntil: '',
      isActive: true,
      featured: false,
      terms: '',
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  // Open Form for Editing
  const handleOpenEdit = (offer: NormalizedOffer) => {
    setEditingOffer(offer);
    setFormData({
      title: offer.title,
      description: offer.description,
      discount: offer.discount.toString(),
      discountType: offer.discountType,
      promoCode: offer.promoCode || '',
      validFrom: offer.validFrom || todayDateStr,
      validUntil: offer.validUntil || '',
      isActive: offer.isActive,
      featured: offer.featured,
      terms: offer.terms || '',
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  // Validate form fields
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.title.trim()) {
      errors.title = 'Offer title is required.';
    }

    const discountNum = Number(formData.discount);
    if (formData.discount === '' || isNaN(discountNum) || discountNum <= 0) {
      errors.discount = 'Discount must be a valid positive number.';
    } else if (formData.discountType === 'percentage' && discountNum > 100) {
      errors.discount = 'Percentage discount cannot exceed 100%.';
    }

    if (!formData.validUntil) {
      errors.validUntil = 'End date (valid until) is required.';
    } else if (formData.validFrom && formData.validUntil < formData.validFrom) {
      errors.validUntil = 'End date cannot be earlier than start date.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Handler for Add / Edit
  const handleSaveOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || !db) return;

    setIsSubmitting(true);
    setError(null);

    const payload = {
      title: formData.title.trim(),
      description: formData.description.trim(),
      discount: Number(formData.discount),
      discount_type: formData.discountType,
      discountType: formData.discountType,
      promo_code: formData.promoCode.trim().toUpperCase() || null,
      promoCode: formData.promoCode.trim().toUpperCase() || null,
      code: formData.promoCode.trim().toUpperCase() || null,
      valid_from: formData.validFrom || null,
      validFrom: formData.validFrom || null,
      valid_until: formData.validUntil,
      validUntil: formData.validUntil,
      active: Boolean(formData.isActive),
      isActive: Boolean(formData.isActive),
      featured: Boolean(formData.featured),
      terms: formData.terms.trim() || null,
      updated_at: new Date().toISOString(),
    };

    try {
      if (editingOffer) {
        // Edit existing: preserve created_at and raw fields
        const offerDocRef = doc(db, COLLECTIONS.OFFERS, editingOffer.id);
        await updateDoc(offerDocRef, {
          ...editingOffer.raw,
          ...payload,
          created_at: editingOffer.raw.created_at || editingOffer.createdAt || new Date().toISOString(),
        });
        showSuccess(`Offer "${payload.title}" updated successfully.`);
      } else {
        // Add new
        const newPayload = {
          ...payload,
          created_at: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        const offersColRef = collection(db, COLLECTIONS.OFFERS);
        await addDoc(offersColRef, newPayload);
        showSuccess(`New offer "${payload.title}" created successfully.`);
      }

      setIsFormOpen(false);
      setEditingOffer(null);
    } catch (err: unknown) {
      console.error('Error saving offer:', err);
      setError('Unable to save offer. Please verify network and permissions.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle active state
  const handleToggleActive = async (offer: NormalizedOffer) => {
    if (!canUpdate || !db) return;
    try {
      const nextActive = !offer.isActive;
      const offerDocRef = doc(db, COLLECTIONS.OFFERS, offer.id);
      await updateDoc(offerDocRef, {
        active: nextActive,
        isActive: nextActive,
        updated_at: new Date().toISOString(),
      });
      showSuccess(`Offer "${offer.title}" ${nextActive ? 'activated' : 'deactivated'}.`);
    } catch (err: unknown) {
      console.error('Error updating offer active status:', err);
      setError('Failed to update offer status.');
    }
  };

  // Execute Confirmed Delete or Deactivate
  const handleExecuteConfirm = async () => {
    const { offer, type } = confirmModal;
    if (!offer || !db) return;

    try {
      if (type === 'delete') {
        const offerDocRef = doc(db, COLLECTIONS.OFFERS, offer.id);
        await deleteDoc(offerDocRef);
        showSuccess(`Offer "${offer.title}" was removed.`);
      } else {
        const offerDocRef = doc(db, COLLECTIONS.OFFERS, offer.id);
        await updateDoc(offerDocRef, {
          active: false,
          isActive: false,
          updated_at: new Date().toISOString(),
        });
        showSuccess(`Offer "${offer.title}" deactivated.`);
      }
    } catch (err: unknown) {
      console.error('Error in offer action:', err);
      setError('Action failed. Please verify administrative permissions.');
    } finally {
      setConfirmModal({ isOpen: false, type: 'deactivate', offer: null });
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const showSuccess = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 4500);
  };

  const getValidityBadge = (validity: NormalizedOffer['validityState']) => {
    switch (validity) {
      case 'active':
        return <Badge variant="success">Active Now</Badge>;
      case 'scheduled':
        return <Badge variant="blue">Scheduled</Badge>;
      case 'expired':
        return <Badge variant="danger">Expired</Badge>;
      default:
        return <Badge variant="neutral">Inactive</Badge>;
    }
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
              Offers & Promotions
            </h1>
            <p className="text-xs sm:text-sm text-[#6B7280] font-normal mt-1 max-w-2xl">
              Manage customer-facing offers and promotional campaigns.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2.5 shrink-0">
            <PermissionGate permission="offers.create">
              <Button
                variant="gold"
                size="md"
                onClick={handleOpenAdd}
                leftIcon={<Plus className="w-4 h-4" />}
                className="w-full sm:w-auto shadow-xs"
              >
                + Add Offer
              </Button>
            </PermissionGate>
          </div>
        </div>

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

      {/* 2. SEARCH & FILTER BAR */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Search Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#9CA3AF]">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search offer titles, promo codes..."
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

            {/* Status Filter */}
            <div className="relative">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as 'all' | 'active' | 'inactive')}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all appearance-none cursor-pointer min-h-[40px]"
              >
                <option value="all">All Statuses ({offers.length})</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B7280]">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            {/* Validity Filter */}
            <div className="relative">
              <select
                value={selectedValidity}
                onChange={(e) => setSelectedValidity(e.target.value as any)}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all appearance-none cursor-pointer min-h-[40px]"
              >
                <option value="all">All Validity Periods</option>
                <option value="active">Active Now</option>
                <option value="scheduled">Scheduled (Future)</option>
                <option value="expired">Expired</option>
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B7280]">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. OFFERS TABLE (DESKTOP) & CARDS (MOBILE) */}
      <Card>
        <CardHeader
          title={`Promotional Offers (${filteredOffers.length})`}
          subtitle="Customer-facing discounts and coupon campaigns in shared database"
          action={
            <span className="text-[11px] text-[#6B7280]">
              Role: <strong className="font-semibold capitalize text-[#B7791F]">{role}</strong>
            </span>
          }
        />
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-[#F3F4F6] animate-pulse">
                  <div className="space-y-2">
                    <div className="h-4 bg-[#E5E7EB] rounded w-48"></div>
                    <div className="h-3 bg-[#E5E7EB] rounded w-32"></div>
                  </div>
                  <div className="h-6 bg-[#E5E7EB] rounded w-20"></div>
                </div>
              ))}
            </div>
          ) : filteredOffers.length === 0 ? (
            <div className="p-6">
              {offers.length === 0 ? (
                <EmptyState
                  title="No offers yet"
                  description="Create your first promotional discount or coupon code for customer bookings."
                  icon={<Tag className="w-6 h-6 text-[#B7791F]" />}
                  action={
                    canCreate ? (
                      <Button variant="gold" size="sm" onClick={handleOpenAdd} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                        Add your first offer
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <EmptyState
                  title="No matching offers found"
                  description="Adjust your search terms or validity filters."
                  icon={<Search className="w-6 h-6 text-[#6B7280]" />}
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedStatus('all');
                        setSelectedValidity('all');
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
              {/* DESKTOP TABLE VIEW */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E5E7EB] bg-[#FAFBFD] text-[#6B7280] font-semibold">
                      <th className="py-3.5 pl-6 pr-4">Offer</th>
                      <th className="py-3.5 px-4">Discount</th>
                      <th className="py-3.5 px-4">Validity Period</th>
                      <th className="py-3.5 px-4">Promo Code</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 pl-4 pr-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F4F6]">
                    {filteredOffers.map((offer) => (
                      <tr key={offer.id} className="hover:bg-[#F9FAFB] transition-colors">
                        {/* Title & Description */}
                        <td className="py-4 pl-6 pr-4">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-[#FEF9EE] border border-[#FCEEC8] text-[#B7791F] flex items-center justify-center shrink-0">
                              <Tag className="w-4 h-4 text-[#B7791F]" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[#171513] text-sm">
                                  {offer.title}
                                </span>
                                {offer.featured && (
                                  <Badge variant="gold" className="text-[10px] px-1.5 py-0">
                                    Featured
                                  </Badge>
                                )}
                              </div>
                              {offer.description && (
                                <p className="text-[11px] text-[#6B7280] line-clamp-1 mt-0.5 max-w-sm">
                                  {offer.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Discount Amount */}
                        <td className="py-4 px-4 font-bold text-[#16A34A] text-sm">
                          {offer.discountType === 'percentage'
                            ? `${offer.discount}% OFF`
                            : `$${offer.discount} OFF`}
                        </td>

                        {/* Validity Dates */}
                        <td className="py-4 px-4">
                          <div className="space-y-1">
                            <div className="text-[11px] text-[#171513] font-medium flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-[#6B7280]" />
                              <span>Until: {offer.validUntil || 'No expiry'}</span>
                            </div>
                            {getValidityBadge(offer.validityState)}
                          </div>
                        </td>

                        {/* Promo Code */}
                        <td className="py-4 px-4">
                          {offer.promoCode ? (
                            <button
                              onClick={() => handleCopyCode(offer.promoCode!)}
                              title="Click to copy promo code"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#F7F8FA] border border-[#E5E7EB] font-mono font-bold text-xs text-[#171513] hover:border-[#B7791F] transition-colors cursor-pointer"
                            >
                              <span>{offer.promoCode}</span>
                              {copiedCode === offer.promoCode ? (
                                <Check className="w-3 h-3 text-[#16A34A]" />
                              ) : (
                                <Copy className="w-3 h-3 text-[#6B7280]" />
                              )}
                            </button>
                          ) : (
                            <span className="text-[#9CA3AF] italic text-[11px]">Auto-applied</span>
                          )}
                        </td>

                        {/* Active Badge */}
                        <td className="py-4 px-4">
                          <Badge variant={offer.isActive ? 'success' : 'neutral'}>
                            {offer.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>

                        {/* Actions */}
                        <td className="py-4 pl-4 pr-6 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setDetailsOffer(offer)}
                              title="View Details"
                              className="p-1.5 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {canUpdate && (
                              <button
                                onClick={() => handleOpenEdit(offer)}
                                title="Edit Offer"
                                className="p-1.5 rounded-lg text-[#B7791F] hover:bg-[#FEF9EE] transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}

                            {canUpdate && (
                              <button
                                onClick={() => handleToggleActive(offer)}
                                title={offer.isActive ? 'Deactivate Offer' : 'Activate Offer'}
                                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                  offer.isActive
                                    ? 'text-[#DC2626] hover:bg-[#FEF2F2]'
                                    : 'text-[#16A34A] hover:bg-[#F0FDF4]'
                                }`}
                              >
                                {offer.isActive ? (
                                  <XCircle className="w-4 h-4" />
                                ) : (
                                  <CheckCircle2 className="w-4 h-4" />
                                )}
                              </button>
                            )}

                            {canDelete && (
                              <button
                                onClick={() =>
                                  setConfirmModal({
                                    isOpen: true,
                                    type: 'delete',
                                    offer,
                                  })
                                }
                                title="Delete Offer"
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

              {/* MOBILE RESPONSIVE CARDS VIEW */}
              <div className="lg:hidden p-4 space-y-3">
                {filteredOffers.map((offer) => (
                  <div
                    key={offer.id}
                    className="p-4 rounded-xl border border-[#E5E7EB] bg-white hover:border-[#D6A84F] transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-[#171513]">
                            {offer.title}
                          </h3>
                          {offer.featured && (
                            <Badge variant="gold" className="text-[10px] px-1 py-0">
                              Featured
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-[#6B7280] mt-0.5 line-clamp-2">
                          {offer.description || 'No description provided.'}
                        </p>
                      </div>

                      <span className="font-bold text-sm text-[#16A34A] shrink-0">
                        {offer.discountType === 'percentage'
                          ? `${offer.discount}% OFF`
                          : `$${offer.discount} OFF`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-[#F3F4F6] text-xs">
                      <div className="flex items-center gap-2">
                        {getValidityBadge(offer.validityState)}
                        {offer.promoCode && (
                          <span className="px-2 py-0.5 rounded bg-[#F7F8FA] border border-[#E5E7EB] font-mono font-bold text-[11px]">
                            {offer.promoCode}
                          </span>
                        )}
                      </div>

                      <span className="text-[#6B7280] text-[11px]">
                        Until: {offer.validUntil || 'Ongoing'}
                      </span>
                    </div>

                    {/* Mobile Action Buttons */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F3F4F6]">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDetailsOffer(offer)}
                        leftIcon={<Eye className="w-3.5 h-3.5" />}
                        className="text-xs min-h-[36px]"
                      >
                        Details
                      </Button>

                      {canUpdate && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(offer)}
                          leftIcon={<Edit2 className="w-3.5 h-3.5 text-[#B7791F]" />}
                          className="text-xs min-h-[36px]"
                        >
                          Edit
                        </Button>
                      )}

                      {canUpdate && (
                        <Button
                          variant={offer.isActive ? 'outline' : 'gold'}
                          size="sm"
                          onClick={() => handleToggleActive(offer)}
                          className="text-xs min-h-[36px]"
                        >
                          {offer.isActive ? 'Deactivate' : 'Activate'}
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

      {/* 4. ADD / EDIT OFFER MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col my-auto">
            <div className="p-5 border-b border-[#E5E7EB] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#171513]">
                  {editingOffer ? 'Edit Promotional Offer' : 'Create New Offer'}
                </h3>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  Shared discount campaign applied to customer bookings.
                </p>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOffer} className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Offer Title <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Summer Glow Spa Special"
                  required
                  className={`w-full px-3 py-2 bg-[#F9FAFB] border rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all ${
                    formErrors.title ? 'border-[#DC2626]' : 'border-[#E5E7EB]'
                  }`}
                />
                {formErrors.title && (
                  <p className="text-[11px] text-[#DC2626] mt-1">{formErrors.title}</p>
                )}
              </div>

              {/* Discount Amount & Type */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#171513] mb-1">
                    Discount Type
                  </label>
                  <select
                    value={formData.discountType}
                    onChange={(e) =>
                      setFormData({ ...formData, discountType: e.target.value as 'percentage' | 'fixed' })
                    }
                    className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="percentage">Percentage (% OFF)</option>
                    <option value="fixed">Fixed Amount ($ OFF)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#171513] mb-1">
                    Discount Value <span className="text-[#DC2626]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step={formData.discountType === 'percentage' ? '1' : '0.01'}
                      min="1"
                      max={formData.discountType === 'percentage' ? '100' : undefined}
                      value={formData.discount}
                      onChange={(e) => setFormData({ ...formData, discount: e.target.value })}
                      placeholder={formData.discountType === 'percentage' ? '20' : '15.00'}
                      required
                      className={`w-full px-3 py-2 bg-[#F9FAFB] border rounded-xl text-xs font-bold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all ${
                        formErrors.discount ? 'border-[#DC2626]' : 'border-[#E5E7EB]'
                      }`}
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B7280] font-bold text-xs">
                      {formData.discountType === 'percentage' ? '%' : '$'}
                    </div>
                  </div>
                  {formErrors.discount && (
                    <p className="text-[11px] text-[#DC2626] mt-1">{formErrors.discount}</p>
                  )}
                </div>
              </div>

              {/* Promo Code */}
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Promo Code (Optional)
                </label>
                <input
                  type="text"
                  value={formData.promoCode}
                  onChange={(e) => setFormData({ ...formData, promoCode: e.target.value.toUpperCase() })}
                  placeholder="e.g. GLOW20"
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-mono font-bold text-[#171513] uppercase focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white"
                />
                <p className="text-[10px] text-[#6B7280] mt-1">
                  Leave blank if discount should be automatically applied on eligible services.
                </p>
              </div>

              {/* Validity Dates (Start & End) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#171513] mb-1">
                    Valid From
                  </label>
                  <input
                    type="date"
                    value={formData.validFrom}
                    onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
                    className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#171513] mb-1">
                    Valid Until <span className="text-[#DC2626]">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                    required
                    className={`w-full px-3 py-2 bg-[#F9FAFB] border rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white ${
                      formErrors.validUntil ? 'border-[#DC2626]' : 'border-[#E5E7EB]'
                    }`}
                  />
                  {formErrors.validUntil && (
                    <p className="text-[11px] text-[#DC2626] mt-1">{formErrors.validUntil}</p>
                  )}
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
                  rows={2}
                  placeholder="Offer details, eligible treatments, and customer message..."
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white resize-none"
                />
              </div>

              {/* Terms & Conditions */}
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Terms & Conditions
                </label>
                <input
                  type="text"
                  value={formData.terms}
                  onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
                  placeholder="e.g. Valid on bookings over $50. One per client."
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white"
                />
              </div>

              {/* Active & Featured Toggles */}
              <div className="pt-2 border-t border-[#F3F4F6] flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#171513]">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4 rounded text-[#B7791F] focus:ring-[#B7791F]"
                  />
                  <span>Active & Discoverable</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#171513]">
                  <input
                    type="checkbox"
                    checked={formData.featured}
                    onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                    className="w-4 h-4 rounded text-[#B7791F] focus:ring-[#B7791F]"
                  />
                  <span>Featured Hero Promo</span>
                </label>
              </div>

              {/* Actions */}
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
                  {editingOffer ? 'Save Changes' : 'Create Offer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. OFFER DETAILS MODAL */}
      {detailsOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-[#B7791F] uppercase tracking-wider">
                  Offer Details
                </span>
                <h3 className="text-lg font-bold text-[#171513]">
                  {detailsOffer.title}
                </h3>
              </div>
              <button
                onClick={() => setDetailsOffer(null)}
                className="p-1 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-[#FAFBFD] rounded-xl border border-[#E5E7EB] space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Discount:</span>
                <span className="font-bold text-[#16A34A] text-sm">
                  {detailsOffer.discountType === 'percentage'
                    ? `${detailsOffer.discount}% OFF`
                    : `$${detailsOffer.discount} OFF`}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Promo Code:</span>
                <span className="font-mono font-bold text-[#171513]">
                  {detailsOffer.promoCode || 'None (Automatic)'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Validity:</span>
                <span className="font-semibold text-[#171513]">
                  {detailsOffer.validFrom || 'Start'} → {detailsOffer.validUntil || 'Ongoing'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Status:</span>
                {getValidityBadge(detailsOffer.validityState)}
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#6B7280]">Featured:</span>
                <span className="font-semibold text-[#171513]">
                  {detailsOffer.featured ? 'Yes' : 'No'}
                </span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-[#171513] mb-1">Description:</h4>
              <p className="text-xs text-[#4B5563] leading-relaxed bg-[#F9FAFB] p-3 rounded-lg border border-[#E5E7EB]">
                {detailsOffer.description || 'No description provided.'}
              </p>
            </div>

            {detailsOffer.terms && (
              <div>
                <h4 className="text-xs font-semibold text-[#171513] mb-1">Terms:</h4>
                <p className="text-[11px] text-[#6B7280] italic">
                  {detailsOffer.terms}
                </p>
              </div>
            )}

            <div className="pt-2 flex gap-2">
              {canUpdate && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => {
                    const o = detailsOffer;
                    setDetailsOffer(null);
                    handleOpenEdit(o);
                  }}
                  leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                  className="flex-1"
                >
                  Edit Offer
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDetailsOffer(null)}
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 6. CONFIRMATION MODAL */}
      {confirmModal.isOpen && confirmModal.offer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xl max-w-md w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#171513]">
                Delete Promotional Offer?
              </h3>
              <p className="text-xs text-[#6B7280] mt-1 font-semibold">
                &quot;{confirmModal.offer.title}&quot;
              </p>
            </div>

            <p className="text-xs text-[#4B5563] leading-relaxed">
              This action will remove the offer from the customer application. Historical bookings that previously applied this promotion will remain preserved in database snapshots.
            </p>

            <div className="flex gap-2.5 pt-2">
              <Button
                variant="outline"
                size="md"
                onClick={() => setConfirmModal({ isOpen: false, type: 'deactivate', offer: null })}
                className="flex-1 justify-center"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={handleExecuteConfirm}
                className="flex-1 justify-center"
              >
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
