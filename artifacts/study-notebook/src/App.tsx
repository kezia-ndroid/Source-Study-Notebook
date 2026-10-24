import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, ChevronRight, CircleHelp, Clock3,
  FilePlus2, FileText, GraduationCap, Layers, Library, LockKeyhole,
  Menu, NotebookPen, PanelLeftClose, Plus, Search, Sparkles, Tag, Trash2,
  Upload, X, BarChart3, Play, Quote,
} from 'lucide-react';

type Source = { id: string; course: string; topic: string; title: string; text: string; created: string };
type CandidateKind = 'concept'|'term'|'system'|'process'|'how-to'|'question';
type Candidate = { id: string; sourceId: string; sourcePage?: number; title: string; excerpt: string; kind: CandidateKind; interpretation: string; tags: string[]; status: 'pending'|'approved'|'rejected'; };
type StudyItem = Candidate & { learned?: boolean };
type NotebookData = { sources: Source[]; candidates: Candidate[]; progress: { sessions: number; minutes: number; reviewed: number; correct: number; mastered: string[]; daily: Record<string, number> } };

const STORAGE_KEY = 'fieldnotes-study-notebook-v2';
const bioText = `The cell membrane is a selectively permeable boundary that separates the cell from its surroundings. It is composed primarily of a phospholipid bilayer, with proteins embedded in or attached to the membrane.

In a phospholipid, the phosphate-containing head is hydrophilic, meaning it interacts with water. The fatty acid tails are hydrophobic and face inward, away from water. This arrangement forms a stable bilayer in an aqueous environment.

Small nonpolar molecules, such as oxygen and carbon dioxide, can diffuse directly through the lipid bilayer. Ions and most polar molecules do not cross the hydrophobic interior easily; many move through membrane proteins.

Diffusion is the net movement of particles from an area of higher concentration to an area of lower concentration. It is passive transport: it does not require cellular energy. Osmosis is the diffusion of water across a selectively permeable membrane.

A concentration gradient is a difference in the concentration of a substance between two regions. When a substance moves down its concentration gradient, its concentration becomes more evenly distributed.

Membrane transport is a system in which concentration gradients and membrane permeability influence particle movement.

To compare diffusion rates, place equal volumes of dye into two beakers of water at different temperatures and record the time it takes for the color to spread.

How does temperature affect the rate of diffusion?`;
const id = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;
const sentenceList = (text: string) => text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 35);
function sourceExcerpts(text:string):{excerpt:string;page?:number}[]{
  const sections=text.split(/(?=^===== PDF PAGE \d+ =====[ \t]*$)/m);
  const chunks=sections.flatMap(section=>{
    const marker=section.match(/^===== PDF PAGE (\d+) =====[ \t]*(?:\r?\n)?/);
    const page=marker?Number(marker[1]):undefined;
    const body=marker?section.slice(marker[0].length):section;
    return sentenceList(body).map(excerpt=>({excerpt,page}));
  });
  const unique=chunks.filter((chunk,index)=>chunks.findIndex(other=>other.excerpt===chunk.excerpt)===index);
  const limit=18;
  if(unique.length<=limit)return unique;
  return Array.from({length:limit},(_,index)=>unique[Math.round(index*(unique.length-1)/(limit-1))]);
}
const demoSource: Source = { id:'source-bio-1', course:'Biology', topic:'Cell transport', title:'Cell membrane & passive transport', text:bioText, created:'2025-02-12' };
const demoCandidates: Candidate[] = [
  {id:'cand-1',sourceId:demoSource.id,title:'The cell membrane',excerpt:'The cell membrane is a selectively permeable boundary that separates the cell from its surroundings.',kind:'concept',interpretation:'',tags:['cell structure','foundations'],status:'pending'},
  {id:'cand-2',sourceId:demoSource.id,title:'Phospholipid bilayer arrangement',excerpt:'In a phospholipid, the phosphate-containing head is hydrophilic, meaning it interacts with water. The fatty acid tails are hydrophobic and face inward, away from water.',kind:'concept',interpretation:'',tags:['membrane','structure'],status:'pending'},
  {id:'cand-3',sourceId:demoSource.id,title:'Diffusion through the membrane',excerpt:'Small nonpolar molecules, such as oxygen and carbon dioxide, can diffuse directly through the lipid bilayer. Ions and most polar molecules do not cross the hydrophobic interior easily; many move through membrane proteins.',kind:'system',interpretation:'',tags:['transport'],status:'pending'},
  {id:'cand-4',sourceId:demoSource.id,title:'Diffusion',excerpt:'Diffusion is the net movement of particles from an area of higher concentration to an area of lower concentration. It is passive transport: it does not require cellular energy.',kind:'term',interpretation:'',tags:['transport','definitions'],status:'approved'},
  {id:'cand-5',sourceId:demoSource.id,title:'Osmosis',excerpt:'Osmosis is the diffusion of water across a selectively permeable membrane.',kind:'term',interpretation:'',tags:['transport'],status:'approved'},
  {id:'cand-6',sourceId:demoSource.id,title:'Concentration gradient',excerpt:'A concentration gradient is a difference in the concentration of a substance between two regions.',kind:'term',interpretation:'',tags:['transport','definitions'],status:'pending'},
  {id:'cand-7',sourceId:demoSource.id,title:'Movement down a concentration gradient',excerpt:'When a substance moves down its concentration gradient, its concentration becomes more evenly distributed.',kind:'process',interpretation:'',tags:['transport','processes'],status:'pending'},
  {id:'cand-8',sourceId:demoSource.id,title:'Compare diffusion rates',excerpt:'To compare diffusion rates, place equal volumes of dye into two beakers of water at different temperatures and record the time it takes for the color to spread.',kind:'how-to',interpretation:'',tags:['transport','experiment'],status:'pending'},
  {id:'cand-9',sourceId:demoSource.id,title:'How does temperature affect the rate of diffusion?',excerpt:'How does temperature affect the rate of diffusion?',kind:'question',interpretation:'',tags:['transport','investigate'],status:'pending'},
];
function initialData(): NotebookData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as NotebookData;
      if (parsed.sources && parsed.candidates && parsed.progress) return {
        ...parsed,
        progress: { ...parsed.progress, mastered: parsed.progress.mastered || [], daily: parsed.progress.daily || {} },
      };
    }
  } catch { /* browser storage may be unavailable; retain a usable in-memory notebook */ }
  return { sources:[demoSource], candidates:demoCandidates, progress:{sessions:0,minutes:0,reviewed:0,correct:0,mastered:[],daily:{}} };
}
type Page = 'overview'|'sources'|'review'|'library'|'summaries'|'concepts'|'study'|'progress';

