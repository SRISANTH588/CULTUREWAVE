// Uploads images to ImageKit (local/npm start) or Cloudinary (GitHub Pages).
async function uploadImageToImageKit(file, folder = '/event-covers') {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image must be 5 MB or smaller.');
  }

  const isGitHubPages = window.location.hostname.endsWith('.github.io');

  // Use ImageKit when running locally with npm start
  if (!isGitHubPages) {
    try {
      const authResponse = await fetch('/api/imagekit/auth');
      if (authResponse.ok) {
        const auth = await authResponse.json();
        if (auth.token && auth.expire && auth.signature) {
          const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
          const form = new FormData();
          form.append('file', file);
          form.append('fileName', fileName);
          form.append('folder', folder);
          form.append('publicKey', auth.publicKey);
          form.append('token', auth.token);
          form.append('expire', String(auth.expire));
          form.append('signature', auth.signature);

          const res = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
            method: 'POST',
            body: form,
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.url) return data.url;
        }
      }
    } catch (_) {
      // server not running — fall through to Cloudinary
    }
  }

  // Cloudinary unsigned upload — works on GitHub Pages for free
  return await uploadToCloudinary(file, folder);
}

async function uploadToCloudinary(file, folder) {
  const CLOUD_NAME = 'antkxxvq';
  const UPLOAD_PRESET = 'culturewave_upload';

  // Map folder to a Cloudinary folder name
  const folderMap = {
    '/event-covers': 'event-covers',
    '/event-cards': 'event-cards',
    '/event-logos': 'event-logos',
    '/event-galleries': 'event-galleries',
    '/seating-plans': 'seating-plans',
  };
  const cloudFolder = folderMap[folder] || 'uploads';

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', UPLOAD_PRESET);
  form.append('folder', cloudFolder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
  });

  const data = await res.json().catch(() => ({}));

  if (res.ok && data.secure_url) return data.secure_url;

  throw new Error(
    data.error?.message || `Image upload failed (${res.status}). Check your Cloudinary upload preset is set to Unsigned.`
  );
}
