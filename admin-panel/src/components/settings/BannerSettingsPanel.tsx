// The Settings page's "Banner" tab (moved out of pages/Settings.tsx, W21):
// the top banner texts and ticker for the selected city, plus the WhatsApp
// order link.
import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Eye, MapPin, Monitor, Phone, Plus, RotateCcw, Save, Trash2, Type } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { bannerService } from '@/services/banner.service';
import { useCityContext } from '@/context/CityContext';

export const BannerSettingsPanel: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const queryClient = useQueryClient();
  const { selectedCity, selectedCityId } = useCityContext();
  const [bannerForm, setBannerForm] = useState({
    bannerLeftText: '',
    bannerMiddleText: '',
    bannerRightTextEn: '',
    bannerRightTextUr: '',
    bannerTickerItems: [] as string[],
  });

  const { data: bannerSettings } = useQuery({
    queryKey: ['bannerSettings', selectedCityId],
    queryFn: () => bannerService.getBannerSettings(),
    enabled: !!selectedCityId,
  });

  useEffect(() => {
    if (bannerSettings) {
      setBannerForm({
        bannerLeftText: bannerSettings.bannerLeftText || '',
        bannerMiddleText: bannerSettings.bannerMiddleText || '',
        bannerRightTextEn: bannerSettings.bannerRightTextEn || '',
        bannerRightTextUr: bannerSettings.bannerRightTextUr || '',
        bannerTickerItems: bannerSettings.bannerTickerItems || [],
      });
    }
  }, [bannerSettings]);

  const updateBannerMutation = useMutation({
    mutationFn: (data: typeof bannerForm) => bannerService.updateBannerSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bannerSettings', selectedCityId] });
      toast.success('Banner settings updated successfully');
    },
  });

  return (
    <div className="max-w-4xl space-y-6">
      {!selectedCityId && (
        <Card>
          <div className="p-4 flex items-start gap-3 text-amber-800 bg-amber-50 rounded-lg">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">
              Select a city from the header before editing the website banner. Each city can have its own green top bar text.
            </p>
          </div>
        </Card>
      )}

      {selectedCity && (
        <p className="text-sm text-gray-600">
          Editing banner for <span className="font-semibold text-gray-900">{selectedCity.name}</span>.
          Empty fields fall back to global defaults on the website.
        </p>
      )}

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
          <p className="mt-2 text-xs text-gray-400">
            On mobile and in the customer app, the bar rotates like a news ticker:
            each of the texts above (plus the extra ticker lines below) is shown one
            at a time.
          </p>
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
              <p className="text-sm text-gray-500">
                Edit the green top bar on the website for the selected city
              </p>
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

          {/* Extra ticker lines — rotate after the four texts above on mobile/app */}
          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">Extra Ticker Lines (Mobile / App)</h4>
                <p className="text-xs text-gray-500">
                  Add more announcements — offers, timings, notices. English and Urdu both work.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() =>
                  setBannerForm(prev => ({
                    ...prev,
                    bannerTickerItems: [...prev.bannerTickerItems, ''],
                  }))
                }
                disabled={bannerForm.bannerTickerItems.length >= 20}
              >
                Add Line
              </Button>
            </div>

            {bannerForm.bannerTickerItems.length === 0 ? (
              <p className="text-xs text-gray-400 py-3 text-center bg-gray-50 rounded-lg">
                No extra lines yet — the ticker rotates through the four texts above.
              </p>
            ) : (
              <div className="space-y-2 mt-2">
                {bannerForm.bannerTickerItems.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-6 text-xs text-gray-400 text-center shrink-0">{index + 1}.</span>
                    <input
                      type="text"
                      aria-label={`Ticker line ${index + 1}`}
                      value={item}
                      dir="auto"
                      onChange={(e) =>
                        setBannerForm(prev => ({
                          ...prev,
                          bannerTickerItems: prev.bannerTickerItems.map((it, i) =>
                            i === index ? e.target.value : it
                          ),
                        }))
                      }
                      placeholder="e.g. Eid Special: 10% off on all fruits"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setBannerForm(prev => ({
                          ...prev,
                          bannerTickerItems: prev.bannerTickerItems.filter((_, i) => i !== index),
                        }))
                      }
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
                    bannerTickerItems: bannerSettings.bannerTickerItems || [],
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
              disabled={!selectedCityId || !canEdit}
            >
              Save Banner Settings
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
