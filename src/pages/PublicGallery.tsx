import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Crown,
  Images,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Calendar,
  Share2,
  Check,
  ArrowRight,
  SlidersHorizontal,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from '../firebase/collections';
import {
  normalizeGalleryItem,
  type NormalizedGalleryItem,
} from '../firebase/types';
import { useRouter } from '../router/Router';
import { getOptimizedImageUrl } from '../services/cloudinary';

export const PublicGallery: React.FC = () => {
  const { navigate } = useRouter();

  // Gallery items state
  const [items, setItems] = useState<NormalizedGalleryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Lightbox modal state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // 1. Subscribe to Firestore `gallery` collection in real-time
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const galleryCol = collection(db, COLLECTIONS.GALLERY);
    const unsubscribe = onSnapshot(
      galleryCol,
      (snapshot) => {
        const loaded: NormalizedGalleryItem[] = [];
        snapshot.forEach((docSnap) => {
          const item = normalizeGalleryItem(docSnap.id, docSnap.data());
          // Only show published items on the customer-facing website
          if (item.isPublished) {
            loaded.push(item);
          }
        });

        // Sort by displayOrder ascending, then newest first
        loaded.sort((a, b) => {
          if (a.displayOrder !== b.displayOrder) {
            return a.displayOrder - b.displayOrder;
          }
          const aTime = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
          return bTime - aTime;
        });

        setItems(loaded);
        setLoading(false);
      },
      (err) => {
        console.warn('Error subscribing to public gallery:', err);
        setError('Unable to load gallery portfolio right now.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Compute unique categories present in published items
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.category && item.category.trim()) {
        set.add(item.category.trim());
      }
    });
    return Array.from(set).sort();
  }, [items]);

  // Filter items by category & search query
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.caption.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [items, selectedCategory, searchQuery]);

  // Lightbox Navigation Handlers
  const handleNext = useCallback(() => {
    if (lightboxIndex === null || filteredItems.length === 0) return;
    setLightboxIndex((lightboxIndex + 1) % filteredItems.length);
  }, [lightboxIndex, filteredItems.length]);

  const handlePrev = useCallback(() => {
    if (lightboxIndex === null || filteredItems.length === 0) return;
    setLightboxIndex(
      (lightboxIndex - 1 + filteredItems.length) % filteredItems.length
    );
  }, [lightboxIndex, filteredItems.length]);

  const handleCloseLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  // Keyboard navigation for Lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === 'Escape') handleCloseLightbox();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, handleNext, handlePrev, handleCloseLightbox]);

  const handleCopyShare = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const activeItem =
    lightboxIndex !== null && filteredItems[lightboxIndex]
      ? filteredItems[lightboxIndex]
      : null;

  return (
    <div className="min-h-screen bg-[#0C0B0A] text-[#F3F4F6] font-sans antialiased selection:bg-[#D6A84F]/30 selection:text-white">
      {/* 1. PUBLIC LUXURY HEADER / NAVBAR */}
      <header className="sticky top-0 z-40 bg-[#0C0B0A]/90 backdrop-blur-md border-b border-[#2D2A26]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Brand Identity */}
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center gap-3.5 group text-left cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1F1C18] to-[#12100E] border border-[#D6A84F]/30 flex items-center justify-center text-[#D6A84F] shadow-sm group-hover:border-[#D6A84F] transition-all">
              <Crown className="w-5 h-5 text-[#D6A84F]" />
            </div>
            <div>
              <span className="font-serif tracking-widest text-lg sm:text-xl font-bold text-white block leading-tight group-hover:text-[#D6A84F] transition-colors">
                MUSHA EMPIRE
              </span>
              <span className="text-[10px] uppercase tracking-widest text-[#D6A84F] font-medium block">
                Luxury Salon & Spa Lookbook
              </span>
            </div>
          </button>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-xs font-semibold uppercase tracking-wider text-[#A8A29E]">
            <button
              onClick={() => navigate('/admin/homepage')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Home
            </button>
            <button
              onClick={() => navigate('/admin/services')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Services
            </button>
            <span className="text-[#D6A84F] border-b-2 border-[#D6A84F] pb-1">
              Lookbook & Gallery
            </span>
            <button
              onClick={() => navigate('/admin/offers')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Offers
            </button>
          </nav>

          {/* Header Action CTAs */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin/bookings')}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-[#B7791F] via-[#D6A84F] to-[#B7791F] text-[#0C0B0A] text-xs font-bold uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Book Visit</span>
            </button>

            <button
              onClick={() => navigate('/admin')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#3E3A34] hover:border-[#D6A84F] text-[#A8A29E] hover:text-white text-xs font-medium transition-all cursor-pointer"
              title="Switch to Staff Admin Portal"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#D6A84F]" />
              <span className="hidden xs:inline">Staff Portal</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. HERO / SHOWCASE STATEMENT BANNER */}
      <section className="relative py-16 sm:py-24 overflow-hidden border-b border-[#1F1C18]">
        {/* Subtle Ambient Glows */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-gradient-to-b from-[#B7791F]/10 via-[#B7791F]/5 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#1A1815] border border-[#D6A84F]/30 text-[#D6A84F] text-xs font-semibold tracking-widest uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            <span>The Master Portfolio</span>
          </div>

          <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-normal tracking-tight text-white leading-tight">
            Artistry in Every Detail, <br className="hidden sm:inline" />
            <span className="italic text-[#D6A84F] font-serif">Luxury in Every Touch.</span>
          </h1>

          <p className="text-sm sm:text-base text-[#A8A29E] max-w-2xl mx-auto font-normal leading-relaxed pt-2">
            Explore our curated showcase of master hair transformations, bespoke bridal glamour, and restorative sanctuary experiences crafted by Musha Empire artisans.
          </p>

          <div className="pt-2 flex items-center justify-center gap-4 text-xs text-[#78716C]">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse"></span>
              Live Real-Time Showcase
            </span>
            <span>•</span>
            <span>High-Fidelity Cloudinary Media</span>
            <span>•</span>
            <span>{items.length} Curated Masterworks</span>
          </div>
        </div>
      </section>

      {/* 3. CONTROLS: CATEGORIES & SEARCH */}
      <section className="sticky top-20 z-30 bg-[#0C0B0A]/95 backdrop-blur-md border-b border-[#1F1C18] py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Category Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-[#D6A84F] text-[#0C0B0A] shadow-md font-bold'
                    : 'bg-[#181614] border border-[#2D2A26] text-[#A8A29E] hover:text-white hover:border-[#443F38]'
                }`}
              >
                All Works ({items.length})
              </button>

              {categories.map((cat) => {
                const count = items.filter((i) => i.category === cat).length;
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#D6A84F] text-[#0C0B0A] shadow-md font-bold'
                        : 'bg-[#181614] border border-[#2D2A26] text-[#A8A29E] hover:text-white hover:border-[#443F38]'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>

            {/* Search Bar */}
            <div className="relative min-w-[240px] sm:w-72 shrink-0">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#78716C]">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search lookbook..."
                className="w-full pl-10 pr-9 py-2 bg-[#181614] border border-[#2D2A26] rounded-xl text-xs text-white placeholder-[#78716C] focus:outline-hidden focus:border-[#D6A84F] transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#78716C] hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 4. MAIN GALLERY GRID DISPLAY */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Loading Skeleton */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-[#221F1B] bg-[#141210] overflow-hidden animate-pulse space-y-3 p-3"
              >
                <div className="w-full aspect-4/3 bg-[#24211D] rounded-xl" />
                <div className="h-4 bg-[#24211D] rounded w-3/4" />
                <div className="h-3 bg-[#24211D] rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : error ? (
          /* Error State */
          <div className="text-center py-20 px-4 rounded-3xl bg-[#141210] border border-[#2A241F] max-w-lg mx-auto space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#3B1917] text-[#EF4444] flex items-center justify-center mx-auto">
              <X className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Notice Loading Lookbook</h3>
            <p className="text-xs text-[#A8A29E]">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-[#D6A84F] text-[#0C0B0A] text-xs font-bold uppercase tracking-wider hover:brightness-110 cursor-pointer"
            >
              Reload Showcase
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          /* Empty State */
          <div className="text-center py-20 px-4 rounded-3xl bg-[#141210] border border-[#221F1B] max-w-lg mx-auto space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-[#1F1C18] border border-[#3E3A34] text-[#D6A84F] flex items-center justify-center mx-auto">
              <Images className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-white">No Portfolio Items Found</h3>
            <p className="text-xs text-[#A8A29E] leading-relaxed max-w-sm mx-auto">
              {searchQuery || selectedCategory !== 'all'
                ? 'Try adjusting your search criteria or explore other categories.'
                : 'Our stylists are currently updating the lookbook. Check back shortly!'}
            </p>
            {(searchQuery || selectedCategory !== 'all') && (
              <button
                onClick={() => {
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
                className="px-4 py-2 rounded-xl bg-[#1F1C18] border border-[#3E3A34] hover:border-[#D6A84F] text-xs font-semibold text-white transition-all cursor-pointer"
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          /* Masonry-Style Responsive Card Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredItems.map((item, index) => {
              const displayUrl = getOptimizedImageUrl(item.imageUrl, {
                width: 720,
                quality: 'auto',
              });

              return (
                <div
                  key={item.id}
                  onClick={() => setLightboxIndex(index)}
                  className="group relative rounded-2xl border border-[#221F1B] bg-[#141210] overflow-hidden hover:border-[#D6A84F]/60 transition-all duration-300 shadow-lg hover:shadow-[0_8px_30px_rgb(214,168,79,0.12)] cursor-pointer flex flex-col justify-between"
                >
                  {/* Image Container with Luxury Overlay */}
                  <div className="relative aspect-4/3 w-full overflow-hidden bg-[#1F1C18]">
                    <img
                      src={displayUrl}
                      alt={item.altText || item.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-108"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80';
                      }}
                    />

                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0C0B0A] via-[#0C0B0A]/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

                    {/* Top Badges */}
                    <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
                      <span className="px-2.5 py-1 rounded-full bg-[#0C0B0A]/80 backdrop-blur-md border border-[#3E3A34] text-[10px] font-semibold text-[#D6A84F] tracking-wide uppercase">
                        {item.category}
                      </span>
                      {item.featured && (
                        <span className="px-2 py-0.5 rounded-full bg-[#D6A84F] text-[#0C0B0A] text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 shadow-sm">
                          <Sparkles className="w-2.5 h-2.5" />
                          Featured
                        </span>
                      )}
                    </div>

                    {/* Expand Hover Icon */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <div className="w-12 h-12 rounded-full bg-[#0C0B0A]/85 backdrop-blur-md border border-[#D6A84F] text-[#D6A84F] flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                        <Maximize2 className="w-5 h-5" />
                      </div>
                    </div>
                  </div>

                  {/* Card Information */}
                  <div className="p-4 space-y-1.5 z-10 bg-[#141210]">
                    <h3 className="font-serif text-base font-semibold text-white tracking-wide group-hover:text-[#D6A84F] transition-colors truncate">
                      {item.title}
                    </h3>

                    {item.caption && (
                      <p className="text-xs text-[#A8A29E] line-clamp-2 leading-relaxed">
                        {item.caption}
                      </p>
                    )}

                    <div className="pt-2 flex items-center justify-between text-[11px] text-[#78716C] border-t border-[#1F1C18] mt-2">
                      <span className="capitalize">{item.category}</span>
                      <span className="text-[#D6A84F] font-semibold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        View Details <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* 5. LIGHTBOX / FULL-SCREEN MODAL VIEWER */}
      {activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl p-2 sm:p-6 overflow-hidden">
          {/* Top Bar with Counter & Close */}
          <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-mono text-[#D6A84F]">
                {lightboxIndex! + 1} / {filteredItems.length}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-white/70 hidden sm:inline">
                {activeItem.category}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleCopyShare(activeItem.imageUrl)}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Copy Image URL"
              >
                {copiedLink ? (
                  <Check className="w-5 h-5 text-[#16A34A]" />
                ) : (
                  <Share2 className="w-5 h-5" />
                )}
              </button>

              <button
                onClick={handleCloseLightbox}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white hover:text-[#EF4444] transition-colors cursor-pointer"
                title="Close Lightbox (ESC)"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Navigation Prev Button */}
          <button
            onClick={handlePrev}
            className="absolute left-2 sm:left-6 z-20 p-3 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 hover:border-[#D6A84F] text-white hover:text-[#D6A84F] transition-all cursor-pointer"
            aria-label="Previous Image"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          {/* Navigation Next Button */}
          <button
            onClick={handleNext}
            className="absolute right-2 sm:right-6 z-20 p-3 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 hover:border-[#D6A84F] text-white hover:text-[#D6A84F] transition-all cursor-pointer"
            aria-label="Next Image"
          >
            <ChevronRight className="w-6 h-6" />
          </button>

          {/* Main Content Area */}
          <div className="relative max-w-5xl w-full max-h-[85vh] flex flex-col items-center justify-center p-2 z-10">
            {/* The Image */}
            <div className="relative rounded-2xl overflow-hidden max-h-[68vh] shadow-2xl border border-white/10 bg-[#0C0B0A]">
              <img
                src={activeItem.imageUrl}
                alt={activeItem.altText || activeItem.title}
                className="max-h-[68vh] w-auto max-w-full object-contain mx-auto"
              />
            </div>

            {/* Image Details Caption Bar */}
            <div className="mt-4 text-center max-w-2xl px-4 space-y-1">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <h2 className="font-serif text-lg sm:text-2xl font-bold text-white tracking-wide">
                  {activeItem.title}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-[#D6A84F]/20 text-[#D6A84F] text-xs font-semibold">
                  {activeItem.category}
                </span>
                {activeItem.featured && (
                  <span className="px-2 py-0.5 rounded-full bg-[#D6A84F] text-[#0C0B0A] text-[10px] font-bold">
                    Featured
                  </span>
                )}
              </div>

              {activeItem.caption && (
                <p className="text-xs sm:text-sm text-[#A8A29E] leading-relaxed">
                  {activeItem.caption}
                </p>
              )}

              {/* Book Appointment CTA for this service */}
              <div className="pt-2">
                <button
                  onClick={() => {
                    handleCloseLightbox();
                    navigate('/admin/bookings');
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-[#B7791F] via-[#D6A84F] to-[#B7791F] text-[#0C0B0A] text-xs font-bold uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-md cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Reserve This Look</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. PUBLIC FOOTER */}
      <footer className="border-t border-[#1F1C18] bg-[#080706] py-12 mt-20 text-xs text-[#78716C]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Crown className="w-5 h-5 text-[#D6A84F]" />
            <span className="font-serif tracking-widest text-sm font-bold text-white">
              MUSHA EMPIRE
            </span>
            <span className="text-[#3E3A34]">|</span>
            <span>Luxury Salon & Spa Suite Sanctuary</span>
          </div>

          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate('/admin')}
              className="hover:text-[#D6A84F] transition-colors cursor-pointer"
            >
              Staff Portal
            </button>
            <button
              onClick={() => navigate('/admin/bookings')}
              className="hover:text-[#D6A84F] transition-colors cursor-pointer"
            >
              Bookings
            </button>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Back to Top ↑
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
