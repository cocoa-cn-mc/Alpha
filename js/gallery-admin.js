/* gallery-admin.js - 管理画面用スクリプト（全文）
 - 機能：
   ・複数ファイル追加（クライアント圧縮して保存）
   ・検索・年/月フィルタ・ソート
   ・グリッド/リスト表示切替、サムネサイズ調整
   ・一括選択/反転/削除、個別削除（プレビューから）
   ・ページネーション（読み込み）で大量画像に対応
 - 保存：GitHubストレージ (キー: alpha_gallery_items_v1)
*/

(function(){
  const STORAGE_KEY = 'alpha_gallery_items_v1';
  const PAGE_SIZE = 24; // 一度にレンダリングする件数（負荷対策）

  // DOM
  const fileInput = document.getElementById('img-file');
  const dateInput = document.getElementById('img-date');
  const descInput = document.getElementById('img-desc');
  const addBtn = document.getElementById('add-btn');
  const clearBtn = document.getElementById('clear-btn');

  const searchInput = document.getElementById('search-input');
  const yearFilter = document.getElementById('year-filter');
  const monthFilter = document.getElementById('month-filter');
  const sortSelect = document.getElementById('sort-select');

  const gridViewBtn = document.getElementById('grid-view');
  const listViewBtn = document.getElementById('list-view');
  const thumbSizeInput = document.getElementById('thumb-size');
  const thumbSizeVal = document.getElementById('thumb-size-val');

  const selectAllBtn = document.getElementById('select-all');
  const invertSelectBtn = document.getElementById('invert-select');
  const deleteSelectedBtn = document.getElementById('delete-selected');

  const adminGallery = document.getElementById('admin-gallery');
  const loadMoreBtn = document.getElementById('load-more');

  // preview modal
  const previewModal = document.getElementById('preview-modal');
  const previewOverlay = document.getElementById('preview-overlay');
  const previewClose = document.getElementById('preview-close');
  const previewImg = document.getElementById('preview-img');
  const previewMeta = document.getElementById('preview-meta');
  const previewDelete = document.getElementById('preview-delete');
  const previewDownload = document.getElementById('preview-download');

  // state
  let items = []; // 全アイテム（ソート済）
  let filtered = []; // フィルタ後の配列
  let renderedCount = 0; // ページネーション用
  let selectedSet = new Set(); // 選択中の src (dataURL or url)
  let currentPreviewIndex = -1;

  /* ---------- util: load/save ---------- */
  async function loadSaved(){
    try{
      const data = await githubStorageAPI.getJSON(STORAGE_KEY);
      return data || [];
    }catch(e){ return []; }
  }
  async function saveSaved(arr){
    const result = await githubStorageAPI.setJSON(STORAGE_KEY, arr);
    if (!result) {
      console.error('GitHubストレージへの保存に失敗しました');
    }
  }

  /* ---------- 画像圧縮ユーティリティ ---------- */
  // 画像を指定幅にリサイズして dataURL を返す（JPEG品質）
  async function imageFileToCompressedDataURL(file, maxWidth = 1600, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => {
          try {
            const ratio = img.width / img.height || 1;
            let targetW = img.width;
            let targetH = img.height;
            if (img.width > maxWidth) {
              targetW = maxWidth;
              targetH = Math.round(maxWidth / ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            // 背景を白にして透過PNGをJPEGに変換する際の黒化を防ぐ
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(dataUrl);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('画像読み込み失敗'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('ファイル読み込み失敗'));
      reader.readAsDataURL(file);
    });
  }

  // フォールバック：ファイルをそのまま dataURL に変換
  function fileToDataURL(file){
    return new Promise((res, rej)=>{
      const reader = new FileReader();
      reader.onload = ()=> res(reader.result);
      reader.onerror = ()=> rej(new Error('読み込み失敗'));
      reader.readAsDataURL(file);
    });
  }

  /* ---------- 初期読み込み ---------- */
  async function init(){
    items = await loadSaved();
    items = items.map(it => ({ src: it.src, date: it.date || new Date().toISOString().slice(0,10), desc: it.desc || '' }));
    // default sort: new
    items.sort((a,b)=> new Date(b.date) - new Date(a.date));
    populateYearMonthFilters();
    // default view mode
    if(!adminGallery.classList.contains('grid-mode') && !adminGallery.classList.contains('list-mode')){
      adminGallery.classList.add('grid-mode');
      gridViewBtn.classList.add('active');
    }
    thumbSizeVal.textContent = thumbSizeInput.value + 'px';
    applyFiltersAndRender(true);
  }

  /* ---------- 年月フィルタの選択肢を作る ---------- */
  function populateYearMonthFilters(){
    const years = new Set();
    items.forEach(it=>{
      const d = new Date(it.date);
      if(!isNaN(d)) years.add(d.getFullYear());
    });
    yearFilter.innerHTML = '<option value="">すべての年</option>';
    Array.from(years).sort((a,b)=> b-a).forEach(y=>{
      const opt = document.createElement('option'); opt.value = y; opt.textContent = `${y}年`;
      yearFilter.appendChild(opt);
    });
    monthFilter.innerHTML = '<option value="">すべての月</option>';
    for(let m=1;m<=12;m++){
      const opt = document.createElement('option'); opt.value = String(m).padStart(2,'0'); opt.textContent = `${m}月`;
      monthFilter.appendChild(opt);
    }
  }

  /* ---------- フィルタ・ソート適用して描画準備 ---------- */
  function applyFiltersAndRender(resetRenderCount){
    items = loadSaved();
    items.sort((a,b)=> {
      if(sortSelect.value === 'old') return new Date(a.date) - new Date(b.date);
      return new Date(b.date) - new Date(a.date);
    });

    const q = (searchInput.value || '').trim().toLowerCase();
    const year = yearFilter.value;
    const month = monthFilter.value;

    filtered = items.filter(it=>{
      if(q && !(it.desc || '').toLowerCase().includes(q)) return false;
      if(year){
        const d = new Date(it.date);
        if(isNaN(d) || String(d.getFullYear()) !== year) return false;
      }
      if(month){
        const d = new Date(it.date);
        if(isNaN(d) || String(d.getMonth()+1).padStart(2,'0') !== month) return false;
      }
      return true;
    });

    if(resetRenderCount) renderedCount = 0;
    renderNextPage();
  }

  /* ---------- レンダリング（ページネーション） ---------- */
  function renderNextPage(){
    const start = renderedCount;
    const end = Math.min(renderedCount + PAGE_SIZE, filtered.length);
    if(start >= end){
      if(renderedCount === 0) adminGallery.innerHTML = '<div class="note">表示する画像がありません。</div>';
      loadMoreBtn.style.display = 'none';
      return;
    }
    if(start === 0) adminGallery.innerHTML = '';

    for(let i=start;i<end;i++){
      const it = filtered[i];
      const card = createThumbCard(it, i);
      adminGallery.appendChild(card);
    }
    renderedCount = end;
    loadMoreBtn.style.display = (renderedCount < filtered.length) ? 'block' : 'none';
    // 更新後にチェック状態を反映
    refreshVisibleCheckboxes();
  }

  /* ---------- サムネカード作成 ---------- */
  function createThumbCard(item, globalIndex){
    const wrapper = document.createElement('div');
    wrapper.className = adminGallery.classList.contains('grid-mode') ? 'thumb-card' : 'list-row';
    wrapper.dataset.index = globalIndex;

    // checkbox
    const chkWrap = document.createElement('div');
    chkWrap.className = 'thumb-select';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.dataset.src = item.src;
    chk.checked = selectedSet.has(item.src);
    chk.addEventListener('change', (e)=>{
      if(e.target.checked) selectedSet.add(item.src); else selectedSet.delete(item.src);
    });
    chkWrap.appendChild(chk);
    wrapper.appendChild(chkWrap);

    // image
    const img = document.createElement('img');
    img.className = 'thumb-img';
    img.src = item.src;
    img.alt = item.desc || '';
    img.style.height = thumbSizeInput.value + 'px';
    img.loading = 'lazy';

    // meta
    const meta = document.createElement('div');
    meta.className = 'thumb-meta';
    const desc = document.createElement('div');
    desc.className = 'desc';
    desc.textContent = item.desc || '';
    const date = document.createElement('div');
    date.className = 'date';
    date.textContent = item.date || '';

    meta.appendChild(desc);
    meta.appendChild(date);

    // click to preview (avoid checkbox clicks)
    wrapper.addEventListener('click', (e)=>{
      if(e.target.tagName.toLowerCase() === 'input') return;
      openPreview(globalIndex);
    });

    if(adminGallery.classList.contains('grid-mode')){
      wrapper.appendChild(img);
      wrapper.appendChild(meta);
    } else {
      const left = document.createElement('div'); left.style.flex='0 0 auto'; left.appendChild(img);
      const right = document.createElement('div'); right.style.flex='1'; right.appendChild(meta);
      wrapper.appendChild(left);
      wrapper.appendChild(right);
    }

    return wrapper;
  }

  /* ---------- プレビュー（モーダル） ---------- */
  function openPreview(globalIndex){
    currentPreviewIndex = globalIndex;
    const item = filtered[globalIndex];
    if(!item) return;
    previewImg.src = item.src;
    previewMeta.textContent = `${item.date} — ${item.desc || ''}`;
    previewModal.setAttribute('aria-hidden','false');
    previewClose.focus();
  }
  function closePreview(){
    previewModal.setAttribute('aria-hidden','true');
    previewImg.src = '';
    currentPreviewIndex = -1;
  }
  previewOverlay.addEventListener('click', closePreview);
  previewClose.addEventListener('click', closePreview);

  // preview delete
  previewDelete.addEventListener('click', ()=>{
    if(currentPreviewIndex < 0) return;
    const item = filtered[currentPreviewIndex];
    if(!confirm('この画像を完全に削除しますか？')) return;
    let all = loadSaved();
    const idx = all.findIndex(it => it.src === item.src && it.date === item.date);
    if(idx !== -1){
      all.splice(idx,1);
      saveSaved(all);
      applyFiltersAndRender(true);
      closePreview();
      alert('削除しました');
    }
  });

  // preview download
  previewDownload.addEventListener('click', ()=>{
    if(currentPreviewIndex < 0) return;
    const item = filtered[currentPreviewIndex];
    const a = document.createElement('a');
    a.href = item.src;
    a.download = `gallery-${item.date || 'img'}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  /* ---------- 一括操作 ---------- */
  selectAllBtn.addEventListener('click', ()=>{
    filtered.forEach(it => selectedSet.add(it.src));
    refreshVisibleCheckboxes();
  });
  invertSelectBtn.addEventListener('click', ()=>{
    filtered.forEach(it => {
      if(selectedSet.has(it.src)) selectedSet.delete(it.src);
      else selectedSet.add(it.src);
    });
    refreshVisibleCheckboxes();
  });
  deleteSelectedBtn.addEventListener('click', ()=>{
    if(selectedSet.size === 0){ alert('選択された画像がありません'); return; }
    if(!confirm('選択された画像をすべて削除しますか？')) return;
    let all = loadSaved();
    all = all.filter(it => !selectedSet.has(it.src));
    saveSaved(all);
    selectedSet.clear();
    applyFiltersAndRender(true);
    alert('選択画像を削除しました');
  });

  function refreshVisibleCheckboxes(){
    adminGallery.querySelectorAll('input[type="checkbox"]').forEach(chk=>{
      chk.checked = selectedSet.has(chk.dataset.src);
    });
  }

  /* ---------- サムネサイズ調整 ---------- */
  thumbSizeInput.addEventListener('input', ()=>{
    thumbSizeVal.textContent = thumbSizeInput.value + 'px';
    adminGallery.querySelectorAll('.thumb-img').forEach(img=>{
      img.style.height = thumbSizeInput.value + 'px';
    });
  });

  /* ---------- 表示モード切替 ---------- */
  gridViewBtn.addEventListener('click', ()=>{
    adminGallery.classList.remove('list-mode');
    adminGallery.classList.add('grid-mode');
    gridViewBtn.classList.add('active');
    listViewBtn.classList.remove('active');
    applyFiltersAndRender(true);
  });
  listViewBtn.addEventListener('click', ()=>{
    adminGallery.classList.remove('grid-mode');
    adminGallery.classList.add('list-mode');
    listViewBtn.classList.add('active');
    gridViewBtn.classList.remove('active');
    applyFiltersAndRender(true);
  });

  /* ---------- 検索・フィルタ・ソートイベント ---------- */
  searchInput.addEventListener('input', ()=> applyFiltersAndRender(true));
  yearFilter.addEventListener('change', ()=> applyFiltersAndRender(true));
  monthFilter.addEventListener('change', ()=> applyFiltersAndRender(true));
  sortSelect.addEventListener('change', ()=> applyFiltersAndRender(true));

  /* ---------- 追加処理（複数ファイル対応・圧縮） ---------- */
  addBtn.addEventListener('click', async () => {
    const files = Array.from(fileInput.files || []);
    const date = dateInput.value || new Date().toISOString().slice(0,10);
    const desc = descInput.value.trim();
    if(files.length === 0){ alert('画像ファイルを選択してください'); return; }

    const arr = await loadSaved();
    // 圧縮パラメータ（必要ならUIで変更できるようにする）
    const MAX_WIDTH = 1600;   // 最大幅（px）
    const QUALITY = 0.7;      // JPEG品質（0.0〜1.0）

    // 逐次処理してブラウザ負荷を抑える
    for (const f of files) {
      try {
        const compressedDataUrl = await imageFileToCompressedDataURL(f, MAX_WIDTH, QUALITY);
        arr.push({ src: compressedDataUrl, date: date, desc: desc });
      } catch (e) {
        console.error('圧縮エラー', e);
        try {
          const fallback = await fileToDataURL(f);
          arr.push({ src: fallback, date: date, desc: desc });
        } catch (err) {
          console.error('フォールバック読み込み失敗', err);
        }
      }
    }

    saveSaved(arr);
    fileInput.value = '';
    dateInput.value = '';
    descInput.value = '';
    populateYearMonthFilters();
    applyFiltersAndRender(true);
    alert('画像を追加しました（圧縮してローカル保存）');
  });

  /* ---------- クリア（ストレージ初期化） ---------- */
  clearBtn.addEventListener('click', async ()=>{
    if(!confirm('GitHubストレージに保存されたギャラリー画像をすべて削除しますか？')) return;
    await githubStorageAPI.removeItem(STORAGE_KEY);
    selectedSet.clear();
    await init();
    alert('ストレージデータを初期化しました');
  });

  /* ---------- ページネーション読み込み ---------- */
  loadMoreBtn.addEventListener('click', ()=> renderNextPage());

  /* ---------- 初期化 ---------- */
  init();

  // storage イベントで他タブの変更を反映
  window.addEventListener('storage', (e)=>{
    if(e.key === STORAGE_KEY) init();
  });

})();
