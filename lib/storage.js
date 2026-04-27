// lib/storage.js
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Upload a file with progress callback.
 * @param {File} file
 * @param {string} path - Storage path, e.g. restaurants/{id}/images/{name}
 * @param {function} onProgress - called with 0-100
 * @returns {Promise<string>} Download URL
 */
export function uploadFile(file, path, onProgress) {
  return new Promise((resolve, reject) => {
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      'state_changed',
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (onProgress) onProgress(pct);
      },
      (error) => reject(error),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      }
    );
  });
}

export async function deleteFile(path) {
  const storageRef = ref(storage, path);
  return deleteObject(storageRef);
}

/** Returns file size in MB */
export function fileSizeMB(file) {
  return file.size / (1024 * 1024);
}

export function buildImagePath(restaurantId, filename) {
  return `restaurants/${restaurantId}/images/${Date.now()}_${filename}`;
}

export function buildModelPath(restaurantId, filename) {
  return `restaurants/${restaurantId}/models/${Date.now()}_${filename}`;
}

// ─── Image resize before upload ────────────────────────────────────────
// Browser-native canvas resize so large menu photos don't blow up the
// customer page on slow internet. A 1.1 MB screenshot becomes ~150 KB,
// which is ~5 seconds saved on a 3G connection per image.
//
// Behaviour:
//   - Non-image files → returned untouched (so .glb / model uploads are
//     unaffected — those go through the same uploadFile pipeline elsewhere).
//   - Files already under 200 KB → returned untouched (no point degrading
//     quality for a small win).
//   - Files within target dims AND already in target format → untouched.
//   - Anything else → drawn onto a canvas at the smaller dim, exported as
//     the same MIME type at `quality`. If the result is somehow bigger
//     than the input, we keep the input.
//
// No new npm dependencies — uses Canvas API + Image element only.
export async function resizeImage(file, opts = {}) {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.85 } = opts;

  if (typeof window === 'undefined') return file;
  if (!file || !file.type || !file.type.startsWith('image/')) return file;

  // Animated GIFs lose their animation in canvas — skip them.
  if (file.type === 'image/gif') return file;

  // Already small — don't bother re-encoding (avoids quality loss).
  if (file.size < 200 * 1024) return file;

  let img;
  try {
    img = await loadImageFromFile(file);
  } catch {
    // Couldn't decode — let the upload proceed with the original file.
    return file;
  }

  const { width, height } = scaleToFit(img.naturalWidth, img.naturalHeight, maxWidth, maxHeight);

  // Already within bounds AND we'd just be re-encoding for nothing.
  if (width === img.naturalWidth && height === img.naturalHeight && file.size < 500 * 1024) {
    return file;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise((resolve) => {
    try { canvas.toBlob(resolve, file.type, quality); }
    catch { resolve(null); }
  });
  if (!blob) return file;

  // Sometimes canvas re-encoding makes a tiny image slightly bigger
  // (PNGs especially). Fall back to the original in that case.
  if (blob.size >= file.size) return file;

  // Wrap as a File so the existing upload code can read .name etc.
  return new File([blob], file.name, { type: file.type, lastModified: Date.now() });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function scaleToFit(srcW, srcH, maxW, maxH) {
  // Math.min with 1 prevents UPSCALING small images.
  const ratio = Math.min(maxW / srcW, maxH / srcH, 1);
  return {
    width:  Math.round(srcW * ratio),
    height: Math.round(srcH * ratio),
  };
}

// Convenience wrapper: resize THEN upload. Used by the admin menu-item
// image upload flow. Falls back to the original file if resize bails out.
export async function uploadImage(file, path, onProgress, opts) {
  const resized = await resizeImage(file, opts);
  return uploadFile(resized, path, onProgress);
}

// ─── Bulk image optimization (for existing already-uploaded photos) ────
// `uploadImage` only kicks in for NEW uploads. This helper lets the admin
// retroactively shrink images that were uploaded before the auto-resize
// shipped (or came in via CSV import where only a URL was set). Used by
// the "Optimize images" button on /admin/items.

// Re-fetch a Firebase Storage download URL into a File so we can run it
// through resizeImage(). Firebase Storage download URLs have CORS enabled
// for browser reads by default.
async function urlToFile(url, filename) {
  const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const blob = await res.blob();
  const type = blob.type || 'image/jpeg';
  return new File([blob], filename || 'image.jpg', { type });
}

// Pull the storage object path out of a Firebase Storage download URL.
// e.g. https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encoded path>?alt=media&token=...
//   →  restaurants/<rid>/images/<file>
function extractStoragePath(downloadURL) {
  try {
    const u = new URL(downloadURL);
    const m = u.pathname.match(/\/o\/(.+)$/);
    if (!m) return null;
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/**
 * Optimize a single existing menu-item image:
 *   download → resize via canvas → re-upload at a new path.
 *
 * Returns { newURL, sizeBefore, sizeAfter, oldPath } on a real shrink,
 * or null when the image was already small enough that resizeImage()
 * declined to touch it (under 200 KB / dimensions already fit).
 *
 * The caller is responsible for:
 *   1. updating the menu-item doc with `newURL`
 *   2. (best-effort) calling deleteFile(oldPath) to clean up the old file
 *
 * Throws on network / decode / upload failure so the bulk loop can catch
 * per-item and continue with the next one.
 */
export async function optimizeOneImage(restaurantId, item) {
  if (!item || !item.imageURL) return null;
  if (!restaurantId) throw new Error('restaurantId required');

  // Sanitize a friendly filename for the new Storage object. Falls back
  // to item.id if name is missing or all special chars.
  const base = (item.name || item.id || 'image').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'image';
  const original = await urlToFile(item.imageURL, `${base}.jpg`);
  const resized  = await resizeImage(original);
  if (resized === original) return null;          // already small, nothing to do

  const newPath = buildImagePath(restaurantId, original.name);
  const newURL  = await uploadFile(resized, newPath);

  return {
    newURL,
    sizeBefore: original.size,
    sizeAfter:  resized.size,
    oldPath:    extractStoragePath(item.imageURL),
  };
}
