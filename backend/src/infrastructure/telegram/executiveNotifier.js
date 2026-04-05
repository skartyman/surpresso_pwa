function parseChatIds(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function formatList(title, rows) {
  if (!rows.length) return `${title}: нет критичных элементов.`;
  return `${title}:\n${rows.map((row, index) => `${index + 1}. ${row}`).join('\n')}`;
}

function mapAlertLine(alert) {
  return `${alert.type} · ${alert.caseLabel || alert.caseId || 'case'} · ${alert.severity}${alert.ageHours ? ` · ${alert.ageHours}h` : ''}`;
}

export class ExecutiveNotifier {
  constructor(botGateway, cfg = {}) {
    this.botGateway = botGateway;
    this.chatMap = {
      serviceHead: parseChatIds(cfg.telegramServiceHeadChatIds),
      director: parseChatIds(cfg.telegramDirectorChatIds),
      salesManager: parseChatIds(cfg.telegramSalesManagerChatIds),
      owner: parseChatIds(cfg.telegramOwnerChatIds),
    };
  }

  getRecipients(role) {
    return this.chatMap[role] || [];
  }

  async sendToChat(chatId, message) {
    return this.botGateway.sendMessage(chatId, message);
  }

  buildTemplates({ alertState, metrics }) {
    const alerts = alertState?.alerts || [];
    const critical = alerts.filter((item) => item.severity === 'critical');
    const byType = (type) => alerts.filter((item) => item.type === type);

    return {
      serviceHead: [
        '🚨 Service Head digest',
        formatList('Critical stale in-progress', byType('stale_in_progress').filter((i) => i.severity === 'critical').map(mapAlertLine)),
        formatList('Unassigned too long', byType('unassigned_too_long').map(mapAlertLine)),
      ].join('\n\n'),
      director: [
        '📌 Director digest',
        `Ready too long: ${byType('stale_ready').length}`,
        `Processed backlog: ${metrics?.roleAnalytics?.director?.routeBacklogCount || 0}`,
      ].join('\n'),
      salesManager: [
        '💼 Sales digest',
        `Ready for rent backlog: ${metrics?.roleAnalytics?.sales?.rentBacklogCount || 0}`,
        `Ready for sale backlog: ${metrics?.roleAnalytics?.sales?.saleBacklogCount || 0}`,
        `Reserved aging: ${metrics?.roleAnalytics?.sales?.reservedAgingCount || 0}`,
      ].join('\n'),
      owner: [
        '👑 Owner executive digest',
        `Daily summary · critical: ${alertState?.summary?.critical || 0}, warning: ${alertState?.summary?.warning || 0}`,
        `Weekly summary payload ready: yes`,
        formatList('Critical alerts', critical.slice(0, 10).map(mapAlertLine)),
      ].join('\n\n'),
    };
  }

  async notifyRole(role, message) {
    const chats = this.getRecipients(role);
    if (!chats.length) return { role, ok: false, reason: 'chat_ids_missing' };
    const results = await Promise.allSettled(chats.map((chatId) => this.sendToChat(chatId, message)));
    return {
      role,
      ok: true,
      sent: results.filter((x) => x.status === 'fulfilled').length,
      failed: results.filter((x) => x.status === 'rejected').length,
    };
  }

  async triggerDigest({ roles = [], alertState, metrics }) {
    const templates = this.buildTemplates({ alertState, metrics });
    const targetRoles = roles.length ? roles : Object.keys(templates);
    const deduped = [...new Set(targetRoles)].filter((role) => templates[role]);
    const results = await Promise.all(deduped.map((role) => this.notifyRole(role, templates[role])));
    return { generatedAt: new Date().toISOString(), roles: deduped, templates, results };
  }
}
