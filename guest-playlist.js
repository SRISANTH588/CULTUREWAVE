import { collection, db, doc, getDoc, getDocs, query } from './firebase.js';

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
  const newestFirst = [...playlists].sort((a, b) => {
    const updatedAt = item => item.updatedAt?.toDate?.().getTime() || (item.updatedAt?.seconds || 0) * 1000 || new Date(item.updatedAt || 0).getTime();
    return updatedAt(b) - updatedAt(a);
  });
  const playlist = (eventId && playlists.find(item => item.eventId === eventId))
    || (eventId ? playlists.find(item => item.isDefault) : newestFirst[0])
    || newestFirst[0];

  if (!playlist) throw new Error('No playlist has been published yet.');

  const eventHeading = document.getElementById('eventName');
  if (playlist.eventId) {
    const eventSnapshot = await getDoc(doc(db, 'events', playlist.eventId));
    const event = eventSnapshot.exists() ? eventSnapshot.data() : {};
    eventHeading.textContent = event.name || event.title || event.eventName || 'Event Playlist';
  } else {
    eventHeading.hidden = true;
  }

  const songs = Array.isArray(playlist.songs) ? playlist.songs : [];
  const songList = document.getElementById('songs');
  songList.innerHTML = songs.length
    ? songs.map((song, index) => {
      const lyrics = song.lyrics || song.lyricsText || song.lyricsUrl || '';
      return `<article class="song"><button class="song-trigger" type="button" aria-expanded="false" style="grid-column:1/-1;display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;padding:0;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer"><span class="number">${index + 1}</span><span><strong>${esc(song.title || 'Untitled song')}</strong>${song.artist ? `<small>${esc(song.artist)}</small>` : ''}</span><span aria-hidden="true" style="color:#ff9abb;font-size:1.1rem">Lyrics ⌄</span></button><div class="lyrics" hidden style="grid-column:1/-1"><p style="white-space:pre-wrap">${esc(lyrics)}</p></div>${song.url ? `<a class="play" href="${esc(song.url)}" target="_blank" rel="noopener">Play ↗</a>` : ''}</article>`;
    }).join('')
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
