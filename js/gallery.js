/* gallery.js
 - 管理画面で保存した画像(GitHubストレージ)を読み込み、月ごとに表示
 - 画像クリックでモーダル拡大表示（前後移動・閉じる・Esc対応）
*/

(function(){
  const HERO_INTERVAL = 5000; // ms
  const heroEl = document.getElementById('hero-rotator');
  const galleryListEl = document.getElementById('gallery-list');
  const tocListEl = document.getElementById('toc-list');

  const STORAGE_ITEMS = 'alpha_gallery_items_v1';
  const PLACEHOLDER = 'img/gallery-placeholder.jpg';

  // モーダル要素
  const modal = document.getElementById('img-modal');
  const modalImg = document.getElementById('modal-img');
  const modalDesc = document.getElementById('modal-desc');
  const modalOverlay = document.getElementById('modal-overlay');
  const modalClose = document.getElementById('modal-close');
  const modalPrev = document.getElementById('modal-prev');
  const modalNext = document.getElementById('modal-next');

  let currentItems = []; // 表示中の全アイテム（ソート済）
  let currentIndex = -1;

  async function loadSaved(){
    try{
      const data = await githubStorageAPI.getJSON(STORAGE_ITEMS);
      return data || [];
    }catch(e){ return []; }
  }

  async function getAllItems(){
    const saved = await loadSaved();
    saved.sort((a,b)=> new Date(b.date) - new Date(a.date));
    return saved;
  }

  function buildHeroList(items){
    const srcs = items.map(i=>i.src);
    return [...new Set(srcs)];
  }

  let heroIntervalId = null;
  async function startHeroRotation(srcs){
    if(!heroEl) return;
    if(heroIntervalId) clearInterval(heroIntervalId);
    if(!srcs || srcs.length===0){
      heroEl.style.backgroundImage = `url('${PLACEHOLDER}')`;
      return;
    }
    let idx = Math.floor(Math.random()*srcs.length);
    heroEl.style.backgroundImage = `url('${srcs[idx]}')`;
    heroIntervalId = setInterval(()=>{
      idx = (idx+1)%srcs.length;
      heroEl.style.backgroundImage = `url('${srcs[idx]}')`;
    }, HERO_INTERVAL);
  }

  function groupByMonth(items){
    const groups = {};
    items.forEach(item=>{
      const d = new Date(item.date);
      if(isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if(!groups[key]) groups[key]=[];
      groups[key].push(item);
    });
    const keys = Object.keys(groups).sort((a,b)=> b.localeCompare(a));
    return { keys, groups };
  }

  function renderTOC(keys){
    if(!tocListEl) return;
    tocListEl.innerHTML='';
    keys.forEach(k=>{
      const [y,m] = k.split('-');
      const btn = document.createElement('button');
      btn.className='toc-item';
      btn.textContent = `${y}年 ${Number(m)}月`;
      btn.addEventListener('click', ()=> {
        const el = document.getElementById(`month-${k}`);
        if(el) el.scrollIntoView({behavior:'smooth', block:'start'});
      });
      tocListEl.appendChild(btn);
    });
  }

  async function renderGallery(){
    const items = await getAllItems();
    currentItems = items.slice(); // 保存
    const { keys, groups } = groupByMonth(items);
    renderTOC(keys);
    if(!galleryListEl) return;
    galleryListEl.innerHTML='';

    if(keys.length===0){
      const p = document.createElement('p');
      p.textContent = 'まだ画像が登録されていません。管理画面から追加してください。';
      galleryListEl.appendChild(p);
    } else {
      keys.forEach(k=>{
        const section = document.createElement('section');
        section.className='month-section';
        section.id = `month-${k}`;

        const header = document.createElement('div');
        header.className='month-header';
        const [y,m] = k.split('-');
        const title = document.createElement('div');
        title.className='month-title';
        title.textContent = `${y}年 ${Number(m)}月`;
        header.appendChild(title);

        section.appendChild(header);

        const grid = document.createElement('div');
        grid.className='month-grid';

        groups[k].forEach((item, idxInGroup)=>{
          const card = document.createElement('article');
          card.className='gallery-card';
          card.tabIndex = 0;
          // store global index for modal navigation
          const globalIndex = items.indexOf(item);

          const img = document.createElement('img');
          img.src = item.src;
          img.alt = item.desc || `${y}/${m} の画像`;
          img.loading = 'lazy';
          img.dataset.index = globalIndex;

          const desc = document.createElement('div');
          desc.className='card-desc';
          desc.textContent = item.desc || '';

          card.appendChild(img);
          card.appendChild(desc);

          // クリックでモーダルを開く
          card.addEventListener('click', ()=> openModal(globalIndex));
          card.addEventListener('keypress', (e)=> { if(e.key === 'Enter') openModal(globalIndex); });

          grid.appendChild(card);
        });

        section.appendChild(grid);
        galleryListEl.appendChild(section);
      });
    }

    const heroSrcs = buildHeroList(items);
    await startHeroRotation(heroSrcs);
  }

  /* ---------- モーダル制御 ---------- */

  function openModal(index){
    if(!currentItems || index < 0 || index >= currentItems.length) return;
    currentIndex = index;
    const item = currentItems[currentIndex];
    modalImg.src = item.src;
    modalImg.alt = item.desc || '';
    modalDesc.textContent = item.desc || '';
    modal.setAttribute('aria-hidden','false');
    // focus for accessibility
    modalClose.focus();
    document.body.style.overflow = 'hidden'; // 背景スクロール防止
  }

  function closeModal(){
    modal.setAttribute('aria-hidden','true');
    modalImg.src = '';
    modalDesc.textContent = '';
    currentIndex = -1;
    document.body.style.overflow = ''; // restore
  }

  function showPrev(){
    if(currentIndex <= 0) return;
    openModal(currentIndex - 1);
  }
  function showNext(){
    if(currentIndex >= currentItems.length - 1) return;
    openModal(currentIndex + 1);
  }

  // overlay click closes modal
  modalOverlay.addEventListener('click', closeModal);
  modalClose.addEventListener('click', closeModal);
  modalPrev.addEventListener('click', showPrev);
  modalNext.addEventListener('click', showNext);

  // keyboard navigation
  document.addEventListener('keydown', (e)=>{
    if(modal.getAttribute('aria-hidden') === 'false'){
      if(e.key === 'Escape') closeModal();
      if(e.key === 'ArrowLeft') showPrev();
      if(e.key === 'ArrowRight') showNext();
    }
  });

  // touch swipe support (simple)
  (function addSwipe(){
    let startX = 0;
    let startY = 0;
    let isTouching = false;
    modalImg.addEventListener('touchstart', (e)=>{
      if(!e.touches || e.touches.length === 0) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isTouching = true;
    }, {passive:true});
    modalImg.addEventListener('touchmove', (e)=>{
      if(!isTouching) return;
      // prevent default to avoid page scroll while swiping image
      // but keep passive to avoid warnings; we won't call preventDefault here
    }, {passive:true});
    modalImg.addEventListener('touchend', (e)=>{
      if(!isTouching) return;
      const endX = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX : startX;
      const dx = endX - startX;
      if(Math.abs(dx) > 40){
        if(dx > 0) showPrev(); else showNext();
      }
      isTouching = false;
    }, {passive:true});
  })();

  // 初期レンダリング
  renderGallery();

  // 外部からの更新（管理画面）に対応
  window.alphaGalleryRefresh = function(){
    renderGallery();
  };

  // storage イベントで他タブの変更を反映
  window.addEventListener('storage', async (e)=>{
    if(e.key === STORAGE_ITEMS) await renderGallery();
  });

})();
