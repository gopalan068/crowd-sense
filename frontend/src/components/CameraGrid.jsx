import React, { useState } from 'react'

/**
 * Default 12 CCTV Feeds matching venue layout
 * videoSrc: string | null (future video source e.g. '/videos/gate1.mp4' or remote URL)
 * streamUrl: string | null (future live MJPEG / HLS / WebRTC stream URL)
 */
export const DEFAULT_CAMERAS = [
  { id: 'cam-gate-1', name: 'GATE-1', status: 'recording', zone: 'Zone 1', videoSrc: null, streamUrl: null },
  { id: 'cam-gate-2', name: 'GATE-2', status: 'recording', zone: 'Zone 1', videoSrc: null, streamUrl: null },
  { id: 'cam-gate-3', name: 'GATE-3', status: 'recording', zone: 'Zone 1', videoSrc: null, streamUrl: null },
  { id: 'cam-stage-l', name: 'STAGE-L', status: 'recording', zone: 'Stage Left', videoSrc: null, streamUrl: null },
  { id: 'cam-stage-r', name: 'STAGE-R', status: 'recording', zone: 'Stage Right', videoSrc: null, streamUrl: null },
  { id: 'cam-zone-a1', name: 'ZONE-A1', status: 'offline', zone: 'Zone A', videoSrc: null, streamUrl: null },
  { id: 'cam-zone-a2', name: 'ZONE-A2', status: 'recording', zone: 'Zone A', videoSrc: null, streamUrl: null },
  { id: 'cam-zone-b1', name: 'ZONE-B1', status: 'recording', zone: 'Zone B', videoSrc: null, streamUrl: null },
  { id: 'cam-zone-b2', name: 'ZONE-B2', status: 'recording', zone: 'Zone B', videoSrc: null, streamUrl: null },
  { id: 'cam-exit-e1', name: 'EXIT-E1', status: 'recording', zone: 'Exit 1', videoSrc: null, streamUrl: null },
  { id: 'cam-exit-e2', name: 'EXIT-E2', status: 'recording', zone: 'Exit 2', videoSrc: null, streamUrl: null },
  { id: 'cam-med-pt', name: 'MED-PT', status: 'recording', zone: 'Medical Post', videoSrc: null, streamUrl: null },
]

export default function CameraGrid({ cameras: initialCameras = DEFAULT_CAMERAS, totalFeeds = 34 }) {
  const [cameras, setCameras] = useState(initialCameras)
  const [selectedCam, setSelectedCam] = useState(null)
  const [videoInputUrl, setVideoInputUrl] = useState('')

  const onlineCount = cameras.filter((c) => c.status !== 'offline').length
  const displayedOnline = 32 // matching "32 of 34 feeds online" or dynamically calculated

  const handleOpenConfig = (cam) => {
    setSelectedCam(cam)
    setVideoInputUrl(cam.videoSrc || cam.streamUrl || '')
  }

  const handleSaveStream = (e) => {
    e.preventDefault()
    if (!selectedCam) return

    setCameras((prev) =>
      prev.map((c) => {
        if (c.id === selectedCam.id) {
          const isClear = !videoInputUrl.trim()
          return {
            ...c,
            videoSrc: isClear ? null : videoInputUrl.trim(),
            status: isClear ? c.status : 'recording',
          }
        }
        return c
      })
    )
    setSelectedCam(null)
  }

  const handleToggleStatus = (camId) => {
    setCameras((prev) =>
      prev.map((c) => {
        if (c.id === camId) {
          const nextStatus = c.status === 'offline' ? 'recording' : 'offline'
          return { ...c, status: nextStatus }
        }
        return c
      })
    )
  }

  return (
    <div className="card cctv-grid-card">
      {/* Header */}
      <div className="cctv-grid-header">
        <h3 className="cctv-grid-title">Camera Grid</h3>
        <span className="cctv-grid-meta">
          {displayedOnline || onlineCount} of {totalFeeds} feeds online
        </span>
      </div>

      {/* Grid Container */}
      <div className="cctv-grid-container">
        {cameras.map((cam) => {
          const isOffline = cam.status === 'offline'
          const hasVideo = Boolean(cam.videoSrc || cam.streamUrl)

          return (
            <div
              key={cam.id}
              className={`cctv-cell ${isOffline ? 'is-offline' : 'is-recording'} ${hasVideo ? 'has-video' : ''}`}
              onClick={() => handleOpenConfig(cam)}
              title={`${cam.name} (${cam.status.toUpperCase()}) - Click to configure stream`}
            >
              {/* Video Stream or Placeholder */}
              {cam.videoSrc ? (
                <video
                  src={cam.videoSrc}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="cctv-video-player"
                />
              ) : cam.streamUrl ? (
                <img src={cam.streamUrl} alt={cam.name} className="cctv-video-player" />
              ) : (
                <div className="cctv-placeholder">
                  <div className="cctv-scanlines" />
                  <div className="cctv-crosshair" />
                </div>
              )}

              {/* Status Badge (Top-Left) */}
              <div className="cctv-status-badge">
                {isOffline ? (
                  <>
                    <span className="cctv-off-dot">○</span>
                    <span className="cctv-off-label">OFFLINE</span>
                  </>
                ) : (
                  <>
                    <span className="cctv-rec-dot">•</span>
                    <span className="cctv-rec-label">REC</span>
                  </>
                )}
              </div>

              {/* Camera Name (Bottom-Left) */}
              <div className="cctv-name-badge">
                {cam.name}
              </div>

              {/* Hover overlay hint */}
              <div className="cctv-hover-overlay">
                <span>{hasVideo ? '⚙ Change Feed' : '+ Add Stream'}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal to configure / attach video stream */}
      {selectedCam && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={() => setSelectedCam(null)}>
          <div
            className="modal-box"
            style={{ maxWidth: 460, width: '90%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3 style={{ margin: 0, fontSize: 16, fontFamily: 'var(--font-d)' }}>
                Configure Stream · {selectedCam.name}
              </h3>
              <button
                className="modal-close-btn"
                onClick={() => setSelectedCam(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStream} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                Enter a video URL (e.g., MP4 file, WebM, or HLS/MJPEG stream) to connect this camera placeholder to a live video stream.
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontFamily: 'var(--font-m)', color: 'var(--text-faint)', marginBottom: 6 }}>
                  VIDEO / STREAM URL (.mp4, .m3u8, /stream)
                </label>
                <input
                  type="text"
                  placeholder="e.g. /sample_corridor.mp4 or https://..."
                  value={videoInputUrl}
                  onChange={(e) => setVideoInputUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 6,
                    color: 'var(--text)',
                    fontFamily: 'var(--font-m)',
                    fontSize: 13,
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: '6px 10px' }}
                  onClick={() => handleToggleStatus(selectedCam.id)}
                >
                  Toggle Status ({selectedCam.status === 'offline' ? 'Set Online' : 'Set Offline'})
                </button>
                {selectedCam.videoSrc && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 12, padding: '6px 10px', color: 'var(--red)' }}
                    onClick={() => {
                      setVideoInputUrl('')
                    }}
                  >
                    Clear Stream
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSelectedCam(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Feed
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
