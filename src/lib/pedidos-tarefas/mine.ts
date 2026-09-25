import type { Id } from './types';

export function isMyTask(
  task: { assigneeUserId: Id | null },
  viewerId: Id
): boolean {
  return task.assigneeUserId === viewerId;
}
