import React, { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Upload, Info, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { faviconService } from '@/services/favicon.service';
import toast from 'react-hot-toast';

interface BrandFaviconSettingsPanelProps {
  canEdit: boolean;
}

export const BrandFaviconSettingsPanel: React.FC<BrandFaviconSettingsPanelProps> = ({
  canEdit,
}) => {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['brand-favicon'],
    queryFn: () => faviconService.get(),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => faviconService.upload(file),
    onSuccess: ({ message }) => {
      queryClient.invalidateQueries({ queryKey: ['brand-favicon'] });
      setPreview(null);
      toast.success(message);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to upload favicon');
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => faviconService.remove(),
    onSuccess: ({ message }) => {
      queryClient.invalidateQueries({ queryKey: ['brand-favicon'] });
      setPreview(null);
      toast.success(message);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to remove favicon');
    },
  });

  const storedUrl = data?.brandFaviconUrl?.trim();
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
        <Sparkles className="w-5 h-5 text-primary-600 mt-0.5" />
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Brand Favicon</h3>
          <p className="text-sm text-gray-500 mt-1">
            Separate from the navbar logo. Used for browser tabs and home-screen icons.
            Upload a square PNG (512×512 recommended). Stored in Supabase under{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">favicon/</code>. Replacing
            deletes the previous file automatically.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-gray-50 rounded-xl border border-gray-100">
        {isLoading ? (
          <div className="w-32 h-32 bg-gray-200 animate-pulse rounded-lg" />
        ) : displayUrl ? (
          <img
            src={displayUrl}
            alt="Site favicon preview"
            className="h-32 w-auto max-w-none object-contain"
          />
        ) : (
          <div className="text-center text-sm text-gray-500 px-4">
            No favicon uploaded yet.
            {canEdit ? ' Upload a square PNG (up to 512px).' : ''}
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
              disabled={uploadMutation.isPending || removeMutation.isPending}
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploadMutation.isPending
                ? 'Uploading…'
                : storedUrl
                  ? 'Replace favicon'
                  : 'Upload favicon'}
            </Button>
            {storedUrl ? (
              <Button
                type="button"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                disabled={uploadMutation.isPending || removeMutation.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      'Remove the favicon from the site and delete the file from storage?'
                    )
                  ) {
                    return;
                  }
                  removeMutation.mutate();
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {removeMutation.isPending ? 'Removing…' : 'Remove favicon'}
              </Button>
            ) : null}
            <p className="text-xs text-gray-500">
              Max display sizes: 16–512px (generated from your image on website/admin)
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Info className="w-4 h-4 shrink-0" />
            <span>View only — contact super admin to change the favicon.</span>
          </div>
        )}
      </div>
    </Card>
  );
};
