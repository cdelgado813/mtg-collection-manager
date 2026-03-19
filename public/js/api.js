// API client
const API = {
  async getCards(params = {}) {
    const query = new URLSearchParams(params);
    const res = await fetch(`/api/cards?${query}`);
    return res.json();
  },

  async getStats() {
    const res = await fetch('/api/stats');
    return res.json();
  },

  async getSets() {
    const res = await fetch('/api/sets');
    return res.json();
  },

  async getBinders() {
    const res = await fetch('/api/binders');
    return res.json();
  },

  async updateCard(id, data) {
    const res = await fetch(`/api/cards/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async deleteCard(id) {
    const res = await fetch(`/api/cards/${id}`, { method: 'DELETE' });
    return res.json();
  },

  async deleteAllCards() {
    const res = await fetch('/api/cards/all', { method: 'DELETE' });
    return res.json();
  },

  async uploadCSV(file) {
    const formData = new FormData();
    formData.append('csv', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    return res.json();
  },

  async checkDeck(decklist) {
    const res = await fetch('/api/check-deck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decklist })
    });
    return res.json();
  }
};

// Export for use in main app
window.API = API;
