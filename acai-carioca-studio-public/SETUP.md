# Açaí Carioca Studio — setup guide

## What this first release includes
- Responsive web app with editorial Açaí Carioca styling.
- Email/password sign-in and account creation.
- Visual 3-column Instagram-style feed.
- Image upload to Supabase Storage.
- Content calendar and creative library.
- Shared team To-do board with named checklists, due dates, priorities, assignees and completion tracking.
- Content fields: title, date, format, location, pillar, caption and status.
- Drag-and-drop feed ordering.
- Supabase database and row-level security starter schema.

## Architecture
- Next.js + TypeScript: application.
- Supabase Auth: team sign-in.
- Supabase PostgreSQL: shared content records.
- Supabase Storage: creative images.
- Vercel: hosting and preview deployments.

## 1. Create the Supabase project
Create a project at https://supabase.com/dashboard.
Copy the Project URL and anon/public key from Project Settings → API.

## 2. Configure environment variables
Copy `.env.example` to `.env.local` and fill in:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY

Never put a Supabase service-role key in a browser app.

## 3. Set up the database
Open Supabase → SQL Editor and run `supabase/database.sql`. If the main app is already installed, also run `supabase/add-todo.sql` to create the shared To-do task table.

For this initial scaffold, the posts table is workspace-scoped. After creating your first user:
1. Open Authentication → Users and copy the user's UUID.
2. In SQL Editor create the workspace:
   `insert into public.workspaces(name) values ('Açaí Carioca') returning id;`
3. Add the first member, replacing both UUIDs:
   `insert into public.workspace_members(workspace_id,user_id,role) values ('WORKSPACE_UUID','USER_UUID','owner');`

The app reads the first workspace membership for the signed-in user and scopes content reads/writes to that workspace. Add each teammate by creating their account, then inserting a row in `workspace_members` with the same workspace UUID and their auth user UUID. The starter does not yet include an in-app invitation screen or role-specific UI; those are the next milestone.

## 4. Create image storage
In Supabase → Storage, create a bucket called `creative-assets`.
For a real team deployment, make it private and use signed URLs plus storage policies tied to workspace membership. The starter uses public object URLs for simple feed previews, while upload permissions are restricted to each authenticated user's own folder. For confidential assets, switch to a private bucket and signed URLs before production.

## 5. Run locally
Install Node.js 20 or newer, then:
```bash
npm install
npm run dev
```
Open http://localhost:3000.

## 6. Deploy to Vercel
1. Push this folder to a private GitHub repository.
2. Import that repository at https://vercel.com/new.
3. Add the two Supabase environment variables in Vercel Project Settings.
4. Deploy.
5. Vercel will provide a free `*.vercel.app` address.
6. Later, connect `studio.acaicarioca.com` in Vercel → Settings → Domains and update DNS at your domain registrar.

## Before inviting the whole team
- Implement workspace provisioning and invitations.
- Add role-aware permissions and a workspace_id to every post write/query.
- Add private storage policies and signed image URLs.
- Add audit history and approval states.
- Test RLS with separate owner/editor/viewer accounts.
- Configure Supabase Auth redirect URLs for the deployed domain.

## Important
This ZIP is source code, not a deployed website. No hosting, Supabase project, domain, or team accounts have been created by this export. You control those accounts and must connect them to publish the app.

\n## Fix for publication dates (if you previously added a `date` column)\nRun `supabase/fix-publication-date.sql` once in Supabase → SQL Editor. It copies any dates from the temporary `date` column into `publish_date`, which is the column used by the calendar and feed.\n
## 7. Enable the To-do tab
Run `supabase/add-todo.sql` in Supabase → SQL Editor. This creates the shared `tasks` table and its workspace-member access policies. Then replace the app files with this release and restart the development server or redeploy. Existing posts and publication dates remain in Supabase.

