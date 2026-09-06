/**
 * frontend/src/components/Venue25DViewer.jsx
 *
 * High-Performance Three.js 2.5D/3D Venue Visualizer with Integrated
 * Real-Time Social Force Model (SFM) Simulation Engine.
 *
 * - Renders 1000+ simulated 3D pedestrian agents with GPU instancing (InstancedMesh)
 * - Real-time velocity alignment, dynamic panic/speed color mapping, and evacuation routing
 * - Live crowd-control barricades, dynamic emergency gates (Open/Closed), exits, and spawns
 * - Standalone solid building extrusions with authentic urban rooftop architecture
 * - Tight, balanced baseplane pedestal with exact 2-grid-square margin
 * - Embedded 3D simulation controls toolbar (Play, Pause, Reset, Emergency)
 */
import React, { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getDensityBand } from '../lib/fruinDensity.js'

/**
 * Deterministic pseudo-random number generator for consistent rooftop details
 */
function pseudoRandom(seed) {
  let s = Math.abs(seed) % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/**
 * Check if a 2D point is inside a polygon (ray casting)
 */
function isPointInPoly(pt, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
      (pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * Convert an open polyline wall into a solid thick polygon so open walls
 * extrude with solid walls and solid roof instead of hollow diagonal cutouts.
 */
function polylineToThickPolygon(pts, thickness = 14) {
  if (!pts || pts.length < 2) return pts
  const left = []
  const right = []
  const half = thickness / 2

  for (let i = 0; i < pts.length; i++) {
    let nx = 0, ny = 0
    if (i === 0) {
      const dx = pts[1].x - pts[0].x
      const dy = pts[1].y - pts[0].y
      const len = Math.hypot(dx, dy) || 1
      nx = -dy / len
      ny = dx / len
    } else if (i === pts.length - 1) {
      const dx = pts[i].x - pts[i - 1].x
      const dy = pts[i].y - pts[i - 1].y
      const len = Math.hypot(dx, dy) || 1
      nx = -dy / len
      ny = dx / len
    } else {
      const dx1 = pts[i].x - pts[i - 1].x
      const dy1 = pts[i].y - pts[i - 1].y
      const len1 = Math.hypot(dx1, dy1) || 1
      const dx2 = pts[i + 1].x - pts[i].x
      const dy2 = pts[i + 1].y - pts[i].y
      const len2 = Math.hypot(dx2, dy2) || 1
      nx = (-dy1 / len1 - dy2 / len2) / 2
      ny = (dx1 / len1 + dx2 / len2) / 2
      const nlen = Math.hypot(nx, ny) || 1
      nx /= nlen
      ny /= nlen
    }
    left.push({ x: pts[i].x + nx * half, y: pts[i].y + ny * half })
    right.unshift({ x: pts[i].x - nx * half, y: pts[i].y - ny * half })
  }
  return [...left, ...right]
}

/**
 * Remove duplicate consecutive points and collinear backtracking
 */
function sanitizePolygonPoints(pts) {
  if (!pts || pts.length < 3) return pts
  const clean = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (clean.length > 0) {
      const prev = clean[clean.length - 1]
      if (Math.hypot(p.x - prev.x, p.y - prev.y) < 1.5) continue
    }
    clean.push(p)
  }
  if (clean.length > 2) {
    const first = clean[0]
    const last = clean[clean.length - 1]
    if (Math.hypot(first.x - last.x, first.y - last.y) < 1.5) clean.pop()
  }
  return clean
}

export default function Venue25DViewer({
  layout,
  focusPoint = null,
  isFocusMode = false,
  width = 800,
  height = 850,
  onResetToDemo = null,
  // ── Simulation Engine Props ──────────────────────────────────────────────
  agentsRef = null,
  simMode = 'edit',
  isEmergency = false,
  agentCount = 0,
  simTimeSec = 0,
  maxDensityPpm2 = 0,
  fps = 0,
  onStart = null,
  onPause = null,
  onReset = null,
  onTriggerEmergency = null,
  onToggleEmergencyGate = null,
  onOpenAllOpenings = null,
  onCloseAllOpenings = null,
}) {
  const mountRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const rendererRef = useRef(null)
  const controlsRef = useRef(null)
  const dynamicGroupRef = useRef(null)
  const instancedAgentsRef = useRef(null)
  const venueCenterRef = useRef({ cx: 400, cz: 425, pxM: 25 })
  const venueBoundsRef = useRef({ vxMin: -400, vxMax: 400, vzMin: -425, vzMax: 425 })
  const interactiveGateMeshesRef = useRef([])
  const raycasterRef = useRef(new THREE.Raycaster())
  const mouseVecRef = useRef(new THREE.Vector2())
  const onToggleEmergencyGateRef = useRef(onToggleEmergencyGate)

  const [structureCount, setStructureCount] = useState(0)
  const [gateStats, setGateStats] = useState({ open: 0, closed: 0 })
  const [activeCameraPreset, setActiveCameraPreset] = useState('isometric')
  const [sceneReady, setSceneReady] = useState(0)

  useEffect(() => {
    onToggleEmergencyGateRef.current = onToggleEmergencyGate
  }, [onToggleEmergencyGate])

  // Reusable dummy objects for Three.js instance matrix & color calculations
  const dummyObjRef = useRef(new THREE.Object3D())
  const colorNormalRef = useRef(new THREE.Color(0x38bdf8))      // Sky cyan
  const colorPanicRef = useRef(new THREE.Color(0xef4444))       // Red panic
  const colorFocusRef = useRef(new THREE.Color(0xc084fc))       // Purple focus
  const colorEvacRef = useRef(new THREE.Color(0xf59e0b))        // Amber evac

  // ─── Initialize Three.js Scene ─────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const containerW = mount.clientWidth || width
    const containerH = Math.min(window.innerHeight * 0.78, height)

    // 1. Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0f1d)
    sceneRef.current = scene

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(
      42,
      containerW / containerH,
      10,
      4000
    )
    camera.position.set(0, 700, 840)
    cameraRef.current = camera

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(containerW, containerH)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    rendererRef.current = renderer

    mount.replaceChildren(renderer.domElement)

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.target.set(0, 0, 0)
    controls.minDistance = 150
    controls.maxDistance = 2400
    controls.maxPolarAngle = Math.PI / 2 - 0.04 // Prevent going beneath floor
    controlsRef.current = controls

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85)
    scene.add(ambientLight)

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.4)
    sunLight.position.set(-350, 800, -250)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.width = 2048
    sunLight.shadow.mapSize.height = 2048
    sunLight.shadow.camera.near = 50
    sunLight.shadow.camera.far = 2000
    sunLight.shadow.camera.left = -600
    sunLight.shadow.camera.right = 600
    sunLight.shadow.camera.top = 600
    sunLight.shadow.camera.bottom = -600
    scene.add(sunLight)

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.45)
    fillLight.position.set(350, 450, 350)
    scene.add(fillLight)

    // Dynamic Group for venue layout entities
    const dynamicGroup = new THREE.Group()
    scene.add(dynamicGroup)
    dynamicGroupRef.current = dynamicGroup

    // 6. GPU Instanced Mesh for 3D Stylized Humanoid Pedestrian Agents
    const MAX_3D_AGENTS = 2000

    // Humanoid Body: Tapered torso & shoulders with adult human proportions
    const bodyGeo = new THREE.CylinderGeometry(4.0, 5.2, 10.5, 12)
    bodyGeo.translate(0, 5.25, 0)

    // Humanoid Head: Spherical head blob mounted on top of shoulders
    const headGeo = new THREE.SphereGeometry(3.4, 12, 10)
    headGeo.translate(0, 13.5, 0)

    const agentGeo = mergeGeometries([bodyGeo, headGeo], false)
    bodyGeo.dispose()
    headGeo.dispose()

    const agentMat = new THREE.MeshStandardMaterial({
      roughness: 0.35,
      metalness: 0.15,
    })
    const instancedMesh = new THREE.InstancedMesh(agentGeo, agentMat, MAX_3D_AGENTS)
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    instancedMesh.castShadow = true
    instancedMesh.receiveShadow = true
    instancedMesh.count = 0
    scene.add(instancedMesh)
    instancedAgentsRef.current = instancedMesh

    // Notify layout builder that scene is ready
    setSceneReady(n => n + 1)

    // ── Interactive Raycasting on 3D Emergency Gates ─────────────────────────
    let downPos = { x: 0, y: 0 }
    const dom = renderer.domElement

    const handlePointerDown = (e) => {
      downPos = { x: e.clientX, y: e.clientY }
    }

    const handlePointerUp = (e) => {
      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y)
      if (dist > 6) return // Dragged/orbited, not a click

      const rect = dom.getBoundingClientRect()
      const mouse = mouseVecRef.current
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      const raycaster = raycasterRef.current
      raycaster.setFromCamera(mouse, camera)

      const interactive = interactiveGateMeshesRef.current
      const targets = interactive.map(item => item.mesh)
      const hits = raycaster.intersectObjects(targets, true)

      if (hits.length > 0) {
        const hitObj = hits[0].object
        const match = interactive.find(item => item.mesh === hitObj || item.mesh.children.includes(hitObj))
        if (match && onToggleEmergencyGateRef.current) {
          onToggleEmergencyGateRef.current(match.gateId)
        }
      }
    }

    const handlePointerMove = (e) => {
      const rect = dom.getBoundingClientRect()
      const mouse = mouseVecRef.current
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      const raycaster = raycasterRef.current
      raycaster.setFromCamera(mouse, camera)

      const interactive = interactiveGateMeshesRef.current
      const targets = interactive.map(item => item.mesh)
      const hits = raycaster.intersectObjects(targets, true)

      if (hits.length > 0) {
        dom.style.cursor = 'pointer'
      } else {
        dom.style.cursor = 'grab'
      }
    }

    dom.addEventListener('pointerdown', handlePointerDown)
    dom.addEventListener('pointerup', handlePointerUp)
    dom.addEventListener('pointermove', handlePointerMove)

    // 7. Animation / Render Loop (Sim + Camera)
    let animId
    const dummy = dummyObjRef.current
    const cNormal = colorNormalRef.current
    const cPanic = colorPanicRef.current
    const cFocus = colorFocusRef.current
    const cEvac = colorEvacRef.current

    const animate = () => {
      animId = requestAnimationFrame(animate)
      controls.update()

      // Update 3D Simulated Agents from Social Force Model simulation
      const instMesh = instancedAgentsRef.current
      if (instMesh) {
        const rawAgents = agentsRef?.current || []
        const { cx, cz, pxM } = venueCenterRef.current
        const bounds = venueBoundsRef.current || { vxMin: -400, vxMax: 400, vzMin: -425, vzMax: 425 }
        let activeCount = 0
        const nowMs = performance.now() * 0.008

        for (let i = 0; i < rawAgents.length && i < MAX_3D_AGENTS; i++) {
          const agent = rawAgents[i]
          if (agent.reachedExit) continue

          const rawX3d = agent.pos.x * pxM - cx
          const rawZ3d = agent.pos.y * pxM - cz
          const y3d = 0.2 // Ground contact level

          // Strictly clamp 3D agents within the virtual venue boundary (cannot enter exterior 2 squares)
          const x3d = Math.max(bounds.vxMin + 1.2, Math.min(bounds.vxMax - 1.2, rawX3d))
          const z3d = Math.max(bounds.vzMin + 1.2, Math.min(bounds.vzMax - 1.2, rawZ3d))

          // Rotate agent mesh in direction of movement velocity + natural walking bob
          const vx = agent.vel?.x || 0
          const vy = agent.vel?.y || 0
          const speed = Math.hypot(vx, vy)
          const bob = speed > 0.08 ? Math.sin((agent.id * 1.5) + nowMs) * 0.35 : 0

          dummy.position.set(x3d, y3d + bob, z3d)

          if (speed > 0.08) {
            dummy.rotation.y = -Math.atan2(vy, vx) + Math.PI / 2
          }

          dummy.updateMatrix()
          instMesh.setMatrixAt(activeCount, dummy.matrix)

          // Color based on agent state
          let agentColor = cNormal
          if (agent.isPanic) {
            agentColor = cPanic
          } else if (agent.isFocus) {
            agentColor = cFocus
          } else if (agent.goalExit?.isEmergencyOpening) {
            agentColor = cEvac
          }

          instMesh.setColorAt(activeCount, agentColor)
          activeCount++
        }

        instMesh.count = activeCount
        instMesh.instanceMatrix.needsUpdate = true
        if (instMesh.instanceColor) {
          instMesh.instanceColor.needsUpdate = true
        }
      }

      renderer.render(scene, camera)
    }
    animate()

    // 8. Resize Handler
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return
      const nw = mountRef.current.clientWidth || width
      const nh = Math.min(window.innerHeight * 0.78, height)
      cameraRef.current.aspect = nw / nh
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(nw, nh)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      dom.removeEventListener('pointerdown', handlePointerDown)
      dom.removeEventListener('pointerup', handlePointerUp)
      dom.removeEventListener('pointermove', handlePointerMove)
      controls.dispose()
      renderer.dispose()
      if (instancedMesh.geometry) instancedMesh.geometry.dispose()
      if (instancedMesh.material) instancedMesh.material.dispose()
      mount.replaceChildren()
    }
  }, [width, height])

  // ─── Build / Rebuild 3D Entities on Layout Changes ─────────────────────────
  useEffect(() => {
    const dynamicGroup = dynamicGroupRef.current
    if (!dynamicGroup) return

    // Clear previous dynamic entities
    while (dynamicGroup.children.length > 0) {
      const obj = dynamicGroup.children[0]
      dynamicGroup.remove(obj)
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose())
        } else {
          obj.material.dispose()
        }
      }
    }

    if (!layout) return

    // ── Compute Accurate Venue Bounding Box ─────────────────────────────────
    let minX = 0, maxX = layout.canvasWidth || 800
    let minY = 0, maxY = layout.canvasHeight || 850

    const allPts = []
    for (const w of (layout.walls || [])) {
      for (const p of (w.points || [])) allPts.push(p)
    }
    for (const s of (layout.spawns || [])) allPts.push({ x: s.x, y: s.y })
    for (const e of (layout.exits || [])) {
      if (e.a) allPts.push(e.a)
      if (e.b) allPts.push(e.b)
    }
    for (const b of (layout.barricades || [])) {
      if (b.a) allPts.push(b.a)
      if (b.b) allPts.push(b.b)
    }
    for (const o of (layout.openings || [])) {
      if (o.a) allPts.push(o.a)
      if (o.b) allPts.push(o.b)
    }
    if (focusPoint) allPts.push(focusPoint)

    if (allPts.length > 0) {
      minX = Math.min(...allPts.map(p => p.x))
      maxX = Math.max(...allPts.map(p => p.x))
      minY = Math.min(...allPts.map(p => p.y))
      maxY = Math.max(...allPts.map(p => p.y))
    }

    // Grid cell size: 25px (= 1 meter / 1 grid square)
    const pxM = layout.scale?.px_per_meter || 25
    const gridCell = pxM
    // Exactly 2 squares margin over the venue boundary
    const margin = 2 * gridCell // 50px on each side

    const groundMinX = minX - margin
    const groundMaxX = maxX + margin
    const groundMinY = minY - margin
    const groundMaxY = maxY + margin

    // Exact geometric center
    const cx = (groundMinX + groundMaxX) / 2
    const cz = (groundMinY + groundMaxY) / 2

    venueCenterRef.current = { cx, cz, pxM }

    const groundW = groundMaxX - groundMinX
    const groundD = groundMaxY - groundMinY
    const halfW = groundW / 2
    const halfD = groundD / 2

    // ── 0. Tight Baseplane Pedestal (Venue + exactly 2 grid squares) ─────────
    const groundGeo = new THREE.BoxGeometry(groundW, 12, groundD)
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
      metalness: 0.1,
    })
    const groundMesh = new THREE.Mesh(groundGeo, groundMat)
    groundMesh.position.set(0, -6, 0)
    groundMesh.receiveShadow = true
    dynamicGroup.add(groundMesh)

    // Rectangular Grid matching exact tight baseplane dimensions
    const gridPositions = []
    for (let x = -halfW; x <= halfW + 0.1; x += gridCell) {
      gridPositions.push(x, 0.2, -halfD, x, 0.2, halfD)
    }
    for (let z = -halfD; z <= halfD + 0.1; z += gridCell) {
      gridPositions.push(-halfW, 0.2, z, halfW, 0.2, z)
    }
    const gridGeo = new THREE.BufferGeometry()
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPositions, 3))
    const gridLines = new THREE.LineSegments(
      gridGeo,
      new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.8 })
    )
    dynamicGroup.add(gridLines)

    // Cyan Outline Rim around the Baseplane Outer Pedestal
    const borderGeo = new THREE.BufferGeometry()
    borderGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      -halfW, 0.25, -halfD,   halfW, 0.25, -halfD,
       halfW, 0.25, -halfD,   halfW, 0.25,  halfD,
       halfW, 0.25,  halfD,  -halfW, 0.25,  halfD,
      -halfW, 0.25,  halfD,  -halfW, 0.25, -halfD,
    ], 3))
    const borderLines = new THREE.LineSegments(
      borderGeo,
      new THREE.LineBasicMaterial({ color: 0x0369a1, linewidth: 1.5 })
    )
    dynamicGroup.add(borderLines)

    // ── 0b. Virtual Venue Boundary Perimeter (Walkable Venue Limit) ─────────
    const vxMin = minX - cx
    const vxMax = maxX - cx
    const vzMin = minY - cz
    const vzMax = maxY - cz
    venueBoundsRef.current = { vxMin, vxMax, vzMin, vzMax }

    // Glowing Neon Virtual Venue Boundary Line
    const venueBorderGeo = new THREE.BufferGeometry()
    venueBorderGeo.setAttribute('position', new THREE.Float32BufferAttribute([
      vxMin, 0.45, vzMin,   vxMax, 0.45, vzMin,
      vxMax, 0.45, vzMin,   vxMax, 0.45, vzMax,
      vxMax, 0.45, vzMax,   vxMin, 0.45, vzMax,
      vxMin, 0.45, vzMax,   vxMin, 0.45, vzMin,
    ], 3))
    const venueBorderLines = new THREE.LineSegments(
      venueBorderGeo,
      new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 })
    )
    dynamicGroup.add(venueBorderLines)

    // Glowing Corner Security Pylons & Beacons at the 4 Venue Boundary Corners
    const pylonGeo = new THREE.CylinderGeometry(2.5, 3.2, 14, 16)
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.6,
    })
    const pylonBeaconGeo = new THREE.SphereGeometry(2.0, 12, 12)
    const pylonBeaconMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.9,
    })
    const boundaryCorners = [
      { x: vxMin, z: vzMin },
      { x: vxMax, z: vzMin },
      { x: vxMax, z: vzMax },
      { x: vxMin, z: vzMax },
    ]
    boundaryCorners.forEach(({ x, z }) => {
      const p = new THREE.Mesh(pylonGeo, pylonMat)
      p.position.set(x, 7, z)
      p.castShadow = true
      dynamicGroup.add(p)

      const b = new THREE.Mesh(pylonBeaconGeo, pylonBeaconMat)
      b.position.set(x, 15, z)
      dynamicGroup.add(b)
    })

    // Exterior Buffer Zone (2 Grid Squares Margin outside Venue Boundary)
    // Subtle cross-hatch warning lines showing it is the exterior buffer where agents cannot go
    const exteriorHatchGeo = new THREE.BufferGeometry()
    const hatchPositions = []
    // North buffer strip
    for (let x = -halfW; x < halfW; x += gridCell) {
      hatchPositions.push(x, 0.22, -halfD, x + gridCell, 0.22, vzMin)
    }
    // South buffer strip
    for (let x = -halfW; x < halfW; x += gridCell) {
      hatchPositions.push(x, 0.22, vzMax, x + gridCell, 0.22, halfD)
    }
    // West buffer strip
    for (let z = -halfD; z < halfD; z += gridCell) {
      hatchPositions.push(-halfW, 0.22, z, vxMin, 0.22, z + gridCell)
    }
    // East buffer strip
    for (let z = -halfD; z < halfD; z += gridCell) {
      hatchPositions.push(vxMax, 0.22, z, halfW, 0.22, z + gridCell)
    }
    exteriorHatchGeo.setAttribute('position', new THREE.Float32BufferAttribute(hatchPositions, 3))
    const exteriorHatchLines = new THREE.LineSegments(
      exteriorHatchGeo,
      new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.45 })
    )
    dynamicGroup.add(exteriorHatchLines)

    let builtCount = 0
    let openGates = 0
    let closedGates = 0

    // ── Reusable Materials for Rooftop Elements ─────────────────────────────
    const hvacMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.3 })
    const hvacGrilleMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 })
    const waterTankBlueMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3, metalness: 0.1 })
    const waterTankSilverMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4, metalness: 0.5 })
    const solarMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.2, metalness: 0.8 })
    const penthouseMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 })
    const penthouseRoofMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5 })
    const antennaMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8, roughness: 0.3 })
    const antennaLightMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.8 })

    // ── 1. Standalone Extruded Buildings ────────────────────────────────────
    const defaultWallMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.6,
      metalness: 0.15,
      side: THREE.DoubleSide,
    })
    const defaultEdgeMat = new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 1 })

    const gopuramMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.4,
      metalness: 0.25,
      side: THREE.DoubleSide,
    })
    const gopuramEdgeMat = new THREE.LineBasicMaterial({ color: 0xfde68a, linewidth: 1 })

    const chariotMat = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      roughness: 0.5,
      metalness: 0.1,
      side: THREE.DoubleSide,
    })
    const chariotEdgeMat = new THREE.LineBasicMaterial({ color: 0xfdba74, linewidth: 1 })

    const compoundMat = new THREE.MeshStandardMaterial({
      color: 0x4338ca,
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
    })
    const compoundEdgeMat = new THREE.LineBasicMaterial({ color: 0xa5b4fc, linewidth: 1 })

    for (const wall of (layout.walls || [])) {
      let rawPts = wall.points || []
      if (rawPts.length < 2) continue

      const isClosed = Boolean(wall.closed)
      const pts = isClosed ? sanitizePolygonPoints(rawPts) : polylineToThickPolygon(rawPts, 16)
      if (pts.length < 3) continue

      const id = (wall.id || '').toLowerCase()
      const label = (wall.label || '').toLowerCase()

      const isGopuram = id.includes('temple_gate') || label.includes('gopuram')
      const isChariot = id.includes('chariot') || label.includes('chariot') || label.includes('rath')
      const isCompound = id.includes('compound') || label.includes('compound')

      let heightVal = 44
      let useMat = defaultWallMat
      let useEdgeMat = defaultEdgeMat

      if (isGopuram) {
        heightVal = 92
        useMat = gopuramMat
        useEdgeMat = gopuramEdgeMat
      } else if (isChariot) {
        heightVal = 36
        useMat = chariotMat
        useEdgeMat = chariotEdgeMat
      } else if (isCompound) {
        heightVal = 18
        useMat = compoundMat
        useEdgeMat = compoundEdgeMat
      }

      // Create 2D Shape in X-Z space
      const shape = new THREE.Shape()
      shape.moveTo(pts[0].x - cx, -(pts[0].y - cz))
      for (let i = 1; i < pts.length; i++) {
        shape.lineTo(pts[i].x - cx, -(pts[i].y - cz))
      }
      shape.closePath()

      // Extrude 3D Geometry
      const extrudeSettings = {
        depth: heightVal,
        bevelEnabled: false,
        steps: 1,
      }

      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings)
      const mesh = new THREE.Mesh(geom, useMat)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = 0
      mesh.castShadow = true
      mesh.receiveShadow = true

      // Edge highlights
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geom), useEdgeMat)
      mesh.add(edges)

      // Dedicated Top Roof Cap to guarantee 100% solid, filled roof surface
      const roofGeo = new THREE.ShapeGeometry(shape)
      const roofMesh = new THREE.Mesh(roofGeo, useMat)
      roofMesh.rotation.x = -Math.PI / 2
      roofMesh.position.y = heightVal + 0.1
      roofMesh.receiveShadow = true
      dynamicGroup.add(roofMesh)

      // Spire for Gopuram
      if (isGopuram) {
        const topConeGeo = new THREE.ConeGeometry(8, 20, 4)
        const topConeMat = new THREE.MeshStandardMaterial({
          color: 0xfbbf24,
          roughness: 0.2,
          metalness: 0.8,
        })
        const coneMesh = new THREE.Mesh(topConeGeo, topConeMat)
        const avgX = pts.reduce((s, p) => s + p.x, 0) / pts.length - cx
        const avgZ = pts.reduce((s, p) => s + p.y, 0) / pts.length - cz
        coneMesh.position.set(avgX, heightVal + 10, avgZ)
        coneMesh.castShadow = true
        dynamicGroup.add(coneMesh)
      }

      // ── Rooftop Elements on Standard Buildings ────────────────────────────
      if (!isGopuram && !isChariot && !isCompound) {
        const minBX = Math.min(...pts.map(p => p.x))
        const maxBX = Math.max(...pts.map(p => p.x))
        const minBY = Math.min(...pts.map(p => p.y))
        const maxBY = Math.max(...pts.map(p => p.y))
        const bW = maxBX - minBX
        const bH = maxBY - minBY

        if (bW >= 36 && bH >= 36) {
          const seed = Math.round(minBX * 17 + minBY * 31 + bW * 7)
          const rng = pseudoRandom(seed)

          // 1. Stairwell Headroom / Penthouse Box
          const numPenthouses = Math.min(2, Math.floor((bW * bH) / 25000) + 1)
          for (let k = 0; k < numPenthouses; k++) {
            const px = minBX + 18 + rng() * Math.max(10, bW - 36)
            const py = minBY + 18 + rng() * Math.max(10, bH - 36)
            if (isPointInPoly({ x: px, y: py }, pts)) {
              const phGeo = new THREE.BoxGeometry(16, 8, 12)
              const phMesh = new THREE.Mesh(phGeo, penthouseMat)
              phMesh.position.set(px - cx, heightVal + 4, py - cz)
              phMesh.castShadow = true

              const phRoofGeo = new THREE.BoxGeometry(18, 1.5, 14)
              const phRoofMesh = new THREE.Mesh(phRoofGeo, penthouseRoofMat)
              phRoofMesh.position.set(px - cx, heightVal + 8.5, py - cz)
              dynamicGroup.add(phMesh)
              dynamicGroup.add(phRoofMesh)
            }
          }

          // 2. Water Storage Tanks (Cylinders)
          const numTanks = Math.min(3, Math.floor((bW * bH) / 18000) + 1)
          for (let k = 0; k < numTanks; k++) {
            const tx = minBX + 14 + rng() * Math.max(10, bW - 28)
            const ty = minBY + 14 + rng() * Math.max(10, bH - 28)
            if (isPointInPoly({ x: tx, y: ty }, pts)) {
              const tankMat = rng() > 0.4 ? waterTankBlueMat : waterTankSilverMat
              const tankGeo = new THREE.CylinderGeometry(4.5, 4.5, 7, 14)
              const tankMesh = new THREE.Mesh(tankGeo, tankMat)
              tankMesh.position.set(tx - cx, heightVal + 3.5, ty - cz)
              tankMesh.castShadow = true
              dynamicGroup.add(tankMesh)
            }
          }

          // 3. HVAC Air Conditioning Chillers
          const numHVAC = Math.min(3, Math.floor((bW * bH) / 15000) + 1)
          for (let k = 0; k < numHVAC; k++) {
            const ax = minBX + 16 + rng() * Math.max(10, bW - 32)
            const ay = minBY + 16 + rng() * Math.max(10, bH - 32)
            if (isPointInPoly({ x: ax, y: ay }, pts)) {
              const hvacGeo = new THREE.BoxGeometry(12, 4.5, 9)
              const hvacMesh = new THREE.Mesh(hvacGeo, hvacMat)
              hvacMesh.position.set(ax - cx, heightVal + 2.25, ay - cz)
              hvacMesh.castShadow = true

              const fanGeo = new THREE.CylinderGeometry(2.5, 2.5, 0.6, 12)
              const fanMesh = new THREE.Mesh(fanGeo, hvacGrilleMat)
              fanMesh.position.set(ax - cx, heightVal + 4.8, ay - cz)
              dynamicGroup.add(hvacMesh)
              dynamicGroup.add(fanMesh)
            }
          }

          // 4. Solar Panel Photovoltaic Arrays
          if ((bW >= 65 || bH >= 80) && rng() > 0.25) {
            const solX = minBX + 22 + rng() * Math.max(10, bW - 60)
            const solY = minBY + 22 + rng() * Math.max(10, bH - 60)
            for (let r = 0; r < 2; r++) {
              for (let c = 0; c < 3; c++) {
                const spx = solX + c * 11
                const spy = solY + r * 8
                if (isPointInPoly({ x: spx, y: spy }, pts)) {
                  const spGeo = new THREE.BoxGeometry(9, 1, 6)
                  const spMesh = new THREE.Mesh(spGeo, solarMat)
                  spMesh.position.set(spx - cx, heightVal + 1.2, spy - cz)
                  spMesh.rotation.x = 0.22
                  dynamicGroup.add(spMesh)
                }
              }
            }
          }

          // 5. Communications / Telecom Mast
          if ((bW >= 50 || bH >= 80) && rng() > 0.4) {
            const antX = minBX + 20 + rng() * Math.max(10, bW - 40)
            const antY = minBY + 20 + rng() * Math.max(10, bH - 40)
            if (isPointInPoly({ x: antX, y: antY }, pts)) {
              const mastGeo = new THREE.CylinderGeometry(0.7, 0.9, 24, 8)
              const mastMesh = new THREE.Mesh(mastGeo, antennaMat)
              mastMesh.position.set(antX - cx, heightVal + 12, antY - cz)
              mastMesh.castShadow = true

              const lightGeo = new THREE.SphereGeometry(1.6, 8, 8)
              const lightMesh = new THREE.Mesh(lightGeo, antennaLightMat)
              lightMesh.position.set(antX - cx, heightVal + 24, antY - cz)
              dynamicGroup.add(mastMesh)
              dynamicGroup.add(lightMesh)
            }
          }

          // 6. Glass Skylight Atrium Pyramids
          if (id.includes('ce_complex') || (bW > 70 && bH > 90)) {
            const skylightPositions = id.includes('ce_complex')
              ? [{ x: minBX + bW * 0.45, y: 110 }, { x: minBX + bW * 0.52, y: 460 }]
              : [{ x: minBX + bW * 0.48, y: minBY + bH * 0.42 }]

            for (const sp of skylightPositions) {
              if (isPointInPoly(sp, pts)) {
                const skyGeo = new THREE.ConeGeometry(11, 6.5, 4)
                const skyMat = new THREE.MeshStandardMaterial({
                  color: 0x38bdf8,
                  transparent: true,
                  opacity: 0.75,
                  roughness: 0.1,
                  metalness: 0.8,
                  side: THREE.DoubleSide,
                })
                const skyMesh = new THREE.Mesh(skyGeo, skyMat)
                skyMesh.rotation.y = Math.PI / 4
                skyMesh.position.set(sp.x - cx, heightVal + 3.25, sp.y - cz)
                skyMesh.castShadow = true

                const skyFrame = new THREE.LineSegments(
                  new THREE.EdgesGeometry(skyGeo),
                  new THREE.LineBasicMaterial({ color: 0xe0f2fe, linewidth: 1.5 })
                )
                skyMesh.add(skyFrame)
                dynamicGroup.add(skyMesh)

                const curbGeo = new THREE.BoxGeometry(17, 1.2, 17)
                const curbMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 })
                const curbMesh = new THREE.Mesh(curbGeo, curbMat)
                curbMesh.position.set(sp.x - cx, heightVal + 0.6, sp.y - cz)
                dynamicGroup.add(curbMesh)
              }
            }
          }

          // 7. Elevated Industrial Water Tower on 4-Legged Stanchions
          if (id.includes('ce_complex') || (bW > 80 && bH > 100)) {
            const towerX = minBX + bW * 0.42
            const towerY = id.includes('ce_complex') ? 370 : minBY + bH * 0.72
            if (isPointInPoly({ x: towerX, y: towerY }, pts)) {
              const legMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6, roughness: 0.4 })
              const legGeo = new THREE.CylinderGeometry(0.8, 0.8, 9, 6)
              const legOffsets = [[-4, -4], [4, -4], [4, 4], [-4, 4]]

              for (const [lx, lz] of legOffsets) {
                const legMesh = new THREE.Mesh(legGeo, legMat)
                legMesh.position.set(towerX - cx + lx, heightVal + 4.5, towerY - cz + lz)
                dynamicGroup.add(legMesh)
              }

              // Tank Body
              const bigTankGeo = new THREE.CylinderGeometry(6.5, 6.5, 8, 16)
              const bigTankMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5, roughness: 0.3 })
              const bigTankMesh = new THREE.Mesh(bigTankGeo, bigTankMat)
              bigTankMesh.position.set(towerX - cx, heightVal + 13, towerY - cz)
              bigTankMesh.castShadow = true
              dynamicGroup.add(bigTankMesh)
            }
          }

          // 8. Parabolic Satellite Communication Dishes
          if ((bW >= 45 || bH >= 60) && rng() > 0.35) {
            const dishPositions = id.includes('ce_complex')
              ? [{ x: minBX + bW * 0.55, y: 180 }, { x: minBX + bW * 0.45, y: 680 }]
              : [{ x: minBX + 22 + rng() * Math.max(10, bW - 44), y: minBY + 22 + rng() * Math.max(10, bH - 44) }]

            for (const dp of dishPositions) {
              if (isPointInPoly(dp, pts)) {
                const dishMountGeo = new THREE.CylinderGeometry(0.7, 0.7, 5, 8)
                const dishMountMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7 })
                const dishMount = new THREE.Mesh(dishMountGeo, dishMountMat)
                dishMount.position.set(dp.x - cx, heightVal + 2.5, dp.y - cz)
                dynamicGroup.add(dishMount)

                const dishGeo = new THREE.SphereGeometry(4.5, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45)
                const dishMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.4, roughness: 0.3, side: THREE.DoubleSide })
                const dishMesh = new THREE.Mesh(dishGeo, dishMat)
                dishMesh.rotation.x = -0.7
                dishMesh.rotation.y = 0.5
                dishMesh.position.set(dp.x - cx, heightVal + 6, dp.y - cz)
                dishMesh.castShadow = true
                dynamicGroup.add(dishMesh)
              }
            }
          }

          // 9. Rooftop Shade Pergola / Canopy Terraces
          if ((bW >= 55 && bH >= 55) && (id.includes('ce_complex') || rng() > 0.45)) {
            const pergX = id.includes('ce_complex') ? minBX + bW * 0.35 : minBX + 18 + rng() * Math.max(10, bW - 38)
            const pergY = id.includes('ce_complex') ? 290 : minBY + 18 + rng() * Math.max(10, bH - 38)
            if (isPointInPoly({ x: pergX, y: pergY }, pts) && isPointInPoly({ x: pergX + 16, y: pergY + 14 }, pts)) {
              const postMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 })
              const postGeo = new THREE.BoxGeometry(1.2, 7, 1.2)
              const offsets = [[0, 0], [16, 0], [16, 14], [0, 14]]
              for (const [ox, oz] of offsets) {
                const post = new THREE.Mesh(postGeo, postMat)
                post.position.set(pergX - cx + ox, heightVal + 3.5, pergY - cz + oz)
                dynamicGroup.add(post)
              }
              const beamMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.6 })
              for (let s = 0; s <= 14; s += 3.5) {
                const beamGeo = new THREE.BoxGeometry(17, 0.8, 1.2)
                const beam = new THREE.Mesh(beamGeo, beamMat)
                beam.position.set(pergX - cx + 8, heightVal + 7.4, pergY - cz + s)
                dynamicGroup.add(beam)
              }
            }
          }

          // 10. Additional Distributed Rooftop Elements along the Central-East Complex
          if (id.includes('ce_complex')) {
            const sol2X = minBX + bW * 0.4
            const sol2Y = 560
            for (let r = 0; r < 2; r++) {
              for (let c = 0; c < 3; c++) {
                const spx = sol2X + c * 10
                const spy = sol2Y + r * 7.5
                if (isPointInPoly({ x: spx, y: spy }, pts)) {
                  const spGeo = new THREE.BoxGeometry(8.5, 1, 5.5)
                  const spMesh = new THREE.Mesh(spGeo, solarMat)
                  spMesh.position.set(spx - cx, heightVal + 1.2, spy - cz)
                  spMesh.rotation.x = 0.22
                  dynamicGroup.add(spMesh)
                }
              }
            }

            const southUtilX = minBX + bW * 0.45
            const southUtilY = 760
            if (isPointInPoly({ x: southUtilX, y: southUtilY }, pts)) {
              const genGeo = new THREE.BoxGeometry(15, 6, 11)
              const genMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.4 })
              const genMesh = new THREE.Mesh(genGeo, genMat)
              genMesh.position.set(southUtilX - cx, heightVal + 3, southUtilY - cz)
              genMesh.castShadow = true
              dynamicGroup.add(genMesh)

              const pipeGeo = new THREE.CylinderGeometry(0.6, 0.6, 6, 8)
              const pipeMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8 })
              const pipe = new THREE.Mesh(pipeGeo, pipeMat)
              pipe.position.set(southUtilX - cx + 5, heightVal + 7, southUtilY - cz)
              dynamicGroup.add(pipe)

              const tank1 = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 6.5, 12), waterTankBlueMat)
              tank1.position.set(southUtilX - cx - 8, heightVal + 3.25, southUtilY - cz - 15)
              const tank2 = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 6.5, 12), waterTankBlueMat)
              tank2.position.set(southUtilX - cx + 2, heightVal + 3.25, southUtilY - cz - 15)
              dynamicGroup.add(tank1)
              dynamicGroup.add(tank2)
            }
          }
        }
      }

      dynamicGroup.add(mesh)
      builtCount++
    }

    setStructureCount(builtCount)

    // ── 2. Barricades (Low 3D Crowd Barriers) ──────────────────────────────
    const barricadeMat = new THREE.MeshStandardMaterial({
      color: 0xeab308,
      roughness: 0.4,
      metalness: 0.1,
    })

    for (const bar of (layout.barricades || [])) {
      if (!bar.a || !bar.b) continue
      const ax = bar.a.x - cx, az = bar.a.y - cz
      const bx = bar.b.x - cx, bz = bar.b.y - cz
      const dx = bx - ax, dz = bz - az
      const len = Math.hypot(dx, dz)
      if (len < 1) continue

      const barGeo = new THREE.BoxGeometry(len, 14, 4.5)
      const barMesh = new THREE.Mesh(barGeo, barricadeMat)
      barMesh.position.set((ax + bx) / 2, 7, (az + bz) / 2)
      barMesh.rotation.y = -Math.atan2(dz, dx)
      barMesh.castShadow = true
      barMesh.receiveShadow = true

      const barEdges = new THREE.LineSegments(
        new THREE.EdgesGeometry(barGeo),
        new THREE.LineBasicMaterial({ color: 0xfef08a })
      )
      barMesh.add(barEdges)
      dynamicGroup.add(barMesh)
    }

    // ── 3. Emergency Gates (Live Green/Red Dynamic Barriers) ────────────────
    const openGateMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x16a34a,
      emissiveIntensity: 0.45,
      roughness: 0.25,
    })
    const closedGateMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.45,
      roughness: 0.25,
    })

    const interactiveGates = []

    for (const gate of (layout.openings || [])) {
      if (!gate.a || !gate.b) continue
      const ax = gate.a.x - cx, az = gate.a.y - cz
      const bx = gate.b.x - cx, bz = gate.b.y - cz
      const dx = bx - ax, dz = bz - az
      const len = Math.hypot(dx, dz)
      if (len < 1) continue

      const isOpen = Boolean(gate.isOpen)
      if (isOpen) openGates++
      else closedGates++

      const gateMat = isOpen ? openGateMat : closedGateMat
      const angle = Math.atan2(dz, dx)

      // When open: barrier swings open by 85 degrees to visually clear the walkway
      // When closed: barrier is horizontally stretched across the gateway
      const gateGeo = new THREE.BoxGeometry(len, 14, 5)
      const gateMesh = new THREE.Mesh(gateGeo, gateMat)

      if (isOpen) {
        // Swing gate barrier open around post A
        gateMesh.position.set(
          ax + (Math.cos(angle + 1.45) * len) / 2,
          7,
          az + (Math.sin(angle + 1.45) * len) / 2
        )
        gateMesh.rotation.y = -(angle + 1.45)
      } else {
        gateMesh.position.set((ax + bx) / 2, 7, (az + bz) / 2)
        gateMesh.rotation.y = -angle
      }

      gateMesh.castShadow = true
      gateMesh.receiveShadow = true

      // Gateway boundary pillars
      const pillarGeo = new THREE.CylinderGeometry(3.5, 3.5, 22, 16)
      const pillarMat = new THREE.MeshStandardMaterial({
        color: isOpen ? 0x4ade80 : 0xf87171,
        roughness: 0.3,
        metalness: 0.2,
      })
      const p1 = new THREE.Mesh(pillarGeo, pillarMat)
      p1.position.set(ax, 11, az)
      p1.castShadow = true
      dynamicGroup.add(p1)

      const p2 = new THREE.Mesh(pillarGeo, pillarMat)
      p2.position.set(bx, 11, bz)
      p2.castShadow = true
      dynamicGroup.add(p2)

      // Beacon caps on top of pillars
      const beaconGeo = new THREE.SphereGeometry(2.4, 12, 12)
      const beaconMat = new THREE.MeshBasicMaterial({
        color: isOpen ? 0x22c55e : 0xef4444,
      })
      const b1 = new THREE.Mesh(beaconGeo, beaconMat)
      b1.position.set(ax, 23.5, az)
      dynamicGroup.add(b1)

      const b2 = new THREE.Mesh(beaconGeo, beaconMat)
      b2.position.set(bx, 23.5, bz)
      dynamicGroup.add(b2)

      // Illuminated floor threshold pad for open gates
      if (isOpen) {
        const padGeo = new THREE.BoxGeometry(len, 0.5, 14)
        const padMat = new THREE.MeshStandardMaterial({
          color: 0x22c55e,
          emissive: 0x15803d,
          emissiveIntensity: 0.4,
          transparent: true,
          opacity: 0.5,
        })
        const padMesh = new THREE.Mesh(padGeo, padMat)
        padMesh.position.set((ax + bx) / 2, 0.3, (az + bz) / 2)
        padMesh.rotation.y = -angle
        dynamicGroup.add(padMesh)
      }

      dynamicGroup.add(gateMesh)

      // Register meshes for raycasting click toggle
      interactiveGates.push(
        { mesh: gateMesh, gateId: gate.id },
        { mesh: p1, gateId: gate.id },
        { mesh: p2, gateId: gate.id }
      )
    }

    interactiveGateMeshesRef.current = interactiveGates
    setGateStats({ open: openGates, closed: closedGates })

    // ── 4. Exits (3D Ground Portals) ────────────────────────────────────────
    const exitMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.4,
      roughness: 0.3,
    })

    for (const ex of (layout.exits || [])) {
      if (!ex.a || !ex.b) continue
      const ax = ex.a.x - cx, az = ex.a.y - cz
      const bx = ex.b.x - cx, bz = ex.b.y - cz
      const dx = bx - ax, dz = bz - az
      const len = Math.hypot(dx, dz)
      if (len < 1) continue

      const exGeo = new THREE.BoxGeometry(len, 2.5, 14)
      const exMesh = new THREE.Mesh(exGeo, exitMat)
      exMesh.position.set((ax + bx) / 2, 1.25, (az + bz) / 2)
      exMesh.rotation.y = -Math.atan2(dz, dx)
      dynamicGroup.add(exMesh)
    }

    // ── 5. Spawns (3D Ingress Beacons) ──────────────────────────────────────
    const spawnMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.4,
      roughness: 0.3,
    })

    for (const sp of (layout.spawns || [])) {
      const sx = sp.x - cx, sz = sp.y - cz
      const spGeo = new THREE.CylinderGeometry(11, 11, 3, 24)
      const spMesh = new THREE.Mesh(spGeo, spawnMat)
      spMesh.position.set(sx, 1.5, sz)
      dynamicGroup.add(spMesh)
    }

    // ── 6. Focus Target Marker ──────────────────────────────────────────────
    if (focusPoint) {
      const fx = focusPoint.x - cx, fz = focusPoint.y - cz
      const focGeo = new THREE.RingGeometry(8, 16, 32)
      const focMat = new THREE.MeshBasicMaterial({
        color: isFocusMode ? 0xef4444 : 0x38bdf8,
        side: THREE.DoubleSide,
      })
      const focMesh = new THREE.Mesh(focGeo, focMat)
      focMesh.rotation.x = -Math.PI / 2
      focMesh.position.set(fx, 2.5, fz)
      dynamicGroup.add(focMesh)
    }
  }, [layout, focusPoint, isFocusMode, sceneReady])

  // ─── Camera Presets Handler ──────────────────────────────────────────────
  const setCameraPreset = useCallback((preset) => {
    setActiveCameraPreset(preset)
    if (!cameraRef.current || !controlsRef.current) return
    const camera = cameraRef.current
    const controls = controlsRef.current

    if (preset === 'isometric') {
      camera.position.set(0, 700, 840)
      controls.target.set(0, 0, 0)
    } else if (preset === 'topdown') {
      camera.position.set(0, 960, 30)
      controls.target.set(0, 0, 0)
    } else if (preset === 'north') {
      camera.position.set(-260, 420, -320)
      controls.target.set(0, 0, -180)
    } else if (preset === 'south') {
      camera.position.set(240, 380, 280)
      controls.target.set(0, 0, 160)
    }
    controls.update()
  }, [])

  const densityBand = getDensityBand(maxDensityPpm2 || 0)

  return (
    <div className="flex flex-col items-center justify-center p-2 bg-slate-950/90 rounded-xl border border-slate-800 shadow-2xl">
      {/* ── 3D Toolbar Header with Live Simulation Controls & Stats ────── */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-800/80 mb-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-200 flex items-center gap-1.5">
            <span>🏛️</span>
            <span>3D Venue Visualizer</span>
          </span>
          <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono text-[10px]">
            Three.js WebGL + SFM Sim
          </span>
        </div>

        {/* Live Simulation Controls & Metrics */}
        <div className="flex items-center gap-2 bg-slate-900/90 px-3 py-1 rounded-lg border border-slate-800">
          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span
              className={`w-2.5 h-2.5 rounded-full ${simMode === 'running' ? 'pulse-dot bg-emerald-400' : simMode === 'paused' ? 'bg-amber-400' : 'bg-slate-500'}`}
            />
            <span className="font-bold text-slate-200 uppercase">{simMode}</span>
            <span className="text-slate-400">·</span>
            <span className="font-bold text-sky-400">🚶 {agentCount}</span>
            <span className="text-slate-500 text-[10px]">agents</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-300 font-mono text-[10px]">{simTimeSec.toFixed(1)}s</span>

            {maxDensityPpm2 > 0 && (
              <>
                <span className="text-slate-400">·</span>
                <span
                  className="px-1.5 py-0.5 rounded font-mono text-[10px] font-bold"
                  style={{
                    backgroundColor: densityBand.rgba ? `${densityBand.rgba.slice(0, -5)}, 0.2)` : 'rgba(16,185,129,0.2)',
                    color: densityBand.cssVar ? densityBand.cssVar : '#10b981',
                  }}
                  title={`Max local crowd density: ${maxDensityPpm2.toFixed(2)} ped/m² (${densityBand.label})`}
                >
                  {maxDensityPpm2.toFixed(1)} p/m² · {densityBand.shortLabel}
                </span>
              </>
            )}

            {fps > 0 && (
              <>
                <span className="text-slate-400">·</span>
                <span className="text-slate-400 font-mono text-[10px]">{fps} FPS</span>
              </>
            )}
          </div>

          {/* Direct Simulation Action Buttons */}
          <div className="flex items-center gap-1 ml-2 border-l border-slate-800 pl-2">
            {simMode !== 'running' ? (
              <button
                onClick={onStart}
                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] transition flex items-center gap-1 shadow-sm"
                title="Start 3D SFM Simulation"
              >
                <span>▶</span>
                <span>Run</span>
              </button>
            ) : (
              <button
                onClick={onPause}
                className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] transition flex items-center gap-1 shadow-sm"
                title="Pause Simulation"
              >
                <span>⏸</span>
                <span>Pause</span>
              </button>
            )}

            <button
              onClick={onReset}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-bold text-[10px] transition"
              title="Reset Simulation"
            >
              <span>↺</span>
            </button>

            {onTriggerEmergency && (
              <button
                onClick={onTriggerEmergency}
                disabled={simMode !== 'running'}
                className={`px-2 py-0.5 rounded font-bold text-[10px] transition flex items-center gap-1 ${
                  isEmergency
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/40 disabled:opacity-40'
                }`}
                title="Trigger Immediate Panic Evacuation"
              >
                <span>🚨</span>
                <span>{isEmergency ? 'ACTIVE' : 'Evac'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Camera Preset Quick Buttons & Reset */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => setCameraPreset('isometric')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                activeCameraPreset === 'isometric'
                  ? 'bg-indigo-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="3D Oblique Isometric View"
            >
              🏛️ 3D Iso
            </button>
            <button
              onClick={() => setCameraPreset('topdown')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                activeCameraPreset === 'topdown'
                  ? 'bg-indigo-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Overhead 2.5D Architectural Plan View"
            >
              🦅 Top-Down
            </button>
            <button
              onClick={() => setCameraPreset('north')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                activeCameraPreset === 'north'
                  ? 'bg-indigo-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Focus on North Gopuram Entrance"
            >
              🚪 North
            </button>
            <button
              onClick={() => setCameraPreset('south')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                activeCameraPreset === 'south'
                  ? 'bg-indigo-600 text-white font-bold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Focus on South Emergency Gates"
            >
              🚨 South
            </button>
          </div>

          {onResetToDemo && (
            <button
              onClick={onResetToDemo}
              className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition flex items-center gap-1 font-medium text-[10px]"
              title="Reset venue to clean 100% solid standalone layout"
            >
              <span>🔄</span>
              <span>Clean Layout</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Emergency Gates Interactive Status Bar ─────────────────────── */}
      {(layout?.openings?.length || 0) > 0 && (
        <div className="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-900/60 rounded-lg border border-slate-800/80 mb-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-300 text-[11px] flex items-center gap-1">
              <span>🚨</span>
              <span>Emergency Gates:</span>
            </span>
            {layout.openings.map((gate) => (
              <button
                key={gate.id}
                onClick={() => onToggleEmergencyGate && onToggleEmergencyGate(gate.id)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition flex items-center gap-1 shadow-sm ${
                  gate.isOpen
                    ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                    : 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border-red-500/40'
                }`}
                title="Click to toggle gate open/closed in real-time"
              >
                <span>{gate.isOpen ? '🟢 🔓' : '🔴 🔒'}</span>
                <span>{gate.name || 'Gate'}</span>
                <span className="font-mono text-[9px] uppercase">
                  {gate.isOpen ? 'OPEN' : 'CLOSED'}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {onOpenAllOpenings && (
              <button
                onClick={onOpenAllOpenings}
                className="px-2 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 text-[10px] font-bold transition"
                title="Open all emergency gates simultaneously"
              >
                🔓 Open All
              </button>
            )}
            {onCloseAllOpenings && (
              <button
                onClick={onCloseAllOpenings}
                className="px-2 py-0.5 rounded bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-500/40 text-[10px] font-bold transition"
                title="Close all emergency gates simultaneously"
              >
                🔒 Close All
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Three.js Canvas Container ─────────────────────────────────── */}
      <div
        ref={mountRef}
        className="w-full relative rounded-lg overflow-hidden border border-slate-800 cursor-grab active:cursor-grabbing"
        style={{
          minHeight: '600px',
          maxHeight: '76vh',
          background: '#0a0f1d',
        }}
      />

      {/* ── Legend & Navigation Tips Footer ───────────────────────────── */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2 mt-2 text-[11px] text-slate-400 border-t border-slate-800/80">
        <div className="flex items-center gap-3.5 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block shadow-sm"></span>
            <span>Pedestrians (Normal)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block shadow-sm"></span>
            <span>Panicked / High Speed</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block shadow-sm"></span>
            <span>Evacuating</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block shadow-sm"></span>
            <span>Attracted (Focus)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-yellow-500 inline-block"></span>
            <span>Barricades</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block"></span>
            <span>Open Gate (Click 3D)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
            <span>Closed Gate (Click 3D)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm border border-sky-400 bg-sky-400/20 inline-block"></span>
            <span>Virtual Venue Boundary</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-800 border border-slate-700 inline-block"></span>
            <span>Exterior Buffer (2 Squares)</span>
          </span>
        </div>

        <div className="font-mono text-[10px] text-slate-500">
          Left Drag: Orbit · Right Drag: Pan · Scroll: Zoom · Click Gates to Toggle
        </div>
      </div>
    </div>
  )
}
