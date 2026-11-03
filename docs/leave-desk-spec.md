# LeaveDesk — leave management, approvals and availability

## Summary

Add **LeaveDesk below Service Desk** in Helios’s sidebar. Employees manage leave, managers review requests and availability, and central admins configure policies and calendars.

The agreed first release includes fixed leave allowances, department calendars, manager approvals, private medical attachments, NCNS records and operational insights. It uses Helios’s existing employee records, reporting managers, departments and Admin Team.

## Employee and manager experience

- **Overview:** personal balances, upcoming leave and holidays; managers also see pending approvals and direct reports away.
- **Calendar:** month/week views with personal and department filters. Show approved leave, with pending requests visible only to the requester and authorized reviewers.
- **My Leave:** request full or half days, add comments/files, track decisions and request cancellation. Past-date applications require an explanation.
- **Approvals:** approve, decline or request changes, with dated comments and history. Declines and requested changes require a reason.
- **Insights:** leave used/booked/pending/remaining, people away, overlapping absences, approval waiting time, monthly leave trends and unresolved NCNS incidents.
- **Settings:** central admins manage leave types, reusable policies, employee assignments, working calendars and reasoned balance adjustments.

Coworkers see **“On leave”** and dates. Reasons, comments, medical files and NCNS records remain private to the employee, current authorized deciding manager and central admins.

## Rules and defaults

**Approvals and changes**

- One reporting manager approves. An independent central admin handles requests without an eligible manager or explicitly takes over an unavailable manager’s request, recording a reason.
- No self-approval, including admin requests. If no independent reviewer exists, hold the request until one is assigned.
- Recheck current permissions on every action; reporting-manager changes transfer pending reviews and revoke the former manager’s access.
- Submitted dates, type and duration cannot be silently changed. Amendments require resubmission; approved leave changes require cancellation and a replacement request.
- Pending requests can be withdrawn immediately. Cancelling approved leave requires reviewer approval; the original booking remains effective until accepted.

**Leave types and balances**

- Offer configurable annual/earned, casual/personal, sick/medical, unpaid, compensatory-off and optional/restricted-holiday types. Admins can add parental, bereavement and other types.
- Policies support **January or April starts**. Admins explicitly set allowances, paid/unpaid classification and whether a type tracks a balance; ship no assumed statutory entitlements.
- Use a balance ledger: allowance and adjustments minus approved bookings and pending reservations. Show past approved days as used and future days as booked without deducting either twice.
- Reserve balance on submission; convert the reservation on approval; release it on decline/withdrawal. Accepted cancellations restore the appropriate balance.
- Prevent overlapping active requests and insufficient balances. Additional allowance requires a recorded admin adjustment.
- Split cross-year requests across their applicable allowance periods. No automatic proration, accrual or carry-forward in v1.
- Existing employees receive admin-confirmed opening balances at rollout, avoiding an accidental full-year allowance grant.

**Calendars and holidays**

- Assign each employee a structured working calendar containing timezone, working weekdays and company-observed holidays; do not infer it from free-text location.
- Support Indian and US reference overlays separately from company days off. Indian central/regional and restricted holidays need distinct labels; US federal calendars include observed dates. Sources: [Indian government holiday lists](https://cag.gov.in/en/pages/single/page-defence-new-delhi-holidaylist), [US OPM](https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/).
- Seed reviewed reference lists for the launch year and following year; admins can import or enter regional/company dates. Preserve source, year and review status.
- Deduct only scheduled working days under the employee’s assigned calendar. Half days use first/second-half selections.
- Require policy/calendar assignment before submission. Later calendar or policy changes must not silently recalculate existing requests.
- Coverage warnings use scheduled employee availability and an optional department minimum; they do not claim actual shift coverage or automatically reject requests.

**NCNS and handovers**

- NCNS is a separate manager/admin-recorded incident with date, expected work period, comments and employee explanation. No automatic detection from login activity.
- Reviewers can confirm, correct, dismiss or convert an incident into approved leave, preserving history and preventing duplicate deductions.
- NCNS does not automatically deduct allowance or trigger payroll/disciplinary action.
- Include optional handover notes and a backup colleague. Warn about overlapping task deadlines only where the viewer already has task access; do not reassign work automatically.

## Implementation and integration

- Add `/dashboard/leave-desk`, with typed `/api/leave-desk/*` interfaces for requests/actions, calendars, balances, insights, NCNS and authorized settings.
- Add dedicated leave tables for policies/assignments, calendars, requests/day allocations, balance ledger, comments/files, incidents and audit events. Keep these separate from board and Service Desk approvals.
- Enforce authorization, balance reservations and decisions transactionally through authenticated database functions and RLS. Use revision checks and idempotent actions to prevent stale approvals and duplicate deductions.
- Extend the notification bell and My Work with leave-specific links and approval counts. Notifications contain no medical details. Email is outside v1.
- Store optional PDF/JPEG/PNG attachments in private storage, maximum 10 MB each, with authorized downloads following Helios’s existing private-file pattern.
- Preserve historical records through account deactivation/deletion without granting inactive users access.
- Apply an additive migration, verify preservation of existing data and retain leave history if application code is rolled back.

## Validation and acceptance

- Verify independent manager/admin approval, missing-manager fallback, manager reassignment and immediate permission revocation.
- Test reservations, concurrent submissions/approvals, insufficient balances, half days, overlaps, cancellations, cross-year periods and January/April boundaries.
- Test working-week differences, timezone boundaries, observed holidays and separation of reference overlays from deductible company holidays.
- Prove coworkers cannot access private comments, medical files or NCNS through APIs, storage, notifications or calendar responses.
- Verify NCNS correction/conversion, accurate insight totals and preserved history.
- Check desktop/mobile calendar and forms, keyboard operation, existing regression tests, lint, typecheck and production build.
- Roll out with isolated employee/manager/admin fixtures and preservation checks before enabling real policies.

**Deferred:** payroll, attendance capture, shift rostering, automated accrual/proration/carry-forward, external calendar sync and automated absence scoring.
