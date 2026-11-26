 "use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { uploadImage } from "@/lib/media";
import FeedGrid, { type FeedPost } from "./FeedGrid";
import PostEditor, { type Snippet } from "./PostEditor";
import CalendarBoard from "./CalendarBoard";
import StoriesView from "./StoriesView";
import LinkInBioEditor from "./LinkInBioEditor";
import TaskBoard from "./TaskBoard";
import ReviewMedia from "./ReviewMedia";
import ClientStudio, { type ClientProfile } from "./ClientStudio";
import BrandKit from "./BrandKit";
import EmailPlanner, { type EmailCampaign, seriesLabel } from "./EmailPlanner";
import { CalendarDays, Images, LayoutGrid, ListChecks, LogOut, Plus, Search, Upload, X, Check, Trash2, ClipboardList, BadgeCheck, MessageSquare, ChevronLeft, ChevronRight, Users, UserPlus, Clock, Mail, Link2, MoreHorizontal, Palette, Smartphone, Film, ChevronDown, Play, BookMarked } from "lucide-react";

type Task = {
  id: string; title: string; details: string | null; list_name: string; due_date: string | null;
  priority: "Low" | "Normal" | "High"; status: "To do" | "In progress" | "Done"; assignee: string | null;
  created_at: string; sort_order?: number;
};

type Post = {
  id: string; title: string; image_url: string; publish_date: string | null;
  format: string; location: string; pillar: string; status: string;
  caption: string | null; sort_order: number;
  approval_note?: string | null; reviewed_at?: string | null;
  crop_x?: number; crop_y?: number; extra_images?: string[]; cover_url?: string | null; on_grid?: boolean; video_url?: string | null;
};

const pillars = ["Product","Lifestyle","Promotion","Brand Awareness","Community"];
const statuses = ["Idea","In production","Ready","Awaiting approval","Changes requested","Approved","Scheduled","Published"];
const reviewOnly = ["Approved","Changes requested"];
const editorStatuses = (current:string)=>statuses.filter(s=>!reviewOnly.includes(s)||s===current);
type Client = { id: string; name: string; logo_url: string | null; voice_rules: string[]; locations: string[]; role: string };
const CLIENT_KEY = "atelier.client";
type TeamRow = { user_id: string; email: string; role: string | null; since: string; pending: boolean };
const roleOptions = [
  {value:"editor",label:"Editor",hint:"Creates and edits posts and tasks"},
  {value:"approver",label:"Approver",hint:"Sees everything, approves or requests changes"},
  {value:"viewer",label:"Viewer",hint:"Can only look"},
  {value:"admin",label:"Admin",hint:"Editor + can manage the team"}
];
const toISO = (d:Date)=>d.toISOString().slice(0,10);
const addDays = (iso:string,n:number)=>{const d=new Date(iso+"T12:00:00");d.setDate(d.getDate()+n);return toISO(d);};
const nextMonday = ()=>{const d=new Date();d.setHours(12);const diff=(8-d.getDay())%7||7;d.setDate(d.getDate()+diff);return toISO(d);};
const prettyDate = (iso:string|null)=>iso?new Date(iso+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}):"No date";
const demo: Post[] = [];

