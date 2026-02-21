/* events.js
 - localStorage の alpha_events_v1 を読み込み、イベントページを構築
 - イベントオブジェクト: { id, title, desc, start, end, thumb (dataURL or url) }
 - 表示順: 開催中/これから（降順 start）→ 終了済み（降順 end）
*/

(function(){
  const STORAGE_KEY = 'alpha_events_v1';
  const heroImg = document.getElementById('hero-img');
  const heroSub = document.getElementById('hero-sub');
  const tocYears = document.getElementById('toc-years');
  const upcomingList = document.getElementById('upcoming-list');
  const pastList = document.getElementById('past-list');
  const pastSection = document.getElementById('past-section');
  const showPastBtn = document.getElementById('show-past');

  const modal = document.getElementById('event-modal');
  const modalOverlay = document.getElementById('modal-overlay');
  const modalClose = document.getElementById('modal-close');
  const modalThumb = document.getElementById('modal-thumb');
  const modalTitle = document.getElementById('modal-title');
  const modalDates = document.getElementById('modal-dates');
  const modalDesc = document.getElementById('modal-desc');

  function loadEvents(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return [];
      return JSON.parse(raw);
    }catch(e){ return []; }
  }

  function saveEvents(arr){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  }

  function isPast(event){
    const now = new Date();
    if(event.end){
      return new Date(event.end) < now;
    }
    // if no end, compare start
    return new Date(event.start) < now && new Date(event.start).toDateString() !== now.toDateString();
  }

  function isUpcoming(event){
    const now = new Date();
    const start = new Date(event.start);
    const end = event.end ? new Date(event.end) : null;
    if(end && end >= now) return true;
    if(start >= now) return true;
    // if start <= now <= end
    if(start <= now && (!end || end >= now)) return true;
    return false;
  }

  function buildLists(){
    const all = loadEvents();
    // sort by start desc for upcoming, end desc for past
    const upcoming = all.filter(e => !isPast(e)).sort((a,b)=> new Date(a.start) - new Date(b.start));
    const past = all.filter(e => isPast(e)).sort((a,b)=> new Date(b.end || b.start) - new Date(a.end || a.start));

    // hero: nearest upcoming (first upcoming with soonest start)
    if(upcoming.length > 0){
      const next = upcoming[0];
      heroImg.style.backgroundImage = `url('${next.thumb}')`;
      heroSub.textContent = `${next.title} — ${formatDates(next.start, next.end)}`;
    } else {
      heroImg.style.backgroundImage = `url('img/gallery-placeholder.jpg')`;
      heroSub.textContent = '直近のイベントはありません';
    }

    // build year-month TOC from all events
    buildTOC(all);

    // render upcoming
    upcomingList.innerHTML = '';
    upcoming.forEach((ev, idx)=>{
      const card = createEventCard(ev, idx, false);
      upcomingList.appendChild(card);
    });

    // render past
    pastList.innerHTML = '';
    past.forEach((ev, idx)=>{
      const card = createEventCard(ev, idx, true);
      pastList.appendChild(card);
    });

    // hide past section initially
    pastSection.setAttribute('aria-hidden','true');
    showPastBtn.textContent = '過去のイベントを表示';
  }

  function formatDates(start, end){
    const s = new Date(start);
    const sStr = `${s.getFullYear()}/${String(s.getMonth()+1).padStart(2,'0')}/${String(s.getDate()).padStart(2,'0')}`;
    if(end){
      const e = new Date(end);
      const eStr = `${e.getFullYear()}/${String(e.getMonth()+1).padStart(2,'0')}/${String(e.getDate()).padStart(2,'0')}`;
      return `${sStr} 〜 ${eStr}`;
    }
    return sStr;
  }

  function createEventCard(ev, idx, isPastFlag){
    const wrap = document.createElement('article');
    wrap.className = 'event-card';
    wrap.tabIndex = 0;

    const img = document.createElement('img');
    img.className = 'event-thumb';
    img.src = ev.thumb;
    img.alt = ev.title;

    const body = document.createElement('div');
    body.className = 'event-body';
    const title = document.createElement('h3');
    title.className = 'event-title';
    title.textContent = ev.title;
    const dates = document.createElement('div');
    dates.className = 'event-dates';
    dates.textContent = formatDates(ev.start, ev.end);
    const desc = document.createElement('p');
    desc.className = 'event-desc';
    desc.textContent = ev.desc || '';

    body.appendChild(title);
    body.appendChild(dates);
    body.appendChild(desc);

    wrap.appendChild(img);
    wrap.appendChild(body);

    wrap.addEventListener('click', ()=> openModal(ev));
    wrap.addEventListener('keypress', (e)=> { if(e.key === 'Enter') openModal(ev); });

    return wrap;
  }

  function buildTOC(all){
    // collect year-month keys
    const keys = new Set();
    all.forEach(ev=>{
      const d = new Date(ev.start);
      if(isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      keys.add(key);
    });
    const sorted = Array.from(keys).sort((a,b)=> b.localeCompare(a));
    tocYears.innerHTML = '';
    sorted.forEach(k=>{
      const [y,m] = k.split('-');
      const btn = document.createElement('button');
      btn.className = 'toc-year';
      btn.textContent = `${y}年 ${Number(m)}月`;
      btn.addEventListener('click', ()=> {
        // scroll to first event in that month if exists
        const allCards = document.querySelectorAll('.event-card');
        for(const card of allCards){
          const dateText = card.querySelector('.event-dates')?.textContent || '';
          if(dateText.includes(`${y}/${String(m).padStart(2,'0')}`) || dateText.includes(`${y}/${Number(m)}`)){
            card.scrollIntoView({behavior:'smooth', block:'start'});
            break;
          }
        }
      });
      tocYears.appendChild(btn);
    });
  }

  /* ---------- modal ---------- */
  function openModal(ev){
    modalThumb.src = ev.thumb;
    modalTitle.textContent = ev.title;
    modalDates.textContent = formatDates(ev.start, ev.end);
    modalDesc.textContent = ev.desc || '';
    modal.setAttribute('aria-hidden','false');
  }
  function closeModal(){
    modal.setAttribute('aria-hidden','true');
    modalThumb.src = '';
  }
  modalOverlay.addEventListener('click', closeModal);
  modalClose.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e)=> { if(e.key === 'Escape') closeModal(); });

  /* ---------- show past toggle ---------- */
  showPastBtn.addEventListener('click', ()=>{
    const hidden = pastSection.getAttribute('aria-hidden') === 'true';
    if(hidden){
      pastSection.setAttribute('aria-hidden','false');
      showPastBtn.textContent = '過去のイベントを非表示';
    } else {
      pastSection.setAttribute('aria-hidden','true');
      showPastBtn.textContent = '過去のイベントを表示';
    }
  });

  // initial build
  buildLists();

  // listen to storage changes (admin updates)
  window.addEventListener('storage', (e)=>{
    if(e.key === STORAGE_KEY) buildLists();
  });

})();
