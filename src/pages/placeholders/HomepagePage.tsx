import React, { useEffect, useState, useMemo } from 'react';
import {
  LayoutTemplate,
  Save,
  Send,
  Eye,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Layers,
  ArrowUp,
  ArrowDown,
  ToggleLeft,
  ToggleRight,
  HelpCircle,
  Plus,
  Trash2,
  ExternalLink,
  Smartphone,
  Monitor,
  Calendar,
  Tag,
  Images,
  ShieldCheck,
  Award,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { doc, onSnapshot, setDoc, collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { COLLECTIONS } from '../../firebase/collections';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { PermissionGate } from '../../components/auth/PermissionGate';
import {
  createDefaultHomepageConfig,
  validateHomepageHero,
  type HomepageConfig,
  type HomepageSectionId,
  type HomepageSectionMeta,
  type NormalizedService,
  type NormalizedOffer,
  type NormalizedGalleryItem,
  normalizeService,
  normalizeOffer,
  normalizeGalleryItem,
} from '../../firebase/types';

export const HomepagePage: React.FC = () => {
  const { hasPermission, role, user } = useAuth();

  const canUpdate = hasPermission('homepage.update');
  const canPublish = hasPermission('homepage.publish');

  // Active Tab State
  type TabKey = 'sections' | 'hero' | 'trust' | 'why_us' | 'faq' | 'booking_cta' | 'connected_content';
  const [activeTab, setActiveTab] = useState<TabKey>('sections');

  // Homepage Config State (Draft & Published)
  const [draftConfig, setDraftConfig] = useState<HomepageConfig>(createDefaultHomepageConfig());
  const [publishedConfig, setPublishedConfig] = useState<HomepageConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState<boolean>(false);

  // Status Alerts
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Form Validation Errors
  const [heroErrors, setHeroErrors] = useState<Record<string, string>>({});

  // Preview Modal State
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewDataSource, setPreviewDataSource] = useState<'draft' | 'published'>('draft');

  // Connected Collections Live Data for preview & status
  const [services, setServices] = useState<NormalizedService[]>([]);
  const [offers, setOffers] = useState<NormalizedOffer[]>([]);
  const [galleryItems, setGalleryItems] = useState<NormalizedGalleryItem[]>([]);

  // 1. Subscribe to Firestore Homepage Documents (Published & Draft)
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    setLoading(true);

    // Document references in shared 'settings' collection
    const publishedDocRef = doc(db, COLLECTIONS.SETTINGS, 'homepage');
    const draftDocRef = doc(db, COLLECTIONS.SETTINGS, 'homepage_draft');

    // Subscribe to published (Public read allowed)
    const unsubPublished = onSnapshot(
      publishedDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as HomepageConfig;
          setPublishedConfig(data);
        } else {
          setPublishedConfig(null);
        }
      },
      (err) => {
        console.warn('Notice listening to published homepage:', err.message);
      }
    );

    // Subscribe to working draft (Requires authenticated admin/manager)
    let unsubDraft: (() => void) | null = null;
    if (user) {
      unsubDraft = onSnapshot(
        draftDocRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data() as HomepageConfig;
            setDraftConfig(data);
          } else {
            // If no draft exists yet, seed with default config
            setDraftConfig(createDefaultHomepageConfig());
          }
          setLoading(false);
        },
        (err) => {
          console.warn('Notice listening to draft homepage:', err.message);
          setActionError('Unable to load private homepage draft.');
          setLoading(false);
        }
      );
    } else {
      // In unauthenticated preview mode, use default config without querying protected draft
      setDraftConfig(createDefaultHomepageConfig());
      setLoading(false);
    }

    // 2. Fetch Connected Catalog Data (Services, Offers, Gallery)
    const servicesCol = collection(db, COLLECTIONS.SERVICES);
    const offersCol = collection(db, COLLECTIONS.OFFERS);
    const galleryCol = collection(db, COLLECTIONS.GALLERY);

    const unsubServices = onSnapshot(
      servicesCol,
      (snap) => {
        const items: NormalizedService[] = [];
        snap.forEach((d) => items.push(normalizeService(d.id, d.data())));
        setServices(items);
      },
      (err) => {
        console.warn('Notice listening to services collection:', err.message);
      }
    );

    const unsubOffers = onSnapshot(
      offersCol,
      (snap) => {
        const items: NormalizedOffer[] = [];
        snap.forEach((d) => items.push(normalizeOffer(d.id, d.data())));
        setOffers(items);
      },
      (err) => {
        console.warn('Notice listening to offers collection:', err.message);
      }
    );

    const unsubGallery = onSnapshot(
      galleryCol,
      (snap) => {
        const items: NormalizedGalleryItem[] = [];
        snap.forEach((d) => items.push(normalizeGalleryItem(d.id, d.data())));
        setGalleryItems(items);
      },
      (err) => {
        console.warn('Notice listening to gallery collection:', err.message);
      }
    );

    return () => {
      unsubPublished();
      if (unsubDraft) unsubDraft();
      unsubServices();
      unsubOffers();
      unsubGallery();
    };
  }, [user]);

  // Check if draft has changes compared to published
  useEffect(() => {
    if (!publishedConfig) {
      setHasUnpublishedChanges(true);
      return;
    }
    const draftStr = JSON.stringify({
      sections: draftConfig.sections,
      hero: draftConfig.hero,
      trust: draftConfig.trustIndicators,
      whyUs: draftConfig.whyUs,
      faq: draftConfig.faq,
      cta: draftConfig.bookingCta,
    });
    const pubStr = JSON.stringify({
      sections: publishedConfig.sections,
      hero: publishedConfig.hero,
      trust: publishedConfig.trustIndicators,
      whyUs: publishedConfig.whyUs,
      faq: publishedConfig.faq,
      cta: publishedConfig.bookingCta,
    });
    setHasUnpublishedChanges(draftStr !== pubStr);
  }, [draftConfig, publishedConfig]);

  // Section Ordering & Visibility Handlers
  const handleToggleSectionVisibility = (sectionId: HomepageSectionId) => {
    if (!canUpdate) return;
    setDraftConfig((prev) => {
      const updated = prev.sections.map((sec) =>
        sec.id === sectionId ? { ...sec, enabled: !sec.enabled } : sec
      );
      return {
        ...prev,
        sections: updated,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    if (!canUpdate) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= draftConfig.sections.length) return;

    setDraftConfig((prev) => {
      const updated = [...prev.sections];
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      // Re-index orders
      const reindexed = updated.map((sec, idx) => ({ ...sec, order: idx }));
      return {
        ...prev,
        sections: reindexed,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  // Save Working Draft to Firestore
  const handleSaveDraft = async () => {
    if (!canUpdate || !db) return;

    // Validate hero
    const validation = validateHomepageHero(draftConfig.hero);
    if (!validation.isValid) {
      setHeroErrors(validation.errors);
      setActiveTab('hero');
      setActionError('Please correct the validation errors in the Hero section.');
      return;
    }
    setHeroErrors({});

    setIsSavingDraft(true);
    setActionError(null);

    try {
      const draftPayload: HomepageConfig = {
        ...draftConfig,
        version: (draftConfig.version || 1) + 1,
        isPublished: false,
        updatedAt: new Date().toISOString(),
        updatedBy: role || 'admin',
      };

      const draftDocRef = doc(db, COLLECTIONS.SETTINGS, 'homepage_draft');
      await setDoc(draftDocRef, draftPayload);

      showSuccess('Homepage working draft saved successfully.');
    } catch (err: unknown) {
      console.error('Error saving draft:', err);
      setActionError('Unable to save changes. Please verify database permissions.');
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Publish Draft to Live Customer Website (settings/homepage)
  const handlePublish = async () => {
    if (!canPublish || !db) return;

    // Validate hero before publishing
    const validation = validateHomepageHero(draftConfig.hero);
    if (!validation.isValid) {
      setHeroErrors(validation.errors);
      setActiveTab('hero');
      setActionError('Cannot publish: please resolve required hero fields.');
      return;
    }
    setHeroErrors({});

    setIsPublishing(true);
    setActionError(null);

    const now = new Date().toISOString();
    const publishedPayload: HomepageConfig = {
      ...draftConfig,
      version: (draftConfig.version || 1) + 1,
      isPublished: true,
      publishedAt: now,
      updatedAt: now,
      updatedBy: role || 'admin',
    };

    try {
      // 1. Write to published document
      const publishedDocRef = doc(db, COLLECTIONS.SETTINGS, 'homepage');
      await setDoc(publishedDocRef, publishedPayload);

      // 2. Sync draft document as well
      const draftDocRef = doc(db, COLLECTIONS.SETTINGS, 'homepage_draft');
      await setDoc(draftDocRef, publishedPayload);

      showSuccess('Homepage published live to customer website!');
      setHasUnpublishedChanges(false);
    } catch (err: unknown) {
      console.error('Error publishing homepage:', err);
      setActionError('Unable to publish content. Please check administrative permissions.');
    } finally {
      setIsPublishing(false);
    }
  };

  const showSuccess = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 5000);
  };

  // FAQ Item Handlers
  const handleAddFaqItem = () => {
    if (!canUpdate) return;
    const newId = `faq-${Date.now()}`;
    setDraftConfig((prev) => ({
      ...prev,
      faq: {
        ...prev.faq,
        items: [
          ...prev.faq.items,
          {
            id: newId,
            question: '',
            answer: '',
            active: true,
            order: prev.faq.items.length,
          },
        ],
      },
    }));
  };

  const handleUpdateFaqItem = (id: string, field: 'question' | 'answer' | 'active', value: any) => {
    if (!canUpdate) return;
    setDraftConfig((prev) => ({
      ...prev,
      faq: {
        ...prev.faq,
        items: prev.faq.items.map((item) =>
          item.id === id ? { ...item, [field]: value } : item
        ),
      },
    }));
  };

  const handleDeleteFaqItem = (id: string) => {
    if (!canUpdate) return;
    setDraftConfig((prev) => ({
      ...prev,
      faq: {
        ...prev.faq,
        items: prev.faq.items.filter((item) => item.id !== id),
      },
    }));
  };

  // Trust Indicator Handlers
  const handleUpdateTrustItem = (id: string, field: 'title' | 'description', value: string) => {
    if (!canUpdate) return;
    setDraftConfig((prev) => ({
      ...prev,
      trustIndicators: {
        ...prev.trustIndicators,
        items: prev.trustIndicators.items.map((item) =>
          item.id === id ? { ...item, [field]: value } : item
        ),
      },
    }));
  };

  // Why Choose Us Item Handlers
  const handleUpdateWhyUsItem = (id: string, field: 'title' | 'description', value: string) => {
    if (!canUpdate) return;
    setDraftConfig((prev) => ({
      ...prev,
      whyUs: {
        ...prev.whyUs,
        items: prev.whyUs.items.map((item) =>
          item.id === id ? { ...item, [field]: value } : item
        ),
      },
    }));
  };

  // Active featured items for status preview
  const featuredServices = useMemo(() => services.filter((s) => s.featured && s.isActive), [services]);
  const activeOffers = useMemo(() => offers.filter((o) => o.isActive && o.validityState === 'active'), [offers]);
  const featuredGallery = useMemo(() => galleryItems.filter((g) => g.isPublished && g.featured), [galleryItems]);

  const activeConfigForPreview = previewDataSource === 'published' && publishedConfig ? publishedConfig : draftConfig;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 font-sans">
      {/* 1. HEADER SECTION */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 sm:p-6 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-[#B7791F] uppercase tracking-wider block">
                MUSHA EMPIRE ADMIN
              </span>
              <span className="text-[#9CA3AF]">•</span>
              <span className="text-[11px] font-semibold text-[#6B7280]">
                Role: <strong className="text-[#171513] capitalize">{role}</strong>
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#171513] tracking-tight mt-0.5">
              Homepage CMS
            </h1>
            <p className="text-xs sm:text-sm text-[#6B7280] font-normal mt-1 max-w-2xl">
              Manage the published content and visual sections displayed on the customer homepage.
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center flex-wrap gap-2.5 shrink-0">
            {/* Live Customer Preview */}
            <Button
              variant="outline"
              size="md"
              onClick={() => setIsPreviewOpen(true)}
              leftIcon={<Eye className="w-4 h-4 text-[#B7791F]" />}
              className="text-xs shadow-xs"
            >
              Preview Homepage
            </Button>

            {/* Save Working Draft */}
            <PermissionGate permission="homepage.update">
              <Button
                variant="secondary"
                size="md"
                onClick={handleSaveDraft}
                isLoading={isSavingDraft}
                leftIcon={<Save className="w-4 h-4" />}
                className="text-xs shadow-xs"
              >
                Save Draft
              </Button>
            </PermissionGate>

            {/* Publish to Customer Website */}
            <PermissionGate permission="homepage.publish">
              <Button
                variant="gold"
                size="md"
                onClick={handlePublish}
                isLoading={isPublishing}
                leftIcon={<Send className="w-4 h-4" />}
                className="text-xs shadow-xs font-bold"
              >
                Publish Live
              </Button>
            </PermissionGate>
          </div>
        </div>

        {/* Status Indicators Bar */}
        <div className="mt-4 pt-3.5 border-t border-[#F3F4F6] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[#6B7280]">Live Status:</span>
              {publishedConfig?.publishedAt ? (
                <Badge variant="success" className="text-[10px] px-2 py-0.5">
                  Live in Production
                </Badge>
              ) : (
                <Badge variant="neutral" className="text-[10px] px-2 py-0.5">
                  Initial Setup Pending
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[#6B7280]">Draft State:</span>
              {hasUnpublishedChanges ? (
                <Badge variant="warning" className="text-[10px] px-2 py-0.5">
                  Unpublished Changes
                </Badge>
              ) : (
                <Badge variant="blue" className="text-[10px] px-2 py-0.5">
                  Synchronized with Live
                </Badge>
              )}
            </div>
          </div>

          <div className="text-[11px] text-[#6B7280]">
            Last Published: {publishedConfig?.publishedAt ? new Date(publishedConfig.publishedAt).toLocaleString() : 'Never'}
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
        {actionError && (
          <div className="mt-4 p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FEE2E2] flex items-center justify-between text-xs text-[#DC2626]">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0" />
              <span>{actionError}</span>
            </div>
            <button
              onClick={() => setActionError(null)}
              className="text-[#DC2626] hover:text-[#991B1B] font-bold cursor-pointer ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 2. NAVIGATION TABS */}
      <div className="border-b border-[#E5E7EB] bg-white rounded-xl p-1.5 shadow-xs flex items-center gap-1 overflow-x-auto">
        {[
          { key: 'sections', label: 'Section Management', icon: Layers },
          { key: 'hero', label: 'Hero Banner', icon: LayoutTemplate },
          { key: 'trust', label: 'Trust & Standards', icon: ShieldCheck },
          { key: 'why_us', label: 'Why Choose Us', icon: Award },
          { key: 'connected_content', label: 'Connected Catalog', icon: Sparkles },
          { key: 'faq', label: 'FAQ Section', icon: HelpCircle },
          { key: 'booking_cta', label: 'Booking CTA Banner', icon: Calendar },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabKey)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#FEF9EE] text-[#B7791F] border border-[#FCEEC8] shadow-xs'
                  : 'text-[#6B7280] hover:text-[#171513] hover:bg-[#F9FAFB]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. TAB CONTENT */}

      {/* TAB A: SECTION MANAGEMENT */}
      {activeTab === 'sections' && (
        <Card>
          <CardHeader
            title="Homepage Sections"
            subtitle="Enable, disable, or re-order sections displayed to customers on the landing page."
            action={
              <span className="text-xs text-[#6B7280]">
                {draftConfig.sections.filter((s) => s.enabled).length} of {draftConfig.sections.length} active
              </span>
            }
          />
          <CardContent className="p-0">
            <div className="divide-y divide-[#F3F4F6]">
              {draftConfig.sections.map((section, idx) => (
                <div
                  key={section.id}
                  className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                    section.enabled ? 'bg-white' : 'bg-[#FAFAFA]'
                  }`}
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-[#F7F8FA] border border-[#E5E7EB] text-[#6B7280] font-mono text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className={`text-sm font-bold ${section.enabled ? 'text-[#171513]' : 'text-[#9CA3AF]'}`}>
                          {section.name}
                        </h4>
                        <Badge variant={section.enabled ? 'success' : 'neutral'} className="text-[10px] px-1.5 py-0">
                          {section.enabled ? 'Enabled' : 'Hidden'}
                        </Badge>
                      </div>
                      <p className="text-xs text-[#6B7280] mt-0.5 line-clamp-1">
                        {section.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {/* Move Up / Down Buttons */}
                    {canUpdate && (
                      <div className="flex items-center border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] p-0.5">
                        <button
                          onClick={() => handleMoveSection(idx, 'up')}
                          disabled={idx === 0}
                          title="Move section up"
                          className="p-1 rounded text-[#6B7280] hover:text-[#171513] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveSection(idx, 'down')}
                          disabled={idx === draftConfig.sections.length - 1}
                          title="Move section down"
                          className="p-1 rounded text-[#6B7280] hover:text-[#171513] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Enable / Disable Switch */}
                    {canUpdate && (
                      <button
                        onClick={() => handleToggleSectionVisibility(section.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          section.enabled
                            ? 'bg-[#F0FDF4] text-[#166534] border-[#DCFCE7] hover:bg-[#DCFCE7]'
                            : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:bg-[#F3F4F6]'
                        }`}
                      >
                        {section.enabled ? (
                          <>
                            <ToggleRight className="w-4 h-4 text-[#16A34A]" />
                            <span>Enabled</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-4 h-4 text-[#9CA3AF]" />
                            <span>Disabled</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Quick Edit Target Tab */}
                    {['hero', 'trust', 'why_us', 'faq', 'booking_cta'].includes(section.id) && (
                      <button
                        onClick={() => setActiveTab(section.id as TabKey)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#B7791F] hover:bg-[#FEF9EE] transition-colors cursor-pointer"
                      >
                        Edit Content →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB B: HERO EDITOR */}
      {activeTab === 'hero' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader
                title="Hero Banner Content"
                subtitle="The primary visual and verbal introduction to Musha Empire."
              />
              <CardContent className="p-5 space-y-4">
                {/* Eyebrow */}
                <div>
                  <label className="block text-xs font-semibold text-[#171513] mb-1">
                    Eyebrow / Category Tag
                  </label>
                  <input
                    type="text"
                    value={draftConfig.hero.eyebrow}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        hero: { ...prev.hero, eyebrow: e.target.value },
                      }))
                    }
                    placeholder="e.g. LUXURY SALON & WELLNESS"
                    className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-medium text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white"
                  />
                </div>

                {/* Main Headline */}
                <div>
                  <label className="block text-xs font-semibold text-[#171513] mb-1">
                    Main Headline <span className="text-[#DC2626]">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={draftConfig.hero.headline}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        hero: { ...prev.hero, headline: e.target.value },
                      }))
                    }
                    placeholder="e.g. Artistry in Every Detail, Luxury in Every Touch"
                    className={`w-full px-3 py-2 bg-[#F9FAFB] border rounded-xl text-sm font-bold text-[#171513] focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white resize-none ${
                      heroErrors.headline ? 'border-[#DC2626]' : 'border-[#E5E7EB]'
                    }`}
                  />
                  {heroErrors.headline && (
                    <p className="text-[11px] text-[#DC2626] mt-1">{heroErrors.headline}</p>
                  )}
                </div>

                {/* Supporting Text */}
                <div>
                  <label className="block text-xs font-semibold text-[#171513] mb-1">
                    Supporting Copy / Description
                  </label>
                  <textarea
                    rows={3}
                    value={draftConfig.hero.supportingText}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        hero: { ...prev.hero, supportingText: e.target.value },
                      }))
                    }
                    placeholder="Concise overview of salon sanctuary and bespoke appointments..."
                    className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] leading-relaxed focus:outline-hidden focus:ring-2 focus:ring-[#B7791F]/30 focus:border-[#B7791F] focus:bg-white resize-none"
                  />
                </div>

                {/* Primary CTA */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#F3F4F6]">
                  <div>
                    <label className="block text-xs font-semibold text-[#171513] mb-1">
                      Primary CTA Label <span className="text-[#DC2626]">*</span>
                    </label>
                    <input
                      type="text"
                      value={draftConfig.hero.primaryCtaLabel}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          hero: { ...prev.hero, primaryCtaLabel: e.target.value },
                        }))
                      }
                      placeholder="e.g. Book Appointment"
                      className={`w-full px-3 py-2 bg-[#F9FAFB] border rounded-xl text-xs font-semibold text-[#171513] ${
                        heroErrors.primaryCtaLabel ? 'border-[#DC2626]' : 'border-[#E5E7EB]'
                      }`}
                    />
                    {heroErrors.primaryCtaLabel && (
                      <p className="text-[11px] text-[#DC2626] mt-1">{heroErrors.primaryCtaLabel}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#171513] mb-1">
                      Primary Destination <span className="text-[#DC2626]">*</span>
                    </label>
                    <input
                      type="text"
                      value={draftConfig.hero.primaryCtaDestination}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          hero: { ...prev.hero, primaryCtaDestination: e.target.value },
                        }))
                      }
                      placeholder="/book or #book"
                      className={`w-full px-3 py-2 bg-[#F9FAFB] border rounded-xl text-xs font-mono text-[#171513] ${
                        heroErrors.primaryCtaDestination ? 'border-[#DC2626]' : 'border-[#E5E7EB]'
                      }`}
                    />
                    {heroErrors.primaryCtaDestination && (
                      <p className="text-[11px] text-[#DC2626] mt-1">{heroErrors.primaryCtaDestination}</p>
                    )}
                  </div>
                </div>

                {/* Secondary CTA */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#171513] mb-1">
                      Secondary CTA Label
                    </label>
                    <input
                      type="text"
                      value={draftConfig.hero.secondaryCtaLabel || ''}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          hero: { ...prev.hero, secondaryCtaLabel: e.target.value },
                        }))
                      }
                      placeholder="e.g. Explore Services"
                      className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#171513] mb-1">
                      Secondary Destination
                    </label>
                    <input
                      type="text"
                      value={draftConfig.hero.secondaryCtaDestination || ''}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          hero: { ...prev.hero, secondaryCtaDestination: e.target.value },
                        }))
                      }
                      placeholder="#services or /services"
                      className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-mono text-[#171513]"
                    />
                  </div>
                </div>

                {/* Media Configuration */}
                <div className="pt-3 border-t border-[#F3F4F6] space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#171513] mb-1">
                      Desktop Hero Media URL <span className="text-[#DC2626]">*</span>
                    </label>
                    <input
                      type="url"
                      value={draftConfig.hero.desktopMedia}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          hero: { ...prev.hero, desktopMedia: e.target.value },
                        }))
                      }
                      placeholder="https://images.unsplash.com/..."
                      className={`w-full px-3 py-2 bg-[#F9FAFB] border rounded-xl text-xs font-mono text-[#171513] ${
                        heroErrors.desktopMedia ? 'border-[#DC2626]' : 'border-[#E5E7EB]'
                      }`}
                    />
                    {heroErrors.desktopMedia && (
                      <p className="text-[11px] text-[#DC2626] mt-1">{heroErrors.desktopMedia}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#171513] mb-1">
                      Mobile Hero Media URL (Optional)
                    </label>
                    <input
                      type="url"
                      value={draftConfig.hero.mobileMedia || ''}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          hero: { ...prev.hero, mobileMedia: e.target.value },
                        }))
                      }
                      placeholder="https://images.unsplash.com/..."
                      className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-mono text-[#171513]"
                    />
                  </div>

                  {/* Required Notice on Upload Infrastructure */}
                  <div className="p-3 rounded-xl bg-[#FAFBFD] border border-[#E5E7EB] text-xs text-[#6B7280] flex items-start gap-2">
                    <Info className="w-4 h-4 text-[#B7791F] shrink-0 mt-0.5" />
                    <span>
                      Media upload will be available once the media provider is configured. You can provide any active HTTPS image URL.
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Hero Live Visual Preview Card */}
          <div className="space-y-4">
            <Card>
              <CardHeader title="Hero Preview Card" subtitle="Visual preview of current draft" />
              <CardContent className="p-4 space-y-3">
                <div className="relative rounded-xl overflow-hidden aspect-16/10 bg-[#171513]">
                  <img
                    src={draftConfig.hero.desktopMedia}
                    alt="Hero Preview"
                    className="w-full h-full object-cover opacity-60"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=800&q=80';
                    }}
                  />
                  <div className="absolute inset-0 p-4 flex flex-col justify-end text-white">
                    <span className="text-[10px] font-bold text-[#D6A84F] tracking-widest uppercase">
                      {draftConfig.hero.eyebrow || 'LUXURY SALON'}
                    </span>
                    <h3 className="text-sm font-bold mt-1 line-clamp-2">
                      {draftConfig.hero.headline || 'Bespoke Artistry'}
                    </h3>
                    <p className="text-[10px] text-gray-300 line-clamp-2 mt-1">
                      {draftConfig.hero.supportingText}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded bg-[#B7791F] text-white font-bold text-[10px]">
                        {draftConfig.hero.primaryCtaLabel || 'Book Appointment'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-[#6B7280] space-y-1 pt-2 border-t border-[#F3F4F6]">
                  <div className="flex justify-between">
                    <span>Desktop Aspect:</span>
                    <span className="font-semibold text-[#171513]">16:9 / Landscape</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Mobile Media:</span>
                    <span className="font-semibold text-[#171513]">
                      {draftConfig.hero.mobileMedia ? 'Custom Configured' : 'Using Desktop Media'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* TAB C: TRUST INDICATORS */}
      {activeTab === 'trust' && (
        <Card>
          <CardHeader
            title="Brand & Trust Indicators"
            subtitle="Authentic standards, private suites, and genuine positioning dedicated to each patron."
          />
          <CardContent className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#171513] mb-1">
                Section Heading
              </label>
              <input
                type="text"
                value={draftConfig.trustIndicators.title}
                onChange={(e) =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    trustIndicators: { ...prev.trustIndicators, title: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513]"
              />
            </div>

            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold text-[#171513] uppercase tracking-wider text-[#B7791F]">
                Standard Pillars (Genuine Salon Statements Only)
              </h4>

              {draftConfig.trustIndicators.items.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-[#E5E7EB] bg-[#FAFBFD] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#171513]">Pillar #{idx + 1}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#6B7280] mb-1">
                        Pillar Title
                      </label>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => handleUpdateTrustItem(item.id, 'title', e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-[#E5E7EB] rounded-lg text-xs font-bold text-[#171513]"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-[#6B7280] mb-1">
                        Description / Commitment
                      </label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleUpdateTrustItem(item.id, 'description', e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-[#E5E7EB] rounded-lg text-xs text-[#171513]"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-xl bg-[#FAFBFD] border border-[#E5E7EB] text-xs text-[#6B7280] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#16A34A] shrink-0" />
              <span>
                <strong>Zero-Fake Assurance:</strong> No fabricated statistics, false awards, or inflated review counts.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB D: WHY CHOOSE US */}
      {activeTab === 'why_us' && (
        <Card>
          <CardHeader
            title="Why Choose Musha Empire"
            subtitle="Core craftsmanship, private sanctuary, and personalized consultation values."
          />
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Section Title
                </label>
                <input
                  type="text"
                  value={draftConfig.whyUs.title}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      whyUs: { ...prev.whyUs, title: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  Subtitle
                </label>
                <input
                  type="text"
                  value={draftConfig.whyUs.subtitle || ''}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      whyUs: { ...prev.whyUs, subtitle: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513]"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold text-[#B7791F] uppercase tracking-wider">
                Distinction Items
              </h4>

              {draftConfig.whyUs.items.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-[#E5E7EB] bg-[#FAFBFD] space-y-3"
                >
                  <span className="text-xs font-bold text-[#171513]">Feature #{idx + 1}</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#6B7280] mb-1">
                        Title
                      </label>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => handleUpdateWhyUsItem(item.id, 'title', e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-[#E5E7EB] rounded-lg text-xs font-bold text-[#171513]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-[#6B7280] mb-1">
                        Explanation
                      </label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleUpdateWhyUsItem(item.id, 'description', e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-[#E5E7EB] rounded-lg text-xs text-[#171513]"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB E: CONNECTED CATALOG (SERVICES, OFFERS, GALLERY) */}
      {activeTab === 'connected_content' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Connected Catalog Integrations"
              subtitle="The customer homepage seamlessly references authoritative collections from Firestore without duplicating data."
            />
            <CardContent className="p-5 space-y-6">
              {/* Featured Services */}
              <div className="p-4 rounded-xl border border-[#E5E7EB] bg-[#FAFBFD] space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#B7791F]" />
                    <h4 className="text-sm font-bold text-[#171513]">
                      Featured Services ({featuredServices.length} active)
                    </h4>
                  </div>
                  <span className="text-xs text-[#6B7280]">
                    Managed in <strong className="text-[#B7791F]">Services CMS</strong>
                  </span>
                </div>

                {featuredServices.length === 0 ? (
                  <EmptyState
                    compact
                    title="No featured services"
                    description="Open Services CMS and toggle the 'Featured' flag on services to highlight them on the customer homepage."
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    {featuredServices.slice(0, 3).map((s) => (
                      <div key={s.id} className="p-3 rounded-lg bg-white border border-[#E5E7EB] text-xs">
                        <div className="font-bold text-[#171513] truncate">{s.name}</div>
                        <div className="text-[#6B7280] mt-0.5">₹{s.price.toLocaleString('en-IN')} • {s.durationMinutes} min</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active Offers */}
              <div className="p-4 rounded-xl border border-[#E5E7EB] bg-[#FAFBFD] space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-[#B7791F]" />
                    <h4 className="text-sm font-bold text-[#171513]">
                      Active Promotions ({activeOffers.length} current)
                    </h4>
                  </div>
                  <span className="text-xs text-[#6B7280]">
                    Managed in <strong className="text-[#B7791F]">Offers CMS</strong>
                  </span>
                </div>

                {activeOffers.length === 0 ? (
                  <EmptyState
                    compact
                    title="No active offers"
                    description="Currently no active offers are scheduled. The Offers section will automatically hide or show a graceful announcement."
                  />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    {activeOffers.slice(0, 3).map((o) => (
                      <div key={o.id} className="p-3 rounded-lg bg-white border border-[#E5E7EB] text-xs">
                        <div className="font-bold text-[#171513] truncate">{o.title}</div>
                        <div className="text-[#16A34A] font-semibold mt-0.5">
                          {o.discountType === 'percentage' ? `${o.discount}% OFF` : `₹${o.discount.toLocaleString('en-IN')} OFF`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Featured Gallery */}
              <div className="p-4 rounded-xl border border-[#E5E7EB] bg-[#FAFBFD] space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Images className="w-4 h-4 text-[#B7791F]" />
                    <h4 className="text-sm font-bold text-[#171513]">
                      Lookbook Showcase ({featuredGallery.length} featured items)
                    </h4>
                  </div>
                  <span className="text-xs text-[#6B7280]">
                    Managed in <strong className="text-[#B7791F]">Gallery CMS</strong>
                  </span>
                </div>

                {featuredGallery.length === 0 ? (
                  <EmptyState
                    compact
                    title="No featured gallery items"
                    description="Tag lookbook media as 'Featured' in Gallery CMS to showcase them on the homepage."
                  />
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    {featuredGallery.slice(0, 4).map((g) => (
                      <div key={g.id} className="aspect-square rounded-lg overflow-hidden border border-[#E5E7EB] bg-[#F3F4F6]">
                        <img src={g.imageUrl} alt={g.title} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB F: FAQ EDITOR */}
      {activeTab === 'faq' && (
        <Card>
          <CardHeader
            title="Frequently Asked Questions"
            subtitle="Clear policies and guidelines for patrons scheduling treatments."
            action={
              <Button
                variant="gold"
                size="sm"
                onClick={handleAddFaqItem}
                leftIcon={<Plus className="w-3.5 h-3.5" />}
              >
                + Add Question
              </Button>
            }
          />
          <CardContent className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#171513] mb-1">
                FAQ Section Heading
              </label>
              <input
                type="text"
                value={draftConfig.faq.title}
                onChange={(e) =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    faq: { ...prev.faq, title: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-semibold text-[#171513]"
              />
            </div>

            <div className="space-y-3 pt-2">
              {draftConfig.faq.items.map((item, idx) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-[#E5E7EB] bg-[#FAFBFD] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#171513]">Question #{idx + 1}</span>
                    <button
                      onClick={() => handleDeleteFaqItem(item.id)}
                      className="p-1 rounded text-[#DC2626] hover:bg-[#FEF2F2] cursor-pointer"
                      title="Delete question"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#6B7280] mb-1">
                      Question
                    </label>
                    <input
                      type="text"
                      value={item.question}
                      onChange={(e) => handleUpdateFaqItem(item.id, 'question', e.target.value)}
                      placeholder="e.g. How do I reschedule my reservation?"
                      className="w-full px-3 py-2 bg-white border border-[#E5E7EB] rounded-lg text-xs font-semibold text-[#171513]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#6B7280] mb-1">
                      Answer
                    </label>
                    <textarea
                      rows={2}
                      value={item.answer}
                      onChange={(e) => handleUpdateFaqItem(item.id, 'answer', e.target.value)}
                      placeholder="Detailed client explanation..."
                      className="w-full px-3 py-2 bg-white border border-[#E5E7EB] rounded-lg text-xs text-[#171513] resize-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* TAB G: BOOKING CTA BANNER */}
      {activeTab === 'booking_cta' && (
        <Card>
          <CardHeader
            title="Final Booking Call-To-Action"
            subtitle="The high-converting invitation at the bottom of the customer homepage leading into the booking scheduler."
          />
          <CardContent className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#171513] mb-1">
                Eyebrow
              </label>
              <input
                type="text"
                value={draftConfig.bookingCta.eyebrow}
                onChange={(e) =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    bookingCta: { ...prev.bookingCta, eyebrow: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-medium text-[#171513]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#171513] mb-1">
                Headline
              </label>
              <input
                type="text"
                value={draftConfig.bookingCta.headline}
                onChange={(e) =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    bookingCta: { ...prev.bookingCta, headline: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-sm font-bold text-[#171513]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#171513] mb-1">
                Supporting Copy
              </label>
              <textarea
                rows={2}
                value={draftConfig.bookingCta.supportingText}
                onChange={(e) =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    bookingCta: { ...prev.bookingCta, supportingText: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs text-[#171513] resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#F3F4F6]">
              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  CTA Button Label
                </label>
                <input
                  type="text"
                  value={draftConfig.bookingCta.ctaLabel}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      bookingCta: { ...prev.bookingCta, ctaLabel: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-bold text-[#171513]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#171513] mb-1">
                  CTA Destination URL
                </label>
                <input
                  type="text"
                  value={draftConfig.bookingCta.ctaDestination}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      bookingCta: { ...prev.bookingCta, ctaDestination: e.target.value },
                    }))
                  }
                  className="w-full px-3 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-xl text-xs font-mono text-[#171513]"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. LIVE CUSTOMER HOMEPAGE PREVIEW MODAL */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#171513]/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col my-auto overflow-hidden">
            {/* Modal Controls Header */}
            <div className="p-4 border-b border-[#E5E7EB] bg-[#FAFBFD] flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#171513]">
                  Customer Homepage Preview
                </h3>
                <p className="text-[11px] text-[#6B7280]">
                  Inspect customer experience before publishing changes to production.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                {/* Data Source Selector */}
                <div className="flex items-center bg-[#F3F4F6] p-0.5 rounded-lg text-xs font-semibold">
                  <button
                    onClick={() => setPreviewDataSource('draft')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      previewDataSource === 'draft' ? 'bg-white text-[#B7791F] shadow-xs' : 'text-[#6B7280]'
                    }`}
                  >
                    Draft
                  </button>
                  <button
                    onClick={() => setPreviewDataSource('published')}
                    className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                      previewDataSource === 'published' ? 'bg-white text-[#B7791F] shadow-xs' : 'text-[#6B7280]'
                    }`}
                  >
                    Live Published
                  </button>
                </div>

                {/* Device Selector */}
                <div className="flex items-center bg-[#F3F4F6] p-0.5 rounded-lg">
                  <button
                    onClick={() => setPreviewDevice('desktop')}
                    className={`p-1.5 rounded-md transition-all cursor-pointer ${
                      previewDevice === 'desktop' ? 'bg-white text-[#171513] shadow-xs' : 'text-[#6B7280]'
                    }`}
                    title="Desktop View"
                  >
                    <Monitor className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setPreviewDevice('mobile')}
                    className={`p-1.5 rounded-md transition-all cursor-pointer ${
                      previewDevice === 'mobile' ? 'bg-white text-[#171513] shadow-xs' : 'text-[#6B7280]'
                    }`}
                    title="Mobile View (390px)"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="p-1 rounded-lg text-[#6B7280] hover:text-[#171513] hover:bg-[#F3F4F6] cursor-pointer ml-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Simulated Customer Page Viewport */}
            <div className="flex-1 overflow-y-auto bg-[#F7F8FA] p-4 flex justify-center">
              <div
                className={`bg-white shadow-md border border-[#E5E7EB] transition-all overflow-hidden ${
                  previewDevice === 'mobile'
                    ? 'w-[390px] rounded-3xl min-h-[640px]'
                    : 'w-full rounded-xl min-h-[600px]'
                }`}
              >
                {/* 1. Hero Preview */}
                {activeConfigForPreview.hero.enabled && (
                  <div className="relative aspect-16/9 bg-[#171513] flex items-center justify-center overflow-hidden">
                    <img
                      src={
                        previewDevice === 'mobile' && activeConfigForPreview.hero.mobileMedia
                          ? activeConfigForPreview.hero.mobileMedia
                          : activeConfigForPreview.hero.desktopMedia
                      }
                      alt="Hero"
                      className="w-full h-full object-cover opacity-60"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1200&q=80';
                      }}
                    />
                    <div className="absolute inset-0 p-6 flex flex-col justify-center items-center text-center text-white space-y-2">
                      <span className="text-[10px] sm:text-xs font-bold text-[#D6A84F] tracking-widest uppercase">
                        {activeConfigForPreview.hero.eyebrow}
                      </span>
                      <h2 className="text-base sm:text-2xl font-bold max-w-lg leading-tight">
                        {activeConfigForPreview.hero.headline}
                      </h2>
                      <p className="text-xs text-gray-200 max-w-md line-clamp-2">
                        {activeConfigForPreview.hero.supportingText}
                      </p>
                      <div className="pt-2 flex items-center gap-2">
                        <span className="px-3 py-1.5 rounded-lg bg-[#B7791F] text-white font-bold text-xs shadow-xs">
                          {activeConfigForPreview.hero.primaryCtaLabel}
                        </span>
                        {activeConfigForPreview.hero.secondaryCtaLabel && (
                          <span className="px-3 py-1.5 rounded-lg bg-white/20 backdrop-blur-xs text-white font-medium text-xs">
                            {activeConfigForPreview.hero.secondaryCtaLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Trust Indicators Preview */}
                {activeConfigForPreview.trustIndicators.enabled && (
                  <div className="p-6 border-b border-[#F3F4F6] bg-[#FAFBFD]">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-center text-[#B7791F] mb-4">
                      {activeConfigForPreview.trustIndicators.title}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {activeConfigForPreview.trustIndicators.items.map((item) => (
                        <div key={item.id} className="p-3 bg-white rounded-xl border border-[#E5E7EB] text-center space-y-1">
                          <h4 className="text-xs font-bold text-[#171513]">{item.title}</h4>
                          <p className="text-[11px] text-[#6B7280] leading-relaxed">{item.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Featured Services Preview */}
                {activeConfigForPreview.servicesSection.enabled && (
                  <div className="p-6 border-b border-[#F3F4F6]">
                    <div className="text-center mb-4">
                      <h3 className="text-sm font-bold text-[#171513]">
                        {activeConfigForPreview.servicesSection.title}
                      </h3>
                      <p className="text-xs text-[#6B7280]">{activeConfigForPreview.servicesSection.subtitle}</p>
                    </div>
                    {featuredServices.length === 0 ? (
                      <p className="text-xs text-center text-[#9CA3AF] py-3">No featured treatments currently selected.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {featuredServices.slice(0, 3).map((s) => (
                          <div key={s.id} className="p-3 rounded-xl border border-[#E5E7EB] bg-white text-xs">
                            <span className="font-bold text-[#171513] block truncate">{s.name}</span>
                            <span className="text-[#6B7280] block mt-0.5">{s.durationMinutes} min • ${s.price}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Why Choose Us Preview */}
                {activeConfigForPreview.whyUs.enabled && (
                  <div className="p-6 border-b border-[#F3F4F6] bg-[#FAFBFD]">
                    <div className="text-center mb-4">
                      <h3 className="text-sm font-bold text-[#171513]">
                        {activeConfigForPreview.whyUs.title}
                      </h3>
                      <p className="text-xs text-[#6B7280]">{activeConfigForPreview.whyUs.subtitle}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {activeConfigForPreview.whyUs.items.map((item) => (
                        <div key={item.id} className="p-3 bg-white rounded-xl border border-[#E5E7EB] text-xs space-y-1">
                          <h4 className="font-bold text-[#171513]">{item.title}</h4>
                          <p className="text-[#6B7280] leading-relaxed text-[11px]">{item.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. Booking CTA Banner Preview */}
                {activeConfigForPreview.bookingCta.enabled && (
                  <div className="p-8 bg-[#171513] text-white text-center space-y-2">
                    <span className="text-[10px] font-bold text-[#D6A84F] tracking-widest uppercase">
                      {activeConfigForPreview.bookingCta.eyebrow}
                    </span>
                    <h3 className="text-lg font-bold">
                      {activeConfigForPreview.bookingCta.headline}
                    </h3>
                    <p className="text-xs text-gray-300 max-w-sm mx-auto">
                      {activeConfigForPreview.bookingCta.supportingText}
                    </p>
                    <div className="pt-2">
                      <span className="inline-block px-4 py-2 rounded-xl bg-[#B7791F] text-white font-bold text-xs">
                        {activeConfigForPreview.bookingCta.ctaLabel}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
