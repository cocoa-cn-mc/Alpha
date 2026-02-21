// js/api.js
// データはリポジトリ内の /data/*.json を参照
export async function fetchEvents(){
  try{
    const res = await fetch('/data/events.json', {cache: "no-store"});
    if(!res.ok) throw new Error('events fetch failed');
    return await res.json();
  }catch(e){
    console.error(e);
    return [];
  }
}

export async function fetchGallery(){
  try{
    const res = await fetch('/data/gallery.json', {cache: "no-store"});
    if(!res.ok) throw new Error('gallery fetch failed');
    return await res.json();
  }catch(e){
    console.error(e);
    return [];
  }
}