function App() {
  const [data,setData] = useState<NotebookData>(initialData);
  const [page,setPage] = useState<Page>('overview');
  const [sourceDetail,setSourceDetail] = useState<string|null>(null);
  const [modal,setModal] = useState(false);
  const [toast,setToast] = useState('');
  const [query,setQuery] = useState('');
  const [kindFilter,setKindFilter] = useState('all');
  const [mobileOpen,setMobileOpen] = useState(false);
  const [activeConcept,setActiveConcept] = useState('');
  const [studyMode,setStudyMode] = useState<'flashcards'|'quiz'|'session'>('quiz');
  const [studyIndex,setStudyIndex] = useState(0);
  const [flipped,setFlipped] = useState(false);
  const [quizChoice,setQuizChoice] = useState<number|null>(null);
  const [sessionActive,setSessionActive] = useState(false);
  const [sessionSeconds,setSessionSeconds] = useState(0);
  const [sessionGoal,setSessionGoal] = useState(10);

  useEffect(()=>{ try { localStorage.setItem(STORAGE_KEY,JSON.stringify(data)); } catch { notify('Browser storage is unavailable; changes will remain only for this visit.'); } },[data]);
  useEffect(()=>{ if(!toast)return; const t=window.setTimeout(()=>setToast(''),2800); return()=>window.clearTimeout(t); },[toast]);
  useEffect(()=>{ if(!sessionActive)return; const t=window.setInterval(()=>setSessionSeconds(s=>s+1),1000);return()=>window.clearInterval(t); },[sessionActive]);
  function notify(message:string){setToast(message);}
  const sourceById=(sourceId:string)=>data.sources.find(s=>s.id===sourceId);
  const pending=data.candidates.filter(c=>c.status==='pending');
  const approved=data.candidates.filter(c=>c.status==='approved');
  const filteredLibrary=useMemo(()=>approved.filter(item=>{
    const src=data.sources.find(s=>s.id===item.sourceId);
    return `${item.title} ${item.excerpt} ${item.tags.join(' ')} ${src?.course} ${src?.topic}`.toLowerCase().includes(query.toLowerCase())&&(kindFilter==='all'||item.kind===kindFilter);
  }),[approved,data.sources,query,kindFilter]);
  const sourceDetailData=sourceDetail?sourceById(sourceDetail):undefined;
  const currentStudyItems: StudyItem[]=approved;
  const currentItem=currentStudyItems.length?currentStudyItems[studyIndex%currentStudyItems.length]:undefined;
  const pageTitle:Record<Page,string>={overview:'Your notebook',sources:'Sources',review:'Review queue',library:'Approved library',summaries:'Source summaries',concepts:'Concept pages',study:'Study room',progress:'Progress'};
  const navigate=(to:Page)=>{setPage(to);setSourceDetail(null);setMobileOpen(false);setQuery('');setStudyIndex(0);setFlipped(false);setQuizChoice(null);};
  const updateCandidate=(candidateId:string,patch:Partial<Candidate>)=>setData(d=>({...d,candidates:d.candidates.map(c=>c.id===candidateId?{...c,...patch}:c)}));
  const recordReview=(candidateId:string,status:'approved'|'rejected')=>{
    setData(d=>({...d,candidates:d.candidates.map(c=>c.id===candidateId?{...c,status}:c)}));
    notify(status==='approved'?'Added to your library.':'Candidate discarded.');
  };
  const completeSession=(minutes:number)=>setData(d=>{
    const today=new Date().toISOString().slice(0,10);
    return {...d,progress:{...d.progress,sessions:d.progress.sessions+1,minutes:d.progress.minutes+minutes,daily:{...d.progress.daily,[today]:(d.progress.daily[today]||0)+minutes}}};
  });
  const markUnderstanding=(candidateId:string,understood:boolean)=>setData(d=>({
    ...d,
    progress:{...d.progress,mastered:understood?Array.from(new Set([...d.progress.mastered,candidateId])):d.progress.mastered.filter(id=>id!==candidateId)},
  }));
  const addSource=(course:string,topic:string,title:string,text:string)=>{
    const source:Source={id:id(),course:course.trim(),topic:topic.trim(),title:title.trim()||topic.trim()||'Untitled source',text:text.trim(),created:new Date().toISOString().slice(0,10)};
    const chunks=sourceExcerpts(source.text);
    const generated:Candidate[]=chunks.map(({excerpt,page})=>({id:id(),sourceId:source.id,sourcePage:page,title:makeTitle(excerpt),excerpt,kind:guessKind(excerpt),interpretation:'',tags:[source.topic.toLowerCase()].filter(Boolean),status:'pending'}));
    setData(d=>({...d,sources:[source,...d.sources],candidates:[...generated,...d.candidates]}));
    setModal(false);navigate('sources');setSourceDetail(source.id);
    notify(`${generated.length} source-backed candidates created. All are waiting for your approval.`);
  };
  const navItems:{id:Page;label:string;icon:typeof BookOpen;count?:number}[]=[
    {id:'overview',label:'Overview',icon:NotebookPen},
    {id:'sources',label:'Sources',icon:FileText},
    {id:'review',label:'Review queue',icon:Check,count:pending.length},
    {id:'library',label:'Approved library',icon:Library},
    {id:'summaries',label:'Summaries',icon:Quote},
    {id:'concepts',label:'Concept pages',icon:Layers},
    {id:'study',label:'Study room',icon:GraduationCap},
    {id:'progress',label:'Progress',icon:BarChart3},
  ];
  const nav=<><div className="brand"><div className="brand-mark">f.</div><span>Fieldnotes</span></div><div className="nav-caption">Study workspace</div><nav className="nav-list">{navItems.map(item=><button data-testid={`nav-${item.id}`} key={item.id} onClick={()=>navigate(item.id)} className={`nav-item ${page===item.id&&!sourceDetail?'active':''}`}><item.icon size={16}/><span>{item.label}</span>{item.count!==undefined&&item.count>0&&<span className="nav-count">{item.count}</span>}</button>)}</nav><div className="sidebar-foot"><div><span className="privacy-dot"/><strong>Private by design</strong></div><div>Your notes stay in this browser. Nothing is sent to a server.</div></div></>;
  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen?'open':''}`}>{nav}</aside>
    <main className="main">
      <header className="topbar"><div className="top-actions"><button className="icon-button mobile-menu" data-testid="button-mobile-menu" onClick={()=>setMobileOpen(!mobileOpen)} aria-label="Toggle navigation">{mobileOpen?<PanelLeftClose size={17}/>:<Menu size={17}/>}</button><span className="crumb">{sourceDetailData?`${sourceDetailData.course} / ${sourceDetailData.topic}`:`Study workspace / ${pageTitle[page]}`}</span></div><div className="top-actions"><span className="local-badge"><LockKeyhole size={13}/><span>Stored on this device</span></span><button className="button small primary" data-testid="button-add-source-top" onClick={()=>setModal(true)}><Plus size={14}/> Add source</button></div></header>
      <div className="content">
         {sourceDetailData ? <SourceDetail source={sourceDetailData} candidates={data.candidates.filter(c=>c.sourceId===sourceDetailData.id)} onBack={()=>setSourceDetail(null)} onInterpret={(c,v)=>updateCandidate(c.id,{interpretation:v})} onReview={()=>navigate('review')} onDelete={()=>{if(window.confirm('Delete this source and its review items?')){setData(d=>({...d,sources:d.sources.filter(s=>s.id!==sourceDetailData.id),candidates:d.candidates.filter(c=>c.sourceId!==sourceDetailData.id)}));setSourceDetail(null);notify('Source deleted.')}}}/> :
        <>
        {page==='overview'&&<Overview data={data} pending={pending} approved={approved} onNavigate={navigate} onAdd={()=>setModal(true)}/>}
        {page==='sources'&&<SourcesPage sources={data.sources} candidates={data.candidates} onAdd={()=>setModal(true)} onOpen={setSourceDetail} onDelete={s=>{if(window.confirm(`Delete “${s.title}” and its items?`)){setData(d=>({...d,sources:d.sources.filter(x=>x.id!==s.id),candidates:d.candidates.filter(c=>c.sourceId!==s.id)}));notify('Source deleted.');}}}/>}
        {page==='review'&&<ReviewPage pending={pending} sources={data.sources} approved={approved} onUpdate={updateCandidate} onReview={recordReview} onMerge={(c,target)=>{const found=data.candidates.find(i=>i.id===target);if(found){updateCandidate(found.id,{excerpt:`${found.excerpt}\n\n${c.excerpt}`,tags:Array.from(new Set([...found.tags,...c.tags]))});recordReview(c.id,'rejected');notify('Evidence merged into the selected approved item.');}}}/>}
        {page==='library'&&<LibraryPage items={filteredLibrary} query={query} setQuery={setQuery} filter={kindFilter} setFilter={setKindFilter} onUpdate={updateCandidate} onOpenSource={setSourceDetail}/>}
        {page==='summaries'&&<SummariesPage sources={data.sources} candidates={data.candidates}/>}
         {page==='concepts'&&<ConceptsPage items={approved} sources={data.sources} active={activeConcept} setActive={setActiveConcept}/>}
         {page==='study'&&<StudyPage items={currentStudyItems} mode={studyMode} setMode={m=>{setStudyMode(m);setStudyIndex(0);setFlipped(false);setQuizChoice(null);}} index={studyIndex} setIndex={i=>{setStudyIndex(i);setFlipped(false);setQuizChoice(null);}} item={currentItem} sourceName={currentItem?sourceByName(data.sources,currentItem.sourceId):''} flipped={flipped} setFlipped={setFlipped} choice={quizChoice} setChoice={setQuizChoice} onAnswer={correct=>setData(d=>({...d,progress:{...d.progress,reviewed:d.progress.reviewed+1,correct:d.progress.correct+(correct?1:0)}}))} onMark={markUnderstanding} mastered={data.progress.mastered} sessionActive={sessionActive} setSessionActive={setSessionActive} seconds={sessionSeconds} setSeconds={setSessionSeconds} goal={sessionGoal} setGoal={setSessionGoal} onNavigate={navigate} onSessionComplete={completeSession}/>}
        {page==='progress'&&<ProgressPage data={data} approvedCount={approved.length} pendingCount={pending.length}/>}
        </>}
      </div>
    </main>
    {mobileOpen&&<button className="mobile-scrim" aria-label="Close navigation" onClick={()=>setMobileOpen(false)}/>}
    {modal&&<AddSourceModal onClose={()=>setModal(false)} onAdd={addSource}/>}
    {toast&&<div className="toast" role="status" data-testid="status-toast">{toast}</div>}
  </div>;
}

function makeTitle(text:string){const clean=text.replace(/[.!?]+$/,'');return clean.length>68?`${clean.slice(0,65).trim()}…`:clean;}
const candidateKinds:{value:CandidateKind;label:string}[]=[
  {value:'concept',label:'Concept'},
  {value:'term',label:'Terminology'},
  {value:'system',label:'System'},
  {value:'process',label:'Process'},
  {value:'how-to',label:'How-to instruction'},
  {value:'question',label:'Question to investigate'},
];
function guessKind(text:string):CandidateKind{
  const value=text.trim();
  if(/\?\s*$/.test(value))return 'question';
  if(/^(how to|to \w+|first\b|next\b|then\b|finally\b|step\b|instructions?\b|procedure\b)/i.test(value)||/\b(steps?|procedure|instructions?)\b/i.test(value))return 'how-to';
  if(/\b(process|cycle|sequence|movement|flow)\b/i.test(value))return 'process';
  if(/\b(system|network)\b/i.test(value))return 'system';
  if(/\b(is the|is a|is an|refers to|means)\b/i.test(value))return 'term';
  return 'concept';
}
function Heading({eyebrow,title,subtitle,action}:{eyebrow:string;title:string;subtitle:string;action?:React.ReactNode}){return <div className="page-head"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p className="subhead">{subtitle}</p></div>{action}</div>}
function Overview({data,pending,approved,onNavigate,onAdd}:{data:NotebookData;pending:Candidate[];approved:Candidate[];onNavigate:(p:Page)=>void;onAdd:()=>void}){
  const pct=data.progress.reviewed?Math.round(data.progress.correct/data.progress.reviewed*100):0;
  return <><Heading eyebrow="Personal study system" title="Your notebook" subtitle="A quiet place to turn course material into evidence you can return to." action={<button className="button primary" data-testid="button-add-source" onClick={onAdd}><FilePlus2 size={15}/> Add source material</button>}/>
    <div className="overview-grid"><section className="panel welcome-panel"><div className="eyebrow">A note to your future self</div><h2>Study from what you actually have.</h2><p>Every review card stays connected to its original passage. Keep the source close; add your own interpretation separately.</p><button className="button" data-testid="button-open-review" onClick={()=>onNavigate('review')}>Review {pending.length} waiting <ArrowRight size={14}/></button></section>
    <section className="panel stat-panel"><div><div className="stat-label">Approved for study</div><div className="stat-number" data-testid="text-approved-count">{approved.length}</div><div className="stat-note">Items you have chosen to keep</div></div><div><div className="stat-note">{pending.length} candidates still need your review</div><div className="progress-line"><span style={{width:`${approved.length+pending.length?approved.length/(approved.length+pending.length)*100:0}%`}}/></div></div></section></div>
    <div className="section-row"><h2>Pick up where you left off</h2><button className="text-link" data-testid="link-progress" onClick={()=>onNavigate('progress')}>View progress <ChevronRight size={13} style={{verticalAlign:'middle'}}/></button></div>
    <div className="work-grid"><section className="panel work-panel"><div className="work-head"><h3>Needs a closer look</h3><span className="tiny-label">{pending.length} candidates</span></div>{pending.length?pending.slice(0,3).map(c=><div className="queue-row" key={c.id}><span className="queue-dot"/><div className="row-copy"><div className="row-title">{c.title}</div><div className="row-meta">{sourceByName(data.sources,c.sourceId)} · {c.kind}</div></div><button className="icon-button" aria-label={`Review ${c.title}`} data-testid={`button-review-item-${c.id}`} onClick={()=>onNavigate('review')}><ChevronRight size={15}/></button></div>):<div className="muted-note">Your review queue is clear. Add another source when you are ready.</div>}</section>
    <section className="panel work-panel"><div className="work-head"><h3>Recent sources</h3><button className="text-link" data-testid="link-sources" onClick={()=>onNavigate('sources')}>All sources <ChevronRight size={13}/></button></div>{data.sources.slice(0,3).map(s=><div className="source-row" key={s.id}><div className="source-symbol"><FileText size={16}/></div><div className="row-copy"><div className="row-title">{s.title}</div><div className="row-meta">{s.course} · {s.topic}</div></div><span className="tiny-label">{data.candidates.filter(c=>c.sourceId===s.id).length} items</span></div>)}</section></div>
    <p className="muted-note" style={{marginTop:23}}><LockKeyhole size={12} style={{verticalAlign:'-2px'}}/> Your notebook is saved in this browser only. There is no account, sync, or server copy.</p>
  </>;
}
function sourceByName(sources:Source[],sourceId:string){return sources.find(s=>s.id===sourceId)?.title||'Source removed';}
function SourcesPage({sources,candidates,onAdd,onOpen,onDelete}:{sources:Source[];candidates:Candidate[];onAdd:()=>void;onOpen:(id:string)=>void;onDelete:(s:Source)=>void}){
 return <><Heading eyebrow="Material & evidence" title="Sources" subtitle="Course notes and readings stay intact as the reference for every extracted review item." action={<button className="button primary" data-testid="button-add-source" onClick={onAdd}><Plus size={15}/> Add source</button>}/>{sources.length?<div className="source-list">{sources.map((s,i)=><div className="panel source-card" key={s.id} data-testid={`card-source-${s.id}`} role="button" tabIndex={0} onClick={()=>onOpen(s.id)} onKeyDown={e=>e.key==='Enter'&&onOpen(s.id)}><div className="source-symbol"><FileText size={18}/></div><div className="row-copy"><div className="tiny-label">{s.course} / {s.topic}</div><h3>{s.title}</h3><p>{s.text.slice(0,105).replace(/\s+/g,' ')}…</p></div><div className="source-stats">{candidates.filter(c=>c.sourceId===s.id).length} extracted<br/>{s.created}</div><button className="icon-button" data-testid={`button-delete-source-${s.id}`} aria-label={`Delete ${s.title}`} onClick={e=>{e.stopPropagation();onDelete(s);}}><Trash2 size={14}/></button></div>)}</div>:<Empty icon={<FilePlus2 size={18}/>} title="No sources yet" text="Add a passage from your course or import a local text file to begin building your notebook." action={<button className="button primary" data-testid="button-empty-add-source" onClick={onAdd}><Plus size={14}/> Add first source</button>}/>}</>;
}
function SourceDetail({source,candidates,onBack,onInterpret,onReview,onDelete}:{source:Source;candidates:Candidate[];onBack:()=>void;onInterpret:(c:Candidate,v:string)=>void;onReview:()=>void;onDelete:()=>void}){
 return <><button className="text-link" style={{paddingLeft:0,marginBottom:20}} data-testid="button-back-sources" onClick={onBack}><ArrowLeft size={14} style={{verticalAlign:'-3px'}}/> Back to sources</button><div className="detail-header"><div className="source-symbol"><FileText size={20}/></div><div><div className="eyebrow">{source.course} / {source.topic}</div><h1>{source.title}</h1><p className="subhead">Added {source.created} · {candidates.length} sentence-level candidates</p></div><button className="button danger small" style={{marginLeft:'auto'}} data-testid="button-delete-source-detail" onClick={onDelete}><Trash2 size={13}/> Delete</button></div>
 <section className="panel source-text" data-testid={`text-source-${source.id}`}>{source.text}</section>
 <div className="section-row"><h2>Linked review items</h2><button className="button small" data-testid="button-review-source-items" onClick={onReview}>Open review queue</button></div>
 {candidates.length?candidates.map(c=><article className="panel review-card" key={c.id}><div className="candidate-top"><span className="candidate-type">{c.kind} · {c.status}</span><span className="candidate-count">Evidence link</span></div><h3 className="candidate-title">{c.title}</h3><div className="excerpt-label">Verbatim source excerpt</div><blockquote className="excerpt">{c.excerpt}</blockquote><div className="field interpretation"><label htmlFor={`interpret-${c.id}`}>Your interpretation <span className="muted-note">(optional; not part of the source)</span></label><textarea id={`interpret-${c.id}`} data-testid={`input-interpretation-${c.id}`} value={c.interpretation} onChange={e=>onInterpret(c,e.target.value)} placeholder="Add your own explanation or connection…"/></div></article>):<Empty icon={<Quote size={18}/>} title="No review items" text="This source has no extracted candidates."/>}</>;
}
function ReviewPage({pending,sources,approved,onUpdate,onReview,onMerge}:{pending:Candidate[];sources:Source[];approved:Candidate[];onUpdate:(id:string,p:Partial<Candidate>)=>void;onReview:(id:string,status:'approved'|'rejected')=>void;onMerge:(c:Candidate,target:string)=>void}){
 const [mergeFor,setMergeFor]=useState<string>('');const [tagDraft,setTagDraft]=useState<Record<string,string>>({});
 return <><Heading eyebrow="Human review required" title="Review queue" subtitle="Sentence-level candidates are suggestions from your source, not generated explanations. Confirm, edit, or discard each one."/>
 <div className="panel" style={{padding:'13px 17px',marginBottom:18,display:'flex',gap:10,alignItems:'center'}}><Sparkles size={15} color="#876b3d"/><span className="muted-note"><strong>Transparent extraction:</strong> candidates are split from longer source sentences. No model, API, or comprehension claim is involved.</span></div>
  {pending.length?pending.map((c,index)=><article className="panel review-card" key={c.id} data-testid={`card-candidate-${c.id}`}><div className="candidate-top"><span className="candidate-type">{c.kind} · {sourceByName(sources,c.sourceId)}</span><span className="candidate-count">{index+1} / {pending.length}</span></div><div className="field"><label htmlFor={`title-${c.id}`}>Review item title</label><input id={`title-${c.id}`} data-testid={`input-title-${c.id}`} value={c.title} onChange={e=>onUpdate(c.id,{title:e.target.value})}/></div><div className="field"><label htmlFor={`kind-${c.id}`}>Item type</label><select id={`kind-${c.id}`} data-testid={`select-kind-${c.id}`} className="filter-select" value={c.kind} onChange={e=>onUpdate(c.id,{kind:e.target.value as CandidateKind})}>{candidateKinds.map(kind=><option key={kind.value} value={kind.value}>{kind.label}</option>)}</select></div><div className="excerpt-label">Exact source excerpt</div><blockquote className="excerpt" data-testid={`text-excerpt-${c.id}`}>{c.excerpt}</blockquote><div className="field interpretation"><label htmlFor={`interpretation-${c.id}`}>Your interpretation <span className="muted-note">(optional; separate from source)</span></label><textarea id={`interpretation-${c.id}`} data-testid={`input-interpretation-${c.id}`} value={c.interpretation} onChange={e=>onUpdate(c.id,{interpretation:e.target.value})} placeholder="What does this mean to you? Keep the source wording above unchanged."/></div>
 <div className="tag-row">{c.tags.map(tag=><span className="tag-chip" key={tag}>{tag}</span>)}</div><div className="toolbar"><input className="search-input" style={{maxWidth:220}} aria-label="Add a tag" data-testid={`input-tag-${c.id}`} placeholder="Add a tag…" value={tagDraft[c.id]||''} onChange={e=>setTagDraft({...tagDraft,[c.id]:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&tagDraft[c.id]?.trim()){e.preventDefault();onUpdate(c.id,{tags:[...new Set([...c.tags,tagDraft[c.id].trim()])]});setTagDraft({...tagDraft,[c.id]:''});}}}/><button className="button small" data-testid={`button-add-tag-${c.id}`} onClick={()=>{if(tagDraft[c.id]?.trim()){onUpdate(c.id,{tags:[...new Set([...c.tags,tagDraft[c.id].trim()])]});setTagDraft({...tagDraft,[c.id]:''});}}}><Tag size={13}/> Add tag</button></div>
  {approved.some(a=>a.sourceId===c.sourceId)&&<div className="toolbar"><select className="filter-select" data-testid={`select-merge-${c.id}`} value={mergeFor===c.id?(tagDraft[`merge-${c.id}`]||''):''} onChange={e=>{setMergeFor(c.id);setTagDraft({...tagDraft,[`merge-${c.id}`]:e.target.value});}}><option value="">Merge excerpt into approved item from this source…</option>{approved.filter(a=>a.sourceId===c.sourceId).map(a=><option value={a.id} key={a.id}>{a.title}</option>)}</select><button className="button small" data-testid={`button-merge-${c.id}`} disabled={!tagDraft[`merge-${c.id}`]} onClick={()=>{const target=tagDraft[`merge-${c.id}`];if(target)onMerge(c,target);}}>Merge</button></div>}
 <div className="candidate-actions"><button className="button primary" data-testid={`button-approve-${c.id}`} onClick={()=>onReview(c.id,'approved')}><Check size={14}/> Approve</button><button className="button" data-testid={`button-discard-${c.id}`} onClick={()=>onReview(c.id,'rejected')}><X size={14}/> Discard</button><span className="spacer"/><span className="muted-note">{sourceByName(sources,c.sourceId)}</span></div></article>):<Empty icon={<Check size={18}/>} title="Review queue is clear" text="All candidates have been reviewed. Add another source or study from your approved library."/>}</>;
}
 function LibraryPage({items,query,setQuery,filter,setFilter,onUpdate,onOpenSource}:{items:Candidate[];query:string;setQuery:(v:string)=>void;filter:string;setFilter:(v:string)=>void;onUpdate:(id:string,p:Partial<Candidate>)=>void;onOpenSource:(id:string)=>void}){
  return <><Heading eyebrow="Verified by you" title="Approved library" subtitle="Only items you approved appear here. Search across titles, excerpts, tags, courses, and topics."/><div className="toolbar"><div className="search-wrap"><Search size={15}/><input className="search-input" data-testid="input-library-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your library"/></div><select className="filter-select" data-testid="select-library-kind" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All item types</option>{candidateKinds.map(kind=><option key={kind.value} value={kind.value}>{kind.label}</option>)}</select><span className="tiny-label">{items.length} items</span></div>
 {items.length?<div className="library-grid">{items.map(item=><LibraryCard key={item.id} item={item} onUpdate={onUpdate} onOpenSource={onOpenSource}/>)}</div>:<Empty icon={<Search size={18}/>} title={query?'No matching items':'Your library is waiting'} text={query?'Try another title, excerpt, or tag.':'Approve evidence from the review queue to add items to your study library.'}/>}</>;
}
function LibraryCard({item,onUpdate,onOpenSource}:{item:Candidate;onUpdate:(id:string,p:Partial<Candidate>)=>void;onOpenSource:(id:string)=>void}){
 const [editing,setEditing]=useState(false);
 return <article className="panel library-card" data-testid={`card-library-${item.id}`}><div className="candidate-top"><span className="candidate-type">{item.kind}</span><button className="icon-button" data-testid={`button-edit-library-${item.id}`} aria-label="Edit item" onClick={()=>setEditing(!editing)}><NotebookPen size={14}/></button></div>{editing?<><div className="field"><label>Title</label><input data-testid={`input-library-title-${item.id}`} value={item.title} onChange={e=>onUpdate(item.id,{title:e.target.value})}/></div><div className="field"><label>Interpretation</label><textarea data-testid={`input-library-interpretation-${item.id}`} value={item.interpretation} onChange={e=>onUpdate(item.id,{interpretation:e.target.value})}/></div></>:<><h3>{item.title}</h3><div className="excerpt-label">Source excerpt</div><blockquote className="excerpt">{item.excerpt}</blockquote>{item.interpretation&&<p><strong>Your interpretation:</strong> {item.interpretation}</p>}</>}{item.tags.length>0&&<div className="tag-row">{item.tags.map(t=><span className="tag-chip" key={t}>{t}</span>)}</div>}<button className="text-link" data-testid={`button-open-source-${item.id}`} onClick={()=>onOpenSource(item.sourceId)}><Quote size={12}/> View source</button></article>;
}
function SummariesPage({sources,candidates}:{sources:Source[];candidates:Candidate[]}){
 return <><Heading eyebrow="Source-linked, extractive" title="Summaries" subtitle="A compact reading aid made only from sentences in your saved sources. This is not a comprehensive or generated summary."/><div className="panel" style={{padding:'13px 16px',marginBottom:18}}><p className="muted-note" style={{margin:0}}><strong>How this is made:</strong> sentence excerpts selected for review are grouped by source. Wording is preserved; no new claims are added.</p></div>
  {sources.length?sources.map(source=>{const excerpts=candidates.filter(c=>c.sourceId===source.id&&c.status==='approved').map(c=>c.excerpt);const unique=[...new Set(excerpts)];return <section className="panel summary-block" style={{marginBottom:13}} key={source.id} data-testid={`summary-${source.id}`}><div className="eyebrow">{source.course} / {source.topic}</div><h2>{source.title}</h2>{unique.length?<><p>{unique.join(' ')}</p><div className="source-citation">Extracted verbatim from <strong>{source.title}</strong> · {unique.length} source sentence{unique.length===1?'':'s'} · <span>Open source text to verify context.</span></div></>:<div className="muted-note">No approved source excerpts are available for this summary yet. Approve candidates from this source to include them.</div>}</section>}):<Empty icon={<Quote size={18}/>} title="No summaries yet" text="Add source material to see a source-linked collection of exact sentences here."/>}</>;
}
function ConceptsPage({items,sources,active,setActive}:{items:Candidate[];sources:Source[];active:string;setActive:(v:string)=>void}){
  const conceptItems=items.filter(item=>['concept','term','system'].includes(item.kind));
  const processItems=items.filter(item=>item.kind==='process'||item.kind==='how-to');
  const questions=items.filter(item=>item.kind==='question');
  const groups=Array.from(new Set(conceptItems.flatMap(item=>item.tags.length?item.tags:['Untagged'])));
 const selected=active||groups[0]||'';
  const groupItems=conceptItems.filter(item=>item.tags.includes(selected)||(selected==='Untagged'&&!item.tags.length));
  return <><Heading eyebrow="Browse connections" title="Concept pages" subtitle="Concepts, terms, and systems stay grouped by your tags and linked to their source excerpts."/><div className="concept-layout"><div className="panel concept-nav" data-testid="concept-navigation">{groups.length?groups.map(g=><button key={g} data-testid={`button-concept-${g.replace(/\s/g,'-')}`} className={selected===g?'active':''} onClick={()=>setActive(g)}>{g}<span className="nav-count">{conceptItems.filter(i=>i.tags.includes(g)||(g==='Untagged'&&!i.tags.length)).length}</span></button>):<div className="muted-note" style={{padding:12}}>Approve and tag items to create concept pages.</div>}</div><div className="panel concept-content">{groupItems.length?<><div className="eyebrow">Tag index</div><h2>{selected}</h2><p className="subhead">These entries share a learner-added tag; the grouping does not assert a relationship beyond that label.</p>{groupItems.map(item=><article className="divider" key={item.id}><span className="candidate-type">{candidateKinds.find(kind=>kind.value===item.kind)?.label}</span><h3>{item.title}</h3><blockquote className="excerpt">{item.excerpt}</blockquote>{item.interpretation&&<p className="muted-note"><strong>Your interpretation:</strong> {item.interpretation}</p>}<span className="tiny-label">From {sourceByName(sources,item.sourceId)}</span></article>)}</>:<Empty icon={<Layers size={18}/>} title="No tagged concepts" text="Approve and tag concepts, terminology, or systems to create pages here."/>}</div></div>
  <div className="section-row"><h2>Process & how-to guides</h2><span className="tiny-label">Exact excerpts; no steps inferred</span></div>{processItems.length?processItems.map(item=><article className="panel summary-block" key={item.id}><div className="candidate-type">{candidateKinds.find(kind=>kind.value===item.kind)?.label} · {sourceByName(sources,item.sourceId)}</div><h2 style={{marginTop:9}}>{item.title}</h2><blockquote className="excerpt">{item.excerpt}</blockquote><p className="muted-note">This guide reflects only the approved source excerpt.</p></article>):<Empty icon={<Layers size={18}/>} title="No process guides yet" text="Approve process or how-to candidates to see their source-linked excerpts here."/>}
  <div className="section-row"><h2>Questions to investigate</h2><span className="tiny-label">{questions.length} approved</span></div>{questions.length?questions.map(item=><article className="panel summary-block" key={item.id}><h3>{item.title}</h3><blockquote className="excerpt">{item.excerpt}</blockquote><span className="tiny-label">From {sourceByName(sources,item.sourceId)}</span></article>):<Empty icon={<CircleHelp size={18}/>} title="No questions yet" text="Source sentences phrased as questions will appear here after approval."/>}</>;
}
function StudyPage({items,mode,setMode,index,setIndex,item,sourceName,flipped,setFlipped,choice,setChoice,onAnswer,onMark,mastered,sessionActive,setSessionActive,seconds,setSeconds,goal,setGoal,onNavigate,onSessionComplete}:{items:Candidate[];mode:'flashcards'|'quiz'|'session';setMode:(v:'flashcards'|'quiz'|'session')=>void;index:number;setIndex:(v:number)=>void;item?:Candidate;sourceName:string;flipped:boolean;setFlipped:(v:boolean)=>void;choice:number|null;setChoice:(v:number|null)=>void;onAnswer:(correct:boolean)=>void;onMark:(id:string,understood:boolean)=>void;mastered:string[];sessionActive:boolean;setSessionActive:(v:boolean)=>void;seconds:number;setSeconds:(v:number)=>void;goal:number;setGoal:(v:number)=>void;onNavigate:(p:Page)=>void;onSessionComplete:(minutes:number)=>void}){
 const [answered,setAnswered]=useState(false);
 const options=useMemo(()=>item?[item.excerpt,...items.filter(i=>i.id!==item.id).slice(0,3).map(i=>i.excerpt)]:[],[item,items]);
 const shuffled=useMemo(()=>options.map((x,i)=>({x,i})).sort((a,b)=>a.x.length-b.x.length),[options]);
 const finishSession=()=>{const mins=Math.max(1,Math.round(seconds/60));onSessionComplete(mins);setSessionActive(false);setSeconds(0);};
 return <><Heading eyebrow="Practice, not performance" title="Study room" subtitle="Use approved evidence to recall, check, or spend a focused interval with your notebook."/>
 <div className="toolbar">{(['flashcards','quiz','session'] as const).map(m=><button key={m} data-testid={`button-mode-${m}`} className={`button ${mode===m?'soft':''}`} onClick={()=>{setMode(m);setAnswered(false);}}>{m==='flashcards'?<Layers size={14}/>:m==='quiz'?<CircleHelp size={14}/>:<Clock3 size={14}/>} {m==='flashcards'?'Flashcards':m==='quiz'?'Quick quiz':'Focus session'}</button>)}</div>
 {!items.length?<Empty icon={<BookOpen size={18}/>} title="Nothing approved to study" text="Review and approve source-backed candidates first. Your study set will be built only from your choices." action={<button className="button primary" data-testid="button-study-review" onClick={()=>onNavigate('review')}>Review queue</button>}/>:
  mode==='flashcards'?<div className="flash-layout"><div className="candidate-top"><span className="candidate-type">Flashcard</span><span className="candidate-count">{index+1} / {items.length}</span></div><div className="panel flash-card" data-testid="card-flashcard" role="button" tabIndex={0} onClick={()=>setFlipped(!flipped)} onKeyDown={e=>e.key==='Enter'&&setFlipped(!flipped)}><div className="eyebrow">{flipped?'Source answer':'Recall the idea'}</div><div className="flash-text">{flipped?item?.excerpt:item?.title}</div><div className="flip-hint">{flipped?`Verbatim excerpt · ${sourceName}`:'Select card to reveal its exact source excerpt'}</div></div>{item?.interpretation&&<p className="muted-note" style={{textAlign:'center',marginTop:12}}>Your interpretation: {item.interpretation}</p>}<div className="flash-controls"><button className="button" data-testid="button-card-prev" onClick={()=>setIndex((index-1+items.length)%items.length)}><ArrowLeft size={14}/> Previous</button><button className="button" data-testid="button-flip-card" onClick={()=>setFlipped(!flipped)}>{flipped?'Show prompt':'Reveal excerpt'}</button><button className="button primary" data-testid="button-card-next" onClick={()=>setIndex((index+1)%items.length)}>Next <ArrowRight size={14}/></button></div>{item&&<div className="panel understanding-check"><div className="stat-label">How well did you recall it?</div><div className="toolbar"><button className={`button ${!mastered.includes(item.id)?'soft':''}`} data-testid="button-mark-review" onClick={()=>onMark(item.id,false)}>Review again</button><button className={`button ${mastered.includes(item.id)?'primary':''}`} data-testid="button-mark-mastered" onClick={()=>onMark(item.id,true)}><Check size={14}/>{mastered.includes(item.id)?'Understood':'Got it'}</button></div><span className="muted-note">Your understanding marks update the local dashboard.</span></div>}</div>:
  mode==='quiz'?<div className="panel review-card" style={{maxWidth:760,margin:'0 auto'}}><div className="candidate-top"><span className="candidate-type">Source-grounded prompt</span><span className="candidate-count">{sourceName} · {index+1} / {items.length}</span></div><h2 style={{fontSize:25}}>Which exact excerpt belongs to “{item?.title}”?</h2><p className="muted-note">Choose the excerpt previously approved for this item. The correct answer appears verbatim in its linked source.</p><div className="quiz-options">{shuffled.map(option=><button key={option.i} className={`quiz-option ${choice===option.i?'selected':''} ${answered&&option.i===0?'correct':''} ${answered&&choice===option.i&&choice!==0?'wrong':''}`} data-testid={`button-quiz-option-${option.i}`} onClick={()=>{if(!answered){setChoice(option.i);}}}>{option.x}</button>)}</div>{answered&&<div className="muted-note" data-testid="text-quiz-feedback">{choice===0?'Correct — this matches the approved excerpt.':'Not this time. The highlighted answer is the approved source excerpt.'}</div>}<div className="candidate-actions"><button className="button primary" disabled={choice===null||answered} data-testid="button-check-answer" onClick={()=>{if(choice!==null){setAnswered(true);onAnswer(choice===0);}}}><Check size={14}/> Check answer</button><button className="button" data-testid="button-next-quiz" onClick={()=>{setIndex((index+1)%items.length);setChoice(null);setAnswered(false);}}>Next item <ArrowRight size={14}/></button></div></div>:
  <div className="panel review-card" style={{maxWidth:720,margin:'0 auto'}}><div className="candidate-top"><span className="candidate-type">Focused session</span><span className="status-pill">{sessionActive?'In progress':'Ready'}</span></div><h2 style={{fontSize:28}}>One thing at a time.</h2><p className="subhead">Choose a short interval, then read or review without switching tasks. Your session total is saved locally when you finish.</p>{item&&<section className="panel summary-block" style={{marginTop:20}}><div className="candidate-type">{sourceName}</div><h3 style={{marginTop:8}}>{item.title}</h3><blockquote className="excerpt">{item.excerpt}</blockquote></section>}<div className="field" style={{maxWidth:220,marginTop:24}}><label htmlFor="session-goal">Session length (minutes)</label><select id="session-goal" data-testid="select-session-goal" className="filter-select" value={goal} onChange={e=>setGoal(Number(e.target.value))} disabled={sessionActive}><option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={15}>15 minutes</option><option value={25}>25 minutes</option></select></div><div style={{font:'400 58px var(--app-font-serif)',margin:'20px 0'}} data-testid="text-session-time">{String(Math.floor(seconds/60)).padStart(2,'0')}:{String(seconds%60).padStart(2,'0')}</div><div className="progress-line"><span style={{width:`${Math.min(100,seconds/(goal*60)*100)}%`}}/></div><div className="candidate-actions" style={{marginTop:20}}>{!sessionActive?<button className="button primary" data-testid="button-start-session" onClick={()=>setSessionActive(true)}><Play size={14}/> Start session</button>:<><button className="button" data-testid="button-pause-session" onClick={()=>setSessionActive(false)}>Pause</button><button className="button primary" data-testid="button-finish-session" onClick={finishSession}>Finish & save</button></>}{seconds>=goal*60&&sessionActive&&<span className="muted-note">Goal reached. You can finish and save your session.</span>}</div><p className="muted-note" style={{marginTop:17}}>Timer runs in this tab. Finishing records at least one minute in your progress dashboard.</p></div>}
 </>;
}
function ProgressPage({data,approvedCount,pendingCount}:{data:NotebookData;approvedCount:number;pendingCount:number}){
 const recent=Array.from({length:7},(_,i)=>{const dt=new Date();dt.setDate(dt.getDate()-(6-i));const key=dt.toISOString().slice(0,10);return {key,label:dt.toLocaleDateString(undefined,{weekday:'short'}),value:data.progress.daily[key]||0};});
 const max=Math.max(10,...recent.map(d=>d.value));
 const accuracy=data.progress.reviewed?Math.round(data.progress.correct/data.progress.reviewed*100):0;
  const masteredCount=data.progress.mastered.filter(id=>data.candidates.some(c=>c.id===id&&c.status==='approved')).length;
  const understanding=approvedCount?Math.round(masteredCount/approvedCount*100):0;
  return <><Heading eyebrow="A record of your practice" title="Progress" subtitle="A local record of the work you have chosen to do. No streaks or grades—just a useful sense of momentum."/>
  <div className="dashboard-grid"><div className="panel metric"><div className="stat-label">Items understood</div><strong data-testid="text-understanding">{approvedCount?`${understanding}%`:'—'}</strong><span>{masteredCount} of {approvedCount} approved items marked “Got it”</span></div><div className="panel metric"><div className="stat-label">Focused sessions</div><strong data-testid="text-session-count">{data.progress.sessions}</strong><span>sessions completed</span></div><div className="panel metric"><div className="stat-label">Time spent</div><strong data-testid="text-minutes-count">{data.progress.minutes}</strong><span>minutes recorded</span></div><div className="panel metric"><div className="stat-label">Quiz recall</div><strong data-testid="text-accuracy">{data.progress.reviewed?`${accuracy}%`:'—'}</strong><span>{data.progress.reviewed?`${data.progress.correct} correct of ${data.progress.reviewed} checked`:'No quiz answers checked yet'}</span></div></div>
  <div className="section-row"><h2>Minutes, last seven days</h2><span className="tiny-label">stored on this device</span></div><div className="panel work-panel"><div className="bars">{recent.map(d=><div className="bar-col" key={d.key}><div className="bar" title={`${d.value} minutes`} style={{height:`${Math.max(3,d.value/max*100)}%`}}/><span className="bar-label">{d.label}</span></div>)}</div></div>
  <div className="section-row"><h2>Notebook snapshot</h2></div><div className="dashboard-grid"><div className="panel metric"><div className="stat-label">Sources saved</div><strong>{data.sources.length}</strong><span>original material items</span></div><div className="panel metric"><div className="stat-label">Approved library</div><strong>{approvedCount}</strong><span>items ready for study</span></div><div className="panel metric"><div className="stat-label">Review queue</div><strong>{pendingCount}</strong><span>candidates awaiting your decision</span></div></div></>;
}
function Empty({icon,title,text,action}:{icon:ReactNode;title:string;text:string;action?:ReactNode}){return <div className="empty-state" data-testid="empty-state"><div className="empty-mark">{icon}</div><h3>{title}</h3><p>{text}</p>{action}</div>}
function AddSourceModal({onClose,onAdd}:{onClose:()=>void;onAdd:(course:string,topic:string,title:string,text:string)=>void}){
 const [course,setCourse]=useState('');const [topic,setTopic]=useState('');const [title,setTitle]=useState('');const [text,setText]=useState('');const [fileName,setFileName]=useState('');
 const loadFile=(file?:File)=>{if(!file)return;const ext=file.name.split('.').pop()?.toLowerCase();if(!['txt','md','csv'].includes(ext||'')){setFileName('Choose a .txt, .md, or .csv file.');return;}const reader=new FileReader();reader.onload=()=>{setText(String(reader.result||''));setTitle(v=>v||file.name.replace(/\.[^.]+$/,''));setFileName(file.name);};reader.onerror=()=>setFileName('Could not read this file.');reader.readAsText(file);};
 return <div className="modal-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="add-source-heading" data-testid="dialog-add-source"><div className="modal-head"><div><div className="eyebrow">Local source material</div><h2 id="add-source-heading">Add to your notebook</h2></div><button className="icon-button" aria-label="Close" data-testid="button-close-source-modal" onClick={onClose}><X size={16}/></button></div><form onSubmit={e=>{e.preventDefault();if(course.trim()&&topic.trim()&&text.trim())onAdd(course,topic,title,text);}}><div className="toolbar" style={{alignItems:'flex-start'}}><div className="field" style={{flex:1,minWidth:150}}><label htmlFor="source-course">Course</label><input id="source-course" data-testid="input-source-course" required value={course} onChange={e=>setCourse(e.target.value)} placeholder="e.g. Biology"/></div><div className="field" style={{flex:1,minWidth:150}}><label htmlFor="source-topic">Topic</label><input id="source-topic" data-testid="input-source-topic" required value={topic} onChange={e=>setTopic(e.target.value)} placeholder="e.g. Cell transport"/></div></div><div className="field"><label htmlFor="source-title">Source title <span className="muted-note">(optional)</span></label><input id="source-title" data-testid="input-source-title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Lecture notes, chapter section…"/></div><div className="field"><label htmlFor="source-text">Paste source text</label><textarea id="source-text" data-testid="input-source-text" required value={text} onChange={e=>setText(e.target.value)} placeholder="Paste text you have permission to use. It stays in this browser." style={{minHeight:160}}/></div><label className="button small" htmlFor="source-file" data-testid="label-import-file"><Upload size={13}/> Import .txt, .md, or .csv</label><input id="source-file" data-testid="input-source-file" type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" style={{display:'none'}} onChange={e=>loadFile(e.target.files?.[0])}/>{fileName&&<p className="muted-note" data-testid="text-file-status">{fileName}</p>}<p className="muted-note" style={{marginTop:12}}>Simple local extraction splits text into sentences for your review. It does not infer facts or claim comprehensive understanding. Excerpts remain verbatim; interpretation is a separate optional field.</p><div className="divider"/><div className="toolbar" style={{justifyContent:'flex-end',marginBottom:0}}><button type="button" className="button" data-testid="button-cancel-source" onClick={onClose}>Cancel</button><button type="submit" className="button primary" data-testid="button-save-source" disabled={!course.trim()||!topic.trim()||!text.trim()}><Plus size={14}/> Save source</button></div></form></section></div>;
}
export default App;
