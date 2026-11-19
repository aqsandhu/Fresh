// The Settings page's "Business hours" tab (moved out of pages/Settings.tsx,
// W21): open / close times per weekday, saved for the whole platform.
import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { settingsService } from '@/services/settings.service';
import type { BusinessHours } from '@/types';

export const BusinessHoursSettingsPanel: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const queryClient = useQueryClient();
  const [businessHours, setBusinessHours] = useState<BusinessHours[]>([]);
  const {
    data: businessHoursData,
    isLoading: isLoadingBusinessHours,
    isError: businessHoursFailed,
    refetch: refetchBusinessHours,
  } = useQuery({
    queryKey: ['businessHours'],
    queryFn: () => settingsService.getBusinessHours(),
  });

  // The server always answers with the real hours (its own defaults when none
  // were saved). Invented hours here only appeared when the LOAD FAILED — and
  // "Save" then wrote them over the real hours (G16). A failed load now says
  // so and offers Retry instead.
  useEffect(() => {
    if (businessHoursData) setBusinessHours(businessHoursData);
  }, [businessHoursData]);

  const updateBusinessHoursMutation = useMutation({
    mutationFn: settingsService.updateBusinessHours,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['businessHours'] });
      toast.success('Business hours updated successfully');
    },
  });

  const handleBusinessHoursChange = (index: number, field: keyof BusinessHours, value: BusinessHours[keyof BusinessHours]) => {
    const updated = [...businessHours];
    updated[index] = { ...updated[index], [field]: value };
    setBusinessHours(updated);
  };

  const handleSaveBusinessHours = () => {
    updateBusinessHoursMutation.mutate(businessHours);
  };

  return (
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
          disabled={!canEdit || businessHoursFailed || businessHours.length === 0}
        >
          Save Business Hours
        </Button>
      </div>

      {businessHoursFailed && !businessHoursData ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          The business hours could not be loaded, so they are not shown (saving now would overwrite them).
          <Button type="button" size="sm" variant="outline" className="ml-3" onClick={() => refetchBusinessHours()}>
            Retry
          </Button>
        </div>
      ) : isLoadingBusinessHours ? (
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
                        aria-label={`${hours.day} opens`}
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
                        aria-label={`${hours.day} closes`}
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
};
