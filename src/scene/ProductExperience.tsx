import { Component, Suspense, useEffect, useMemo, useRef, useState, type ErrorInfo, type MutableRefObject, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import * as THREE from 'three'
import type { Group, Material, Object3D } from 'three'
import './product-experience.css'

const MODEL_URL = '/models/nexus-one-prepared.glb'
const MANIFEST_URL = '/models/exploded-view.json'
const BLACK_MATERIAL = 'NEXUS Shell Finish — Black'
const FINISH_MATERIALS = {
  Black: BLACK_MATERIAL,
  Silver: 'NEXUS Shell Finish — Silver',
  White: 'NEXUS Shell Finish — White',
} as const

type Finish = keyof typeof FINISH_MATERIALS
type Vec3 = [number, number, number]
type Part = {
  name: string
  category: string | string[]
  phase: number
  illustrative?: boolean
  assemblyTranslation: Vec3
  explodedTranslation: Vec3
}
type StoryStep = { label: string; start: number; end: number; pose: string; groups?: string[] }
type ComponentLabel = { id: string; text: string; anchor: Vec3; part: string }
type ScrollStop = { progress: number; time: number }
type MaterialVariant = {
  name: string
  baseColorFactor: [number, number, number]
  metallicFactor: number
  roughnessFactor: number
}
type ExplodedManifest = {
  parts: Part[]
  sequence: StoryStep[]
  labels: ComponentLabel[]
  materialVariants: MaterialVariant[]
  illustrativeInternalComponents: boolean
}
type SceneErrorState = { error: Error | null }
type ProductExperienceProps = { storyRootRef: MutableRefObject<HTMLElement | null> }

gsap.registerPlugin(ScrollTrigger)
useGLTF.preload(MODEL_URL)

class SceneErrorBoundary extends Component<{ children: ReactNode }, SceneErrorState> {
  state: SceneErrorState = { error: null }

  static getDerivedStateFromError(error: Error): SceneErrorState {
    return { error }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error('NEXUS ONE scene failed to load:', error)
  }

  render() {
    if (this.state.error) {
      return <div className="scene-error" role="alert">3D model could not load: {this.state.error.message}</div>
    }
    return this.props.children
  }
}

function LoadingModel() {
  return <Html center><div className="scene-loading" role="status">Preparing NEXUS ONE</div></Html>
}

function tuple(value: Vec3) {
  return { x: value[0], y: value[1], z: value[2] }
}

function findStep(sequence: StoryStep[], pattern: RegExp) {
  return sequence.find((step) => pattern.test(step.label))
}

function normalizeNodeName(name: string) {
  return name
    .replace(/_\d+$/, '')
    .replace(/[_/\\,.-]+/g, ' ')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

function labelStageIndex(sequence: StoryStep[], time: number) {
  if (sequence.length > 0 && time >= sequence[sequence.length - 1].end) return 0
  const index = sequence.findIndex((step) => time >= step.start && time < step.end)
  return index < 0 ? sequence.length - 1 : index
}

function timelineTimeAtProgress(progress: number, stops: ScrollStop[]) {
  const bounded = THREE.MathUtils.clamp(progress, 0, 1)
  const nextIndex = stops.findIndex((stop) => stop.progress >= bounded)
  if (nextIndex <= 0) return stops[0]?.time ?? 0
  const before = stops[nextIndex - 1]
  const after = stops[nextIndex]
  const span = Math.max(after.progress - before.progress, 0.0001)
  return THREE.MathUtils.lerp(before.time, after.time, (bounded - before.progress) / span)
}

function AnchoredComponentLabel({
  part,
  label,
  partObjects,
  visible,
}: {
  part: Part
  label: ComponentLabel
  partObjects: ReadonlyMap<string, Object3D>
  visible: boolean
}) {
  const anchorRef = useRef<Group>(null)
  const offset = useMemo(() => new THREE.Vector3(
    label.anchor[0] - part.assemblyTranslation[0],
    label.anchor[1] - part.assemblyTranslation[1],
    label.anchor[2] - part.assemblyTranslation[2],
  ), [label, part])

  useFrame(() => {
    const target = partObjects.get(part.name)
    if (!target || !anchorRef.current) return
    anchorRef.current.position.copy(target.position).add(offset)
  })

  if (!visible) return null
  return (
    <group ref={anchorRef}>
      <Html center zIndexRange={[30, 0]}>
        <div className="component-label" role="note">
          <span>{label.text}</span>
          {part.illustrative && <small>ILLUSTRATIVE · CONCEPTUAL</small>}
        </div>
      </Html>
    </group>
  )
}

function ProductModel({
  manifest,
  finish,
  zoom,
  stageIndex,
  storyRootRef,
  onStageChange,
}: {
  manifest: ExplodedManifest
  finish: Finish
  zoom: number
  stageIndex: number
  storyRootRef: MutableRefObject<HTMLElement | null>
  onStageChange: (index: number) => void
}) {
  const gltf = useGLTF(MODEL_URL)
  const sceneMaterialCopies = useMemo(() => new Set<Material>(), [])
  const scene = useMemo(() => {
    const copy = gltf.scene.clone(true)
    copy.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return
      const mesh = object as THREE.Mesh
      const duplicate = (material: Material) => {
        const clone = material.clone()
        sceneMaterialCopies.add(clone)
        return clone
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(duplicate) : duplicate(mesh.material)
    })
    return copy
  }, [gltf.scene, sceneMaterialCopies])
  const motionRef = useRef<Group>(null)
  const zoomRef = useRef<Group>(null)
  const storyRotationRef = useRef<Group>(null)
  const dragRotationRef = useRef<Group>(null)
  const { camera, invalidate, size } = useThree()
  const partObjects = useMemo(() => {
    const byNormalizedName = new Map<string, Object3D>()
    scene.traverse((object) => {
      const normalized = normalizeNodeName(object.name)
      if (normalized && !byNormalizedName.has(normalized)) byNormalizedName.set(normalized, object)
    })
    return new Map(manifest.parts.flatMap((part) => {
      const object = byNormalizedName.get(normalizeNodeName(part.name))
      return object ? [[part.name, object] as const] : []
    }))
  }, [manifest.parts, scene])
  const missingParts = manifest.parts.filter((part) => !partObjects.has(part.name))
  if (missingParts.length > 0) throw new Error(`Prepared GLB is missing components: ${missingParts.map((part) => part.name).join(', ')}`)
  const sequence = manifest.sequence
  const firstExternal = findStep(sequence, /headband and ear cups/i)
  const shellStep = findStep(sequence, /cushions and outer shells/i)
  const speakerStep = findStep(sequence, /speaker assemblies reveal/i)
  const electronicsStep = findStep(sequence, /electronics and battery reveal/i)
  const fullStep = findStep(sequence, /full exploded view/i)
  const reassembleStep = sequence.find((step) => step.pose.startsWith('reverse'))
  if (!firstExternal || !shellStep || !speakerStep || !electronicsStep || !fullStep || !reassembleStep) {
    throw new Error('The prepared exploded-view sequence is missing a required story stage.')
  }
  const comfortTime = THREE.MathUtils.lerp(speakerStep.start, speakerStep.end, 0.5)

  const variantMaterials = useMemo(() => {
    const base = Object.values(gltf.materials).find((candidate) => normalizeNodeName(candidate.name) === normalizeNodeName(BLACK_MATERIAL))
    if (!(base instanceof THREE.MeshStandardMaterial)) throw new Error(`Prepared GLB is missing the shell base material: ${BLACK_MATERIAL}`)

    const createVariant = (finishName: Finish) => {
      const metadata = manifest.materialVariants.find((variant) => normalizeNodeName(variant.name) === normalizeNodeName(FINISH_MATERIALS[finishName]))
      if (!metadata) throw new Error(`Exploded-view data is missing finish metadata: ${FINISH_MATERIALS[finishName]}`)
      const material = base.clone()
      material.name = metadata.name
      material.color.setRGB(...metadata.baseColorFactor)
      material.metalness = metadata.metallicFactor
      material.roughness = metadata.roughnessFactor
      return material
    }

    return { Black: createVariant('Black'), Silver: createVariant('Silver'), White: createVariant('White') }
  }, [gltf.materials, manifest.materialVariants])

  useEffect(() => {
    const selected = variantMaterials[finish]
    scene.traverse((object) => {
      if (!(object as THREE.Mesh).isMesh) return
      const mesh = object as THREE.Mesh
      const apply = (material: Material) => normalizeNodeName(material.name).startsWith('nexus shell finish') ? selected : material
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(apply) : apply(mesh.material)
    })
    invalidate()
  }, [finish, gltf, invalidate, scene, variantMaterials])

  useEffect(() => {
    if (zoomRef.current) zoomRef.current.scale.setScalar(zoom)
    invalidate()
  }, [invalidate, zoom])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const compact = size.width < 900
    const productX = size.width < 500 ? 0.055 : compact ? 0.13 : 0.075
    const productY = compact ? -0.07 : 0
    const targetX = compact ? productX - (size.width < 500 ? 0.035 : 0.09) : 0
    const baseScale = compact ? (size.width < 500 ? 0.68 : 0.95) : 1
    const chapterShift = size.width < 500 ? 0 : compact ? 0.14 : 0.24
    const storyYOffset = size.width < 500 ? 0.16 : 0
    let timeline: gsap.core.Timeline | undefined
    let scrollDriver: gsap.core.Tween | undefined
    let scrollStops: ScrollStop[] = []
    const assembled = () => {
      timeline?.kill()
      scrollDriver?.scrollTrigger?.kill()
      scrollDriver?.kill()
      timeline = undefined
      scrollDriver = undefined
      if (motionRef.current) {
        motionRef.current.position.set(productX, productY, 0)
        motionRef.current.scale.setScalar(baseScale)
      }
      if (storyRotationRef.current) storyRotationRef.current.rotation.set(0, 0, 0)
      camera.position.set(compact ? productX : 0.29, compact ? 0.22 : 0.185, compact ? 0.8 : 0.46)
      camera.lookAt(targetX, compact ? 0.12 : 0.065, 0)
      manifest.parts.forEach((part) => {
        const object = partObjects.get(part.name)
        if (object) object.position.set(...part.assemblyTranslation)
      })
      onStageChange(0)
      invalidate()
    }

    const setup = () => {
      assembled()
      if (media.matches || !storyRootRef.current || !motionRef.current) return

      const model = motionRef.current
      const activeCameraTarget = new THREE.Vector3(targetX, compact ? 0.12 : 0.065, 0)
      camera.position.set(compact ? productX : 0.29, compact ? 0.22 : 0.185, compact ? 0.8 : 0.46)
      camera.lookAt(activeCameraTarget)

      timeline = gsap.timeline({ paused: true })
      const storyRotation = storyRotationRef.current
      if (!storyRotation) return

      for (const part of manifest.parts) {
        const object = partObjects.get(part.name)
        if (!object) continue

        let stageStart = firstExternal.start
        let stageEnd = firstExternal.end
        if (part.phase === 2) {
          stageStart = shellStep.start
          stageEnd = shellStep.end
        } else if (part.phase === 3) {
          stageStart = speakerStep.start
          stageEnd = speakerStep.end
        } else if (part.phase === 4) {
          stageStart = speakerStep.start + (speakerStep.end - speakerStep.start) * 0.58
          stageEnd = speakerStep.end
        } else if (part.phase >= 5) {
          stageStart = electronicsStep.start
          stageEnd = electronicsStep.end
        }

        timeline.fromTo(object.position, tuple(part.assemblyTranslation), {
          ...tuple(part.explodedTranslation), duration: stageEnd - stageStart, ease: 'none', immediateRender: false,
        }, stageStart)
        timeline.to(object.position, {
          ...tuple(part.assemblyTranslation), duration: reassembleStep.end - reassembleStep.start, ease: 'none',
        }, reassembleStep.start)
      }

      const approachFrom = compact ? [productX, 0.24, 0.9] as Vec3 : [0.29, 0.185, 0.54] as Vec3
      const approachTo = compact ? [productX, 0.22, 0.8] as Vec3 : [0.29, 0.185, 0.46] as Vec3
      const focusFrom = compact ? [targetX, 0.12, 0] as Vec3 : [0, 0.065, 0] as Vec3
      timeline.fromTo(camera.position, tuple(approachFrom), {
        ...tuple(approachTo), duration: firstExternal.start, ease: 'none', immediateRender: false,
      }, 0)
      timeline.fromTo(activeCameraTarget, tuple(focusFrom), {
        ...tuple(focusFrom), duration: firstExternal.start, ease: 'none', immediateRender: false,
      }, 0)
      timeline.fromTo(storyRotation.rotation, { x: 0, y: -0.025, z: 0 }, {
        y: 0.035, duration: firstExternal.start, ease: 'none', immediateRender: false,
      }, 0)

      const cameraMoves = [
        { at: firstExternal.start, duration: firstExternal.end - firstExternal.start, position: compact ? [productX, 0.25, 0.8] as Vec3 : [0.32, 0.2, 0.48] as Vec3, target: compact ? [targetX, 0.12, 0] as Vec3 : [0, 0.065, 0] as Vec3, productX: productX + chapterShift },
        { at: shellStep.start, duration: shellStep.end - shellStep.start, position: compact ? [productX, 0.2, 0.76] as Vec3 : [0.34, 0.135, 0.39] as Vec3, target: compact ? [targetX, 0.1, 0] as Vec3 : [0.015, 0.06, 0] as Vec3, productX: productX - chapterShift },
        { at: speakerStep.start, duration: comfortTime - speakerStep.start, position: compact ? [productX, 0.2, 0.72] as Vec3 : [0.28, 0.14, 0.36] as Vec3, target: compact ? [targetX, 0.1, 0] as Vec3 : [0, 0.05, 0] as Vec3, productX: productX + chapterShift },
        { at: comfortTime, duration: electronicsStep.start - comfortTime, position: compact ? [productX, 0.21, 0.75] as Vec3 : [0.25, 0.16, 0.38] as Vec3, target: compact ? [targetX, 0.1, 0] as Vec3 : [0, 0.05, 0] as Vec3, productX: productX - chapterShift },
        { at: electronicsStep.start, duration: fullStep.start - electronicsStep.start, position: compact ? [productX, 0.24, 0.77] as Vec3 : [0.2, 0.19, 0.39] as Vec3, target: compact ? [targetX, 0.1, 0.005] as Vec3 : [-0.01, 0.045, 0.005] as Vec3, productX: productX + chapterShift },
        { at: fullStep.start, duration: fullStep.end - fullStep.start, position: compact ? [productX, 0.26, 0.87] as Vec3 : [0.27, 0.22, 0.53] as Vec3, target: compact ? [targetX, 0.1, 0] as Vec3 : [0, 0.055, 0] as Vec3, productX },
        { at: reassembleStep.start, duration: reassembleStep.end - reassembleStep.start, position: compact ? [productX, 0.22, 0.8] as Vec3 : [0.29, 0.185, 0.46] as Vec3, target: compact ? [targetX, 0.12, 0] as Vec3 : [0, 0.065, 0] as Vec3, productX },
      ]
      for (const move of cameraMoves) {
        timeline.to(camera.position, { ...tuple(move.position), duration: move.duration, ease: 'none' }, move.at)
        timeline.to(activeCameraTarget, { ...tuple(move.target), duration: move.duration, ease: 'none' }, move.at)
        timeline.to(model.position, { x: move.productX, y: productY + storyYOffset, duration: move.duration, ease: 'none' }, move.at)
        const mobileScale = size.width < 500 ? 0.62 : 1
        const storyScale = move.at >= reassembleStep.start
          ? baseScale
          : baseScale * mobileScale * (move.at >= fullStep.start ? 0.84 : 0.88)
        timeline.to(model.scale, { x: storyScale, y: storyScale, z: storyScale, duration: move.duration, ease: 'none' }, move.at)
      }
      const rotationMoves = [
        { at: firstExternal.start, end: firstExternal.end, y: 0.16 },
        { at: shellStep.start, end: shellStep.end, y: 0.27 },
        { at: speakerStep.start, end: speakerStep.end, y: -0.18 },
        { at: electronicsStep.start, end: electronicsStep.end, y: 0.17 },
        { at: fullStep.start, end: fullStep.end, y: 0.025 },
        { at: reassembleStep.start, end: reassembleStep.end, y: 0 },
      ]
      for (const move of rotationMoves) {
        timeline.to(storyRotation.rotation, { y: move.y, duration: move.end - move.at, ease: 'none' }, move.at)
      }
      let lastStage = -1
      timeline.eventCallback('onUpdate', () => {
        camera.lookAt(activeCameraTarget)
        const index = labelStageIndex(sequence, timeline?.time() ?? 0)
        if (index !== lastStage) {
          lastStage = index
          onStageChange(index)
        }
        invalidate()
      })
      const root = storyRootRef.current
      if (!root) return
      const measureStops = () => {
        const rootTop = root.getBoundingClientRect().top + window.scrollY
        const scrollLength = Math.max(root.offsetHeight - window.innerHeight, 1)
        const at = (selector: string, offset = 0) => {
          const element = document.querySelector<HTMLElement>(selector)
          if (!element) throw new Error(`Missing NEXUS story anchor: ${selector}`)
          const documentY = element.getBoundingClientRect().top + window.scrollY + offset
          return THREE.MathUtils.clamp((documentY - rootTop) / scrollLength, 0, 1)
        }
        const finishes = document.querySelector<HTMLElement>('#finishes')
        if (!finishes) throw new Error('Missing NEXUS story anchor: #finishes')
        scrollStops = [
          { time: 0, progress: 0 },
          { time: firstExternal.start, progress: at('#sound') },
          { time: shellStep.start, progress: at('#audio') },
          { time: speakerStep.start, progress: at('#materials') },
          { time: comfortTime, progress: at('#comfort') },
          { time: electronicsStep.start, progress: at('#battery') },
          { time: fullStep.start, progress: at('#finishes') },
          { time: reassembleStep.start, progress: at('#finishes', finishes.offsetHeight * 0.58) },
          { time: reassembleStep.end, progress: 1 },
        ]
      }
      measureStops()
      const scrollDriverState = { value: 0 }
      scrollDriver = gsap.to(scrollDriverState, {
        value: 1,
        duration: 1,
        ease: 'none',
        onUpdate: () => timeline?.time(timelineTimeAtProgress(scrollDriverState.value, scrollStops), false),
        scrollTrigger: {
          trigger: root,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.65,
          invalidateOnRefresh: true,
          onRefresh: measureStops,
          onUpdate: () => invalidate(),
        },
      })
      ScrollTrigger.refresh()
    }

    const handleMotionPreference = () => setup()
    setup()
    media.addEventListener('change', handleMotionPreference)
    return () => {
      media.removeEventListener('change', handleMotionPreference)
      timeline?.kill()
      scrollDriver?.scrollTrigger?.kill()
      scrollDriver?.kill()
    }
  }, [camera, invalidate, manifest, onStageChange, partObjects, size.width, storyRootRef])

  useEffect(() => () => {
    sceneMaterialCopies.forEach((material) => material.dispose())
    Object.values(variantMaterials).forEach((material) => material.dispose())
  }, [sceneMaterialCopies, variantMaterials])

  useEffect(() => {
    const rotation = dragRotationRef.current
    if (!rotation) return
    let activePointer: number | null = null
    let previousX = 0
    let previousY = 0
    let horizontalGesture = false

    const pointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target || target.closest('a, button, input, .site-header, .chapter__copy, .scene-controls, .site-footer')) return
      const onMobile = window.innerWidth < 700
      const insideProductRegion = onMobile
        ? event.clientY > window.innerHeight * 0.19 && event.clientY < window.innerHeight * 0.65
        : event.clientX > window.innerWidth * 0.36 && event.clientY > window.innerHeight * 0.12 && event.clientY < window.innerHeight * 0.86
      if (!insideProductRegion) return
      activePointer = event.pointerId
      previousX = event.clientX
      previousY = event.clientY
      horizontalGesture = false
    }
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activePointer || !dragRotationRef.current) return
      const dx = event.clientX - previousX
      const dy = event.clientY - previousY
      previousX = event.clientX
      previousY = event.clientY
      if (!horizontalGesture) {
        horizontalGesture = Math.abs(dx) > 2 && Math.abs(dx) > Math.abs(dy) * 1.2
      }
      if (!horizontalGesture) return
      dragRotationRef.current.rotation.y += dx * 0.009
      invalidate()
    }
    const pointerUp = (event: PointerEvent) => {
      if (event.pointerId === activePointer) activePointer = null
    }
    window.addEventListener('pointerdown', pointerDown, { passive: true })
    window.addEventListener('pointermove', pointerMove, { passive: true })
    window.addEventListener('pointerup', pointerUp, { passive: true })
    window.addEventListener('pointercancel', pointerUp, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', pointerDown)
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', pointerUp)
      window.removeEventListener('pointercancel', pointerUp)
    }
  }, [invalidate])

  const isIllustrativeStage = (index: number) => index >= 3 && index <= 6
  const shouldShowLabel = (label: ComponentLabel, index: number) => {
    if (!isIllustrativeStage(index)) return false
    if (index === 3) return ['drivers', 'magnets', 'acoustics'].includes(label.id)
    if (index === 4) return ['board', 'battery', 'drivers', 'magnets', 'acoustics'].includes(label.id)
    return true
  }
  return (
    <group ref={motionRef}>
      <group ref={zoomRef}>
        <group ref={storyRotationRef}>
          <group ref={dragRotationRef}>
            <primitive object={scene} dispose={null} />
            {manifest.labels.map((label) => {
              const part = manifest.parts.find((candidate) => candidate.name === label.part)
              if (!part) return null
              return <AnchoredComponentLabel key={label.id} label={label} part={part} partObjects={partObjects} visible={shouldShowLabel(label, stageIndex)} />
            })}
          </group>
        </group>
      </group>
    </group>
  )
}

