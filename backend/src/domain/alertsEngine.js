function hoursSince(iso, nowTs = Date.now()) {
  const ts = new Date(iso || 0).getTime();
  if (!Number.isFinite(ts) || ts <= 0 || ts > nowTs) return null;
  return (nowTs - ts) / 3600000;
}

function pushAlert(bucket, alert) {
  if (!alert) return;
  bucket.push(alert);
}

function summarizeAlerts(alerts = []) {
  return alerts.reduce((acc, alert) => {
    const key = alert.type || 'unknown';
    acc.byType[key] = (acc.byType[key] || 0) + 1;
    acc.bySeverity[alert.severity] = (acc.bySeverity[alert.severity] || 0) + 1;
    if (alert.severity === 'critical') acc.critical += 1;
    if (alert.severity === 'warning') acc.warning += 1;
    if (alert.severity === 'info') acc.info += 1;
    return acc;
  }, { total: alerts.length, critical: 0, warning: 0, info: 0, byType: {}, bySeverity: {} });
}

export function evaluateAlerts(serviceCases = [], { now = new Date() } = {}) {
  const nowTs = now.getTime();
  const alerts = [];

  for (const item of serviceCases) {
    const caseId = item.id;
    const caseLabel = item.caseNumber || item.id;
    const equipment = item.equipment || {};
    const unassignedAgeHours = !item.assignedToUserId ? hoursSince(item.acceptedAt || item.createdAt, nowTs) : null;

    if (Number.isFinite(unassignedAgeHours) && unassignedAgeHours >= 6) {
      pushAlert(alerts, {
        type: 'unassigned_too_long',
        severity: unassignedAgeHours >= 12 ? 'critical' : 'warning',
        caseId,
        caseLabel,
        ageHours: Math.round(unassignedAgeHours),
        message: `Case ${caseLabel} unassigned ${Math.round(unassignedAgeHours)}h`,
      });
    }

    const inProgressAgeHours = item.serviceStatus === 'in_progress' ? hoursSince(item.updatedAt, nowTs) : null;
    if (Number.isFinite(inProgressAgeHours) && inProgressAgeHours >= 24) {
      pushAlert(alerts, {
        type: 'stale_in_progress',
        severity: inProgressAgeHours >= 48 ? 'critical' : 'warning',
        caseId,
        caseLabel,
        ageHours: Math.round(inProgressAgeHours),
        message: `Case ${caseLabel} stuck in progress ${Math.round(inProgressAgeHours)}h`,
      });
    }

    const readyAgeHours = item.serviceStatus === 'ready' ? hoursSince(item.readyAt || item.updatedAt, nowTs) : null;
    if (Number.isFinite(readyAgeHours) && readyAgeHours >= 12) {
      pushAlert(alerts, {
        type: 'stale_ready',
        severity: readyAgeHours >= 24 ? 'critical' : 'warning',
        caseId,
        caseLabel,
        ageHours: Math.round(readyAgeHours),
        message: `Case ${caseLabel} waiting director ${Math.round(readyAgeHours)}h`,
      });
    }

    const isReserved = ['reserved_for_rent', 'reserved_for_sale'].includes(equipment.commercialStatus);
    const reservedAgeHours = isReserved ? hoursSince(item.updatedAt, nowTs) : null;
    if (Number.isFinite(reservedAgeHours) && reservedAgeHours >= 24) {
      pushAlert(alerts, {
        type: 'stale_reserved',
        severity: reservedAgeHours >= 48 ? 'critical' : 'warning',
        caseId,
        caseLabel,
        ageHours: Math.round(reservedAgeHours),
        message: `Reserved item ${caseLabel} aging ${Math.round(reservedAgeHours)}h`,
      });
    }

    const stageThresholdHours = {
      accepted: 12,
      in_progress: 48,
      testing: 24,
      ready: 24,
    };
    const threshold = stageThresholdHours[item.serviceStatus];
    const stageAgeHours = threshold ? hoursSince(item.updatedAt, nowTs) : null;
    if (Number.isFinite(stageAgeHours) && stageAgeHours > threshold) {
      pushAlert(alerts, {
        type: 'overdue_by_stage',
        severity: stageAgeHours >= threshold * 2 ? 'critical' : 'warning',
        caseId,
        caseLabel,
        stage: item.serviceStatus,
        ageHours: Math.round(stageAgeHours),
        message: `Case ${caseLabel} overdue on ${item.serviceStatus}`,
      });
    }

    const missingFields = ['serial', 'internalNumber', 'brand', 'model'].filter((key) => !String(equipment[key] || '').trim());
    if (missingFields.length) {
      pushAlert(alerts, {
        type: 'incomplete_equipment_data',
        severity: missingFields.length >= 3 ? 'critical' : 'warning',
        caseId,
        caseLabel,
        missingFields,
        message: `Case ${caseLabel} has incomplete equipment data (${missingFields.join(', ')})`,
      });
    }
  }

  const sorted = alerts.sort((a, b) => {
    const sev = { critical: 3, warning: 2, info: 1 };
    return (sev[b.severity] || 0) - (sev[a.severity] || 0);
  });

  const summary = summarizeAlerts(sorted);
  const escalationBlocks = {
    serviceHead: sorted.filter((item) => ['stale_in_progress', 'unassigned_too_long'].includes(item.type)).slice(0, 20),
    director: sorted.filter((item) => ['stale_ready', 'overdue_by_stage'].includes(item.type)).slice(0, 20),
    salesManager: sorted.filter((item) => ['stale_reserved'].includes(item.type)).slice(0, 20),
    owner: sorted.slice(0, 30),
  };

  return {
    generatedAt: now.toISOString(),
    alerts: sorted,
    summary,
    escalationBlocks,
    recentCriticalChanges: sorted.filter((item) => item.severity === 'critical').slice(0, 10),
    notificationPreview: {
      pendingCritical: summary.critical,
      pendingWarning: summary.warning,
      digestSize: Math.min(summary.total, 25),
    },
  };
}
