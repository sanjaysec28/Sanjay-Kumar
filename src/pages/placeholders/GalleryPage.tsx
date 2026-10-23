import React, { useEffect, useState, useMemo } from 'react';
import {
  Images,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  Eye,
  AlertTriangle,
  X,
  ChevronDown,
  AlertCircle,
  ExternalLink,
  Sparkles,
  ArrowUpDown,
  Image as ImageIcon,
  Layers,
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
  normalizeGalleryItem,
  type NormalizedGalleryItem,
} from '../../firebase/types';

export const GalleryPage: React.FC = () => {
  const { hasPermission, role } = useAuth();

  const canCreate = hasPermission('gallery.create');
  const canUpdate = hasPermission('gallery.update');
  const canDelete = hasPermission('gallery.delete');

  // Gallery Data State
  const [galleryItems, setGalleryItems] = useState<NormalizedGalleryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPublished, setSelectedPublished] = useState<'all' | 'published' | 'draft'>('all');
  const [selectedFeatured, setSelectedFeatured] = useState<'all' | 'featured'>('all');

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<NormalizedGalleryItem | null>(null);
  const [detailsItem, setDetailsItem] = useState<NormalizedGalleryItem | null>(null);

  // Confirmation Modal
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    item: NormalizedGalleryItem | null;
  }>({
    isOpen: false,
    item: null,
  });

  // Form Field State
  const [formData, setFormData] = useState({
    title: '',
    caption: '',
    category: '',
    customCategory: '',
    imageUrl: '',
    altText: '',
    isPublished: true,
    featured: false,
    order: 0,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // 1. Subscribe to Firestore `gallery` collection
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const galleryColRef = collection(db, COLLECTIONS.GALLERY);
    const unsubscribe = onSnapshot(
      galleryColRef,
      (snapshot) => {
        const loaded: NormalizedGalleryItem[] = [];
        snapshot.forEach((docSnap) => {
          loaded.push(normalizeGalleryItem(docSnap.id, docSnap.data()));
        });
        // Sort: Ascending sort order (0, 1, 2...), then newest updated
        loaded.sort((a, b) => a.order - b.order);
        setGalleryItems(loaded);
        setLoading(false);
      },
      (err) => {
        console.warn('Notice listening to gallery collection:', err.message);
        setError('Unable to load gallery from database.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Compute unique categories present in loaded data
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    galleryItems.forEach((g) => {
      if (g.category && g.category.trim()) {
        set.add(g.category.trim());
      }
    });
    return Array.from(set).sort();
  }, [galleryItems]);

  // Client-side filtering
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return galleryItems.filter((item) => {
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.caption.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);

      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;

      const matchesPublished =
        selectedPublished === 'all' ||
        (selectedPublished === 'published' && item.isPublished) ||
        (selectedPublished === 'draft' && !item.isPublished);

      const matchesFeatured =
        selectedFeatured === 'all' ||
        (selectedFeatured === 'featured' && item.featured);

      return matchesSearch && matchesCategory && matchesPublished && matchesFeatured;
    });
  }, [galleryItems, searchQuery, selectedCategory, selectedPublished, selectedFeatured]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setEditingItem(null);
    setFormData({
      title: '',
      caption: '',
      category: availableCategories[0] || 'Hair Styling',
      customCategory: '',
      imageUrl: '',
      altText: '',
      isPublished: true,
      featured: false,
      order: galleryItems.length,
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (item: NormalizedGalleryItem) => {
    setEditingItem(item);
    const isCustom = !availableCategories.includes(item.category);
    setFormData({
      title: item.title,
      caption: item.caption,
      category: isCustom ? '__custom__' : item.category,
      customCategory: isCustom ? item.category : '',
      imageUrl: item.imageUrl,
      altText: item.altText || '',
      isPublished: item.isPublished,
      featured: item.featured,
      order: item.order,
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  // Validate form
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.title.trim()) {
      errors.title = 'Title is required.';
    }

    const effectiveCategory =
      formData.category === '__custom__'
        ? formData.customCategory.trim()
        : formData.category;
    if (!effectiveCategory) {
      errors.category = 'Category is required.';
    }

    if (!formData.imageUrl.trim()) {
      errors.imageUrl = 'Image URL is required for portfolio showcase.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Handler
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || !db) return;

    setIsSubmitting(true);
    setError(null);

    const effectiveCategory =
      formData.category === '__custom__'
        ? formData.customCategory.trim()
        : formData.category;

    const payload = {
      title: formData.title.trim(),
      caption: formData.caption.trim(),
      category: effectiveCategory,
      image_url: formData.imageUrl.trim(),
      imageUrl: formData.imageUrl.trim(),
      alt_text: formData.altText.trim() || formData.title.trim(),
      active: Boolean(formData.isPublished),
      published: Boolean(formData.isPublished),
      isPublished: Boolean(formData.isPublished),
      featured: Boolean(formData.featured),
      sort_order: Number(formData.order) || 0,
      order: Number(formData.order) || 0,
      updated_at: new Date().toISOString(),
    };

    try {
      if (editingItem) {
        // Edit existing: preserve created_at and raw properties
        const itemDocRef = doc(db, COLLECTIONS.GALLERY, editingItem.id);
        await updateDoc(itemDocRef, {
          ...editingItem.raw,
          ...payload,
          created_at: editingItem.raw.created_at || editingItem.createdAt || new Date().toISOString(),
        });
        showSuccess(`Gallery item "${payload.title}" updated.`);
      } else {
        // Create new item
        const newPayload = {
          ...payload,
          created_at: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        const galleryColRef = collection(db, COLLECTIONS.GALLERY);
        await addDoc(galleryColRef, newPayload);
        showSuccess(`Gallery item "${payload.title}" created.`);
      }

      setIsFormOpen(false);
      setEditingItem(null);
    } catch (err: unknown) {
      console.error('Error saving gallery item:', err);
      setError('Unable to save gallery item. Please verify network and permissions.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle publish state
  const handleTogglePublished = async (item: NormalizedGalleryItem) => {
    if (!canUpdate || !db) return;
    try {
      const nextPublished = !item.isPublished;
      const itemDocRef = doc(db, COLLECTIONS.GALLERY, item.id);
      await updateDoc(itemDocRef, {
        active: nextPublished,
        published: nextPublished,
        isPublished: nextPublished,
        updated_at: new Date().toISOString(),
      });
      showSuccess(`"${item.title}" ${nextPublished ? 'published' : 'unpublished'}.`);
    } catch (err: unknown) {
      console.error('Error toggling gallery item published state:', err);
      setError('Failed to update published state.');
    }
  };

  // Toggle featured state
  const handleToggleFeatured = async (item: NormalizedGalleryItem) => {
    if (!canUpdate || !db) return;
    try {
      const nextFeatured = !item.featured;
      const itemDocRef = doc(db, COLLECTIONS.GALLERY, item.id);
      await updateDoc(itemDocRef, {
        featured: nextFeatured,
        updated_at: new Date().toISOString(),
      });
      showSuccess(`"${item.title}" ${nextFeatured ? 'marked as featured' : 'unmarked from featured'}.`);
    } catch (err: unknown) {
      console.error('Error toggling featured state:', err);
      setError('Failed to update featured state.');
    }
  };

  // Execute Confirmed Delete
  const handleExecuteDelete = async () => {
    const { item } = confirmModal;
    if (!item || !db) return;

    try {
      const itemDocRef = doc(db, COLLECTIONS.GALLERY, item.id);
      await deleteDoc(itemDocRef);
      showSuccess(`Gallery item "${item.title}" was removed.`);
    } catch (err: unknown) {
      console.error('Error deleting gallery item:', err);
      setError('Unable to delete gallery item.');
    } finally {
      setConfirmModal({ isOpen: false, item: null });
    }
  };

  const showSuccess = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 4500);
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
              Gallery & Lookbook
            </h1>
            <p className="text-xs sm:text-sm text-[#6B7280] font-normal mt-1 max-w-2xl">
              Curate the visual portfolio displayed across the customer experience.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2.5 shrink-0">
            <PermissionGate permission="gallery.create">
              <Button
                variant="gold"
                size="md"
                onClick={handleOpenAdd}
                leftIcon={<Plus className="w-4 h-4" />}
                className="w-full sm:w-auto shadow-xs"
              >
                + Add Gallery Item
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
                placeholder="Search gallery titles, captions..."
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
                <option value="all">All Categories ({galleryItems.length})</option>
                {availableCategories.map((cat) => {
                  const count = galleryItems.filter((i) => i.category === cat).length;
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

            {/* Published Status Filter */}
            <div className="relative">
              <select
                value={selectedPublished}
                onChange={(e) => setSelectedPublished(e.target.value as 'all' | 'published' | 'draft')}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all appearance-none cursor-pointer min-h-[40px]"
              >
                <option value="all">All Statuses</option>
                <option value="published">Published Only</option>
                <option value="draft">Drafts Only</option>
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B7280]">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            {/* Featured Filter */}
            <div className="relative">
              <select
                value={selectedFeatured}
                onChange={(e) => setSelectedFeatured(e.target.value as 'all' | 'featured')}
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all appearance-none cursor-pointer min-h-[40px]"
              >
                <option value="all">All Items</option>
                <option value="featured">Featured Lookbook Only</option>
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-[#6B7280]">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. GALLERY MEDIA GRID */}
      <Card>
        <CardHeader
          title={`Media Portfolio (${filteredItems.length})`}
          subtitle="Real-time lookbook visual assets shown to customer application clients"
          action={
            <span className="text-[11px] text-[#6B7280]">
              Role: <strong className="font-semibold capitalize text-[#B7791F]">{role}</strong>
            </span>
          }
        />
        <CardContent className="p-5">
          {loading ? (
            /* Skeleton Loading Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="rounded-xl border border-[#E5E7EB] p-3 space-y-3 animate-pulse">
                  <div className="w-full aspect-4/3 bg-[#E5E7EB] rounded-lg"></div>
                  <div className="h-4 bg-[#E5E7EB] rounded w-3/4"></div>
                  <div className="h-3 bg-[#E5E7EB] rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            galleryItems.length === 0 ? (
              <EmptyState
                title="No gallery items yet"
                description="Upload and organize your salon lookbook photos, hairstyle transformations, and salon ambiance."
                icon={<Images className="w-6 h-6 text-[#B7791F]" />}
                action={
                  canCreate ? (
                    <Button variant="gold" size="sm" onClick={handleOpenAdd} leftIcon={<Plus className="w-3.5 h-3.5" />}>
                      Add your first gallery item
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState
                title="No matching gallery items"
                description="Try selecting different categories or clearing your search term."
                icon={<Search className="w-6 h-6 text-[#6B7280]" />}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('all');
                      setSelectedPublished('all');
                      setSelectedFeatured('all');
                    }}
                  >
                    Reset Filters
                  </Button>
                }
              />
            )
          ) : (
            /* Visual Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden shadow-xs hover:border-[#D6A84F] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.05)] transition-all flex flex-col justify-between"
                >
                  {/* Top Image Preview */}
                  <div>
                    <div className="relative aspect-4/3 w-full bg-[#F3F4F6] overflow-hidden group">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.altText || item.title}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                          onError={(e) => {
                            // Safe fallback if image fails loading
                            (e.target as HTMLImageElement).src =
                              'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=600&q=80';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#9CA3AF]">
                          <ImageIcon className="w-8 h-8" />
                        </div>
                      )}

                      {/* Top Badges overlay */}
                      <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
                        <Badge variant={item.isPublished ? 'success' : 'neutral'} className="text-[10px] px-1.5 py-0 shadow-xs">
                          {item.isPublished ? 'Published' : 'Draft'}
                        </Badge>
                        {item.featured && (
                          <Badge variant="gold" className="text-[10px] px-1.5 py-0 shadow-xs">
                            Featured
                          </Badge>
                        )}
                      </div>

                      {/* Sort Order badge */}
                      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-white font-mono text-[10px]">
                        #{item.order}
                      </div>
                    </div>

                    {/* Card Content */}
                    <div className="p-3.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-[#171513] text-sm truncate" title={item.title}>
                          {item.title}
                        </h3>
                        <span className="px-1.5 py-0.5 rounded bg-[#F7F8FA] border border-[#E5E7EB] text-[10px] text-[#4B5563] font-medium shrink-0">
                          {item.category}
                        </span>
                      </div>

                      {item.caption && (
                        <p className="text-xs text-[#6B7280] line-clamp-2 leading-relaxed">
                          {item.caption}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Card Actions Footer */}
                  <div className="p-3 pt-0 border-t border-[#F3F4F6] mt-2 flex items-center justify-between text-xs">
                    <button
                      onClick={() => setDetailsItem(item)}
                      className="text-[#6B7280] hover:text-[#171513] font-semibold flex items-center gap-1 text-[11px] cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Details</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {/* Featured toggle */}
                      {canUpdate && (
                        <button
                          onClick={() => handleToggleFeatured(item)}
                          title={item.featured ? 'Unmark featured' : 'Mark featured'}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            item.featured ? 'text-[#B7791F] bg-[#FEF9EE]' : 'text-[#9CA3AF] hover:text-[#171513]'
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Edit button */}
                      {canUpdate && (
                        <button
                          onClick={() => handleOpenEdit(item)}
                          title="Edit gallery item"
                          className="p-1.5 rounded-lg text-[#B7791F] hover:bg-[#FEF9EE] transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Publish / Unpublish button */}
                      {canUpdate && (
                        <button
                          onClick={() => handleTogglePublished(item)}
                          title={item.isPublished ? 'Unpublish' : 'Publish to customer app'}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            item.isPublished
                              ? 'text-[#DC2626] hover:bg-[#FEF2F2]'
                              : 'text-[#16A34A] hover:bg-[#F0FDF4]'
                          }`}
                        >
                          {item.isPublished ? (
                            <XCircle className="w-3.5 h-3.5" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}

                      {/* Delete button */}
                      {canDelete && (
                        <button
                          onClick={() => setConfirmModal({ isOpen: true, item })}
                          title="Delete gallery item"
                          className="p-1.5 rounded-lg text-[#DC2626] hover:bg-[#FEF2F2] transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. ADD / EDIT GALLERY ITEM MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col my-auto">
            <div className="p-5 border-b border-[#E5E7EB] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#171513]">
                  {editingItem ? 'Edit Gallery Lookbook Item' : 'Add Gallery Item'}
                </h3>
                <p className="text-xs text-[#6B7280] mt-0.5">
                  Visual portfolio asset displayed on customer website lookbook.
                </p>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Title / Lookbook Name <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Bridal Glamour Transformation"
                  required
                  className={`w-full px-3 py-2 bg-[#F9FAFB] border rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all ${
                    formErrors.title ? 'border-[#DC2626]' : 'border-[#E5E7EB]'
                  }`}
                />
                {formErrors.title && (
                  <p className="text-[11px] text-[#DC2626] mt-1">{formErrors.title}</p>
                )}
              </div>

              {/* Image URL with Cloudinary notice */}
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Media Image URL <span className="text-[#DC2626]">*</span>
                </label>
                <input
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  placeholder="https://images.unsplash.com/... or Cloudinary URL"
                  required
                  className={`w-full px-3 py-2 bg-[#F9FAFB] border rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white transition-all ${
                    formErrors.imageUrl ? 'border-[#DC2626]' : 'border-[#E5E7EB]'
                  }`}
                />
                <div className="mt-1.5 p-2 rounded-lg bg-[#FAFBFD] border border-[#E5E7EB] text-[11px] text-[#6B7280]">
                  💡 <strong>Media Upload Status:</strong> Media upload will be directly available once the media provider is configured. Provide any active image asset URL.
                </div>
                {formErrors.imageUrl && (
                  <p className="text-[11px] text-[#DC2626] mt-1">{formErrors.imageUrl}</p>
                )}
              </div>

              {/* Category & Sort Order */}
              <div className="grid grid-cols-2 gap-3">
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
                      placeholder="Category name..."
                      className="w-full mt-2 px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513]"
                    />
                  )}
                  {formErrors.category && (
                    <p className="text-[11px] text-[#DC2626] mt-1">{formErrors.category}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#171513] mb-1">
                    Display Order
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.order}
                    onChange={(e) => setFormData({ ...formData, order: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white"
                  />
                </div>
              </div>

              {/* Caption */}
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Caption / Description
                </label>
                <textarea
                  value={formData.caption}
                  onChange={(e) => setFormData({ ...formData, caption: e.target.value })}
                  rows={2}
                  placeholder="Styling highlights, products used, or transformation details..."
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white resize-none"
                />
              </div>

              {/* Alt Text */}
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Alt Text (Accessibility & SEO)
                </label>
                <input
                  type="text"
                  value={formData.altText}
                  onChange={(e) => setFormData({ ...formData, altText: e.target.value })}
                  placeholder="Descriptive text for screen readers..."
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white"
                />
              </div>

              {/* Toggles */}
              <div className="pt-2 border-t border-[#F3F4F6] flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#171513]">
                  <input
                    type="checkbox"
                    checked={formData.isPublished}
                    onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                    className="w-4 h-4 rounded text-[#B7791F] focus:ring-[#B7791F]"
                  />
                  <span>Published to Customer App</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#171513]">
                  <input
                    type="checkbox"
                    checked={formData.featured}
                    onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                    className="w-4 h-4 rounded text-[#B7791F] focus:ring-[#B7791F]"
                  />
                  <span>Featured in Lookbook</span>
                </label>
              </div>

              {/* Action Buttons */}
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
                  {editingItem ? 'Save Changes' : 'Create Item'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. GALLERY DETAILS MODAL */}
      {detailsItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-[#B7791F] uppercase tracking-wider">
                  Portfolio Asset
                </span>
                <h3 className="text-lg font-bold text-[#171513]">
                  {detailsItem.title}
                </h3>
              </div>
              <button
                onClick={() => setDetailsItem(null)}
                className="p-1 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Image Preview */}
            <div className="aspect-4/3 w-full rounded-xl overflow-hidden bg-[#F3F4F6] border border-[#E5E7EB]">
              <img
                src={detailsItem.imageUrl}
                alt={detailsItem.altText || detailsItem.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="p-3 bg-[#FAFBFD] rounded-xl border border-[#E5E7EB] space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Category:</span>
                <span className="font-semibold text-[#171513]">{detailsItem.category}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Display Order:</span>
                <span className="font-mono font-bold text-[#171513]">#{detailsItem.order}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#F3F4F6]">
                <span className="text-[#6B7280]">Published:</span>
                <Badge variant={detailsItem.isPublished ? 'success' : 'neutral'}>
                  {detailsItem.isPublished ? 'Published' : 'Draft'}
                </Badge>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#6B7280]">Featured:</span>
                <span className="font-semibold text-[#171513]">{detailsItem.featured ? 'Yes' : 'No'}</span>
              </div>
            </div>

            {detailsItem.caption && (
              <div>
                <h4 className="text-xs font-semibold text-[#171513] mb-1">Caption:</h4>
                <p className="text-xs text-[#4B5563] leading-relaxed bg-[#F9FAFB] p-2.5 rounded-lg border border-[#E5E7EB]">
                  {detailsItem.caption}
                </p>
              </div>
            )}

            <div className="pt-2 flex gap-2">
              {canUpdate && (
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => {
                    const item = detailsItem;
                    setDetailsItem(null);
                    handleOpenEdit(item);
                  }}
                  leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                  className="flex-1"
                >
                  Edit Item
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDetailsItem(null)}
                className="flex-1"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 6. CONFIRMATION MODAL */}
      {confirmModal.isOpen && confirmModal.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#171513]/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xl max-w-md w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-[#171513]">
                Delete Gallery Item?
              </h3>
              <p className="text-xs text-[#6B7280] mt-1 font-semibold">
                &quot;{confirmModal.item.title}&quot;
              </p>
            </div>

            <p className="text-xs text-[#4B5563] leading-relaxed">
              This will permanently remove the media asset from the customer gallery portfolio and lookbook view.
            </p>

            <div className="flex gap-2.5 pt-2">
              <Button
                variant="outline"
                size="md"
                onClick={() => setConfirmModal({ isOpen: false, item: null })}
                className="flex-1 justify-center"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                onClick={handleExecuteDelete}
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
