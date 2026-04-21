import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings as SettingsIcon,
  Truck,
  Clock,
  Calendar,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Check,
  MapPin,
  DollarSign,
  AlertCircle,
  Monitor,
  Phone,
  Type,
  RotateCcw,
  Eye,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { settingsService } from '@/services/settings.service';
import { bannerService } from '@/services/banner.service';
import type { DeliverySettings, TimeSlot, BusinessHours } from '@/types';
import toast from 'react-hot-toast';

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

interface FormErrors {
  [key: string]: string;
}

export const Settings: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'delivery' | 'timeslots' | 'business' | 'banner'>('delivery');
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  // Delivery Settings State
  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings>({
    baseCharge: 50,
    freeDeliveryThreshold: 500,
    expressCharge: 100,
  });

  // Time Slots State
  const [isTimeSlotModalOpen, setIsTimeSlotModalOpen] = useState(false);
  const [editingTimeSlot, setEditingTimeSlot] = useState<TimeSlot | null>(null);
  const [timeSlotForm, setTimeSlotForm] = useState({
    startTime: '09:00',
    endTime: '12:00',
    maxOrders: 20,
    isActive: true,
    isFreeDeliverySlot: false,
  });

  // Business Hours State
  const [businessHours, setBusinessHours] = useState<BusinessHours[]>([]);

  // Banner State
  const [bannerForm, setBannerForm] = useState({
    bannerLeftText: '',
    bannerMiddleText: '',
    bannerRightTextEn: '',
    bannerRightTextUr: '',
  });

  // Fetch Settings
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsService.getSettings(),
  });

  // Fetch Time Slots
  const { data: timeSlots, isLoading: isLoadingTimeSlots } = useQuery({
    queryKey: ['timeSlots'],
    queryFn: () => settingsService.getTimeSlots(),
  });

  // Fetch Business Hours
  const { data: businessHoursData, isLoading: isLoadingBusinessHours } = useQuery({
    queryKey: ['businessHours'],
    queryFn: () => settingsService.getBusinessHours(),
  });

  // Fetch Banner Settings
  const { data: bannerSettings } = useQuery({
    queryKey: ['bannerSettings'],
    queryFn: () => bannerService.getBannerSettings(),
  });

  // Update local state when data is fetched
  useEffect(() => {
    if (settings?.delivery) {
      setDeliverySettings(settings.delivery);
    }
  }, [settings]);

  useEffect(() => {
    if (businessHoursData) {
      setBusinessHours(businessHoursData);
    } else if (!isLoadingBusinessHours) {
      // Initialize default business hours if none exist
      setBusinessHours(
        DAYS_OF_WEEK.map((day) => ({
          day,
          open: '09:00',
          close: '21:00',
          isOpen: day !== 'Sunday',
        }))
      );
    }
  }, [businessHoursData, isLoadingBusinessHours]);

  useEffect(() => {
    if (bannerSettings) {
      setBannerForm({
        bannerLeftText: bannerSettings.bannerLeftText || '',
        bannerMiddleText: bannerSettings.bannerMiddleText || '',
        bannerRightTextEn: bannerSettings.bannerRightTextEn || '',
        bannerRightTextUr: bannerSettings.bannerRightTextUr || '',
      });
    }
  }, [bannerSettings]);

  // Mutations
  const updateDeliveryMutation = useMutation({
    mutationFn: settingsService.updateDeliverySettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Delivery settings updated successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update delivery settings');
    },
  });

  const createTimeSlotMutation = useMutation({
    mutationFn: settingsService.createTimeSlot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeSlots'] });
      toast.success('Time slot created successfully');
      closeTimeSlotModal();
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to create time slot');
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
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update time slot');
    },
  });

  const deleteTimeSlotMutation = useMutation({
    mutationFn: settingsService.deleteTimeSlot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeSlots'] });
      toast.success('Time slot deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to delete time slot');
    },
  });

  const updateBusinessHoursMutation = useMutation({
    mutationFn: settingsService.updateBusinessHours,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['businessHours'] });
      toast.success('Business hours updated successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update business hours');
    },
  });

  const updateBannerMutation = useMutation({
    mutationFn: (data: typeof bannerForm) => bannerService.updateBannerSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bannerSettings'] });
      toast.success('Banner settings updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update banner settings');
    },
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
    if (timeSlotForm.maxOrders < 1) {
      errors.maxOrders = 'Max orders must be at least 1';
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
      maxOrders: 20,
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
      maxOrders: timeSlot.maxOrders,
      isActive: timeSlot.isActive,
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
      if (editingTimeSlot) {
        updateTimeSlotMutation.mutate({ id: editingTimeSlot.id, data: timeSlotForm });
      } else {
        createTimeSlotMutation.mutate(timeSlotForm);
      }
    }
  };

  const handleDeleteTimeSlot = (id: string) => {
    if (confirm('Are you sure you want to delete this time slot?')) {
      deleteTimeSlotMutation.mutate(id);
    }
  };

  const handleBusinessHoursChange = (index: number, field: keyof BusinessHours, value: any) => {
    const updated = [...businessHours];
    updated[index] = { ...updated[index], [field]: value };
    setBusinessHours(updated);
  };

  const handleSaveBusinessHours = () => {
    updateBusinessHoursMutation.mutate(businessHours);
  };

  // Render Tabs
  const renderDeliverySettings = () => (
    <Card>
      <form onSubmit={handleDeliverySettingsSubmit} className="space-y-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Truck className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-900">Delivery Settings</h3>
            <p className="text-sm text-gray-500">Configure delivery charges and thresholds</p>
          </div>
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
            helperText="Orders above this amount get free delivery"
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
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            isLoading={updateDeliveryMutation.isPending}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Save Delivery Settings
          </Button>
        </div>
      </form>
    </Card>
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
          <Button onClick={openAddTimeSlotModal} leftIcon={<Plus className="w-4 h-4" />}>
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
                    <p className="text-sm text-gray-500">Max {slot.maxOrders} orders</p>
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
                    className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteTimeSlot(slot.id)}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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

  const renderBusinessHours = () => (
    <Card>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Calendar className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-gray-900">Business Hours</h3>
            <p className="text-sm text-gray-500">Set your store operating hours</p>
          </div>
        </div>
        <Button
          onClick={handleSaveBusinessHours}
          isLoading={updateBusinessHoursMutation.isPending}
          leftIcon={<Save className="w-4 h-4" />}
        >
          Save Business Hours
        </Button>
      </div>

      {isLoadingBusinessHours ? (
        <div className="space-y-3">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="animate-pulse h-16 bg-gray-100 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {businessHours.map((hours, index) => (
            <div
              key={hours.day}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hours.isOpen}
                    onChange={(e) =>
                      handleBusinessHoursChange(index, 'isOpen', e.target.checked)
                    }
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <span className="font-medium text-gray-900 w-24">{hours.day}</span>
                </label>
              </div>

              <div className="flex items-center space-x-4">
                {hours.isOpen ? (
                  <>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">Open</span>
                      <input
                        type="time"
                        value={hours.open}
                        onChange={(e) =>
                          handleBusinessHoursChange(index, 'open', e.target.value)
                        }
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">Close</span>
                      <input
                        type="time"
                        value={hours.close}
                        onChange={(e) =>
                          handleBusinessHoursChange(index, 'close', e.target.value)
                        }
                        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </>
                ) : (
                  <Badge variant="default" size="sm">
                    Closed
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  const renderBanner = () => (
    <div className="max-w-4xl space-y-6">
      {/* Live Preview */}
      <Card>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-5 h-5 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Live Preview</h3>
          </div>
          <div className="bg-green-700 text-white text-xs py-2 px-4 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {bannerForm.bannerLeftText || 'Left text'}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {bannerForm.bannerMiddleText || 'Middle text'}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span>{bannerForm.bannerRightTextEn || 'English text'}</span>
              <span dir="rtl">{bannerForm.bannerRightTextUr || 'اردو متن'}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Edit Form */}
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateBannerMutation.mutate(bannerForm);
          }}
          className="space-y-6"
        >
          <div className="flex items-center space-x-3 mb-6">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Monitor className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">Website Banner</h3>
              <p className="text-sm text-gray-500">Edit the text shown in the top banner strip of the website</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Input
                label="Left Side Text (Phone Number)"
                value={bannerForm.bannerLeftText}
                onChange={(e) => setBannerForm(prev => ({ ...prev, bannerLeftText: e.target.value }))}
                placeholder="e.g. 0300-1234567"
                leftIcon={<Phone className="w-4 h-4 text-gray-400" />}
              />
              <p className="mt-1 text-xs text-gray-400">Shown with a phone icon on the left side</p>
            </div>

            <div>
              <Input
                label="Middle Text"
                value={bannerForm.bannerMiddleText}
                onChange={(e) => setBannerForm(prev => ({ ...prev, bannerMiddleText: e.target.value }))}
                placeholder="e.g. Free Delivery 10AM-2PM"
                leftIcon={<MapPin className="w-4 h-4 text-gray-400" />}
              />
              <p className="mt-1 text-xs text-gray-400">Shown with a location icon (hidden on mobile)</p>
            </div>

            <div>
              <Input
                label="Right Side Text (English)"
                value={bannerForm.bannerRightTextEn}
                onChange={(e) => setBannerForm(prev => ({ ...prev, bannerRightTextEn: e.target.value }))}
                placeholder="e.g. Fresh Sabzi at Your Doorstep"
                leftIcon={<Type className="w-4 h-4 text-gray-400" />}
              />
              <p className="mt-1 text-xs text-gray-400">English text on the right (hidden on mobile)</p>
            </div>

            <div>
              <Input
                label="Right Side Text (Urdu)"
                value={bannerForm.bannerRightTextUr}
                onChange={(e) => setBannerForm(prev => ({ ...prev, bannerRightTextUr: e.target.value }))}
                placeholder="تازہ سبزیاں آپ کے دروازے پر"
                dir="rtl"
                leftIcon={<Type className="w-4 h-4 text-gray-400" />}
              />
              <p className="mt-1 text-xs text-gray-400">Urdu text always visible on the right side</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (bannerSettings) {
                  setBannerForm({
                    bannerLeftText: bannerSettings.bannerLeftText || '',
                    bannerMiddleText: bannerSettings.bannerMiddleText || '',
                    bannerRightTextEn: bannerSettings.bannerRightTextEn || '',
                    bannerRightTextUr: bannerSettings.bannerRightTextUr || '',
                  });
                }
              }}
              leftIcon={<RotateCcw className="w-4 h-4" />}
            >
              Reset
            </Button>
            <Button
              type="submit"
              isLoading={updateBannerMutation.isPending}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Save Banner Settings
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );

  return (
    <Layout title="Settings" subtitle="Manage application settings and configuration">
      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg mb-6">
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
      </div>

      {/* Tab Content */}
      {activeTab === 'delivery' && renderDeliverySettings()}
      {activeTab === 'timeslots' && renderTimeSlots()}
      {activeTab === 'business' && renderBusinessHours()}
      {activeTab === 'banner' && renderBanner()}

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
            label="Maximum Orders"
            type="number"
            value={timeSlotForm.maxOrders}
            onChange={(e) =>
              setTimeSlotForm({ ...timeSlotForm, maxOrders: parseInt(e.target.value) || 0 })
            }
            error={formErrors.maxOrders}
            min={1}
            required
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
    </Layout>
  );
};
