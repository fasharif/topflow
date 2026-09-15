/** A finite-state machine expressed as data: every status lists the statuses it may move to. */
export type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;

export class InvalidTransitionError extends Error {
  readonly entity: string;
  readonly from: string;
  readonly to: string;

  constructor(entity: string, from: string, to: string) {
    super(`Cannot move ${entity} from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
    this.entity = entity;
    this.from = from;
    this.to = to;
  }
}

export function canTransition<S extends string>(map: TransitionMap<S>, from: S, to: S): boolean {
  return map[from].includes(to);
}

export function assertTransition<S extends string>(
  map: TransitionMap<S>,
  from: S,
  to: S,
  entity: string,
): void {
  if (!canTransition(map, from, to)) {
    throw new InvalidTransitionError(entity, from, to);
  }
}

export function nextStatuses<S extends string>(map: TransitionMap<S>, from: S): readonly S[] {
  return map[from];
}

export function isTerminal<S extends string>(map: TransitionMap<S>, status: S): boolean {
  return map[status].length === 0;
}
