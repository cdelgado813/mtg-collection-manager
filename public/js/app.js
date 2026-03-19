// State
let allCards = [];
let currentPage = 1;
let totalPages = 1;
let currentFilters = {};
let eventSource = null;

// Tab switching
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  
  event.target.classList.add('active');
  document.getElementById(`${tabName}-tab`).classList.add('active');
}

// Stats
async function loadStats() {
  const stats = await API.getStats();
  document.getElementById('totalCards').textContent = stats.total_cards || 0;
  document.getElementById('totalCopies').textContent = stats.total_copies || 0;
  document.getElementById('totalValue').textContent = stats.total_value_eur 
    ? `€${stats.total_value_eur.toFixed(2)}` 
    : '€0.00';
  document.getElementById('totalFoils').textContent = stats.total_foils || 0;
}

// Filters
async function loadFilters() {
  const sets = await API.getSets();
  const setFilter = document.getElementById('setFilter');
  setFilter.innerHTML = '<option value="">Todas las expansiones</option>';
  sets.forEach(set => {
    const option = document.createElement('option');
    option.value = set;
    option.textContent = set;
    setFilter.appendChild(option);
  });

  const binders = await API.getBinders();
  const binderFilter = document.getElementById('binderFilter');
  binderFilter.innerHTML = '<option value="">Todos los binders</option>';
  binders.forEach(binder => {
    const option = document.createElement('option');
    option.value = binder;
    option.textContent = binder;
    binderFilter.appendChild(option);
  });
}

// Cards
async function loadCards(page = 1) {
  currentPage = page;
  
  const params = {
    page: currentPage,
    limit: 50,
    ...currentFilters
  };

  const data = await API.getCards(params);
  
  allCards = data.cards || [];
  totalPages = data.pagination?.totalPages || 1;
  
  displayCards(allCards);
  updatePagination();
  loadStats();
  
  if (currentPage === 1) {
    loadFilters();
    loadDeckList();
  }
}

function displayCards(cards) {
  const grid = document.getElementById('cardsGrid');
  if (cards.length === 0) {
    grid.innerHTML = '<div class="loading">No hay cartas en tu colección</div>';
    return;
  }

  grid.innerHTML = cards.map(card => `
    <div class="card">
      ${card.image_uri 
        ? `<img src="${card.image_uri}" alt="${card.name}" class="card-image" loading="lazy" />`
        : `<div class="no-image">🃏</div>`
      }
      <div class="card-info">
        <div class="card-name">
          ${card.name}
          ${card.foil ? '<span class="foil-badge">FOIL</span>' : ''}
        </div>
        <div class="card-details">${card.set_code || 'N/A'} • ${card.rarity || 'N/A'}</div>
        <div class="card-details">${card.type_line || ''}</div>
        ${card.binder_name ? `<div class="card-details">📁 ${card.binder_name}</div>` : ''}
        ${card.price_eur ? `<div class="price">€${card.price_eur.toFixed(2)}</div>` : ''}
        <div class="card-quantity">
          <span>Cantidad:</span>
          <input type="number" min="1" value="${card.quantity}" 
                 onchange="updateQuantity(${card.id}, this.value)" />
          <button class="danger" onclick="deleteCard(${card.id})" style="padding: 6px 12px; font-size: 0.85em;">🗑️</button>
        </div>
      </div>
    </div>
  `).join('');
}

// Pagination
function updatePagination() {
  const pagination = document.getElementById('pagination');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const pageInfo = document.getElementById('pageInfo');

  if (totalPages > 1) {
    pagination.style.display = 'flex';
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages;
    pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
  } else {
    pagination.style.display = 'none';
  }
}

function previousPage() {
  if (currentPage > 1) {
    loadCards(currentPage - 1);
  }
}

function nextPage() {
  if (currentPage < totalPages) {
    loadCards(currentPage + 1);
  }
}

// Filtering
function filterCards() {
  currentFilters = {
    search: document.getElementById('searchInput').value,
    color: document.getElementById('colorFilter').value,
    rarity: document.getElementById('rarityFilter').value,
    set: document.getElementById('setFilter').value,
    binder: document.getElementById('binderFilter').value
  };
  
  Object.keys(currentFilters).forEach(key => {
    if (!currentFilters[key]) delete currentFilters[key];
  });

  loadCards(1);
}

