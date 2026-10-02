'use client'

type Photo = { fileName: string; src: string }

/**
 * Photos that save to the desktop when dragged out of the browser. The
 * image URL already ends in the file name (Safari, Firefox use it); Chrome
 * and Edge also get DownloadURL so they save the full-size JPEG under that
 * name rather than "image.jpg".
 */
export function DraggablePhotos({ photos }: { photos: Photo[] }) {
  if (photos.length === 0) return <p style={{ color: 'var(--muted)' }}>写真はありません。</p>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
      {photos.map((p) => (
        <figure key={p.src} style={{ margin: 0, display: 'grid', gap: 6 }}>
          <a href={p.src} target="_blank" rel="noreferrer" title="ドラッグしてデスクトップに保存／クリックで拡大">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.src}
              alt={p.fileName}
              draggable
              onDragStart={(e) => {
                const url = new URL(p.src, window.location.href).href
                e.dataTransfer.setData('DownloadURL', `image/jpeg:${p.fileName}:${url}`)
              }}
              style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 10, cursor: 'grab', display: 'block' }}
            />
          </a>
          <figcaption className="row" style={{ justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--muted)' }}>
            <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.fileName}</span>
            <a className="btn btn-small" href={`${p.src}?download=1`} download={p.fileName}>保存</a>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
