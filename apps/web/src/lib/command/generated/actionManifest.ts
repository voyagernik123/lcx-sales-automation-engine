/**
 * GENERATED — do not edit. Run `npm run gen:actions` after changing
 * apps/api/src/actions/registry.ts or grammar.ts.
 *
 * The command line's verbs come from here, so it is complete by construction: a
 * governed action cannot exist without a command, and a command cannot exist for
 * an action the server does not have. The drift test
 * (apps/api/src/actions/__tests__/manifest.drift.test.ts) fails CI if this file
 * and the registry disagree.
 *
 * Client-side param validation from these schemas is ADVISORY IN BOTH DIRECTIONS:
 * zod's .refine() is lost in translation (so some invalid input looks valid), and
 * the emitted `additionalProperties: false` is stricter than zod, which strips
 * unknown keys (so some valid input looks invalid). invokeAction on the server is
 * the only authority. See apps/api/src/actions/grammar.ts.
 *
 * 30 actions · manifest 9243b51884272a58
 */

import type { ActionManifest } from '../types';

export const ACTION_MANIFEST: ActionManifest = {
  "actions": [
    {
      "id": "assign",
      "label": "Assign owner",
      "description": "Give a deal, monitor, or PIR a real desk owner (a lane, not the shared catch-all).",
      "subjectTypes": [
        "deal",
        "monitor",
        "pir"
      ],
      "minRole": "operator",
      "workspace": null,
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "owner": {
            "type": "string",
            "minLength": 1,
            "maxLength": 64
          }
        },
        "required": [
          "owner"
        ],
        "additionalProperties": false
      },
      "grammar": {
        "enumFrom": {
          "owner": "roster"
        },
        "nounIdShape": "member"
      }
    },
    {
      "id": "command_decide",
      "label": "Record program decision",
      "description": "Close an open US-launch decision with the chosen option (LCX COMMAND).",
      "subjectTypes": [
        "command_decision"
      ],
      "minRole": "operator",
      "workspace": "command",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "chosen": {
            "type": "string",
            "minLength": 1,
            "maxLength": 500
          },
          "rationale": {
            "type": "string",
            "maxLength": 2000
          },
          "overrideSat": {
            "type": "boolean"
          },
          "overrideReason": {
            "type": "string",
            "maxLength": 500
          }
        },
        "required": [
          "chosen"
        ],
        "additionalProperties": false
      },
      "grammar": {
        "paramKinds": {
          "overrideSat": "override",
          "overrideReason": "reason"
        },
        "precondition": {
          "field": "status",
          "in": [
            "open"
          ]
        }
      }
    },
    {
      "id": "command_reopen_decision",
      "label": "Reopen program decision",
      "description": "Reopen a wrongly-recorded US-launch decision (approver only; fully audited).",
      "subjectTypes": [
        "command_decision"
      ],
      "minRole": "approver",
      "workspace": "command",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "reason": {
            "type": "string",
            "minLength": 1,
            "maxLength": 500
          }
        },
        "required": [
          "reason"
        ],
        "additionalProperties": false
      },
      "grammar": {
        "precondition": {
          "field": "status",
          "in": [
            "decided"
          ]
        }
      }
    },
    {
      "id": "command_rfi_record",
      "label": "Record RFI terms",
      "description": "Record a partner's returned RFI commercial terms (LCX COMMAND). Provenance auto-upgrades: returned=B2, signed=A1.",
      "subjectTypes": [
        "command_partner"
      ],
      "minRole": "operator",
      "workspace": "command",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "enum": [
              "issued",
              "returned",
              "signed"
            ]
          },
          "values": {
            "type": "object",
            "propertyNames": {
              "type": "string",
              "maxLength": 60
            },
            "additionalProperties": {
              "type": "string",
              "maxLength": 300
            }
          }
        },
        "required": [
          "status"
        ],
        "additionalProperties": false
      },
      "grammar": {
        "omitSemantics": {
          "values": "merge"
        },
        "enumFrom": {
          "values": "rfi_fields"
        }
      }
    },
    {
      "id": "command_set_blocker_status",
      "label": "Set launch-blocker status",
      "description": "Track resolution of one of the 12 launch blockers (LCX COMMAND).",
      "subjectTypes": [
        "command_blocker"
      ],
      "minRole": "operator",
      "workspace": "command",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "enum": [
              "open",
              "mitigating",
              "resolved"
            ]
          }
        },
        "required": [
          "status"
        ],
        "additionalProperties": false
      },
      "grammar": {
        "nounIdShape": "int"
      }
    },
    {
      "id": "command_set_partner_details",
      "label": "Set partner contact/terms",
      "description": "Fill a partner's primary contact or commercial terms as the RFIs land (LCX COMMAND).",
      "subjectTypes": [
        "command_partner"
      ],
      "minRole": "operator",
      "workspace": "command",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "primaryContact": {
            "type": "string",
            "maxLength": 300
          },
          "terms": {
            "type": "string",
            "maxLength": 1000
          }
        },
        "additionalProperties": false
      },
      "grammar": {
        "atLeastOneOf": [
          [
            "primaryContact",
            "terms"
          ]
        ]
      }
    },
    {
      "id": "command_set_partner_stage",
      "label": "Set partner pipeline stage",
      "description": "Move a US-launch partner through the pipeline (LCX COMMAND).",
      "subjectTypes": [
        "command_partner"
      ],
      "minRole": "operator",
      "workspace": "command",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "stage": {
            "type": "string",
            "enum": [
              "evaluate",
              "recommended_rfi",
              "recommended",
              "incumbent_onboarding",
              "in_progress",
              "select",
              "support",
              "alternate",
              "specialist",
              "hold_geoblock",
              "exclude_pending_counsel",
              "signed",
              "passed"
            ]
          }
        },
        "required": [
          "stage"
        ],
        "additionalProperties": false
      },
      "grammar": {}
    },
    {
      "id": "command_set_requirement_status",
      "label": "Set listing-requirement status",
      "description": "Update one of the 14 listing requirements (LCX COMMAND) — moves the readiness dial.",
      "subjectTypes": [
        "command_requirement"
      ],
      "minRole": "operator",
      "workspace": "command",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "enum": [
              "Not started",
              "In progress",
              "Done"
            ]
          }
        },
        "required": [
          "status"
        ],
        "additionalProperties": false
      },
      "grammar": {
        "nounIdShape": "int"
      }
    },
    {
      "id": "command_set_task_status",
      "label": "Set program task status",
      "description": "Advance a US-launch program task (LCX COMMAND).",
      "subjectTypes": [
        "command_task"
      ],
      "minRole": "operator",
      "workspace": "command",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "enum": [
              "not_started",
              "pending",
              "open",
              "in_progress",
              "blocked",
              "tentative",
              "future",
              "done"
            ]
          }
        },
        "required": [
          "status"
        ],
        "additionalProperties": false
      },
      "grammar": {}
    },
    {
      "id": "create_task",
      "label": "Create follow-up task",
      "description": "Queue a task on the project.",
      "subjectTypes": [
        "project"
      ],
      "minRole": "operator",
      "workspace": null,
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "detail": {
            "type": "string",
            "maxLength": 500
          }
        },
        "required": [
          "title"
        ],
        "additionalProperties": false
      },
      "grammar": {}
    },
    {
      "id": "decide_access_request",
      "label": "Decide access request",
      "description": "Approve or deny a pending workspace access request (LCX OS).",
      "subjectTypes": [
        "access_request"
      ],
      "minRole": "approver",
      "workspace": "governance",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "decision": {
            "type": "string",
            "enum": [
              "approved",
              "denied"
            ]
          },
          "note": {
            "type": "string",
            "maxLength": 500
          }
        },
        "required": [
          "decision"
        ],
        "additionalProperties": false
      },
      "grammar": {
        "precondition": {
          "field": "status",
          "in": [
            "pending"
          ]
        }
      }
    },
    {
      "id": "dist_campaign_create",
      "label": "Create distribution campaign",
      "description": "Draft a quest/incentive/content/outreach campaign (starts in draft).",
      "subjectTypes": [
        "distribution"
      ],
      "minRole": "operator",
      "workspace": "distribution",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 160
          },
          "surfaceId": {
            "type": "string",
            "maxLength": 60
          },
          "kind": {
            "type": "string",
            "enum": [
              "quest",
              "incentive",
              "content",
              "outreach"
            ]
          },
          "tokenIncentivized": {
            "type": "boolean"
          },
          "budgetLcx": {
            "type": "number",
            "minimum": 0
          },
          "detail": {
            "type": "string",
            "maxLength": 1000
          }
        },
        "required": [
          "name",
          "kind"
        ],
        "additionalProperties": false
      },
      "grammar": {
        "nounIdShape": "pseudo"
      }
    },
    {
      "id": "dist_campaign_set_status",
      "label": "Set campaign status",
      "description": "Advance a campaign through its lifecycle (launch is compliance-gated).",
      "subjectTypes": [
        "dist_campaign"
      ],
      "minRole": "operator",
      "workspace": "distribution",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "enum": [
              "draft",
              "compliance_review",
              "approved",
              "live",
              "measured"
            ]
          },
          "overrideGate": {
            "type": "boolean"
          },
          "overrideReason": {
            "type": "string",
            "maxLength": 500
          }
        },
        "required": [
          "status"
        ],
        "additionalProperties": false
      },
      "grammar": {
        "paramKinds": {
          "overrideGate": "override",
          "overrideReason": "reason"
        }
      }
    },
    {
      "id": "dist_listing_set_status",
      "label": "Set listing status",
      "description": "Advance a distribution surface through the listing pipeline.",
      "subjectTypes": [
        "dist_listing"
      ],
      "minRole": "operator",
      "workspace": "distribution",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "enum": [
              "not_started",
              "submitted",
              "live",
              "ranked"
            ]
          },
          "rankNote": {
            "type": "string",
            "maxLength": 200
          },
          "usageNote": {
            "type": "string",
            "maxLength": 200
          },
          "url": {
            "type": "string",
            "maxLength": 300
          }
        },
        "required": [
          "status"
        ],
        "additionalProperties": false
      },
      "grammar": {
        "omitSemantics": {
          "rankNote": "preserve",
          "usageNote": "preserve",
          "url": "preserve"
        }
      }
    },
    {
      "id": "flag_review",
      "label": "Flag for review",
      "description": "Mark the object for analyst review (logged only).",
      "subjectTypes": [
        "*"
      ],
      "minRole": "operator",
      "workspace": null,
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "reason": {
            "type": "string",
            "maxLength": 300
          }
        },
        "additionalProperties": false
      },
      "grammar": {}
    },
    {
      "id": "gps_conflict_declare",
      "label": "Declare conflict position",
      "description": "Record the conflict-of-interest decision on a services engagement (GLOBAL SERVICES). Required before anything is issued to the client.",
      "subjectTypes": [
        "gps_engagement"
      ],
      "minRole": "approver",
      "workspace": "gps",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "checkPerformed": {
            "type": "string",
            "minLength": 24,
            "maxLength": 4000
          },
          "decision": {
            "type": "string",
            "enum": [
              "cleared",
              "cleared_with_disclosure",
              "declined"
            ]
          },
          "disclosureTextUsed": {
            "type": "string",
            "maxLength": 4000
          }
        },
        "required": [
          "checkPerformed",
          "decision"
        ],
        "additionalProperties": false
      },
      "grammar": {}
    },
    {
      "id": "gps_discount_approve",
      "label": "Approve concession price",
      "description": "Authorise issuing a services engagement at a price below cost or below its band (GLOBAL SERVICES). Approver only; cannot be self-approved.",
      "subjectTypes": [
        "gps_engagement"
      ],
      "minRole": "approver",
      "workspace": "gps",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "priceCents": {
            "type": "integer",
            "minimum": 1,
            "maximum": 1000000000
          },
          "reason": {
            "type": "string",
            "minLength": 12,
            "maxLength": 500
          }
        },
        "required": [
          "priceCents",
          "reason"
        ],
        "additionalProperties": false
      },
      "grammar": {}
    },
    {
      "id": "gps_engagement_accept",
      "label": "Record client acceptance",
      "description": "Record that the client accepted the proposal (GLOBAL SERVICES). Sets accepted_at; the deposit is separate because a signature is not cash.",
      "subjectTypes": [
        "gps_engagement"
      ],
      "minRole": "operator",
      "workspace": "gps",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "depositRequiredCents": {
            "type": "integer",
            "minimum": 0,
            "maximum": 1000000000
          },
          "note": {
            "type": "string",
            "maxLength": 500
          }
        },
        "additionalProperties": false
      },
      "grammar": {}
    },
    {
      "id": "gps_proposal_issue",
      "label": "Issue proposal",
      "description": "Freeze the offer scope, set the price, and move a services engagement to proposed (GLOBAL SERVICES). Conflict-gated; a below-cost or below-band price needs a prior approval.",
      "subjectTypes": [
        "gps_engagement"
      ],
      "minRole": "operator",
      "workspace": "gps",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "priceCents": {
            "type": "integer",
            "minimum": 1,
            "maximum": 1000000000
          },
          "vendorCostCents": {
            "type": "integer",
            "minimum": 1,
            "maximum": 1000000000
          },
          "depositRequiredCents": {
            "type": "integer",
            "minimum": 0,
            "maximum": 1000000000
          },
          "currency": {
            "type": "string",
            "pattern": "^[A-Z]{3}$"
          }
        },
        "required": [
          "priceCents"
        ],
        "additionalProperties": false
      },
      "grammar": {}
    },
    {
      "id": "gps_status_change",
      "label": "Move engagement status",
      "description": "Move a services engagement along its lifecycle by hand (GLOBAL SERVICES). Cannot set proposed or accepted — those have their own gated actions.",
      "subjectTypes": [
        "gps_engagement"
      ],
      "minRole": "operator",
      "workspace": "gps",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "status": {
            "type": "string",
            "enum": [
              "draft",
              "conflict_pending",
              "deposit_paid",
              "in_delivery",
              "delivered",
              "invoiced",
              "collected",
              "closed_lost",
              "cancelled"
            ]
          },
          "reason": {
            "type": "string",
            "maxLength": 500
          }
        },
        "required": [
          "status"
        ],
        "additionalProperties": false
      },
      "grammar": {}
    },
    {
      "id": "grant_entitlement",
      "label": "Grant workspace access",
      "description": "Entitle a roster member to a workspace at a capability tier (LCX OS).",
      "subjectTypes": [
        "member"
      ],
      "minRole": "approver",
      "workspace": "governance",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "workspace": {
            "type": "string",
            "enum": [
              "command",
              "sales",
              "intel",
              "regulatory",
              "distribution",
              "marketing",
              "gps",
              "governance"
            ]
          },
          "capability": {
            "type": "string",
            "enum": [
              "view",
              "operate",
              "approve"
            ]
          },
          "justification": {
            "type": "string",
            "minLength": 1,
            "maxLength": 500
          }
        },
        "required": [
          "workspace",
          "capability",
          "justification"
        ],
        "additionalProperties": false
      },
      "grammar": {}
    },
    {
      "id": "marketing_embargo_enter",
      "label": "Enter asset embargo state",
      "description": "Record an asset's inside-information state (MiCA Art 87-90) so drafts naming it refuse. Approver-only, named human, one live entry per asset.",
      "subjectTypes": [
        "marketing_asset"
      ],
      "minRole": "approver",
      "workspace": "marketing",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "eventRef": {
            "type": "string",
            "minLength": 1,
            "maxLength": 80
          },
          "state": {
            "type": "string",
            "enum": [
              "mnpi_pending",
              "announced",
              "clear",
              "exempt_offer"
            ]
          },
          "sourceRef": {
            "type": "string",
            "minLength": 1,
            "maxLength": 120
          },
          "reviewInDays": {
            "type": "integer",
            "minimum": 1,
            "maximum": 365
          },
          "embargoUntilDays": {
            "type": "integer",
            "minimum": 1,
            "maximum": 3650
          }
        },
        "required": [
          "eventRef",
          "state",
          "sourceRef",
          "reviewInDays"
        ],
        "additionalProperties": false
      },
      "grammar": {}
    },
    {
      "id": "marketing_embargo_lift",
      "label": "Lift asset embargo entry",
      "description": "Record that an embargo entry is no longer in force, naming who lifted it. One-way; the next state is a new entry. Approver-only.",
      "subjectTypes": [
        "marketing_asset"
      ],
      "minRole": "approver",
      "workspace": "marketing",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "eventRef": {
            "type": "string",
            "minLength": 1,
            "maxLength": 80
          }
        },
        "required": [
          "eventRef"
        ],
        "additionalProperties": false
      },
      "grammar": {}
    },
    {
      "id": "marketing_holdings_declare",
      "label": "Declare your position in an asset",
      "description": "Declare (or amend, or renew) whether YOU hold a named asset — MiCA Art 91(3)(c). Self-service: it records the authenticated member and nobody else.",
      "subjectTypes": [
        "marketing_asset"
      ],
      "minRole": "operator",
      "workspace": "marketing",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "holds": {
            "type": "boolean"
          },
          "renewInDays": {
            "type": "integer",
            "minimum": 1,
            "maximum": 366
          },
          "amendmentReason": {
            "type": "string",
            "enum": [
              "position_opened",
              "position_closed",
              "earlier_entry_wrong",
              "asset_renamed",
              "periodic_renewal"
            ]
          }
        },
        "required": [
          "holds",
          "renewInDays"
        ],
        "additionalProperties": false
      },
      "grammar": {}
    },
    {
      "id": "notify",
      "label": "Send notification",
      "description": "Raise an in-app notification on the subject.",
      "subjectTypes": [
        "*"
      ],
      "minRole": "operator",
      "workspace": null,
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "title": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "detail": {
            "type": "string",
            "maxLength": 500
          },
          "href": {
            "type": "string",
            "maxLength": 300
          }
        },
        "required": [
          "title"
        ],
        "additionalProperties": false
      },
      "grammar": {}
    },
    {
      "id": "revoke_entitlement",
      "label": "Revoke workspace access",
      "description": "Remove a roster member’s entitlement to a workspace (LCX OS).",
      "subjectTypes": [
        "member"
      ],
      "minRole": "approver",
      "workspace": "governance",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "workspace": {
            "type": "string",
            "enum": [
              "command",
              "sales",
              "intel",
              "regulatory",
              "distribution",
              "marketing",
              "gps",
              "governance"
            ]
          },
          "justification": {
            "type": "string",
            "minLength": 1,
            "maxLength": 500
          },
          "stepUpPasscode": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          }
        },
        "required": [
          "workspace",
          "justification",
          "stepUpPasscode"
        ],
        "additionalProperties": false
      },
      "grammar": {
        "paramKinds": {
          "stepUpPasscode": "secret",
          "justification": "reason"
        }
      }
    },
    {
      "id": "set_member_profile",
      "label": "Set member profile",
      "description": "Record a roster member’s unit and title (LCX OS Directorate).",
      "subjectTypes": [
        "member"
      ],
      "minRole": "approver",
      "workspace": "governance",
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "unit": {
            "type": "string",
            "maxLength": 80
          },
          "title": {
            "type": "string",
            "maxLength": 120
          }
        },
        "additionalProperties": false
      },
      "grammar": {
        "atLeastOneOf": [
          [
            "unit",
            "title"
          ]
        ],
        "omitSemantics": {
          "unit": "null",
          "title": "null"
        }
      }
    },
    {
      "id": "track",
      "label": "Track token",
      "description": "Promote a catalog token into the tracked (deep-intel) tier.",
      "subjectTypes": [
        "project"
      ],
      "minRole": "operator",
      "workspace": null,
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "grammar": {
        "precondition": {
          "field": "tier",
          "in": [
            "catalog"
          ]
        }
      }
    },
    {
      "id": "watchlist_add",
      "label": "Add to watchlist",
      "description": "Pin the object to the desk watchlist.",
      "subjectTypes": [
        "*"
      ],
      "minRole": "operator",
      "workspace": null,
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
          "note": {
            "type": "string",
            "maxLength": 300
          }
        },
        "additionalProperties": false
      },
      "grammar": {}
    },
    {
      "id": "watchlist_remove",
      "label": "Remove from watchlist",
      "description": "Take the object off your watchlist, so it stops appearing on your desk.",
      "subjectTypes": [
        "*"
      ],
      "minRole": "operator",
      "workspace": null,
      "params": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {},
        "additionalProperties": false
      },
      "grammar": {}
    }
  ],
  "valueSets": {
    "roster": [
      "monty",
      "nik",
      "operator",
      "sam"
    ],
    "rfi_fields": [
      "alt_spread_bps",
      "api_fix_rest_ws",
      "assets_covered",
      "btc_eth_spread_bps",
      "credit_line_pre_funding",
      "fee_model",
      "fiat_supported",
      "majors_spread_bps",
      "max_single_ticket",
      "min_ticket",
      "oes_supported_fb_copper_bitgo",
      "options_y_n",
      "otc_desk_y_n",
      "owner_contact",
      "references",
      "rfq_y_n",
      "settlement_cycle",
      "status",
      "uptime_sla",
      "us_entity_licences"
    ]
  },
  "manifestHash": "9243b51884272a58"
} as const satisfies ActionManifest;

export const MANIFEST_HASH = "9243b51884272a58";
