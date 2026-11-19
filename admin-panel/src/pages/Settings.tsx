import { errorView } from '@/lib/caughtError';
import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Truck,
  Clock,
  Calendar,
  Plus,
  Edit,
  Trash2,
  Save,
  DollarSign,
  Monitor,
  MessageCircle,
  Image,
  ImagePlus,
  Sparkles,
  Ticket,
  Smartphone,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { settingsService } from '@/services/settings.service';
import { WhatsAppOrderSettingsPanel } from '@/components/settings/WhatsAppOrderSettingsPanel';
import { BannerSettingsPanel } from '@/components/settings/BannerSettingsPanel';
import { BusinessHoursSettingsPanel } from '@/components/settings/BusinessHoursSettingsPanel';
import type { DeliverySettings, TimeSlot } from '@/types';
import toast from 'react-hot-toast';
import { useCityContext } from '@/context/CityContext';
import { useAuthContext } from '@/context/AuthContext';
import {
  canUpdateSettingsTab,
  canViewSettingsTab,
  canViewWhatsappSettingsTab,
  canUpdateWhatsappSettings,
  canViewBrandSettingsTab,
  canUpdateBrandLogo,
  canViewFaviconSettingsTab,
  canUpdateFavicon,
  visibleSettingsTabs,
  type SettingsTabId,
} from '@/lib/settingsPermissions';
import { BrandLogoSettingsPanel } from '@/components/settings/BrandLogoSettingsPanel';
import { BrandFaviconSettingsPanel } from '@/components/settings/BrandFaviconSettingsPanel';
import { HeroImageSettingsPanel } from '@/components/settings/HeroImageSettingsPanel';
import { CouponsSettingsPanel } from '@/components/settings/CouponsSettingsPanel';
import { AppWidgetSettingsPanel } from '@/components/settings/AppWidgetSettingsPanel';
import { AttaChargesSettingsPanel } from '@/components/settings/AttaChargesSettingsPanel';

interface FormErrors {
  [key: string]: string;
}

