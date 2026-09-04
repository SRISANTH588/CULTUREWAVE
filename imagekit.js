// Uploads browser-selected images to ImageKit without exposing the private key.
async function uploadImageToImageKit(file, folder = '/event-covers') {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image must be 5 MB or smaller.');
  }

  const apiOrigin = window.location.protocol === 'file:' ? 'http://127.0.0.1:3000' : '';
  let authResponse;
  let auth;
  try {
    authResponse = await fetch(`${apiOrigin}/api/imagekit/auth`);
    auth = await authResponse.json();
  } catch {
    throw new Error('Image upload server is unavailable. Start the app with npm start and refresh this page.');
  }
  if (!authResponse.ok) throw new Error(auth.error || 'Could not prepare image upload. Restart the app server and try again.');

  const form = new FormData();
  form.append('file', file);
  form.append('fileName', `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
  form.append('folder', folder);
  form.append('publicKey', auth.publicKey);
  form.append('token', auth.token);
  form.append('expire', auth.expire);
  form.append('signature', auth.signature);

  let uploadResponse;
  let result;
  try {
    uploadResponse = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
      method: 'POST',
      body: form,
    });
    const responseText = await uploadResponse.text();
    try { result = JSON.parse(responseText); } catch { result = {}; }
  } catch {
    throw new Error('Could not reach ImageKit. Check your internet connection and restart the app server.');
  }
  if (!uploadResponse.ok || !result.url) {
    throw new Error(result.message || result.error || `ImageKit rejected the upload (HTTP ${uploadResponse.status}).`);
  }
  return result.url;
}
