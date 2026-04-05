import crypto from 'crypto';

const DAILY_DIGEST_ROLES = ['serviceHead', 'director', 'salesManager', 'owner'];
const WEEKLY_DIGEST_ROLES = ['owner', 'director'];

function hashPayload(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function plusHours(date, hours) {
  return new Date(date.getTime() + (hours * 60 * 60 * 1000)).toISOString();
}

function inferSeverity(message = '') {
  if (String(message || '').includes('🚨')) return 'critical';
  if (String(message || '').includes('📌') || String(message || '').includes('💼')) return 'warning';
  return 'info';
}

export class NotificationCenterService {
  constructor({ serviceOpsRepository, executiveNotifier, dedupeWindowMinutes = 90, retryLimit = 2 } = {}) {
    this.serviceOpsRepository = serviceOpsRepository;
    this.executiveNotifier = executiveNotifier;
    this.dedupeWindowMinutes = dedupeWindowMinutes;
    this.retryLimit = retryLimit;
  }

  buildSchedulePlan(now = new Date()) {
    return {
      generatedAt: now.toISOString(),
      daily: {
        serviceHead: { digestType: 'daily_service_head', nextRunAt: plusHours(now, 24) },
        director: { digestType: 'daily_director', nextRunAt: plusHours(now, 24) },
        salesManager: { digestType: 'daily_sales_manager', nextRunAt: plusHours(now, 24) },
        owner: { digestType: 'daily_owner', nextRunAt: plusHours(now, 24) },
      },
      weekly: {
        executive: { digestType: 'weekly_executive_report', nextRunAt: plusHours(now, 24 * 7) },
      },
    };
  }

  async runScheduledDigests({ includeWeekly = false } = {}) {
    const daily = await this.runDigest({
      digestType: 'daily_operational',
      roles: DAILY_DIGEST_ROLES,
      trigger: 'scheduled',
    });

    if (!includeWeekly) return { daily, weekly: null };

    const weekly = await this.runDigest({
      digestType: 'weekly_executive_report',
      roles: WEEKLY_DIGEST_ROLES,
      trigger: 'scheduled',
    });

    return { daily, weekly };
  }

  async runDigest({ digestType = 'manual_digest', roles = [], trigger = 'manual' } = {}) {
    if (!this.executiveNotifier) {
      return { generatedAt: new Date().toISOString(), digestType, roles, error: 'notifier_unavailable', results: [] };
    }

    const metrics = await this.serviceOpsRepository.dashboard({});
    const alertState = metrics?.alerts || {};
    const templates = this.executiveNotifier.buildTemplates({ alertState, metrics });
    const dedupedRoles = [...new Set(roles.length ? roles : Object.keys(templates))].filter((role) => templates[role]);
    const results = [];

    for (const role of dedupedRoles) {
      const recipients = this.executiveNotifier.getRecipients(role);
      const message = templates[role];
      const severity = inferSeverity(message);
      const payloadHash = hashPayload(`${digestType}|${role}|${message}`);

      if (!recipients.length) {
        results.push({ role, status: 'failed', reason: 'chat_ids_missing', sent: 0, failed: 0 });
        continue;
      }

      let sent = 0;
      let failed = 0;
      for (const recipientChatId of recipients) {
        const duplicate = await this.serviceOpsRepository.findRecentNotificationDuplicate({
          channel: 'telegram',
          recipientRole: role,
          recipientChatId,
          digestType,
          payloadHash,
          windowMinutes: this.dedupeWindowMinutes,
        });
        if (duplicate) {
          await this.serviceOpsRepository.createNotificationLog({
            channel: 'telegram',
            recipientRole: role,
            recipientChatId,
            digestType,
            severity,
            payloadHash,
            payloadPreview: message.slice(0, 400),
            status: 'skipped_duplicate',
            sentAt: new Date().toISOString(),
            triggerType: trigger,
            retryCount: duplicate.retryCount || 0,
          });
          continue;
        }

        try {
          await this.executiveNotifier.sendToChat(recipientChatId, message);
          sent += 1;
          await this.serviceOpsRepository.createNotificationLog({
            channel: 'telegram',
            recipientRole: role,
            recipientChatId,
            digestType,
            severity,
            payloadHash,
            payloadPreview: message.slice(0, 400),
            status: 'sent',
            sentAt: new Date().toISOString(),
            triggerType: trigger,
            retryCount: 0,
          });
        } catch (error) {
          failed += 1;
          const status = this.retryLimit > 0 ? 'retry_pending' : 'failed';
          await this.serviceOpsRepository.createNotificationLog({
            channel: 'telegram',
            recipientRole: role,
            recipientChatId,
            digestType,
            severity,
            payloadHash,
            payloadPreview: message.slice(0, 400),
            status,
            sentAt: new Date().toISOString(),
            errorMessage: error?.message || String(error),
            triggerType: trigger,
            retryCount: 0,
          });
        }
      }

      results.push({ role, status: failed ? 'partial' : 'sent', sent, failed });
    }

    return {
      generatedAt: new Date().toISOString(),
      digestType,
      trigger,
      roles: dedupedRoles,
      templates,
      results,
    };
  }

  async retryPending({ limit = 20 } = {}) {
    const pending = await this.serviceOpsRepository.listPendingNotificationRetries({ limit });
    const retried = [];

    for (const item of pending) {
      try {
        await this.executiveNotifier.sendToChat(item.recipientChatId, item.payloadPreview || 'Retry digest');
        await this.serviceOpsRepository.updateNotificationLog(item.id, {
          status: 'sent',
          errorMessage: null,
          sentAt: new Date().toISOString(),
          retryCount: (item.retryCount || 0) + 1,
        });
        retried.push({ id: item.id, status: 'sent' });
      } catch (error) {
        const retryCount = (item.retryCount || 0) + 1;
        await this.serviceOpsRepository.updateNotificationLog(item.id, {
          status: retryCount >= this.retryLimit ? 'failed' : 'retry_pending',
          errorMessage: error?.message || String(error),
          retryCount,
        });
        retried.push({ id: item.id, status: retryCount >= this.retryLimit ? 'failed' : 'retry_pending' });
      }
    }

    return { checked: pending.length, retried };
  }
}