## 8. "Continue with Google" and the Privacy Policy
1. Google Cloud Console → Google Auth Platform → Clients → Web application client.
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
2. Supabase → Authentication → Sign In / Providers → Google: enable it and paste the Client ID and Client Secret.
   The Client Secret stays only in Supabase — never in the code, GitHub or Vercel.
3. Supabase → Authentication → URL Configuration:
   - Site URL: `https://acai-carioca-studio-public.vercel.app`
   - Redirect URLs: `https://acai-carioca-studio-public.vercel.app/**`, `https://*-bianca-team1.vercel.app/**` (Vercel previews) and `http://localhost:3000/**`.
4. The Google consent screen links to the public Privacy Policy at `/privacy` (`app/privacy/page.tsx`).
5. A new Google user still needs a `workspace_members` row (see step 3) before they can see any content.

## 9. Approval workflow
Run `supabase/add-approvals.sql` once in Supabase → SQL Editor (already applied to the production project on Nov 25, 2026).

- Statuses: Idea → In production → Ready → **Awaiting approval** → **Approved** / **Changes requested** → Scheduled → Published.
- Only the **owner** and members with the **approver** role can approve or request changes (enforced in the database).
- Approvers can see everything but cannot create, edit or delete posts or tasks.
- The **Approvals** tab shows two weeks of content at a time, with "Approve all" for the period and per-post comments.

## 10. Team management (inside the app)
Run `supabase/add-team-management.sql` once in Supabase → SQL Editor (already applied to the production project on Nov 25, 2026).

- Anyone who signs in without access sees an "Almost there" screen and is added to **Access requests** automatically.
- The owner (and admins) open the **Team** tab to give access (Editor, Approver, Viewer or Admin), change roles, remove people or decline requests.
- The owner's own access cannot be changed or removed from the app.

## 11. Approval emails (Gmail)
Run `supabase/add-notifications.sql` once (already applied to the production project on Nov 25, 2026).

1. Turn on 2-Step Verification on the Gmail account that will send the emails.
2. Create an app password at https://myaccount.google.com/apppasswords (name it "Acai Carioca Studio").
3. In Vercel → Project → Settings → Environment Variables, add (Production and Preview):
   - `GMAIL_USER` = the Gmail address
   - `GMAIL_APP_PASSWORD` = the 16-letter app password
4. Redeploy.

- **Notify approver** (Approvals tab) emails every approver one summary of the posts awaiting approval in the selected two weeks.
- When an approver approves or requests changes, the editing team (owner, admins, editors) gets an email automatically.

## 12. Planner features
Run `supabase/add-planner-features.sql` once (already applied to the production project on Nov 25, 2026).

- **Feed:** Grid / Phone (iPhone-style profile preview) / Stories views, a Colors strip, and a **Drafts** tray. Drag drafts onto the grid, or drag a grid post onto the tray to send it back to drafts.
- **Post editor:** up to 10 images per post (carousel), Reel cover, **grid framing** (drag the photo inside the 3:4 frame), caption counter (2,200) and hashtag counter (30), saved **caption templates** and **hashtag groups**, "Save as draft", and **comments** (everyone on the team, including approvers).
- **Calendar:** drag a post to another day to change its date.
- **Link in bio:** editor under "Link in bio"; the public page lives at `/l/<address>` and is only visible after "Publish page". The public sees the name, photo and links — never posts or comments.

## 13. Email marketing planner
Run `supabase/add-email-planner.sql` once (already applied to the production project on Nov 25, 2026).

- **Email** tab: plan each send (subject, preview text, date, audience, series and number, copy, main image, button, Square Marketing link) and log results (sent, opens, clicks, sales) after sending.
- **Series** such as the Topping Series: filter by series and use "Next in series" to start the next number one week later.
- **Brand voice check** flags dashes, hyphen bullets, emojis, "bowl" (açaí is served in cups), "handcrafted in-house", exclamation marks, and subject/preview lengths.
- Emails awaiting approval show up in **Approvals** next to posts, are included in "Approve all" and in the "Notify approver" email, and appear on the **Calendar**.
