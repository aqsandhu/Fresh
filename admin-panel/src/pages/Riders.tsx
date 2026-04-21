import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Edit,
  Trash2,
  Users,
  Phone,
  Mail,
  CreditCard,
  Bike,
  Car,
  Truck,
  Upload,
  X,
  Search,
  BarChart3,
  DollarSign,
  ArrowLeft,
  Clock,
  Shield,
  Wallet,
  Save,
  Navigation2,
  MapPin,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { LeafletMap } from '@/components/ui/LeafletMap';
import { riderService } from '@/services/rider.service';
import { settingsService } from '@/services/settings.service';
import type { Rider, CreateRiderData, RiderStats } from '@/types';
import { isRequired, isValidPhone, isValidCNIC } from '@/utils/validators';
import { formatCurrency, resolveImageUrl } from '@/utils/formatters';
import toast from 'react-hot-toast';

interface FormErrors {
  [key: string]: string;
}

const VEHICLE_TYPES = [
  { value: 'bike', label: 'Bike' },
  { value: 'car', label: 'Car' },
  { value: 'van', label: 'Van' },
];

const RIDER_STATUS = [
  { value: '', label: 'All Status' },
  { value: 'available', label: 'Available' },
  { value: 'busy', label: 'Busy' },
  { value: 'offline', label: 'Offline' },
  { value: 'on_leave', label: 'On Leave' },
];

const VERIFICATION_STATUS = [
  { value: '', label: 'All' },
  { value: 'verified', label: 'Verified' },
  { value: 'pending', label: 'Pending' },
  { value: 'rejected', label: 'Rejected' },
];

