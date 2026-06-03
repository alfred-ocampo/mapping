export function toast(msg, ms = 2800) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: options.body && !(options.body instanceof FormData)
      ? { 'Content-Type': 'application/json', ...options.headers }
      : options.headers,
    ...options,
    body: options.body && !(options.body instanceof FormData)
      ? JSON.stringify(options.body)
      : options.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

export function renderMedia(container, url, mediaType) {
  container.innerHTML = '';
  if (!url) return;
  if (mediaType === 'video' || /\.(mp4|webm|mov)$/i.test(url)) {
    const v = document.createElement('video');
    v.src = url;
    v.controls = true;
    v.playsInline = true;
    container.appendChild(v);
  } else if (mediaType === 'audio' || /\.(mp3|wav|ogg)$/i.test(url)) {
    const a = document.createElement('audio');
    a.src = url;
    a.controls = true;
    container.appendChild(a);
  } else {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    container.appendChild(img);
  }
}
