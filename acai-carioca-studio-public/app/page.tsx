 "use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CalendarDays, Images, LayoutGrid, ListChecks, LogOut, Plus, Search, Upload, X, Check, Trash2, ClipboardList, BadgeCheck, MessageSquare, ChevronLeft, ChevronRight, Users, UserPlus, Clock, Mail } from "lucide-react";

type Task = {
  id: string; title: string; details: string | null; list_name: string; due_date: string | null;
  priority: "Low" | "Normal" | "High"; status: "To do" | "In progress" | "Done"; assignee: string | null;
  created_at: string;
};

type Post = {
  id: string; title: string; image_url: string; publish_date: string | null;
  format: string; location: string; pillar: string; status: string;
  caption: string | null; sort_order: number;
  approval_note?: string | null; reviewed_at?: string | null;
};

const pillars = ["Product","Lifestyle","Promotion","Brand Awareness","Community"];
const statuses = ["Idea","In production","Ready","Awaiting approval","Changes requested","Approved","Scheduled","Published"];
const reviewOnly = ["Approved","Changes requested"];
const editorStatuses = (current:string)=>statuses.filter(s=>!reviewOnly.includes(s)||s===current);
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
  const [taskListFilter,setTaskListFilter] = useState("All lists");
  const [taskForm,setTaskForm] = useState({title:"",details:"",list_name:"General",due_date:"",priority:"Normal" as "Low"|"Normal"|"High",assignee:""});
  const [workspaceId,setWorkspaceId] = useState<string|null>(null);
  const [role,setRole] = useState<string>("");
  const [view,setView] = useState<"feed"|"calendar"|"library"|"todo"|"approvals"|"team">("feed");
  const [noAccess,setNoAccess] = useState(false);
  const [team,setTeam] = useState<TeamRow[]>([]);
  const [grantRole,setGrantRole] = useState<Record<string,string>>({});
  const [reviewStart,setReviewStart] = useState(nextMonday());
  const [changesFor,setChangesFor] = useState<string|null>(null);
  const [reviewNote,setReviewNote] = useState("");
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState("");
  const [search,setSearch] = useState("");
  const [month,setMonth] = useState(new Date().toISOString().slice(0,7));
  const [modal,setModal] = useState(false);
  const [editing,setEditing] = useState<Post|null>(null);
  const [dragged,setDragged] = useState<string|null>(null);
  const [form,setForm] = useState({title:"",date:new Date().toISOString().slice(0,10),format:"Post",location:"Both",pillar:"Product",status:"Idea",caption:""});
  const [selectedFile,setSelectedFile] = useState<File|null>(null);

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
        setTeam([]);
        setLoading(false);
      }
    });

    return ()=>{
      active = false;
      subscription.unsubscribe();
    };
  },[]);

  async function loadPosts(userId:string){
    if(!supabase)return;
    setLoading(true);
    setNotice("");

    const {data:membership,error:memberError}=await supabase
      .from("workspace_members")
      .select("workspace_id,role")
      .eq("user_id",userId)
      .maybeSingle();

    if(memberError){
      setNotice("Could not read your workspace membership: "+memberError.message);
      setPosts([]);
      setTasks([]);
      setWorkspaceId(null);
      setLoading(false);
      return;
    }

    if(!membership){
      await supabase.rpc("request_access");
      setNoAccess(true);
      setPosts([]);
      setTasks([]);
      setWorkspaceId(null);
      setLoading(false);
      return;
    }

    setNoAccess(false);
    setWorkspaceId(membership.workspace_id);
    setRole(membership.role);
    if(membership.role==="owner"||membership.role==="admin")loadTeam();
    if(membership.role==="approver")setView("approvals");

    const {data,error}=await supabase
      .from("posts")
      .select("*")
      .eq("workspace_id",membership.workspace_id)
      .order("sort_order",{ascending:true})
      .order("created_at",{ascending:false});

    if(error) setNotice("Could not load content: "+error.message);
    else setPosts((data||[]) as Post[]);

    const {data:taskData,error:taskError}=await supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id",membership.workspace_id)
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

  async function savePost(e:React.FormEvent){
    e.preventDefault(); if(!supabase)return;
    if(!selectedFile && !editing){setNotice("Choose an image to preview this post in the feed.");return;}
    setBusy(true);setNotice("");
    try{
      let image_url=editing?.image_url||"";
      if(selectedFile){
        const ext=selectedFile.name.split(".").pop()||"jpg";
        const path=`${session.user.id}/${crypto.randomUUID()}.${ext}`;
        const {error:uploadError}=await supabase.storage.from("creative-assets").upload(path,selectedFile,{upsert:false});
        if(uploadError)throw uploadError;
        const {data}=supabase.storage.from("creative-assets").getPublicUrl(path);
        image_url=data.publicUrl;
      }
      if(!workspaceId)throw new Error("Workspace membership is missing. Ask the workspace owner to add your account.");
      const {date:publish_date,...contentFields}=form;
      const payload={...contentFields,publish_date:publish_date||null,image_url,workspace_id:workspaceId,sort_order:editing?.sort_order??0,created_by:session.user.id};
      const result=editing
        ? await supabase.from("posts").update(payload).eq("id",editing.id).eq("workspace_id",workspaceId)
        : await supabase.from("posts").insert(payload);
      if(result.error)throw result.error;
      setModal(false);setEditing(null);setSelectedFile(null);setForm({title:"",date:new Date().toISOString().slice(0,10),format:"Post",location:"Both",pillar:"Product",status:"Idea",caption:""});
      await loadPosts(session.user.id);setNotice("Content saved.");
    }catch(err:any){setNotice(err.message||"Could not save this content.");}
    setBusy(false);
  }

  function openTask(){
    setTaskForm({title:"",details:"",list_name:taskListFilter==="All lists"?"General":taskListFilter,due_date:"",priority:"Normal",assignee:""});
    setTaskModal(true);
  }
  async function saveTask(e:React.FormEvent){
    e.preventDefault();
    if(!supabase||!workspaceId)return;
    setBusy(true);setNotice("");
    const {data,error}=await supabase.from("tasks").insert({
      ...taskForm, title:taskForm.title.trim(), list_name:taskForm.list_name.trim()||"General", due_date:taskForm.due_date||null, details:taskForm.details.trim()||null,
      assignee:taskForm.assignee.trim()||null, workspace_id:workspaceId, created_by:session.user.id
    }).select().single();
    if(error)setNotice(error.message);
    else {setTasks(current=>[data as Task,...current]);setTaskModal(false);setNotice("Task added to your team list.");}
    setBusy(false);
  }
  async function updateTask(task:Task,changes:Partial<Task>){
    if(!supabase||!workspaceId)return;
    const {error}=await supabase.from("tasks").update(changes).eq("id",task.id).eq("workspace_id",workspaceId);
    if(error)setNotice(error.message);
    else setTasks(current=>current.map(t=>t.id===task.id?{...t,...changes}:t));
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
  async function loadTeam(){
    if(!supabase)return;
    const {data,error}=await supabase.rpc("list_team");
    if(error)setNotice("Could not load your team: "+error.message);else setTeam((data||[]) as TeamRow[]);
  }
  async function setMemberRole(person:TeamRow,newRole:string){
    if(!supabase)return;
    setBusy(true);setNotice("");
    const {error}=await supabase.rpc("set_member_role",{target_user:person.user_id,new_role:newRole});
    if(error)setNotice(error.message);
    else{setNotice(person.pending?`${person.email} now has access as ${newRole}.`:`${person.email} is now ${newRole}.`);await loadTeam();}
    setBusy(false);
  }
  async function removeMember(person:TeamRow){
    if(!supabase||!confirm(`Remove ${person.email} from the workspace? They will lose access immediately. Their posts stay in the studio.`))return;
    setBusy(true);setNotice("");
    const {error}=await supabase.rpc("remove_member",{target_user:person.user_id});
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
  async function notify(kind:"submitted"|"reviewed",ids:string[]){
    if(!supabase||ids.length===0)return {ok:false,error:"Nothing to send."};
    const {data:{session:current}}=await supabase.auth.getSession();
    try{
      const res=await fetch("/api/notify",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${current?.access_token||""}`},body:JSON.stringify({kind,postIds:ids,periodStart:reviewStart,periodEnd:reviewEnd})});
      const out=await res.json().catch(()=>({}));
      return res.ok?{ok:true,sent:out.sent as number}:{ok:false,error:(out.error as string)||"Could not send the email."};
    }catch{return {ok:false,error:"Could not reach the email service."};}
  }
  async function notifyApprover(){
    if(!confirm(`Email the approver about ${awaiting.length} post${awaiting.length===1?"":"s"} awaiting approval (${prettyDate(reviewStart)} – ${prettyDate(reviewEnd)})?`))return;
    setBusy(true);setNotice("");
    const r=await notify("submitted",awaiting.map(p=>p.id));
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
      setChangesFor(null);setReviewNote("");
      let msg=decision==="Approved"?`${updated.length} post${updated.length===1?"":"s"} approved.`:"Changes requested. The team will see your comment.";
      if(updated.length>0){const r=await notify("reviewed",updated.map(u=>u.id));if(r.ok)msg+=" The team was notified by email.";else if(isApprover)msg+=" (Email not sent: "+r.error+")";}
      setNotice(msg);
    }
    setBusy(false);
  }
  async function removePost(post:Post){
    if(!supabase||!confirm("Delete this content item?"))return;
    const {error}=await supabase.from("posts").delete().eq("id",post.id).eq("workspace_id",workspaceId);
    if(error)setNotice(error.message);else setPosts(p=>p.filter(x=>x.id!==post.id));
  }
  async function reorder(targetId:string){
    if(!supabase||!dragged||dragged===targetId)return;
    const client = supabase;
    const copy=[...posts];const from=copy.findIndex(p=>p.id===dragged),to=copy.findIndex(p=>p.id===targetId);
    if(from<0||to<0)return;
    const [item]=copy.splice(from,1);copy.splice(to,0,item);
    setPosts(copy);setDragged(null);
    await Promise.all(copy.map((p,i)=>client.from("posts").update({sort_order:i}).eq("id",p.id)));
  }
  function openNew(){setEditing(null);setSelectedFile(null);setForm({title:"",date:new Date().toISOString().slice(0,10),format:"Post",location:"Both",pillar:"Product",status:"Idea",caption:""});setModal(true);}
  function openEdit(p:Post){setEditing(p);setSelectedFile(null);setForm({title:p.title,date:p.publish_date||"",format:p.format,location:p.location,pillar:p.pillar,status:p.status,caption:p.caption||""});setModal(true);}

  const isApprover=role==="approver";
  const canManage=role==="owner"||role==="admin";
  const pendingPeople=team.filter(t=>t.pending);
  const members=team.filter(t=>!t.pending);
  const canReview=role==="owner"||role==="approver";
  const reviewEnd=addDays(reviewStart,13);
  const inWindow=posts.filter(p=>p.publish_date&&p.publish_date>=reviewStart&&p.publish_date<=reviewEnd).sort((a,b)=>(a.publish_date||"").localeCompare(b.publish_date||""));
  const awaiting=inWindow.filter(p=>p.status==="Awaiting approval");
  const reviewed=inWindow.filter(p=>p.status!=="Awaiting approval");
  const allAwaiting=posts.filter(p=>p.status==="Awaiting approval").length;
  const filtered=useMemo(()=>posts.filter(p=>(p.title+" "+p.pillar+" "+p.location).toLowerCase().includes(search.toLowerCase())),[posts,search]);
  const monthDate=new Date(month+"-01T12:00:00");
  const days=new Date(monthDate.getFullYear(),monthDate.getMonth()+1,0).getDate();
  const offset=new Date(monthDate.getFullYear(),monthDate.getMonth(),1).getDay();
  const count=(s:string)=>posts.filter(p=>p.status===s).length;
  const taskLists=["All lists",...Array.from(new Set(tasks.map(t=>t.list_name))).sort()];
  const visibleTasks=tasks.filter(t=>taskListFilter==="All lists"||t.list_name===taskListFilter);
  const openTasks=visibleTasks.filter(t=>t.status!=="Done");
  const doneTasks=visibleTasks.filter(t=>t.status==="Done");

  if(!supabase)return <main className="setup"><div className="setupCard"><p className="eyebrow">AÇAÍ CARIOCA · CONTENT ATELIER</p><h1>Welcome to your<br/><i>creative studio.</i></h1><p className="muted">The app is ready. Connect your Supabase project to activate team login, shared storage and the live content calendar.</p><div className="setupSteps"><b>1. Create a Supabase project</b><span>2. Run the included database.sql</span><span>3. Create the storage bucket: creative-assets</span><span>4. Add the keys to .env.local</span><span>5. Deploy to Vercel</span></div><p className="hint">See SETUP.md in the project folder for the full setup guide.</p></div></main>;

  if(!session)return <main className="loginShell"><div className="loginCard"><p className="eyebrow">AÇAÍ CARIOCA · CONTENT ATELIER</p><h1>Make room for<br/><i>good ideas.</i></h1><p className="muted">Your brand's visual workspace.</p><form onSubmit={authenticate} className="loginForm"><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@acaicarioca.com"/></label><label>Password<input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label><button className="primary" disabled={busy}>{busy?"Please wait…":authMode==="login"?"Sign in":"Create account"}</button></form><div className="orDivider"><span>or</span></div><button type="button" className="googleButton" onClick={signInWithGoogle} disabled={busy}>Continue with Google</button><button className="textButton" onClick={()=>setAuthMode(authMode==="login"?"signup":"login")}>{authMode==="login"?"New to the studio? Create an account":"Already have an account? Sign in"}</button>{notice&&<p className="notice">{notice}</p>}<p className="muted legalLink"><a href="/privacy">Privacy Policy</a></p></div></main>;

  if(noAccess)return <main className="loginShell"><div className="loginCard"><p className="eyebrow">AÇAÍ CARIOCA · CONTENT ATELIER</p><h1>Almost<br/><i>there.</i></h1><p className="muted">You're signed in as <b>{session.user.email}</b>. Your access request was sent to the workspace owner. Once it's approved, refresh this page to open the studio.</p><div className="modalActions waitingActions"><button className="secondary" onClick={()=>supabase?.auth.signOut()}>Sign out</button><button className="primary" onClick={()=>loadPosts(session.user.id)}>Check again</button></div></div></main>;

  return <main className="appShell">
    <aside className="sidebar"><div className="brand"><span className="brandMark">AC</span><div><b>açaí carioca.</b><small>CONTENT ATELIER</small></div></div>
      <p className="sideLabel">Workspace</p>
      <button className={view==="feed"?"nav active":"nav"} onClick={()=>setView("feed")}><LayoutGrid size={17}/> <span className="navFull">Feed planner</span><span className="navShort">Feed</span></button>
      <button className={view==="calendar"?"nav active":"nav"} onClick={()=>setView("calendar")}><CalendarDays size={17}/> Calendar</button>
      <button className={view==="library"?"nav active":"nav"} onClick={()=>setView("library")}><Images size={17}/> <span className="navFull">Creative library</span><span className="navShort">Library</span></button>
      <button className={view==="approvals"?"nav active":"nav"} onClick={()=>setView("approvals")}><BadgeCheck size={17}/> Approvals{allAwaiting>0&&<span className="navBadge">{allAwaiting}</span>}</button>
      {canManage&&<button className={view==="team"?"nav active":"nav"} onClick={()=>{setView("team");loadTeam();}}><Users size={17}/> Team{pendingPeople.length>0&&<span className="navBadge">{pendingPeople.length}</span>}</button>}
      {!isApprover&&<button className={view==="todo"?"nav active":"nav"} onClick={()=>setView("todo")}><ListChecks size={17}/> To-do</button>}
      <div className="sidebarBottom"><p className="eyebrow">Your team</p><div className="userLine"><span className="avatar">{session.user.email?.[0]?.toUpperCase()}</span><span>{session.user.email}</span></div><button className="nav signOutNav" onClick={()=>supabase?.auth.signOut()} ><LogOut size={16}/> Sign out</button></div>
    </aside>
    <section className="mainArea">
      <header className="topbar"><div className="topbarText"><p className="eyebrow">San Diego, California</p><span className="topTitle">The art of showing up.</span></div><div className="topActions">{!isApprover&&view!=="team"&&<button className="primary compact" onClick={view==="todo"?openTask:openNew}><Plus size={16}/> {view==="todo"?"Add task":"Add content"}</button>}<button className="iconButton phoneOnly roundIcon" aria-label="Sign out" onClick={()=>supabase?.auth.signOut()}><LogOut size={16}/></button></div></header>
      <div className="content viewFade" key={view}>
        <div className="welcome"><div><p className="eyebrow">Your brand, visually curated</p><h1>{view==="feed"?"Your visual grid":view==="calendar"?"The calendar":view==="library"?"Creative archive":view==="approvals"?"Content approvals":view==="team"?"Your team":"Your team checklist"}</h1><p className="muted">{view==="feed"?"Compose your next chapter, one post at a time.":view==="calendar"?"A clear view of what's coming up.":view==="library"?"All your creative assets, in one place.":view==="approvals"?"Review two weeks of content at a time.":view==="team"?"Decide who can see and work on your calendar.":"Small steps, beautifully organized."}</p></div>{view==="team"?<div className="stats"><div><b>{members.length}</b><small>MEMBERS</small></div><div><b>{pendingPeople.length}</b><small>REQUESTS</small></div></div>:view==="approvals"?<div className="stats"><div><b>{awaiting.length}</b><small>AWAITING</small></div><div><b>{inWindow.filter(p=>p.status==="Approved").length}</b><small>APPROVED</small></div><div><b>{inWindow.filter(p=>p.status==="Changes requested").length}</b><small>CHANGES</small></div></div>:<div className="stats"><div><b>{view==="todo"?tasks.length:posts.length}</b><small>{view==="todo"?"TASKS":"CONTENT"}</small></div><div><b>{view==="todo"?tasks.filter(t=>t.status!=="Done").length:count("In production")}</b><small>{view==="todo"?"OPEN":"IN PROGRESS"}</small></div><div><b>{view==="todo"?tasks.filter(t=>t.status==="Done").length:count("Scheduled")}</b><small>{view==="todo"?"COMPLETED":"SCHEDULED"}</small></div></div>}</div>
        {loading?<p className="muted">Loading your workspace…</p>:<>
          {view==="feed"&&<><div className="sectionHead"><div><p className="eyebrow">Instagram presence</p><h2>Feed preview</h2></div><span className="muted">{posts.length} pieces · drag to rearrange</span></div>{posts.length===0?<div className="empty"><Images size={28}/><h3>A blank canvas.</h3><p>Upload your first creative to begin building the grid.</p><button className="primary" onClick={openNew}><Plus size={16}/> Add your first post</button></div>:<div className="feedGrid">{posts.map(p=><article key={p.id} className="feedTile" draggable={!isApprover} onDragStart={()=>setDragged(p.id)} onDragOver={e=>e.preventDefault()} onDrop={()=>!isApprover&&reorder(p.id)} onClick={()=>openEdit(p)}><img src={p.image_url} alt={p.title}/><div className="tileOverlay"><b>{p.title}</b><span>{p.publish_date||"No date"} · {p.format}</span></div>{p.format==="Reel"&&<span className="formatIcon">▶</span>}{p.format==="Carousel"&&<span className="formatIcon">▤</span>}</article>)}</div>}</>}
          {view==="calendar"&&<><div className="sectionHead"><div><p className="eyebrow">Publishing rhythm</p><h2>Monthly overview</h2></div><input className="monthInput" type="month" value={month} onChange={e=>setMonth(e.target.value)}/></div><div className="calendar"><div className="weekdays">{["SUN","MON","TUE","WED","THU","FRI","SAT"].map((d,i)=><span key={i}>{d}</span>)}</div><div className="calendarGrid">{Array.from({length:offset},(_,i)=><div key={"e"+i}/>)}{Array.from({length:days},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,"0")}`;const dayPosts=posts.filter(p=>p.publish_date===date);const dayTasks=tasks.filter(t=>t.due_date===date);return <div className="day" key={date}><b>{i+1}</b>{dayPosts.map(p=><button key={p.id} className={"dayPost"+(p.status==="Awaiting approval"?" awaitingPost":p.status==="Changes requested"?" changesPost":p.status==="Approved"?" approvedPost":"")} title={p.status} onClick={()=>openEdit(p)}><img src={p.image_url}/><span>{p.title}</span></button>)}{dayTasks.map(task=><button key={task.id} type="button" onClick={()=>!isApprover&&setView("todo")} title={`Task: ${task.title} · ${task.status}`} style={{display:"block",width:"100%",marginTop:5,padding:"5px 6px",border:0,borderLeft:`3px solid ${task.status==="Done"?"#62813B":"#4C1E2F"}`,borderRadius:3,background:task.status==="Done"?"#edf0e7":"#EFE4D2",color:"#4C1E2F",textAlign:"left",fontSize:11,lineHeight:1.3,cursor:"pointer",opacity:task.status==="Done"?0.75:1}}><span style={{display:"block",fontWeight:600,textDecoration:task.status==="Done"?"line-through":"none",overflowWrap:"anywhere"}}>{task.title}</span><span style={{display:"block",fontSize:9,marginTop:2,color:"#75665f"}}>TASK · {task.status.toUpperCase()}</span></button>)}</div>})}</div></div></>}
          {view==="todo"&&<>
            <div className="sectionHead"><div><p className="eyebrow">Team organization</p><h2>Things to get done</h2></div><button className="primary" onClick={openTask}><Plus size={16}/> Add task</button></div>
            <div className="todoToolbar"><div className="todoFilters">{taskLists.map(list=><button key={list} className={taskListFilter===list?"filterChip selected":"filterChip"} onClick={()=>setTaskListFilter(list)}>{list}</button>)}</div><span className="muted">Shared with your workspace team</span></div>
            {visibleTasks.length===0?<div className="empty"><ClipboardList size={28}/><h3>{tasks.length===0?"A fresh start.":"Nothing on this list yet."}</h3><p>{tasks.length===0?"Create your first checklist item and keep the team moving.":"Add a task to this checklist when you're ready."}</p><button className="primary" onClick={openTask}><Plus size={16}/> Create a task</button></div>:<div className="todoBoard">
              <section className="todoColumn"><div className="todoColumnHead"><h3>To do</h3><span>{openTasks.filter(t=>t.status==="To do").length}</span></div>
                {openTasks.filter(t=>t.status==="To do").map(task=><article className="taskCard" key={task.id}><button className="taskCheck" aria-label="Mark complete" onClick={()=>updateTask(task,{status:"Done"})}><Check size={15}/></button><div className="taskBody"><b>{task.title}</b>{task.details&&<p>{task.details}</p>}<div className="taskMeta"><span>{task.list_name}</span>{task.due_date&&<span>Due {new Date(task.due_date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}{task.assignee&&<span>{task.assignee}</span>}<span className={"priority "+task.priority.toLowerCase()}>{task.priority}</span></div></div><select aria-label="Task status" value={task.status} onChange={e=>updateTask(task,{status:e.target.value as Task["status"]})}><option>To do</option><option>In progress</option><option>Done</option></select><button className="taskDelete" aria-label="Delete task" onClick={()=>removeTask(task)}><Trash2 size={15}/></button></article>)}
              </section>
              <section className="todoColumn"><div className="todoColumnHead"><h3>In progress</h3><span>{openTasks.filter(t=>t.status==="In progress").length}</span></div>
                {openTasks.filter(t=>t.status==="In progress").map(task=><article className="taskCard" key={task.id}><button className="taskCheck" aria-label="Mark complete" onClick={()=>updateTask(task,{status:"Done"})}><Check size={15}/></button><div className="taskBody"><b>{task.title}</b>{task.details&&<p>{task.details}</p>}<div className="taskMeta"><span>{task.list_name}</span>{task.due_date&&<span>Due {new Date(task.due_date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}{task.assignee&&<span>{task.assignee}</span>}<span className={"priority "+task.priority.toLowerCase()}>{task.priority}</span></div></div><select aria-label="Task status" value={task.status} onChange={e=>updateTask(task,{status:e.target.value as Task["status"]})}><option>To do</option><option>In progress</option><option>Done</option></select><button className="taskDelete" aria-label="Delete task" onClick={()=>removeTask(task)}><Trash2 size={15}/></button></article>)}
              </section>
              <section className="todoColumn completedColumn"><div className="todoColumnHead"><h3>Completed</h3><span>{doneTasks.length}</span></div>
                {doneTasks.map(task=><article className="taskCard completedTask" key={task.id}><button className="taskCheck checked" aria-label="Reopen task" onClick={()=>updateTask(task,{status:"To do"})}><Check size={15}/></button><div className="taskBody"><b>{task.title}</b><div className="taskMeta"><span>{task.list_name}</span>{task.assignee&&<span>{task.assignee}</span>}</div></div><button className="taskDelete" aria-label="Delete task" onClick={()=>removeTask(task)}><Trash2 size={15}/></button></article>)}
              </section>
            </div>}
          </>}
          {view==="approvals"&&<>
            <div className="sectionHead"><div><p className="eyebrow">Two-week review</p><h2>{prettyDate(reviewStart)} – {prettyDate(reviewEnd)}</h2></div><div className="reviewNav"><button className="secondary" onClick={()=>setReviewStart(addDays(reviewStart,-14))}><ChevronLeft size={15}/> Previous</button><input className="monthInput" type="date" value={reviewStart} onChange={e=>e.target.value&&setReviewStart(e.target.value)} aria-label="First day of the review period"/><button className="secondary" onClick={()=>setReviewStart(addDays(reviewStart,14))}>Next <ChevronRight size={15}/></button></div></div>
            {awaiting.length===0?<div className="empty"><BadgeCheck size={28}/><h3>Nothing waiting for approval.</h3><p>{allAwaiting>0?`${allAwaiting} post${allAwaiting===1?" is":"s are"} awaiting approval in other weeks. Use Previous / Next to find ${allAwaiting===1?"it":"them"}.`:canReview?"When the team sends posts for review, they will appear here.":"Set a post's status to “Awaiting approval” to send it here for review."}</p></div>:<>
              {!isApprover&&<div className="approveAllBar notifyBar"><span>Ready to send these two weeks for approval?</span><button className="secondary" disabled={busy} onClick={notifyApprover}><Mail size={15}/> Notify approver</button></div>}
              {canReview&&<div className="approveAllBar"><span><b>{awaiting.length}</b> post{awaiting.length===1?"":"s"} awaiting your approval in these two weeks.</span><button className="primary" disabled={busy} onClick={()=>{if(confirm(`Approve all ${awaiting.length} post${awaiting.length===1?"":"s"} from ${prettyDate(reviewStart)} to ${prettyDate(reviewEnd)}?`))review(awaiting.map(p=>p.id),"Approved");}}><Check size={15}/> Approve all {awaiting.length}</button></div>}
              <div className="reviewList">{awaiting.map(p=><article className="reviewCard" key={p.id}>
                <img src={p.image_url} alt={p.title} onClick={()=>openEdit(p)}/>
                <div className="reviewBody">
                  <p className="eyebrow">{prettyDate(p.publish_date)} · {p.format} · {p.location}</p>
                  <h3>{p.title}</h3>
                  <span className="muted">{p.pillar}</span>
                  {p.caption?<p className="reviewCaption">{p.caption}</p>:<p className="reviewCaption muted">No caption yet.</p>}
                  {p.approval_note&&<p className="previousNote"><MessageSquare size={12}/> Previous feedback: {p.approval_note}</p>}
                  {canReview&&(changesFor===p.id?<div className="changesForm"><textarea rows={3} autoFocus value={reviewNote} onChange={e=>setReviewNote(e.target.value)} placeholder="What should change? (caption, image, date…)"/><div className="modalActions"><button className="secondary" onClick={()=>{setChangesFor(null);setReviewNote("");}}>Cancel</button><button className="primary" disabled={busy||!reviewNote.trim()} onClick={()=>review([p.id],"Changes requested",reviewNote)}>Send feedback</button></div></div>
                  :<div className="reviewActions"><button className="primary" disabled={busy} onClick={()=>review([p.id],"Approved")}><Check size={15}/> Approve</button><button className="secondary" disabled={busy} onClick={()=>{setChangesFor(p.id);setReviewNote("");}}><MessageSquare size={15}/> Request changes</button></div>)}
                </div>
              </article>)}</div>
            </>}
            {reviewed.length>0&&<><div className="sectionHead reviewedHead"><div><p className="eyebrow">Also in these two weeks</p><h2>Other content</h2></div></div><div className="libraryList">{reviewed.map(p=><div className="libraryItem" key={p.id}><img src={p.image_url}/><div className="libraryInfo"><b>{p.title}</b><small>{prettyDate(p.publish_date)} · {p.format}{p.approval_note?" · “"+p.approval_note+"”":""}</small></div><span className={"statusPill"+(p.status==="Approved"?" ok":p.status==="Changes requested"?" warn":"")}>{p.status}</span><button className="iconButton" onClick={()=>openEdit(p)}>{isApprover?"View":"Edit"}</button></div>)}</div></>}
          </>}
          {view==="team"&&canManage&&<>
            <div className="sectionHead"><div><p className="eyebrow">Waiting for you</p><h2>Access requests</h2></div><span className="muted">People who signed in and asked to join</span></div>
            {pendingPeople.length===0?<div className="empty teamEmpty"><UserPlus size={26}/><h3>No pending requests.</h3><p>Share the studio link. When someone signs in (with Google or email), they will show up here for you to approve.</p></div>:
            <div className="teamList">{pendingPeople.map(p=><div className="teamRow pendingRow" key={p.user_id}><span className="avatar">{p.email?.[0]?.toUpperCase()}</span><div className="teamInfo"><b>{p.email}</b><small><Clock size={11}/> Requested {new Date(p.since).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</small></div><select aria-label="Role" value={grantRole[p.user_id]||"editor"} onChange={e=>setGrantRole({...grantRole,[p.user_id]:e.target.value})}>{roleOptions.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select><button className="primary" disabled={busy} onClick={()=>setMemberRole(p,grantRole[p.user_id]||"editor")}><Check size={15}/> Give access</button><button className="iconButton" disabled={busy} onClick={()=>dismissRequest(p)}>Decline</button></div>)}</div>}
            <div className="sectionHead reviewedHead"><div><p className="eyebrow">With access</p><h2>Members</h2></div></div>
            <div className="teamList">{members.map(m=><div className="teamRow" key={m.user_id}><span className="avatar">{m.email?.[0]?.toUpperCase()}</span><div className="teamInfo"><b>{m.email}{m.user_id===session.user.id?" (you)":""}</b><small>Member since {new Date(m.since).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</small></div>{m.role==="owner"||m.user_id===session.user.id?<span className="statusPill">{m.role}</span>:<><select aria-label="Role" value={m.role||""} disabled={busy} onChange={e=>setMemberRole(m,e.target.value)}>{roleOptions.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</select><button className="iconButton" disabled={busy} onClick={()=>removeMember(m)}>Remove</button></>}</div>)}</div>
            <div className="roleGuide">{roleOptions.map(r=><div key={r.value}><b>{r.label}</b><span>{r.hint}</span></div>)}</div>
          </>}
          {view==="library"&&<><div className="sectionHead"><div><p className="eyebrow">Creative archive</p><h2>All your content</h2></div><div className="search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search content"/></div></div><div className="libraryList">{filtered.map(p=><div className="libraryItem" key={p.id}><img src={p.image_url}/><div className="libraryInfo"><b>{p.title}</b><small>{p.publish_date||"No date"} · {p.format} · {p.location}</small></div>{isApprover?<><span className="statusPill">{p.status}</span><button className="iconButton" onClick={()=>openEdit(p)}>View</button></>:<><select value={p.status} onChange={e=>updateStatus(p,e.target.value)}>{editorStatuses(p.status).map(s=><option key={s}>{s}</option>)}</select><button className="iconButton" onClick={()=>openEdit(p)}>Edit</button><button className="iconButton" onClick={()=>removePost(p)}>Delete</button></>}</div>)}</div></>}
        </>}
      </div>
    </section>
    {modal&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><form className="modal" onSubmit={savePost}><div className="modalHead"><div><p className="eyebrow">Creative asset</p><h2>{isApprover?"Content preview":editing?"Edit content":"Add new content"}</h2></div><button type="button" className="iconButton" onClick={()=>setModal(false)}><X size={18}/></button></div>{editing?.approval_note&&<div className={"feedbackBox"+(editing.status==="Changes requested"?" changes":"")}><MessageSquare size={15}/><div><b>Approver feedback{editing.reviewed_at?" · "+new Date(editing.reviewed_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}):""}</b><p>{editing.approval_note}</p>{!isApprover&&editing.status==="Changes requested"&&<small>After updating, set the status back to “Awaiting approval”.</small>}</div></div>}{isApprover&&editing&&<img className="previewImage" src={editing.image_url} alt={editing.title}/>}<fieldset className="plainFieldset" disabled={isApprover}>{!isApprover&&<label className="uploadBox"><Upload size={22}/><b>{selectedFile?selectedFile.name:editing?"Replace image or keep current":"Choose an image"}</b><small>JPG, PNG or WebP · image preview in your feed</small><input type="file" accept="image/*" onChange={e=>setSelectedFile(e.target.files?.[0]||null)}/></label>}<div className="formGrid"><label>Content title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Summer in a cup"/></label><label>Publication date<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label><label>Format<select value={form.format} onChange={e=>setForm({...form,format:e.target.value})}>{["Post","Reel","Carousel","Story","Flyer"].map(x=><option key={x}>{x}</option>)}</select></label><label>Location<select value={form.location} onChange={e=>setForm({...form,location:e.target.value})}>{["Both","Pacific Beach","Point Loma"].map(x=><option key={x}>{x}</option>)}</select></label><label>Content pillar<select value={form.pillar} onChange={e=>setForm({...form,pillar:e.target.value})}>{pillars.map(x=><option key={x}>{x}</option>)}</select></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{(isApprover?statuses:editorStatuses(editing?.status||"")).map(x=><option key={x}>{x}</option>)}</select></label></div><label>Caption / creative notes<textarea rows={3} value={form.caption} onChange={e=>setForm({...form,caption:e.target.value})} placeholder="Caption, CTA or notes for the team…"/></label></fieldset><div className="modalActions">{isApprover?<><button type="button" className="secondary" onClick={()=>setModal(false)}>Close</button>{editing?.status==="Awaiting approval"&&<button type="button" className="primary" onClick={()=>{setModal(false);setView("approvals");}}>Review in Approvals</button>}</>:<><button type="button" className="secondary" onClick={()=>setModal(false)}>Cancel</button><button className="primary" disabled={busy}>{busy?"Saving…":editing?"Save changes":"Add to studio"}</button></>}</div></form></div>}
    {taskModal&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setTaskModal(false)}}><form className="modal taskModal" onSubmit={saveTask}><div className="modalHead"><div><p className="eyebrow">Team checklist</p><h2>Add a task</h2></div><button type="button" className="iconButton" onClick={()=>setTaskModal(false)}><X size={18}/></button></div><label>Task<input required autoFocus value={taskForm.title} onChange={e=>setTaskForm({...taskForm,title:e.target.value})} placeholder="Ex: Approve next week's content"/></label><label>Notes<textarea rows={3} value={taskForm.details} onChange={e=>setTaskForm({...taskForm,details:e.target.value})} placeholder="Add a little context for the team…"/></label><div className="formGrid"><label>Checklist / project<input value={taskForm.list_name} onChange={e=>setTaskForm({...taskForm,list_name:e.target.value})} placeholder="Ex: November content"/></label><label>Due date<input type="date" value={taskForm.due_date} onChange={e=>setTaskForm({...taskForm,due_date:e.target.value})}/></label><label>Priority<select value={taskForm.priority} onChange={e=>setTaskForm({...taskForm,priority:e.target.value as Task["priority"]})}><option>Low</option><option>Normal</option><option>High</option></select></label><label>Assigned to<input value={taskForm.assignee} onChange={e=>setTaskForm({...taskForm,assignee:e.target.value})} placeholder="Name or email (optional)"/></label></div><div className="modalActions"><button type="button" className="secondary" onClick={()=>setTaskModal(false)}>Cancel</button><button className="primary" disabled={busy}>{busy?"Saving…":"Add to checklist"}</button></div></form></div>}
    {notice&&<div className="noticeBar" role="status" onClick={()=>setNotice("")}>{notice}<X size={14}/></div>}
    </main>
}