import type { Context, ScheduledEvent } from 'aws-lambda';

import { SCHEDULER_SERVICE } from '@common/constants';
import { Logger } from '@common/logger';

import { dispatchDueUsers } from './dispatcher';

/**
 * EventBridge-triggered entry point (one shared `rate(1 hour)` tick, never
 * per-user). Not an API Gateway event, so this intentionally skips the
 * middy `wrapper` used by HTTP handlers (see `updateSchedule/handler.ts`).
 */
export const main = async (_event: ScheduledEvent, context: Context): Promise<void> => {
  const logger = new Logger(SCHEDULER_SERVICE, context.awsRequestId);

  try {
    const result = await dispatchDueUsers();
    logger.info({ message: 'Scheduler dispatch complete', data: result });
  } catch (err) {
    logger.error(err, 'Scheduler dispatch failed');
  }
};
