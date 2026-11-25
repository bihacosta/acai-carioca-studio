 "use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CalendarDays, Images, LayoutGrid, ListChecks, LogOut, Plus, Search, Upload, X, Check, Trash2, ClipboardList } from "lucide-react";

type Task = {
  id: string; title: string; details: string | null; list_name: string; due_date: string | null;
  priority: "Low" | "Normal" | "High"; status: "To do" | "In progress" | "Done"; assignee: string | null;
  created_at: string;
};

type Post = {
  id: string; title: string; image_url: string; publish_date: string | null;
  format: string; location: string; pillar: string; status: string;
  caption: string | null; sort_order: number;
};

const pillars = ["Product","Lifestyle","Promotion","Brand Awareness","Community"];
const statuses = ["Idea","In production","Ready","Scheduled","Published"];
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
  const [view,setView] = useState<"feed"|"calendar"|"library"|"todo">("feed");
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
      .select("workspace_id")
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
      setNotice("Your signed-in account has no workspace membership yet. Check that the user_id in workspace_members matches the account you are signed into.");
      setPosts([]);
      setTasks([]);
      setWorkspaceId(null);
      setLoading(false);
      return;
    }

    setWorkspaceId(membership.workspace_id);

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

  if(!session)return <main className="loginShell"><div className="loginCard"><p className="eyebrow">AÇAÍ CARIOCA · CONTENT ATELIER</p><h1>Make room for<br/><i>good ideas.</i></h1><p className="muted">Your brand's visual workspace.</p><form onSubmit={authenticate} className="loginForm"><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@acaicarioca.com"/></label><label>Password<input type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters"/></label><button className="primary" disabled={busy}>{busy?"Please wait…":authMode==="login"?"Sign in":"Create account"}</button></form><button type="button" className="secondary googleButton" disabled={busy} onClick={signInWithGoogle}>Continue with Google</button><button className="textButton" onClick={()=>setAuthMode(authMode==="login"?"signup":"login")}>{authMode==="login"?"New to the studio? Create an account":"Already have an account? Sign in"}</button>{notice&&<p className="notice">{notice}</p>}</div></main>;

  return <main className="appShell">
    <aside className="sidebar"><div className="brand"><span className="brandMark">AC</span><div><b>açaí carioca.</b><small>CONTENT ATELIER</small></div></div>
      <p className="sideLabel">WORKSPACE</p>
      <button className={view==="feed"?"nav active":"nav"} onClick={()=>setView("feed")}><LayoutGrid size={17}/> Feed planner</button>
      <button className={view==="calendar"?"nav active":"nav"} onClick={()=>setView("calendar")}><CalendarDays size={17}/> Calendar</button>
      <button className={view==="library"?"nav active":"nav"} onClick={()=>setView("library")}><Images size={17}/> Creative library</button>
      <button className={view==="todo"?"nav active":"nav"} onClick={()=>setView("todo")}><ListChecks size={17}/> To-do</button>
      <div className="sidebarBottom"><p className="eyebrow">YOUR TEAM</p><div className="userLine"><span className="avatar">{session.user.email?.[0]?.toUpperCase()}</span><span>{session.user.email}</span></div><button className="nav" onClick={()=>supabase?.auth.signOut()} ><LogOut size={16}/> Sign out</button></div>
    </aside>
    <section className="mainArea">
      <header className="topbar"><div><p className="eyebrow">SAN DIEGO · CALIFORNIA</p><span className="topTitle">The art of showing up.</span></div><button className="primary compact" onClick={view==="todo"?openTask:openNew}><Plus size={16}/> {view==="todo"?"Add task":"Add content"}</button></header>
      <div className="content">
        <div className="welcome"><div><p className="eyebrow">YOUR BRAND, VISUALLY CURATED</p><h1>{view==="feed"?"Your visual grid":view==="calendar"?"The calendar":view==="library"?"Creative archive":"Your team checklist"}</h1><p className="muted">{view==="feed"?"Compose your next chapter, one post at a time.":view==="calendar"?"A clear view of what's coming up.":view==="library"?"All your creative assets, in one place.":"Small steps, beautifully organized."}</p></div><div className="stats"><div><b>{view==="todo"?tasks.length:posts.length}</b><small>{view==="todo"?"TASKS":"CONTENT"}</small></div><div><b>{view==="todo"?tasks.filter(t=>t.status!=="Done").length:count("In production")}</b><small>{view==="todo"?"OPEN":"IN PROGRESS"}</small></div><div><b>{view==="todo"?tasks.filter(t=>t.status==="Done").length:count("Scheduled")}</b><small>{view==="todo"?"COMPLETED":"SCHEDULED"}</small></div></div></div>
        {notice&&<div className="noticeBar" onClick={()=>setNotice("")}>{notice}<X size={14}/></div>}
        {loading?<p className="muted">Loading your workspace…</p>:<>
          {view==="feed"&&<><div className="sectionHead"><div><p className="eyebrow">INSTAGRAM PRESENCE</p><h2>Feed preview</h2></div><span className="muted">{posts.length} pieces · drag to rearrange</span></div>{posts.length===0?<div className="empty"><Images size={28}/><h3>A blank canvas.</h3><p>Upload your first creative to begin building the grid.</p><button className="primary" onClick={openNew}><Plus size={16}/> Add your first post</button></div>:<div className="feedGrid">{posts.map(p=><article key={p.id} className="feedTile" draggable onDragStart={()=>setDragged(p.id)} onDragOver={e=>e.preventDefault()} onDrop={()=>reorder(p.id)} onClick={()=>openEdit(p)}><img src={p.image_url} alt={p.title}/><div className="tileOverlay"><b>{p.title}</b><span>{p.publish_date||"No date"} · {p.format}</span></div>{p.format==="Reel"&&<span className="formatIcon">▶</span>}{p.format==="Carousel"&&<span className="formatIcon">▤</span>}</article>)}</div>}</>}
          {view==="calendar"&&<><div className="sectionHead"><div><p className="eyebrow">PUBLISHING RHYTHM</p><h2>Monthly overview</h2></div><input className="monthInput" type="month" value={month} onChange={e=>setMonth(e.target.value)}/></div><div className="calendar"><div className="weekdays">{["SUN","MON","TUE","WED","THU","FRI","SAT"].map((d,i)=><span key={i}>{d}</span>)}</div><div className="calendarGrid">{Array.from({length:offset},(_,i)=><div key={"e"+i}/>)}{Array.from({length:days},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,"0")}`;const dayPosts=posts.filter(p=>p.publish_date===date);const dayTasks=tasks.filter(t=>t.due_date===date);return <div className="day" key={date}><b>{i+1}</b>{dayPosts.map(p=><button key={p.id} className="dayPost" onClick={()=>openEdit(p)}><img src={p.image_url}/><span>{p.title}</span></button>)}{dayTasks.map(task=><button key={task.id} type="button" onClick={()=>setView("todo")} title={`Task: ${task.title} · ${task.status}`} style={{display:"block",width:"100%",marginTop:5,padding:"5px 6px",border:0,borderLeft:`3px solid ${task.status==="Done"?"#62813B":"#4C1E2F"}`,borderRadius:3,background:task.status==="Done"?"#edf0e7":"#EFE4D2",color:"#4C1E2F",textAlign:"left",fontSize:11,lineHeight:1.3,cursor:"pointer",opacity:task.status==="Done"?0.75:1}}><span style={{display:"block",fontWeight:600,textDecoration:task.status==="Done"?"line-through":"none",overflowWrap:"anywhere"}}>{task.title}</span><span style={{display:"block",fontSize:9,marginTop:2,color:"#75665f"}}>TASK · {task.status.toUpperCase()}</span></button>)}</div>})}</div></div></>}
          {view==="todo"&&<>
            <div className="sectionHead"><div><p className="eyebrow">TEAM ORGANIZATION</p><h2>Things to get done</h2></div><button className="primary" onClick={openTask}><Plus size={16}/> Add task</button></div>
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
          {view==="library"&&<><div className="sectionHead"><div><p className="eyebrow">CREATIVE ARCHIVE</p><h2>All your content</h2></div><div className="search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search content"/></div></div><div className="libraryList">{filtered.map(p=><div className="libraryItem" key={p.id}><img src={p.image_url}/><div className="libraryInfo"><b>{p.title}</b><small>{p.publish_date||"No date"} · {p.format} · {p.location}</small></div><select value={p.status} onChange={e=>updateStatus(p,e.target.value)}>{statuses.map(s=><option key={s}>{s}</option>)}</select><button className="iconButton" onClick={()=>openEdit(p)}>Edit</button><button className="iconButton" onClick={()=>removePost(p)}>Delete</button></div>)}</div></>}
        </>}
      </div>
    </section>
    {modal&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><form className="modal" onSubmit={savePost}><div className="modalHead"><div><p className="eyebrow">CREATIVE ASSET</p><h2>{editing?"Edit content":"Add new content"}</h2></div><button type="button" className="iconButton" onClick={()=>setModal(false)}><X size={18}/></button></div><label className="uploadBox"><Upload size={22}/><b>{selectedFile?selectedFile.name:editing?"Replace image or keep current":"Choose an image"}</b><small>JPG, PNG or WebP · image preview in your feed</small><input type="file" accept="image/*" onChange={e=>setSelectedFile(e.target.files?.[0]||null)}/></label><div className="formGrid"><label>Content title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Summer in a cup"/></label><label>Publication date<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label><label>Format<select value={form.format} onChange={e=>setForm({...form,format:e.target.value})}>{["Post","Reel","Carousel","Story","Flyer"].map(x=><option key={x}>{x}</option>)}</select></label><label>Location<select value={form.location} onChange={e=>setForm({...form,location:e.target.value})}>{["Both","Pacific Beach","Point Loma"].map(x=><option key={x}>{x}</option>)}</select></label><label>Content pillar<select value={form.pillar} onChange={e=>setForm({...form,pillar:e.target.value})}>{pillars.map(x=><option key={x}>{x}</option>)}</select></label><label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{statuses.map(x=><option key={x}>{x}</option>)}</select></label></div><label>Caption / creative notes<textarea rows={3} value={form.caption} onChange={e=>setForm({...form,caption:e.target.value})} placeholder="Caption, CTA or notes for the team…"/></label><div className="modalActions"><button type="button" className="secondary" onClick={()=>setModal(false)}>Cancel</button><button className="primary" disabled={busy}>{busy?"Saving…":editing?"Save changes":"Add to studio"}</button></div></form></div>}
    {taskModal&&<div className="modalBackdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setTaskModal(false)}}><form className="modal taskModal" onSubmit={saveTask}><div className="modalHead"><div><p className="eyebrow">TEAM CHECKLIST</p><h2>Add a task</h2></div><button type="button" className="iconButton" onClick={()=>setTaskModal(false)}><X size={18}/></button></div><label>Task<input required autoFocus value={taskForm.title} onChange={e=>setTaskForm({...taskForm,title:e.target.value})} placeholder="Ex: Approve next week's content"/></label><label>Notes<textarea rows={3} value={taskForm.details} onChange={e=>setTaskForm({...taskForm,details:e.target.value})} placeholder="Add a little context for the team…"/></label><div className="formGrid"><label>Checklist / project<input value={taskForm.list_name} onChange={e=>setTaskForm({...taskForm,list_name:e.target.value})} placeholder="Ex: November content"/></label><label>Due date<input type="date" value={taskForm.due_date} onChange={e=>setTaskForm({...taskForm,due_date:e.target.value})}/></label><label>Priority<select value={taskForm.priority} onChange={e=>setTaskForm({...taskForm,priority:e.target.value as Task["priority"]})}><option>Low</option><option>Normal</option><option>High</option></select></label><label>Assigned to<input value={taskForm.assignee} onChange={e=>setTaskForm({...taskForm,assignee:e.target.value})} placeholder="Name or email (optional)"/></label></div><div className="modalActions"><button type="button" className="secondary" onClick={()=>setTaskModal(false)}>Cancel</button><button className="primary" disabled={busy}>{busy?"Saving…":"Add to checklist"}</button></div></form></div>}
    </main>
}