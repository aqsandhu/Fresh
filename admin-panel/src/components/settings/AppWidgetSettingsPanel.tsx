import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Smartphone, Save, RotateCcw, Eye, Lightbulb, ShoppingBag } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { appWidgetService, type AppWidgetSettings } from '@/services/appWidget.service';

const EMPTY: AppWidgetSettings = { enabled: true, title: '', message: '', messageUr: '' };

/**
 * Android home-screen widget content (customer app). Global — one widget for
 * all cities. Includes written guidelines for the team.
 */
export const AppWidgetSettingsPanel: React.FC<{ canEdit: boolean }> = ({ canEdit }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AppWidgetSettings>(EMPTY);

  const { data } = useQuery({
    queryKey: ['appWidgetSettings'],
    queryFn: appWidgetService.get,
  });

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: appWidgetService.update,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appWidgetSettings'] });
      toast.success('App widget settings updated');
    },
    onError: (error: Error) => toast.error(error.message || 'Failed to update widget settings'),
  });

  return (
    <div className="max-w-4xl space-y-6">
      {/* Live Preview — Android widget mock */}
      <Card>
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-5 h-5 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Widget Preview
            </h3>
          </div>
          <div className="mx-auto max-w-xs rounded-3xl bg-gradient-to-br from-green-600 to-green-800 p-4 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-base">
                🥬
              </span>
              <p className="text-sm font-bold text-white">{form.title || 'Fresh Bazar'}</p>
            </div>
            <p className="mt-2 text-xs text-green-50">
              {form.message || 'Taza sabzi & fruits — free delivery on Rs. 500+'}
            </p>
            <p className="mt-1 text-xs text-green-100 text-right" dir="rtl">
              {form.messageUr || 'تازہ سبزیاں اور پھل — آپ کے دروازے پر'}
            </p>
            <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-green-700">
              <ShoppingBag className="w-3 h-3" />
              Shop Now
            </span>
          </div>
          <p className="mt-2 text-center text-xs text-gray-400">
            Tapping the widget opens the Fresh Bazar app.
          </p>
        </div>
      </Card>

      {/* Edit Form */}
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate(form);
          }}
          className="space-y-6"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Smartphone className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900">App Home-Screen Widget</h3>
              <p className="text-sm text-gray-500">
                Content of the Android widget customers can add from the app (global — same
                for all cities)
              </p>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
              className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
            />
            <span className="text-sm font-medium text-gray-900">
              Widget enabled (customers see the &quot;Home Screen Widget&quot; option in the app)
            </span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Input
                label="Widget Title"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value.slice(0, 60) }))}
                placeholder="Fresh Bazar"
              />
              <p className="mt-1 text-xs text-gray-400">Short — 2 or 3 words look best</p>
            </div>
            <div>
              <Input
                label="Message (English/Roman)"
                value={form.message}
                onChange={(e) => setForm((p) => ({ ...p, message: e.target.value.slice(0, 140) }))}
                placeholder="Taza sabzi & fruits — free delivery on Rs. 500+"
              />
              <p className="mt-1 text-xs text-gray-400">One line; offers and timings work well</p>
            </div>
            <div className="md:col-span-2">
              <Input
                label="Message (Urdu)"
                value={form.messageUr}
                onChange={(e) =>
                  setForm((p) => ({ ...p, messageUr: e.target.value.slice(0, 140) }))
                }
                placeholder="تازہ سبزیاں اور پھل — آپ کے دروازے پر"
                dir="rtl"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => data && setForm(data)}
              leftIcon={<RotateCcw className="w-4 h-4" />}
            >
              Reset
            </Button>
            <Button
              type="submit"
              isLoading={updateMutation.isPending}
              leftIcon={<Save className="w-4 h-4" />}
              disabled={!canEdit}
            >
              Save Widget Settings
            </Button>
          </div>
        </form>
      </Card>

      {/* Guidelines */}
      <Card>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-semibold text-gray-900">Widget Guidelines</h3>
          </div>
          <ul className="list-disc space-y-2 pl-5 text-sm text-gray-600">
            <li>
              <span className="font-medium text-gray-800">What it is:</span> a small Fresh
              Bazar card on the customer&apos;s Android home screen showing the title and
              messages above; tapping it opens the app.
            </li>
            <li>
              <span className="font-medium text-gray-800">How customers add it:</span> in the
              app, Profile → <em>Home Screen Widget</em> → the app asks their permission and
              Android places the widget automatically (Android 8+). On older phones they can
              long-press the home screen → Widgets → Fresh Bazar.
            </li>
            <li>
              <span className="font-medium text-gray-800">When content updates:</span> the
              widget refreshes with the latest text every time the customer opens the app,
              and periodically in the background.
            </li>
            <li>
              <span className="font-medium text-gray-800">Writing tips:</span> keep the title
              2–3 words and each message one line. Lead with the offer (e.g.&nbsp;
              <em>&quot;Aaj ki offer: 10% off fruits&quot;</em>). Urdu line is shown to
              everyone — keep it friendly and short.
            </li>
            <li>
              <span className="font-medium text-gray-800">Disable switch:</span> turning the
              widget off hides the option inside the app; widgets already on customers&apos;
              home screens keep showing the default branding until re-enabled.
            </li>
          </ul>
        </div>
      </Card>
    </div>
  );
};

export default AppWidgetSettingsPanel;