export const Riders: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRider, setEditingRider] = useState<Rider | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('');
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0); // 0=basic, 1=emergency+banking

  // Stats view state
  const [viewStatsRider, setViewStatsRider] = useState<Rider | null>(null);
  const [riderStats, setRiderStats] = useState<RiderStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [deliveryChargesMap, setDeliveryChargesMap] = useState<Record<string, number>>({});
  const [savingCharges, setSavingCharges] = useState(false);

  // Rider location tracking state
  const [trackingRider, setTrackingRider] = useState<Rider | null>(null);
  const [riderLocation, setRiderLocation] = useState<{ latitude: number | null; longitude: number | null; accuracy?: number | null; locationUpdatedAt: string | null; status?: string | null } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [refreshingLocation, setRefreshingLocation] = useState(false);

  const [formData, setFormData] = useState<CreateRiderData>({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    cnic: '',
    vehicleType: 'bike',
    vehicleNumber: '',
    drivingLicenseNumber: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    bankAccountTitle: '',
    bankAccountNumber: '',
    bankName: '',
  });

  const { data: riders, isLoading } = useQuery({
    queryKey: ['riders', { status: statusFilter }],
    queryFn: () => riderService.getRiders(statusFilter || undefined),
  });

  // Fetch time slots for delivery charges
  const { data: timeSlots } = useQuery({
    queryKey: ['timeSlots'],
    queryFn: () => settingsService.getTimeSlots(),
  });

  // Filter riders based on search and verification status
  const filteredRiders = riders?.filter((rider) => {
    const matchesSearch =
      !searchQuery ||
      rider.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      rider.phone.includes(searchQuery) ||
      rider.vehicleNumber.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesVerification =
      !verificationFilter || rider.verificationStatus === verificationFilter;
    
    return matchesSearch && matchesVerification;
  });

  const createMutation = useMutation({
    mutationFn: (data: FormData) => riderService.createRider(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['riders'] });
      toast.success('Rider created successfully');
      closeModal();
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to create rider');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: FormData }) =>
      riderService.updateRider(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['riders'] });
      toast.success('Rider updated successfully');
      closeModal();
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update rider');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: riderService.deleteRider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['riders'] });
      toast.success('Rider deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to delete rider');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      riderService.updateRiderStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['riders'] });
      toast.success('Rider status updated');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update status');
    },
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      riderService.verifyRider(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['riders'] });
      toast.success('Verification updated');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to verify rider');
    },
  });

  const openAddModal = () => {
    setEditingRider(null);
    setSelectedImage(null);
    setImagePreview(null);
    setFormErrors({});
    setActiveTab(0);
    setFormData({
      fullName: '',
      phone: '',
      email: '',
      password: '',
      cnic: '',
      vehicleType: 'bike',
      vehicleNumber: '',
      drivingLicenseNumber: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      bankAccountTitle: '',
      bankAccountNumber: '',
      bankName: '',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (rider: Rider) => {
    setEditingRider(rider);
    setSelectedImage(null);
    setFormErrors({});
    setActiveTab(0);
    setFormData({
      fullName: rider.fullName,
      phone: rider.phone,
      email: rider.email || '',
      password: '',
      cnic: rider.cnic || '',
      vehicleType: rider.vehicleType,
      vehicleNumber: rider.vehicleNumber,
      drivingLicenseNumber: rider.drivingLicenseNumber || '',
      emergencyContactName: rider.emergencyContactName || '',
      emergencyContactPhone: rider.emergencyContactPhone || '',
      bankAccountTitle: rider.bankAccountTitle || '',
      bankAccountNumber: rider.bankAccountNumber || '',
      bankName: rider.bankName || '',
    });
    // Set image preview if rider has an avatar
    setImagePreview(rider.avatarUrl ? resolveImageUrl(rider.avatarUrl) : null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRider(null);
    setSelectedImage(null);
    setImagePreview(null);
    setFormErrors({});
  };

  // Open stats view for a rider
  const openStatsView = async (rider: Rider) => {
    setViewStatsRider(rider);
    setLoadingStats(true);
    try {
      const stats = await riderService.getRiderStats(rider.id);
      setRiderStats(stats);
      const map: Record<string, number> = {};
      (stats.deliveryCharges || []).forEach((c: any) => {
        map[c.timeSlotId] = c.chargePerOrder;
      });
      setDeliveryChargesMap(map);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load stats');
    } finally {
      setLoadingStats(false);
    }
  };

  const closeStatsView = () => {
    setViewStatsRider(null);
    setRiderStats(null);
    setDeliveryChargesMap({});
  };

  const handleSaveDeliveryCharges = async () => {
    if (!viewStatsRider) return;
    setSavingCharges(true);
    try {
      const charges = Object.entries(deliveryChargesMap).map(([timeSlotId, chargePerOrder]) => ({
        timeSlotId,
        chargePerOrder: Number(chargePerOrder),
      }));
      await riderService.setDeliveryCharges(viewStatsRider.id, charges);
      toast.success('Delivery charges saved');
      const stats = await riderService.getRiderStats(viewStatsRider.id);
      setRiderStats(stats);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save charges');
    } finally {
      setSavingCharges(false);
    }
  };

  // Rider location tracking
  const openRiderTracking = async (rider: Rider) => {
    setTrackingRider(rider);
    setLoadingLocation(true);
    try {
      const loc = await riderService.getRiderLocation(rider.id);
      setRiderLocation(loc);
    } catch {
      toast.error('Failed to load rider location');
    } finally {
      setLoadingLocation(false);
    }
  };

  const handleRefreshLocation = async () => {
    if (!trackingRider || refreshingLocation) return;
    setRefreshingLocation(true);
    try {
      const loc = await riderService.getRiderLocation(trackingRider.id);
      setRiderLocation(loc);
    } catch {
      toast.error('Failed to refresh location');
    } finally {
      setRefreshingLocation(false);
    }
  };

  // Auto-refresh rider location every 15 seconds
  React.useEffect(() => {
    if (!trackingRider) return;
    const interval = setInterval(async () => {
      try {
        const loc = await riderService.getRiderLocation(trackingRider.id);
        setRiderLocation(loc);
      } catch { /* silent */ }
    }, 15000);
    return () => clearInterval(interval);
  }, [trackingRider]);

  // Image handling
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image is too large. Max size is 5MB');
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Invalid file type. Please use JPG, PNG or WebP');
      return;
    }

    setSelectedImage(file);

    // Generate preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  // Form Validation
  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    // Full Name - Required
    if (!isRequired(formData.fullName)) {
      errors.fullName = 'Full name is required';
    } else if (formData.fullName.length < 3) {
      errors.fullName = 'Full name must be at least 3 characters';
    }

    // Phone - Required and valid Pakistani phone
    if (!isRequired(formData.phone)) {
      errors.phone = 'Phone number is required';
    } else if (!isValidPhone(formData.phone)) {
      errors.phone = 'Please enter a valid Pakistani phone number (e.g., 03001234567)';
    }

    // Password - Required for new rider, optional for edit
    if (!editingRider && !formData.password) {
      errors.password = 'Password is required for new rider';
    } else if (formData.password && formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }

    // CNIC - Required and valid format
    if (!isRequired(formData.cnic)) {
      errors.cnic = 'CNIC is required';
    } else if (!isValidCNIC(formData.cnic)) {
      errors.cnic = 'Please enter a valid CNIC (format: 12345-1234567-1)';
    }

    // Vehicle Number - Required
    if (!isRequired(formData.vehicleNumber)) {
      errors.vehicleNumber = 'Vehicle number is required';
    }

    // Email - Optional but validate if provided
    if (formData.email && formData.email.length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        errors.email = 'Please enter a valid email address';
      }
    }

    // Emergency Contact Phone - Optional but validate if provided
    if (formData.emergencyContactPhone && !isValidPhone(formData.emergencyContactPhone)) {
      errors.emergencyContactPhone = 'Please enter a valid phone number';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the form errors');
      return;
    }

    // Create FormData for file upload (use snake_case keys for backend)
    const submitData = new FormData();
    submitData.append('full_name', formData.fullName);
    submitData.append('phone', formData.phone);
    submitData.append('cnic', formData.cnic);
    submitData.append('vehicle_type', formData.vehicleType);
    submitData.append('vehicle_number', formData.vehicleNumber);
    if (formData.password) submitData.append('password', formData.password);
    if (formData.email) submitData.append('email', formData.email);
    if (formData.drivingLicenseNumber) submitData.append('driving_license_number', formData.drivingLicenseNumber);
    if (formData.emergencyContactName) submitData.append('emergency_contact_name', formData.emergencyContactName);
    if (formData.emergencyContactPhone) submitData.append('emergency_contact_phone', formData.emergencyContactPhone);
    if (formData.bankAccountTitle) submitData.append('bank_account_title', formData.bankAccountTitle);
    if (formData.bankAccountNumber) submitData.append('bank_account_number', formData.bankAccountNumber);
    if (formData.bankName) submitData.append('bank_name', formData.bankName);

    if (selectedImage) {
      submitData.append('avatar', selectedImage);
    }

    if (editingRider) {
      updateMutation.mutate({ id: editingRider.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this rider?')) {
      deleteMutation.mutate(id);
    }
  };

  const getVehicleIcon = (type: string) => {
    switch (type) {
      case 'bike':
        return <Bike className="w-4 h-4" />;
      case 'car':
        return <Car className="w-4 h-4" />;
      case 'van':
        return <Truck className="w-4 h-4" />;
      default:
        return <Bike className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800';
      case 'busy':
        return 'bg-yellow-100 text-yellow-800';
      case 'offline':
        return 'bg-gray-100 text-gray-800';
      case 'on_leave':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m || 0, 0, 0);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  };

  // ─── Stats View ──────────────────────────────────────
  if (viewStatsRider) {
    return (
      <Layout title={`Rider: ${viewStatsRider.fullName}`} subtitle="Stats, Payments & Delivery Charges">
        <div className="mb-4">
          <Button variant="outline" onClick={closeStatsView} leftIcon={<ArrowLeft className="w-4 h-4" />}>
            Back to Riders
          </Button>
        </div>

        {loadingStats ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
          </div>
        ) : riderStats ? (
          <div className="space-y-6">
            {/* Order Stats */}
            <Card>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary-600" /> Order Statistics
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {([
                  ['Today', riderStats.stats.today],
                  ['This Week', riderStats.stats.thisWeek],
                  ['Last Week', riderStats.stats.lastWeek],
                  ['This Month', riderStats.stats.thisMonth],
                  ['Last Month', riderStats.stats.lastMonth],
                ] as [string, { orders: number; earnings: number }][]).map(([label, data]) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-4 text-center">
                    <p className="text-sm text-gray-500">{label}</p>
                    <p className="text-2xl font-bold text-gray-900">{data.orders}</p>
                    <p className="text-sm text-green-600 font-medium">{formatCurrency(data.earnings)}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Payment Tracking */}
            <Card>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-primary-600" /> Payment Tracking
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-600">Total Collected (COD)</p>
                  <p className="text-2xl font-bold text-blue-800">
                    {formatCurrency(riderStats.payment.totalCollected)}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-green-600">Total Earned (Delivery Charges)</p>
                  <p className="text-2xl font-bold text-green-800">
                    {formatCurrency(riderStats.payment.totalEarned)}
                  </p>
                </div>
                <div className={`rounded-lg p-4 ${riderStats.payment.paymentPending > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <p className={`text-sm ${riderStats.payment.paymentPending > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    Payment Pending (Owes to Company)
                  </p>
                  <p className={`text-2xl font-bold ${riderStats.payment.paymentPending > 0 ? 'text-red-800' : 'text-gray-800'}`}>
                    {formatCurrency(riderStats.payment.paymentPending)}
                  </p>
                </div>
              </div>
            </Card>

            {/* Delivery Charges Per Time Slot */}
            <Card>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary-600" /> Delivery Charges Per Time Slot
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Set per-order delivery charge for each time slot. Changes apply to orders assigned <strong>after</strong> saving.
                Only <strong>delivered</strong> orders count towards rider earnings.
              </p>
              <div className="space-y-3">
                {(timeSlots || []).map((slot: any) => (
                  <div key={slot.id} className="flex items-center gap-4 bg-gray-50 rounded-lg p-3">
                    <div className="flex-1">
                      <span className="font-medium text-sm">
                        {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                      </span>
                      {slot.slotName && (
                        <span className="text-xs text-gray-500 ml-2">({slot.slotName})</span>
                      )}
                    </div>
                    <div className="w-40">
                      <Input
                        type="number"
                        placeholder="0"
                        value={deliveryChargesMap[slot.id] ?? ''}
                        onChange={(e) =>
                          setDeliveryChargesMap((prev) => ({
                            ...prev,
                            [slot.id]: parseFloat(e.target.value) || 0,
                          }))
                        }
                        leftIcon={<DollarSign className="w-4 h-4 text-gray-400" />}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={handleSaveDeliveryCharges}
                  isLoading={savingCharges}
                  leftIcon={<Save className="w-4 h-4" />}
                >
                  Save Charges
                </Button>
              </div>
            </Card>
          </div>
        ) : (
          <Card className="text-center py-12">
            <p className="text-gray-500">Failed to load stats.</p>
          </Card>
        )}
      </Layout>
    );
  }

  // ─── Main Riders List ────────────────────────────────
  return (
    <Layout title="Riders" subtitle="Manage delivery riders">
      {/* Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="w-64">
            <Input
              placeholder="Search riders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search className="w-4 h-4 text-gray-400" />}
            />
          </div>
          <div className="w-40">
            <Select
              placeholder="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={RIDER_STATUS}
            />
          </div>
          <div className="w-40">
            <Select
              placeholder="Verification"
              value={verificationFilter}
              onChange={(e) => setVerificationFilter(e.target.value)}
              options={VERIFICATION_STATUS}
            />
          </div>
        </div>
        <Button onClick={openAddModal} leftIcon={<Plus className="w-5 h-5" />}>
          Add Rider
        </Button>
      </div>

      {/* Riders Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse bg-white rounded-lg p-4">
              <div className="h-20 bg-gray-200 rounded-lg mb-4" />
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : !filteredRiders || filteredRiders.length === 0 ? (
        <Card className="text-center py-12">
          <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No riders found</h3>
          <p className="text-gray-500 mb-4">
            {searchQuery || statusFilter || verificationFilter
              ? 'Try adjusting your filters'
              : 'Add riders to manage deliveries'}
          </p>
          <Button onClick={openAddModal} leftIcon={<Plus className="w-5 h-5" />}>
            Add Rider
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRiders.map((rider) => (
            <Card key={rider.id} className="relative">
              <div className="flex items-start space-x-4">
                {/* Avatar */}
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {rider.avatarUrl ? (
                    <img
                      src={resolveImageUrl(rider.avatarUrl)}
                      alt={rider.fullName}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <Users className="w-8 h-8 text-gray-400" />
                  )}
                </div>

                {/* Rider Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 truncate">{rider.fullName}</h3>
                  <div className="flex items-center text-sm text-gray-500 mt-1">
                    <Phone className="w-3 h-3 mr-1" />
                    {rider.phone}
                  </div>
                  <div className="flex items-center text-sm text-gray-500 mt-1">
                    {getVehicleIcon(rider.vehicleType)}
                    <span className="ml-1 capitalize">{rider.vehicleType}</span>
                    <span className="mx-1">•</span>
                    <span>{rider.vehicleNumber}</span>
                  </div>

                  {/* Status Badges */}
                  <div className="flex items-center mt-2 space-x-2">
                    <select
                      value={rider.status}
                      onChange={(e) => updateStatusMutation.mutate({ id: rider.id, status: e.target.value })}
                      className={`text-xs font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer ${getStatusColor(rider.status)}`}
                    >
                      <option value="available">Available</option>
                      <option value="busy">Busy</option>
                      <option value="offline">Offline</option>
                      <option value="on_leave">On Leave</option>
                    </select>
                    <Badge
                      variant={rider.verificationStatus === 'verified' ? 'success' : 'warning'}
                      size="sm"
                    >
                      {rider.verificationStatus}
                    </Badge>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center mt-2 text-xs text-gray-500 space-x-3">
                    <span>⭐ {rider.rating ? Number(rider.rating).toFixed(1) : 'N/A'}</span>
                    <span>📦 {rider.totalDeliveries || 0} deliveries</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center mt-3 space-x-2">
                    <button
                      onClick={() => openRiderTracking(rider)}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Track Location"
                    >
                      <Navigation2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openStatsView(rider)}
                      className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Stats & Charges"
                    >
                      <BarChart3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEditModal(rider)}
                      className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    {rider.verificationStatus !== 'verified' && (
                      <button
                        onClick={() => verifyMutation.mutate({ id: rider.id, status: 'verified' })}
                        className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Verify"
                      >
                        <Shield className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(rider.id)}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingRider ? 'Edit Rider' : 'Add Rider'}
        size="lg"
        footer={
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              isLoading={createMutation.isPending || updateMutation.isPending}
            >
              {editingRider ? 'Update' : 'Create'}
            </Button>
          </div>
        }
      >
        <form className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-2 border-b pb-2">
            {['Basic Info', 'Emergency & Banking'].map((tab, i) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(i)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
                  activeTab === i ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 0 && (
            <>
              {/* Avatar Upload */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden">
                    {imagePreview ? (
                      <img
                        src={imagePreview}
                        alt="Rider preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Users className="w-10 h-10 text-gray-400" />
                    )}
                  </div>
                  <label className="absolute bottom-0 right-0 bg-primary-600 text-white rounded-full p-2 cursor-pointer hover:bg-primary-700 transition-colors">
                    <Upload className="w-4 h-4" />
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                  </label>
                  {imagePreview && (
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Full Name"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  error={formErrors.fullName}
                  required
                />
                <Input
                  label="Phone Number"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  error={formErrors.phone}
                  placeholder="03001234567"
                  leftIcon={<Phone className="w-4 h-4 text-gray-400" />}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label={editingRider ? 'New Password (leave blank to keep)' : 'Password'}
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  error={formErrors.password}
                  placeholder="Min 6 characters"
                  required={!editingRider}
                />
                <Input
                  label="Email (Optional)"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  error={formErrors.email}
                  placeholder="rider@example.com"
                  leftIcon={<Mail className="w-4 h-4 text-gray-400" />}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="CNIC"
                  value={formData.cnic}
                  onChange={(e) => setFormData({ ...formData, cnic: e.target.value })}
                  error={formErrors.cnic}
                  placeholder="12345-1234567-1"
                  leftIcon={<CreditCard className="w-4 h-4 text-gray-400" />}
                  required
                />
                <Input
                  label="Driving License Number (Optional)"
                  value={formData.drivingLicenseNumber}
                  onChange={(e) => setFormData({ ...formData, drivingLicenseNumber: e.target.value })}
                  placeholder="License number"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vehicle Type <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={formData.vehicleType}
                    onChange={(e) =>
                      setFormData({ ...formData, vehicleType: e.target.value as 'bike' | 'car' | 'van' })
                    }
                    options={VEHICLE_TYPES}
                  />
                </div>
                <Input
                  label="Vehicle Number"
                  value={formData.vehicleNumber}
                  onChange={(e) => setFormData({ ...formData, vehicleNumber: e.target.value })}
                  error={formErrors.vehicleNumber}
                  placeholder="ABC-123"
                  required
                />
              </div>
            </>
          )}

          {activeTab === 1 && (
            <>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Emergency Contact</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Contact Name"
                  value={formData.emergencyContactName}
                  onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                  placeholder="Emergency contact name"
                />
                <Input
                  label="Contact Phone"
                  value={formData.emergencyContactPhone}
                  onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                  error={formErrors.emergencyContactPhone}
                  placeholder="03001234567"
                  leftIcon={<Phone className="w-4 h-4 text-gray-400" />}
                />
              </div>

              <h4 className="text-sm font-semibold text-gray-700 mb-2 mt-4">Banking Details (for payouts)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Account Title"
                  value={formData.bankAccountTitle}
                  onChange={(e) => setFormData({ ...formData, bankAccountTitle: e.target.value })}
                  placeholder="Account holder name"
                />
                <Input
                  label="Account Number"
                  value={formData.bankAccountNumber}
                  onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                  placeholder="Account / IBAN number"
                />
              </div>
              <Input
                label="Bank Name"
                value={formData.bankName}
                onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                placeholder="e.g. JazzCash, EasyPaisa, HBL, etc."
              />
            </>
          )}
        </form>
      </Modal>

      {/* Rider Location Tracking Modal */}
      <Modal
        isOpen={!!trackingRider}
        onClose={() => { setTrackingRider(null); setRiderLocation(null); }}
        title={`Track Rider: ${trackingRider?.fullName || ''}`}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              onClick={handleRefreshLocation}
              disabled={refreshingLocation || loadingLocation}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {refreshingLocation ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <Navigation2 className="w-4 h-4" />
              )}
              {refreshingLocation ? 'Refreshing...' : 'Refresh Location'}
            </button>
            <Button variant="outline" onClick={() => { setTrackingRider(null); setRiderLocation(null); }}>
              Close
            </Button>
          </div>
        }
      >
        {loadingLocation ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
          </div>
        ) : riderLocation?.latitude && riderLocation?.longitude ? (
          <div className="space-y-4">
            <div className="rounded-lg overflow-hidden border" style={{ height: 400 }}>
              <LeafletMap
                latitude={riderLocation.latitude}
                longitude={riderLocation.longitude}
                accuracy={riderLocation.accuracy ?? null}
                popupHtml={`<b>${trackingRider?.fullName || 'Rider'}</b><br/>${riderLocation.accuracy != null ? `Accuracy: ±${riderLocation.accuracy.toFixed(1)} m` : ''}`}
                height={400}
              />
            </div>
            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
              <div className="text-sm">
                <p className="font-medium">{trackingRider?.fullName}</p>
                <p className="text-gray-500">
                  Status: <span className="capitalize">{riderLocation.status || (riderLocation.locationUpdatedAt ? 'Active' : 'Unknown')}</span>
                  {riderLocation.accuracy != null && (
                    <>
                      {' • '}Accuracy:{' '}
                      <span className={`font-medium ${riderLocation.accuracy <= 9 ? 'text-green-600' : riderLocation.accuracy <= 20 ? 'text-amber-600' : 'text-red-600'}`}>
                        ±{riderLocation.accuracy.toFixed(1)} m
                      </span>
                    </>
                  )}
                  {' • '}Last updated:{' '}
                  <span className="font-medium text-gray-700">
                    {riderLocation.locationUpdatedAt
                      ? new Date(riderLocation.locationUpdatedAt).toLocaleString()
                      : 'N/A'}
                  </span>
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Auto-refreshes every 15 seconds</p>
              </div>
              <a
                href={`https://www.google.com/maps?q=${riderLocation.latitude},${riderLocation.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                <Navigation2 className="w-4 h-4" />
                Google Maps
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No location data available</p>
            <p className="text-sm text-gray-400 mt-1">Rider has not shared their location yet</p>
            <p className="text-xs text-gray-400 mt-1">Make sure the rider app is open and location is enabled</p>
          </div>
        )}
      </Modal>
    </Layout>
  );
};
