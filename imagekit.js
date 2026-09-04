// Uploads browser-selected images to ImageKit without exposing the private key.
async function uploadImageToImageKit(file, folder = '/event-covers') {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Image must be 5 MB or smaller.');
  }

  const authResponse = await fetch('/api/imagekit/auth');
  const auth = await authResponse.json();
  if (!authResponse.ok) throw new Error(auth.error || 'Could not prepare image upload.');

  const form = new FormData();
  form.append('file', file);
  form.append('fileName', `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`);
  form.append('folder', folder);
  form.append('publicKey', auth.publicKey);
  form.append('token', auth.token);
  form.append('expire', auth.expire);
  form.append('signature', auth.signature);

  const uploadResponse = await fetch('https://upload.imagekit.io/api/v1/files/upload', {
    method: 'POST',
    body: form,
  });
  const result = await uploadResponse.json();
  if (!uploadResponse.ok || !result.url) {
    throw new Error(result.message || 'Image upload failed.');
  }
  return result.url;
}
