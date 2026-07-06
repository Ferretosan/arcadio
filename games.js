const App = {
  data: null,
  selectedTags: [],
  searchQuery: '',
  sections: []
};

const TAG_LABELS = {
  racing: "Racing",
  puzzle: "Puzzle",
  action: "Action",
  sports: "Sports",
  shooter: "Shooter",
  platformer: "Platformer",
  io: ".io",
  idle: "Idle",
  classic: "Classic",
  horror: "Horror",
  multiplayer: "Multiplayer",
  strategy: "Strategy",
  casual: "Casual",
  simulation: "Simulation",
  adventure: "Adventure",
  rhythm: "Rhythm",
  survival: "Survival",
  runner: "Runner",
  arcade: "Arcade",
  retro: "Retro",
  rpg: "RPG",
  clicker: "Clicker",
  "tower-defense": "Tower Defense",
  car: "Car",
  bike: "Bike",
  "co-op": "Co-op",
  flying: "Flying",
  fighting: "Fighting",
  drawing: "Drawing",
  driving: "Driving",
  sandbox: "Sandbox",
  skiing: "Skiing"
};

function formatTag(tag){
  if(TAG_LABELS[tag]) return TAG_LABELS[tag];
  return tag.replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}

async function init(){
  try{
    const res = await fetch('games.json');
    if(!res.ok) throw new Error('Failed to load games.json');
    App.data = await res.json();
    App.sections = App.data.sections || [];
    renderSidebar();
    render();
    setupSidebarToggle();
    setupSearch();
  } catch(err){
    console.error(err);
    document.getElementById('categories').innerHTML = '<p>Could not load games list.</p>';
  }
}

function setupSidebarToggle(){
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  if(!toggle || !sidebar) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });
}

function setupSearch(){
  const input = document.getElementById('search-input');
  if(!input) return;

  input.addEventListener('input', (e) => {
    App.searchQuery = e.target.value.trim().toLowerCase();
    render();
  });
}

function renderSidebar(){
  const tagCounts = {};
  const exclude = new Set(['all', 'featured', 'arcadio']);
  for(const g of (App.data.games || [])){
    if(Array.isArray(g.tags)){
      for(const t of g.tags){
        if(!exclude.has(t)){
          tagCounts[t] = (tagCounts[t] || 0) + 1;
        }
      }
    }
  }

  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  const list = document.getElementById('tag-list');
  if(!list) return;

  list.innerHTML = '';
  for(const [tag, count] of sorted){
    const btn = document.createElement('button');
    btn.className = 'sidebar-tag';
    btn.dataset.tag = tag;
    btn.textContent = `${formatTag(tag)} (${count})`;
    btn.addEventListener('click', () => {
      const idx = App.selectedTags.indexOf(tag);
      if(idx === -1){
        App.selectedTags.push(tag);
      } else {
        App.selectedTags.splice(idx, 1);
      }
      updateSidebarActive();
      updateSelectedPills();
      render();
    });
    list.appendChild(btn);
  }

  const clearBtn = document.getElementById('clear-tags');
  if(clearBtn){
    clearBtn.addEventListener('click', () => {
      App.selectedTags = [];
      App.searchQuery = '';
      const searchInput = document.getElementById('search-input');
      if(searchInput) searchInput.value = '';
      updateSidebarActive();
      updateSelectedPills();
      render();
    });
  }
}

function updateSidebarActive(){
  document.querySelectorAll('.sidebar-tag').forEach(el => el.classList.remove('active'));
  for(const tag of App.selectedTags){
    const el = document.querySelector(`.sidebar-tag[data-tag="${CSS.escape(tag)}"]`);
    if(el) el.classList.add('active');
  }
}

function updateSelectedPills(){
  const container = document.getElementById('active-filters');
  if(!container) return;
  container.innerHTML = '';

  for(const tag of App.selectedTags){
    const pill = document.createElement('span');
    pill.className = 'active-pill';
    pill.innerHTML = `${formatTag(tag)} <button class="pill-remove" data-tag="${tag}" aria-label="Remove ${formatTag(tag)}">&times;</button>`;
    container.appendChild(pill);
  }

  container.querySelectorAll('.pill-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      const idx = App.selectedTags.indexOf(tag);
      if(idx > -1) App.selectedTags.splice(idx, 1);
      updateSidebarActive();
      updateSelectedPills();
      render();
    });
  });
}

function createGameCard(g){
  const a = document.createElement('a');
  a.className = 'game-card';
  a.href = `play.html?game=${encodeURIComponent(g.id)}`;
  a.target = '_self';
  a.rel = 'noopener';
  a.setAttribute('aria-label', g.title || g.id || 'Game');

  const thumb = document.createElement('div');
  thumb.className = 'game-thumb';
  if(g.thumbnail){
    const img = document.createElement('img');
    img.src = g.thumbnail;
    img.alt = (g.title || 'Game') + ' thumbnail';
    thumb.appendChild(img);
  }
  a.appendChild(thumb);

  const label = document.createElement('div');
  label.className = 'game-title';
  label.textContent = g.title || 'Game';
  a.appendChild(label);

  return a;
}

function matchesSearch(g, query){
  if(!query) return true;
  const title = (g.title || '').toLowerCase();
  const tags = (g.tags || []).join(' ').toLowerCase();
  return title.includes(query) || tags.includes(query);
}

function matchesTags(g, selected){
  if(!selected || selected.length === 0) return true;
  return g.tags && g.tags.some(t => selected.includes(t));
}

function render(){
  if(!App.data) return;
  const container = document.getElementById('categories');
  container.innerHTML = '';

  const games = App.data.games || [];
  const selected = App.selectedTags;
  const query = App.searchQuery;

  const hasFilters = selected.length > 0 || query.length > 0;

  if(hasFilters){
    const filtered = games.filter(g => matchesSearch(g, query) && matchesTags(g, selected));
    const section = document.createElement('div');
    section.className = 'category-section';

    const title = document.createElement('h2');
    title.className = 'category-title';
    title.textContent = `Results (${filtered.length})`;
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'games-grid';

    for(const g of filtered){
      grid.appendChild(createGameCard(g));
    }

    section.appendChild(grid);
    container.appendChild(section);

    if(filtered.length === 0){
      container.innerHTML = '<p>No games match your search or filters.</p>';
    }
    return;
  }

  const shown = new Set();
  for(const sec of App.sections){
    const tag = sec.tag;
    let sectionGames = games.filter(g => {
      if(shown.has(g.id)) return false;
      return Array.isArray(g.tags) && (tag ? g.tags.includes(tag) : true);
    });

    sectionGames.forEach(g => shown.add(g.id));

    if(sectionGames.length === 0) continue;

    const section = document.createElement('div');
    section.className = 'category-section';

    const title = document.createElement('h2');
    title.className = 'category-title';
    const titleText = sec.title || 'Untitled';
    const countText = sectionGames.length > 0 ? ` (${sectionGames.length})` : '';
    title.textContent = `${titleText}${countText}`;
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'games-grid';

    for(const g of sectionGames){
      grid.appendChild(createGameCard(g));
    }

    section.appendChild(grid);
    container.appendChild(section);
  }

  if(shown.size === 0 && games.length > 0){
    const grid = document.createElement('div');
    grid.className = 'games-grid';
    const allSection = document.createElement('div');
    allSection.className = 'category-section';
    const title = document.createElement('h2');
    title.className = 'category-title';
    title.textContent = `All Games (${games.length})`;
    allSection.appendChild(title);
    allSection.appendChild(grid);
    container.appendChild(allSection);
    for(const g of games){
      grid.appendChild(createGameCard(g));
    }
  }
}

init();
