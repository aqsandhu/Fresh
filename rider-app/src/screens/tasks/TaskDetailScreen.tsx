import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Image, TouchableOpacity, TextInput, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useTaskStore, QueuedOfflineError } from '../../store/taskStore';
import { useDutyStore } from '../../store/dutyStore';
import { useT, tEnum } from '../../i18n';
import { socketService } from '../../services/socket.service';
import { getApiErrorMessage } from '../../services/api';
import { getAccurateLocation, requestLocationPermissions, MAX_ACCURACY_FOR_PIN } from '../../services/location.service';
import Button from '../../components/Button';
import MapPreview from '../../components/MapPreview';
import LoadingSpinner from '../../components/LoadingSpinner';
import { ScreenHeader, Card, Badge, Banner, BottomActionBar, SectionTitle, InfoRow, Sheet, EmptyState } from '../../components/ui';
import { BOTTOM_BAR_CONTENT_PADDING } from '../../components/ui/BottomActionBar';
import { colors, radius, spacing, typography } from '../../theme';
import { formatCurrency, formatDate, formatSlotRange, formatDateTime, openNavigation, openDialer, openWhatsApp } from '../../utils/helpers';
import { taskStatusTone, taskStatusIcon, isAttaTask, primaryActionFor } from '../../utils/taskMeta';
import { RootStackParamList, Task, GeoPoint, PROBLEM_REASONS, ProblemReason, taskReference, isTerminalTaskStatus } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TaskDetailScreen: React.FC = () => {
  const { t, language } = useT();
  const navigation = useNavigation<Nav>();
  const { taskId } = useRoute<RouteProp<RootStackParamList, 'TaskDetail'>>().params;

  const storeTask = useTaskStore((s) => [...s.activeTasks, ...s.completedTasks].find((x) => x.id === taskId) ?? null);
  const { fetchTaskById, markPickedUp, markDelivered, failTask, requestCustomerCall, pinLocation, uploadDoorPicture, pendingTaskIds } = useTaskStore();
  const lastFix = useDutyStore((s) => s.lastFix);

  const [task, setTask] = useState<Task | null>(storeTask);
  const [loading, setLoading] = useState(!storeTask);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCalling, setIsCalling] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [adjusted, setAdjusted] = useState<GeoPoint | null>(null);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [problemOpen, setProblemOpen] = useState(false);

  const busy = pendingTaskIds.includes(taskId);

  const load = useCallback(async () => {
    try {
      setLoadError(null);
      const fresh = await fetchTaskById(taskId);
      setTask(fresh);
    } catch (error) {
      setLoadError(getApiErrorMessage(error, t('detail.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [taskId, fetchTaskById, t]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep in sync with store updates (socket refresh, offline replay).
  useEffect(() => {
    if (storeTask) setTask(storeTask);
  }, [storeTask]);

  // Live order updates (admin cancel, etc.).
  useEffect(() => {
    const orderId = task?.orderId;
    if (!orderId) return;
    socketService.connect();
    socketService.subscribeToOrder(orderId);
    const onUpdate = (data: { orderId?: string }) => {
      if (!data?.orderId || data.orderId === orderId) load();
    };
    socketService.on('order:update', onUpdate);
    return () => {
      socketService.off('order:update', onUpdate);
      socketService.unsubscribeFromOrder(orderId);
    };
  }, [task?.orderId, load]);

  const atta = task ? isAttaTask(task) : false;
  const terminal = task ? isTerminalTaskStatus(task.status) : true;
  const primary = task ? primaryActionFor(task.status) : null;
  const displayPoint = adjusted ?? task?.location ?? null;

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleNavigate = () => {
    if (task?.location) openNavigation(task.location, task.address).catch(() => {});
  };

  const handlePickup = () => {
    if (!task) return;
    Alert.alert(t('action.pickupConfirmTitle'), t('action.pickupConfirmBody', { orderNumber: taskReference(task) }), [
      { text: t('common.no'), style: 'cancel' },
      {
        text: t('common.yes'),
        onPress: async () => {
          try {
            const updated = await markPickedUp(task.id);
            setTask(updated);
          } catch (error) {
            if (error instanceof QueuedOfflineError) {
              Alert.alert(t('action.pickedUp'), t('action.pickupQueued'));
              return;
            }
            Alert.alert(t('action.pickupFailed'), getApiErrorMessage(error));
          }
        },
      },
    ]);
  };

  const handleDeliver = async (notes: string) => {
    if (!task) return;
    try {
      await markDelivered(task.id, notes || undefined);
      setDeliverOpen(false);
      Alert.alert(t('action.delivered'), t('action.deliverDone'), [{ text: t('common.ok'), onPress: () => navigation.goBack() }]);
    } catch (error) {
      if (error instanceof QueuedOfflineError) {
        setDeliverOpen(false);
        Alert.alert(t('action.delivered'), t('action.deliverQueued'), [{ text: t('common.ok'), onPress: () => navigation.goBack() }]);
        return;
      }
      Alert.alert(t('action.deliverFailed'), getApiErrorMessage(error));
    }
  };

  const handleProblem = async (reason: ProblemReason, details: string) => {
    if (!task) return;
    // Stored in rider_tasks.notes — English label keeps it readable for admins.
    const label = tEnumReason(reason);
    const note = details.trim() ? `${label}: ${details.trim()}` : label;
    try {
      await failTask(task.id, note);
      setProblemOpen(false);
      Alert.alert(t('action.reportProblem'), t('action.problemDone'), [{ text: t('common.ok'), onPress: () => navigation.goBack() }]);
    } catch (error) {
      Alert.alert(t('action.problemFailed'), getApiErrorMessage(error));
    }
  };

  const handleCall = async () => {
    if (!task) return;
    if (task.phoneVisible && task.customerPhone) {
      openDialer(task.customerPhone).catch(() => {});
      return;
    }
    if (!task.orderId) return;
    setIsCalling(true);
    try {
      const number = await requestCustomerCall(task.orderId);
      if (number) openDialer(number).catch(() => {});
      else Alert.alert(t('detail.call'), t('detail.callNoNumber'));
    } catch (error) {
      // 403 carries the admin-facing explanation — show it verbatim.
      Alert.alert(t('detail.callFailed'), getApiErrorMessage(error));
    } finally {
      setIsCalling(false);
    }
  };

  const handleWhatsApp = () => {
    if (!task?.customerPhone) return;
    openWhatsApp(task.customerPhone, t('detail.whatsappMessage', { orderNumber: taskReference(task) })).catch(() => {});
  };

  const savePin = async (point: GeoPoint, accuracy?: number) => {
    if (!task) return;
    setIsPinning(true);
    try {
      await pinLocation(task.id, point.latitude, point.longitude);
      setAdjusted(null);
      setTask((prev) => (prev ? { ...prev, location: point, hasPin: true, pinnedBy: 'rider' } : prev));
      const acc = accuracy === undefined ? '' : accuracy < 1 ? '< 1 m' : `~${Math.round(accuracy)} m`;
      Alert.alert(t('common.save'), accuracy === undefined ? t('detail.adjustedSaved') : t('detail.pinSaved', { acc }));
    } catch (error) {
      Alert.alert(t('detail.pinFailed'), getApiErrorMessage(error));
    } finally {
      setIsPinning(false);
    }
  };

  const handlePinHere = async () => {
    setIsPinning(true);
    try {
      const permission = await requestLocationPermissions();
      if (permission === 'denied') {
        Alert.alert(t('duty.permissionTitle'), t('duty.permissionBody'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
        ]);
        return;
      }
      const fix = await getAccurateLocation(MAX_ACCURACY_FOR_PIN);
      if (!fix) {
        Alert.alert(t('detail.pinNow'), t('detail.pinNoGps', { m: MAX_ACCURACY_FOR_PIN }));
        return;
      }
      await savePin({ latitude: fix.latitude, longitude: fix.longitude }, fix.accuracy ?? 0);
    } finally {
      setIsPinning(false);
    }
  };

  const handlePhoto = async () => {
    if (!task) return;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(t('detail.doorPhoto'), t('detail.cameraDenied'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
        ]);
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: false });
      if (result.canceled || !result.assets?.[0]) return;
      setIsUploading(true);
      const url = await uploadDoorPicture(task.id, result.assets[0].uri);
      setTask((prev) => (prev ? { ...prev, doorPictureUrl: url } : prev));
      Alert.alert(t('detail.doorPhoto'), t('detail.photoSaved'));
    } catch (error) {
      Alert.alert(t('detail.photoFailed'), getApiErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  };

  const tEnumReason = (reason: ProblemReason) => tEnumProblem(reason);

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t('detail.title')} onBack={() => navigation.goBack()} />
        <LoadingSpinner fullScreen message={t('common.loading')} />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t('detail.title')} onBack={() => navigation.goBack()} />
        <EmptyState
          icon="clipboard-off-outline"
          title={t('detail.notFound')}
          body={loadError ?? undefined}
          action={<Button title={t('common.retry')} onPress={() => { setLoading(true); load(); }} variant="outline" />}
        />
      </View>
    );
  }

  const schedule = task.isUrgent
    ? t('detail.urgentEta', { eta: task.urgentEta || '—' })
    : [task.requestedDate ? formatDate(task.requestedDate) : null, task.timeSlotName, formatSlotRange(task.slotStart, task.slotEnd)]
        .filter(Boolean)
        .join(' · ');

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={`${t(atta ? 'tasks.request' : 'tasks.order')} #${taskReference(task)}`}
        subtitle={tEnum(language, 'taskType', task.type)}
        onBack={() => navigation.goBack()}
        right={<Badge label={tEnum(language, 'taskStatus', task.status)} tone={taskStatusTone[task.status]} icon={taskStatusIcon[task.status]} size="lg" />}
      />

      <ScrollView contentContainerStyle={[styles.content, !terminal && { paddingBottom: BOTTOM_BAR_CONTENT_PADDING }]} showsVerticalScrollIndicator={false}>
        {loadError ? <Banner tone="warning" icon="alert-circle-outline" message={loadError} actionLabel={t('common.retry')} onAction={load} style={styles.block} /> : null}
        {task.isUrgent ? <Banner tone="danger" icon="lightning-bolt" title={t('tasks.urgent')} message={t('detail.urgentEta', { eta: task.urgentEta || '—' })} style={styles.block} /> : null}

        {/* Deliver to */}
        <View style={styles.block}>
          <SectionTitle title={t(task.type === 'pickup' || task.type === 'atta_pickup' ? 'detail.pickupFrom' : 'detail.deliverTo')} />
          <Card padded={false}>
            {displayPoint ? (
              <MapPreview
                point={displayPoint}
                riderPoint={lastFix}
                title={task.address}
                onNavigate={task.location ? handleNavigate : undefined}
                draggable={!terminal}
                onMarkerDragEnd={(p) => setAdjusted(p)}
                height={230}
              />
            ) : (
              <View style={styles.noMap}>
                <MaterialCommunityIcons name="map-marker-off-outline" size={28} color={colors.gray400} />
                <Text style={styles.noMapText}>{t('detail.noMapPin')}</Text>
              </View>
            )}
            {adjusted && !terminal ? (
              <View style={styles.adjustRow}>
                <Button title={t('detail.adjustedSave')} onPress={() => savePin(adjusted)} size="small" loading={isPinning} style={styles.flex} />
                <Button title={t('detail.adjustedReset')} onPress={() => setAdjusted(null)} size="small" variant="ghost" />
              </View>
            ) : null}

            <View style={styles.addressBox}>
              <View style={styles.addressRow}>
                <View style={styles.flex}>
                  <Text style={styles.addressText}>{task.address || '—'}</Text>
                  {task.landmark ? <Text style={styles.addressMeta}>{t('tasks.near')} {task.landmark}</Text> : null}
                  {task.area || task.city ? <Text style={styles.addressMeta}>{[task.area, task.city].filter(Boolean).join(', ')}</Text> : null}
                </View>
                {task.houseNumber ? (
                  <View style={styles.houseBlock}>
                    <Text style={styles.houseLabel}>{t('tasks.house')}</Text>
                    <Text style={styles.houseValue} adjustsFontSizeToFit numberOfLines={1}>{task.houseNumber}</Text>
                  </View>
                ) : null}
              </View>

              {!terminal ? (
                task.hasPin ? (
                  <View style={styles.pinRow}>
                    <MaterialCommunityIcons name="map-marker-check" size={16} color={colors.success} />
                    <Text style={styles.pinText}>
                      {t('detail.pinnedBy', { who: task.pinnedBy === 'rider' ? t('detail.pinnedByRider') : t('detail.pinnedByCustomer') })}
                    </Text>
                    <TouchableOpacity onPress={handlePinHere} disabled={isPinning} hitSlop={8}>
                      <Text style={styles.pinLink}>{isPinning ? t('common.loading') : t('detail.pinUpdate')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.pinPrompt}>
                    <Text style={styles.pinPromptText}>{t('detail.pinPrompt')}</Text>
                    <Button title={t('detail.pinNow')} icon="crosshairs-gps" onPress={handlePinHere} size="small" loading={isPinning} />
                  </View>
                )
              ) : null}
            </View>
          </Card>
        </View>

        {/* Door photo */}
        {!atta ? (
          <View style={styles.block}>
            <SectionTitle title={t('detail.doorPhoto')} />
            <Card padded={false}>
              {task.doorPictureUrl ? <Image source={{ uri: task.doorPictureUrl }} style={styles.doorImage} resizeMode="cover" /> : null}
              {!terminal ? (
                <View style={styles.photoRow}>
                  {!task.doorPictureUrl ? <Text style={styles.pinPromptText}>{t('detail.doorPhotoPrompt')}</Text> : null}
                  <Button
                    title={task.doorPictureUrl ? t('detail.updatePhoto') : t('detail.addPhoto')}
                    icon="camera-outline"
                    variant={task.doorPictureUrl ? 'outline' : 'primary'}
                    size="small"
                    onPress={handlePhoto}
                    loading={isUploading}
                  />
                </View>
              ) : null}
            </Card>
          </View>
        ) : null}

        {/* Schedule */}
        {schedule ? (
          <View style={styles.block}>
            <Card>
              <InfoRow icon={task.isUrgent ? 'lightning-bolt' : 'calendar-clock'} iconColor={task.isUrgent ? colors.danger : colors.gray500} label={t('detail.schedule')} value={schedule} />
            </Card>
          </View>
        ) : null}

        {/* Atta */}
        {atta ? (
          <View style={styles.block}>
            <SectionTitle title={t('detail.atta')} />
            <Card>
              <InfoRow icon="grain" label={t('detail.attaRequest', { number: task.attaRequestNumber || '—' })} value={task.wheatKg ? t('detail.attaWheat', { kg: task.wheatKg }) : '—'} right={task.attaStatus ? <Badge label={tEnum(language, 'attaStatus', task.attaStatus)} tone="warning" /> : null} />
            </Card>
          </View>
        ) : null}

        {/* Items */}
        {task.items && task.items.length > 0 ? (
          <View style={styles.block}>
            <SectionTitle title={t('detail.items')} count={task.items.length} />
            <Card>
              {task.items.map((item, index) => (
                <View key={item.id} style={[styles.itemRow, index > 0 && styles.itemRowBorder]}>
                  {item.image ? <Image source={{ uri: item.image }} style={styles.itemImage} /> : <View style={[styles.itemImage, styles.itemImageFallback]}><MaterialCommunityIcons name="basket-outline" size={18} color={colors.gray400} /></View>}
                  <View style={styles.flex}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>
                      {item.quantity} × {tEnum(language, 'unit', item.unit) || '1'}
                      {item.quality ? `  ·  ${t('unit.quality', { q: item.quality })}` : ''}
                      {item.weightKg ? `  ·  ${item.weightKg} kg` : ''}
                    </Text>
                    {item.instructions ? <Text style={styles.itemNote}>{item.instructions}</Text> : null}
                  </View>
                  <Text style={styles.itemPrice}>{formatCurrency(item.totalPrice)}</Text>
                </View>
              ))}
              <View style={styles.totals}>
                {task.subtotal !== undefined ? <TotalRow label={t('detail.subtotal')} value={formatCurrency(task.subtotal)} /> : null}
                {task.discount ? <TotalRow label={t('detail.discount')} value={`− ${formatCurrency(task.discount)}`} /> : null}
                {task.deliveryFee !== undefined ? <TotalRow label={t('detail.deliveryFee')} value={formatCurrency(task.deliveryFee)} /> : null}
                {task.totalAmount !== undefined ? <TotalRow label={t('detail.total')} value={formatCurrency(task.totalAmount)} bold /> : null}
              </View>
            </Card>
          </View>
        ) : null}

        {/* Payment */}
        {task.paymentMethod ? (
          <View style={styles.block}>
            <SectionTitle title={t('detail.payment')} />
            {task.codAmount !== null && task.codAmount > 0 && task.status !== 'completed' ? (
              <View style={styles.codCard}>
                <MaterialCommunityIcons name="cash-multiple" size={28} color={colors.warning} />
                <View style={styles.flex}>
                  <Text style={styles.codLabel}>{t('detail.collectCash')}</Text>
                  <Text style={styles.codAmount}>{formatCurrency(task.codAmount)}</Text>
                  <Text style={styles.codMeta}>{tEnum(language, 'detail.paymentMethod', task.paymentMethod)}</Text>
                </View>
              </View>
            ) : (
              <Card>
                <InfoRow
                  icon={task.paymentMethod === 'cash_on_delivery' ? 'cash' : 'credit-card-outline'}
                  iconColor={colors.success}
                  label={tEnum(language, 'detail.paymentMethod', task.paymentMethod)}
                  value={task.status === 'completed' && task.codAmount ? `${t('earnings.collectedAmount', { amount: formatCurrency(task.codAmount) })}` : t('detail.alreadyPaid')}
                  right={<Badge label={t('tasks.paid')} tone="success" icon="check" />}
                />
              </Card>
            )}
          </View>
        ) : null}

        {/* Customer notes */}
        {task.customerNotes ? (
          <View style={styles.block}>
            <Banner tone="warning" icon="note-text-outline" title={t('detail.customerNotes')} message={task.customerNotes} />
          </View>
        ) : null}

        {/* Contact */}
        {!terminal ? (
          <View style={styles.block}>
            <SectionTitle title={t('detail.contact')} />
            <Card>
              {task.phoneVisible && task.customerPhone ? (
                <>
                  <InfoRow icon="account-outline" label={t('detail.customer')} value={`${task.customerName || t('detail.customer')}\n${task.customerPhone}`} />
                  <View style={styles.contactRow}>
                    <Button title={t('detail.call')} icon="phone" variant="dark" onPress={handleCall} style={styles.flex} />
                    <Button title={t('detail.whatsapp')} icon="whatsapp" variant="success" onPress={handleWhatsApp} style={styles.flex} />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.hiddenHint}>{t('detail.callHiddenHint')}</Text>
                  <Button title={isCalling ? t('detail.calling') : t('detail.callViaApp')} icon="phone-in-talk" variant="dark" onPress={handleCall} loading={isCalling} fullWidth />
                </>
              )}
              {task.orderId ? (
                <Button
                  title={t('detail.chat')}
                  icon="chat-outline"
                  variant="outline"
                  onPress={() => navigation.navigate('Chat', { orderId: task.orderId!, orderNumber: taskReference(task), orderStatus: task.orderStatus })}
                  fullWidth
                  style={{ marginTop: spacing.sm }}
                />
              ) : null}
            </Card>
          </View>
        ) : null}

        {/* Timeline / notes */}
        <View style={styles.block}>
          <Card>
            {task.assignedAt ? <InfoRow icon="clock-plus-outline" value={t('detail.assignedAt', { when: formatDateTime(task.assignedAt) })} /> : null}
            {task.status === 'completed' && task.completedAt ? <InfoRow icon="check-circle-outline" iconColor={colors.success} value={t('action.completedAt', { when: formatDateTime(task.completedAt) })} /> : null}
            {task.status === 'failed' && task.completedAt ? <InfoRow icon="alert-circle-outline" iconColor={colors.danger} value={t('action.failedAt', { when: formatDateTime(task.completedAt) })} /> : null}
            {task.status === 'cancelled' && task.completedAt ? <InfoRow icon="cancel" value={t('action.cancelledAt', { when: formatDateTime(task.completedAt) })} /> : null}
            {task.notes ? <InfoRow icon="note-outline" label={t('detail.notes')} value={task.notes} /> : null}
          </Card>
        </View>
      </ScrollView>

      {/* Sticky actions */}
      {!terminal ? (
        <BottomActionBar>
          {primary === 'pickup' ? (
            <Button title={t('action.pickedUp')} icon="package-variant-closed-check" size="large" fullWidth onPress={handlePickup} loading={busy} testID="action-pickup" />
          ) : null}
          {primary === 'deliver' ? (
            <Button title={t('action.delivered')} icon="check-decagram" variant="success" size="large" fullWidth onPress={() => setDeliverOpen(true)} loading={busy} testID="action-deliver" />
          ) : null}
          <Button title={t('action.reportProblem')} icon="alert-circle-outline" variant="ghost" size="small" fullWidth onPress={() => setProblemOpen(true)} disabled={busy} textStyle={{ color: colors.danger }} />
        </BottomActionBar>
      ) : null}

      <DeliverSheet visible={deliverOpen} task={task} busy={busy} onClose={() => setDeliverOpen(false)} onSubmit={handleDeliver} />
      <ProblemSheet visible={problemOpen} busy={busy} onClose={() => setProblemOpen(false)} onSubmit={handleProblem} />
    </View>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────

