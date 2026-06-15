import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Star, Loader2, Eye, EyeOff, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { Layout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  feedbackService,
  type AdminReview,
  type ReviewTargetType,
} from '@/services/feedback.service';
import { useCityContext } from '@/context/CityContext';
import { formatDateTime } from '@/utils/formatters';

const TABS: { value: ReviewTargetType | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'product', label: 'Products' },
  { value: 'rider', label: 'Riders' },
  { value: 'service', label: 'Company Service' },
];

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((p) => (
        <Star
          key={p}
          className={`w-4 h-4 ${p <= value ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`}
        />
      ))}
    </span>
  );
}

export const Reviews: React.FC = () => {
  const { selectedCityId } = useCityContext();
  const [target, setTarget] = useState<ReviewTargetType | ''>('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-reviews', selectedCityId, target],
    queryFn: () => feedbackService.listReviews(target || undefined),
  });

  const reviews = data?.reviews ?? [];
  const counts = data?.counts ?? {};

  return (
    <Layout title="Reviews" subtitle="Moderate product, rider and service reviews">
      <Card className="mb-6">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = target === t.value;
            const count = t.value ? counts[t.value] : undefined;
            return (
              <button
                key={t.value || 'all'}
                onClick={() => setTarget(t.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t.label}
                {count != null && count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary-600" />
        </div>
      ) : reviews.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-gray-500">
            <Star className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            No reviews found.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      )}
    </Layout>
  );
};

function targetTitle(r: AdminReview): string {
  if (r.targetType === 'product') return r.productName || 'Product';
  if (r.targetType === 'rider') return r.riderName ? `Rider: ${r.riderName}` : 'Rider';
  return 'Company Service';
}

function ReviewCard({ review }: { review: AdminReview }) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState(review.adminReply || '');
  const [showReply, setShowReply] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: { isPublished?: boolean; adminReply?: string | null }) =>
      feedbackService.updateReview(review.id, payload),
    onSuccess: () => {
      toast.success('Review updated');
      queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Update failed'),
  });

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">{targetTitle(review)}</h3>
            <Badge variant="info">{review.targetType}</Badge>
            {!review.isPublished && <Badge variant="error">Hidden</Badge>}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Stars value={review.rating} />
            <span className="text-xs text-gray-400">
              {review.authorName || 'Customer'}
              {review.orderNumber ? ` · Order #${review.orderNumber}` : ''}
            </span>
          </div>
          {review.comment && <p className="text-sm text-gray-700 mt-2">{review.comment}</p>}
          {review.adminReply && !showReply && (
            <div className="mt-2 bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs font-semibold text-primary-700">Reply</p>
              <p className="text-sm text-gray-700 mt-0.5">{review.adminReply}</p>
            </div>
          )}
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {formatDateTime(review.createdAt)}
        </span>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => mutation.mutate({ isPublished: !review.isPublished })}
          disabled={mutation.isPending}
        >
          {review.isPublished ? (
            <>
              <EyeOff className="w-4 h-4 mr-1" /> Hide
            </>
          ) : (
            <>
              <Eye className="w-4 h-4 mr-1" /> Show
            </>
          )}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowReply((v) => !v)}>
          <MessageSquare className="w-4 h-4 mr-1" /> {review.adminReply ? 'Edit reply' : 'Reply'}
        </Button>
      </div>

      {showReply && (
        <div className="mt-3 space-y-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            placeholder="Public reply to this review..."
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                mutation.mutate({ adminReply: reply.trim() || null });
                setShowReply(false);
              }}
              disabled={mutation.isPending}
            >
              Save reply
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowReply(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default Reviews;
