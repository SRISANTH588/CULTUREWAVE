(() => {
  const toast = message => {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
  };
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const tableBody = document.querySelector('.events-panel tbody');
  const storageKey = 'community-admin-events-v1';
  let customEvents = [];
  try { customEvents = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { customEvents = []; }

  const renderEvents = () => {
    if (!tableBody) return;
    tableBody.querySelectorAll('[data-custom-event]').forEach(row => row.remove());
    customEvents.forEach((item, index) => {
      const row = document.createElement('tr');
      row.dataset.customEvent = String(index);
      row.innerHTML = `<td><span class="event-thumb green-thumb">${safe(item.title.split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase())}</span><span class="event-title"><b>${safe(item.title)}</b><small>${safe(item.category || 'Community event')}</small></span></td><td>${safe(item.date)}<small>${safe(item.time || 'Time TBD')}</small></td><td><b>0</b><small>of ${safe(item.capacity || '0')} tickets</small></td><td><b>₹0</b></td><td><span class="status-pill draft">Draft</span></td><td><button type="button" class="remove-event" data-remove-event="${index}" aria-label="Remove ${safe(item.title)}">×</button></td>`;
      tableBody.prepend(row);
    });
  };
  renderEvents();

  const openDialog = (title, content) => {
    document.querySelector('.admin-dialog-backdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.className = 'admin-dialog-backdrop';
    backdrop.innerHTML = `<section class="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-dialog-title"><button type="button" class="dialog-close" aria-label="Close">×</button><h2 id="admin-dialog-title">${safe(title)}</h2><div class="dialog-body">${content}</div></section>`;
    document.body.append(backdrop);
    const close = () => backdrop.remove();
    backdrop.querySelector('.dialog-close').addEventListener('click', close);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    backdrop.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    backdrop.querySelector('.dialog-close').focus();
    return backdrop;
  };

  document.querySelector('[data-create-event]')?.addEventListener('click', event => {
    event.preventDefault();
    const dialog = openDialog('Create an event', `<form class="event-form"><label>Event name<input name="title" required maxlength="80" placeholder="e.g. Sunday community meetup"></label><label>Category<input name="category" maxlength="50" placeholder="Community"></label><div class="form-pair"><label>Date<input name="date" type="date" required></label><label>Time<input name="time" type="time"></label></div><label>Ticket capacity<input name="capacity" type="number" min="1" value="100" required></label><button class="dialog-submit" type="submit">Save event</button></form>`);
    const dateField = dialog.querySelector('[name="date"]');
    dateField.value = new Date().toISOString().slice(0, 10);
    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const date = new Date(`${form.get('date')}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      customEvents.unshift({ title: form.get('title').trim(), category: form.get('category').trim(), date, time: form.get('time') || 'Time TBD', capacity: form.get('capacity') });
      try { localStorage.setItem(storageKey, JSON.stringify(customEvents)); } catch { toast('Event added for this session. Browser storage is unavailable.'); }
      renderEvents(); dialog.remove(); toast('Event added to your dashboard.');
    });
  });

  document.addEventListener('click', event => {
    const removeButton = event.target.closest('[data-remove-event]');
    if (!removeButton) return;
    customEvents.splice(Number(removeButton.dataset.removeEvent), 1);
    try { localStorage.setItem(storageKey, JSON.stringify(customEvents)); } catch {}
    renderEvents(); toast('Draft event removed.');
  });

  const periodRanges = {
    '7 days': ['Oct 9', 'Oct 15'],
    '30 days': ['Sep 16', 'Oct 15'],
    '90 days': ['Jul 18', 'Oct 15']
  };
  document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-period]').forEach(item => item.classList.toggle('active', item === button));
    const range = document.querySelector('.date-filter');
    const [start, end] = periodRanges[button.dataset.period];
    if (range) { range.textContent = `▦　${start} – ${end}, 2026　⌄`; range.dataset.period = button.dataset.period; }
    document.querySelectorAll('.metric-foot>span:last-child').forEach(label => { label.textContent = `vs. previous ${button.dataset.period}`; });
    toast(`Date range set to ${button.dataset.period}.`);
  }));

  document.querySelector('.date-filter')?.addEventListener('click', () => {
    const active = document.querySelector('[data-period].active')?.dataset.period || '7 days';
    const dialog = openDialog('Choose a date range', `<form class="event-form date-form"><div class="form-pair"><label>From<input name="from" type="date" value="2026-10-09" required></label><label>To<input name="to" type="date" value="2026-10-15" required></label></div><button class="dialog-submit" type="submit">Apply range</button></form>`);
    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const from = new Date(`${formData.get('from')}T00:00:00`);
      const to = new Date(`${formData.get('to')}T00:00:00`);
      if (from > to) { toast('Start date must be before end date.'); return; }
      const format = date => date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      document.querySelector('.date-filter').textContent = `▦　${format(from)} – ${format(to)}　⌄`;
      document.querySelectorAll('[data-period]').forEach(button => button.classList.toggle('active', button.dataset.period === active));
      dialog.remove(); toast('Custom date range applied.');
    });
  });

  document.querySelector('.export-button')?.addEventListener('click', () => {
    const rows = [...document.querySelectorAll('.events-panel table tr')].map(row => [...row.querySelectorAll('th,td')].map(cell => `"${cell.innerText.replaceAll('"', '""').replaceAll('\n', ' ')}"`).join(','));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'community-events.csv'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Your event report was exported.');
  });

  document.querySelector('.admin-icon')?.addEventListener('click', () => openDialog('Notifications', '<p class="dialog-copy">You’re all caught up. New bookings and event updates will appear here.</p>'));
  document.querySelector('.admin-avatar')?.addEventListener('click', () => openDialog('Owner account', '<p class="dialog-copy"><b>Srisanth Boddu</b><br>Workspace owner</p><button type="button" class="dialog-submit" data-account-home>Go to community home</button>'));
  document.querySelector('.admin-workspace')?.addEventListener('click', () => openDialog('Workspace', '<p class="dialog-copy"><b>Community Hyderabad</b><br>Current workspace</p><p class="dialog-copy">Workspace switching will be available when additional workspaces are connected.</p>'));
  document.querySelectorAll('.admin-nav a[href="#team"], .admin-nav a[href="#settings"]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const team = link.hash === '#team';
    openDialog(team ? 'Team access' : 'Settings', team ? '<p class="dialog-copy">Team access is ready for setup. Connect an organizer account to invite teammates.</p><label class="dialog-label">Invite by email<input type="email" placeholder="name@example.com"></label><button type="button" class="dialog-submit" data-invite>Send invite</button>' : '<label class="dialog-label">Workspace name<input value="Community Hyderabad"></label><label class="dialog-check"><input type="checkbox" checked> Email me about new bookings</label><button type="button" class="dialog-submit" data-save-settings>Save settings</button>');
  }));
  document.addEventListener('click', event => {
    if (event.target.closest('[data-invite]')) toast('Connect a team service to send invitations.');
    if (event.target.closest('[data-save-settings]')) { event.target.closest('.admin-dialog-backdrop').remove(); toast('Settings saved for this session.'); }
    if (event.target.closest('[data-account-home]')) location.href = 'index.html';
  });
  document.querySelectorAll('.panel-menu').forEach((button, index) => button.addEventListener('click', () => {
    const labels = ['Revenue report', 'Category report', 'Member activity'];
    openDialog(labels[index] || 'Dashboard options', '<p class="dialog-copy">Export this panel’s report using the Export button above.</p><button type="button" class="dialog-submit" data-panel-export>Export events CSV</button>');
  }));
  document.addEventListener('click', event => { if (event.target.closest('[data-panel-export]')) { document.querySelector('.export-button')?.click(); document.querySelector('.admin-dialog-backdrop')?.remove(); } });
})();
