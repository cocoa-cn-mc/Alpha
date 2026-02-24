/* events-admin.js
 - 管理画面スクリプト（イベントの追加・削除・一覧）
 - イベントオブジェクト: { id, title, desc, start, end, thumb }
 - 画像は圧縮して dataURL に保存
 - 保存先：GitHubストレージ
*/

(function(){
  const STORAGE_KEY = 'alpha_events_v1';

  // DOM
  const filesInput = document.getElementById('evt-files');
  const titleInput = document.getElementById('evt-title');
  const startInput = document.getElementById('evt-start');
  const endInput = document.getElementById('evt-end');
  const descInput = document.getElementById('evt-desc');
  const addBtn = document.getElementById('evt-add');
  const clearBtn = document.getElementById('evt-clear');
  const adminEvents = document.getElementById('admin-events');

  // preview modal
  const adminPreview = document.getElementById('admin-preview');
  const adminPreviewOverlay = document.getElementById('admin-preview-overlay');
  const adminPreviewClose = document.getElementById('admin-preview-close');
  const adminPreviewImg = document.getElementById('admin-preview-img');
  const adminPreviewMeta = document.getElementById('admin-preview-meta');
  const adminPreviewDelete = document.getElementById('admin-preview-delete');

  // util load/save
  async function loadEvents(){
    try{
      const data = await githubStorageAPI.getJSON(STORAGE_KEY);
      return data || [];
    }catch(e){ return []; }
  }
  async function saveEvents(arr){
    const result = await githubStorageAPI.setJSON(STORAGE_KEY, arr);
    if (!result) {
      console.error('GitHubストレージへの保存に失敗しました');
    }
  }

  // image compression (reuse)
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

  // render admin list
  async function renderAdminList(){
    const events = (await loadEvents()).slice().reverse();
    adminEvents.innerHTML = '';
    if(events.length === 0){
      adminEvents.textContent = 'イベントはまだ登録されていません。';
      return;
    }
    events.forEach((ev, idx)=>{
      const wrap = document.createElement('div');
      wrap.className = 'admin-event';

      const img = document.createElement('img');
      img.src = ev.thumb;
      img.alt = ev.title;

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `<h4>${ev.title}</h4><p>${ev.start}${ev.end ? ' 〜 ' + ev.end : ''}</p><p>${ev.desc || ''}</p>`;

      const actions = document.createElement('div');
      actions.style.display='flex';
      actions.style.flexDirection='column';
      actions.style.gap='6px';

      const previewBtn = document.createElement('button');
      previewBtn.className = 'btn ghost';
      previewBtn.textContent = 'プレビュー';
      previewBtn.addEventListener('click', ()=> openAdminPreview(ev));

      const delBtn = document.createElement('button');
      delBtn.className = 'btn';
      delBtn.textContent = '削除';
      delBtn.addEventListener('click', async ()=>{
        if(!confirm('このイベントを削除しますか？')) return;
        const all = await loadEvents();
        const realIdx = all.findIndex(x => x.id === ev.id);
        if(realIdx !== -1){
          all.splice(realIdx,1);
          await saveEvents(all);
          await renderAdminList();
          alert('削除しました');
        }
      });

      actions.appendChild(previewBtn);
      actions.appendChild(delBtn);

      wrap.appendChild(img);
      wrap.appendChild(meta);
      wrap.appendChild(actions);

      adminEvents.appendChild(wrap);
    });
  }

  // preview handlers
  function openAdminPreview(ev){
    adminPreviewImg.src = ev.thumb;
    adminPreviewMeta.textContent = `${ev.title} — ${ev.start}${ev.end ? ' 〜 ' + ev.end : ''}\n${ev.desc || ''}`;
    adminPreview.setAttribute('aria-hidden','false');
  }
  function closeAdminPreview(){ adminPreview.setAttribute('aria-hidden','true'); adminPreviewImg.src = ''; }
  adminPreviewOverlay.addEventListener('click', closeAdminPreview);
  adminPreviewClose.addEventListener('click', closeAdminPreview);

  adminPreviewDelete.addEventListener('click', async ()=>{
    const metaText = adminPreviewMeta.textContent || '';
    const title = metaText.split('—')[0]?.trim();
    if(!confirm('プレビュー中のイベントを削除しますか？')) return;
    let all = await loadEvents();
    const idx = all.findIndex(it => it.title === title);
    if(idx !== -1){
      all.splice(idx,1);
      await saveEvents(all);
      await renderAdminList();
      closeAdminPreview();
      alert('削除しました');
    }
  });

  // add event
  addBtn.addEventListener('click', async ()=>{
    const files = Array.from(filesInput.files || []);
    const title = titleInput.value.trim();
    const start = startInput.value;
    const end = endInput.value;
    const desc = descInput.value.trim();

    if(!title){ alert('タイトルを入力してください'); return; }
    if(!start){ alert('開始日を入力してください'); return; }
    if(files.length === 0){ alert('サムネイル画像を1枚以上選択してください'); return; }

    const all = await loadEvents();

    // compress first file as main thumb; if multiple files, ignore extras for now (could be gallery)
    try{
      const compressed = await imageFileToCompressedDataURL(files[0], 1600, 0.7);
      const id = 'evt-' + Date.now();
      const ev = { id, title, desc, start, end: end || null, thumb: compressed };
      all.push(ev);
      await saveEvents(all);
      // reset form
      filesInput.value = '';
      titleInput.value = '';
      startInput.value = '';
      endInput.value = '';
      descInput.value = '';
      await renderAdminList();
      alert('イベントを追加しました（GitHubストレージ保存）');
    }catch(e){
      console.error(e);
      alert('画像処理に失敗しました');
    }
  });

  // clear all
  clearBtn.addEventListener('click', async ()=>{
    if(!confirm('GitHubストレージに保存されたイベントをすべて削除しますか？')) return;
    await githubStorageAPI.removeItem(STORAGE_KEY);
    await renderAdminList();
    alert('初期化しました');
  });

  // init
  renderAdminList();

  // storage sync
  window.addEventListener('storage', async (e)=>{
    if(e.key === STORAGE_KEY) await renderAdminList();
  });

})();