// Card operations
async function updateQuantity(id, newQty) {
  await API.updateCard(id, { quantity: parseInt(newQty) });
  loadCards(currentPage);
}

async function deleteCard(id) {
  if (!confirm('¿Eliminar esta carta?')) return;
  await API.deleteCard(id);
  loadCards(currentPage);
}

async function deleteAllCards() {
  if (!confirm('⚠️ ¿BORRAR TODA LA COLECCIÓN? Esta acción no se puede deshacer.')) return;
  if (!confirm('¿Estás completamente seguro? Se borrarán todas las cartas.')) return;
  
  await API.deleteAllCards();
  loadCards(1);
}

// Upload with progress
async function uploadCSV() {
  const fileInput = document.getElementById('csvFile');
  const progressContainer = document.getElementById('progressContainer');
  const progressFill = document.getElementById('progressFill');
  const progressInfo = document.getElementById('progressInfo');
  
  if (!fileInput.files[0]) {
    alert('❌ Selecciona un archivo CSV');
    return;
  }

  if (eventSource) eventSource.close();
  eventSource = new EventSource('/api/upload-progress');
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.status === 'starting') {
      progressContainer.classList.add('active');
      progressFill.style.width = '0%';
      progressFill.textContent = '0%';
      progressInfo.textContent = 'Iniciando...';
    } else if (data.status === 'processing') {
      const percent = Math.round((data.current / data.total) * 100);
      progressFill.style.width = `${percent}%`;
      progressFill.textContent = `${percent}%`;
      progressInfo.textContent = `Procesando: ${data.cardName} (${data.current}/${data.total})`;
    } else if (data.status === 'complete') {
      progressFill.style.width = '100%';
      progressFill.textContent = '100%';
      progressInfo.textContent = `✅ Completado: ${data.imported} importadas, ${data.failed} fallidas`;
      eventSource.close();
      setTimeout(() => {
        progressContainer.classList.remove('active');
        loadCards(1);
      }, 3000);
    } else if (data.status === 'error') {
      progressInfo.textContent = `❌ Error: ${data.message}`;
      eventSource.close();
    }
  };

  try {
    await API.uploadCSV(fileInput.files[0]);
  } catch (error) {
    progressInfo.textContent = `❌ Error: ${error.message}`;
    if (eventSource) eventSource.close();
  }
}

// Deck checker
async function checkDeck() {
  const decklist = document.getElementById('decklistInput').value;
  const resultsDiv = document.getElementById('deckResults');

  if (!decklist.trim()) {
    alert('❌ Pega una lista de cartas primero');
    return;
  }

  try {
    const data = await API.checkDeck(decklist);
    
    if (data.results) {
      resultsDiv.innerHTML = '<h4 style="margin: 20px 0 10px 0;">Resultados:</h4>' + 
        data.results.map(item => `
          <div class="deck-result-item ${item.status}">
            <div>
              <strong>${item.name}</strong><br/>
              <small style="color: var(--text-secondary);">
                Necesitas: ${item.needed} | Tienes: ${item.owned} | Faltan: ${item.missing}
              </small>
            </div>
            <div style="font-size: 1.5em;">
              ${item.status === 'complete' ? '✅' : '❌'}
            </div>
          </div>
        `).join('');
    }
  } catch (error) {
    resultsDiv.innerHTML = `<p style="color: var(--accent-warning);">❌ Error: ${error.message}</p>`;
  }
}

// Deck list (from binders/locations)
async function loadDeckList() {
  const binders = await API.getBinders();
  const deckListDiv = document.getElementById('deckList');
  
  if (binders.length === 0) {
    deckListDiv.innerHTML = '<p style="color: var(--text-secondary);">No hay mazos registrados todavía</p>';
    return;
  }

  deckListDiv.innerHTML = binders.map(binder => `
    <div class="deck-item" onclick="filterByDeck('${binder}')">
      <div class="deck-name">📦 ${binder}</div>
      <div class="deck-count">Ver cartas →</div>
    </div>
  `).join('');
}

function filterByDeck(binderName) {
  document.getElementById('binderFilter').value = binderName;
  switchTab('collection');
  setTimeout(() => {
    document.querySelectorAll('.tab')[0].classList.add('active');
    filterCards();
  }, 100);
}

// Initialize
loadCards();
