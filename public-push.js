(function () {
  const prompt = document.getElementById('sitePushPrompt');
  const status = document.getElementById('sitePushStatus');
  const enable = document.getElementById('sitePushEnable');
  const disable = document.getElementById('sitePushDisable');
  const publicKey = window.CULTUREWAVE_PUSH_PUBLIC_KEY || '';
  if (!prompt || !status || !enable || !disable) return;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isInstalled = navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  const isIOSBrowserTab = isIOS && !isInstalled;
  const hasPushSupport = 'Notification' in window &&
    'serviceWorker' in navigator && 'PushManager' in window;
  const missingVapidKey = !publicKey || publicKey.includes('REPLACE_WITH');

  const endpointId = endpoint => btoa(endpoint).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  const fromBase64Url = value => {
    const padded = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
  };

  async function getSignedInDeviceUser() {
    const auth = firebase.auth();
    if (auth.currentUser) return auth.currentUser;
    const credential = await auth.signInAnonymously();
    return credential.user;
  }

  async function refresh() {
    prompt.style.display = 'flex';
    if (isIOSBrowserTab) {
      status.textContent = 'On iPhone or iPad, first tap Share → Add to Home Screen, then open CultureWave from that icon. Phone notifications require iOS 16.4 or later.';
      enable.style.display = 'none'; disable.style.display = 'none'; return;
    }
    if (!hasPushSupport) {
      status.textContent = 'This browser cannot receive web push notifications. Update your browser or open CultureWave in Safari or Chrome.';
      enable.style.display = 'none'; disable.style.display = 'none'; return;
    }
    if (missingVapidKey) {
      status.textContent = 'Phone alerts are being set up. Please check back soon.';
      enable.disabled = true; enable.style.display = ''; disable.style.display = 'none'; return;
    }
    if (Notification.permission === 'denied') {
      status.textContent = 'Notifications are blocked in browser settings. Allow them there to subscribe.';
      enable.style.display = 'none'; disable.style.display = 'none'; return;
    }
    try {
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const subscription = await registration.pushManager.getSubscription();
      status.textContent = subscription ? 'This phone is subscribed to new event alerts.' : 'Get alerts when new events go live.';
      enable.style.display = subscription ? 'none' : '';
      disable.style.display = subscription ? '' : 'none';
      enable.disabled = false;
    } catch (error) {
      status.textContent = 'Could not prepare push notifications in this browser.';
    }
  }

  enable.addEventListener('click', async () => {
    enable.disabled = true;
    try {
      if (missingVapidKey) throw new Error('CultureWave notifications are not configured yet. Please check back soon.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: fromBase64Url(publicKey),
      });
      const user = await getSignedInDeviceUser();
      const payload = subscription.toJSON();
      await firebase.firestore().collection('publicPushSubscriptions').doc(endpointId(subscription.endpoint)).set({
        endpoint: subscription.endpoint,
        keys: payload.keys,
        ownerUid: user.uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      status.textContent = 'This phone is subscribed to new event alerts.';
      await refresh();
    } catch (error) {
      status.textContent = error.message || 'Could not enable notifications.';
      enable.disabled = false;
    }
  });

  disable.addEventListener('click', async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) await subscription.unsubscribe();
      status.textContent = 'Push alerts are off on this phone.';
      await refresh();
    } catch (error) {
      status.textContent = error.message || 'Could not turn off notifications.';
    }
  });

  refresh();
}());
