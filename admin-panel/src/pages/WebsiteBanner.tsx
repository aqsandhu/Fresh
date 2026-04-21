import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Monitor,
  Phone,
  MapPin,
  Type,
  Save,
  RotateCcw,
  Eye,
} from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { bannerService } from '@/services/banner.service';
import toast from 'react-hot-toast';

interface BannerFormData {
  bannerLeftText: string;
  bannerMiddleText: string;
  bannerRightTextEn: string;
  bannerRightTextUr: string;
}

export const WebsiteBanner: React.FC = () => {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<BannerFormData>({
    bannerLeftText: '',
    bannerMiddleText: '',
    bannerRightTextEn: '',
    bannerRightTextUr: '',
  });

  const { data: bannerSettings, isLoading } = useQuery({
    queryKey: ['bannerSettings'],
    queryFn: () => bannerService.getBannerSettings(),
  });

  useEffect(() => {
    if (bannerSettings) {
      setFormData({
        bannerLeftText: bannerSettings.bannerLeftText || '',
        bannerMiddleText: bannerSettings.bannerMiddleText || '',
        bannerRightTextEn: bannerSettings.bannerRightTextEn || '',
        bannerRightTextUr: bannerSettings.bannerRightTextUr || '',
      });
    }
  }, [bannerSettings]);

  const updateMutation = useMutation({
    mutationFn: (data: BannerFormData) => bannerService.updateBannerSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bannerSettings'] });
      toast.success('Banner settings updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update banner settings');
    },
  });

  const handleChange = (field: keyof BannerFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleReset = () => {
    if (bannerSettings) {
      setFormData({
        bannerLeftText: bannerSettings.bannerLeftText || '',
        bannerMiddleText: bannerSettings.bannerMiddleText || '',
        bannerRightTextEn: bannerSettings.bannerRightTextEn || '',
        bannerRightTextUr: bannerSettings.bannerRightTextUr || '',
      });
    }
  };

  if (isLoading) {
    return (
      <Layout title="Website Banner" subtitle="Manage top banner text">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Website Banner" subtitle="Manage the top banner strip on the website">
      <div className="max-w-4xl mx-auto space-y-6">
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
                  {formData.bannerLeftText || 'Left text'}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {formData.bannerMiddleText || 'Middle text'}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span>{formData.bannerRightTextEn || 'English text'}</span>
                <span className="font-urdu" dir="rtl">{formData.bannerRightTextUr || 'اردو متن'}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Edit Form */}
        <Card>
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <Monitor className="w-5 h-5 text-primary-600" />
              <h3 className="text-lg font-semibold text-gray-900">Banner Text Settings</h3>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Edit the text shown in the top banner strip of the website. Changes will be reflected on the website immediately.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Text */}
              <div>
                <Input
                  label="Left Side Text (Phone Number)"
                  value={formData.bannerLeftText}
                  onChange={(e) => handleChange('bannerLeftText', e.target.value)}
                  placeholder="e.g. 0300-1234567"
                  leftIcon={<Phone className="w-4 h-4 text-gray-400" />}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Shown with a phone icon on the left side
                </p>
              </div>

              {/* Middle Text */}
              <div>
                <Input
                  label="Middle Text"
                  value={formData.bannerMiddleText}
                  onChange={(e) => handleChange('bannerMiddleText', e.target.value)}
                  placeholder="e.g. Free Delivery 10AM-2PM"
                  leftIcon={<MapPin className="w-4 h-4 text-gray-400" />}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Shown with a location icon (hidden on mobile)
                </p>
              </div>

              {/* Right Text English */}
              <div>
                <Input
                  label="Right Side Text (English)"
                  value={formData.bannerRightTextEn}
                  onChange={(e) => handleChange('bannerRightTextEn', e.target.value)}
                  placeholder="e.g. Fresh Sabzi at Your Doorstep"
                  leftIcon={<Type className="w-4 h-4 text-gray-400" />}
                />
                <p className="mt-1 text-xs text-gray-400">
                  English text on the right (hidden on mobile)
                </p>
              </div>

              {/* Right Text Urdu */}
              <div>
                <Input
                  label="Right Side Text (Urdu)"
                  value={formData.bannerRightTextUr}
                  onChange={(e) => handleChange('bannerRightTextUr', e.target.value)}
                  placeholder="تازہ سبزیاں آپ کے دروازے پر"
                  dir="rtl"
                  leftIcon={<Type className="w-4 h-4 text-gray-400" />}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Urdu text always visible on the right side
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                leftIcon={<RotateCcw className="w-4 h-4" />}
              >
                Reset
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={updateMutation.isPending}
                leftIcon={<Save className="w-4 h-4" />}
              >
                Save Changes
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </Layout>
  );
};
