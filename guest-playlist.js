import { collection, db, getDocs, query } from './firebase.js';

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
  const snapshot = await getDocs(query(collection(db, 'playlists')));
  const playlists = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
  const playlist = (eventId && playlists.find(item => item.eventId === eventId))
    || playlists.find(item => item.isDefault)
    || playlists.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))[0];

  if (!playlist) throw new Error('No playlist has been published yet.');

  document.getElementById('title').textContent = playlist.title || 'Event Playlist';
  document.getElementById('description').textContent = playlist.description || '';
  const songs = Array.isArray(playlist.songs) ? playlist.songs : [];
  const songList = document.getElementById('songs');
  songList.innerHTML = songs.length
    ? songs.map((song, index) => `<article class="song"><button class="song-trigger" type="button" aria-expanded="false" style="grid-column:1/-1;display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;padding:0;border:0;background:transparent;color:inherit;text-align:left"><span class="number">${index + 1}</span><span><strong>${esc(song.title || 'Untitled song')}</strong>${song.artist ? `<small>${esc(song.artist)}</small>` : ''}</span><span aria-hidden="true" style="color:#ff9abb;font-size:1.1rem">⌄</span></button><div class="lyrics" hidden style="grid-column:1/-1"><p style="white-space:pre-wrap">${song.lyrics ? esc(song.lyrics) : ''}</p></div>${song.url ? `<a class="play" href="${esc(song.url)}" target="_blank" rel="noopener">Play ↗</a>` : ''}</article>`).join('')
    : '<p class="status">Songs will be added soon.</p>';
  songList.addEventListener('click', event => {
    const trigger = event.target.closest('.song-trigger');
    if (!trigger) return;
    const lyrics = trigger.nextElementSibling;
    const isOpen = trigger.getAttribute('aria-expanded') === 'true';
    trigger.setAttribute('aria-expanded', String(!isOpen));
    lyrics.hidden = isOpen;
  });

  status.hidden = true;
  document.getElementById('content').hidden = false;
}

loadPlaylist().catch(error => {
  console.error('Could not load playlist:', error);
  document.getElementById('status').textContent = error.code === 'permission-denied'
    ? 'Playlist access is not enabled yet. Please try again later.'
    : error.message || 'Playlist unavailable.';
});
