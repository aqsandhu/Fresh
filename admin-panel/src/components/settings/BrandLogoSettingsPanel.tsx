import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Image, Upload, Info } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { brandService } from '@/services/brand.service';
import toast from 'react-hot-toast';

interface BrandLogoSettingsPanelProps {
  canEdit: boolean;
}

export const BrandLogoSettingsPanel: React.FC<BrandLogoSettingsPanelProps> = ({
  canEdit,
}) => {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['brand-logo'],
    queryFn: () => brandService.get(),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => brandService.upload(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-logo'] });
      setPreview(null);
      toast.success('Brand logo updated across all apps');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to upload logo');
    },
  });

  const storedUrl = data?.brandLogoUrl?.trim();
  const displayUrl = preview || storedUrl || null;

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
    <Card>
      <div className="flex items-start gap-3 mb-4">
        <Image className="w-5 h-5 text-primary-600 mt-0.5" />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Brand Logo</h3>
          <p className="text-sm text-gray-500 mt-1">
            Upload a transparent PNG. Stored in Supabase and shown on website, apps,
            and admin. City admins can preview only.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-gray-50 rounded-xl border border-gray-100">
        {isLoading ? (
          <div className="w-48 h-32 bg-gray-200 animate-pulse rounded-lg" />
        ) : displayUrl ? (
          <img
            src={displayUrl}
            alt="Fresh Bazar logo"
            className="max-h-32 max-w-[220px] object-contain"
          />
        ) : (
          <div className="text-center text-sm text-gray-500 px-4">
            No logo uploaded yet.
            {canEdit ? ' Upload a transparent PNG below.' : ''}
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
              disabled={uploadMutation.isPending}
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploadMutation.isPending ? 'Uploading…' : 'Upload logo (PNG)'}
            </Button>
            <p className="text-xs text-gray-500">Use a transparent PNG for best results</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Info className="w-4 h-4 shrink-0" />
            <span>View only — contact super admin to change the logo.</span>
          </div>
        )}
      </div>
    </Card>
  );
};
