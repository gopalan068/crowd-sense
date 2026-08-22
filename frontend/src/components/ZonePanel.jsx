/**
 * frontend/src/components/ZonePanel.jsx
 * Operational Zone Panel displaying live camera feed, real input video stream,
 * density metrics, and intensity overlay.
 */
import React, { useEffect, useRef, useState } from 'react'
import ZoneIntensityOverlay from './ZoneIntensityOverlay'

const STREAM_BASE_URL = 'http://localhost:5001/stream'

export default function ZonePanel({ zoneData, zoneId = 'zone_1' }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const z1CanvasRef = useRef(null)

  const [useMjpegStream, setUseMjpegStream] = useState(true)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState(null)

  const isCorridor = zoneData?.zone_type === 'corridor' || zoneId === 'zone_2'
  const isLive = zoneData?.feed_source === 'live_webcam' || zoneId === 'zone_1'

  // Reset MJPEG stream on zone change
  useEffect(() => {
    setUseMjpegStream(true)
  }, [zoneId])

  // Safely attach browser webcam feed for Zone 1 if MJPEG is unavailable
  useEffect(() => {
    let stream = null

    if (isLive && !isCorridor && !useMjpegStream) {
      if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
        navigator.mediaDevices
          .getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 } } })
          .then((mediaStream) => {
            stream = mediaStream
            if (videoRef.current) {
              videoRef.current.srcObject = mediaStream
              setCameraActive(true)
              setCameraError(null)
            }
          })
          .catch((err) => {
            console.warn('[ZonePanel] WebCam access error:', err)
            setCameraError(err.message || 'Camera access blocked')
            setCameraActive(false)
          })
      } else {
        setCameraError('Webcam API unavailable over HTTP IP. Open via http://localhost:5173')
        setCameraActive(false)
      }
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [isLive, isCorridor, useMjpegStream])

  // Canvas animation for Zone 1 fallback when webcam & MJPEG are inactive
  useEffect(() => {
    if (isLive && !isCorridor && !useMjpegStream && !cameraActive && z1CanvasRef.current) {
      const canvas = z1CanvasRef.current
      const ctx = canvas.getContext('2d')
      let animId

      const count = zoneData?.people_count || 12

      const render = () => {
        ctx.fillStyle = '#090d16'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.1)'
        ctx.lineWidth = 1
        for (let x = 0; x < canvas.width; x += 25) {
          ctx.beginPath()
          ctx.moveTo(x, 0)
          ctx.lineTo(x, canvas.height)
          ctx.stroke()
        }

        const now = Date.now() * 0.0015
        for (let i = 0; i < count; i++) {
          const x = 30 + ((i * 53 + Math.sin(now + i) * 20) % (canvas.width - 60))
          const y = 30 + ((i * 37 + Math.cos(now * 0.7 + i) * 25) % (canvas.height - 60))

          ctx.fillStyle = '#10b981'
          ctx.beginPath()
          ctx.arc(x, y - 8, 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillRect(x - 6, y - 2, 12, 16)

          ctx.strokeStyle = '#10b981'
          ctx.lineWidth = 1.5
          ctx.strokeRect(x - 9, y - 16, 18, 32)
        }

        animId = requestAnimationFrame(render)
      }

      render()
      return () => cancelAnimationFrame(animId)
    }
  }, [isLive, isCorridor, useMjpegStream, cameraActive, zoneData?.people_count])

  // Canvas animation for Zone 2 Emergency Corridor simulation fallback
  useEffect(() => {
    if (isCorridor && !useMjpegStream && canvasRef.current) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      let animationFrameId

      const count = zoneData?.people_count || 35

      const render = () => {
        ctx.fillStyle = '#0f172a'
        ctx.fillRect(0, 0, canvas.width, canvas.height)

        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(40, 0)
        ctx.lineTo(40, canvas.height)
        ctx.moveTo(canvas.width - 40, 0)
        ctx.lineTo(canvas.width - 40, canvas.height)
        ctx.stroke()

        const now = Date.now() * 0.002
        for (let i = 0; i < count; i++) {
          const x = 60 + ((i * 47 + Math.sin(now + i) * 15) % (canvas.width - 120))
          const y = 30 + ((i * 31 + Math.cos(now * 0.8 + i) * 20) % (canvas.height - 60))

          ctx.fillStyle = 'rgba(248, 250, 252, 0.85)'
          ctx.beginPath()
          ctx.arc(x, y - 8, 6, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillRect(x - 6, y - 2, 12, 16)

          ctx.strokeStyle = '#38bdf8'
          ctx.lineWidth = 1.5
          ctx.strokeRect(x - 9, y - 16, 18, 32)
        }

        animationFrameId = requestAnimationFrame(render)
      }

      render()

      return () => cancelAnimationFrame(animationFrameId)
    }
  }, [isCorridor, useMjpegStream, zoneData?.people_count])

  if (!zoneData) {
    return (
      <div
        className="rounded-xl p-8 border text-center flex flex-col items-center justify-center min-h-[300px]"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="w-10 h-10 rounded-full border-4 border-t-sky-600 animate-spin mb-3" />
        <p className="font-semibold text-lg" style={{ color: 'var(--color-text)' }}>
          Awaiting {zoneId} Stream Data…
        </p>
        <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
          Start the CV service (`python main.py --z1 video.mp4`).
        </p>
      </div>
    )
  }

  const {
    zone_id = zoneId,
    zone_type = 'general',
    feed_source = 'live_webcam',
    camera_type = 'drone',
    people_count = 0,
    density = 0,
    risk_level = 'green',
    risk_score = 0,
    trend_slope = 0,
    eta_to_red_min = null,
    red_threshold = zone_type === 'corridor' ? 2.0 : 3.5,
    timestamp = new Date().toISOString(),
  } = zoneData

  const streamUrl = `${STREAM_BASE_URL}/${zone_id}`

  return (
    <div
      className={`rounded-xl border shadow-sm overflow-hidden flex flex-col transition-all ${
        isCorridor ? 'corridor-hazard-border border-red-400 dark:border-red-600' : ''
      }`}
      style={{
        background: 'var(--color-surface)',
        borderColor: isCorridor ? 'var(--risk-red)' : 'var(--color-border)',
      }}
    >
      {/* Zone Header */}
      <div
        className="px-5 py-3 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-hover)' }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-mono-num px-2.5 py-1 rounded-lg font-bold uppercase tracking-wider border shadow-xs"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
            ZONE: {zone_id}
          </span>

          <span className={`text-[11px] px-2.5 py-1 rounded-lg font-extrabold font-mono-num uppercase tracking-wider ${
            camera_type === 'drone'
              ? 'bg-indigo-600 text-white'
              : 'bg-sky-700 text-white'
          }`}>
            {camera_type === 'drone' ? '🛸 DRONE OVERHEAD' : '📹 CCTV ANGLE'}
          </span>
        </div>

        <div className="text-xs font-mono-num" style={{ color: 'var(--color-muted)' }}>
          {new Date(timestamp).toLocaleTimeString()}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* Video / Visual Stream Box (7 Cols) */}
        <div className="lg:col-span-7 relative min-h-[260px] rounded-xl overflow-hidden bg-slate-950 border border-slate-700 flex items-center justify-center">

          {/* MJPEG Live Stream from CV Service */}
          {useMjpegStream ? (
            <img
              src={streamUrl}
              alt={`Live Stream ${zone_id}`}
              className="w-full h-full object-cover"
              onError={() => {
                console.warn(`[ZonePanel] MJPEG Stream not available at ${streamUrl}, falling back to webcam/simulator.`)
                setUseMjpegStream(false)
              }}
            />
          ) : isLive && !isCorridor ? (
            /* Webcam Fallback */
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
              />
              {!cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
                  <canvas
                    ref={z1CanvasRef}
                    width={400}
                    height={260}
                    className="w-full h-full object-cover opacity-80"
                  />
                  {cameraError && (
                    <div className="absolute bottom-2 left-2 right-2 p-2 rounded bg-black/80 backdrop-blur text-[10px] text-amber-300 font-mono-num text-center">
                      ℹ️ {cameraError}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Canvas Video Feed Simulation Fallback */
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
              <canvas
                ref={canvasRef}
                width={400}
                height={260}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Integrated Zone Intensity Overlay */}
          <ZoneIntensityOverlay riskLevel={risk_level} density={density} riskScore={risk_score} />
        </div>

        {/* Metrics Column (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-3">
          <div className="p-4 rounded-xl border flex items-center justify-between"
               style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
            <div>
              <p className="text-[11px] uppercase font-bold tracking-wider" style={{ color: 'var(--color-muted)' }}>
                Current Density
              </p>
              <div className="text-3xl font-extrabold font-mono-num mt-0.5" style={{ color: 'var(--color-text)' }}>
                {density.toFixed(2)}
                <span className="text-xs font-normal ml-1" style={{ color: 'var(--color-muted)' }}>p / m²</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold font-mono-num" style={{ color: 'var(--color-text)' }}>
                {people_count}
              </span>
              <p className="text-[11px] uppercase font-bold tracking-wider" style={{ color: 'var(--color-muted)' }}>
                Headcount
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
              <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--color-muted)' }}>
                Rate of Rise (Slope)
              </p>
              <p className="text-base font-bold font-mono-num mt-0.5"
                 style={{ color: trend_slope > 0.5 ? 'var(--risk-orange)' : 'var(--color-text)' }}>
                {trend_slope > 0 ? `+${trend_slope.toFixed(2)}` : trend_slope.toFixed(2)}
                <span className="text-[9px] font-normal ml-1" style={{ color: 'var(--color-muted)' }}>p/m²/min</span>
              </p>
            </div>

            <div className="p-3 rounded-lg border" style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
              <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--color-muted)' }}>
                ETA to Red ({red_threshold} p/m²)
              </p>
              <p className="text-base font-bold font-mono-num mt-0.5" style={{ color: 'var(--color-text)' }}>
                {eta_to_red_min === 0 ? (
                  <span style={{ color: 'var(--risk-red)' }}>CRITICAL NOW</span>
                ) : eta_to_red_min ? (
                  `~${eta_to_red_min} min`
                ) : (
                  <span style={{ color: 'var(--risk-green)' }}>STABLE</span>
                )}
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded-lg border text-[11px] flex justify-between items-center font-mono-num"
               style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
            <span>Red Threshold Limit:</span>
            <span className="font-bold" style={{ color: isCorridor ? 'var(--risk-red)' : 'var(--color-text)' }}>
              {red_threshold} p/m² ({isCorridor ? 'STRICT EGRESS' : 'STANDARD'})
            </span>
          </div>
        </div>

      </div>
    </div>
  )
}
