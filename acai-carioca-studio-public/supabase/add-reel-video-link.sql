-- Link to the Reel video (Drive, Dropbox, Frame.io, YouTube…) so the approver can watch it.
alter table public.posts add column if not exists video_url text;
