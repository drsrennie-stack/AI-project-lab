# Accessibility Compliance Notes

## 1. Project, files, date

- Project: AI Project Lab MVP v1.0 (web application)
- Files covered: every screen under `app/` and `components/` (landing, login, join, lab welcome, baseline and post tasks, reflection, Project Room, all maps, Decision Matrix and decisions, build, test, improve, Project Story, Return Ticket, returning check-in, Prototype Gallery, cross-team analysis, instructor dashboard, teams, settings, gallery controls, pilot analytics)
- Date: September 17, 2026

## 2. WCAG version and level

Target: WCAG 2.2 AA minimum, AAA where achievable.

| Criterion | Level reached | How |
|---|---|---|
| 1.1.1 Non-text content | AA | Decorative symbols are `aria-hidden`. Icon-only buttons have accessible names. |
| 1.3.1 Info and relationships | AA | Landmarks (header, nav, main, aside, footer), heading order, tables with captions and scoped headers, fieldsets with legends, labels tied to inputs with `for` and `id`. |
| 1.3.2 Meaningful sequence | AA | DOM order matches reading order. The map board has a List view in document order. |
| 1.4.1 Use of color | AA | Stage states use words (Done, Now, Locked) and borders. Dashboard indicators use a shape and a label (Progressing, Needs attention, Likely stuck). Critical cards carry a CRITICAL ASSUMPTION label. |
| 1.4.3 / 1.4.6 Contrast | AAA for text | See section 3. |
| 1.4.10 Reflow | AA | Layouts stack at phone width. Wide tables and the map board scroll inside their own region, not the page. |
| 1.4.11 Non-text contrast | AA | Input borders 4.8:1. Focus ring 7.66:1. |
| 1.4.13 Content on hover | AA | No hover-only content. |
| 2.1.1 Keyboard | AA | Every action is a button, link, or form control. Map cards move with a Move to menu and arrow buttons, with no dragging required. |
| 2.1.2 No keyboard trap | AA | Dialogs use native `<dialog>`. Escape closes and focus returns to the opener. |
| 2.4.1 Bypass blocks | AA | Skip link on every page. |
| 2.4.3 Focus order | AA | Follows the visual order. |
| 2.4.7 / 2.4.13 Focus visible and appearance | AA | 3px terra outline with 2px offset, white on the navy instructor bar. |
| 2.5.7 Dragging movements | AA | Drag is optional. The same move is available from the card menu. |
| 2.5.8 Target size (minimum) | AA | Buttons are at least 32px tall, most 40px. |
| 3.3.1 / 3.3.2 Errors and labels | AA | Visible labels and hints on every field. Errors appear in text next to the form in an alert region. |
| 4.1.2 Name, role, value | AA | `aria-expanded` on collapsibles, `aria-pressed` on toggles, `aria-selected` on tabs, `aria-current` on stage and nav. |
| 4.1.3 Status messages | AA | Save status, credit warnings, gate results, copied prompts, and feed updates use `role="status"` or `aria-live`. |
| 2.3.3 Animation from interactions | AAA | `prefers-reduced-motion` turns off transitions. |

## 3. Color contrast audit

| Text / background | Ratio | Result |
|---|---|---|
| Navy #0B1530 on white #FFFFFF | 18.04:1 | Pass AAA |
| Navy #0B1530 on off-white #FAFAF9 (board) | 17.27:1 | Pass AAA |
| Navy #0B1530 on navy-tint #EDF1F3 (completed state) | 15.87:1 | Pass AAA |
| White on navy #0B1530 (primary buttons, instructor bar) | 18.04:1 | Pass AAA |
| Terra #8B3A2E on white (eyebrows, labels) | 7.66:1 | Pass AAA |
| White on terra #8B3A2E (accent buttons) | 7.66:1 | Pass AAA |
| Terra #8B3A2E on off-white #FAFAF9 | 7.33:1 | Pass AAA |
| Muted #4F576A on white (hints) | 7.23:1 | Pass AAA |
| Muted #4F576A on navy-tint #EDF1F3 | 6.36:1 | Pass AA, AAA for large text |
| OK green #155A31 on white (Progressing) | 8.27:1 | Pass AAA |
| Warning #6B4900 on white (Needs attention) | 8.15:1 | Pass AAA |
| Danger #9E2A1E on white (Likely stuck, errors) | 7.49:1 | Pass AAA |
| Placeholder #6E7686 on white | 4.57:1 | Pass AA. Lighter than body copy on purpose, and every example placeholder starts with "Examples:". |
| Input border #6B7285 on white | 4.80:1 | Pass (3:1 needed) |

Palette note: this build uses the reconciled house card system from Aug 30 2026 (navy #0B1530, terra #8B3A2E, white ground, hairline borders, no gold). No sage, cream, pink, or pastel fills. No italics anywhere (forced off globally). No Lora.

## 4. Keyboard navigation flow

Checked with automated browser runs plus code review:

1. Skip link, then header, then project sections nav.
2. Stage bar (scrollable region on phones), then credit, sprint objective, and roles cards.
3. Main workspace: stage checklist, then advance button, then activity links.
4. Maps: view toggle, add buttons in each column, then each card's Open card button. Inside the card dialog: text, Move to menu, arrow nudge buttons, connect, group, archive, delete (with confirmation).
5. Collapsible panels (Project Specification, Version history, Evidence, AI Interaction Log).
6. Sidebar: instructor message, alerts (FLAG ISSUE for Red Team), huddle, open decisions, team feed (focusable scroll region).

Verified in the browser run: moving a card to another column from the keyboard in List view, opening and closing dialogs with Enter and Escape, and submitting forms.

## 5. Screen reader testing

- Automated: axe-core WCAG 2.0/2.1/2.2 A and AA rules on 12 screens (lab welcome, baseline, Project Room, map board, add-card dialog, map list view, idea map, decision page, instructor dashboard, teams, analytics, gallery). Result: 0 serious or critical violations.
- Structural review: landmark names, heading levels, table captions, live regions, and hidden decorative symbols.
- Not yet done: a manual pass with NVDA on Windows and VoiceOver on Mac. Automated tools cannot confirm how the announcements actually sound. This needs to happen before Pilot 1.

## 6. Known limitations and remediation plan

| Limitation | Plan |
|---|---|
| Manual screen reader test not done | Run NVDA (Chrome) and VoiceOver (Safari) through the student first-run flow, one map, the decision page, and the dashboard before the pilot. |
| Board view positions are visual. Screen reader users should use List view. | The board view note points to List view. Add a live announcement when a teammate moves a card, if testers ask for it. |
| Arrows between cards are drawn visually. Screen readers get them from the card dialog's Connections list. | Consider adding connections to List view after the pilot. |
| Live team updates show up in the feed region, which is polite and may be missed when busy | Check with student testers whether announcements help or distract. |
| Fonts load from Google Fonts. A blocked network falls back to system sans. | Acceptable. The fallback stack is all sans-serif. |
| Prototype links open third-party sites the app cannot control | Students are told to share accessible formats. Instructor reviews in the gallery. |

## 7. Reviewer

Built and reviewed by Claude (automated checks and code review) for Dr. Sharilyn Rennie. Manual assistive-technology review is still pending.
