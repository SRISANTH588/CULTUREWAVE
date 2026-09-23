import { collection, db, getDocs, query, where } from './firebase.js';

const esc = value => String(value || '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

async function loadPlaylist() {
  const status = document.getElementById('status');
  const eventId = new URLSearchParams(location.search).get('eventId');
  const snapshot = await getDocs(query(collection(db, 'playlists'), where('isPublic', '==', true)));
  const playlists = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const playlist = (eventId && playlists.find(item => item.eventId === eventId))
    || playlists.find(item => item.isDefault)
    || playlists.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))[0];

  if (!playlist) throw new Error('No playlist has been published yet.');

  document.getElementById('title').textContent = playlist.title || 'Event Playlist';
  document.getElementById('description').textContent = playlist.description || '';
  const songs = Array.isArray(playlist.songs) ? playlist.songs : [];
  document.getElementById('songs').innerHTML = songs.length
    ? songs.map((song, index) => `<article class="song"><span class="number">${index + 1}</span><div><strong>${esc(song.title)}</strong>${song.artist ? `<small>${esc(song.artist)}</small>` : ''}</div>${song.url ? `<a class="play" href="${esc(song.url)}" target="_blank" rel="noopener">Play ↗</a>` : ''}${song.lyrics ? `<details class="lyrics"><summary>View lyrics</summary><p>${esc(song.lyrics)}</p></details>` : ''}</article>`).join('')
    : '<p class="status">Songs will be added soon.</p>';

  status.hidden = true;
  document.getElementById('content').hidden = false;
}

loadPlaylist().catch(error => {
  console.error('Could not load playlist:', error);
  document.getElementById('status').textContent = error.code === 'permission-denied'
    ? 'Playlist access is not enabled yet. Please try again later.'
    : error.message || 'Playlist unavailable.';
});
