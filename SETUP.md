# AI Project Lab MVP v1.0: Setup Guide

This is the collaborative web app for the one-day AI Project Lab. Next.js runs the screens, Supabase stores the data and handles logins and live updates, and Vercel hosts it for free.

Plan on about an hour the first time.

## What you need

- A free Supabase account: https://supabase.com
- A free Vercel account: https://vercel.com (sign in with GitHub)
- A GitHub repo for this code (push it by hand the way you normally do)

## 1. Create the Supabase project

1. In Supabase, click New project. Name it `ai-project-lab`, choose a strong database password, and pick the West US region.
2. Wait for it to finish setting up.

## 2. Build the database

1. Open SQL Editor, then New query.
2. Paste in each file from `supabase/migrations`, one at a time, in this order, and click Run after each one:
   1. `0001_schema.sql`
   2. `0002_security.sql`
   3. `0003_logic.sql`
   4. `0004_reporting.sql`
   5. `0005_realtime.sql`
3. Each one should say "Success. No rows returned."

Do not run `supabase/seed.sql` on the pilot database. It creates fake demo students. It is only for a separate practice project.

## 3. Auth settings

Go to Authentication, then Sign In / Providers, then Email:

- Keep Email turned on.
- Turn OFF "Confirm email". Supabase's built-in email service only sends a few messages per hour, so a class of students signing up at once would get stuck waiting for confirmation emails. If you want confirmation turned on, connect your own email service under Authentication, then SMTP Settings, first.

Under Authentication, then URL Configuration, set Site URL to your Vercel address once you have it (step 5).

## 4. Make yourself the instructor

1. Open the app (step 5) and create an account with your own email.
2. Back in Supabase SQL Editor, run this with your email:

```sql
update public.profiles set role = 'instructor'
where id = (select id from auth.users where email = 'YOUR-EMAIL-HERE');
```

3. Sign out and sign back in. You will see the Instructor button.

Students never get this role. The app blocks anyone from changing their own role.

## 5. Deploy on Vercel

1. In Vercel, click Add New, then Project, and import the GitHub repo.
2. Under Environment Variables, add these two. Both are in Supabase under Project Settings, then API:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the anon public key
3. Click Deploy.

The anon key is safe to put in the browser. Row Level Security in the database decides what each person can see. Never put the service_role key anywhere in this app.

## 6. Run a lab

1. Instructor, then Create a lab. The pilot challenge is filled in for you.
2. Open Lab settings:
   - Replace the two DRAFT individual tasks (baseline and post-lab) with your own. Keep them comparable.
   - Change Status to Open.
3. Give students the six-character join code on the dashboard.
4. Students create an account, enter the code, and do the baseline task.
5. Teams page: click Auto-assign to fill teams of four in the order students joined, or build teams by hand. Roles are assigned automatically and can be changed.
6. Live dashboard: watch progress, message teams, call huddles, rotate roles after lunch, and unlock the Prototype Gallery during SHOW.
7. Pilot analytics: download the de-identified data when the day is over.

## Try it locally first (optional)

```bash
npm install
cp .env.example .env.local   # fill in the two values
npm run dev                  # open http://localhost:3000
```

For a practice copy with demo data, make a second Supabase project, run the five migrations, then run `supabase/seed.sql`. Demo logins use the password `LabDemo2026!`:
- `instructor@demo.lab`
- `atlas1@demo.lab` through `atlas4@demo.lab`, and the same pattern for catalyst, nexus, and orbit

## Tests

- `supabase/tests/run.sh` runs 21 database acceptance tests against a local Postgres 16. They cover team privacy, stage gates, AI credits, decisions, huddles, role rotation, joining, overrides, the de-identified export, and Returning Builder Mode.
- The browser checks (34 of them) were run against a production build during development, including automated WCAG 2.2 AA scans of every main screen.

## Changing the rules

Every timing threshold and credit cost is in one SQL function, `lab_config()`, in `0003_logic.sql`. See `GATES.md` for what unlocks each stage and which choices were mine to make where the spec left a gap.

When you change the rules, raise the version numbers in Lab settings so the pilot data shows which version each lab ran.

## Free plan notes

- A free Supabase project pauses after about a week with no activity. Your data is kept. Open the Supabase dashboard and click Restore before your next session, and give it a few minutes.
- Free projects have no automatic backups. Download the pilot export after every lab.
