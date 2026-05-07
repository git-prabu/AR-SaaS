// components/ARViewer.jsx
const PLACEHOLDER_MODEL = 'https://modelviewer.dev/shared-assets/models/Astronaut.glb';

export function ARViewerEmbed({ modelURL, itemName }) {
  // Note: we intentionally do NOT pass imageURL/poster to the iframe
  // Passing the poster causes model-viewer to show the image and fire
  // load prematurely before the actual 3D model is ready
  const src = modelURL || PLACEHOLDER_MODEL;

  const params = new URLSearchParams();
  params.set('src', src);
  if (itemName) params.set('name', itemName);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="w-full rounded-2xl overflow-hidden border border-bg-border"
        style={{ height: 420 }}
      >
        <iframe
          src={`/ar-viewer.html?${params.toString()}`}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="xr-spatial-tracking *; fullscreen *; camera *"
          allowFullScreen
          title={`AR viewer for ${itemName || 'dish'}`}
        />
      </div>
      <p className="text-center text-xs text-text-muted pb-1">
        Wait for model to load · Works on Android Chrome &amp; iOS Safari/Chrome
      </p>
    </div>
  );
}

export default function ARViewer({ modelURL, itemName, onARLaunch }) {
  return <ARViewerEmbed modelURL={modelURL} itemName={itemName} onARLaunch={onARLaunch} />;
}
