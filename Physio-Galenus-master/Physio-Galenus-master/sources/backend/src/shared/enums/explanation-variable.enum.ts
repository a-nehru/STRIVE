export enum EExplanationVariable {
  ADEQUACY = 'adequacy',
  ADEQUACY_INCR = 'adequacy_incr',
  COMPLETION = 'completion',
  FATIGUE = 'fatigue',
  EXERGAME_DIFF = 'exergame_diff',
  EXERGAME_NUMBER = 'exergame_number',
  MOBILITY = 'mobility',
  PERFORMANCE = 'performance',
  PERFORMANCE_INCR = 'performance_incr',
  REP_INCR = 'rep_incr',
  REPS = 'reps',
  SET_INCR = 'set_incr',
  SETS = 'sets',
  TIME = 'time',
  TIME_INCR = 'time_incr',
  WAYPOINT_DISTANCE = 'waypoint_distance',
  WAYPOINT_NUMBER = 'waypoint_number',
  COMPENSATION = 'compensation',
}

export const EExplanationVariableData: {
  [key in EExplanationVariable]: {
    displayText: string;
    min: number;
    max: number;
    step: number;
  };
} = {
  adequacy_incr: {
    displayText: 'Exergame Adequacy incr./decr.',
    min: -20,
    max: 20,
    step: 1,
  },
  completion: { displayText: 'Completion Ratio', min: 0, max: 100, step: 0.1 },
  exergame_diff: {
    displayText: 'Exergame Difficulty',
    min: 0,
    max: 100,
    step: 1,
  },
  exergame_number: {
    displayText: 'Number of Exergames',
    min: 1,
    max: 10,
    step: 1,
  },
  mobility: {
    displayText: 'Mobility',
    min: 0,
    max: 100,
    step: 1,
  },
  performance: {
    displayText: 'Performance',
    min: 0,
    max: 100,
    step: 1,
  },
  performance_incr: {
    displayText: 'Patient Performance incr./decr.',
    min: -20,
    max: 20,
    step: 1,
  },
  rep_incr: {
    displayText: 'Repetition incr./decr.',
    min: -20,
    max: 20,
    step: 1,
  },
  reps: { displayText: 'Nº of Repetitions', min: 0, max: 50, step: 1 },
  set_incr: { displayText: 'Set incr./decr.', min: -3, max: 3, step: 1 },
  sets: { displayText: 'Nº of Sets', min: 0, max: 10, step: 1 },
  time: { displayText: 'Time', min: 0, max: 300, step: 1 },
  time_incr: {
    displayText: 'Time incr./decr.',
    min: -120,
    max: 120,
    step: 1,
  },
  waypoint_distance: {
    displayText: 'Waypoint Distance',
    min: 0,
    max: 1,
    step: 0.01,
  },
  waypoint_number: {
    displayText: 'Number of Waypoints',
    min: 2,
    max: 10,
    step: 1,
  },
  adequacy: {
    displayText: 'Adequacy',
    min: 0,
    max: 100,
    step: 1,
  },
  compensation: {
    displayText: 'Compensation',
    min: 0,
    max: 100,
    step: 1,
  },
  fatigue: { displayText: 'Fatigue', min: 0, max: 100, step: 1 },
};

export enum EExplanationFuzzyCategory {
  VL = 'VL',
  L = 'L',
  M = 'M',
  H = 'H',
  VH = 'VH',
}
