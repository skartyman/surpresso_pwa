export class TrelloClient {
  constructor({ key, token, listId }) {
    this.key = key;
    this.token = token;
    this.listId = listId;
    this.baseUrl = 'https://api.trello.com/1';
  }

  async createCard({ name, desc, labelId = '' }) {
    if (!this.key || !this.token || !this.listId) {
      throw new Error('Trello not configured');
    }

    const url = `${this.baseUrl}/cards?key=${this.key}&token=${this.token}`;
    const body = {
      idList: this.listId,
      name,
      desc,
      ...(labelId ? { idLabels: [labelId] } : {}),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const card = await res.json();
    if (!card?.id) throw new Error('Trello card not created');
    return card;
  }

  async attachPhoto(cardId, photoUrl, filename) {
    const url = `${this.baseUrl}/cards/${cardId}/attachments?key=${this.key}&token=${this.token}`;
    const form = new FormData();
    form.append('url', photoUrl);
    form.append('name', filename);

    await fetch(url, { method: 'POST', body: form });
  }
}
