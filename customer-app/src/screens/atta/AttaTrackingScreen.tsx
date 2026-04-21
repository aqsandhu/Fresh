import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { AttaStackParamList, AttaRequest, AttaRequestStatus } from '@types';
import { COLORS, SPACING, BORDER_RADIUS, ATTA_STATUS_MESSAGES } from '@utils/constants';
import { formatCurrency, formatDateTime } from '@utils/helpers';
import { ErrorView, LoadingOverlay } from '@components';
import { attaService } from '@services/atta.service';

type AttaTrackingRouteProp = RouteProp<AttaStackParamList, 'AttaTracking'>;

const statusOrder: AttaRequestStatus[] = [
  'pending_pickup',
  'picked_up',
  'at_mill',
  'milling',
  'ready_for_delivery',
  'out_for_delivery',
  'delivered',
];

export const AttaTrackingScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AttaStackParamList>>();
  const route = useRoute<AttaTrackingRouteProp>();
  const { requestId } = route.params;
  
  const [request, setRequest] = useState<AttaRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRequest = useCallback(async () => {
    try {
      setError(null);
      const response = await attaService.getRequestById(requestId);
      if (response.success) {
        setRequest(response.data);
      } else {
        setError('Request not found');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load request');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    loadRequest();
  }, [loadRequest]);

  const getStatusIndex = (status: AttaRequestStatus) => {
    return statusOrder.indexOf(status);
  };

  const currentStatusIndex = request ? getStatusIndex(request.status) : -1;

  if (error && !loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorView message={error} onRetry={loadRequest} />
      </SafeAreaView>
    );
  }

  if (loading || !request) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingOverlay visible={true} message="Loading..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>Track Request</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Request Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View>
              <Text style={styles.infoLabel}>Request ID</Text>
              <Text style={styles.infoValue}>{request.id}</Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>
                {ATTA_STATUS_MESSAGES[request.status]?.en}
              </Text>
            </View>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <View>
              <Text style={styles.infoLabel}>Wheat Weight</Text>
              <Text style={styles.infoValue}>{request.wheatWeight} kg</Text>
            </View>
            <View>
              <Text style={styles.infoLabel}>Total Price</Text>
              <Text style={styles.infoValue}>
                {formatCurrency(request.totalPrice)}
              </Text>
            </View>
          </View>
        </View>

        {/* Status Timeline */}
        <View style={styles.timelineSection}>
          <Text style={styles.sectionTitle}>Status Timeline</Text>
          <View style={styles.timeline}>
            {statusOrder.map((status, index) => {
              const isCompleted = index <= currentStatusIndex;
              const isCurrent = index === currentStatusIndex;

              return (
                <View key={status} style={styles.timelineItem}>
                  <View style={styles.timelineLeft}>
                    <View
                      style={[
                        styles.timelineDot,
                        isCompleted && styles.timelineDotCompleted,
                        isCurrent && styles.timelineDotCurrent,
                      ]}
                    >
                      {isCompleted && (
                        <MaterialIcons
                          name="check"
                          size={14}
                          color={COLORS.white}
                        />
                      )}
                    </View>
                    {index < statusOrder.length - 1 && (
                      <View
                        style={[
                          styles.timelineLine,
                          index < currentStatusIndex && styles.timelineLineCompleted,
                        ]}
                      />
                    )}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text
                      style={[
                        styles.timelineTitle,
                        isCompleted && styles.timelineTitleCompleted,
                        isCurrent && styles.timelineTitleCurrent,
                      ]}
                    >
                      {ATTA_STATUS_MESSAGES[status]?.en}
                    </Text>
                    <Text style={styles.timelineUrdu}>
                      {ATTA_STATUS_MESSAGES[status]?.ur}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Pickup Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pickup Details</Text>
          <View style={styles.detailCard}>
            <View style={styles.detailItem}>
              <MaterialIcons name="location-on" size={20} color={COLORS.gray400} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Address</Text>
                <Text style={styles.detailValue}>
                  {request.pickupAddress.fullAddress}
                </Text>
              </View>
            </View>
            <View style={styles.detailItem}>
              <MaterialIcons name="schedule" size={20} color={COLORS.gray400} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Preferred Time</Text>
                <Text style={styles.detailValue}>
                  {request.preferredSlot.label}
                </Text>
              </View>
            </View>
            {request.estimatedCompletion && (
              <View style={styles.detailItem}>
                <MaterialIcons name="event" size={20} color={COLORS.gray400} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Estimated Completion</Text>
                  <Text style={styles.detailValue}>
                    {formatDateTime(request.estimatedCompletion)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Notes */}
        {request.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{request.notes}</Text>
            </View>
          </View>
        )}

        {/* Bottom padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  infoCard: {
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.primaryLighter,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: COLORS.gray500,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray900,
    marginTop: 2,
  },
  infoDivider: {
    height: 1,
    backgroundColor: COLORS.gray200,
    marginVertical: SPACING.md,
  },
  statusBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.white,
  },
  timelineSection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.gray900,
    marginBottom: SPACING.md,
  },
  timeline: {
    paddingLeft: SPACING.sm,
  },
  timelineItem: {
    flexDirection: 'row',
  },
  timelineLeft: {
    alignItems: 'center',
    width: 24,
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.gray300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineDotCompleted: {
    backgroundColor: COLORS.success,
  },
  timelineDotCurrent: {
    backgroundColor: COLORS.primary,
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.gray200,
    marginVertical: 4,
  },
  timelineLineCompleted: {
    backgroundColor: COLORS.success,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  timelineTitle: {
    fontSize: 14,
    color: COLORS.gray500,
  },
  timelineTitleCompleted: {
    color: COLORS.gray700,
    fontWeight: '500',
  },
  timelineTitleCurrent: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: 16,
  },
  timelineUrdu: {
    fontSize: 12,
    color: COLORS.gray400,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  detailCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  detailContent: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.gray500,
  },
  detailValue: {
    fontSize: 14,
    color: COLORS.gray900,
    marginTop: 2,
  },
  notesCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  notesText: {
    fontSize: 14,
    color: COLORS.gray700,
    lineHeight: 20,
  },
  bottomPadding: {
    height: SPACING.xxl,
  },
});

export default AttaTrackingScreen;
