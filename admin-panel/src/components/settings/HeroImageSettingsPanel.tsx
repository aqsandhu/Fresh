import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Image, Upload, Info, Trash2, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { heroService } from '@/services/hero.service';
import { useCityContext } from '@/context/CityContext';
import toast from 'react-hot-toast';

interface HeroImageSettingsPanelProps {
  canEdit: boolean;
}

/**
 * Per-city homepage hero image (website + customer app). The backend resolves
 * the city from the header / the admin's assigned city, so every city admin
 * manages their own city and the super admin manages whichever city is
 * selected.
 */
export const HeroImageSettingsPanel: React.FC<HeroImageSettingsPanelProps> = ({
  canEdit,
}) => {
  const queryClient = useQueryClient();
  const { selectedCity, selectedCityId } = useCityContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['hero-image', selectedCityId],
    queryFn: () => heroService.get(),
    enabled: !!selectedCityId,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => heroService.upload(file),
    onSuccess: ({ message }) => {
      queryClient.invalidateQueries({ queryKey: ['hero-image', selectedCityId] });
      setPreview(null);
      toast.success(message);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to upload hero image');
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => heroService.remove(),
    onSuccess: ({ message }) => {
      queryClient.invalidateQueries({ queryKey: ['hero-image', selectedCityId] });
      setPreview(null);
      toast.success(message);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to remove hero image');
    },
  });

  const storedUrl = data?.heroImageUrl?.trim();
  const displayUrl = preview || storedUrl || null;
  const canUpload = canEdit && !!selectedCityId;

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose a PNG, WebP, or JPG image');
      return;
    }
    setPreview(URL.createObjectURL(file));
    uploadMutation.mutate(file);
    e.target.value = '';
  };

  return (
    <div className="max-w-4xl space-y-6">
      {!selectedCityId && (
        <Card>
          <div className="p-4 flex items-start gap-3 text-amber-800 bg-amber-50 rounded-lg">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">
              Select a city from the header before managing the hero image. Each city has its
              own homepage hero on the website and customer app.
            </p>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-start gap-3 mb-4">
          <Image className="w-5 h-5 text-primary-600 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Homepage Hero Image</h3>
            <p className="text-sm text-gray-500 mt-1">
              {selectedCity ? (
                <>
                  Hero image for{' '}
                  <span className="font-semibold text-gray-900">{selectedCity.name}</span>.{' '}
                </>
              ) : null}
              Shown at the top of the website and customer-app home screen. A landscape image
              (around 800×536) works best. Replacing it deletes the previous file from storage.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-gray-50 rounded-xl border border-gray-100">
          {isLoading ? (
            <div className="w-64 h-40 bg-gray-200 animate-pulse rounded-lg" />
          ) : displayUrl ? (
            <img
              src={displayUrl}
              alt="Homepage hero"
              className="h-40 w-auto max-w-full object-cover rounded-lg"
            />
          ) : (
            <div className="text-center text-sm text-gray-500 px-4">
              No hero image set for this city — the default image is shown.
              {canUpload ? ' Upload one below.' : ''}
            </div>
          )}

          {canEdit ? (
            <div className="flex flex-col gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/webp,image/jpeg"
                className="hidden"
                onChange={onFile}
              />
              <Button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={!canUpload || uploadMutation.isPending || removeMutation.isPending}
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploadMutation.isPending
                  ? 'Uploading…'
                  : storedUrl
                    ? 'Replace hero image'
                    : 'Upload hero image'}
              </Button>
              {storedUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  disabled={!canUpload || uploadMutation.isPending || removeMutation.isPending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Remove this city's hero image and delete the file from storage?"
                      )
                    ) {
                      return;
                    }
                    removeMutation.mutate();
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {removeMutation.isPending ? 'Removing…' : 'Remove hero image'}
                </Button>
              ) : null}
              <p className="text-xs text-gray-500">PNG, WebP, or JPG — max 5MB</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Info className="w-4 h-4 shrink-0" />
              <span>View only — you don't have permission to change the hero image.</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
