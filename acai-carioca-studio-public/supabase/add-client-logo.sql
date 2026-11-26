-- Lets a client's owner/admin change that client's logo from the app.
-- Only the logo column; the existing "managers update workspace" policy
-- already limits updates to owners and admins of that client. RLS stays on.
grant update (logo_url) on public.workspaces to authenticated;
