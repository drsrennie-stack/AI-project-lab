# Stage Gates and Build Decisions

The database enforces these rules, so students cannot skip a stage by editing the page. The instructor can override any gate from the dashboard or the Project Room.

## Standard flow

| Leaving | Required (from spec section 39) | How the app checks it |
|---|---|---|
| DEFINE | Problem Map complete, Stakeholder Map complete, success criteria entered | Both maps marked complete. Success criteria field is not empty. |
| EXPLORE | Evidence Map started, Assumption Map complete, one critical unknown | At least one evidence card. Assumption Map marked complete. At least one assumption flagged CRITICAL ASSUMPTION. |
| DECIDE | Three concepts (or override), Decision Matrix complete, team-selected solution, Project Specification complete | Three ideas sent to the matrix. Matrix marked complete. Selected solution filled in by an accepted decision. All ten spec parts present. |
| BUILD | Prototype V1, Human/AI Map complete, Workflow Map started | At least one prototype version. Human/AI Map marked complete. At least one workflow step. |
| TEST | Failure Map complete, one test, one finding | Failure Map marked complete. At least one test. At least one test with findings written. |
| IMPROVE | Version Map complete, V2 or documented revision, AI rejection reflection | Version Map marked complete. Two or more prototype versions. Reflection saved. |

## Minimum to mark each map complete

Spec values are used where the spec gave them. Where it did not, I set a small default. These are marked "my default" and are easy to change in `map_requirements()` in `0003_logic.sql`.

| Map | Minimum | Source |
|---|---|---|
| Problem Map | 1 problem, 2 causes, 2 effects, 1 unknown | Spec |
| Stakeholder Map | 1 primary user | Spec |
| Assumption Map | 1 card in each column | My default |
| Decision Matrix | 3 concepts (or override), every concept scored on all 7 criteria | Spec plus my default for "complete" |
| Human / AI Map | 3 tasks placed | My default |
| Version Map | 1 fully documented change, 3 encouraged | Spec says encourage 3 |
| Evidence, Idea, Workflow, Failure | 1 card | My default |

## Returning Builder Mode gates (my defaults)

The spec gives the flow (REASSESS, TEST, REDESIGN, BUILD, SHOW) but no gate rules.

| Leaving | Required |
|---|---|
| REASSESS | Returning team check-in saved for this session |
| TEST | One test with findings since the check-in |
| REDESIGN | One decision accepted since the check-in |
| BUILD | One new prototype version since the check-in |

## Dashboard indicators (spec section 41, thresholds in `lab_config()`)

| Flag | Rule | Level |
|---|---|---|
| Inactivity | No project activity for 20 minutes | Red |
| Stage delay | Longer than planned minutes for the stage. Red at double. | Yellow or red |
| Unresolved alert | An alert open 15 minutes | Yellow |
| AI heavy use | 3 or more AI logs in 20 minutes with fewer other team actions than AI logs | Yellow (my definition) |
| No verification | 2 or more evidence claims and nothing verified, or 2 or more AI outputs marked "needs checking" and none checked | Yellow (my definition) |
| Low credit | Fewer than 25 credits | Yellow |

Planned minutes per stage (my defaults, tune to your schedule): DEFINE 45, EXPLORE 45, DECIDE 40, BUILD 75, TEST 40, IMPROVE 40, SHOW 30.

Green means no flags. The dashboard says in plain words that indicators describe workflow state only.

## Other choices where the spec left a gap

- Deciding a decision: any team member can mark a decision accepted, accepted with changes, or rejected after writing the team's rationale. Teammate responses (support, question, modify, reject) are shown as a tally. The app does not count votes automatically.
- AI credits can go below zero. Those logs are marked OVER BUDGET and the instructor sees them. Credit cost is set by the database from the request size, so it cannot be edited after logging.
- Only the current Red Team member can raise a Red Team flag. Everyone can raise a team alert.
- Card editing uses per-card conflict checks. If a teammate changes a card while you have it open, you see both versions and choose.
- Project Specification fields save one at a time with version checks, so two people editing different fields never overwrite each other.
- Students get a short role description. The wording is a draft in `lib/constants.ts`.
- Baseline and post-lab tasks in the demo seed are placeholders marked DRAFT.
- `team_members.current_role` from the spec is named `team_role` because `current_role` is a reserved word in Postgres.
- The spec lists `challenge_id` on projects. The challenge lives on the lab, so projects link to `lab_id`.
- Map connections need a table the spec did not list, so `map_edges` was added. Decision Matrix scores are stored in `matrix_scores`.
- "What We Initially Thought" on the Project Story shows Problem Map cards from the team's first 30 minutes on that map.
- When a project returns in a new lab, its old team stays in the old lab without a project. The full history is kept in `project_labs` and the activity log.

## Not built (spec section 59, or needs a later decision)

- No embedded AI, grading, badges, leaderboards, LMS or Canvas integration.
- No password reset screen. Reset a student's password from Supabase, Authentication, Users.
- No file uploads. Students paste a shared link for uploaded prototypes. Supabase Storage can be added later.
