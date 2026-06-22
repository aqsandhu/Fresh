import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wheat, Save, ShieldAlert, Bot, CheckCircle2, Megaphone, Send } from 'lucide-react';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { settingsService } from '@/services/settings.service';
import { marketingService } from '@/services/marketing.service';
import { useAuthContext } from '@/context/AuthContext';
import toast from 'react-hot-toast';

const AI_PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openai-compatible', label: 'OpenAI-compatible (custom base URL)' },
  { value: 'gemini', label: 'Google Gemini' },
];

/**
 * Super-admin-only global platform configuration: feature flags and integrations
 * that apply across the whole business (all cities). Currently hosts the Atta
 * Chakki availability switch; AI chatbot, marketing pixels and service-area copy
 * are added here as those features land.
 */
export const Platform: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, isLoading: authLoading } = useAuthContext();
  const isSuperAdmin = user?.role === 'super_admin';

  const [attaEnabled, setAttaEnabled] = useState(false);

  const { data: platform, isLoading } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: settingsService.getPlatformSettings,
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (platform) setAttaEnabled(Boolean(platform.attaChakkiEnabled));
  }, [platform]);

  const saveMutation = useMutation({
    mutationFn: settingsService.updatePlatformSettings,
    onSuccess: (data) => {
      setAttaEnabled(Boolean(data.attaChakkiEnabled));
      queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
      toast.success('Platform settings saved');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to save platform settings'),
  });

  // ---- AI chatbot config ----
  const [aiProvider, setAiProvider] = useState('anthropic');
  const [aiModel, setAiModel] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiDisabled, setAiDisabled] = useState(false);

  const { data: ai } = useQuery({
    queryKey: ['ai-settings'],
    queryFn: settingsService.getAiSettings,
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (ai) {
      setAiProvider(ai.provider || 'anthropic');
      setAiModel(ai.model || '');
      setAiBaseUrl(ai.baseUrl || '');
      setAiDisabled(Boolean(ai.disabled));
    }
  }, [ai]);

  const aiSaveMutation = useMutation({
    mutationFn: () =>
      settingsService.updateAiSettings({
        provider: aiProvider,
        model: aiModel,
        baseUrl: aiBaseUrl,
        disabled: aiDisabled,
        ...(aiApiKey.trim() ? { apiKey: aiApiKey.trim() } : {}),
      }),
    onSuccess: () => {
      setAiApiKey('');
      queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
      toast.success('AI settings saved');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to save AI settings'),
  });

  const aiClearKeyMutation = useMutation({
    mutationFn: () => settingsService.updateAiSettings({ clearKey: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
      toast.success('API key removed');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to remove key'),
  });

  // ---- Marketing (ad pixels + abandoned-cart reminders) ----
  const [fbPixel, setFbPixel] = useState('');
  const [googleTag, setGoogleTag] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDelay, setReminderDelay] = useState(6);

  const { data: mkt } = useQuery({
    queryKey: ['marketing-settings'],
    queryFn: marketingService.getSettings,
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (mkt) {
      setFbPixel(mkt.fbPixelId || '');
      setGoogleTag(mkt.googleTagId || '');
      setReminderEnabled(Boolean(mkt.reminderEnabled));
      setReminderDelay(mkt.reminderDelayHours || 6);
    }
  }, [mkt]);

  const mktSaveMutation = useMutation({
    mutationFn: () =>
      marketingService.updateSettings({
        fbPixelId: fbPixel,
        googleTagId: googleTag,
        reminderEnabled,
        reminderDelayHours: reminderDelay,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-settings'] });
      toast.success('Marketing settings saved');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to save marketing settings'),
  });

  const runRemindersMutation = useMutation({
    mutationFn: marketingService.runReminders,
    onSuccess: (d) => toast.success(`Sent ${d.sent} reminder(s)`),
    onError: (err: any) => toast.error(err?.message || 'Failed to run reminders'),
  });

  if (!authLoading && !isSuperAdmin) {
    return (
      <Layout title="Platform Settings" subtitle="Super admin only">
        <Card className="p-8 text-center">
          <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-gray-900">Super admin only</h2>
          <p className="text-gray-600 mt-1">
            Platform settings can only be managed by the super admin.
          </p>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout
      title="Platform Settings"
      subtitle="Global feature switches that apply across every city"
    >
      <div className="space-y-6 max-w-3xl">
        {/* Service availability */}
        <Card className="p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Service Availability</h2>

          <div className="flex items-start justify-between gap-4 py-3 border-t border-gray-100">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                <Wheat className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Atta Chakki service</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  When off, the website &amp; app show a friendly “coming soon” message instead of the
                  ordering screen. No data or routes are removed — turn it back on anytime.
                </p>
              </div>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={attaEnabled}
              disabled={isLoading}
              onClick={() => setAttaEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                attaEnabled ? 'bg-primary-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  attaEnabled ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="mt-5">
            <Button
              onClick={() => saveMutation.mutate({ attaChakkiEnabled: attaEnabled })}
              isLoading={saveMutation.isPending}
              disabled={isLoading}
            >
              <Save className="w-4 h-4 mr-2" />
              Save changes
            </Button>
          </div>
        </Card>

        {/* AI chatbot */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary-600" /> AI Assistant
            </h2>
            {ai?.enabled ? (
              <span className="inline-flex items-center gap-1 text-sm text-green-600">
                <CheckCircle2 className="w-4 h-4" /> Live
              </span>
            ) : (
              <span className="text-sm text-gray-400">Off</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Paste an API key to switch the customer chatbot on. The key is stored securely on the
            server and never shown again. Keep replies cheap by choosing a small/fast model.
          </p>

          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Select
                label="Provider"
                options={AI_PROVIDERS}
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value)}
              />
              <Input
                label="Model (optional)"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="e.g. claude-haiku-4-5-20251001"
              />
            </div>

            {aiProvider === 'openai-compatible' && (
              <Input
                label="Base URL"
                value={aiBaseUrl}
                onChange={(e) => setAiBaseUrl(e.target.value)}
                placeholder="https://your-endpoint/v1"
              />
            )}

            <div>
              <Input
                label="API key"
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder={ai?.hasKey ? '•••••••••• (key set — leave blank to keep)' : 'Paste API key'}
              />
              {ai?.hasKey && (
                <button
                  type="button"
                  onClick={() => aiClearKeyMutation.mutate()}
                  className="mt-1 text-xs text-red-600 hover:underline"
                >
                  Remove saved key (turns the assistant off)
                </button>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={!aiDisabled}
                onChange={(e) => setAiDisabled(!e.target.checked)}
              />
              Assistant enabled (uncheck to temporarily turn it off without removing the key)
            </label>

            <Button onClick={() => aiSaveMutation.mutate()} isLoading={aiSaveMutation.isPending}>
              <Save className="w-4 h-4 mr-2" /> Save AI settings
            </Button>
          </div>
        </Card>

        {/* Marketing */}
        <Card className="p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-1 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary-600" /> Marketing &amp; Retargeting
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Add ad-platform pixel IDs to build retargeting audiences, and auto-remind registered
            customers who left items in their cart.
          </p>

          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                label="Facebook Pixel ID"
                value={fbPixel}
                onChange={(e) => setFbPixel(e.target.value)}
                placeholder="e.g. 123456789012345"
              />
              <Input
                label="Google Tag / GA4 ID"
                value={googleTag}
                onChange={(e) => setGoogleTag(e.target.value)}
                placeholder="e.g. G-XXXXXXX"
              />
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={reminderEnabled}
                  onChange={(e) => setReminderEnabled(e.target.checked)}
                />
                Send abandoned-cart reminders
              </label>
              <div className="w-40">
                <Input
                  label="Remind after (hours)"
                  type="number"
                  value={reminderDelay}
                  onChange={(e) => setReminderDelay(Number(e.target.value) || 6)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => mktSaveMutation.mutate()} isLoading={mktSaveMutation.isPending}>
                <Save className="w-4 h-4 mr-2" /> Save marketing settings
              </Button>
              <Button
                variant="outline"
                onClick={() => runRemindersMutation.mutate()}
                isLoading={runRemindersMutation.isPending}
              >
                <Send className="w-4 h-4 mr-2" /> Run reminders now
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </Layout>
  );
};

export default Platform;