function StudioLights() {
  return (
    <>
      <hemisphereLight args={['#e9f2fa', '#252b32', 1.15]} />
      <directionalLight color="#ffffff" intensity={2.4} position={[0.4, 0.65, 0.5]} />
      <directionalLight color="#a9c6df" intensity={1.35} position={[-0.45, 0.22, -0.35]} />
      <pointLight color="#e6eef5" intensity={4.5} distance={1.25} position={[0.06, 0.18, 0.48]} />
    </>
  )
}

export default function ProductExperience({ storyRootRef }: ProductExperienceProps) {
  const [manifest, setManifest] = useState<ExplodedManifest | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)
  const [finish, setFinish] = useState<Finish>('Black')
  const [zoom, setZoom] = useState(1)
  const [stageIndex, setStageIndex] = useState(0)
  const stageChange = useMemo(() => (index: number) => setStageIndex(index), [])

  useEffect(() => {
    const controller = new AbortController()
    fetch(MANIFEST_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Manifest request failed (${response.status})`)
        return response.json() as Promise<ExplodedManifest>
      })
      .then(setManifest)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        const message = error instanceof Error ? error.message : String(error)
        setManifestError(message)
        console.error('NEXUS ONE exploded-view data failed to load:', error)
      })
    return () => controller.abort()
  }, [])

  const sequence = manifest?.sequence ?? []
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const stageLabel = reducedMotion ? 'Assembled view · reduced motion' : sequence[stageIndex]?.label ?? 'Assembled'
  const componentLabels = manifest?.labels ?? []
  const isConceptual = stageIndex >= 3 && stageIndex <= 6 && !reducedMotion

  return (
    <>
      <div className="product-experience__canvas" role="group" aria-label="Three-dimensional NEXUS ONE headphones. Select a finish or zoom with the controls.">
        {manifestError ? (
          <div className="scene-error" role="alert">3D presentation could not load: {manifestError}</div>
        ) : (
          <SceneErrorBoundary>
            <Canvas
              dpr={[1, 1.35]}
              frameloop="demand"
              camera={{ position: [0.29, 0.185, 0.46], fov: 34, near: 0.01, far: 10 }}
              gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
              onCreated={({ gl }) => {
                gl.setClearColor('#0a0b0d', 0)
                gl.toneMapping = THREE.ACESFilmicToneMapping
                gl.toneMappingExposure = 1.05
              }}
            >
              <StudioLights />
              <Suspense fallback={<LoadingModel />}>
                {manifest && <ProductModel manifest={manifest} finish={finish} zoom={zoom} stageIndex={stageIndex} storyRootRef={storyRootRef} onStageChange={stageChange} />}
              </Suspense>
            </Canvas>
          </SceneErrorBoundary>
        )}
      </div>
      <aside className="scene-controls" aria-label="Product controls">
        <div className="scene-controls__stage" aria-live="polite">
          <span className="scene-controls__eyebrow">NEXUS ONE / PRODUCT STUDY</span>
          <span>{stageLabel}</span>
          {isConceptual && <small>Internal components are illustrative concepts</small>}
        </div>
        <div className="scene-controls__row">
          <div className="finish-picker" role="group" aria-label="Select product finish">
            {(Object.keys(FINISH_MATERIALS) as Finish[]).map((option) => (
              <button
                key={option}
                className={`finish-picker__option finish-picker__option--${option.toLowerCase()}`}
                type="button"
                aria-label={`${option} finish`}
                aria-pressed={finish === option}
                onClick={() => setFinish(option)}
              >
                <span aria-hidden="true" />{option}
              </button>
            ))}
          </div>
          <div className="zoom-controls" role="group" aria-label="Zoom product model">
            <button type="button" aria-label="Zoom out" disabled={zoom <= 0.75} onClick={() => setZoom((value) => Math.max(0.75, Math.round((value - 0.1) * 100) / 100))}>−</button>
            <span aria-live="off">{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label="Zoom in" disabled={zoom >= 1.4} onClick={() => setZoom((value) => Math.min(1.4, Math.round((value + 0.1) * 100) / 100))}>+</button>
          </div>
        </div>
        <p className="scene-controls__hint">Scroll to explore · drag to rotate</p>
      </aside>
      {componentLabels.length > 0 && <span className="sr-only">Conceptual internal parts are labeled during the exploded view.</span>}
    </>
  )
}
