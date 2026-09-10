// Threshold-crossing detection for the 運行状況 (driving status) timers.
//
// The actual conditions/messages are no longer hardcoded here — they live in
// the editable `push_notification_rules` Supabase table (see
// lib/notifications/push-rules.ts) so office staff can add/edit/delete them
// from the app's secret editor page. This module only knows *how* to detect
// a threshold crossing and de-duplicate repeat fires, not *what* the rules
// currently are.

export type NotificationTimerType = 'continuous' | 'break' | 'driving'

export type PushNotificationRule = {
  id: string
  timerType: NotificationTimerType
  /** Threshold in ms for 'continuous'/'driving' rules. Unused for 'break'. */
  thresholdMs: number
  title: string
  message: string
}

export type NotifyState = {
  /** Rule ids that have already fired for the current occurrence. */
  firedRuleIds: string[]
  /** Previous tick's 連続走行時間 ms, used to detect a reset (counter dropping back to ~0). */
  prevContinuousMs: number
  /** Previous tick's trip.breakSatisfied, used to detect the false→true reset edge. */
  prevBreakSatisfied: boolean
}

export type NotifyEvent = { ruleId: string; title: string; message: string }

export function initialNotifyState(): NotifyState {
  return { firedRuleIds: [], prevContinuousMs: 0, prevBreakSatisfied: false }
}

// A drop of more than this from the previous tick's 連続走行時間 means the
// counter was reset (new trip, or 走行再開 after a satisfied break) rather
// than just clock jitter, so previously-fired continuous thresholds re-arm.
const RESET_DROP_THRESHOLD_MS = 1000

/**
 * Advances notify state by one tick and returns any newly-crossed
 * thresholds (from `rules`) as events to send. Each rule fires at most
 * once per occurrence: continuous-driving rules re-arm when the counter
 * resets to zero, driving-duration rules only reset when the caller starts
 * a new trip (see initialNotifyState), and break rules fire once per
 * false→true breakSatisfied edge.
 */
export function tickNotifyState(
  state: NotifyState,
  args: { continuousMs: number; drivingMs: number; breakSatisfied: boolean },
  rules: PushNotificationRule[],
): { state: NotifyState; events: NotifyEvent[] } {
  const events: NotifyEvent[] = []
  let fired = new Set(state.firedRuleIds)

  if (args.continuousMs < state.prevContinuousMs - RESET_DROP_THRESHOLD_MS) {
    for (const rule of rules) {
      if (rule.timerType === 'continuous') fired.delete(rule.id)
    }
  }

  for (const rule of rules) {
    if (rule.timerType === 'break') {
      if (!state.prevBreakSatisfied && args.breakSatisfied) {
        events.push({ ruleId: rule.id, title: rule.title, message: rule.message })
      }
      continue
    }
    const liveMs =
      rule.timerType === 'continuous' ? args.continuousMs : args.drivingMs
    if (!fired.has(rule.id) && liveMs >= rule.thresholdMs) {
      fired.add(rule.id)
      events.push({ ruleId: rule.id, title: rule.title, message: rule.message })
    }
  }

  return {
    state: {
      firedRuleIds: Array.from(fired),
      prevContinuousMs: args.continuousMs,
      prevBreakSatisfied: args.breakSatisfied,
    },
    events,
  }
}
