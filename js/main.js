// js/main.js
import { fetchEvents, fetchGallery } from './api.js';

document.addEventListener('DOMContentLoaded', async () => {
  const events = await fetchEvents();
  const eventsList = document.getElementById('events-list');
  if(eventsList){
    events.slice(0,3).forEach(ev => {
      const card = document.createElement('div');
      card.className = 'event-card';
      card.innerHTML = `<h4>${escapeHtml(ev.title)}</h4><p class="muted">${escapeHtml(ev.date)}</p><p>${escapeHtml(ev.summary||'')}</p><a class="btn" href="events.html">詳細はこちら</a>`;
      eventsList.appendChild(card);
    });
  }

  const gallery = await fetchGallery();
  const slideshow = document.getElementById('slideshow');
  if(slideshow){
    const pics = gallery.slice(0,5);
    pics.forEach((g,i) => {
      const img = document.createElement('img');
      img.src = g.url;
      img.alt = g.caption || '';
      if(i===0) img.classList.add('active');
      slideshow.appendChild(img);
    });
    let idx = 0;
    setInterval(() => {
      const imgs = slideshow.querySelectorAll('img');
      if(!imgs.length) return;
      imgs[idx].classList.remove('active');
      idx = (idx + 1) % imgs.length;
      imgs[idx].classList.add('active');
    }, 4000);
    slideshow.addEventListener('click', () => location.href = 'gallery.html');
  }
});

function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
