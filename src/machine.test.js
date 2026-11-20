import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { checkInMachine } from './machine.js';

function confirmedMatchActor(visitorName) {
  const snapshot = checkInMachine.resolveState({
    value: { ATTENDANCE_PHASE: { appFlow: 'CONFIRMED_MATCH', scanner: 'IDLE' } },
    context: {
      ...checkInMachine.config.context,
      selectedVisitor: { visitorId: '1', visitorName },
    },
  });
  return createActor(checkInMachine, { snapshot }).start();
}

describe('ATTENDANCE_RECORDED toast', () => {
  it('keeps the toast naming the visitor after returning to READY_EMPTY', () => {
    const actor = confirmedMatchActor('Ana Pérez');
    actor.send({ type: 'ATTENDANCE_RECORDED' });

    const { value, context } = actor.getSnapshot();
    expect(value.ATTENDANCE_PHASE.appFlow).toBe('READY_EMPTY');
    expect(context.toast).toEqual({ id: 1, visitorName: 'Ana Pérez' });
    expect(context.selectedVisitor).toBeNull();
  });

  it('issues a new toast id for each registration', () => {
    const actor = confirmedMatchActor('Ana Pérez');
    actor.send({ type: 'ATTENDANCE_RECORDED' });
    actor.send({ type: 'SEARCH_RESULT_SINGLE', visitor: { visitorId: '2', visitorName: 'Luis Soto' } });
    actor.send({ type: 'ATTENDANCE_RECORDED' });

    expect(actor.getSnapshot().context.toast).toEqual({ id: 2, visitorName: 'Luis Soto' });
  });
});