const TotalRow: React.FC<{ label: string; value: string; bold?: boolean }> = ({ label, value, bold }) => (
  <View style={styles.totalRow}>
    <Text style={[styles.totalLabel, bold && styles.totalBold]}>{label}</Text>
    <Text style={[styles.totalValue, bold && styles.totalBoldValue]}>{value}</Text>
  </View>
);

const tEnumProblem = (reason: ProblemReason): string =>
  ({
    customer_unreachable: 'Customer not reachable',
    wrong_address: 'Wrong or incomplete address',
    customer_refused: 'Customer refused the order',
    damaged_items: 'Items damaged or missing',
    vehicle_issue: 'Vehicle / personal emergency',
    other: 'Other',
  })[reason];

const DeliverSheet: React.FC<{
  visible: boolean;
  task: Task;
  busy: boolean;
  onClose: () => void;
  onSubmit: (notes: string) => void;
}> = ({ visible, task, busy, onClose, onSubmit }) => {
  const { t } = useT();
  const [cashConfirmed, setCashConfirmed] = useState(false);
  const [notes, setNotes] = useState('');
  const needsCash = task.codAmount !== null && task.codAmount > 0;

  useEffect(() => {
    if (visible) {
      setCashConfirmed(false);
      setNotes('');
    }
  }, [visible]);

  const submit = () => {
    if (needsCash && !cashConfirmed) {
      Alert.alert(t('action.deliverTitle'), t('action.deliverCashRequired'));
      return;
    }
    onSubmit(notes);
  };

  return (
    <Sheet
      visible={visible}
      title={t('action.deliverTitle')}
      onClose={onClose}
      footer={<Button title={t('action.deliverSubmit')} icon="check-decagram" variant="success" size="large" fullWidth onPress={submit} loading={busy} testID="deliver-submit" />}
    >
      {needsCash ? (
        <>
          <View style={styles.sheetCash}>
            <Text style={styles.sheetCashLabel}>{t('action.deliverCashLabel')}</Text>
            <Text style={styles.sheetCashAmount}>{formatCurrency(task.codAmount)}</Text>
          </View>
          <TouchableOpacity style={[styles.checkRow, cashConfirmed && styles.checkRowOn]} onPress={() => setCashConfirmed((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: cashConfirmed }} testID="deliver-cash-check">
            <MaterialCommunityIcons name={cashConfirmed ? 'checkbox-marked' : 'checkbox-blank-outline'} size={28} color={cashConfirmed ? colors.success : colors.gray500} />
            <Text style={styles.checkText}>{t('action.deliverCashConfirm', { amount: formatCurrency(task.codAmount) })}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <Banner tone="success" icon="check-circle-outline" message={t('action.deliverPaidNote')} />
      )}
      <Text style={styles.inputLabel}>{t('action.deliverNoteLabel')}</Text>
      <TextInput style={styles.textArea} value={notes} onChangeText={setNotes} placeholder={t('action.deliverNotePlaceholder')} placeholderTextColor={colors.gray400} multiline maxLength={300} />
    </Sheet>
  );
};

const ProblemSheet: React.FC<{
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: ProblemReason, details: string) => void;
}> = ({ visible, busy, onClose, onSubmit }) => {
  const { t } = useT();
  const [reason, setReason] = useState<ProblemReason | null>(null);
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails('');
    }
  }, [visible]);

  const detailsRequired = reason === 'other';
  const canSubmit = useMemo(() => !!reason && (!detailsRequired || details.trim().length >= 5), [reason, detailsRequired, details]);

  const submit = () => {
    if (!reason) return;
    if (detailsRequired && details.trim().length < 5) {
      Alert.alert(t('action.problemTitle'), t('action.problemDetailsRequired'));
      return;
    }
    Alert.alert(t('action.problemTitle'), t('action.problemBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('action.problemSubmit'), style: 'destructive', onPress: () => onSubmit(reason, details) },
    ]);
  };

  return (
    <Sheet
      visible={visible}
      title={t('action.problemTitle')}
      onClose={onClose}
      footer={<Button title={t('action.problemSubmit')} icon="alert-circle-outline" variant="danger" size="large" fullWidth onPress={submit} loading={busy} disabled={!canSubmit} testID="problem-submit" />}
    >
      <Text style={styles.sheetBody}>{t('action.problemBody')}</Text>
      {PROBLEM_REASONS.map((r) => {
        const on = reason === r;
        return (
          <TouchableOpacity key={r} style={[styles.radioRow, on && styles.radioRowOn]} onPress={() => setReason(r)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <MaterialCommunityIcons name={on ? 'radiobox-marked' : 'radiobox-blank'} size={24} color={on ? colors.danger : colors.gray500} />
            <Text style={[styles.radioText, on && styles.radioTextOn]}>{t(`action.problem.${r}` as const)}</Text>
          </TouchableOpacity>
        );
      })}
      <Text style={styles.inputLabel}>{t('action.problemDetails')}{detailsRequired ? ' *' : ''}</Text>
      <TextInput style={styles.textArea} value={details} onChangeText={setDetails} placeholder={t('action.problemDetailsPlaceholder')} placeholderTextColor={colors.gray400} multiline maxLength={400} />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  block: { marginBottom: spacing.lg },
  flex: { flex: 1 },
  noMap: { height: 110, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray100, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  noMapText: { marginTop: spacing.xs, fontSize: typography.size.sm, color: colors.textMuted },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  addressBox: { padding: spacing.lg },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start' },
  addressText: { fontSize: typography.size.lg, fontWeight: typography.weight.semibold, color: colors.text, lineHeight: typography.size.lg * 1.35 },
  addressMeta: { fontSize: typography.size.sm, color: colors.textSecondary, marginTop: 4 },
  houseBlock: { marginLeft: spacing.md, minWidth: 72, maxWidth: 120, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.gray900, alignItems: 'center' },
  houseLabel: { fontSize: 10, color: colors.gray400, textTransform: 'uppercase', letterSpacing: 0.8 },
  houseValue: { fontSize: typography.size.xxl, fontWeight: typography.weight.heavy, color: colors.white },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  pinText: { flex: 1, fontSize: typography.size.sm, color: colors.success, fontWeight: typography.weight.semibold },
  pinLink: { fontSize: typography.size.sm, color: colors.primaryDark, fontWeight: typography.weight.bold, textDecorationLine: 'underline' },
  pinPrompt: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.warningSoft, gap: spacing.sm },
  pinPromptText: { fontSize: typography.size.sm, color: colors.text, lineHeight: typography.size.sm * 1.5 },
  doorImage: { width: '100%', height: 220, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  photoRow: { padding: spacing.lg, gap: spacing.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.md },
  itemRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemImage: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.gray100 },
  itemImageFallback: { alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text },
  itemMeta: { fontSize: typography.size.sm, color: colors.textSecondary, marginTop: 2 },
  itemNote: { fontSize: typography.size.sm, color: colors.warning, marginTop: 2, fontStyle: 'italic' },
  itemPrice: { fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text },
  totals: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: typography.size.sm, color: colors.textSecondary },
  totalValue: { fontSize: typography.size.sm, color: colors.text },
  totalBold: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: colors.text, marginTop: 4 },
  totalBoldValue: { fontSize: typography.size.lg, fontWeight: typography.weight.bold, color: colors.text, marginTop: 4 },
  codCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, backgroundColor: colors.gray900, borderRadius: radius.lg, padding: spacing.lg },
  codLabel: { fontSize: typography.size.xs, color: colors.gray400, textTransform: 'uppercase', letterSpacing: 0.8 },
  codAmount: { fontSize: typography.size.display, fontWeight: typography.weight.heavy, color: colors.white, marginTop: 2 },
  codMeta: { fontSize: typography.size.sm, color: colors.gray300, marginTop: 2 },
  contactRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  hiddenHint: { fontSize: typography.size.sm, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: typography.size.sm * 1.5 },
  sheetBody: { fontSize: typography.size.sm, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: typography.size.sm * 1.5 },
  sheetCash: { alignItems: 'center', paddingVertical: spacing.lg, backgroundColor: colors.gray900, borderRadius: radius.lg, marginBottom: spacing.md },
  sheetCashLabel: { fontSize: typography.size.xs, color: colors.gray400, textTransform: 'uppercase', letterSpacing: 0.8 },
  sheetCashAmount: { fontSize: typography.size.hero, fontWeight: typography.weight.heavy, color: colors.white },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border },
  checkRowOn: { borderColor: colors.success, backgroundColor: colors.successSoft },
  checkText: { flex: 1, fontSize: typography.size.md, fontWeight: typography.weight.semibold, color: colors.text },
  inputLabel: { fontSize: typography.size.sm, fontWeight: typography.weight.semibold, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.xs },
  textArea: { minHeight: 80, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, fontSize: typography.size.md, color: colors.text, textAlignVertical: 'top', backgroundColor: colors.gray50 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  radioRowOn: { backgroundColor: colors.dangerSoft },
  radioText: { fontSize: typography.size.md, color: colors.text },
  radioTextOn: { fontWeight: typography.weight.bold, color: colors.danger },
});

export default TaskDetailScreen;
