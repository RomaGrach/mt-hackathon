// Source of truth for v2 OpenAPI. Regenerate docs/openapi.json with generate-openapi.mjs.
export const v2Schemas = {
  RequestId: {
    type: 'string',
    minLength: 8,
    maxLength: 64,
    pattern: '^[a-zA-Z0-9-]+$',
  },
  ShiftCommand: {
    oneOf: [
      {
        type: 'object',
        properties: {
          type: {
            const: 'begin',
          },
        },
        required: ['type'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          type: {
            const: 'continue',
          },
        },
        required: ['type'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          type: {
            const: 'overview',
          },
        },
        required: ['type'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          type: {
            const: 'pause',
          },
        },
        required: ['type'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          type: {
            const: 'resume',
          },
        },
        required: ['type'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          type: {
            const: 'finish',
          },
        },
        required: ['type'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          type: {
            const: 'abort',
          },
        },
        required: ['type'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          type: {
            const: 'wait',
          },
        },
        required: ['type'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          type: {
            const: 'hint',
          },
          hintId: {
            type: 'string',
          },
        },
        required: ['type', 'hintId'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          type: {
            const: 'focus',
          },
          incidentId: {
            type: 'string',
          },
        },
        required: ['type', 'incidentId'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          type: {
            const: 'inspect',
          },
          zoneId: {
            type: 'string',
          },
          actionId: {
            type: 'string',
          },
        },
        required: ['type', 'zoneId', 'actionId'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          type: {
            const: 'choose',
          },
          incidentId: {
            anyOf: [
              {
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
          sceneId: {
            type: 'string',
          },
          actionId: {
            type: 'string',
          },
          windowId: {
            anyOf: [
              {
                type: 'string',
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: ['type', 'incidentId', 'sceneId', 'actionId', 'windowId'],
        additionalProperties: false,
      },
    ],
  },
  ShiftStart: {
    type: 'object',
    properties: {
      requestId: {
        type: 'string',
        minLength: 8,
        maxLength: 64,
        pattern: '^[a-zA-Z0-9-]+$',
      },
      scenarioId: {
        type: 'string',
      },
      mode: {
        type: 'string',
        enum: ['training', 'assessment'],
      },
      timingPolicyId: {
        type: 'string',
        enum: ['standard', 'extended', 'untimed'],
      },
      variantId: {
        type: 'string',
      },
      serviceClass: {
        type: 'string',
        enum: ['standard', 'comfort', 'business', 'first'],
      },
      competitionSlotId: {
        const: 'shift',
      },
    },
    required: ['requestId', 'scenarioId', 'mode', 'timingPolicyId'],
    additionalProperties: false,
  },
  ShiftCommandRequest: {
    type: 'object',
    properties: {
      requestId: {
        type: 'string',
        minLength: 8,
        maxLength: 64,
        pattern: '^[a-zA-Z0-9-]+$',
      },
      revision: {
        type: 'integer',
        minimum: 0,
      },
      command: {
        $ref: '#/components/schemas/ShiftCommand',
      },
    },
    required: ['requestId', 'revision', 'command'],
    additionalProperties: false,
  },
  ShiftReplayRequest: {
    type: 'object',
    properties: {
      requestId: {
        type: 'string',
        minLength: 8,
        maxLength: 64,
        pattern: '^[a-zA-Z0-9-]+$',
      },
      originEventSeq: {
        type: 'integer',
        minimum: 1,
      },
    },
    required: ['requestId', 'originEventSeq'],
    additionalProperties: false,
  },
  ShiftTiming: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        enum: ['standard', 'extended', 'untimed'],
      },
      durationMs: {
        enum: [20000, 200000, null],
      },
    },
    required: ['id', 'durationMs'],
    additionalProperties: false,
  },
  ShiftScales: {
    type: 'object',
    properties: {
      loyalty: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
      },
      safety: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
      },
    },
    required: ['loyalty', 'safety'],
    additionalProperties: false,
  },
  Criterion: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
      },
      competency: {
        type: 'string',
        enum: ['protocol', 'empathy', 'teamwork', 'speed'],
      },
      label: {
        type: 'string',
      },
      mandatory: {
        type: 'boolean',
      },
      status: {
        type: 'string',
        enum: ['assessed', 'not_assessed'],
      },
      earned: {
        anyOf: [
          {
            type: 'integer',
            minimum: 0,
          },
          {
            type: 'null',
          },
        ],
      },
      possible: {
        anyOf: [
          {
            type: 'integer',
            minimum: 1,
          },
          {
            type: 'null',
          },
        ],
      },
      evidenceEventIds: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    },
    required: ['id', 'competency', 'label', 'status', 'earned', 'possible', 'evidenceEventIds'],
    additionalProperties: false,
  },
  ShiftAction: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        enum: [
          'begin',
          'continue',
          'overview',
          'pause',
          'resume',
          'finish',
          'abort',
          'wait',
          'hint',
          'focus',
          'inspect',
          'choose',
        ],
      },
      label: {
        type: 'string',
      },
      incidentId: {
        anyOf: [
          {
            type: 'string',
          },
          {
            type: 'null',
          },
        ],
      },
      sceneId: {
        type: 'string',
      },
      actionId: {
        type: 'string',
      },
      windowId: {
        anyOf: [
          {
            type: 'string',
          },
          {
            type: 'null',
          },
        ],
      },
      zoneId: {
        type: 'string',
      },
      hintId: {
        type: 'string',
      },
    },
    required: ['command', 'label'],
    additionalProperties: false,
  },
  ShiftWindow: {
    oneOf: [
      {
        type: 'null',
      },
      {
        type: 'object',
        properties: {
          status: {
            const: 'pending',
          },
        },
        required: ['status'],
        additionalProperties: false,
      },
      {
        type: 'object',
        properties: {
          id: {
            type: 'string',
          },
          status: {
            type: 'string',
            enum: ['open', 'suspended'],
          },
          durationMs: {
            enum: [20000, 200000, null],
          },
          deadline: {
            anyOf: [
              {
                type: 'integer',
                minimum: 0,
              },
              {
                type: 'null',
              },
            ],
          },
          remainingMs: {
            anyOf: [
              {
                type: 'integer',
                minimum: 0,
              },
              {
                type: 'null',
              },
            ],
          },
          openedAt: {
            anyOf: [
              {
                type: 'integer',
                minimum: 0,
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: ['id', 'status', 'durationMs', 'deadline', 'remainingMs', 'openedAt'],
        additionalProperties: false,
      },
    ],
  },
  DebriefReceipt: {
    type: 'object',
    properties: {
      runId: {
        type: 'string',
        format: 'uuid',
      },
      acknowledged: {
        const: true,
      },
      alreadyAcknowledged: {
        type: 'boolean',
      },
      deltaXP: {
        type: 'integer',
        enum: [0, 10, 20],
      },
      noAdditionalXP: {
        type: 'boolean',
      },
      weeklyFamilyCredit: {
        type: 'integer',
        enum: [0, 10, 20],
      },
      lifetimePracticeXP: {
        type: 'integer',
        minimum: 0,
      },
      practiceLevel: {
        type: 'integer',
        minimum: 1,
      },
      goalCompleted: {
        type: 'boolean',
      },
    },
    required: [
      'runId',
      'acknowledged',
      'alreadyAcknowledged',
      'deltaXP',
      'noAdditionalXP',
      'weeklyFamilyCredit',
      'lifetimePracticeXP',
      'practiceLevel',
      'goalCompleted',
    ],
    additionalProperties: false,
  },
  MotivationPreferences: {
    type: 'object',
    properties: {
      requestId: {
        type: 'string',
        minLength: 8,
        maxLength: 64,
        pattern: '^[a-zA-Z0-9-]+$',
      },
      goalDays: {
        type: 'integer',
        enum: [1, 2, 3],
      },
      paused: {
        type: 'boolean',
      },
      automaticNotices: {
        type: 'boolean',
      },
    },
    required: ['requestId'],
    additionalProperties: false,
  },
  PeriodEntryRequest: {
    type: 'object',
    properties: {
      requestId: {
        type: 'string',
        minLength: 8,
        maxLength: 64,
        pattern: '^[a-zA-Z0-9-]+$',
      },
      action: {
        type: 'string',
        enum: ['join', 'withdraw'],
      },
    },
    required: ['requestId', 'action'],
    additionalProperties: false,
  },
  PeriodEntry: {
    type: 'object',
    properties: {
      optIn: {
        type: 'boolean',
      },
      band: {
        anyOf: [
          {
            type: 'string',
            enum: ['starter', 'main', 'returning'],
          },
          {
            type: 'null',
          },
        ],
      },
      attemptsUsed: {
        type: 'integer',
        minimum: 0,
      },
      attemptsRemaining: {
        type: 'integer',
        minimum: 0,
      },
      seasonPoints: {
        type: 'integer',
        minimum: 0,
      },
      state: {
        type: 'string',
      },
    },
    required: ['optIn', 'band', 'attemptsUsed', 'attemptsRemaining', 'seasonPoints', 'state'],
    additionalProperties: false,
  },
  ShiftResult: {
    type: 'object',
    properties: {
      schemaVersion: {
        const: 2,
      },
      engineVersion: {
        const: 'shift-2',
      },
      runId: {
        type: 'string',
        format: 'uuid',
      },
      scenarioId: {
        type: 'string',
      },
      contentVersion: {
        type: 'string',
      },
      rulesVersion: {
        type: 'string',
      },
      creditFamilyId: {
        type: 'string',
      },
      mode: {
        type: 'string',
        enum: ['training', 'assessment'],
      },
      timingPolicy: {
        $ref: '#/components/schemas/ShiftTiming',
      },
      variantId: {
        type: 'string',
      },
      comparisonGroup: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: true,
      },
      origin: {
        anyOf: [
          {
            type: 'object',
            properties: {
              runId: {
                type: 'string',
                format: 'uuid',
              },
              originEventSeq: {
                type: 'integer',
                minimum: 0,
              },
            },
            required: ['runId', 'originEventSeq'],
            additionalProperties: false,
          },
          {
            type: 'null',
          },
        ],
      },
      completedAt: {
        type: 'integer',
        minimum: 0,
      },
      acceptedAt: {
        type: 'integer',
        minimum: 0,
      },
      passed: {
        type: 'boolean',
      },
      reasons: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
      title: {
        type: 'string',
      },
      summary: {
        type: 'string',
      },
      scales: {
        $ref: '#/components/schemas/ShiftScales',
      },
      criticalError: {
        type: 'boolean',
      },
      criticalErrors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
            },
            evidenceEventId: {
              type: 'string',
            },
            incidentId: {
              type: 'string',
            },
          },
          required: ['code', 'evidenceEventId', 'incidentId'],
          additionalProperties: false,
        },
      },
      criteria: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/Criterion',
        },
      },
      episodePoints: {
        type: 'integer',
        minimum: 0,
      },
      possibleEpisodePoints: {
        type: 'integer',
        minimum: 0,
      },
      history: {
        type: 'array',
        items: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: true,
        },
      },
      decisionCount: {
        type: 'integer',
        minimum: 0,
      },
      technicalIssue: {
        type: 'boolean',
      },
      hasHints: {
        type: 'boolean',
      },
      hasPause: {
        type: 'boolean',
      },
      rankingEligible: {
        type: 'boolean',
      },
      rankingIneligibleReason: {
        anyOf: [
          {
            type: 'string',
          },
          {
            type: 'null',
          },
        ],
      },
      seasonPoints: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
      },
      notForEmploymentDecisions: {
        const: true,
      },
      reviewStatus: {
        const: 'synthetic-requires-methodologist',
      },
      freshCriterionIds: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    },
    required: [
      'schemaVersion',
      'engineVersion',
      'runId',
      'scenarioId',
      'contentVersion',
      'rulesVersion',
      'creditFamilyId',
      'mode',
      'timingPolicy',
      'variantId',
      'comparisonGroup',
      'origin',
      'completedAt',
      'acceptedAt',
      'passed',
      'reasons',
      'title',
      'summary',
      'scales',
      'criticalError',
      'criticalErrors',
      'criteria',
      'episodePoints',
      'possibleEpisodePoints',
      'history',
      'decisionCount',
      'technicalIssue',
      'hasHints',
      'hasPause',
      'rankingEligible',
      'rankingIneligibleReason',
      'seasonPoints',
      'notForEmploymentDecisions',
      'reviewStatus',
      'freshCriterionIds',
    ],
    additionalProperties: false,
  },
  ShiftPublic: {
    type: 'object',
    properties: {
      schemaVersion: {
        const: 2,
      },
      engineVersion: {
        const: 'shift-2',
      },
      id: {
        type: 'string',
        format: 'uuid',
      },
      scenarioId: {
        type: 'string',
      },
      contentVersion: {
        type: 'string',
      },
      revision: {
        type: 'integer',
        minimum: 0,
      },
      mode: {
        type: 'string',
        enum: ['training', 'assessment'],
      },
      timingPolicy: {
        $ref: '#/components/schemas/ShiftTiming',
      },
      status: {
        type: 'string',
        enum: ['active', 'completed', 'aborted'],
      },
      phase: {
        type: 'string',
        enum: ['briefing', 'scene', 'overview', 'feedback', 'paused', 'result'],
      },
      stage: {
        type: 'string',
        enum: ['inspection', 'service'],
      },
      step: {
        type: 'integer',
        minimum: 0,
      },
      context: {
        type: 'object',
        properties: {
          wagonId: {
            type: 'string',
          },
          zoneId: {
            type: 'string',
          },
          serviceClass: {
            type: 'string',
            enum: ['standard', 'comfort', 'business', 'first'],
          },
          serviceClassLabel: {
            type: 'string',
          },
        },
        required: ['wagonId', 'zoneId', 'serviceClass', 'serviceClassLabel'],
        additionalProperties: false,
      },
      scales: {
        $ref: '#/components/schemas/ShiftScales',
      },
      actors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            label: {
              type: 'string',
            },
          },
          required: ['id', 'label'],
          additionalProperties: false,
        },
      },
      incidents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            label: {
              type: 'string',
            },
            status: {
              type: 'string',
            },
            severity: {
              type: 'string',
            },
            handoffStatus: {
              anyOf: [
                {
                  type: 'string',
                },
                {
                  type: 'null',
                },
              ],
            },
          },
          required: ['id', 'label', 'status', 'severity', 'handoffStatus'],
          additionalProperties: false,
        },
      },
      observations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            text: {
              type: 'string',
            },
          },
          required: ['id', 'text'],
          additionalProperties: false,
        },
      },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
            },
            type: {
              type: 'string',
            },
            label: {
              type: 'string',
            },
            status: {
              type: 'string',
            },
            actorId: {
              anyOf: [
                {
                  type: 'string',
                },
                {
                  type: 'null',
                },
              ],
            },
            dueStep: {
              anyOf: [
                {
                  type: 'integer',
                  minimum: 0,
                },
                {
                  type: 'null',
                },
              ],
            },
            overdue: {
              type: 'boolean',
            },
          },
          required: ['id', 'type', 'label', 'status', 'actorId', 'dueStep', 'overdue'],
          additionalProperties: false,
        },
      },
      scene: {
        anyOf: [
          {
            type: 'object',
            properties: {
              id: {
                type: 'string',
              },
              title: {
                type: 'string',
              },
              speaker: {
                type: 'string',
              },
              text: {
                type: 'string',
              },
              prompt: {
                type: 'string',
              },
            },
            required: ['id', 'title', 'speaker', 'text', 'prompt'],
            additionalProperties: false,
          },
          {
            type: 'null',
          },
        ],
      },
      actions: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/ShiftAction',
        },
      },
      hintText: {
        anyOf: [
          {
            type: 'string',
          },
          {
            type: 'null',
          },
        ],
      },
      feedback: {
        anyOf: [
          {
            type: 'object',
            properties: {
              text: {
                type: 'string',
              },
              impact: {
                type: 'object',
                properties: {
                  loyalty: {
                    type: 'integer',
                  },
                  safety: {
                    type: 'integer',
                  },
                },
                required: ['loyalty', 'safety'],
                additionalProperties: false,
              },
              timedOut: {
                type: 'boolean',
              },
              explanation: {
                type: 'string',
              },
            },
            required: ['text', 'impact', 'timedOut'],
            additionalProperties: false,
          },
          {
            type: 'null',
          },
        ],
      },
      criticalWindow: {
        $ref: '#/components/schemas/ShiftWindow',
      },
      history: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            eventSeq: {
              type: 'integer',
              minimum: 0,
            },
            title: {
              type: 'string',
            },
            text: {
              type: 'string',
            },
          },
          required: ['eventSeq', 'title', 'text'],
          additionalProperties: false,
        },
      },
      result: {
        anyOf: [
          {
            $ref: '#/components/schemas/ShiftResult',
          },
          {
            type: 'null',
          },
        ],
      },
      serverNow: {
        type: 'integer',
        minimum: 0,
      },
      debrief: {
        type: 'object',
        properties: {
          acknowledged: {
            type: 'boolean',
          },
          receipt: {
            anyOf: [
              {
                $ref: '#/components/schemas/DebriefReceipt',
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: ['acknowledged', 'receipt'],
        additionalProperties: false,
      },
    },
    required: [
      'schemaVersion',
      'engineVersion',
      'id',
      'scenarioId',
      'contentVersion',
      'revision',
      'mode',
      'timingPolicy',
      'status',
      'phase',
      'stage',
      'step',
      'context',
      'scales',
      'actors',
      'incidents',
      'observations',
      'tasks',
      'scene',
      'actions',
      'hintText',
      'feedback',
      'criticalWindow',
      'history',
      'result',
      'serverNow',
    ],
    additionalProperties: false,
  },
  ShiftCommandResponse: {
    type: 'object',
    properties: {
      receipt: {
        type: 'object',
        properties: {
          requestId: {
            type: 'string',
            minLength: 8,
            maxLength: 64,
            pattern: '^[a-zA-Z0-9-]+$',
          },
          revision: {
            type: 'integer',
            minimum: 0,
          },
          acceptedAt: {
            type: 'integer',
            minimum: 0,
          },
        },
        required: ['requestId', 'revision', 'acceptedAt'],
        additionalProperties: false,
      },
      run: {
        $ref: '#/components/schemas/ShiftPublic',
      },
    },
    required: ['receipt', 'run'],
    additionalProperties: false,
  },
  ShiftError: {
    type: 'object',
    properties: {
      error: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
          },
          message: {
            type: 'string',
          },
        },
        required: ['code', 'message'],
        additionalProperties: false,
      },
      run: {
        $ref: '#/components/schemas/ShiftPublic',
      },
    },
    required: ['error'],
    additionalProperties: false,
  },
  Motivation: {
    type: 'object',
    properties: {
      schemaVersion: {
        const: 2,
      },
      gamificationVersion: {
        const: 'gamification-1',
      },
      serverNow: {
        type: 'integer',
        minimum: 0,
      },
      notForEmploymentDecisions: {
        const: true,
      },
      lifetimePracticeXP: {
        type: 'integer',
        minimum: 0,
      },
      practiceLevel: {
        type: 'integer',
        minimum: 1,
      },
      levelProgress: {
        type: 'integer',
        minimum: 0,
      },
      weeklyXP: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
      },
      actualWeeklyFamilyMaximum: {
        const: 20,
      },
      period: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: true,
      },
      participation: {
        $ref: '#/components/schemas/PeriodEntry',
      },
      goal: {
        type: 'object',
        properties: {
          target: {
            type: 'integer',
            enum: [1, 2, 3],
          },
          days: {
            type: 'array',
            items: {
              type: 'string',
              format: 'date',
            },
          },
          completed: {
            type: 'boolean',
          },
          paused: {
            type: 'boolean',
          },
        },
        required: ['target', 'days', 'completed', 'paused'],
        additionalProperties: false,
      },
      preferences: {
        type: 'object',
        properties: {
          nextGoal: {
            type: 'integer',
            enum: [1, 2, 3],
          },
          paused: {
            type: 'boolean',
          },
          automaticNotices: {
            type: 'boolean',
          },
        },
        required: ['nextGoal', 'paused', 'automaticNotices'],
        additionalProperties: false,
      },
      returnPending: {
        type: 'boolean',
      },
      successfulWeeks: {
        type: 'integer',
        minimum: 0,
      },
      nextReview: {
        anyOf: [
          {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: true,
          },
          {
            type: 'null',
          },
        ],
      },
      awards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: true,
        },
      },
      awardRules: {
        type: 'array',
        items: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: true,
        },
      },
      evidence: {
        type: 'array',
        items: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: true,
        },
      },
      history: {
        type: 'array',
        items: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: true,
        },
      },
      archives: {
        type: 'array',
        items: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: true,
        },
      },
      automaticNotice: {
        anyOf: [
          {
            type: 'object',
            properties: {},
            required: [],
            additionalProperties: true,
          },
          {
            type: 'null',
          },
        ],
      },
    },
    required: [
      'schemaVersion',
      'gamificationVersion',
      'serverNow',
      'notForEmploymentDecisions',
      'lifetimePracticeXP',
      'practiceLevel',
      'levelProgress',
      'weeklyXP',
      'actualWeeklyFamilyMaximum',
      'period',
      'participation',
      'goal',
      'preferences',
      'returnPending',
      'successfulWeeks',
      'nextReview',
      'awards',
      'awardRules',
      'evidence',
      'history',
      'archives',
      'automaticNotice',
    ],
    additionalProperties: false,
  },
  ShiftLeaderboard: {
    type: 'object',
    properties: {
      schemaVersion: {
        const: 2,
      },
      scope: {
        type: 'string',
        enum: ['crew', 'depot', 'company'],
      },
      periodId: {
        type: 'string',
      },
      optIn: {
        type: 'boolean',
      },
      insufficientParticipants: {
        type: 'boolean',
      },
      total: {
        type: 'integer',
        minimum: 0,
      },
      rows: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
            },
            score: {
              type: 'integer',
              minimum: 0,
            },
            rank: {
              anyOf: [
                {
                  type: 'integer',
                  minimum: 0,
                },
                {
                  type: 'null',
                },
              ],
            },
            me: {
              type: 'boolean',
            },
          },
          required: ['name', 'score', 'rank', 'me'],
          additionalProperties: false,
        },
      },
      me: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
          },
          score: {
            type: 'integer',
            minimum: 0,
          },
          rank: {
            anyOf: [
              {
                type: 'integer',
                minimum: 0,
              },
              {
                type: 'null',
              },
            ],
          },
        },
        required: ['score', 'rank'],
        additionalProperties: false,
      },
      offset: {
        type: 'integer',
        minimum: 0,
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
      },
      maxScore: {
        const: 100,
      },
      group: {
        type: 'string',
      },
      band: {
        type: 'string',
      },
      hasMore: {
        type: 'boolean',
      },
      archived: {
        type: 'boolean',
      },
    },
    required: [
      'schemaVersion',
      'scope',
      'periodId',
      'optIn',
      'insufficientParticipants',
      'total',
      'rows',
      'me',
      'offset',
      'limit',
      'maxScore',
    ],
    additionalProperties: false,
  },
  ExactReplay: {
    type: 'object',
    properties: {
      runId: {
        type: 'string',
        format: 'uuid',
      },
      verified: {
        const: true,
      },
      engineVersion: {
        const: 'shift-2',
      },
      contentHash: {
        type: 'string',
      },
      transitions: {
        type: 'integer',
        minimum: 0,
      },
      result: {
        $ref: '#/components/schemas/ShiftResult',
      },
      rewardsIssued: {
        const: false,
      },
    },
    required: [
      'runId',
      'verified',
      'engineVersion',
      'contentHash',
      'transitions',
      'result',
      'rewardsIssued',
    ],
    additionalProperties: false,
  },
};
export const v2Paths = {
  '/api/v2/catalog': {
    get: {
      summary: 'Published summaries without hidden graphs',
      security: [
        {
          Session: [],
        },
      ],
      parameters: [],
      responses: {
        200: {
          description: 'Success. Authoritative state; see docs/API-V2.md.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {},
                      required: [],
                      additionalProperties: true,
                    },
                  },
                },
                required: ['items'],
                additionalProperties: false,
              },
            },
          },
        },
        default: {
          description:
            'JSON error. DEADLINE_EXPIRED 409 can include a committed timeout. Retry the same requestId after uncertain delivery.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftError',
              },
            },
          },
        },
      },
    },
  },
  '/api/v2/runs': {
    post: {
      summary: 'Create pinned briefing; reserve competition attempt only at begin',
      security: [
        {
          Session: [],
        },
      ],
      parameters: [
        {
          in: 'header',
          name: 'X-Reis-Client',
          required: true,
          schema: {
            const: 'web',
          },
        },
      ],
      responses: {
        201: {
          description: 'Success. Authoritative state; see docs/API-V2.md.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftPublic',
              },
            },
          },
        },
        default: {
          description:
            'JSON error. DEADLINE_EXPIRED 409 can include a committed timeout. Retry the same requestId after uncertain delivery.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftError',
              },
            },
          },
        },
      },
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ShiftStart',
            },
          },
        },
      },
    },
  },
  '/api/v2/runs/{id}': {
    get: {
      summary: 'Restore run and settle expired window once',
      security: [
        {
          Session: [],
        },
      ],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
      ],
      responses: {
        200: {
          description: 'Success. Authoritative state; see docs/API-V2.md.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftPublic',
              },
            },
          },
        },
        default: {
          description:
            'JSON error. DEADLINE_EXPIRED 409 can include a committed timeout. Retry the same requestId after uncertain delivery.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftError',
              },
            },
          },
        },
      },
    },
  },
  '/api/v2/runs/{id}/commands': {
    post: {
      summary: 'Apply strict command and store an exact idempotency receipt',
      security: [
        {
          Session: [],
        },
      ],
      parameters: [
        {
          in: 'header',
          name: 'X-Reis-Client',
          required: true,
          schema: {
            const: 'web',
          },
        },
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
      ],
      responses: {
        200: {
          description: 'Success. Authoritative state; see docs/API-V2.md.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftCommandResponse',
              },
            },
          },
        },
        default: {
          description:
            'JSON error. DEADLINE_EXPIRED 409 can include a committed timeout. Retry the same requestId after uncertain delivery.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftError',
              },
            },
          },
        },
      },
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ShiftCommandRequest',
            },
          },
        },
      },
    },
  },
  '/api/v2/runs/{id}/result': {
    get: {
      summary: 'Read completed shift result',
      security: [
        {
          Session: [],
        },
      ],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
      ],
      responses: {
        200: {
          description: 'Success. Authoritative state; see docs/API-V2.md.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftResult',
              },
            },
          },
        },
        default: {
          description:
            'JSON error. DEADLINE_EXPIRED 409 can include a committed timeout. Retry the same requestId after uncertain delivery.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftError',
              },
            },
          },
        },
      },
    },
  },
  '/api/v2/runs/{id}/replay': {
    get: {
      summary: 'Verify pinned journal, without new rewards',
      security: [
        {
          Session: [],
        },
      ],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
      ],
      responses: {
        200: {
          description: 'Success. Authoritative state; see docs/API-V2.md.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ExactReplay',
              },
            },
          },
        },
        default: {
          description:
            'JSON error. DEADLINE_EXPIRED 409 can include a committed timeout. Retry the same requestId after uncertain delivery.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftError',
              },
            },
          },
        },
      },
    },
    post: {
      summary: 'New training branch before a recorded decision',
      security: [
        {
          Session: [],
        },
      ],
      parameters: [
        {
          in: 'header',
          name: 'X-Reis-Client',
          required: true,
          schema: {
            const: 'web',
          },
        },
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
      ],
      responses: {
        201: {
          description: 'Success. Authoritative state; see docs/API-V2.md.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftPublic',
              },
            },
          },
        },
        default: {
          description:
            'JSON error. DEADLINE_EXPIRED 409 can include a committed timeout. Retry the same requestId after uncertain delivery.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftError',
              },
            },
          },
        },
      },
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/ShiftReplayRequest',
            },
          },
        },
      },
    },
  },
  '/api/v2/results/{id}/debrief-ack': {
    post: {
      summary: 'First acknowledgement and atomic family XP credit',
      security: [
        {
          Session: [],
        },
      ],
      parameters: [
        {
          in: 'header',
          name: 'X-Reis-Client',
          required: true,
          schema: {
            const: 'web',
          },
        },
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
      ],
      responses: {
        200: {
          description: 'Success. Authoritative state; see docs/API-V2.md.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/DebriefReceipt',
              },
            },
          },
        },
        default: {
          description:
            'JSON error. DEADLINE_EXPIRED 409 can include a committed timeout. Retry the same requestId after uncertain delivery.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftError',
              },
            },
          },
        },
      },
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                requestId: {
                  type: 'string',
                  minLength: 8,
                  maxLength: 64,
                  pattern: '^[a-zA-Z0-9-]+$',
                },
              },
              required: ['requestId'],
              additionalProperties: false,
            },
          },
        },
      },
    },
  },
  '/api/v2/motivation': {
    get: {
      summary: 'Separated evidence, XP, SP, goal, review and achievements',
      security: [
        {
          Session: [],
        },
      ],
      parameters: [],
      responses: {
        200: {
          description: 'Success. Authoritative state; see docs/API-V2.md.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Motivation',
              },
            },
          },
        },
        default: {
          description:
            'JSON error. DEADLINE_EXPIRED 409 can include a committed timeout. Retry the same requestId after uncertain delivery.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftError',
              },
            },
          },
        },
      },
    },
  },
  '/api/v2/motivation/preferences': {
    post: {
      summary: 'Set goal and reminders, without pausing a run',
      security: [
        {
          Session: [],
        },
      ],
      parameters: [
        {
          in: 'header',
          name: 'X-Reis-Client',
          required: true,
          schema: {
            const: 'web',
          },
        },
      ],
      responses: {
        200: {
          description: 'Success. Authoritative state; see docs/API-V2.md.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Motivation',
              },
            },
          },
        },
        default: {
          description:
            'JSON error. DEADLINE_EXPIRED 409 can include a committed timeout. Retry the same requestId after uncertain delivery.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftError',
              },
            },
          },
        },
      },
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/MotivationPreferences',
            },
          },
        },
      },
    },
  },
  '/api/v2/periods/{periodId}/entry': {
    post: {
      summary: 'Opt in or withdraw, without resetting quota',
      security: [
        {
          Session: [],
        },
      ],
      parameters: [
        {
          in: 'header',
          name: 'X-Reis-Client',
          required: true,
          schema: {
            const: 'web',
          },
        },
        {
          in: 'path',
          name: 'periodId',
          required: true,
          schema: {
            type: 'string',
            pattern: '^v2-[0-9]{4}-[0-9]{2}-[0-9]{2}$',
          },
        },
      ],
      responses: {
        200: {
          description: 'Success. Authoritative state; see docs/API-V2.md.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/PeriodEntry',
              },
            },
          },
        },
        default: {
          description:
            'JSON error. DEADLINE_EXPIRED 409 can include a committed timeout. Retry the same requestId after uncertain delivery.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftError',
              },
            },
          },
        },
      },
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/PeriodEntryRequest',
            },
          },
        },
      },
    },
  },
  '/api/v2/leaderboards': {
    get: {
      summary: 'Comparable voluntary cohort; five positive results required for ranks',
      security: [
        {
          Session: [],
        },
      ],
      parameters: [
        {
          in: 'query',
          name: 'scope',
          schema: {
            type: 'string',
            enum: ['crew', 'depot', 'company'],
          },
        },
        {
          in: 'query',
          name: 'periodId',
          schema: {
            type: 'string',
          },
        },
        {
          in: 'query',
          name: 'offset',
          schema: {
            type: 'integer',
            minimum: 0,
            maximum: 10000,
          },
        },
        {
          in: 'query',
          name: 'limit',
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 50,
          },
        },
      ],
      responses: {
        200: {
          description: 'Success. Authoritative state; see docs/API-V2.md.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftLeaderboard',
              },
            },
          },
        },
        default: {
          description:
            'JSON error. DEADLINE_EXPIRED 409 can include a committed timeout. Retry the same requestId after uncertain delivery.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ShiftError',
              },
            },
          },
        },
      },
    },
  },
};
