import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';
import { COLORS, SPACING, BORDER_RADIUS } from '@utils/constants';
import { StarRating } from '@components/common/StarRating';
import { feedbackService } from '@services/feedback.service';
import { ReviewTargetType } from '@app-types';

export interface ReviewTarget {
  type: ReviewTargetType;
  label: string;
  productId?: string;
  image?: string | null;
}

interface ReviewModalProps {
  visible: boolean;
  orderId: string;
  target: ReviewTarget | null;
  initialRating?: number;
  initialComment?: string;
  onClose: () => void;
  onSubmitted: () => void;
}

const RATING_LABELS = ['', 'بہت خراب', 'خراب', 'ٹھیک', 'اچھا', 'بہترین'];

export const ReviewModal: React.FC<ReviewModalProps> = ({
  visible,
  orderId,
  target,
  initialRating = 0,
  initialComment = '',
  onClose,
  onSubmitted,
}) => {
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setRating(initialRating);
      setComment(initialComment);
    }
  }, [visible, initialRating, initialComment]);

  const handleSubmit = async () => {
    if (!target) return;
    if (rating < 1) {
      Toast.show({ type: 'error', text1: 'براہِ کرم ستارے منتخب کریں' });
      return;
    }
    setSubmitting(true);
    try {
      await feedbackService.submitReview({
        targetType: target.type,
        orderId,
        productId: target.productId,
        rating,
        comment: comment.trim() || undefined,
      });
      Toast.show({ type: 'success', text1: 'شکریہ! آپ کی رائے موصول ہو گئی' });
      onSubmitted();
      onClose();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err?.message || 'رائے جمع نہیں ہو سکی' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {target?.label}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <MaterialIcons name="close" size={22} color={COLORS.gray500} />
            </TouchableOpacity>
          </View>

          {target?.image ? (
            <Image source={{ uri: target.image }} style={styles.image} />
          ) : null}

          <View style={styles.starsWrap}>
            <StarRating value={rating} onChange={setRating} size={40} />
            <Text style={styles.ratingLabel}>{RATING_LABELS[rating] || 'درجہ بندی کریں'}</Text>
          </View>

          <TextInput
            style={styles.input}
            placeholder="اپنی رائے لکھیں (اختیاری)"
            placeholderTextColor={COLORS.gray400}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={2000}
            textAlign="right"
          />

          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.submitText}>رائے جمع کریں</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.gray900, marginRight: SPACING.sm },
  image: {
    width: 64,
    height: 64,
    borderRadius: BORDER_RADIUS.md,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  starsWrap: { alignItems: 'center', marginBottom: SPACING.md },
  ratingLabel: {
    marginTop: SPACING.sm,
    fontSize: 14,
    fontWeight: '600',
    color: '#b45309',
    writingDirection: 'rtl',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    minHeight: 80,
    textAlignVertical: 'top',
    color: COLORS.gray900,
    marginBottom: SPACING.md,
    writingDirection: 'rtl',
  },
  submitBtn: {
    backgroundColor: COLORS.primary600,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
});

export default ReviewModal;