export const Settings: React.FC = () => {
  const queryClient = useQueryClient();
  const { selectedCity, selectedCityId } = useCityContext();
  const { user } = useAuthContext();
  const permissions = user?.permissions;
  const role = user?.role;
  const baseTabs = useMemo(() => visibleSettingsTabs(permissions, role), [permissions, role]);
  const showBrandTab = canViewBrandSettingsTab(permissions, role);
  const showFaviconTab = canViewFaviconSettingsTab(permissions, role);
  const canEditBrandLogo = canUpdateBrandLogo(role);
  const canEditFavicon = canUpdateFavicon(role);
  const showWhatsappTab = canViewWhatsappSettingsTab(permissions, role);
  // useMemo: the useEffect below keys on this — a fresh array identity every
  // render would re-run it needlessly.
  const allowedTabs: SettingsTabId[] = useMemo(
    () =>
      showWhatsappTab
        ? baseTabs.includes('whatsapp')
          ? baseTabs
          : [...baseTabs, 'whatsapp']
        : baseTabs,
    [showWhatsappTab, baseTabs]
  );
  const [activeTab, setActiveTab] = useState<SettingsTabId>('delivery');
  // The tab actually shown: never one the role may not open — the first
  // render used to mount Delivery for everyone (refused calls, red pop-ups).
  const shownTab: SettingsTabId | undefined = allowedTabs.includes(activeTab) ? activeTab : allowedTabs[0];
  const tabAllowed = (tab: SettingsTabId) => allowedTabs.includes(tab);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (allowedTabs.length === 0) return;
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]);
    }
  }, [allowedTabs, activeTab]);

  // Business hours and the app widget are one setting for every city — the
  // server lets only the super admin change them (B28).
  const canUpdate = (tab: SettingsTabId) =>
    (tab === 'business' || tab === 'appwidget') && role !== 'super_admin' ? false : canUpdateSettingsTab(permissions, tab);
  const canEditWhatsapp = canUpdateWhatsappSettings(permissions, role);

  // Delivery Settings State
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings>({
    baseCharge: 50,
    freeDeliveryThreshold: 500,
    expressCharge: 100,
    urgentCharge: 0,
    urgentEta: '',
    slotCutoffPercent: 60,
  });

  // Time Slots State
  const [isTimeSlotModalOpen, setIsTimeSlotModalOpen] = useState(false);
  const [editingTimeSlot, setEditingTimeSlot] = useState<TimeSlot | null>(null);
  // maxOrders as text: empty = no limit (owner rule — a slot is unlimited
  // unless the admin sets a cap on it).
  const [timeSlotForm, setTimeSlotForm] = useState({
    startTime: '09:00',
    endTime: '12:00',
    maxOrders: '',
    isActive: true,
    isFreeDeliverySlot: false,
  });


  // Fetch Settings
  // Delivery prices are per city — refetch when the admin switches city.
  const { data: settings } = useQuery({
    queryKey: ['settings', selectedCityId],
    queryFn: () => settingsService.getSettings(),
    enabled: tabAllowed('delivery'),
  });

  // Fetch Time Slots
  const { data: timeSlots, isLoading: isLoadingTimeSlots } = useQuery({
    queryKey: ['timeSlots'],
    queryFn: () => settingsService.getTimeSlots(),
    enabled: tabAllowed('timeslots'),
  });


  // Update local state when data is fetched
  useEffect(() => {
    if (settings?.delivery) {
      setDeliverySettings(settings.delivery);
    }
  }, [settings]);


  // Mutations
  const updateDeliveryMutation = useMutation({
    mutationFn: (d: DeliverySettings) => {
      // Only the editable values go to the server.
      const { scope: _scope, cityId: _cityId, cityName: _cityName, cityOverride: _cityOverride, ...values } = d;
      return settingsService.updateDeliverySettings(values);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(
        settings?.delivery?.scope === 'city'
          ? `Delivery settings saved for ${settings?.delivery?.cityName || 'this city'}`
          : 'Default delivery settings saved'
      );
    },
  });

  const resetDeliveryMutation = useMutation({
    mutationFn: settingsService.resetDeliveryToGlobal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('This city now uses the default delivery settings');
    },
    onError: (e: unknown) => toast.error(errorView(e)?.message || 'Failed to reset'),
  });

  const createTimeSlotMutation = useMutation({
    mutationFn: settingsService.createTimeSlot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeSlots'] });
      toast.success('Time slot created successfully');
      closeTimeSlotModal();
    },
  });

  const updateTimeSlotMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TimeSlot> }) =>
      settingsService.updateTimeSlot(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeSlots'] });
      toast.success('Time slot updated successfully');
      closeTimeSlotModal();
    },
  });

  const deleteTimeSlotMutation = useMutation({
    mutationFn: settingsService.deleteTimeSlot,
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: ['timeSlots'] });
      toast.success(message || 'Time slot deleted', { duration: 6000 });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not delete the time slot'),
  });



  // Validation Functions
  const validateDeliverySettings = (): boolean => {
    const errors: FormErrors = {};
    if (deliverySettings.baseCharge < 0) {
      errors.baseCharge = 'Base charge cannot be negative';
    }
    if (deliverySettings.freeDeliveryThreshold < 0) {
      errors.freeDeliveryThreshold = 'Free delivery threshold cannot be negative';
    }
    if (deliverySettings.expressCharge < 0) {
      errors.expressCharge = 'Express charge cannot be negative';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateTimeSlot = (): boolean => {
    const errors: FormErrors = {};
    if (!timeSlotForm.startTime) {
      errors.startTime = 'Start time is required';
    }
    if (!timeSlotForm.endTime) {
      errors.endTime = 'End time is required';
    }
    if (timeSlotForm.startTime >= timeSlotForm.endTime) {
      errors.endTime = 'End time must be after start time';
    }
    if (timeSlotForm.maxOrders.trim() !== '') {
      const n = Number(timeSlotForm.maxOrders);
      if (!Number.isInteger(n) || n < 1) {
        errors.maxOrders = 'Enter a whole number of at least 1, or leave empty for no limit';
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handlers
  const handleDeliverySettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateDeliverySettings()) {
      updateDeliveryMutation.mutate(deliverySettings);
    }
  };

  const openAddTimeSlotModal = () => {
    setEditingTimeSlot(null);
    setTimeSlotForm({
      startTime: '09:00',
      endTime: '12:00',
      maxOrders: '',
      isActive: true,
      isFreeDeliverySlot: false,
    });
    setFormErrors({});
    setIsTimeSlotModalOpen(true);
  };

  const openEditTimeSlotModal = (timeSlot: TimeSlot) => {
    setEditingTimeSlot(timeSlot);
    setTimeSlotForm({
      startTime: timeSlot.startTime,
      endTime: timeSlot.endTime,
      maxOrders: timeSlot.maxOrders == null ? '' : String(timeSlot.maxOrders),
      isActive: timeSlot.isActive ?? true,
      isFreeDeliverySlot: timeSlot.isFreeDeliverySlot || false,
    });
    setFormErrors({});
    setIsTimeSlotModalOpen(true);
  };

  const closeTimeSlotModal = () => {
    setIsTimeSlotModalOpen(false);
    setEditingTimeSlot(null);
    setFormErrors({});
  };

  const handleTimeSlotSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateTimeSlot()) {
      const payload = {
        ...timeSlotForm,
        maxOrders: timeSlotForm.maxOrders.trim() === '' ? null : Number(timeSlotForm.maxOrders),
      };
      if (editingTimeSlot) {
        updateTimeSlotMutation.mutate({ id: editingTimeSlot.id, data: payload });
      } else {
        createTimeSlotMutation.mutate(payload);
      }
    }
  };

  const handleDeleteTimeSlot = (id: string) => {
    if (confirm('Are you sure you want to delete this time slot?')) {
      deleteTimeSlotMutation.mutate(id);
    }
  };


  // Render Tabs
  const renderDeliverySettings = () => (
    <div className="space-y-6">
    <Card>
      <form onSubmit={handleDeliverySettingsSubmit} className="space-y-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Truck className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-900">Delivery Settings</h3>
            <p className="text-sm text-gray-500">
              {settings?.delivery?.scope === 'city' ? (
                <>
                  Prices for <strong>{settings?.delivery?.cityName || selectedCity?.name || 'this city'}</strong>
                  {settings?.delivery?.cityOverride ? ' (own values)' : ' — currently using the default for all cities; saving here gives this city its own values'}
                </>
              ) : (
                'Default prices for every city that has no values of its own'
              )}
            </p>
          </div>
          {settings?.delivery?.scope === 'city' && settings?.delivery?.cityOverride && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              isLoading={resetDeliveryMutation.isPending}
              onClick={() => {
                if (confirm('Remove this city\'s own delivery prices and use the default for all cities?')) resetDeliveryMutation.mutate();
              }}
            >
              Use default
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Input
            label="Base Delivery Charge (Rs.)"
            type="number"
            value={deliverySettings.baseCharge}
            onChange={(e) =>
              setDeliverySettings({ ...deliverySettings, baseCharge: parseFloat(e.target.value) || 0 })
            }
            error={formErrors.baseCharge}
            leftIcon={<DollarSign className="w-4 h-4 text-gray-400" />}
            min={0}
            required
          />
          <Input
            label="Free Delivery Threshold (Rs.)"
            type="number"
            value={deliverySettings.freeDeliveryThreshold}
            onChange={(e) =>
              setDeliverySettings({
                ...deliverySettings,
                freeDeliveryThreshold: parseFloat(e.target.value) || 0,
              })
            }
            error={formErrors.freeDeliveryThreshold}
            leftIcon={<DollarSign className="w-4 h-4 text-gray-400" />}
            min={0}
            helperText="Orders of this amount or more get free delivery"
            required
          />
          <Input
            label="Express Delivery Charge (Rs.)"
            type="number"
            value={deliverySettings.expressCharge}
            onChange={(e) =>
              setDeliverySettings({
                ...deliverySettings,
                expressCharge: parseFloat(e.target.value) || 0,
              })
            }
            error={formErrors.expressCharge}
            leftIcon={<DollarSign className="w-4 h-4 text-gray-400" />}
            min={0}
            helperText="Additional charge for express delivery"
            required
          />
          <Input
            label="Slot cutoff (% elapsed)"
            type="number"
            value={deliverySettings.slotCutoffPercent ?? 60}
            onChange={(e) =>
              setDeliverySettings({
                ...deliverySettings,
                slotCutoffPercent: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
              })
            }
            min={0}
            max={100}
            helperText="A today-slot locks once this % of its window has passed (default 60)"
          />
        </div>

        {role === 'super_admin' && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
            <h4 className="text-sm font-semibold text-amber-900 mb-1">
              Urgent (on-demand) delivery
            </h4>
            <p className="text-xs text-amber-700 mb-3">
              Super-admin only. A flat rate the customer can choose instead of a time slot.
              Urgent orders ignore the free-delivery threshold, free slots and coupons.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Urgent Delivery Charge (Rs.)"
                type="number"
                value={deliverySettings.urgentCharge ?? 0}
                onChange={(e) =>
                  setDeliverySettings({
                    ...deliverySettings,
                    urgentCharge: parseFloat(e.target.value) || 0,
                  })
                }
                leftIcon={<DollarSign className="w-4 h-4 text-gray-400" />}
                min={0}
                helperText="Set 0 to disable urgent delivery"
              />
              <Input
                label="Estimated Time"
                value={deliverySettings.urgentEta ?? ''}
                onChange={(e) =>
                  setDeliverySettings({ ...deliverySettings, urgentEta: e.target.value })
                }
                placeholder="e.g. 30–45 minutes"
                helperText="Shown to the customer at checkout"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            isLoading={updateDeliveryMutation.isPending}
            leftIcon={<Save className="w-4 h-4" />}
            disabled={!canUpdate('delivery')}
          >
            Save Delivery Settings
          </Button>
        </div>
      </form>
    </Card>
    <AttaChargesSettingsPanel />
    </div>
  );

  const renderTimeSlots = () => (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Clock className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">Delivery Time Slots</h3>
              <p className="text-sm text-gray-500">Manage available delivery time slots</p>
            </div>
          </div>
          <Button
            onClick={openAddTimeSlotModal}
            leftIcon={<Plus className="w-4 h-4" />}
            disabled={!canUpdate('timeslots')}
          >
            Add Time Slot
          </Button>
        </div>

        {isLoadingTimeSlots ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse h-16 bg-gray-100 rounded-lg" />
            ))}
          </div>
        ) : !timeSlots || timeSlots.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No time slots configured</p>
            <p className="text-sm text-gray-400">Add time slots for customers to choose from</p>
          </div>
        ) : (
          <div className="space-y-3">
            {timeSlots.map((slot) => (
              <div
                key={slot.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Clock className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {slot.startTime} - {slot.endTime}
                    </p>
                    <p className="text-sm text-gray-500">
                      {slot.maxOrders == null ? 'No order limit' : `Max ${slot.maxOrders} orders`}
                      {/* Every city has its own slots — named when all cities are shown (super admin). */}
                      {slot.cityName ? ` · ${slot.cityName}` : ''}
                    </p>
                  </div>
                  <Badge variant={slot.isActive ? 'success' : 'default'} size="sm">
                    {slot.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  {slot.isFreeDeliverySlot && (
                    <Badge variant="success" size="sm">
                      Free Delivery
                    </Badge>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => openEditTimeSlotModal(slot)}
                    disabled={!canUpdate('timeslots')}
                    title={canUpdate('timeslots') ? 'Edit time slot' : 'You do not have permission to manage time slots'}
                    className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteTimeSlot(slot.id)}
                    disabled={!canUpdate('timeslots')}
                    title={canUpdate('timeslots') ? 'Delete time slot' : 'You do not have permission to manage time slots'}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );


  const renderWhatsappTab = () => (
    <WhatsAppOrderSettingsPanel canEdit={canEditWhatsapp} />
  );

  const hasAnySettingsAccess = allowedTabs.length > 0;

  return (
    <Layout title="Settings" subtitle="Manage application settings and configuration">
      {!hasAnySettingsAccess ? (
        <Card>
          <div className="p-8 text-center text-gray-600 text-sm">
            You do not have permission to view any settings sections. Ask a super admin to assign
            settings permissions to your role.
          </div>
        </Card>
      ) : (
      <>
      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-lg mb-6">
        {canViewSettingsTab(permissions, 'delivery') && (
        <button
          onClick={() => setActiveTab('delivery')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'delivery'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Delivery</span>
        </button>
        )}
        {canViewSettingsTab(permissions, 'timeslots') && (
        <button
          onClick={() => setActiveTab('timeslots')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'timeslots'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Time Slots</span>
        </button>
        )}
        {canViewSettingsTab(permissions, 'business') && (
        <button
          onClick={() => setActiveTab('business')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'business'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Business Hours</span>
        </button>
        )}
        {canViewSettingsTab(permissions, 'banner') && (
        <button
          onClick={() => setActiveTab('banner')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'banner'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Monitor className="w-4 h-4" />
          <span>Website Banner</span>
        </button>
        )}
        {canViewSettingsTab(permissions, 'hero') && (
        <button
          onClick={() => setActiveTab('hero')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'hero'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ImagePlus className="w-4 h-4" />
          <span>Hero Image</span>
        </button>
        )}
        {canViewSettingsTab(permissions, 'coupons') && (
        <button
          onClick={() => setActiveTab('coupons')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'coupons'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Ticket className="w-4 h-4" />
          <span>Coupons</span>
        </button>
        )}
        {showBrandTab && (
        <button
          onClick={() => setActiveTab('brand')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'brand'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Image className="w-4 h-4" />
          <span>Brand Logo</span>
        </button>
        )}
        {showFaviconTab && (
        <button
          onClick={() => setActiveTab('favicon')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'favicon'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Favicon</span>
        </button>
        )}
        {showWhatsappTab && (
        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'whatsapp'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <MessageCircle className="w-4 h-4" />
          <span>WhatsApp</span>
        </button>
        )}
        {canViewSettingsTab(permissions, 'appwidget') && (
        <button
          onClick={() => setActiveTab('appwidget')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'appwidget'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>App Widget</span>
        </button>
        )}
      </div>

      {/* Tab Content */}
      {shownTab === 'delivery' && renderDeliverySettings()}
      {shownTab === 'timeslots' && renderTimeSlots()}
      {shownTab === 'business' && <BusinessHoursSettingsPanel canEdit={canUpdate('business')} />}
      {shownTab === 'banner' && <BannerSettingsPanel canEdit={canUpdate('banner')} />}
      {shownTab === 'hero' && (
        <HeroImageSettingsPanel canEdit={canUpdate('hero')} />
      )}
      {shownTab === 'coupons' && (
        <CouponsSettingsPanel canEdit={canUpdate('coupons')} />
      )}
      {shownTab === 'brand' && (
        <BrandLogoSettingsPanel canEdit={canEditBrandLogo} />
      )}
      {shownTab === 'favicon' && (
        <BrandFaviconSettingsPanel canEdit={canEditFavicon} />
      )}
      {shownTab === 'whatsapp' && renderWhatsappTab()}
      {shownTab === 'appwidget' && (
        <AppWidgetSettingsPanel canEdit={canUpdate('appwidget')} />
      )}

      {/* Time Slot Modal */}
      <Modal
        isOpen={isTimeSlotModalOpen}
        onClose={closeTimeSlotModal}
        title={editingTimeSlot ? 'Edit Time Slot' : 'Add Time Slot'}
        footer={
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={closeTimeSlotModal}>
              Cancel
            </Button>
            <Button
              onClick={handleTimeSlotSubmit}
              isLoading={createTimeSlotMutation.isPending || updateTimeSlotMutation.isPending}
            >
              {editingTimeSlot ? 'Update' : 'Create'}
            </Button>
          </div>
        }
      >
        <form className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start Time"
              type="time"
              value={timeSlotForm.startTime}
              onChange={(e) => setTimeSlotForm({ ...timeSlotForm, startTime: e.target.value })}
              error={formErrors.startTime}
              required
            />
            <Input
              label="End Time"
              type="time"
              value={timeSlotForm.endTime}
              onChange={(e) => setTimeSlotForm({ ...timeSlotForm, endTime: e.target.value })}
              error={formErrors.endTime}
              required
            />
          </div>
          <Input
            label="Maximum orders per day (optional)"
            type="number"
            placeholder="No limit"
            value={timeSlotForm.maxOrders}
            onChange={(e) => setTimeSlotForm({ ...timeSlotForm, maxOrders: e.target.value })}
            error={formErrors.maxOrders}
            helperText="Leave empty for unlimited orders in this slot."
            min={1}
          />
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={timeSlotForm.isActive}
              onChange={(e) => setTimeSlotForm({ ...timeSlotForm, isActive: e.target.checked })}
              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">Active</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={timeSlotForm.isFreeDeliverySlot}
              onChange={(e) => setTimeSlotForm({ ...timeSlotForm, isFreeDeliverySlot: e.target.checked })}
              className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
            />
            <span className="text-sm text-gray-700">Free Delivery in this slot</span>
          </label>
        </form>
      </Modal>
      </>
      )}
    </Layout>
  );
};
