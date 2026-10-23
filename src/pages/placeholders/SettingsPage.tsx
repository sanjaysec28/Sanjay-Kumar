import React, { useEffect, useState } from 'react';
import {
  Settings,
  Save,
  Clock,
  Phone,
  Mail,
  MapPin,
  Globe,
  DollarSign,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Building,
  RotateCcw,
  Sparkles,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { COLLECTIONS } from '../../firebase/collections';
import { useAuth } from '../../context/AuthContext';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  type SalonSettings,
  type DayOfWeek,
  DAYS_OF_WEEK,
  DEFAULT_SALON_SETTINGS,
} from '../../firebase/types';

export const SettingsPage: React.FC = () => {
  const { hasPermission, role: currentUserRole, userProfile } = useAuth();

  const canViewSettings = hasPermission('settings.view');
  const canUpdateSettings = hasPermission('settings.update');

  // Salon Settings State
  const [settings, setSettings] = useState<SalonSettings>(DEFAULT_SALON_SETTINGS);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Active Tab
  type SettingsTab = 'general' | 'hours' | 'booking_rules' | 'policies';
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  // Validation Errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 1. Subscribe to Firestore `settings/salon` document
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const settingsDocRef = doc(db, COLLECTIONS.SETTINGS, 'salon');

    const unsubscribe = onSnapshot(
      settingsDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Partial<SalonSettings>;
          setSettings({
            salonName: data.salonName || data.name || DEFAULT_SALON_SETTINGS.salonName,
            phone: data.phone || DEFAULT_SALON_SETTINGS.phone,
            email: data.email || DEFAULT_SALON_SETTINGS.email,
            address: data.address || DEFAULT_SALON_SETTINGS.address,
            timezone: data.timezone || DEFAULT_SALON_SETTINGS.timezone,
            currency: data.currency || DEFAULT_SALON_SETTINGS.currency,
            slotDurationMinutes: data.slotDurationMinutes || DEFAULT_SALON_SETTINGS.slotDurationMinutes,
            bookingAdvanceDays: data.bookingAdvanceDays || DEFAULT_SALON_SETTINGS.bookingAdvanceDays,
            cancellationNoticeHours: data.cancellationNoticeHours || DEFAULT_SALON_SETTINGS.cancellationNoticeHours,
            taxRatePercent: data.taxRatePercent ?? DEFAULT_SALON_SETTINGS.taxRatePercent,
            status: data.status || DEFAULT_SALON_SETTINGS.status,
            operatingState: data.operatingState || DEFAULT_SALON_SETTINGS.operatingState,
            workingHours: data.workingHours || DEFAULT_SALON_SETTINGS.workingHours,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy,
          });
        } else {
          // Fall back gracefully to defaults
          setSettings(DEFAULT_SALON_SETTINGS);
        }
        setLoading(false);
      },
      (err) => {
        console.warn('Notice listening to salon settings:', err.message);
        setFeedback({
          type: 'error',
          message: 'Unable to load salon settings from database.',
        });
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Validation
  const validateSettings = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!settings.salonName?.trim()) {
      newErrors.salonName = 'Salon name is required.';
    }
    if (!settings.phone?.trim()) {
      newErrors.phone = 'Contact phone number is required.';
    }
    if (!settings.email?.trim() || !settings.email.includes('@')) {
      newErrors.email = 'A valid contact email is required.';
    }
    if (!settings.address?.trim()) {
      newErrors.address = 'Salon address is required.';
    }

    if (
      settings.slotDurationMinutes == null ||
      settings.slotDurationMinutes < 15 ||
      settings.slotDurationMinutes > 240
    ) {
      newErrors.slotDurationMinutes = 'Slot duration must be between 15 and 240 minutes.';
    }

    if (
      settings.bookingAdvanceDays == null ||
      settings.bookingAdvanceDays < 1 ||
      settings.bookingAdvanceDays > 365
    ) {
      newErrors.bookingAdvanceDays = 'Advance booking window must be between 1 and 365 days.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Save Settings to Firestore
  const handleSaveSettings = async () => {
    if (!canUpdateSettings) {
      setFeedback({
        type: 'error',
        message: 'Permission Denied: You do not have permissions to modify salon settings.',
      });
      return;
    }

    if (!validateSettings()) {
      setFeedback({
        type: 'error',
        message: 'Please resolve validation errors before saving.',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);

    try {
      if (!db) throw new Error('Firestore instance unavailable.');

      const settingsDocRef = doc(db, COLLECTIONS.SETTINGS, 'salon');
      await setDoc(
        settingsDocRef,
        {
          ...settings,
          updatedAt: serverTimestamp(),
          updatedBy: userProfile?.displayName || userProfile?.email || 'admin',
        },
        { merge: true }
      );

      setFeedback({
        type: 'success',
        message: 'Salon configuration and business parameters saved successfully.',
      });
    } catch (err: any) {
      console.error('Failed to save salon settings:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to save salon settings. Check Firestore rules.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Toggle Day Open/Close
  const handleToggleDayOpen = (day: DayOfWeek) => {
    const current = settings.workingHours?.[day] || { open: '09:00', close: '20:00', isOpen: true };
    setSettings((prev) => ({
      ...prev,
      workingHours: {
        ...prev.workingHours,
        [day]: {
          ...current,
          isOpen: !current.isOpen,
        },
      },
    }));
  };

  // Change Day Time
  const handleDayTimeChange = (day: DayOfWeek, field: 'open' | 'close', value: string) => {
    const current = settings.workingHours?.[day] || { open: '09:00', close: '20:00', isOpen: true };
    setSettings((prev) => ({
      ...prev,
      workingHours: {
        ...prev.workingHours,
        [day]: {
          ...current,
          [field]: value,
        },
      },
    }));
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
            <span className="text-xs font-medium text-stone-500">Configuration</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Salon Settings & Policies
          </h1>
          <p className="text-sm font-medium text-stone-500 mt-1">
            Configure authoritative operating hours, booking slots, salon location, and customer policies.
          </p>
        </div>

        {/* Save Action Button */}
        {canUpdateSettings && (
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              size="md"
              onClick={handleSaveSettings}
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold shadow-xs"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        )}
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl text-sm font-medium flex items-start gap-3 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <span>{feedback.message}</span>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-stone-200 space-x-6 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('general')}
          className={`pb-3 transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === 'general'
              ? 'border-amber-600 text-stone-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <Building className="w-4 h-4" />
          General & Location
        </button>
        <button
          onClick={() => setActiveTab('hours')}
          className={`pb-3 transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === 'hours'
              ? 'border-amber-600 text-stone-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          Operating Hours
        </button>
        <button
          onClick={() => setActiveTab('booking_rules')}
          className={`pb-3 transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === 'booking_rules'
              ? 'border-amber-600 text-stone-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Booking Engine Rules
        </button>
        <button
          onClick={() => setActiveTab('policies')}
          className={`pb-3 transition-colors flex items-center gap-2 border-b-2 ${
            activeTab === 'policies'
              ? 'border-amber-600 text-stone-900'
              : 'border-transparent text-stone-500 hover:text-stone-800'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Financial & Policies
        </button>
      </div>

      {/* Tab 1: General & Location */}
      {activeTab === 'general' && (
        <Card>
          <CardHeader className="p-5 border-b border-stone-100">
            <h2 className="text-base font-semibold text-stone-900">
              Salon Identity & Location
            </h2>
            <p className="text-xs font-medium text-stone-500 mt-0.5">
              Authoritative business contacts displayed on tickets, confirmations, and customer portal.
            </p>
          </CardHeader>
          <CardContent className="p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Salon Name */}
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-700 mb-1.5">
                  Official Business Name *
                </label>
                <input
                  type="text"
                  value={settings.salonName || ''}
                  onChange={(e) => setSettings({ ...settings, salonName: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                />
                {errors.salonName && (
                  <p className="text-xs text-red-600 mt-1">{errors.salonName}</p>
                )}
              </div>

              {/* Operating Status */}
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-700 mb-1.5">
                  Salon Facility State
                </label>
                <select
                  value={settings.operatingState || 'open'}
                  onChange={(e) => setSettings({ ...settings, operatingState: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                >
                  <option value="open">Open (Accepting Appointments & Walk-ins)</option>
                  <option value="closed_renovation">Temporarily Closed (Renovations / Private Event)</option>
                  <option value="limited">Limited Capacity (Select Hours)</option>
                </select>
              </div>

              {/* Contact Phone */}
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-700 mb-1.5">
                  Contact Phone Number *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={settings.phone || ''}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    className="w-full pl-9 pr-3.5 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  />
                </div>
                {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
              </div>

              {/* Concierge Email */}
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-700 mb-1.5">
                  Concierge / Support Email *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={settings.email || ''}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                    className="w-full pl-9 pr-3.5 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  />
                </div>
                {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
              </div>

              {/* Physical Address */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold uppercase text-stone-700 mb-1.5">
                  Salon Suite & Physical Address *
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <textarea
                    rows={2}
                    value={settings.address || ''}
                    onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                    className="w-full pl-9 pr-3.5 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  />
                </div>
                {errors.address && <p className="text-xs text-red-600 mt-1">{errors.address}</p>}
              </div>

              {/* Timezone */}
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-700 mb-1.5">
                  Operating Timezone
                </label>
                <select
                  value={settings.timezone || 'Asia/Kolkata'}
                  onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST +4:00)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                </select>
              </div>

              {/* Currency */}
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-700 mb-1.5">
                  Currency Symbol & Code
                </label>
                <select
                  value={settings.currency || 'INR (₹)'}
                  onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                >
                  <option value="INR (₹)">INR (₹) - Indian Rupee</option>
                  <option value="AED (د.إ)">AED (د.إ) - UAE Dirham</option>
                  <option value="USD ($)">USD ($) - US Dollar</option>
                  <option value="GBP (£)">GBP (£) - British Pound</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 2: Operating Hours */}
      {activeTab === 'hours' && (
        <Card>
          <CardHeader className="p-5 border-b border-stone-100 flex flex-row items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-stone-900">
                Weekly Operating Schedule
              </h2>
              <p className="text-xs font-medium text-stone-500 mt-0.5">
                Defines when time slots are generated and when the salon is open for guest appointments.
              </p>
            </div>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className="divide-y divide-stone-100">
              {DAYS_OF_WEEK.map((day) => {
                const dayConfig = settings.workingHours?.[day] || {
                  open: '09:00',
                  close: '20:00',
                  isOpen: true,
                };
                return (
                  <div
                    key={day}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="w-32">
                      <span className="capitalize font-semibold text-sm text-stone-900">
                        {day}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleToggleDayOpen(day)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                          dayConfig.isOpen
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-stone-200 text-stone-600'
                        }`}
                      >
                        {dayConfig.isOpen ? 'Open for Bookings' : 'Closed'}
                      </button>

                      {dayConfig.isOpen ? (
                        <div className="flex items-center gap-2 text-sm text-stone-700">
                          <input
                            type="time"
                            value={dayConfig.open}
                            onChange={(e) => handleDayTimeChange(day, 'open', e.target.value)}
                            aria-label={`${day} opening time`}
                            className="px-2.5 py-1 text-sm bg-stone-50 border border-stone-200 rounded-md font-mono"
                          />
                          <span className="text-stone-400">to</span>
                          <input
                            type="time"
                            value={dayConfig.close}
                            onChange={(e) => handleDayTimeChange(day, 'close', e.target.value)}
                            aria-label={`${day} closing time`}
                            className="px-2.5 py-1 text-sm bg-stone-50 border border-stone-200 rounded-md font-mono"
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-stone-400 font-medium italic">
                          No appointments scheduled on this day.
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Booking Engine Rules */}
      {activeTab === 'booking_rules' && (
        <Card>
          <CardHeader className="p-5 border-b border-stone-100">
            <h2 className="text-base font-semibold text-stone-900">
              Booking Engine Parameters
            </h2>
            <p className="text-xs font-medium text-stone-500 mt-0.5">
              Control customer booking windows, buffer duration, and scheduling availability limits.
            </p>
          </CardHeader>
          <CardContent className="p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Default Slot Duration */}
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-700 mb-1.5">
                  Default Appointment Duration (Minutes)
                </label>
                <select
                  value={settings.slotDurationMinutes || 60}
                  onChange={(e) =>
                    setSettings({ ...settings, slotDurationMinutes: Number(e.target.value) })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                >
                  <option value={30}>30 Minutes (Express treatments)</option>
                  <option value={60}>60 Minutes (Standard signature suite)</option>
                  <option value={90}>90 Minutes (Comprehensive styling)</option>
                  <option value={120}>120 Minutes (Spa & bridal packages)</option>
                </select>
                <p className="text-[11px] text-stone-500 mt-1">
                  Individual services can override this duration in the Services CMS.
                </p>
              </div>

              {/* Advance Booking Window */}
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-700 mb-1.5">
                  Advance Booking Window (Days Ahead)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={settings.bookingAdvanceDays || 30}
                  onChange={(e) =>
                    setSettings({ ...settings, bookingAdvanceDays: Number(e.target.value) })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                />
                <p className="text-[11px] text-stone-500 mt-1">
                  How far in advance customers are permitted to reserve salon suites.
                </p>
              </div>

              {/* Cancellation Policy Hours */}
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-700 mb-1.5">
                  Free Cancellation Notice Window (Hours)
                </label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={settings.cancellationNoticeHours || 24}
                  onChange={(e) =>
                    setSettings({ ...settings, cancellationNoticeHours: Number(e.target.value) })
                  }
                  className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                />
                <p className="text-[11px] text-stone-500 mt-1">
                  Minimum advance notice needed for refund eligibility before appointment time.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 4: Financial & Policies */}
      {activeTab === 'policies' && (
        <Card>
          <CardHeader className="p-5 border-b border-stone-100">
            <h2 className="text-base font-semibold text-stone-900">
              Taxation & Salon Operational Policies
            </h2>
            <p className="text-xs font-medium text-stone-500 mt-0.5">
              Authoritative financial rates and guest policies.
            </p>
          </CardHeader>
          <CardContent className="p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Tax Rate */}
              <div>
                <label className="block text-xs font-semibold uppercase text-stone-700 mb-1.5">
                  GST / Sales Tax Percentage (%)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={settings.taxRatePercent ?? 18}
                    onChange={(e) =>
                      setSettings({ ...settings, taxRatePercent: Number(e.target.value) })
                    }
                    className="w-full px-3.5 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg text-stone-900 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  />
                </div>
                <p className="text-[11px] text-stone-500 mt-1">
                  Standard luxury salon tax rate applied at checkout or itemized on invoices.
                </p>
              </div>

              {/* Status Indicator */}
              <div className="bg-stone-50 rounded-xl p-4 border border-stone-200/80 flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-xs text-stone-600 leading-relaxed">
                  <strong className="font-semibold text-stone-900">Shared Backend Notice:</strong>{' '}
                  Changes made here are stored in <code className="font-mono bg-white px-1 py-0.5 rounded border border-stone-200 text-stone-800">settings/salon</code> and are shared with the customer booking application and Cloud Functions.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
