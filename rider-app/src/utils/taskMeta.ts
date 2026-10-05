import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Task, TaskStatus, TaskType } from '../types';
import type { Tone } from '../theme';
import { colors } from '../theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export const taskStatusTone: Record<TaskStatus, Tone> = {
  assigned: 'info',
  in_progress: 'primary',
  completed: 'success',
  cancelled: 'neutral',
  failed: 'danger',
};

export const taskStatusIcon: Record<TaskStatus, IconName> = {
  assigned: 'clipboard-text-clock-outline',
  in_progress: 'motorbike',
  completed: 'check-decagram',
  cancelled: 'cancel',
  failed: 'alert-circle',
};

export const taskTypeIcon: Record<TaskType, IconName> = {
  delivery: 'truck-delivery-outline',
  pickup: 'package-variant',
  atta_pickup: 'grain',
  atta_delivery: 'sack',
};

export const taskTypeColor: Record<TaskType, string> = {
  delivery: colors.primary,
  pickup: colors.info,
  atta_pickup: colors.warning,
  atta_delivery: colors.purple,
};

export const isAttaTask = (task: Pick<Task, 'type'>): boolean =>
  task.type === 'atta_pickup' || task.type === 'atta_delivery';

/** Which primary action the bottom bar offers for a task state. */
export type PrimaryAction = 'pickup' | 'deliver' | null;
export const primaryActionFor = (status: TaskStatus): PrimaryAction => {
  if (status === 'assigned') return 'pickup';
  if (status === 'in_progress') return 'deliver';
  return null;
};
