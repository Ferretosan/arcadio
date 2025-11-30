// Render sections and games from tag-based games.json
async function loadGames(){
  try{
    const res = await fetch('games.json');
    if(!res.ok) throw new Error('Failed to load games.json');
    const data = await res.json();
    const container = document.getElementById('categories');
    container.innerHTML = '';

    const sections = data.sections || [];
    const games = data.games || [];

    for(const sec of sections){
      const section = document.createElement('div');
      section.className = 'category-section';

      const title = document.createElement('h2');
      title.className = 'category-title';
      title.textContent = sec.title || 'Untitled';
      section.appendChild(title);

      const grid = document.createElement('div');
      grid.className = 'games-grid';

      // Filter games by section tag
      const tag = sec.tag;
      const sectionGames = games.filter(g => Array.isArray(g.tags) && (tag ? g.tags.includes(tag) : true));

      for(const g of sectionGames){
        const a = document.createElement('a');
        a.className = 'game-card';
        a.href = g.url || '#';
        a.target = '_blank';
        a.rel = 'noopener';
        a.setAttribute('aria-label', g.title || g.id || 'Game');

        // Thumbnail box
        const thumb = document.createElement('div');
        thumb.className = 'game-thumb';
        if(g.thumbnail){
          const img = document.createElement('img');
          img.src = g.thumbnail;
          img.alt = (g.title || 'Game') + ' thumbnail';
          thumb.appendChild(img);
        }
        a.appendChild(thumb);

        // Title below the icon/thumbnail
        const label = document.createElement('div');
        label.className = 'game-title';
        label.textContent = g.title || 'Game';
        a.appendChild(label);

        grid.appendChild(a);

        // Click handling: prompt fullscreen and always open in new tab
        a.addEventListener('click', (evt) => {
          // allow keyboard activation or pointer; we handle uniformly
          evt.preventDefault();
          const url = g.url || '#';
          if(!url || url === '#') return;

          // Store pending URL and show modal
          pendingOpen.url = url;
          showFsModal();
        });
      }

      section.appendChild(grid);
      container.appendChild(section);
    }
  } catch(err){
    console.error(err);
    const container = document.getElementById('categories');
    container.innerHTML = '<p>Could not load games list.</p>';
  }
}

// Run after DOM is parsed (script is deferred)
loadGames();

// --- Fullscreen modal logic ---
const pendingOpen = { url: null };

function showFsModal(){
  const backdrop = document.getElementById('fs-modal-backdrop');
  if(!backdrop) return window.open(pendingOpen.url, '_blank', 'noopener');
  backdrop.classList.add('show');
  backdrop.setAttribute('aria-hidden', 'false');
}

function hideFsModal(){
  const backdrop = document.getElementById('fs-modal-backdrop');
  if(!backdrop) return;
  backdrop.classList.remove('show');
  backdrop.setAttribute('aria-hidden', 'true');
}

function openGame(fullscreen){
  if(!pendingOpen.url) return;
  if(fullscreen){
    // Use launcher page to handle fullscreen without modifying game code
    const launcher = new URL('play.html', window.location.origin);
    launcher.searchParams.set('url', pendingOpen.url);
    window.open(launcher.toString(), '_blank', 'noopener');
  } else {
    const url = new URL(pendingOpen.url, window.location.origin);
    window.open(url.toString(), '_blank', 'noopener');
  }
  pendingOpen.url = null;
}

// Wire modal buttons after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const cancel = document.getElementById('fs-cancel');
  const no = document.getElementById('fs-no');
  const yes = document.getElementById('fs-yes');
  if(cancel) cancel.addEventListener('click', () => { pendingOpen.url = null; hideFsModal(); });
  if(no) no.addEventListener('click', () => { openGame(false); hideFsModal(); });
  if(yes) yes.addEventListener('click', () => { openGame(true); hideFsModal(); });
});