export default function Home() {
  const [session,setSession] = useState<any>(null);
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [authMode,setAuthMode] = useState<"login"|"signup">("login");
  const [posts,setPosts] = useState<Post[]>([]);
  const [tasks,setTasks] = useState<Task[]>([]);
  const [taskModal,setTaskModal] = useState(false);
  const [editingTask,setEditingTask] = useState<Task|null>(null);
  const [taskListFilter,setTaskListFilter] = useState("All lists");
  const [taskForm,setTaskForm] = useState({title:"",details:"",list_name:"General",due_date:"",priority:"Normal" as "Low"|"Normal"|"High",assignee:""});
  const [workspaceId,setWorkspaceId] = useState<string|null>(null);
  const [role,setRole] = useState<string>("");
  const [view,setView] = useState<"feed"|"calendar"|"library"|"brand"|"todo"|"approvals"|"team"|"bio"|"email">("feed");
  const [emails,setEmails] = useState<EmailCampaign[]>([]);
  const [clients,setClients] = useState<Client[]>([]);
  const [clientMenu,setClientMenu] = useState(false);
  const [picking,setPicking] = useState(false);
  const [clientProfiles,setClientProfiles] = useState<Record<string,ClientProfile>>({});
  const [studio,setStudio] = useState<{client:Client|null}|null>(null);
  const openClientRef = useRef<string|null>(null);
  const [selected,setSelected] = useState<string[]>([]);
  const [bulkStatus,setBulkStatus] = useState("Published");
  const [feedMode,setFeedMode] = useState<"grid"|"phone"|"stories">("grid");
  const [showColors,setShowColors] = useState(false);
  const [snippets,setSnippets] = useState<Snippet[]>([]);
  const [profile,setProfile] = useState<{title:string;subtitle?:string|null;avatar_url?:string|null;instagram_handle?:string|null;website?:string|null;highlights?:string[]|null}>({title:""});
  const [editorPreset,setEditorPreset] = useState<{format?:string;date?:string}|undefined>(undefined);
  const [moreOpen,setMoreOpen] = useState(false);
  const [noAccess,setNoAccess] = useState(false);
  const [team,setTeam] = useState<TeamRow[]>([]);
  const [grantRole,setGrantRole] = useState<Record<string,string>>({});
  const [invites,setInvites] = useState<{id:string;email:string;role:string;created_at:string}[]>([]);
  const [inviteEmail,setInviteEmail] = useState("");
  const [inviteRole,setInviteRole] = useState("viewer");
  const [reviewStart,setReviewStart] = useState(nextMonday());
  const [changesFor,setChangesFor] = useState<string|null>(null);
  const [browseDates,setBrowseDates] = useState(false);
  const [sessionReviewed,setSessionReviewed] = useState<{id:string;title:string;decision:string}[]>([]);
  const [leaving,setLeaving] = useState<string[]>([]);
  const linkRef = useRef<{client:string|null;view:string|null}|null>(null);
  const [reviewNote,setReviewNote] = useState("");
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [search,setSearch] = useState("");
  const [month,setMonth] = useState(new Date().toISOString().slice(0,7));
  const [modal,setModal] = useState(false);
  const [editing,setEditing] = useState<Post|null>(null);

  useEffect(()=>{
    if(!notice)return;
    const t=setTimeout(()=>setNotice(""),notice.length>90?8000:4500);
    return ()=>clearTimeout(t);
  },[notice]);

  useEffect(()=>{
    if(!supabase){setLoading(false);return;}

    let active = true;

    supabase.auth.getSession().then(({data,error})=>{
      if(!active)return;
      if(error){setNotice(error.message);setLoading(false);return;}
      setSession(data.session);
      if(data.session) loadPosts(data.session.user.id);
      else setLoading(false);
    });

    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{
      if(!active)return;
      setSession(s);
      if(s) loadPosts(s.user.id);
      else {
        setPosts([]);
        setTasks([]);
        setWorkspaceId(null);
        setRole("");
        setNoAccess(false);
        setPicking(false);
        openClientRef.current=null;
        setTeam([]);
        setLoading(false);
      }
    });

    return ()=>{
      active = false;
      subscription.unsubscribe();
    };
  },[]);

  function linkTarget(){
    if(linkRef.current===null){
      try{const q=new URLSearchParams(window.location.search);linkRef.current={client:q.get("client"),view:q.get("view")};
        if(q.get("client")||q.get("view"))window.history.replaceState(null,"",window.location.pathname);}
      catch{linkRef.current={client:null,view:null};}
    }
    return linkRef.current;
  }
  async function loadPosts(userId:string,preferredClient?:string){
    if(!supabase)return;
    setLoading(true);
    setNotice("");

    // Join any client this email was invited to (by an owner/admin) before reading memberships.
    await supabase.rpc("accept_invites");
    const {data:memberships,error:memberError}=await supabase
      .from("workspace_members")
      .select("workspace_id,role,workspaces(id,name,logo_url,voice_rules,locations)")
      .eq("user_id",userId);

    if(memberError){
      setNotice("Could not read your clients: "+memberError.message);
      setPosts([]);
      setTasks([]);
      setWorkspaceId(null);
      setLoading(false);
      return;
    }

    const list:Client[]=(memberships||[]).map((m:any)=>({id:m.workspace_id,role:m.role,name:m.workspaces?.name||"Client",logo_url:m.workspaces?.logo_url||null,voice_rules:m.workspaces?.voice_rules||[],locations:m.workspaces?.locations||[]})).sort((a,b)=>a.name.localeCompare(b.name));
    setClients(list);
    loadClientProfiles(list.map(c=>c.id));
    // With several clients, start on the "choose a client" page (unless one is already open, e.g. after a session refresh).
    const link=linkTarget();
    const linked=link.client&&list.some(c=>c.id===link.client)?link.client:null;
    if(linked)link.client=null;
    const wanted=preferredClient||openClientRef.current||linked;
    if(!wanted&&list.length>1){
      setPicking(true);setWorkspaceId(null);setLoading(false);
      return;
    }
    const chosen=list.find(c=>c.id===wanted)||list[0];
    const membership=chosen?{workspace_id:chosen.id,role:chosen.role}:null;

    if(!membership){
      await supabase.rpc("request_access");
      setNoAccess(true);
      setPosts([]);
      setTasks([]);
      setWorkspaceId(null);
      setLoading(false);
      return;
    }
    try{localStorage.setItem(CLIENT_KEY,membership.workspace_id);}catch{}
    openClientRef.current=membership.workspace_id;
    setPicking(false);

    setNoAccess(false);
    setWorkspaceId(membership.workspace_id);
    setRole(membership.role);
    if(membership.role==="owner"||membership.role==="admin")loadTeam(membership.workspace_id);else setTeam([]);
    if(membership.role==="approver")setView("approvals");
    if(link.view==="approvals"){setView("approvals");setBrowseDates(false);link.view=null;}

    const {data,error}=await supabase
      .from("posts")
      .select("*")
      .eq("workspace_id",membership.workspace_id)
      .order("sort_order",{ascending:true})
      .order("created_at",{ascending:false});

    if(error) setNotice("Could not load content: "+error.message);
    else setPosts((data||[]) as Post[]);
    loadSnippets(membership.workspace_id);
    setProfile({title:chosen.name,avatar_url:chosen.logo_url});
    loadProfile(membership.workspace_id);
    loadEmails(membership.workspace_id);

    const {data:taskData,error:taskError}=await supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id",membership.workspace_id)
      .order("sort_order",{ascending:true})
      .order("created_at",{ascending:false});
    if(taskError) setNotice("Could not load To-do tasks: "+taskError.message+". Run supabase/add-todo.sql in the SQL Editor.");
    else setTasks((taskData||[]) as Task[]);
    setLoading(false);
  }

  async function authenticate(e:React.FormEvent){
    e.preventDefault(); if(!supabase){setNotice("Add your Supabase environment variables to connect the app.");return;}
    setBusy(true);setNotice("");
    const result=authMode==="login"
      ? await supabase.auth.signInWithPassword({email,password})
      : await supabase.auth.signUp({email,password});
    if(result.error)setNotice(result.error.message);
    else if(authMode==="signup")setNotice("Account created. Check your email if confirmation is enabled.");
    setBusy(false);
  }

  async function signInWithGoogle(){
    if(!supabase){setNotice("Add your Supabase environment variables to connect the app.");return;}
    setBusy(true);setNotice("");
    const {error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin}});
    if(error){setNotice(error.message);setBusy(false);}
  }

  function showClientPicker(){
    setClientMenu(false);setMoreOpen(false);
    openClientRef.current=null;
    setPosts([]);setTasks([]);setEmails([]);setTeam([]);setSnippets([]);setSelected([]);
    setWorkspaceId(null);setPicking(true);
  }
  async function switchClient(id:string){
    if(!session||(id===workspaceId&&!picking)){setClientMenu(false);return;}
    setClientMenu(false);setMoreOpen(false);
    setPosts([]);setTasks([]);setEmails([]);setTeam([]);setSnippets([]);setSelected([]);
    setView("feed");setFeedMode("grid");
    await loadPosts(session.user.id,id);
  }
  function createClient(){setClientMenu(false);setMoreOpen(false);setStudio({client:null});}
  async function loadClientProfiles(ids:string[]){
    if(!supabase||ids.length===0)return;
    const {data}=await supabase.from("client_profiles").select("*").in("workspace_id",ids);
    setClientProfiles(Object.fromEntries((data||[]).map((r:any)=>[r.workspace_id,r as ClientProfile])));
  }
  async function studioSaved(id:string,isNew:boolean){
    setStudio(null);
    if(!session)return;
    if(isNew){setNotice("Client created. Add its first post or invite its team.");await switchClient(id);return;}
    setNotice("Client details saved.");
    const {data}=await supabase!.from("workspaces").select("id,name,logo_url").eq("id",id).single();
    if(data)setClients(cur=>cur.map(c=>c.id===id?{...c,name:data.name,logo_url:data.logo_url}:c));
    if(id===workspaceId&&data)setProfile(p=>({...p,title:p.title||data.name,avatar_url:p.avatar_url||data.logo_url}));
    loadClientProfiles(clients.map(c=>c.id));
  }
  async function loadEmails(ws?:string){
    if(!supabase)return;
    const id=ws||workspaceId;if(!id)return;
    const {data,error}=await supabase.from("email_campaigns").select("*").eq("workspace_id",id).order("send_date",{ascending:true,nullsFirst:false});
    if(!error)setEmails((data||[]) as EmailCampaign[]);
  }
  async function loadSnippets(ws?:string){
    if(!supabase)return;
    const id=ws||workspaceId;if(!id)return;
    const {data}=await supabase.from("post_snippets").select("id,kind,name,body").eq("workspace_id",id).order("name");
    setSnippets((data||[]) as Snippet[]);
  }
  async function loadProfile(ws:string){
    if(!supabase)return;
    const {data}=await supabase.from("bio_pages").select("title,subtitle,avatar_url,instagram_handle,website,highlights").eq("workspace_id",ws).maybeSingle();
    if(data)setProfile(data as any);
  }
  function closeEditor(){setModal(false);setEditing(null);setEditorPreset(undefined);}
  async function editorSaved(message:string){
    closeEditor();
    if(session)await loadPosts(session.user.id);
    setNotice(message);
  }
  async function placeDraft(draftId:string,index:number){
    if(!supabase)return;
    const draft=posts.find(p=>p.id===draftId);if(!draft)return;
    if(!draft.image_url){setNotice("Add an image to this draft before putting it on the grid.");openEdit(draft);return;}
    const grid=gridPosts.filter(p=>p.id!==draftId);
    const ordered=[...grid.slice(0,index),{...draft,on_grid:true},...grid.slice(index)];
    const previous=posts;
    const updated=new Map(ordered.map((p,i)=>[p.id,{...p,sort_order:i}]));
    setPosts(posts.map(p=>updated.get(p.id)||p));
    const client=supabase;
    const results=await Promise.all([
      client.from("posts").update({on_grid:true,sort_order:index}).eq("id",draftId).eq("workspace_id",workspaceId),
      ...ordered.filter(p=>p.id!==draftId).map((p,i)=>{const pos=ordered.findIndex(x=>x.id===p.id);return pos!==p.sort_order?client.from("posts").update({sort_order:pos}).eq("id",p.id).eq("workspace_id",workspaceId):null;}).filter(Boolean) as any[]
    ]);
    const failed=results.find((r:any)=>r?.error);
    if(failed){setPosts(previous);setNotice("Could not move the draft: "+failed.error.message);}
    else setNotice(`“${draft.title}” is on the grid.`);
  }
  async function moveToDrafts(postId:string){
    if(!supabase)return;
    const post=posts.find(p=>p.id===postId);if(!post)return;
    const previous=posts;
    setPosts(posts.map(p=>p.id===postId?{...p,on_grid:false}:p));
    const {error}=await supabase.from("posts").update({on_grid:false}).eq("id",postId).eq("workspace_id",workspaceId);
    if(error){setPosts(previous);setNotice(error.message);}else setNotice(`“${post.title}” moved to drafts.`);
  }
  async function movePostDate(postId:string,date:string){
    if(!supabase)return;
    const previous=posts;
    setPosts(posts.map(p=>p.id===postId?{...p,publish_date:date}:p));
    const {error}=await supabase.from("posts").update({publish_date:date}).eq("id",postId).eq("workspace_id",workspaceId);
    if(error){setPosts(previous);setNotice(error.message);}else setNotice("Moved to "+prettyDate(date)+".");
  }

  function openTask(){
    setEditingTask(null);
    setTaskForm({title:"",details:"",list_name:taskListFilter==="All lists"?"General":taskListFilter,due_date:"",priority:"Normal",assignee:""});
    setTaskModal(true);
  }
  function openEditTask(task:Task){
    if(isApprover)return;
    setEditingTask(task);
    setTaskForm({title:task.title,details:task.details||"",list_name:task.list_name,due_date:task.due_date||"",priority:task.priority,assignee:task.assignee||""});
    setTaskModal(true);
  }
  async function saveTask(e:React.FormEvent){
    e.preventDefault();
    if(!supabase||!workspaceId)return;
    setBusy(true);setNotice("");
    const fields={title:taskForm.title.trim(), list_name:taskForm.list_name.trim()||"General", due_date:taskForm.due_date||null, details:taskForm.details.trim()||null,
      priority:taskForm.priority, assignee:taskForm.assignee.trim()||null};
    if(editingTask){
      const {data,error}=await supabase.from("tasks").update(fields).eq("id",editingTask.id).eq("workspace_id",workspaceId).select().single();
      if(error)setNotice(error.message);
      else {setTasks(current=>current.map(t=>t.id===editingTask.id?data as Task:t));setTaskModal(false);setEditingTask(null);setNotice("Task updated.");}
    }else{
      const {data,error}=await supabase.from("tasks").insert({...fields, workspace_id:workspaceId, created_by:session.user.id}).select().single();
      if(error)setNotice(error.message);
      else {setTasks(current=>[data as Task,...current]);setTaskModal(false);setNotice("Task added to your team list.");}
    }
    setBusy(false);
  }
  async function updateTask(task:Task,changes:Partial<Task>){
    if(!supabase||!workspaceId)return;
    const {error}=await supabase.from("tasks").update(changes).eq("id",task.id).eq("workspace_id",workspaceId);
    if(error)setNotice(error.message);
    else setTasks(current=>current.map(t=>t.id===task.id?{...t,...changes}:t));
  }
  async function moveTasks(updates:{id:string;status:Task["status"];sort_order:number}[]){
    if(!supabase||!workspaceId)return;
    const previous=tasks;
    const map=new Map(updates.map(u=>[u.id,u]));
    setTasks(cur=>cur.map(t=>map.has(t.id)?{...t,...map.get(t.id)!}:t));
    const results=await Promise.all(updates.map(u=>supabase!.from("tasks").update({status:u.status,sort_order:u.sort_order}).eq("id",u.id).eq("workspace_id",workspaceId)));
    const failed=results.find(r=>r.error);
    if(failed?.error){setTasks(previous);setNotice("Could not move the task: "+failed.error.message);}
  }
  async function removeTask(task:Task){
    if(!supabase||!workspaceId||!confirm(`Delete task "${task.title}"?`))return;
    const {error}=await supabase.from("tasks").delete().eq("id",task.id).eq("workspace_id",workspaceId);
    if(error)setNotice(error.message);else setTasks(current=>current.filter(t=>t.id!==task.id));
  }

  async function updateStatus(post:Post,status:string){
    if(!supabase)return;
    const {error}=await supabase.from("posts").update({status}).eq("id",post.id).eq("workspace_id",workspaceId);
    if(error)setNotice(error.message);else setPosts(p=>p.map(x=>x.id===post.id?{...x,status}:x));
  }
  async function loadTeam(ws?:string){
    if(!supabase)return;
    const id=ws||workspaceId;if(!id)return;
    const {data,error}=await supabase.rpc("list_team",{target_workspace:id});
    if(error)setNotice("Could not load your team: "+error.message);else setTeam((data||[]) as TeamRow[]);
    const {data:inv}=await supabase.from("workspace_invites").select("id,email,role,created_at").eq("workspace_id",id).order("created_at",{ascending:false});
    setInvites((inv||[]) as any);
  }
  async function sendInvite(e:React.FormEvent){
    e.preventDefault();
    if(!supabase||!workspaceId||!session)return;
    const email=inviteEmail.trim().toLowerCase();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){setNotice("Type a valid email address.");return;}
    if(team.some(t=>!t.pending&&t.email?.toLowerCase()===email)){setNotice(`${email} already has access to this client.`);return;}
    setBusy(true);setNotice("");
    const {error}=await supabase.from("workspace_invites").upsert({workspace_id:workspaceId,email,role:inviteRole,invited_by:session.user.id},{onConflict:"workspace_id,email"});
    if(error)setNotice("Could not save the invite: "+error.message);
    else{
      // Someone who already signed in and is waiting can be let in right away.
      const waiting=team.find(t=>t.pending&&t.email?.toLowerCase()===email);
      if(waiting){await setMemberRole(waiting,inviteRole);await supabase.from("workspace_invites").delete().eq("workspace_id",workspaceId).eq("email",email);}
      else setNotice(`Invite saved. Send ${email} the link ${location.origin} and ask them to sign in with this email. They'll go straight to ${currentClient?.name||"this client"}.`);
      setInviteEmail("");await loadTeam();
    }
    setBusy(false);
  }
  async function cancelInvite(id:string){
    if(!supabase)return;
    const {error}=await supabase.from("workspace_invites").delete().eq("id",id);
    if(error)setNotice("Could not cancel the invite: "+error.message);else{setInvites(cur=>cur.filter(i=>i.id!==id));setNotice("Invite cancelled.");}
  }
  function copyInvite(email:string){
    const text=`You're invited to ${currentClient?.name||"our"} workspace on Content Atelier. Open ${location.origin} and sign in with ${email}.`;
    navigator.clipboard?.writeText(text).then(()=>setNotice("Invite message copied. Paste it in an email or text."));
  }
  async function setMemberRole(person:TeamRow,newRole:string){
    if(!supabase)return;
    setBusy(true);setNotice("");
    const {error}=await supabase.rpc("set_member_role",{target_user:person.user_id,new_role:newRole,target_workspace:workspaceId});
    if(error)setNotice(error.message);
    else{setNotice(person.pending?`${person.email} now has access as ${newRole}.`:`${person.email} is now ${newRole}.`);await loadTeam();}
    setBusy(false);
  }
  async function removeMember(person:TeamRow){
    if(!supabase||!confirm(`Remove ${person.email} from the workspace? They will lose access immediately. Their posts stay in the studio.`))return;
    setBusy(true);setNotice("");
    const {error}=await supabase.rpc("remove_member",{target_user:person.user_id,target_workspace:workspaceId});
    if(error)setNotice(error.message);else{setNotice(`${person.email} was removed.`);await loadTeam();}
    setBusy(false);
  }
  async function dismissRequest(person:TeamRow){
    if(!supabase||!confirm(`Decline the access request from ${person.email}?`))return;
    setBusy(true);setNotice("");
    const {error}=await supabase.rpc("dismiss_request",{target_user:person.user_id});
    if(error)setNotice(error.message);else{setNotice("Request declined.");await loadTeam();}
    setBusy(false);
  }
  async function notify(kind:"submitted"|"reviewed",ids:string[],emailIds:string[]=[]){
    if(!supabase||(ids.length===0&&emailIds.length===0))return {ok:false,error:"Nothing to send."};
    const {data:{session:current}}=await supabase.auth.getSession();
    try{
      const res=await fetch("/api/notify",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${current?.access_token||""}`},body:JSON.stringify({kind,postIds:ids,emailIds,workspaceId,...(browseDates?{periodStart:reviewStart,periodEnd:reviewEnd}:{})})});
      const out=await res.json().catch(()=>({}));
      return res.ok?{ok:true,sent:out.sent as number}:{ok:false,error:(out.error as string)||"Could not send the email."};
    }catch{return {ok:false,error:"Could not reach the email service."};}
  }
  async function notifyApprover(){
    const total=awaiting.length+awaitingEmails.length;
    if(!confirm(`Email the approver about ${total} item${total===1?"":"s"} awaiting approval${periodLabel?` (${periodLabel})`:""}?`))return;
    setBusy(true);setNotice("");
    const r=await notify("submitted",awaiting.map(p=>p.id),awaitingEmails.map(e=>e.id));
    setNotice(r.ok?"The approver was notified by email.":"Email not sent: "+r.error);
    setBusy(false);
  }
  async function review(ids:string[],decision:"Approved"|"Changes requested",note=""){
    if(!supabase||ids.length===0)return;
    setBusy(true);setNotice("");
    const {data,error}=await supabase.rpc("review_posts",{post_ids:ids,decision,note:note||null});
    if(error)setNotice(error.message);
    else{
      const updated=(data||[]) as Post[];
      setPosts(p=>p.map(x=>updated.find(u=>u.id===x.id)||x));
      setSessionReviewed(cur=>[...cur,...updated.map(u=>({id:u.id,title:u.title,decision}))]);
      setChangesFor(null);setReviewNote("");
      let msg=decision==="Approved"?`${updated.length} post${updated.length===1?"":"s"} approved.`:"Changes requested. The team will see your comment.";
      if(updated.length>0){const r=await notify("reviewed",updated.map(u=>u.id));if(r.ok)msg+=" The team was notified by email.";else if(isApprover)msg+=" (Email not sent: "+r.error+")";}
      setNotice(msg);
    }
    setBusy(false);
  }
  async function decide(id:string,run:()=>Promise<void>){
    setLeaving(cur=>[...cur,id]);
    await new Promise(r=>setTimeout(r,260));
    await run();
    setLeaving(cur=>cur.filter(x=>x!==id));
  }
  async function reviewEmails(ids:string[],decision:"Approved"|"Changes requested",note=""){
    if(!supabase||ids.length===0)return [] as EmailCampaign[];
    const {data,error}=await supabase.rpc("review_emails",{email_ids:ids,decision,note:note||null});
    if(error){setNotice(error.message);return [] as EmailCampaign[];}
    const updated=(data||[]) as EmailCampaign[];
    setEmails(list=>list.map(x=>updated.find(u=>u.id===x.id)||x));
    setSessionReviewed(cur=>[...cur,...updated.map(u=>({id:u.id,title:u.subject||u.title,decision}))]);
    return updated;
  }
  async function reviewEmail(id:string,decision:"Approved"|"Changes requested",note=""){
    setBusy(true);setNotice("");
    const updated=await reviewEmails([id],decision,note);
    if(updated.length){
      setChangesFor(null);setReviewNote("");
      let msg=decision==="Approved"?"Email approved.":"Changes requested. The team will see your comment.";
      const r=await notify("reviewed",[],updated.map(u=>u.id));if(r.ok)msg+=" The team was notified by email.";else if(isApprover)msg+=" (Email not sent: "+r.error+")";
      setNotice(msg);
    }
    setBusy(false);
  }
  async function approveEverything(){
    const total=awaiting.length+awaitingEmails.length;
    if(!confirm(`Approve all ${total} item${total===1?"":"s"}${periodLabel?` (${periodLabel})`:""}?`))return;
    setBusy(true);setNotice("");
    let postsDone:Post[]=[];
    if(awaiting.length){
      const {data,error}=await supabase!.rpc("review_posts",{post_ids:awaiting.map(p=>p.id),decision:"Approved",note:null});
      if(error){setNotice(error.message);setBusy(false);return;}
      postsDone=(data||[]) as Post[];setPosts(p=>p.map(x=>postsDone.find(u=>u.id===x.id)||x));
      setSessionReviewed(cur=>[...cur,...postsDone.map(u=>({id:u.id,title:u.title,decision:"Approved"}))]);
    }
    const emailsDone=await reviewEmails(awaitingEmails.map(e=>e.id),"Approved");
    const n=postsDone.length+emailsDone.length;
    let msg=`${n} item${n===1?"":"s"} approved.`;
    if(n){const r=await notify("reviewed",postsDone.map(p=>p.id),emailsDone.map(e=>e.id));if(r.ok)msg+=" The team was notified by email.";else if(isApprover)msg+=" (Email not sent: "+r.error+")";}
    setNotice(msg);setBusy(false);
  }
  async function applyBulkStatus(){
    if(!supabase||!workspaceId||selected.length===0)return;
    const ids=[...selected];
    const previous=posts;
    setBusy(true);setNotice("");
    setPosts(p=>p.map(x=>ids.includes(x.id)?{...x,status:bulkStatus}:x));
    const {error}=await supabase.from("posts").update({status:bulkStatus}).in("id",ids).eq("workspace_id",workspaceId);
    if(error){setPosts(previous);setNotice(error.message);}
    else{setNotice(`${ids.length} post${ids.length===1?"":"s"} set to “${bulkStatus}”.`);setSelected([]);}
    setBusy(false);
  }
  async function removePost(post:Post){
    if(!supabase||!confirm("Delete this content item?"))return;
    const {error}=await supabase.from("posts").delete().eq("id",post.id).eq("workspace_id",workspaceId);
    if(error)setNotice(error.message);else setPosts(p=>p.filter(x=>x.id!==post.id));
  }
  async function saveOrder(ordered:FeedPost[]){
    if(!supabase)return;
    const client=supabase;
    const byId=new Map(posts.map(p=>[p.id,p]));
    const next=ordered.map((p,i)=>({...(byId.get(p.id) as Post),sort_order:i}));
    const previous=posts;
    setPosts(next);
    const changed=next.filter(p=>byId.get(p.id)?.sort_order!==p.sort_order);
    const results=await Promise.all(changed.map(p=>client.from("posts").update({sort_order:p.sort_order}).eq("id",p.id).eq("workspace_id",workspaceId)));
    const failed=results.find(r=>r.error);
    if(failed){setPosts(previous);setNotice("Could not save the new order: "+failed.error!.message);}
    else setNotice("Feed order saved.");
  }
  function openNew(preset?:{format?:string;date?:string}){setEditing(null);setEditorPreset(preset);setModal(true);}
  function openEdit(p:Post){setEditing(p);setEditorPreset(undefined);setModal(true);}

  const isApprover=role==="approver";
  const currentClient=clients.find(c=>c.id===workspaceId)||null;
  const isPlatformOwner=clients.some(c=>c.role==="owner");
  const gridPosts=posts.filter(p=>p.on_grid!==false&&p.format!=="Story").sort((a,b)=>a.sort_order-b.sort_order);
  const drafts=posts.filter(p=>p.on_grid===false&&p.format!=="Story");
  const stories=posts.filter(p=>p.format==="Story");
  const canManage=role==="owner"||role==="admin";
  const pendingPeople=team.filter(t=>t.pending);
  const members=team.filter(t=>!t.pending);
  const canReview=role==="owner"||role==="approver";
  const reviewEnd=addDays(reviewStart,13);
  const inWindow=posts.filter(p=>p.publish_date&&p.publish_date>=reviewStart&&p.publish_date<=reviewEnd).sort((a,b)=>(a.publish_date||"").localeCompare(b.publish_date||""));
  const byDate=(a:string|null|undefined,b:string|null|undefined)=>(a||"9999").localeCompare(b||"9999");
  const awaiting=browseDates?inWindow.filter(p=>p.status==="Awaiting approval"):posts.filter(p=>p.status==="Awaiting approval").sort((a,b)=>byDate(a.publish_date,b.publish_date));
  const plural=(n:number,w:string)=>`${n} ${w}${n===1?"":"s"}`;
  const reviewed=inWindow.filter(p=>p.status!=="Awaiting approval");
  const awaitingEmails=emails.filter(e=>e.status==="Awaiting approval"&&(!browseDates||(e.send_date&&e.send_date>=reviewStart&&e.send_date<=reviewEnd))).sort((a,b)=>byDate(a.send_date,b.send_date));
  const queueDates=[...awaiting.map(p=>p.publish_date),...awaitingEmails.map(e=>e.send_date)].filter(Boolean).sort() as string[];
  const periodLabel=browseDates?`${prettyDate(reviewStart)} – ${prettyDate(reviewEnd)}`:queueDates.length?`${prettyDate(queueDates[0])} – ${prettyDate(queueDates[queueDates.length-1])}`:"";
  const allAwaiting=posts.filter(p=>p.status==="Awaiting approval").length+emails.filter(e=>e.status==="Awaiting approval").length;
  const filtered=useMemo(()=>posts.filter(p=>(p.title+" "+p.pillar+" "+p.location).toLowerCase().includes(search.toLowerCase())),[posts,search]);
  const count=(s:string)=>posts.filter(p=>p.status===s).length;
  const taskLists=["All lists",...Array.from(new Set(tasks.map(t=>t.list_name))).sort()];
  const visibleTasks=tasks.filter(t=>taskListFilter==="All lists"||t.list_name===taskListFilter);
  const openTasks=visibleTasks.filter(t=>t.status!=="Done");
  const doneTasks=visibleTasks.filter(t=>t.status==="Done");

  if(!supabase)return <main className="setup"><div className="setupCard"><p className="eyebrow">Content Atelier</p><h1>Welcome to your<br/><i>creative studio.</i></h1><p className="muted">The app is ready. Connect your Supabase project to activate team login, shared storage and the live content calendar.</p><div className="setupSteps"><b>1. Create a Supabase project</b><span>2. Run the included database.sql</span><span>3. Create the storage bucket: creative-assets</span><span>4. Add the keys to .env.local</span><span>5. Deploy to Vercel</span></div><p className="hint">See SETUP.md in the project folder for the full setup guide.</p></div></main>;

  if(!session)return <main className="loginShell"><div className="loginCard"><div className="loginBrand"><img src="/brand/atelier-mark.png" alt=""/><span className="wordmark"><b>Content <i>Atelier</i></b></span></div><h1>Make room for<br/><i>good ideas.</i></h1><p className="muted">Your brand's visual workspace.</p><form onSubmit={authenticate} className="loginForm"><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@yourbrand.com"/></label><label>Password<input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label><button className="primary" disabled={busy}>{busy?"Please wait…":authMode==="login"?"Sign in":"Create account"}</button></form><div className="orDivider"><span>or</span></div><button type="button" className="googleButton" onClick={signInWithGoogle} disabled={busy}>Continue with Google</button><button className="textButton" onClick={()=>setAuthMode(authMode==="login"?"signup":"login")}>{authMode==="login"?"New to the studio? Create an account":"Already have an account? Sign in"}</button>{notice&&<p className="notice">{notice}</p>}<p className="muted legalLink"><a href="/privacy">Privacy Policy</a></p></div></main>;

  if(noAccess)return <main className="loginShell"><div className="loginCard"><div className="loginBrand"><img src="/brand/atelier-mark.png" alt=""/><span className="wordmark"><b>Content <i>Atelier</i></b></span></div><h1>Almost<br/><i>there.</i></h1><p className="muted">You're signed in as <b>{session.user.email}</b>. Your access request was sent to the workspace owner. Once it's approved, refresh this page to open the studio.</p><div className="modalActions waitingActions"><button className="secondary" onClick={()=>supabase?.auth.signOut()}>Sign out</button><button className="primary" onClick={()=>loadPosts(session.user.id)}>Check again</button></div></div></main>;

  const weekEnd=new Date();weekEnd.setDate(weekEnd.getDate()+7);
  const localIso=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const todayIso=localIso(new Date()),weekIso=localIso(weekEnd);
  const upcoming=posts.filter(p=>p.publish_date&&p.publish_date>=todayIso&&p.status!=="Published").map(p=>p.publish_date as string).sort();
  const nextPostLabel=(()=>{if(!upcoming.length)return "—";const d=Math.round((new Date(upcoming[0]+"T12:00:00").getTime()-new Date(todayIso+"T12:00:00").getTime())/86400000);return d===0?"Today":d===1?"Tomorrow":`${d} days`;})();
  const weekCount=posts.filter(p=>p.publish_date&&p.publish_date>=todayIso&&p.publish_date<=weekIso).length;
  const awaitingAll=posts.filter(p=>p.status==="Awaiting approval").length;
  const pageContext=view==="feed"?(feedMode==="stories"?(n=>`${n} ${n===1?"story":"stories"}`)(posts.filter(p=>p.format==="Story").length):`${gridPosts.length} on the grid · ${plural(drafts.length,"draft")}`)
    :view==="calendar"?`${plural(posts.filter(p=>p.publish_date&&p.publish_date>=todayIso&&p.publish_date<=weekIso).length,"post")} in the next 7 days`
    :view==="library"?plural(posts.length,"piece")+" of content"
    :view==="approvals"?(awaiting.length+awaitingEmails.length?`${awaiting.length+awaitingEmails.length} waiting for review`:"Nothing waiting for review")
    :view==="todo"?`${plural(tasks.filter(t=>t.status!=="Done").length,"open task")}`
    :view==="email"?`${plural(emails.filter(e=>e.status!=="Sent").length,"email")} planned`
    :view==="team"?plural(members.length,"member"):view==="brand"?"Branding files and essentials":"";
  const studioView=studio&&session?<ClientStudio client={studio.client} profile={studio.client?clientProfiles[studio.client.id]||null:null} userId={session.user.id} onClose={()=>setStudio(null)} onSaved={studioSaved}/>:null;
  if(picking){
    let last:string|null=null;try{last=localStorage.getItem(CLIENT_KEY);}catch{}
    const hour=new Date().getHours();
    const greeting=hour<12?"Good morning":hour<18?"Good afternoon":"Good evening";
    const roleName=(r:string)=>r==="owner"?"Owner":r==="approver"?"Approver":r==="admin"?"Admin":r==="viewer"?"Viewer":"Editor";
    return <main className="pickerShell">
      <header className="pickerTop"><div className="brand"><img className="brandIcon" src="/brand/atelier-mark.png" alt=""/><div className="wordmark"><b>Content <i>Atelier</i></b><small>Content planning</small></div></div><button className="textButton" onClick={()=>supabase?.auth.signOut()}><LogOut size={15}/> Sign out</button></header>
      <section className="pickerBody">
        <p className="pickerHello">{greeting}.</p>
        <h1>Today in <i>the atelier.</i></h1>
        <p className="muted pickerLead">Choose a client to open their feed, calendar and approvals.</p>
        <div className="pickerGrid">
          {clients.map((c,idx)=>{const prof=clientProfiles[c.id];const lead=prof?.brand_colors?.[0]||"#651321";const manage=c.role==="owner"||c.role==="admin";return <article key={c.id} className="swatchCard" style={{animationDelay:`${idx*60}ms`}}>
            <button className="swatchOpen" onClick={()=>switchClient(c.id)} disabled={loading} aria-label={`Open ${c.name}`}>
              <span className="swatchBand" style={{background:lead}}/>
              <span className="swatchLogo">{c.logo_url?<img src={c.logo_url} alt=""/>:<b>{c.name[0]}</b>}</span>
              <span className="swatchName">{c.name}</span>
              {(prof?.tagline||c.id===last)&&<span className="swatchTag">{prof?.tagline||"Where you left off"}</span>}
              <span className="swatchFoot"><span className="swatchDots">{(prof?.brand_colors||[]).slice(0,6).map((col,k)=><i key={k} style={{background:col}}/>)}</span><small>{roleName(c.role)}</small></span>
            </button>
            {manage&&<button className="swatchEdit" onClick={()=>setStudio({client:c})}>Client details</button>}
          </article>;})}
          {isPlatformOwner&&<button className="swatchCard swatchNew" onClick={createClient}><span className="swatchNewMark"><Plus size={22}/></span><span className="swatchName">New client</span><span className="swatchTag">Logo, colours, socials and logins</span></button>}
        </div>
      </section>
      {studioView}
      {notice&&<div className="noticeBar" role="status" onClick={()=>setNotice("")}>{notice}<X size={14}/></div>}
    </main>;
  }

  return <main className="appShell">
    <aside className="sidebar"><div className="brand"><img className="brandIcon" src="/brand/atelier-mark.png" alt=""/><div className="wordmark"><b>Content <i>Atelier</i></b><small>Content planning</small></div></div>
      <div className="clientSwitch">
        <button className="clientButton" onClick={()=>setClientMenu(v=>!v)} aria-expanded={clientMenu} aria-label="Switch client"><span className="clientLogo">{currentClient?.logo_url?<img src={currentClient.logo_url} alt=""/>:<b>{currentClient?.name?.[0]||"?"}</b>}</span><span className="clientName"><small>Client</small>{currentClient?.name||"Choose a client"}</span><ChevronDown size={15}/></button>
        {clientMenu&&<div className="clientMenu" role="menu">
          {clients.map(c=><button key={c.id} role="menuitem" className={"clientItem"+(c.id===workspaceId?" on":"")} onClick={()=>switchClient(c.id)}><span className="clientLogo">{c.logo_url?<img src={c.logo_url} alt=""/>:<b>{c.name[0]}</b>}</span><span>{c.name}<small>{c.role}</small></span>{c.id===workspaceId&&<Check size={14}/>}</button>)}
          {currentClient&&(currentClient.role==="owner"||currentClient.role==="admin")&&<button className="clientItem newClient" onClick={()=>{setClientMenu(false);setStudio({client:currentClient});}}><span className="clientLogo"><Palette size={15}/></span><span>Client details</span></button>}
          {clients.length>1&&<button className="clientItem newClient" onClick={showClientPicker}><span className="clientLogo"><LayoutGrid size={15}/></span><span>All clients</span></button>}
          {isPlatformOwner&&<button className="clientItem newClient" onClick={()=>{setClientMenu(false);createClient();}}><span className="clientLogo"><Plus size={15}/></span><span>New client</span></button>}
        </div>}
      </div>
      <p className="sideLabel">Workspace</p>
      <button className={view==="feed"?"nav active":"nav"} onClick={()=>setView("feed")}><LayoutGrid size={17}/> <span className="navFull">Feed planner</span><span className="navShort">Feed</span></button>
      <button className={view==="calendar"?"nav active":"nav"} onClick={()=>setView("calendar")}><CalendarDays size={17}/> Calendar</button>
      <button className={(view==="library"?"nav active":"nav")+" tabMore"} onClick={()=>setView("library")}><Images size={17}/> <span className="navFull">Creative library</span><span className="navShort">Library</span></button>
      <button className={view==="approvals"?"nav active":"nav"} onClick={()=>setView("approvals")}><BadgeCheck size={17}/> Approvals{allAwaiting>0&&<span className="navBadge">{allAwaiting}</span>}</button>
      {canManage&&<button className={(view==="team"?"nav active":"nav")+" tabMore"} onClick={()=>{setView("team");loadTeam();}}><Users size={17}/> Team{pendingPeople.length>0&&<span className="navBadge">{pendingPeople.length}</span>}</button>}
      {!isApprover&&<button className={view==="todo"?"nav active":"nav"} onClick={()=>setView("todo")}><ListChecks size={17}/> To-do</button>}
      <button className={(view==="email"?"nav active":"nav")+" tabMore"} onClick={()=>setView("email")}><Mail size={17}/> Email</button>
      {!isApprover&&<button className={(view==="bio"?"nav active":"nav")+" tabMore"} onClick={()=>setView("bio")}><Link2 size={17}/> Link in bio</button>}
      <button className={(view==="brand"?"nav active":"nav")+" tabMore"} onClick={()=>setView("brand")}><BookMarked size={17}/> Brand kit</button>
      <button className={"nav moreTab"+(["library","brand","team","bio","email"].includes(view)?" active":"")} onClick={()=>setMoreOpen(true)}><MoreHorizontal size={17}/> More{canManage&&pendingPeople.length>0&&<span className="navBadge">{pendingPeople.length}</span>}</button>
      <div className="sidebarBottom"><p className="eyebrow">Your team</p><div className="userLine"><span className="avatar">{session.user.email?.[0]?.toUpperCase()}</span><span>{session.user.email}</span></div><button className="nav signOutNav" onClick={()=>supabase?.auth.signOut()} ><LogOut size={16}/> Sign out</button></div>
    </aside>
    <section className="mainArea">
      <header className="topbar"><div className="topbarText"><span className="clientLogo">{currentClient?.logo_url?<img src={currentClient.logo_url} alt=""/>:<b>{currentClient?.name?.[0]||"?"}</b>}</span><span className="topTitle">{currentClient?.name||"Your clients"}</span></div><div className="topActions">{!isApprover&&view!=="team"&&view!=="bio"&&view!=="email"&&view!=="brand"&&<button className="primary compact" onClick={()=>view==="todo"?openTask():openNew(view==="feed"&&feedMode==="stories"?{format:"Story"}:undefined)}><Plus size={16}/> {view==="todo"?"Add task":"Add content"}</button>}<button className="iconButton phoneOnly roundIcon" aria-label="Sign out" onClick={()=>supabase?.auth.signOut()}><LogOut size={16}/></button></div></header>
      <div className="content viewFade" key={view}>
        <div className="welcome"><div><p className="pageContext"><span className="clientLogo">{currentClient?.logo_url?<img src={currentClient.logo_url} alt=""/>:<b>{currentClient?.name?.[0]||"?"}</b>}</span><b>{currentClient?.name}</b>{pageContext&&<span>{pageContext}</span>}</p><h1>{view==="feed"?"Your visual grid":view==="calendar"?"The calendar":view==="library"?"Creative archive":view==="approvals"?"Content approvals":view==="team"?"Your team":view==="bio"?"Link in bio":view==="email"?"Email marketing":view==="brand"?"Brand kit":"Your team checklist"}</h1><p className="muted">{view==="feed"?"Compose your next chapter, one post at a time.":view==="calendar"?"A clear view of what's coming up.":view==="library"?"All your creative assets, in one place.":view==="approvals"?"Everything waiting for approval, in one place.":view==="team"?"Decide who can see and work on your calendar.":view==="bio"?"One page for your Instagram bio: menu, locations, ordering.":view==="email"?"Plan every send, keep the voice on brand, and track what works.":view==="brand"?"Everything the team needs to work with this client, in one place.":"Small steps, beautifully organized."}</p></div><div className="welcomeSide"><span className="deskOnly">{!isApprover&&view!=="team"&&view!=="bio"&&view!=="email"&&view!=="brand"&&<button className="primary compact" onClick={()=>view==="todo"?openTask():openNew(view==="feed"&&feedMode==="stories"?{format:"Story"}:undefined)}><Plus size={16}/> {view==="todo"?"Add task":"Add content"}</button>}</span>{view==="bio"||view==="brand"?null:view==="email"?<div className="stats"><div><b>{emails.filter(e=>e.status!=="Sent").length}</b><small>planned</small></div><div><b>{emails.filter(e=>e.status==="Awaiting approval").length}</b><small>awaiting</small></div><div><b>{emails.filter(e=>e.status==="Sent").length}</b><small>sent</small></div></div>:view==="team"?<div className="stats"><div><b>{members.length}</b><small>MEMBERS</small></div><div><b>{pendingPeople.length}</b><small>REQUESTS</small></div></div>:view==="approvals"?<div className="stats"><div><b>{awaiting.length+awaitingEmails.length}</b><small>waiting</small></div><div><b>{sessionReviewed.filter(r=>r.decision==="Approved").length}</b><small>approved now</small></div><div><b>{sessionReviewed.filter(r=>r.decision!=="Approved").length}</b><small>changes asked</small></div></div>:view==="todo"?<div className="stats"><div><b>{tasks.length}</b><small>tasks</small></div><div><b>{tasks.filter(t=>t.status!=="Done").length}</b><small>open</small></div><div><b>{tasks.filter(t=>t.status==="Done").length}</b><small>completed</small></div></div>
          :<div className="stats"><div><b>{nextPostLabel}</b><small>next post</small></div><div><b>{weekCount}</b><small>in the next 7 days</small></div><div><b>{awaitingAll}</b><small>awaiting approval</small></div></div>}</div></div>
        {loading?<p className="muted">Loading your workspace…</p>:<>
          {view==="feed"&&<><div className="sectionHead feedHead"><div><h2>{feedMode==="stories"?"Stories":"Feed preview"}</h2></div>
            <div className="feedControls">
              <div className="segmented" role="tablist" aria-label="Feed view">
                <button role="tab" aria-selected={feedMode==="grid"} className={feedMode==="grid"?"on":""} onClick={()=>setFeedMode("grid")}><LayoutGrid size={14}/> Grid</button>
                <button role="tab" aria-selected={feedMode==="phone"} className={feedMode==="phone"?"on":""} onClick={()=>setFeedMode("phone")}><Smartphone size={14}/> Phone</button>
                <button role="tab" aria-selected={feedMode==="stories"} className={feedMode==="stories"?"on":""} onClick={()=>setFeedMode("stories")}><Film size={14}/> Stories</button>
              </div>
              {feedMode!=="stories"&&<button className={"chipButton"+(showColors?" on":"")} aria-pressed={showColors} onClick={()=>setShowColors(v=>!v)}><Palette size={14}/> Colors</button>}
            </div></div>
            {feedMode==="stories"?<StoriesView stories={stories as any} canEdit={!isApprover} onOpen={p=>openEdit(p as Post)} onAdd={date=>openNew({format:"Story",date})}/>
            :<>{gridPosts.length===0&&drafts.length===0?<div className="empty"><Images size={28}/><h3>A blank canvas.</h3><p>Upload your first creative to begin building the grid.</p>{!isApprover&&<button className="primary" onClick={()=>openNew()}><Plus size={16}/> Add your first post</button>}</div>
            :<><p className="muted feedHint">{isApprover?"Tap a post to preview it.":"Drag to rearrange, or drag a draft onto the grid."}</p>
            <FeedGrid fallbackLogo={currentClient?.logo_url||null} posts={gridPosts} drafts={isApprover?[]:drafts} disabled={isApprover} mode={feedMode==="phone"?"phone":"grid"} profile={profile} showColors={showColors} onOpen={p=>openEdit(p as Post)} onReorder={saveOrder} onPlaceDraft={placeDraft} onMoveToDrafts={moveToDrafts}/></>}</>}</>}
          {view==="calendar"&&<><div className="sectionHead"><div><h2>Monthly overview</h2></div><input className="monthInput" type="month" value={month} onChange={e=>setMonth(e.target.value)}/></div>
            {!isApprover&&<p className="muted feedHint">Drag a post to another day to change its date.</p>}
            <CalendarBoard month={month} emails={emails} onEmailClick={()=>setView("email")} posts={posts as any} tasks={isApprover?[]:tasks} canEdit={!isApprover} onOpen={p=>openEdit(p as Post)} onMove={movePostDate} onTaskClick={()=>setView("todo")}/></>}
          {view==="todo"&&<>
            <div className="sectionHead"><div><h2>Things to get done</h2></div><button className="primary" onClick={openTask}><Plus size={16}/> Add task</button></div>
            <div className="todoToolbar"><div className="todoFilters">{taskLists.map(list=><button key={list} className={taskListFilter===list?"filterChip selected":"filterChip"} onClick={()=>setTaskListFilter(list)}>{list}</button>)}</div><span className="muted">Shared with your workspace team</span></div>
            {visibleTasks.length===0?<div className="empty"><ClipboardList size={28}/><h3>{tasks.length===0?"A fresh start.":"Nothing on this list yet."}</h3><p>{tasks.length===0?"Create your first checklist item and keep the team moving.":"Add a task to this checklist when you're ready."}</p><button className="primary" onClick={openTask}><Plus size={16}/> Create a task</button></div>:<TaskBoard tasks={visibleTasks} onChange={moveTasks} renderCard={task=>task.status==="Done"?<article className="taskCard completedTask" key={task.id}><button className="taskCheck checked" aria-label="Reopen task" onClick={()=>updateTask(task,{status:"To do"})}><Check size={15}/></button><div className="taskBody" role="button" tabIndex={0} title="Edit task" onClick={()=>openEditTask(task)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openEditTask(task);}}}><b>{task.title}</b><div className="taskMeta"><span>{task.list_name}</span>{task.assignee&&<span>{task.assignee}</span>}</div></div><button className="taskDelete" aria-label="Delete task" onClick={()=>removeTask(task)}><Trash2 size={15}/></button></article>:<article className="taskCard" key={task.id}><button className="taskCheck" aria-label="Mark complete" onClick={()=>updateTask(task,{status:"Done"})}><Check size={15}/></button><div className="taskBody" role="button" tabIndex={0} title="Edit task" onClick={()=>openEditTask(task)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openEditTask(task);}}}><b>{task.title}</b>{task.details&&<p>{task.details}</p>}<div className="taskMeta"><span>{task.list_name}</span>{task.due_date&&<span>Due {new Date(task.due_date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}{task.assignee&&<span>{task.assignee}</span>}<span className={"priority "+task.priority.toLowerCase()}>{task.priority}</span></div></div><select aria-label="Task status" value={task.status} onChange={e=>updateTask(task,{status:e.target.value as Task["status"]})}><option>To do</option><option>In progress</option><option>Done</option></select><button className="taskDelete" aria-label="Delete task" onClick={()=>removeTask(task)}><Trash2 size={15}/></button></article>}/>}
          </>}
          {view==="approvals"&&<>
            {browseDates
              ?<div className="sectionHead"><div><button className="textButton backLink" onClick={()=>setBrowseDates(false)}><ChevronLeft size={15}/> Back to everything waiting</button><h2>{prettyDate(reviewStart)} – {prettyDate(reviewEnd)}</h2></div><div className="reviewNav"><button className="secondary" onClick={()=>setReviewStart(addDays(reviewStart,-14))}><ChevronLeft size={15}/> Previous</button><input className="monthInput" type="date" value={reviewStart} onChange={e=>e.target.value&&setReviewStart(e.target.value)} aria-label="First day of the review period"/><button className="secondary" onClick={()=>setReviewStart(addDays(reviewStart,14))}>Next <ChevronRight size={15}/></button></div></div>
              :<div className="queueHead">
                <div>
                  <h2>{awaiting.length+awaitingEmails.length===0?<>All caught <i>up.</i></>:<>{plural(awaiting.length+awaitingEmails.length,"item")} <i>{canReview?"waiting for you.":"waiting for approval."}</i></>}</h2>
                  <p className="muted">{awaiting.length+awaitingEmails.length===0?(sessionReviewed.length?"Thank you. The team has been told.":canReview?"New content will appear here as soon as the team sends it.":"Set a post's status to “Awaiting approval” to send it here."):canReview?"Look at each post, then approve it or ask for a change. Nearest dates first.":"Everything the approver still needs to see, nearest dates first."}</p>
                </div>
                <button className="secondary" onClick={()=>setBrowseDates(true)}><CalendarDays size={15}/> Browse by dates</button>
              </div>}
            {!browseDates&&sessionReviewed.length>0&&<div className="queueProgress" aria-label={`${sessionReviewed.length} of ${sessionReviewed.length+awaiting.length+awaitingEmails.length} reviewed`}><div className="queueBar"><span style={{width:`${100*sessionReviewed.length/(sessionReviewed.length+awaiting.length+awaitingEmails.length)}%`}}/></div><small>{sessionReviewed.length} of {sessionReviewed.length+awaiting.length+awaitingEmails.length} reviewed</small></div>}
            {awaiting.length===0&&awaitingEmails.length===0?(browseDates
              ?<div className="empty"><BadgeCheck size={28}/><h3>Nothing waiting in these two weeks.</h3><p>{allAwaiting>0?`${allAwaiting} item${allAwaiting===1?" is":"s are"} waiting on other dates.`:"Nothing is waiting for approval."}</p>{allAwaiting>0&&<button className="primary" onClick={()=>setBrowseDates(false)}>See everything waiting</button>}</div>
              :<div className="caughtUp"><BadgeCheck size={34}/>{sessionReviewed.length>0&&<ul className="caughtList">{sessionReviewed.map(r=><li key={r.id}><span>{r.title}</span><span className={"statusPill"+(r.decision==="Approved"?" ok":" warn")}>{r.decision}</span></li>)}</ul>}<button className="secondary" onClick={()=>setView("calendar")}><CalendarDays size={15}/> See the calendar</button></div>)
            :<>
              {!isApprover&&<div className="approveAllBar notifyBar"><span>Ready for the approver to look?</span><button className="secondary" disabled={busy} onClick={notifyApprover}><Mail size={15}/> Notify approver</button></div>}
              {canReview&&awaiting.length+awaitingEmails.length>1&&<div className="approveAllBar"><span>Happy with all of them?</span><button className="primary" disabled={busy} onClick={approveEverything}><Check size={15}/> Approve all {awaiting.length+awaitingEmails.length}</button></div>}
              <div className="reviewList">{awaiting.map(p=><article className={"reviewCard"+(leaving.includes(p.id)?" leaving":"")} key={p.id}>
                <ReviewMedia title={p.title} format={p.format} image={p.image_url} extra={p.extra_images} cover={p.cover_url} video={p.video_url} onOpen={()=>openEdit(p)}/>
                <div className="reviewBody">
                  <p className="reviewWhen">{p.publish_date?prettyDate(p.publish_date):"No date yet"} · {p.format}{p.location&&(currentClient?.locations?.length??0)>0?` · ${p.location}`:""}</p>
                  <h3>{p.title}</h3>
                  <span className="muted">{p.pillar}</span>
                  {p.format==="Reel"&&(p.video_url&&/^https?:\/\//i.test(p.video_url)?<a className="videoLink" href={p.video_url} target="_blank" rel="noopener noreferrer"><Play size={16}/> Watch the video<small>Opens in a new tab</small></a>:<p className="muted videoMissing">No video link yet.</p>)}
                  {p.caption?<p className="reviewCaption">{p.caption}</p>:<p className="reviewCaption muted">No caption yet.</p>}
                  {p.approval_note&&<p className="previousNote"><MessageSquare size={12}/> Previous feedback: {p.approval_note}</p>}
                  {canReview&&(changesFor===p.id?<div className="changesForm"><textarea rows={3} autoFocus value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="What should change? (caption, image, date…)"/><div className="modalActions"><button className="secondary" onClick={()=>{setChangesFor(null);setReviewNote("");}}>Cancel</button><button className="primary" disabled={busy||!reviewNote.trim()} onClick={()=>{const note=reviewNote;decide(p.id,()=>review([p.id],"Changes requested",note));}}>Send feedback</button></div></div>
                  :<div className="reviewActions"><button className="primary" disabled={busy} onClick={()=>decide(p.id,()=>review([p.id],"Approved"))}><Check size={15}/> Approve</button><button className="secondary" disabled={busy} onClick={()=>{setChangesFor(p.id);setReviewNote("");}}><MessageSquare size={15}/> Request changes</button></div>)}
                </div>
              </article>)}</div>
              {awaitingEmails.length>0&&<><h4 className="groupTitle reviewEmailsTitle">Emails</h4><div className="reviewList">{awaitingEmails.map(e=><article className={"reviewCard emailReview"+(leaving.includes(e.id)?" leaving":"")} key={e.id}>
                <div className="emailReviewArt">{e.hero_image_url?<img src={e.hero_image_url} alt="" onClick={()=>setView("email")}/>:<Mail size={26}/>}</div>
                <div className="reviewBody">
                  <p className="eyebrow">{prettyDate(e.send_date)} · Email · {e.audience}</p>
                  {seriesLabel(e)&&<span className="seriesBadge">{seriesLabel(e)}</span>}
                  <h3>{e.subject||e.title}</h3>
                  {e.preview_text&&<span className="muted">{e.preview_text}</span>}
                  {e.body?<p className="reviewCaption emailBodyPreview">{e.body}</p>:<p className="reviewCaption muted">No copy yet.</p>}
                  {e.cta_label&&<p className="muted">Button: <b>{e.cta_label}</b></p>}
                  {e.approval_note&&<p className="previousNote"><MessageSquare size={12}/> Previous feedback: {e.approval_note}</p>}
                  {canReview&&(changesFor===e.id?<div className="changesForm"><textarea rows={3} autoFocus value={reviewNote} onChange={ev=>setReviewNote(ev.target.value)} placeholder="What should change? (subject, copy, date…)"/><div className="modalActions"><button className="secondary" onClick={()=>{setChangesFor(null);setReviewNote("");}}>Cancel</button><button className="primary" disabled={busy||!reviewNote.trim()} onClick={()=>{const note=reviewNote;decide(e.id,()=>reviewEmail(e.id,"Changes requested",note));}}>Send feedback</button></div></div>
                  :<div className="reviewActions"><button className="primary" disabled={busy} onClick={()=>decide(e.id,()=>reviewEmail(e.id,"Approved"))}><Check size={15}/> Approve</button><button className="secondary" disabled={busy} onClick={()=>{setChangesFor(e.id);setReviewNote("");}}><MessageSquare size={15}/> Request changes</button></div>)}
                </div>
              </article>)}</div></>}
            </>}
            {browseDates&&reviewed.length>0&&<><div className="sectionHead reviewedHead"><div><p className="eyebrow">Also in these two weeks</p><h2>Other content</h2></div></div><div className="libraryList">{reviewed.map(p=><div className="libraryItem" key={p.id}><img src={p.image_url}/><div className="libraryInfo"><b>{p.title}</b><small>{prettyDate(p.publish_date)} · {p.format}{p.approval_note?" · “"+p.approval_note+"”":""}</small></div><span className={"statusPill"+(p.status==="Approved"?" ok":p.status==="Changes requested"?" warn":"")}>{p.status}</span><button className="iconButton" onClick={()=>openEdit(p)}>{isApprover?"View":"Edit"}</button></div>)}</div></>}
          </>}
          {view==="team"&&canManage&&<>
            <div className="sectionHead"><div><p className="eyebrow">Bring someone in</p><h2>Invite to {currentClient?.name||"this client"}</h2></div><span className="muted">They join this client as soon as they sign in with this email</span></div>
            <form className="inviteForm" onSubmit={sendInvite}><input type="email" required value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="name@email.com" aria-label="Email to invite"/><select aria-label="Role for the invite" value={inviteRole} onChange={e=>setInviteRole(e.target.value)}>{roleOptions.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select><button className="primary" disabled={busy}><UserPlus size={15}/> Invite</button></form>
            {invites.length>0&&<div className="teamList inviteList">{invites.map(i=><div className="teamRow inviteRow" key={i.id}><span className="avatar">{i.email[0]?.toUpperCase()}</span><div className="teamInfo"><b>{i.email}</b><small><Mail size={11}/> Invited {new Date(i.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})} · hasn't signed in yet</small></div><span className="statusPill">{roleOptions.find(r=>r.value===i.role)?.label||i.role}</span><button className="iconButton" onClick={()=>copyInvite(i.email)}>Copy message</button><button className="iconButton" onClick={()=>cancelInvite(i.id)}>Cancel</button></div>)}</div>}
            <div className="sectionHead reviewedHead"><div><p className="eyebrow">Waiting for you</p><h2>Access requests</h2></div><span className="muted">People who signed in without an invite</span></div>
            {pendingPeople.length===0?<div className="empty teamEmpty"><UserPlus size={26}/><h3>No pending requests.</h3><p>Invite people above so they land in the right client. Anyone who signs in without an invite shows up here.</p></div>:
            <div className="teamList">{pendingPeople.map(p=><div className="teamRow pendingRow" key={p.user_id}><span className="avatar">{p.email?.[0]?.toUpperCase()}</span><div className="teamInfo"><b>{p.email}</b><small><Clock size={11}/> Requested {new Date(p.since).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</small></div><select aria-label="Role" value={grantRole[p.user_id]||"editor"} onChange={e=>setGrantRole({...grantRole,[p.user_id]:e.target.value})}>{roleOptions.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select><button className="primary" disabled={busy} onClick={()=>setMemberRole(p,grantRole[p.user_id]||"editor")}><Check size={15}/> Give access</button><button className="iconButton" disabled={busy} onClick={()=>dismissRequest(p)}>Decline</button></div>)}</div>}
            <div className="sectionHead reviewedHead"><div><p className="eyebrow">With access</p><h2>Members</h2></div></div>
            <div className="teamList">{members.map(m=><div className="teamRow" key={m.user_id}><span className="avatar">{m.email?.[0]?.toUpperCase()}</span><div className="teamInfo"><b>{m.email}{m.user_id===session.user.id?" (you)":""}</b><small>Member since {new Date(m.since).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</small></div>{m.role==="owner"||m.user_id===session.user.id?<span className="statusPill">{m.role}</span>:<><select aria-label="Role" value={m.role||""} disabled={busy} onChange={e=>setMemberRole(m,e.target.value)}>{roleOptions.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select><button className="iconButton" disabled={busy} onClick={()=>removeMember(m)}>Remove</button></>}</div>)}</div>
            <div className="roleGuide">{roleOptions.map(r=><div key={r.value}><b>{r.label}</b><span>{r.hint}</span></div>)}</div>
          </>}
          {view==="email"&&workspaceId&&<EmailPlanner clientName={currentClient?.name||"Your brand"} clientLogo={currentClient?.logo_url||null} voiceRules={currentClient?.voice_rules||[]} emails={emails} workspaceId={workspaceId} userId={session.user.id} canEdit={!isApprover} canDelete={canManage} onChanged={msg=>{loadEmails();setNotice(msg);}} onOpenApprovals={()=>setView("approvals")}/>}
          {view==="bio"&&!isApprover&&workspaceId&&<LinkInBioEditor clientName={currentClient?.name||""} clientLogo={currentClient?.logo_url||null} workspaceId={workspaceId} userId={session.user.id} onNotice={setNotice} onProfileChange={()=>loadProfile(workspaceId)}/>}
          {view==="brand"&&workspaceId&&<BrandKit workspaceId={workspaceId} userId={session.user.id} clientName={currentClient?.name||"This client"} profile={clientProfiles[workspaceId]||null} canAdd={role==="owner"||role==="admin"||role==="editor"} canManage={canManage} onEditDetails={currentClient?()=>setStudio({client:currentClient}):undefined} onNotice={setNotice}/>}
          {view==="library"&&<><div className="sectionHead"><div><h2>All your content</h2></div><div className="search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search content"/></div></div>
            {!isApprover&&filtered.length>0&&<div className={"bulkBar"+(selected.length?" active":"")}>
              <label className="checkLabel"><input type="checkbox" checked={filtered.length>0&&filtered.every(p=>selected.includes(p.id))} ref={el=>{if(el)el.indeterminate=selected.length>0&&!filtered.every(p=>selected.includes(p.id));}} onChange={e=>setSelected(e.target.checked?filtered.map(p=>p.id):[])}/> {selected.length?`${selected.length} selected`:"Select all"}</label>
              {selected.length>0&&<div className="bulkActions"><span className="muted">Set status to</span><select value={bulkStatus} onChange={e=>setBulkStatus(e.target.value)}>{editorStatuses("").map(st=><option key={st}>{st}</option>)}</select><button className="primary" disabled={busy} onClick={applyBulkStatus}><Check size={15}/> Apply to {selected.length}</button><button className="textButton" onClick={()=>setSelected([])}>Clear</button></div>}
            </div>}
            <div className="libraryList">{filtered.map(p=><div className={"libraryItem"+(selected.includes(p.id)?" picked":"")} key={p.id}>{!isApprover&&<input type="checkbox" className="rowCheck" aria-label={`Select ${p.title}`} checked={selected.includes(p.id)} onChange={e=>setSelected(cur=>e.target.checked?[...cur,p.id]:cur.filter(x=>x!==p.id))}/>}<img src={p.image_url}/><div className="libraryInfo"><b>{p.title}</b><small>{p.publish_date||"No date"} · {p.format}{p.location&&(currentClient?.locations?.length??0)>0?` · ${p.location}`:""}</small></div>{isApprover?<><span className="statusPill">{p.status}</span><button className="iconButton" onClick={()=>openEdit(p)}>View</button></>:<><select value={p.status} onChange={e=>updateStatus(p,e.target.value)}>{editorStatuses(p.status).map(st=><option key={st}>{st}</option>)}</select><button className="iconButton" onClick={()=>openEdit(p)}>Edit</button><button className="iconButton" onClick={()=>removePost(p)}>Delete</button></>}</div>)}</div></>}
        </>}
      </div>
    </section>
    {modal&&workspaceId&&<PostEditor key={editing?.id||"new"} locations={currentClient?.locations||[]} post={editing} preset={editorPreset} isApprover={isApprover} workspaceId={workspaceId} userId={session.user.id} snippets={snippets} statusOptions={cur=>isApprover?statuses:editorStatuses(cur)} onClose={closeEditor} onSaved={editorSaved} onSnippetsChanged={loadSnippets} onOpenApprovals={()=>{closeEditor();setView("approvals");}}/>}
    {taskModal&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setTaskModal(false)}}><form className="modal taskModal" onSubmit={saveTask}><div className="modalHead"><div><p className="eyebrow">Team checklist</p><h2>{editingTask?"Edit task":"Add a task"}</h2></div><button type="button" className="iconButton" onClick={()=>setTaskModal(false)}><X size={18}/></button></div><label>Task<input required autoFocus={!editingTask} value={taskForm.title} onChange={e=>setTaskForm({...taskForm,title:e.target.value})} placeholder="Ex: Approve next week's content"/></label><label>Notes<textarea rows={3} value={taskForm.details} onChange={e=>setTaskForm({...taskForm,details:e.target.value})} placeholder="Add a little context for the team…"/></label><div className="formGrid"><label>Checklist / project<input value={taskForm.list_name} onChange={e=>setTaskForm({...taskForm,list_name:e.target.value})} placeholder="Ex: November content"/></label><label>Due date<input type="date" value={taskForm.due_date} onChange={e=>setTaskForm({...taskForm,due_date:e.target.value})}/></label><label>Priority<select value={taskForm.priority} onChange={e=>setTaskForm({...taskForm,priority:e.target.value as Task["priority"]})}><option>Low</option><option>Normal</option><option>High</option></select></label><label>Assigned to<input value={taskForm.assignee} onChange={e=>setTaskForm({...taskForm,assignee:e.target.value})} placeholder="Name or email (optional)"/></label></div><div className="modalActions"><button type="button" className="secondary" onClick={()=>setTaskModal(false)}>Cancel</button><button className="primary" disabled={busy}>{busy?"Saving…":editingTask?"Save changes":"Add to checklist"}</button></div></form></div>}
    {moreOpen&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setMoreOpen(false)}}><div className="modal moreSheet">
      <div className="moreUser"><span className="avatar">{session.user.email?.[0]?.toUpperCase()}</span><span>{session.user.email}</span></div>
      {(clients.length>1||isPlatformOwner)&&<div className="moreClients"><small>Clients</small>{clients.map(c=><button key={c.id} className={"moreItem"+(c.id===workspaceId?" on":"")} onClick={()=>switchClient(c.id)}><span className="clientLogo">{c.logo_url?<img src={c.logo_url} alt=""/>:<b>{c.name[0]}</b>}</span> {c.name}{c.id===workspaceId&&<Check size={15} className="moreCheck"/>}</button>)}
        {currentClient&&(currentClient.role==="owner"||currentClient.role==="admin")&&<button className="moreItem" onClick={()=>{setMoreOpen(false);setStudio({client:currentClient});}}><Palette size={18}/> Client details</button>}
        {clients.length>1&&<button className="moreItem" onClick={showClientPicker}><LayoutGrid size={18}/> All clients</button>}
        {isPlatformOwner&&<button className="moreItem" onClick={()=>{setMoreOpen(false);createClient();}}><Plus size={18}/> New client</button>}</div>}
      <button className="moreItem" onClick={()=>{setView("email");setMoreOpen(false);}}><Mail size={18}/> Email</button>
      <button className="moreItem" onClick={()=>{setView("library");setMoreOpen(false);}}><Images size={18}/> Creative library</button>
      {canManage&&<button className="moreItem" onClick={()=>{setView("team");loadTeam();setMoreOpen(false);}}><Users size={18}/> Team{pendingPeople.length>0&&<span className="navBadge">{pendingPeople.length}</span>}</button>}
      {!isApprover&&<button className="moreItem" onClick={()=>{setView("bio");setMoreOpen(false);}}><Link2 size={18}/> Link in bio</button>}
      <button className="moreItem" onClick={()=>{setView("brand");setMoreOpen(false);}}><BookMarked size={18}/> Brand kit</button>
      <button className="moreItem danger" onClick={()=>supabase?.auth.signOut()}><LogOut size={18}/> Sign out</button>
      <button className="secondary" onClick={()=>setMoreOpen(false)}>Close</button>
    </div></div>}
    {studioView}
    {notice&&<div className="noticeBar" role="status" onClick={()=>setNotice("")}>{notice}<X size={14}/></div>}
    </main>
}