import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createDiagramCamera} from './diagramCameraModel.js';

const MODEL_URL = new URL('../assets/models/specs-retopologized.glb', import.meta.url).href;
const ATLAS_URLS = [
  new URL('../assets/atlas/OpalHero_harlequin_standard_band0.jpg', import.meta.url).href,
  new URL('../assets/atlas/OpalHero_harlequin_standard_band1.jpg', import.meta.url).href,
  new URL('../assets/atlas/OpalHero_harlequin_standard_band2.jpg', import.meta.url).href,
  new URL('../assets/atlas/OpalHero_harlequin_standard_band3.jpg', import.meta.url).href,
  new URL('../assets/atlas/OpalHero_harlequin_standard_band4.jpg', import.meta.url).href,
  new URL('../assets/atlas/OpalHero_harlequin_standard_band5.jpg', import.meta.url).href,
  new URL('../assets/atlas/OpalHero_harlequin_standard_band6.jpg', import.meta.url).href,
  new URL('../assets/atlas/OpalHero_harlequin_standard_band7.jpg', import.meta.url).href,
  new URL('../assets/atlas/OpalHero_harlequin_standard_band8.jpg', import.meta.url).href,
  new URL('../assets/atlas/OpalHero_harlequin_standard_band9.jpg', import.meta.url).href,
  new URL('../assets/atlas/OpalHero_harlequin_standard_band10.jpg', import.meta.url).href,
  new URL('../assets/atlas/OpalHero_harlequin_standard_band11.jpg', import.meta.url).href,
];
const MASK_URL = new URL('../assets/atlas/OpalHero_mask_box.png', import.meta.url).href;
const MODEL_WIDTH = 1.22;
const YAW_VIEWS = 108;
const PITCH_VIEWS = 7;
const SHEET_COLUMNS = 9;
const ELEVATIONS_DEG = [-60, -40, -20, 0, 20, 40, 60];
let selectedPitchRow = 5;
const ATLAS_DISPLAY_WIDTH = 2.48;
const ATLAS_DISPLAY_HEIGHT = ATLAS_DISPLAY_WIDTH * PITCH_VIEWS / SHEET_COLUMNS;
const ATLAS_STACK_OFFSET = new THREE.Vector3(-.03, .048, -.05);
const ATLAS_PERMUTATION_DURATION_MS = 300;
const ATLAS_FOCUS_LERP = .58;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const RUNTIME_IMAGE_SIZE = Math.min(.92, 1.2) * .92;
const AR_SCENE_CENTER = new THREE.Vector3(-3.7, -.18, 0);
const THREEJS_SCENE_CENTER = new THREE.Vector3(3.7, AR_SCENE_CENTER.y, 0);
const ATLAS_CENTER = new THREE.Vector3(0, 2.08, -.12);
const TRAJECTORY_CENTER = AR_SCENE_CENTER;
const ORBIT_RADIUS = 1.5;
const TRAJECTORY_RADIUS = ORBIT_RADIUS;
// One shared datum plane: both the capture camera and the glasses stay above
// it even at their lowest sampled elevation.
const GROUND_Y = -1.54;
const CUPOLA_RADIUS = .78;
// Seat the coordinate globe on the shared datum instead of letting its lower
// edge pass through the plane.
const GLOBE_CENTER = new THREE.Vector3(0, GROUND_Y + CUPOLA_RADIUS, .34);
// Both engine scenes share a physical world-space baseline.
const THREEJS_SCENE_LIFT = THREEJS_SCENE_CENTER.y;
const stage = document.querySelector('#render-chain-stage');
const canvas = document.querySelector('#render-chain-canvas');
const loading = document.querySelector('#chain-loading');
const errorPanel = document.querySelector('#chain-error');
const stageValue = document.querySelector('#chain-stage-value');
const stageNote = document.querySelector('#chain-note');
const atlasAddressValue = document.querySelector('#atlas-address-value');
const observerAzimuthValue = document.querySelector('#observer-azimuth-value');
const azimuthSlider = document.querySelector('#azimuth-slider');
const elevationSlider = document.querySelector('#elevation-slider');
const azimuthSliderValue = document.querySelector('#azimuth-slider-value');
const elevationSliderValue = document.querySelector('#elevation-slider-value');
const viewControls = document.querySelector('.view-controls');
const orientationPanelBackdrop = document.querySelector('.orientation-panel-backdrop');
const labelsToggle = document.querySelector('#labels-toggle');
const labelsToggleState = document.querySelector('#labels-toggle-state');
const cameraViewAddress = document.querySelector('#camera-view-address');
const cameraViewCanvas = document.querySelector('#offline-camera-view');
const cameraViewContext = cameraViewCanvas.getContext('2d', {willReadFrequently: true});

const palette = {
  paper: 0xffffff,
  ink: 0x282728,
  muted: 0x646464,
  offline: 0x3e5eb8,
  bake: 0x6482dc,
  runtime: 0x8ca9ff,
  left: 0x6482dc,
  right: 0x4c63b8,
  opal: 0x3e5eb8,
};

cameraViewContext.clearRect(0, 0, cameraViewCanvas.width, cameraViewCanvas.height);
const sampleTexture = new THREE.CanvasTexture(cameraViewCanvas);
sampleTexture.colorSpace = THREE.SRGBColorSpace;
sampleTexture.minFilter = THREE.LinearFilter;
sampleTexture.magFilter = THREE.LinearFilter;
sampleTexture.generateMipmaps = false;

// This texture belongs to the source mesh and stays fixed in object space.
// It is intentionally separate from sampleTexture, which represents the
// currently selected offline-camera capture.
const sourceSurfaceCanvas = document.createElement('canvas');
sourceSurfaceCanvas.width = 512;
sourceSurfaceCanvas.height = 256;
const sourceSurfaceContext = sourceSurfaceCanvas.getContext('2d');
const sourceSurfaceTexture = new THREE.CanvasTexture(sourceSurfaceCanvas);
sourceSurfaceTexture.colorSpace = THREE.SRGBColorSpace;
sourceSurfaceTexture.minFilter = THREE.LinearFilter;
sourceSurfaceTexture.magFilter = THREE.LinearFilter;
sourceSurfaceTexture.generateMipmaps = false;
const SOURCE_SURFACE_YAW = 44;
const SOURCE_SURFACE_PITCH = 3;

const maskCanvas = document.createElement('canvas');
maskCanvas.width = cameraViewCanvas.width;
maskCanvas.height = cameraViewCanvas.height;
const maskContext = maskCanvas.getContext('2d', {willReadFrequently: true});
const textureLoader = new THREE.TextureLoader();
const atlasTextures = [];
let maskImage = null;
let maskTexture = null;
let selectedYaw = 0;
const atlasLayers = [];
const atlasStructuralLayers = [];
const atlasStructuralStepLocal = new THREE.Vector3();
let atlasLayerOrder = ATLAS_URLS.map((_, index) => index);
let atlasPermutationStart = 0;
let atlasTransitionFromSheet = null;
let atlasTransitionFromOpacity = 1;
let atlasSelection = null;
let atlasSelectionSurface = null;
let atlasSelectionHalo = null;
let atlasSelectionOverlay = null;
let atlasGridOverlay = null;
let atlasActiveFrame = null;
let atlasCoordinateAxes = null;
let atlasAddressBadge = null;
let atlasAddressLeader = null;
let pathCameraDisplay = null;

function refreshSourceSurface() {
  const sheet = Math.floor(SOURCE_SURFACE_YAW / SHEET_COLUMNS);
  const column = SOURCE_SURFACE_YAW % SHEET_COLUMNS;
  const colorImage = atlasTextures[sheet]?.image;
  if (!colorImage?.complete || !maskImage?.complete) return;

  const cellPx = colorImage.naturalWidth / SHEET_COLUMNS;
  const frame = SOURCE_SURFACE_PITCH * YAW_VIEWS + SOURCE_SURFACE_YAW;
  const maskColumn = frame % 28;
  const maskRow = Math.floor(frame / 28);
  const maskCellPx = maskImage.naturalWidth / 28;
  const scratch = document.createElement('canvas');
  scratch.width = 256;
  scratch.height = 256;
  const scratchContext = scratch.getContext('2d', {willReadFrequently: true});
  scratchContext.drawImage(
    maskImage,
    maskColumn * maskCellPx,
    maskRow * maskCellPx,
    maskCellPx,
    maskCellPx,
    0,
    0,
    scratch.width,
    scratch.height,
  );
  const pixels = scratchContext.getImageData(0, 0, scratch.width, scratch.height).data;
  let minX = scratch.width;
  let minY = scratch.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < scratch.height; y += 1) {
    for (let x = 0; x < scratch.width; x += 1) {
      if (pixels[(y * scratch.width + x) * 4] < 132) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (minX >= maxX || minY >= maxY) return;

  const sourceX = column * cellPx + minX / scratch.width * cellPx;
  const sourceY = SOURCE_SURFACE_PITCH * cellPx + minY / scratch.height * cellPx;
  const sourceWidth = (maxX - minX) / scratch.width * cellPx;
  const sourceHeight = (maxY - minY) / scratch.height * cellPx;
  sourceSurfaceContext.fillStyle = '#f7f8fc';
  sourceSurfaceContext.fillRect(0, 0, sourceSurfaceCanvas.width, sourceSurfaceCanvas.height);
  sourceSurfaceContext.drawImage(
    colorImage,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceSurfaceCanvas.width * .5,
    sourceSurfaceCanvas.height,
  );
  sourceSurfaceContext.save();
  sourceSurfaceContext.translate(sourceSurfaceCanvas.width, 0);
  sourceSurfaceContext.scale(-1, 1);
  sourceSurfaceContext.drawImage(
    colorImage,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceSurfaceCanvas.width * .5,
    sourceSurfaceCanvas.height,
  );
  sourceSurfaceContext.restore();
  sourceSurfaceTexture.needsUpdate = true;
}

function refreshAtlasSample() {
  const sheet = Math.floor(selectedYaw / SHEET_COLUMNS);
  const column = selectedYaw % SHEET_COLUMNS;
  const localView = selectedPitchRow * SHEET_COLUMNS + column;
  const colorImage = atlasTextures[sheet]?.image;
  if (!colorImage?.complete || !maskImage?.complete) return;

  const cellPx = colorImage.naturalWidth / SHEET_COLUMNS;
  cameraViewContext.clearRect(0, 0, cameraViewCanvas.width, cameraViewCanvas.height);
  cameraViewContext.drawImage(
    colorImage,
    column * cellPx,
    selectedPitchRow * cellPx,
    cellPx,
    cellPx,
    0,
    0,
    cameraViewCanvas.width,
    cameraViewCanvas.height,
  );

  const frame = selectedPitchRow * YAW_VIEWS + selectedYaw;
  const maskColumn = frame % 28;
  const maskRow = Math.floor(frame / 28);
  const maskCellPx = maskImage.naturalWidth / 28;
  maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskContext.drawImage(
    maskImage,
    maskColumn * maskCellPx,
    maskRow * maskCellPx,
    maskCellPx,
    maskCellPx,
    0,
    0,
    maskCanvas.width,
    maskCanvas.height,
  );

  const colorPixels = cameraViewContext.getImageData(0, 0, cameraViewCanvas.width, cameraViewCanvas.height);
  const maskPixels = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  let maskMinX = maskCanvas.width;
  let maskMinY = maskCanvas.height;
  let maskMaxX = 0;
  let maskMaxY = 0;
  for (let offset = 0; offset < colorPixels.data.length; offset += 4) {
    const signedDistance = maskPixels.data[offset] / 255;
    const alpha = THREE.MathUtils.smoothstep(signedDistance, .46, .54);
    colorPixels.data[offset + 3] = Math.round(alpha * 255);
    if (alpha > .5) {
      const pixel = offset / 4;
      const x = pixel % maskCanvas.width;
      const y = Math.floor(pixel / maskCanvas.width);
      maskMinX = Math.min(maskMinX, x);
      maskMinY = Math.min(maskMinY, y);
      maskMaxX = Math.max(maskMaxX, x);
      maskMaxY = Math.max(maskMaxY, y);
    }
  }
  cameraViewContext.putImageData(colorPixels, 0, 0);
  sampleTexture.needsUpdate = true;

  if (maskMinX < maskMaxX && maskMinY < maskMaxY) {
    const centerX = (maskMinX + maskMaxX + 1) * .5 / maskCanvas.width;
    const centerY = 1 - (maskMinY + maskMaxY + 1) * .5 / maskCanvas.height;
    const halfWidth = (maskMaxX - maskMinX + 1) * .5 / maskCanvas.width;
    const halfHeight = (maskMaxY - maskMinY + 1) * .5 / maskCanvas.height;
    runtimeColliderMaterial.uniforms.maskCenter.value.set(centerX, centerY);
    runtimeColliderMaterial.uniforms.maskHalfSize.value.set(halfWidth, halfHeight);
  }

  if (atlasLayers.length) {
    promoteAtlasSheet(sheet);
    atlasLayers.forEach((layer) => {
      layer.children[0].material.uniforms.selectedCell.value.set(column, selectedPitchRow);
    });
  }
  if (atlasSelection) {
    const selectionX = -ATLAS_DISPLAY_WIDTH * .5 + (column + .5) * ATLAS_DISPLAY_WIDTH / SHEET_COLUMNS;
    const selectionY = ATLAS_DISPLAY_HEIGHT * .5 - (selectedPitchRow + .5) * ATLAS_DISPLAY_HEIGHT / PITCH_VIEWS;
    atlasSelectionOverlay.userData.cellPosition.set(selectionX, selectionY, 0);
    syncAtlasSelectionOverlay();
  }
  atlasAddressBadge?.userData.setAddress({
    layer: sheet,
    view: localView,
    u: column,
    v: selectedPitchRow,
  });
  const elevation = ELEVATIONS_DEG[selectedPitchRow];
  atlasAddressValue.textContent = `LAYER ${String(sheet).padStart(2, '0')} · VIEW ${String(localView).padStart(2, '0')} · U${String(column).padStart(2, '0')} V${String(selectedPitchRow).padStart(2, '0')}`;
  cameraViewAddress.textContent = `Y${String(selectedYaw).padStart(3, '0')} · E${elevation >= 0 ? '+' : ''}${elevation}°`;
}

ATLAS_URLS.forEach((url, index) => {
  atlasTextures[index] = textureLoader.load(url, () => {
    refreshAtlasSample();
    refreshSourceSurface();
  });
  atlasTextures[index].colorSpace = THREE.SRGBColorSpace;
  atlasTextures[index].minFilter = THREE.LinearFilter;
  atlasTextures[index].magFilter = THREE.LinearFilter;
  atlasTextures[index].generateMipmaps = false;
});
maskTexture = textureLoader.load(MASK_URL, (texture) => {
  maskImage = texture.image;
  refreshAtlasSample();
  refreshSourceSurface();
});
maskTexture.minFilter = THREE.LinearFilter;
maskTexture.magFilter = THREE.LinearFilter;
maskTexture.generateMipmaps = false;

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-6, 6, 3.4, -3.4, .1, 40);
camera.position.set(7.8, 5.7, 13.2);
camera.lookAt(0, .18, 0);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, .18, 0);
controls.enableDamping = true;
controls.dampingFactor = .055;
controls.enablePan = false;
controls.enableZoom = false;
controls.rotateSpeed = .24;
controls.zoomSpeed = .38;
controls.minZoom = .78;
controls.maxZoom = 1.8;
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
controls.minAzimuthAngle = -Infinity;
controls.maxAzimuthAngle = Infinity;
controls.minPolarAngle = .001;
controls.maxPolarAngle = Math.PI - .001;
controls.update();

const pathCameraRenderTarget = new THREE.WebGLRenderTarget(160, 90, {
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  depthBuffer: true,
});
pathCameraRenderTarget.texture.colorSpace = THREE.SRGBColorSpace;
// The camera monitor is 16:9 and must contain the complete source body. At the
// fixed capture-orbit radius, 58 degrees leaves a small framing margin around
// the opal instead of clipping its top and bottom.
const pathCaptureCamera = new THREE.PerspectiveCamera(58, 16 / 9, .03, 20);

scene.add(new THREE.HemisphereLight(0xf7f9ff, 0x829196, 2.35));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
keyLight.position.set(-2, 7, 6);
scene.add(keyLight);
const accentLight = new THREE.DirectionalLight(0x8ca9ff, 1.1);
accentLight.position.set(6, 3, -2);
scene.add(accentLight);

function basicMaterial(color, opacity = 1, options = {}) {
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: opacity >= .99,
    side: THREE.DoubleSide,
    ...options,
  });
  material.userData.baseOpacity = opacity;
  return material;
}

function atlasMaterial(texture, sheet) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      atlasMap: {value: texture},
      gridSize: {value: new THREE.Vector2(SHEET_COLUMNS, PITCH_VIEWS)},
      selectedCell: {value: new THREE.Vector2(0, selectedPitchRow)},
      activeWeight: {value: sheet === 0 ? 1 : 0},
      sheetDim: {value: sheet === 0 ? 1 : .72},
      unfocusedDim: {value: .38},
      opacity: {value: .96},
      transitionOpacity: {value: sheet === 0 ? 1 : 0},
    },
    vertexShader: `
      varying vec2 atlasUv;
      void main() {
        atlasUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D atlasMap;
      uniform vec2 gridSize;
      uniform vec2 selectedCell;
      uniform float activeWeight;
      uniform float sheetDim;
      uniform float unfocusedDim;
      uniform float opacity;
      uniform float transitionOpacity;
      varying vec2 atlasUv;

      void main() {
        vec2 cell = min(
          floor(vec2(atlasUv.x, 1.0 - atlasUv.y) * gridSize),
          gridSize - 1.0
        );
        float cellDistance = abs(cell.x - selectedCell.x) + abs(cell.y - selectedCell.y);
        float selected = (1.0 - step(0.5, cellDistance)) * activeWeight;
        vec4 texel = texture2D(atlasMap, atlasUv);
        vec3 paper = vec3(0.94, 0.965, 1.0);
        vec3 inactiveSheet = mix(paper, texel.rgb, 0.055 * sheetDim);
        float activeDim = mix(unfocusedDim, 1.0, selected);
        vec3 activeSheet = texel.rgb * activeDim;
        vec3 color = mix(inactiveSheet, activeSheet, activeWeight);
        gl_FragColor = vec4(color, texel.a * opacity * transitionOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  material.opacity = .96;
  material.userData.baseOpacity = .96;
  material.userData.atlasSurface = true;
  material.onBeforeRender = () => {
    material.uniforms.opacity.value = material.opacity;
  };
  return material;
}

function viewDependentAtlasMaterial() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      color00: {value: atlasTextures[0]},
      color10: {value: atlasTextures[0]},
      color01: {value: atlasTextures[0]},
      color11: {value: atlasTextures[0]},
      maskAtlas: {value: maskTexture},
      colorCell00: {value: new THREE.Vector2()},
      colorCell10: {value: new THREE.Vector2()},
      colorCell01: {value: new THREE.Vector2()},
      colorCell11: {value: new THREE.Vector2()},
      maskCell00: {value: new THREE.Vector2()},
      maskCell10: {value: new THREE.Vector2()},
      maskCell01: {value: new THREE.Vector2()},
      maskCell11: {value: new THREE.Vector2()},
      angleBlend: {value: new THREE.Vector2()},
      opacity: {value: 1},
    },
    vertexShader: `
      varying vec2 proxyUv;
      void main() {
        proxyUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D color00;
      uniform sampler2D color10;
      uniform sampler2D color01;
      uniform sampler2D color11;
      uniform sampler2D maskAtlas;
      uniform vec2 colorCell00;
      uniform vec2 colorCell10;
      uniform vec2 colorCell01;
      uniform vec2 colorCell11;
      uniform vec2 maskCell00;
      uniform vec2 maskCell10;
      uniform vec2 maskCell01;
      uniform vec2 maskCell11;
      uniform vec2 angleBlend;
      uniform float opacity;
      varying vec2 proxyUv;

      vec2 colorUv(vec2 cell) {
        return vec2(
          (cell.x + proxyUv.x) / 9.0,
          (7.0 - cell.y - 1.0 + proxyUv.y) / 7.0
        );
      }

      vec2 maskUv(vec2 cell) {
        return vec2(
          (cell.x + proxyUv.x) / 28.0,
          (27.0 - cell.y - 1.0 + proxyUv.y) / 27.0
        );
      }

      vec4 maskedView(sampler2D colorMap, vec2 colorCell, vec2 maskCell) {
        vec3 color = texture2D(colorMap, colorUv(colorCell)).rgb;
        float distanceValue = texture2D(maskAtlas, maskUv(maskCell)).r;
        float alpha = smoothstep(.46, .54, distanceValue);
        return vec4(color * alpha, alpha);
      }

      void main() {
        vec4 row0 = mix(
          maskedView(color00, colorCell00, maskCell00),
          maskedView(color10, colorCell10, maskCell10),
          angleBlend.x
        );
        vec4 row1 = mix(
          maskedView(color01, colorCell01, maskCell01),
          maskedView(color11, colorCell11, maskCell11),
          angleBlend.x
        );
        vec4 blended = mix(row0, row1, angleBlend.y);
        if (blended.a < .008) discard;
        gl_FragColor = vec4(blended.rgb / max(blended.a, .008), blended.a * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  material.userData.baseOpacity = 1;
  material.onBeforeRender = () => {
    material.uniforms.opacity.value = material.opacity;
  };
  return material;
}

function lineMaterial(color, opacity = 1, dashed = false) {
  const Material = dashed ? THREE.LineDashedMaterial : THREE.LineBasicMaterial;
  const material = new Material({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    ...(dashed ? {dashSize: .09, gapSize: .065} : {}),
  });
  material.userData.baseOpacity = opacity;
  return material;
}

function lineFromPoints(points, material, loop = false) {
  const LineClass = loop ? THREE.LineLoop : THREE.Line;
  const line = new LineClass(new THREE.BufferGeometry().setFromPoints(points), material);
  if (material.isLineDashedMaterial) line.computeLineDistances();
  return line;
}

function segmentLines(segments, material) {
  const points = segments.flatMap(([start, end]) => [start, end]);
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), material);
  if (material.isLineDashedMaterial) line.computeLineDistances();
  return line;
}

function createArrow(start, end, color, opacity = .9, dashed = false, headSize = .08) {
  const group = new THREE.Group();
  const direction = end.clone().sub(start);
  const length = direction.length();
  const unit = direction.clone().normalize();
  const shaftEnd = end.clone().addScaledVector(unit, -headSize * 1.65);
  group.add(lineFromPoints([start, shaftEnd], lineMaterial(color, opacity, dashed)));
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(headSize * .55, headSize * 1.5, 16),
    basicMaterial(color, opacity),
  );
  cone.position.copy(end).addScaledVector(unit, -headSize * .75);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), unit);
  group.add(cone);
  return group;
}

function createTextSprite(initialText, color, width = .62) {
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 96;
  const context = labelCanvas.getContext('2d');
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  material.userData.baseOpacity = 1;
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width, width * labelCanvas.height / labelCanvas.width, 1);
  sprite.renderOrder = 40;
  sprite.userData.setText = (text) => {
    context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
    context.font = '600 36px Inter, Arial, sans-serif';
    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, labelCanvas.width / 2, labelCanvas.height / 2);
    texture.needsUpdate = true;
  };
  sprite.userData.setText(initialText);
  return sprite;
}

function createAtlasAddressBadge() {
  const badgeWidth = 1.32;
  const badgeHeight = .78;
  const badgeCanvas = document.createElement('canvas');
  badgeCanvas.width = 1320;
  badgeCanvas.height = 780;
  const context = badgeCanvas.getContext('2d');
  const texture = new THREE.CanvasTexture(badgeCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  material.userData.baseOpacity = 1;
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(badgeWidth, badgeHeight), material);
  badge.renderOrder = 48;
  badge.userData.size = new THREE.Vector2(badgeWidth, badgeHeight);
  badge.userData.setAddress = ({layer, view, u, v}) => {
    context.clearRect(0, 0, badgeCanvas.width, badgeCanvas.height);

    context.fillStyle = 'rgba(255, 255, 255, .97)';
    context.strokeStyle = '#6482dc';
    context.lineWidth = 16;
    context.lineJoin = 'round';
    context.beginPath();
    context.roundRect(18, 18, badgeCanvas.width - 36, badgeCanvas.height - 36, 38);
    context.fill();
    context.stroke();

    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.fillStyle = '#6482dc';
    context.fillStyle = '#282728';
    context.font = '700 150px Inter, Arial, sans-serif';
    context.fillText(`LAYER ${String(layer).padStart(2, '0')}`, 92, 314);
    context.fillStyle = '#6482dc';
    context.font = '700 118px Inter, Arial, sans-serif';
    context.fillText(`VIEW ${String(view).padStart(2, '0')}`, 92, 570);
    texture.needsUpdate = true;
  };
  badge.userData.setAddress({layer: 0, view: 0, u: 0, v: 0});
  return badge;
}

function createImagePlane({width = .86, height = 1.15, color, opacity = .12}) {
  const group = new THREE.Group();
  group.rotation.y = Math.PI / 2;
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(width, height), basicMaterial(color, opacity));
  group.add(surface);
  const border = lineFromPoints([
    new THREE.Vector3(-width * .5, -height * .5, .008),
    new THREE.Vector3(width * .5, -height * .5, .008),
    new THREE.Vector3(width * .5, height * .5, .008),
    new THREE.Vector3(-width * .5, height * .5, .008),
  ], lineMaterial(color, .92), true);
  group.add(border);
  const imageSize = Math.min(width, height) * .92;
  const image = new THREE.Mesh(
    new THREE.PlaneGeometry(imageSize, imageSize),
    basicMaterial(0xffffff, 1, {map: sampleTexture, depthWrite: false}),
  );
  image.position.z = .014;
  group.add(image);
  return group;
}

const staticConstruction = new THREE.Group();
scene.add(staticConstruction);

const GROUND_WIDTH = 28;
const GROUND_DEPTH = 18;
const GRID_STEP = .72;
const groundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(GROUND_WIDTH, GROUND_DEPTH),
  new THREE.MeshBasicMaterial({
    color: palette.paper,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
);
groundPlane.name = 'SharedWhiteDatumPlane';
groundPlane.rotation.x = -Math.PI * .5;
groundPlane.position.set(0, GROUND_Y, 0);
groundPlane.renderOrder = 2;

const groundGridSegments = [];
for (let x = -GROUND_WIDTH * .5; x <= GROUND_WIDTH * .5 + .001; x += GRID_STEP) {
  groundGridSegments.push([
    new THREE.Vector3(x, GROUND_Y + .004, -GROUND_DEPTH * .5),
    new THREE.Vector3(x, GROUND_Y + .004, GROUND_DEPTH * .5),
  ]);
}
for (let z = -GROUND_DEPTH * .5; z <= GROUND_DEPTH * .5 + .001; z += GRID_STEP) {
  groundGridSegments.push([
    new THREE.Vector3(-GROUND_WIDTH * .5, GROUND_Y + .004, z),
    new THREE.Vector3(GROUND_WIDTH * .5, GROUND_Y + .004, z),
  ]);
}
const groundGridMaterial = new THREE.ShaderMaterial({
  uniforms: {
    color: {value: new THREE.Color(palette.bake)},
    opacity: {value: .26},
    halfExtents: {value: new THREE.Vector2(GROUND_WIDTH * .5, GROUND_DEPTH * .5)},
  },
  transparent: true,
  depthWrite: false,
  toneMapped: false,
  vertexShader: `
    varying vec2 gridPosition;
    void main() {
      gridPosition = position.xz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 color;
    uniform float opacity;
    uniform vec2 halfExtents;
    varying vec2 gridPosition;
    void main() {
      vec2 normalizedPosition = gridPosition / halfExtents;
      float radialDistance = length(normalizedPosition);
      float borderFade = 1.0 - smoothstep(0.52, 0.92, radialDistance);
      gl_FragColor = vec4(color, opacity * borderFade);
    }
  `,
});
const groundGrid = new THREE.LineSegments(
  new THREE.BufferGeometry().setFromPoints(groundGridSegments.flat()),
  groundGridMaterial,
);
groundGrid.name = 'SharedBlueDatumGrid';
groundGrid.renderOrder = 3;
staticConstruction.add(groundPlane, groundGrid);

const engineFloorLabels = [
  {
    element: document.querySelector('#label-lens-studio'),
    position: new THREE.Vector3(AR_SCENE_CENTER.x, GROUND_Y + .03, AR_SCENE_CENTER.z + 1.12),
  },
  {
    element: document.querySelector('#label-three-js'),
    position: new THREE.Vector3(THREEJS_SCENE_CENTER.x, GROUND_Y + .03, THREEJS_SCENE_CENTER.z + 1.12),
  },
];

// Lens Studio coordinate sphere. +Y is the scene up axis. The group's local
// +Z is kept camera-facing with a roll-free lookAt in the render loop.
const orientationCupola = new THREE.Group();
orientationCupola.name = 'LensStudioViewCoordinateCupola';
orientationCupola.position.copy(GLOBE_CENTER);
orientationCupola.rotation.y = THREE.MathUtils.degToRad(38);
orientationCupola.up.set(0, 1, 0);
scene.add(orientationCupola);

const cupolaSurface = new THREE.Mesh(
  new THREE.SphereGeometry(CUPOLA_RADIUS, 64, 48),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      varying float fresnel;
      void main() {
        vec3 viewNormal = normalize(normalMatrix * normal);
        vec3 viewPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        fresnel = pow(1.0 - abs(dot(viewNormal, normalize(-viewPosition))), 1.85);
        gl_Position = projectionMatrix * vec4(viewPosition, 1.0);
      }
    `,
    fragmentShader: `
      varying float fresnel;
      void main() {
        float alpha = .008 + fresnel * .105;
        gl_FragColor = vec4(0.55, 0.66, 1.0, alpha);
      }
    `,
  }),
);
orientationCupola.add(cupolaSurface);

// A single world-horizontal great circle reads as an ellipse from oblique
// views. The half behind the sphere becomes a restrained dash while the near
// half remains continuous, so depth stays legible without drawing a mesh grid.
const cupolaCircumferencePoints = Array.from({length: 129}, (_, index) => {
  const angle = index / 128 * Math.PI * 2;
  return new THREE.Vector3(
    Math.cos(angle) * CUPOLA_RADIUS * 1.003,
    0,
    Math.sin(angle) * CUPOLA_RADIUS * 1.003,
  );
});
const cupolaCircumferenceMaterial = new THREE.ShaderMaterial({
  uniforms: {
    color: {value: new THREE.Color(palette.bake)},
    opacity: {value: .34},
  },
  transparent: true,
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
  vertexShader: `
    attribute float lineDistance;
    varying float circumferenceDepth;
    varying float circumferenceDistance;
    void main() {
      vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      vec3 worldCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      vec3 towardCamera = normalize(cameraPosition - worldCenter);
      circumferenceDepth = dot(worldPosition - worldCenter, towardCamera);
      circumferenceDistance = lineDistance;
      gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 color;
    uniform float opacity;
    varying float circumferenceDepth;
    varying float circumferenceDistance;
    void main() {
      float front = smoothstep(-0.018, 0.018, circumferenceDepth);
      float rearDash = step(mod(circumferenceDistance, 0.165), 0.092);
      float rearAlpha = rearDash * 0.48;
      gl_FragColor = vec4(color, opacity * mix(rearAlpha, 1.0, front));
    }
  `,
});
cupolaCircumferenceMaterial.userData.baseOpacity = .34;
const cupolaCircumference = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(cupolaCircumferencePoints),
  cupolaCircumferenceMaterial,
);
cupolaCircumference.computeLineDistances();
cupolaCircumference.renderOrder = 35;
orientationCupola.add(cupolaCircumference);

// The sphere itself stays free of a latitude/longitude mesh. Only the active
// spherical-coordinate construction is drawn: two interior projection rays,
// the vertical lift to the selected surface point, and the exterior AZ/EL path.
const cupolaProjectionMaterial = lineMaterial(palette.offline, .78);
cupolaProjectionMaterial.depthTest = false;
const cupolaProjectionGuides = new THREE.LineSegments(
  new THREE.BufferGeometry(),
  cupolaProjectionMaterial,
);
cupolaProjectionGuides.renderOrder = 36;
orientationCupola.add(cupolaProjectionGuides);

const cupolaProjectionFoot = new THREE.Mesh(
  new THREE.SphereGeometry(.026, 16, 10),
  basicMaterial(palette.offline, .88, {depthTest: false}),
);
cupolaProjectionFoot.renderOrder = 37;
orientationCupola.add(cupolaProjectionFoot);

const cupolaStar = new THREE.Group();
const cupolaStarOutline = new THREE.Mesh(
  new THREE.SphereGeometry(.067, 20, 14),
  basicMaterial(palette.bake, 1, {side: THREE.BackSide, depthTest: false}),
);
const cupolaStarCore = new THREE.Mesh(
  new THREE.SphereGeometry(.055, 20, 14),
  basicMaterial(palette.paper, 1, {depthTest: false}),
);
cupolaStar.add(cupolaStarOutline, cupolaStarCore);
cupolaStar.renderOrder = 40;
orientationCupola.add(cupolaStar);

function createCupolaSurfaceArrow(color) {
  const fillMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: .98,
    depthTest: false,
    depthWrite: false,
  });
  fillMaterial.userData.baseOpacity = .98;
  const outlineMaterial = new THREE.MeshBasicMaterial({
    color: 0x2e4a83,
    transparent: true,
    opacity: .94,
    depthTest: false,
    depthWrite: false,
  });
  outlineMaterial.userData.baseOpacity = .94;

  const group = new THREE.Group();
  const placeholderCurve = new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(.01, 0, 0));
  const shaftOutline = new THREE.Mesh(new THREE.TubeGeometry(placeholderCurve, 2, .016, 8, false), outlineMaterial);
  const shaft = new THREE.Mesh(new THREE.TubeGeometry(placeholderCurve, 2, .011, 8, false), fillMaterial);
  const headOutline = new THREE.Mesh(new THREE.ConeGeometry(.054, .152, 16), outlineMaterial);
  const head = new THREE.Mesh(new THREE.ConeGeometry(.048, .14, 16), fillMaterial);
  const startCapOutline = new THREE.Mesh(new THREE.SphereGeometry(.016, 12, 8), outlineMaterial);
  const startCap = new THREE.Mesh(new THREE.SphereGeometry(.010, 12, 8), fillMaterial);
  shaftOutline.renderOrder = 38;
  shaft.renderOrder = 39;
  headOutline.renderOrder = 40;
  head.renderOrder = 41;
  startCapOutline.renderOrder = 38;
  startCap.renderOrder = 39;
  group.add(shaftOutline, shaft, headOutline, head, startCapOutline, startCap);
  orientationCupola.add(group);
  return {
    group,
    shaft,
    shaftOutline,
    head,
    headOutline,
    startCap,
    startCapOutline,
    fillMaterial,
    outlineMaterial,
    pathKey: '',
  };
}

function setCupolaArrowPresence(arrow, label, presence) {
  const easedPresence = THREE.MathUtils.smoothstep(presence, 0, 1);
  arrow.fillMaterial.opacity = .98 * easedPresence;
  arrow.outlineMaterial.opacity = .94 * easedPresence;
  label.material.opacity = easedPresence;
  arrow.group.visible = easedPresence > .002;
  label.visible = easedPresence > .002;
}

function setCupolaArrowPath(arrow, points, end, tangent, pathKey) {
  if (arrow.pathKey === pathKey) return;
  arrow.pathKey = pathKey;
  const shaftPoints = points.map((point) => point.clone());
  shaftPoints[shaftPoints.length - 1] = end.clone().addScaledVector(tangent, -.078);
  const curve = new THREE.CatmullRomCurve3(shaftPoints, false, 'centripetal');
  const segments = Math.max(20, shaftPoints.length * 3);
  arrow.shaft.geometry.dispose();
  arrow.shaftOutline.geometry.dispose();
  arrow.shaft.geometry = new THREE.TubeGeometry(curve, segments, .011, 8, false);
  arrow.shaftOutline.geometry = new THREE.TubeGeometry(curve, segments, .016, 8, false);
  const headCenter = end.clone().addScaledVector(tangent, -.076);
  const headRotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
  arrow.head.position.copy(headCenter);
  arrow.headOutline.position.copy(headCenter);
  arrow.head.quaternion.copy(headRotation);
  arrow.headOutline.quaternion.copy(headRotation);
  arrow.startCap.position.copy(shaftPoints[0]);
  arrow.startCapOutline.position.copy(shaftPoints[0]);
}

const cupolaAzimuthArrow = createCupolaSurfaceArrow(0xfda690);
const cupolaElevationArrow = createCupolaSurfaceArrow(0xb4f5fd);
const cupolaAzimuthLabel = createTextSprite('AZ', '#FDA690', .22);
const cupolaElevationLabel = createTextSprite('EL', '#B4F5FD', .22);
cupolaAzimuthLabel.renderOrder = 40;
cupolaElevationLabel.renderOrder = 40;
orientationCupola.add(cupolaAzimuthLabel, cupolaElevationLabel);

const orientationCupolaHitTarget = new THREE.Mesh(
  new THREE.PlaneGeometry(CUPOLA_RADIUS * 2.45, CUPOLA_RADIUS * 2.35),
  new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
    side: THREE.DoubleSide,
  }),
);
orientationCupolaHitTarget.position.y = CUPOLA_RADIUS * .47;
orientationCupolaHitTarget.material.userData.interactionOnly = true;
orientationCupola.add(orientationCupolaHitTarget);

const stageGroups = {
  source: new THREE.Group(),
  bake: new THREE.Group(),
  runtime: new THREE.Group(),
  stereo: new THREE.Group(),
};
Object.entries(stageGroups).forEach(([key, group]) => {
  group.name = `${key[0].toUpperCase()}${key.slice(1)}Stage`;
  scene.add(group);
});

function registerStageMaterials(root, stageKey) {
  root.traverse((object) => {
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material.userData.interactionOnly) return;
      if (material.userData.baseOpacity == null) material.userData.baseOpacity = material.opacity ?? 1;
      material.userData.stageKey = stageKey;
      material.transparent = true;
    });
  });
}

// Offline source: a true ellipsoidal body seen by the independent diagram
// camera. Its object-space surface is distinct from the selected camera bake.
const harlequinBodyGeometry = new THREE.SphereGeometry(1, 64, 40);
const harlequinBodyScale = new THREE.Vector3(.54, .702, .27);
const sourceMaterial = new THREE.ShaderMaterial({
  uniforms: {
    sourceMap: {value: sourceSurfaceTexture},
  },
  transparent: true,
  opacity: .98,
  toneMapped: false,
  side: THREE.DoubleSide,
  vertexShader: `
    varying vec2 surfaceUv;
    varying vec3 viewNormal;
    varying vec3 viewPosition;
    void main() {
      surfaceUv = uv;
      viewNormal = normalize(normalMatrix * normal);
      viewPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * vec4(viewPosition, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D sourceMap;
    varying vec2 surfaceUv;
    varying vec3 viewNormal;
    varying vec3 viewPosition;
    void main() {
      vec3 sampled = texture2D(sourceMap, surfaceUv).rgb;
      float imageContent = smoothstep(.045, .20, max(sampled.r, max(sampled.g, sampled.b)));
      float fresnel = pow(1.0 - abs(dot(normalize(viewNormal), normalize(-viewPosition))), 2.15);
      vec3 body = mix(vec3(.08, .12, .32), vec3(.38, .56, .96), fresnel);
      vec3 color = mix(body, sampled, imageContent * .96);
      color += fresnel * vec3(.08, .15, .34);
      gl_FragColor = vec4(color, .98);
    }
  `,
});
sourceMaterial.userData.baseOpacity = .98;
const sourceOpal = new THREE.Mesh(harlequinBodyGeometry, sourceMaterial);
sourceOpal.position.set(THREEJS_SCENE_CENTER.x, .05 + THREEJS_SCENE_LIFT, THREEJS_SCENE_CENTER.z);
sourceOpal.scale.copy(harlequinBodyScale);
sourceOpal.rotation.set(.1, -.22, -.04);
stageGroups.source.add(sourceOpal);
// Keep the analytic body as the hidden path-tracing source. The visible
// Three.js opal is reconstructed from the baked views below.
sourceOpal.visible = false;
const sourceAtlasProxyMaterial = viewDependentAtlasMaterial();
// This is a view-dependent cutout, but every visible opal pixel is a solid
// foreground surface in the construction. Let it write depth after the atlas
// stack so the cards cannot bleed through its silhouette.
sourceAtlasProxyMaterial.depthWrite = true;
const sourceAtlasProxy = new THREE.Mesh(
  new THREE.PlaneGeometry(1.46, 1.46),
  sourceAtlasProxyMaterial,
);
sourceAtlasProxy.name = 'ViewDependentAtlasOpal';
sourceAtlasProxy.position.copy(sourceOpal.position);
sourceAtlasProxy.renderOrder = 60;
stageGroups.source.add(sourceAtlasProxy);
const sourceShadow = new THREE.Mesh(
  new THREE.CircleGeometry(.36, 48),
  basicMaterial(0xb8d8e8, .1, {depthWrite: false}),
);
sourceShadow.position.set(THREEJS_SCENE_CENTER.x, -.48 + THREEJS_SCENE_LIFT, .02);
sourceShadow.rotation.x = -Math.PI / 2;
sourceShadow.scale.set(1, .34, 1);
stageGroups.source.add(sourceShadow);

const light = new THREE.Group();
light.position.set(THREEJS_SCENE_CENTER.x + .17, 1.55 + THREEJS_SCENE_LIFT, -.18);
light.add(new THREE.Mesh(new THREE.SphereGeometry(.09, 24, 16), basicMaterial(palette.offline, .95)));
for (let index = 0; index < 8; index += 1) {
  const angle = index / 8 * Math.PI * 2;
  light.add(lineFromPoints([
    new THREE.Vector3(Math.cos(angle) * .14, Math.sin(angle) * .14, 0),
    new THREE.Vector3(Math.cos(angle) * .22, Math.sin(angle) * .22, 0),
  ], lineMaterial(palette.offline, .72)));
}
stageGroups.source.add(light);
// The source illumination contributes to the bake, but does not need a
// decorative sun glyph in the representation-chain plate.
light.visible = false;

// Offline path-traced bake: camera, image plane, ray samples, and atlas.
const pathCamera = new THREE.Group();
stageGroups.bake.add(pathCamera);
const CAPTURE_ORBIT_RADIUS = ORBIT_RADIUS;

async function loadPathCamera() {
  try {
    pathCameraDisplay = await createDiagramCamera({
      height: .46,
      screenTexture: pathCameraRenderTarget.texture,
      toonOutlined: true,
    });
    // Lift the physical camera above the sampled plate so its body and monitor
    // read as one coherent frame rather than intersecting the image proxy.
    pathCameraDisplay.group.position.y = .18;
    pathCamera.add(pathCameraDisplay.group);
    registerStageMaterials(pathCameraDisplay.group, 'bake');
  } catch (error) {
    console.error('Camera geometry failed to load.', error);
  }
}

const sampledPlane = createImagePlane({
  width: .94,
  height: 1.22,
  color: palette.offline,
  opacity: .09,
});
// The enlarged sampled image is a fixed explanatory plate in the bake scene.
// The miniature display remains attached to the physical camera body.
sampledPlane.position.set(THREEJS_SCENE_CENTER.x - 1.45, .06 + THREEJS_SCENE_LIFT, 0);
stageGroups.bake.add(sampledPlane);

const atlas = new THREE.Group();
atlas.position.copy(ATLAS_CENTER);
atlas.scale.set(.86, .86, .86);
const atlasCardGeometry = new THREE.PlaneGeometry(ATLAS_DISPLAY_WIDTH, ATLAS_DISPLAY_HEIGHT);
const atlasCardOutline = [
  new THREE.Vector3(-ATLAS_DISPLAY_WIDTH * .5, -ATLAS_DISPLAY_HEIGHT * .5, .008),
  new THREE.Vector3(ATLAS_DISPLAY_WIDTH * .5, -ATLAS_DISPLAY_HEIGHT * .5, .008),
  new THREE.Vector3(ATLAS_DISPLAY_WIDTH * .5, ATLAS_DISPLAY_HEIGHT * .5, .008),
  new THREE.Vector3(-ATLAS_DISPLAY_WIDTH * .5, ATLAS_DISPLAY_HEIGHT * .5, .008),
];

// These translucent cards suggest stack depth without occluding scene objects
// or exposing perspective rhombi.
for (let depth = ATLAS_URLS.length - 1; depth >= 1; depth -= 1) {
  const opacity = THREE.MathUtils.lerp(
    .018,
    .065,
    1 - (depth - 1) / (ATLAS_URLS.length - 2),
  );
  const material = basicMaterial(palette.bake, opacity, {
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const card = new THREE.Mesh(atlasCardGeometry, material);
  card.renderOrder = 18;
  card.userData.depth = depth;
  atlasStructuralLayers.push(card);
  atlas.add(card);
}

ATLAS_URLS.forEach((_, sheet) => {
  const layer = new THREE.Group();
  const surfaceMaterial = atlasMaterial(atlasTextures[sheet], sheet);
  const surface = new THREE.Mesh(atlasCardGeometry, surfaceMaterial);
  const outline = lineFromPoints(
    atlasCardOutline,
    lineMaterial(palette.bake, .92),
    true,
  );
  outline.material.userData.atlasOutline = true;
  outline.material.userData.focusTarget = new THREE.Color(palette.bake);
  layer.add(surface, outline);
  layer.position.set(0, 0, 0);
  layer.userData.sheet = sheet;
  layer.userData.permutationFrom = layer.position.clone();
  layer.userData.permutationTo = layer.position.clone();
  layer.children.forEach((child) => {
    child.renderOrder = 20 - sheet;
  });
  atlasLayers.push(layer);
  atlas.add(layer);
});
const atlasGridSegments = [];
for (let column = 1; column < SHEET_COLUMNS; column += 1) {
  const x = -ATLAS_DISPLAY_WIDTH * .5 + column * ATLAS_DISPLAY_WIDTH / SHEET_COLUMNS;
  atlasGridSegments.push([
    new THREE.Vector3(x, -ATLAS_DISPLAY_HEIGHT * .5, .012),
    new THREE.Vector3(x, ATLAS_DISPLAY_HEIGHT * .5, .012),
  ]);
}
for (let row = 1; row < PITCH_VIEWS; row += 1) {
  const y = -ATLAS_DISPLAY_HEIGHT * .5 + row * ATLAS_DISPLAY_HEIGHT / PITCH_VIEWS;
  atlasGridSegments.push([
    new THREE.Vector3(-ATLAS_DISPLAY_WIDTH * .5, y, .012),
    new THREE.Vector3(ATLAS_DISPLAY_WIDTH * .5, y, .012),
  ]);
}
atlasGridOverlay = segmentLines(atlasGridSegments, lineMaterial(0xf3f0e7, .3));
atlasGridOverlay.renderOrder = 40;
atlas.add(atlasGridOverlay);

atlasActiveFrame = new THREE.Group();
const atlasFrameMaterial = basicMaterial(0xffffff, 1, {
  depthWrite: false,
  depthTest: false,
});
const atlasFrameThickness = .028;
[
  [0, ATLAS_DISPLAY_HEIGHT * .5, ATLAS_DISPLAY_WIDTH + atlasFrameThickness, atlasFrameThickness],
  [0, -ATLAS_DISPLAY_HEIGHT * .5, ATLAS_DISPLAY_WIDTH + atlasFrameThickness, atlasFrameThickness],
  [-ATLAS_DISPLAY_WIDTH * .5, 0, atlasFrameThickness, ATLAS_DISPLAY_HEIGHT + atlasFrameThickness],
  [ATLAS_DISPLAY_WIDTH * .5, 0, atlasFrameThickness, ATLAS_DISPLAY_HEIGHT + atlasFrameThickness],
].forEach(([x, y, width, height]) => {
  const stroke = new THREE.Mesh(new THREE.PlaneGeometry(width, height), atlasFrameMaterial);
  stroke.position.set(x, y, .016);
  stroke.renderOrder = 41;
  atlasActiveFrame.add(stroke);
});
atlas.add(atlasActiveFrame);
const selectionWidth = ATLAS_DISPLAY_WIDTH / SHEET_COLUMNS;
const selectionHeight = ATLAS_DISPLAY_HEIGHT / PITCH_VIEWS;

// A sheet-local U/V frame makes every packed view addressable without
// turning the atlas into a spreadsheet. U advances across columns; V follows
// the image rows from top to bottom.
atlasCoordinateAxes = new THREE.Group();
const axisGap = .072;
const axisTick = .035;
const axisZ = .021;
const axisSegments = [
  [
    new THREE.Vector3(-ATLAS_DISPLAY_WIDTH * .5, -ATLAS_DISPLAY_HEIGHT * .5 - axisGap, axisZ),
    new THREE.Vector3(ATLAS_DISPLAY_WIDTH * .5 + .075, -ATLAS_DISPLAY_HEIGHT * .5 - axisGap, axisZ),
  ],
  [
    new THREE.Vector3(-ATLAS_DISPLAY_WIDTH * .5 - axisGap, ATLAS_DISPLAY_HEIGHT * .5, axisZ),
    new THREE.Vector3(-ATLAS_DISPLAY_WIDTH * .5 - axisGap, -ATLAS_DISPLAY_HEIGHT * .5 - .075, axisZ),
  ],
];
for (let column = 0; column < SHEET_COLUMNS; column += 1) {
  const x = -ATLAS_DISPLAY_WIDTH * .5 + (column + .5) * selectionWidth;
  const y = -ATLAS_DISPLAY_HEIGHT * .5 - axisGap;
  axisSegments.push([
    new THREE.Vector3(x, y - axisTick * .5, axisZ),
    new THREE.Vector3(x, y + axisTick * .5, axisZ),
  ]);
}
for (let row = 0; row < PITCH_VIEWS; row += 1) {
  const x = -ATLAS_DISPLAY_WIDTH * .5 - axisGap;
  const y = ATLAS_DISPLAY_HEIGHT * .5 - (row + .5) * selectionHeight;
  axisSegments.push([
    new THREE.Vector3(x - axisTick * .5, y, axisZ),
    new THREE.Vector3(x + axisTick * .5, y, axisZ),
  ]);
}
const axisLines = segmentLines(axisSegments, lineMaterial(palette.bake, .62));
axisLines.material.depthTest = false;
axisLines.renderOrder = 46;
atlasCoordinateAxes.add(axisLines);
const uAxisLabel = createTextSprite('U', '#6482dc', .16);
uAxisLabel.position.set(ATLAS_DISPLAY_WIDTH * .5 + .12, -ATLAS_DISPLAY_HEIGHT * .5 - axisGap, axisZ);
uAxisLabel.renderOrder = 47;
atlasCoordinateAxes.add(uAxisLabel);
const vAxisLabel = createTextSprite('V', '#6482dc', .16);
vAxisLabel.position.set(-ATLAS_DISPLAY_WIDTH * .5 - axisGap, -ATLAS_DISPLAY_HEIGHT * .5 - .13, axisZ);
vAxisLabel.renderOrder = 47;
atlasCoordinateAxes.add(vAxisLabel);
atlas.add(atlasCoordinateAxes);

atlasAddressLeader = lineFromPoints([
  new THREE.Vector3(),
  new THREE.Vector3(),
  new THREE.Vector3(),
], lineMaterial(palette.bake, .72, true));
atlasAddressLeader.material.depthTest = false;
atlasAddressLeader.renderOrder = 47;
atlas.add(atlasAddressLeader);

atlasAddressBadge = createAtlasAddressBadge();
atlasAddressBadge.userData.targetPosition = new THREE.Vector3();
atlasAddressBadge.userData.hasTargetPosition = false;
atlas.add(atlasAddressBadge);

atlasSelectionOverlay = new THREE.Group();
atlasSelectionOverlay.userData.cellPosition = new THREE.Vector3();
atlasSelectionSurface = new THREE.Mesh(
  new THREE.PlaneGeometry(selectionWidth, selectionHeight),
  basicMaterial(palette.runtime, .2, {depthWrite: false}),
);
atlasSelectionSurface.position.z = .017;
atlasSelectionSurface.renderOrder = 42;
atlasSelectionOverlay.add(atlasSelectionSurface);
atlasSelectionHalo = lineFromPoints([
  new THREE.Vector3(-selectionWidth * .57, -selectionHeight * .57, .018),
  new THREE.Vector3(selectionWidth * .57, -selectionHeight * .57, .018),
  new THREE.Vector3(selectionWidth * .57, selectionHeight * .57, .018),
  new THREE.Vector3(-selectionWidth * .57, selectionHeight * .57, .018),
], lineMaterial(0xf3f0e7, .96), true);
atlasSelectionHalo.renderOrder = 43;
atlasSelectionOverlay.add(atlasSelectionHalo);
atlasSelection = lineFromPoints([
  new THREE.Vector3(-selectionWidth * .5, -selectionHeight * .5, .02),
  new THREE.Vector3(selectionWidth * .5, -selectionHeight * .5, .02),
  new THREE.Vector3(selectionWidth * .5, selectionHeight * .5, .02),
  new THREE.Vector3(-selectionWidth * .5, selectionHeight * .5, .02),
], lineMaterial(0xffffff, 1), true);
atlasSelection.renderOrder = 44;
atlasSelectionOverlay.add(atlasSelection);

const selectionFrameMaterial = basicMaterial(0xffffff, 1, {
  depthWrite: false,
  depthTest: false,
});
const selectionFrameThickness = .022;
[
  [0, selectionHeight * .5, selectionWidth + selectionFrameThickness, selectionFrameThickness],
  [0, -selectionHeight * .5, selectionWidth + selectionFrameThickness, selectionFrameThickness],
  [-selectionWidth * .5, 0, selectionFrameThickness, selectionHeight + selectionFrameThickness],
  [selectionWidth * .5, 0, selectionFrameThickness, selectionHeight + selectionFrameThickness],
].forEach(([x, y, width, height]) => {
  const stroke = new THREE.Mesh(new THREE.PlaneGeometry(width, height), selectionFrameMaterial);
  stroke.position.set(x, y, .024);
  stroke.renderOrder = 45;
  atlasSelectionOverlay.add(stroke);
});
atlas.add(atlasSelectionOverlay);
stageGroups.bake.add(atlas);

function syncAtlasSelectionOverlay() {
  const activeLayer = atlasLayers[atlasLayerOrder[0]];
  if (!activeLayer || !atlasSelectionOverlay) return;
  atlasGridOverlay.position.copy(activeLayer.position);
  atlasActiveFrame.position.copy(activeLayer.position);
  atlasCoordinateAxes.position.copy(activeLayer.position);
  atlasSelectionOverlay.position.copy(atlasSelectionOverlay.userData.cellPosition);
  atlasSelectionOverlay.position.add(activeLayer.position);

  const cellPosition = atlasSelectionOverlay.userData.cellPosition;
  // The readout always remains on the atlas's right side.
  const badgeSide = 1;
  const badgeGap = .22;
  const badgeWidth = atlasAddressBadge.userData.size.x;
  const badgeX = badgeSide * (ATLAS_DISPLAY_WIDTH * .5 + badgeGap + badgeWidth * .5);
  const badgeY = cellPosition.y;
  const badgeTarget = atlasAddressBadge.userData.targetPosition.set(
    badgeX,
    badgeY,
    .035,
  ).add(activeLayer.position);
  if (!atlasAddressBadge.userData.hasTargetPosition) {
    atlasAddressBadge.position.copy(badgeTarget);
    atlasAddressBadge.userData.hasTargetPosition = true;
  }
}

function updateAtlasAddressBadgeMotion() {
  const activeLayer = atlasLayers[atlasLayerOrder[0]];
  if (!activeLayer || !atlasSelectionOverlay || !atlasAddressBadge.userData.hasTargetPosition) return;
  atlasAddressBadge.position.lerp(atlasAddressBadge.userData.targetPosition, .12);

  const cellPosition = atlasSelectionOverlay.userData.cellPosition;
  const badgeSide = 1;
  const badgeWidth = atlasAddressBadge.userData.size.x;
  const cellEdgeX = cellPosition.x + badgeSide * selectionWidth * .57 + activeLayer.position.x;
  const badgeEdgeX = atlasAddressBadge.position.x - badgeSide * badgeWidth * .5;
  const leaderPoints = [
    new THREE.Vector3(cellEdgeX, cellPosition.y + activeLayer.position.y, .029),
    new THREE.Vector3(cellEdgeX + badgeSide * .07, atlasAddressBadge.position.y, .029),
    new THREE.Vector3(badgeEdgeX, atlasAddressBadge.position.y, .029),
  ];
  atlasAddressLeader.geometry.setFromPoints(leaderPoints);
  atlasAddressLeader.computeLineDistances();
}

function updateAtlasFocus() {
  atlasLayers.forEach((layer) => {
    const rank = atlasLayerOrder.indexOf(layer.userData.sheet);
    const isTransitionSource = atlasPermutationStart > 0
      && layer.userData.sheet === atlasTransitionFromSheet;
    // Only the selected atlas is geometry. The remaining sheets are a
    // screen-space structural cue, so orbiting never exposes rhombus edges.
    layer.visible = rank === 0 || isTransitionSource;
    const surfaceMaterial = layer.children[0].material;
    const outlineMaterial = layer.children[1].material;
    layer.children[1].visible = rank === 0;
    const targetActiveWeight = rank === 0 || isTransitionSource ? 1 : 0;
    const targetSheetDim = rank === 0 || isTransitionSource
      ? 1
      : Math.max(.48, .76 - rank * .025);
    surfaceMaterial.uniforms.activeWeight.value = THREE.MathUtils.lerp(
      surfaceMaterial.uniforms.activeWeight.value,
      targetActiveWeight,
      ATLAS_FOCUS_LERP,
    );
    surfaceMaterial.uniforms.sheetDim.value = THREE.MathUtils.lerp(
      surfaceMaterial.uniforms.sheetDim.value,
      targetSheetDim,
      ATLAS_FOCUS_LERP,
    );
    outlineMaterial.userData.focusTarget.setHex(rank === 0 ? 0xffffff : palette.bake);
    outlineMaterial.color.lerp(outlineMaterial.userData.focusTarget, ATLAS_FOCUS_LERP);
  });
}

function updateAtlasStructuralLayers() {
  const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  atlasStructuralStepLocal.set(
    ATLAS_STACK_OFFSET.dot(cameraRight) / atlas.scale.x,
    ATLAS_STACK_OFFSET.dot(cameraUp) / atlas.scale.y,
    -.007,
  );
  atlasStructuralLayers.forEach((card) => {
    // Tuck the nearest card under the image so no white seam opens as the
    // projected stack direction changes during orbit.
    const depth = card.userData.depth - .32;
    card.position.copy(atlasStructuralStepLocal).multiplyScalar(depth);
  });

}

const groundViewDirection = new THREE.Vector3();

function updateGroundViewCue(deltaSeconds) {
  const abovePlane = THREE.MathUtils.smoothstep(camera.position.y - GROUND_Y, -.28, .28);
  camera.getWorldDirection(groundViewDirection);
  const incidence = Math.abs(groundViewDirection.y);
  const grazingVisibility = THREE.MathUtils.smoothstep(incidence, .025, .3);
  const targetOpacity = THREE.MathUtils.lerp(.085, .26, abovePlane)
    * THREE.MathUtils.lerp(.06, 1, grazingVisibility);
  groundGridMaterial.uniforms.opacity.value = THREE.MathUtils.damp(
    groundGridMaterial.uniforms.opacity.value,
    targetOpacity,
    7,
    deltaSeconds,
  );
}

function promoteAtlasSheet(sheet) {
  if (atlasLayerOrder[0] === sheet) return;
  const previousSheet = atlasLayerOrder[0];
  const previousMaterial = atlasLayers[previousSheet].children[0].material;
  atlasTransitionFromSheet = previousSheet;
  atlasTransitionFromOpacity = previousMaterial.uniforms.transitionOpacity.value;
  atlasLayerOrder = [sheet, ...atlasLayerOrder.filter((layerSheet) => layerSheet !== sheet)];
  atlasPermutationStart = reduceMotion ? 0 : performance.now();
  atlasLayers.forEach((layer) => {
    const rank = atlasLayerOrder.indexOf(layer.userData.sheet);
    const surfaceMaterial = layer.children[0].material;
    layer.position.set(0, 0, 0);
    surfaceMaterial.uniforms.transitionOpacity.value = layer.userData.sheet === previousSheet
      ? atlasTransitionFromOpacity
      : 0;
    if (reduceMotion && rank === 0) surfaceMaterial.uniforms.transitionOpacity.value = 1;
    layer.children.forEach((child) => {
      child.renderOrder = rank === 0 ? 32 : 20 - rank;
    });
  });
  syncAtlasSelectionOverlay();
}

function updateAtlasPermutation(now) {
  if (!atlasPermutationStart) return;
  const progress = THREE.MathUtils.clamp(
    (now - atlasPermutationStart) / ATLAS_PERMUTATION_DURATION_MS,
    0,
    1,
  );
  const eased = 1 - (1 - progress) ** 3;
  const activeLayer = atlasLayers[atlasLayerOrder[0]];
  const sourceLayer = atlasLayers[atlasTransitionFromSheet];
  const entryOffset = new THREE.Vector3(
    atlasStructuralStepLocal.x * 1.4,
    atlasStructuralStepLocal.y * 1.4,
    .012,
  );
  activeLayer.position.copy(entryOffset).multiplyScalar(1 - eased);
  activeLayer.children[0].material.uniforms.transitionOpacity.value = eased;
  if (sourceLayer && sourceLayer !== activeLayer) {
    sourceLayer.position.copy(entryOffset).multiplyScalar(-eased * .35);
    sourceLayer.children[0].material.uniforms.transitionOpacity.value = (
      atlasTransitionFromOpacity * (1 - eased)
    );
  }
  syncAtlasSelectionOverlay();
  if (progress >= 1) {
    atlasPermutationStart = 0;
    atlasLayers.forEach((layer) => {
      layer.position.set(0, 0, 0);
      const rank = atlasLayerOrder.indexOf(layer.userData.sheet);
      layer.children[0].material.uniforms.transitionOpacity.value = rank === 0 ? 1 : 0;
      layer.children.forEach((child) => {
        child.renderOrder = 20 - rank;
      });
    });
    atlasTransitionFromSheet = null;
    syncAtlasSelectionOverlay();
  }
}

// Runtime proxy: one selected view becomes a flat scene object.
const runtimeProxy = createImagePlane({
  width: .92,
  height: 1.2,
  color: palette.runtime,
  opacity: .1,
});
runtimeProxy.position.set(TRAJECTORY_CENTER.x, TRAJECTORY_CENTER.y + .08, TRAJECTORY_CENTER.z);
stageGroups.runtime.add(runtimeProxy);
const runtimeHitTarget = new THREE.Mesh(
  new THREE.PlaneGeometry(.92, 1.2),
  new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
    side: THREE.DoubleSide,
  }),
);
runtimeHitTarget.position.z = .055;
runtimeHitTarget.material.userData.interactionOnly = true;
runtimeProxy.add(runtimeHitTarget);
const runtimeInteractionOutlineMaterial = lineMaterial(palette.runtime, 0);
runtimeInteractionOutlineMaterial.userData.interactionOnly = true;
runtimeInteractionOutlineMaterial.depthWrite = false;
const runtimeInteractionOutline = new THREE.Group();
[-.012, -.006, .006, .012].forEach((offset) => {
  const halfWidth = .92 * .5 + offset;
  const halfHeight = 1.2 * .5 + offset;
  const line = lineFromPoints([
    new THREE.Vector3(-halfWidth, -halfHeight, .019),
    new THREE.Vector3(halfWidth, -halfHeight, .019),
    new THREE.Vector3(halfWidth, halfHeight, .019),
    new THREE.Vector3(-halfWidth, halfHeight, .019),
  ], runtimeInteractionOutlineMaterial, true);
  line.renderOrder = 29;
  runtimeInteractionOutline.add(line);
});
runtimeInteractionOutline.name = 'RuntimePlaneInteractionOutline';
runtimeProxy.add(runtimeInteractionOutline);
const runtimeColliderMaterial = new THREE.ShaderMaterial({
  uniforms: {
    maskMap: {value: sampleTexture},
    maskCenter: {value: new THREE.Vector2(.5, .5)},
    maskHalfSize: {value: new THREE.Vector2(.34, .44)},
    opacity: {value: 1},
    interactionOpacity: {value: 0},
  },
  transparent: true,
  depthTest: true,
  depthWrite: false,
  toneMapped: false,
  side: THREE.DoubleSide,
  vertexShader: `
    varying vec2 proxyUv;
    varying vec3 viewBasisX;
    varying vec3 viewBasisY;
    varying vec3 viewBasisZ;
    varying vec3 viewPosition;
    void main() {
      proxyUv = uv;
      viewBasisX = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
      viewBasisY = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
      viewBasisZ = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));
      viewPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * vec4(viewPosition, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D maskMap;
    uniform vec2 maskCenter;
    uniform vec2 maskHalfSize;
    uniform float opacity;
    uniform float interactionOpacity;
    varying vec2 proxyUv;
    varying vec3 viewBasisX;
    varying vec3 viewBasisY;
    varying vec3 viewBasisZ;
    varying vec3 viewPosition;
    void main() {
      float maskAlpha = texture2D(maskMap, proxyUv).a;
      if (maskAlpha < .008) discard;
      vec2 spherePoint = (proxyUv - maskCenter) / max(maskHalfSize, vec2(.001));
      float radialSquared = dot(spherePoint, spherePoint);
      float sphereZ = sqrt(max(0.0, 1.0 - min(radialSquared, 1.0)));
      vec3 viewNormal = normalize(
        viewBasisX * spherePoint.x
        + viewBasisY * spherePoint.y
        + viewBasisZ * sphereZ
      );
      float fresnel = pow(
        1.0 - abs(dot(viewNormal, normalize(-viewPosition))),
        1.85
      );
      float alpha = maskAlpha * (.008 + fresnel * .16) * opacity * interactionOpacity;
      gl_FragColor = vec4(.55, .66, 1.0, alpha);
    }
  `,
});
runtimeColliderMaterial.userData.baseOpacity = 1;
runtimeColliderMaterial.onBeforeRender = () => {
  runtimeColliderMaterial.uniforms.opacity.value = runtimeColliderMaterial.opacity;
};
const runtimeCollider = new THREE.Mesh(
  new THREE.PlaneGeometry(RUNTIME_IMAGE_SIZE, RUNTIME_IMAGE_SIZE),
  runtimeColliderMaterial,
);
runtimeCollider.name = 'MaskAlignedFresnelCollider';
runtimeCollider.position.z = .022;
runtimeCollider.renderOrder = 26;
runtimeCollider.visible = false;
runtimeProxy.add(runtimeCollider);

// Stereo output: two rasterizations of the runtime scene and the receiving glasses.
const observerCarrier = new THREE.Group();
observerCarrier.name = 'OrbitingStereoObserver';
stageGroups.stereo.add(observerCarrier);
const specsAnchor = new THREE.Group();
observerCarrier.add(specsAnchor);

// A local patch of the sampled viewing sphere appears only while the glasses
// are discoverable or active. The dots show discrete atlas addresses while
// the observer itself remains free to move continuously between them.
const observerOrbitHintGeometry = new THREE.BufferGeometry();
const observerOrbitHintMaterial = new THREE.PointsMaterial({
  size: .034,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  depthTest: false,
  vertexColors: true,
  toneMapped: false,
});
observerOrbitHintMaterial.userData.interactionOnly = true;
const observerOrbitHints = new THREE.Points(observerOrbitHintGeometry, observerOrbitHintMaterial);
observerOrbitHints.name = 'SpecsOrbitSampleHints';
observerOrbitHints.renderOrder = 54;
stageGroups.stereo.add(observerOrbitHints);

const glassesMaterial = new THREE.MeshToonMaterial({
  color: 0xeef3ff,
  transparent: true,
  opacity: 1,
  side: THREE.FrontSide,
  depthWrite: true,
});
glassesMaterial.userData.baseOpacity = 1;
const glassesOutlineMaterial = new THREE.ShaderMaterial({
  uniforms: {thickness: {value: .012}},
  transparent: true,
  opacity: 1,
  side: THREE.BackSide,
  depthWrite: false,
  vertexShader: `
    uniform float thickness;
    void main() {
      vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
      vec3 viewNormal = normalize(normalMatrix * normal);
      viewPosition.xyz += viewNormal * thickness;
      gl_Position = projectionMatrix * viewPosition;
    }
  `,
  fragmentShader: `
    void main() {
      gl_FragColor = vec4(0.18, 0.29, 0.52, 1.0);
    }
  `,
});
glassesOutlineMaterial.userData.baseOpacity = 1;
const glassesHitMeshes = [];

function normalizeDisplayModel(root) {
  root.updateMatrixWorld(true);
  const initialBox = new THREE.Box3().setFromObject(root);
  const initialSize = initialBox.getSize(new THREE.Vector3());
  root.scale.setScalar(MODEL_WIDTH / Math.max(initialSize.x, .0001));
  root.updateMatrixWorld(true);
  const center = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
  root.position.sub(center);
  root.updateMatrixWorld(true);
}

async function loadSpecs() {
  try {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    const glassesRoot = gltf.scene;
    const outlineRoot = glassesRoot.clone(true);
    glassesRoot.traverse((object) => {
      if (!object.isMesh) return;
      object.material = glassesMaterial;
      object.renderOrder = 52;
      glassesHitMeshes.push(object);
    });
    outlineRoot.traverse((object) => {
      if (!object.isMesh) return;
      object.material = glassesOutlineMaterial;
      object.renderOrder = 51;
    });
    const displayModel = new THREE.Group();
    displayModel.add(outlineRoot, glassesRoot);
    normalizeDisplayModel(displayModel);
    specsAnchor.add(displayModel);
    registerStageMaterials(displayModel, 'stereo');
  } catch (error) {
    console.error('Specs rendering-chain geometry failed to load.', error);
    errorPanel.hidden = false;
  } finally {
    loading.classList.add('done');
  }
}

Object.entries(stageGroups).forEach(([key, group]) => registerStageMaterials(group, key));

const stepCopy = {
  source: {
    value: 'Mesh + collider',
    note: 'One analytic harlequin body defines the rendered mesh and the matched runtime collider.',
  },
  bake: {
    value: 'Path tracing',
    note: 'Camera rays sample surface radiance into one atlas image for each viewpoint.',
  },
  runtime: {
    value: 'Atlas proxy',
    note: 'Lens Studio maps the selected atlas cell onto a billboard inside the matched collider.',
  },
  stereo: {
    value: 'Raster stereo',
    note: 'Two scene cameras rasterize the proxy into separate left-eye and right-eye images.',
  },
  full: {
    value: 'Full chain',
    note: 'Image data crosses rendering systems while its representation changes at each stage.',
  },
};

let activeStep = 'full';

function setStep(step) {
  if (!stepCopy[step]) return;
  activeStep = step;
  document.body.dataset.chainStep = step;
  stageValue.textContent = stepCopy[step].value;
  stageNote.textContent = stepCopy[step].note;
  document.querySelectorAll('[data-chain-step]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.chainStep === step));
  });
  scene.traverse((object) => {
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      const stageKey = material.userData.stageKey;
      if (!stageKey) return;
      material.userData.targetOpacity = material.userData.baseOpacity * (step === 'full' || step === stageKey ? 1 : .13);
    });
  });
}

document.querySelectorAll('[data-chain-step]').forEach((button) => {
  button.addEventListener('click', () => setStep(button.dataset.chainStep));
});

let observerAzimuth = -Math.PI / 6;
let observerElevationDegrees = ELEVATIONS_DEG[selectedPitchRow];
let observerAzimuthSnapTarget = null;
let observerElevationSnapTarget = null;
let colliderYaw = 0;
let cupolaAnimatedAzimuth = observerAzimuth;
let cupolaAnimatedElevationDegrees = observerElevationDegrees;

function updateCupolaAngleAnimation(deltaSeconds) {
  const azimuthOffset = Math.atan2(
    Math.sin(observerAzimuth - cupolaAnimatedAzimuth),
    Math.cos(observerAzimuth - cupolaAnimatedAzimuth),
  );
  const blend = reduceMotion ? 1 : 1 - Math.exp(-deltaSeconds * 9);
  cupolaAnimatedAzimuth += azimuthOffset * blend;
  cupolaAnimatedElevationDegrees = THREE.MathUtils.damp(
    cupolaAnimatedElevationDegrees,
    observerElevationDegrees,
    reduceMotion ? 1000 : 9,
    deltaSeconds,
  );
}

function updateOrientationCupola(worldAzimuth, displayAzimuthDegrees) {
  const animatedAzimuthDegrees = THREE.MathUtils.radToDeg(
    Math.atan2(Math.sin(cupolaAnimatedAzimuth), Math.cos(cupolaAnimatedAzimuth)),
  );
  const azimuthDegrees = displayAzimuthDegrees ?? animatedAzimuthDegrees;
  const elevationDegrees = cupolaAnimatedElevationDegrees;
  const theta = THREE.MathUtils.degToRad(animatedAzimuthDegrees);
  const phi = THREE.MathUtils.degToRad(elevationDegrees);
  const starPoint = new THREE.Vector3(
    Math.sin(theta) * Math.cos(phi) * CUPOLA_RADIUS,
    Math.sin(phi) * CUPOLA_RADIUS,
    Math.cos(theta) * Math.cos(phi) * CUPOLA_RADIUS,
  );
  const surfaceNormal = starPoint.clone().normalize();
  const projectedPoint = new THREE.Vector3(starPoint.x, 0, starPoint.z);
  const zeroReferencePoint = new THREE.Vector3(0, 0, projectedPoint.length());
  const projectedDirection = projectedPoint.clone().normalize();
  const projectionLiftDirection = new THREE.Vector3(0, Math.sign(phi || 1), 0);
  const cornerInset = projectedPoint.clone().addScaledVector(projectedDirection, -.07);
  const cornerLift = cornerInset.clone().addScaledVector(projectionLiftDirection, .07);
  const cornerTop = projectedPoint.clone().addScaledVector(projectionLiftDirection, .07);
  cupolaProjectionGuides.geometry.setFromPoints([
    new THREE.Vector3(), zeroReferencePoint,
    new THREE.Vector3(), projectedPoint,
    projectedPoint, starPoint,
    cornerInset, cornerLift,
    cornerLift, cornerTop,
  ]);
  cupolaProjectionGuides.computeLineDistances();
  cupolaProjectionFoot.position.copy(projectedPoint);

  const arrowRadius = CUPOLA_RADIUS + .065;
  const azimuthSteps = Math.max(12, Math.ceil(Math.abs(theta) / (Math.PI * 2) * 96));
  const azimuthPoints = Array.from({length: azimuthSteps + 1}, (_, index) => {
    const angle = theta * index / azimuthSteps;
    return new THREE.Vector3(
      Math.sin(angle) * arrowRadius,
      0,
      Math.cos(angle) * arrowRadius,
    );
  });
  const azimuthEnd = azimuthPoints.at(-1);
  const azimuthDirection = new THREE.Vector3(
    Math.cos(theta) * Math.sign(theta || 1),
    0,
    -Math.sin(theta) * Math.sign(theta || 1),
  ).normalize();

  const elevationSteps = Math.max(8, Math.ceil(Math.abs(phi) / Math.PI * 64));
  const elevationPoints = Array.from({length: elevationSteps + 1}, (_, index) => {
    const angle = phi * index / elevationSteps;
    const horizontalRadius = Math.cos(angle) * arrowRadius;
    return new THREE.Vector3(
      Math.sin(theta) * horizontalRadius,
      Math.sin(angle) * arrowRadius,
      Math.cos(theta) * horizontalRadius,
    );
  });
  const elevationEnd = elevationPoints.at(-1);
  const elevationDirection = new THREE.Vector3(
    -Math.sin(theta) * Math.sin(phi) * Math.sign(phi || 1),
    Math.cos(phi) * Math.sign(phi || 1),
    -Math.cos(theta) * Math.sin(phi) * Math.sign(phi || 1),
  ).normalize();

  cupolaStar.position.copy(starPoint).addScaledVector(surfaceNormal, .015);
  const azimuthPresence = THREE.MathUtils.smoothstep(Math.abs(theta), .004, .075);
  setCupolaArrowPresence(cupolaAzimuthArrow, cupolaAzimuthLabel, azimuthPresence);
  if (azimuthPresence > .002) {
    setCupolaArrowPath(
      cupolaAzimuthArrow,
      azimuthPoints,
      azimuthEnd,
      azimuthDirection,
      `az-${theta.toFixed(5)}`,
    );
    cupolaAzimuthLabel.position.copy(azimuthPoints[Math.floor(azimuthPoints.length * .55)]);
    cupolaAzimuthLabel.position.y -= .075;
  }

  const elevationPresence = THREE.MathUtils.smoothstep(Math.abs(phi), .004, .075);
  setCupolaArrowPresence(cupolaElevationArrow, cupolaElevationLabel, elevationPresence);
  if (elevationPresence > .002) {
    setCupolaArrowPath(
      cupolaElevationArrow,
      elevationPoints,
      elevationEnd,
      elevationDirection,
      `el-${theta.toFixed(5)}-${phi.toFixed(5)}`,
    );
    cupolaElevationLabel.position.copy(elevationPoints[Math.floor(elevationPoints.length * .58)]);
    cupolaElevationLabel.position.addScaledVector(cupolaElevationLabel.position.clone().normalize(), .075);
  }
}

function setSliderFillProgress(slider, progress) {
  const thumbWidth = Number.parseFloat(getComputedStyle(slider).getPropertyValue('--thumb-width')) || 18;
  const trackWidth = Math.max(1, slider.getBoundingClientRect().width);
  const clampedProgress = THREE.MathUtils.clamp(progress, 0, 1);
  // Native range thumbs travel inside the track by half their width. Match
  // the fill endpoint to that true center position rather than the raw track
  // percentage, so the colored interior terminates beneath the thumb.
  const fillPosition = thumbWidth * .5 + (trackWidth - thumbWidth) * clampedProgress;
  const fillPercent = fillPosition / trackWidth * 100;
  slider.style.setProperty('--fill-progress', `${fillPercent}%`);
}

function updateObserver() {
  const elevationRadians = THREE.MathUtils.degToRad(observerElevationDegrees);
  const horizontalRadius = TRAJECTORY_RADIUS * Math.cos(elevationRadians);
  observerCarrier.position.set(
    TRAJECTORY_CENTER.x + Math.sin(observerAzimuth) * horizontalRadius,
    TRAJECTORY_CENTER.y + .03 + Math.sin(elevationRadians) * 1.45,
    Math.cos(observerAzimuth) * horizontalRadius,
  );
  observerCarrier.lookAt(new THREE.Vector3(
    TRAJECTORY_CENTER.x,
    TRAJECTORY_CENTER.y + .08,
    TRAJECTORY_CENTER.z,
  ));
  runtimeProxy.lookAt(observerCarrier.position);
  observerCarrier.updateMatrixWorld(true);
  runtimeProxy.updateMatrixWorld(true);

  const relativeAzimuth = observerAzimuth + Math.PI / 2 - colliderYaw;
  const wrapped = ((relativeAzimuth % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const nextYaw = Math.round(wrapped / (Math.PI * 2) * YAW_VIEWS) % YAW_VIEWS;
  if (nextYaw !== selectedYaw) {
    selectedYaw = nextYaw;
    refreshAtlasSample();
  }
  updatePathCameraPose();
  const degrees = THREE.MathUtils.radToDeg(Math.atan2(Math.sin(relativeAzimuth), Math.cos(relativeAzimuth)));
  observerAzimuthValue.textContent = `${degrees >= 0 ? '+' : ''}${degrees.toFixed(1)}°`;
  azimuthSlider.value = String(Math.round(degrees));
  azimuthSliderValue.textContent = `${degrees >= 0 ? '+' : ''}${degrees.toFixed(1)}°`;
  azimuthSlider.setAttribute('aria-valuetext', `${degrees.toFixed(1)} degrees`);
  setSliderFillProgress(azimuthSlider, (degrees + 180) / 360);
  elevationSlider.value = String(selectedPitchRow);
  elevationSliderValue.textContent = `${ELEVATIONS_DEG[selectedPitchRow] >= 0 ? '+' : ''}${ELEVATIONS_DEG[selectedPitchRow]}°`;
  elevationSlider.setAttribute('aria-valuetext', `${ELEVATIONS_DEG[selectedPitchRow]} degrees`);
  setSliderFillProgress(elevationSlider, selectedPitchRow / (PITCH_VIEWS - 1));
  // Geometry follows the physical observer bearing. The displayed number
  // remains the atlas's object-relative address convention.
  updateOrientationCupola(observerAzimuth, degrees);
}

function updatePathCameraPose() {
  const yawRadians = selectedYaw / YAW_VIEWS * Math.PI * 2;
  const elevationRadians = THREE.MathUtils.degToRad(ELEVATIONS_DEG[selectedPitchRow]);
  const position = new THREE.Vector3(
    -Math.cos(yawRadians) * Math.cos(elevationRadians),
    Math.sin(elevationRadians),
    Math.sin(yawRadians) * Math.cos(elevationRadians),
  ).multiplyScalar(CAPTURE_ORBIT_RADIUS).add(sourceOpal.position);
  const forward = sourceOpal.position.clone().sub(position).normalize();
  const up = new THREE.Vector3(0, 1, 0).projectOnPlane(forward).normalize();
  const right = forward.clone().cross(up).normalize();

  pathCamera.position.copy(position);
  pathCamera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(forward, up, right));
}

function setSourceProxyView(slot, yaw, pitch) {
  const sheet = Math.floor(yaw / SHEET_COLUMNS);
  const column = yaw % SHEET_COLUMNS;
  const frame = pitch * YAW_VIEWS + yaw;
  sourceAtlasProxyMaterial.uniforms[`color${slot}`].value = atlasTextures[sheet];
  sourceAtlasProxyMaterial.uniforms[`colorCell${slot}`].value.set(column, pitch);
  sourceAtlasProxyMaterial.uniforms[`maskCell${slot}`].value.set(frame % 28, Math.floor(frame / 28));
}

function updateSourceAtlasProxy() {
  sourceAtlasProxy.quaternion.copy(camera.quaternion);
  const proxyPosition = sourceAtlasProxy.getWorldPosition(new THREE.Vector3());
  const viewDirection = camera.position.clone().sub(proxyPosition).normalize();
  const continuousYaw = (
    (Math.atan2(viewDirection.z, -viewDirection.x) / (Math.PI * 2) * YAW_VIEWS) % YAW_VIEWS
    + YAW_VIEWS
  ) % YAW_VIEWS;
  const yaw0 = Math.floor(continuousYaw) % YAW_VIEWS;
  const yaw1 = (yaw0 + 1) % YAW_VIEWS;
  const elevation = THREE.MathUtils.clamp(
    THREE.MathUtils.radToDeg(Math.asin(viewDirection.y)),
    ELEVATIONS_DEG[0],
    ELEVATIONS_DEG[ELEVATIONS_DEG.length - 1],
  );
  const continuousPitch = (elevation - ELEVATIONS_DEG[0]) / 20;
  const pitch0 = Math.floor(continuousPitch);
  const pitch1 = Math.min(pitch0 + 1, PITCH_VIEWS - 1);

  setSourceProxyView('00', yaw0, pitch0);
  setSourceProxyView('10', yaw1, pitch0);
  setSourceProxyView('01', yaw0, pitch1);
  setSourceProxyView('11', yaw1, pitch1);
  sourceAtlasProxyMaterial.uniforms.angleBlend.value.set(
    continuousYaw - Math.floor(continuousYaw),
    continuousPitch - pitch0,
  );
}

function setElevationRow(row, syncObserver = true) {
  const nextRow = THREE.MathUtils.clamp(Math.round(row), 0, PITCH_VIEWS - 1);
  if (syncObserver) {
    observerElevationDegrees = ELEVATIONS_DEG[nextRow];
    observerElevationSnapTarget = null;
  }
  if (nextRow === selectedPitchRow) {
    updateObserver();
    return;
  }
  selectedPitchRow = nextRow;
  document.querySelectorAll('[data-elevation-row]').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.elevationRow) === selectedPitchRow));
  });
  refreshAtlasSample();
  updateObserver();
}

document.querySelectorAll('[data-elevation-row]').forEach((button) => {
  button.addEventListener('click', () => setElevationRow(Number(button.dataset.elevationRow)));
});

azimuthSlider.addEventListener('input', () => {
  const azimuth = THREE.MathUtils.degToRad(Number(azimuthSlider.value));
  observerAzimuth = azimuth + colliderYaw - Math.PI / 2;
  updateObserver();
});
elevationSlider.addEventListener('input', () => setElevationRow(Number(elevationSlider.value)));

const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let hoveredInteractive = null;
let selectedInteractive = null;
let pressedInteractive = null;
let draggingCollider = false;
let draggingGlasses = false;
let draggingCupola = false;
let colliderDragStartX = 0;
let colliderDragStartYaw = 0;
let cupolaDragStartX = 0;
let cupolaDragStartY = 0;
let cupolaDragStartAzimuth = 0;
let cupolaDragStartPitch = 0;
let glassesDragStartX = 0;
let glassesDragStartY = 0;
let glassesDragStartAzimuth = 0;
let glassesDragStartPitch = 0;
let glassesDragStartElevationDegrees = 0;
let glassesDragAzimuthDirection = 1;
let glassesDragPitchDirection = -1;

function setPointerFromEvent(event) {
  const bounds = canvas.getBoundingClientRect();
  pointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
}

function pickInteractive(event) {
  setPointerFromEvent(event);
  const candidates = [];
  const runtimeHit = raycaster.intersectObject(runtimeHitTarget, false)[0];
  if (runtimeHit) candidates.push({id: 'runtime', distance: runtimeHit.distance});
  const glassesHit = raycaster.intersectObjects(glassesHitMeshes, false)[0];
  if (glassesHit) candidates.push({id: 'glasses', distance: glassesHit.distance});
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.id ?? null;
}

function selectInteractive(id) {
  selectedInteractive = id;
}

function updateInteractiveAppearance(deltaSeconds) {
  const glassesState = selectedInteractive === 'glasses'
    ? 'selected'
    : hoveredInteractive === 'glasses' ? 'hover' : 'idle';
  glassesOutlineMaterial.uniforms.thickness.value = THREE.MathUtils.damp(
    glassesOutlineMaterial.uniforms.thickness.value,
    glassesState === 'selected' ? .019 : glassesState === 'hover' ? .015 : .012,
    4.2,
    deltaSeconds,
  );
  const runtimeIsPressed = pressedInteractive === 'runtime' || draggingCollider;
  const runtimeIsHovered = hoveredInteractive === 'runtime';
  const runtimeIsSelected = selectedInteractive === 'runtime';
  const outlineTarget = runtimeIsPressed ? .92 : runtimeIsSelected ? .72 : runtimeIsHovered ? .52 : 0;
  runtimeInteractionOutlineMaterial.opacity = THREE.MathUtils.damp(
    runtimeInteractionOutlineMaterial.opacity,
    outlineTarget,
    5.6,
    deltaSeconds,
  );
  runtimeInteractionOutline.visible = runtimeInteractionOutlineMaterial.opacity > .004;
  runtimeColliderMaterial.uniforms.interactionOpacity.value = 0;
  runtimeCollider.visible = false;
  runtimeProxy.scale.setScalar(1);
}

function observerPositionAt(azimuth, pitchRow) {
  return observerPositionAtElevation(azimuth, ELEVATIONS_DEG[pitchRow]);
}

function observerPositionAtElevation(azimuth, elevationDegrees) {
  const elevation = THREE.MathUtils.degToRad(elevationDegrees);
  const horizontalRadius = TRAJECTORY_RADIUS * Math.cos(elevation);
  return new THREE.Vector3(
    TRAJECTORY_CENTER.x + Math.sin(azimuth) * horizontalRadius,
    TRAJECTORY_CENTER.y + .03 + Math.sin(elevation) * 1.45,
    Math.cos(azimuth) * horizontalRadius,
  );
}

function nearestObserverAzimuthSample(azimuth) {
  const sampleAngle = Math.PI * 2 / YAW_VIEWS;
  const relative = azimuth + Math.PI / 2 - colliderYaw;
  const snappedRelative = Math.round(relative / sampleAngle) * sampleAngle;
  const rawTarget = snappedRelative - Math.PI / 2 + colliderYaw;
  const shortestOffset = Math.atan2(
    Math.sin(rawTarget - azimuth),
    Math.cos(rawTarget - azimuth),
  );
  return azimuth + shortestOffset;
}

function updateObserverSnap(deltaSeconds) {
  if (draggingGlasses) return;
  if (observerAzimuthSnapTarget != null) {
    const offset = Math.atan2(
      Math.sin(observerAzimuthSnapTarget - observerAzimuth),
      Math.cos(observerAzimuthSnapTarget - observerAzimuth),
    );
    observerAzimuth += offset * (reduceMotion ? 1 : 1 - Math.exp(-deltaSeconds * 10));
    if (Math.abs(offset) < .0002) {
      observerAzimuth = observerAzimuthSnapTarget;
      observerAzimuthSnapTarget = null;
    }
  }
  if (observerElevationSnapTarget != null) {
    observerElevationDegrees = THREE.MathUtils.damp(
      observerElevationDegrees,
      observerElevationSnapTarget,
      reduceMotion ? 1000 : 10,
      deltaSeconds,
    );
    if (Math.abs(observerElevationSnapTarget - observerElevationDegrees) < .01) {
      observerElevationDegrees = observerElevationSnapTarget;
      observerElevationSnapTarget = null;
    }
  }
}

function updateObserverOrbitHints(deltaSeconds) {
  const hintIsActive = selectedInteractive === 'glasses'
    || hoveredInteractive === 'glasses'
    || draggingGlasses;
  observerOrbitHintMaterial.opacity = THREE.MathUtils.damp(
    observerOrbitHintMaterial.opacity,
    hintIsActive ? .78 : 0,
    reduceMotion ? 1000 : 7,
    deltaSeconds,
  );
  observerOrbitHints.visible = observerOrbitHintMaterial.opacity > .003;
  if (!observerOrbitHints.visible && !hintIsActive) return;

  const sampleAngle = Math.PI * 2 / YAW_VIEWS;
  const centerAzimuth = nearestObserverAzimuthSample(observerAzimuth);
  const positions = [];
  const colors = [];
  for (let pitchOffset = -1; pitchOffset <= 1; pitchOffset += 1) {
    const pitchRow = selectedPitchRow + pitchOffset;
    if (pitchRow < 0 || pitchRow >= PITCH_VIEWS) continue;
    for (let yawOffset = -5; yawOffset <= 5; yawOffset += 1) {
      const position = observerPositionAt(centerAzimuth + yawOffset * sampleAngle, pitchRow);
      positions.push(position.x, position.y, position.z);
      const isCenter = pitchOffset === 0 && yawOffset === 0;
      const color = new THREE.Color(isCenter ? 0x3f61bd : 0x7893dc);
      colors.push(color.r, color.g, color.b);
    }
  }
  observerOrbitHintGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  observerOrbitHintGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || document.body.dataset.layerMode === 'draw') return;
  setPointerFromEvent(event);
  if (raycaster.intersectObject(orientationCupolaHitTarget, false).length) {
    draggingCupola = true;
    cupolaDragStartX = event.clientX;
    cupolaDragStartY = event.clientY;
    cupolaDragStartAzimuth = observerAzimuth;
    cupolaDragStartPitch = selectedPitchRow;
    canvas.classList.add('dragging-cupola');
    canvas.setPointerCapture(event.pointerId);
    controls.enabled = false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  const interactive = pickInteractive(event);
  if (interactive) hoveredInteractive = interactive;
  if (interactive === 'runtime') {
    selectInteractive('runtime');
    pressedInteractive = 'runtime';
    draggingCollider = true;
    colliderDragStartX = event.clientX;
    colliderDragStartYaw = colliderYaw;
    canvas.classList.add('rotating-collider');
    canvas.setPointerCapture(event.pointerId);
    controls.enabled = false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (interactive === 'glasses') {
    selectInteractive('glasses');
    pressedInteractive = 'glasses';
    draggingGlasses = true;
    glassesDragStartX = event.clientX;
    glassesDragStartY = event.clientY;
    glassesDragStartAzimuth = observerAzimuth;
    glassesDragStartPitch = selectedPitchRow;
    glassesDragStartElevationDegrees = observerElevationDegrees;
    observerAzimuthSnapTarget = null;
    observerElevationSnapTarget = null;

    // Match pointer motion to the projected orbit tangent, even after the
    // global diagram camera has been orbited to the opposite side.
    const projectedStart = observerPositionAt(observerAzimuth, selectedPitchRow).project(camera);
    const projectedTangent = observerPositionAt(observerAzimuth + .03, selectedPitchRow).project(camera);
    glassesDragAzimuthDirection = Math.sign(projectedTangent.x - projectedStart.x) || 1;
    const pitchSample = selectedPitchRow < PITCH_VIEWS - 1
      ? selectedPitchRow + 1
      : selectedPitchRow - 1;
    const projectedPitch = observerPositionAt(observerAzimuth, pitchSample).project(camera);
    const pitchScreenDelta = -projectedPitch.y - (-projectedStart.y);
    glassesDragPitchDirection = (
      Math.sign(pitchScreenDelta) * Math.sign(pitchSample - selectedPitchRow)
    ) || -1;

    canvas.classList.add('dragging-glasses');
    canvas.setPointerCapture(event.pointerId);
    controls.enabled = false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  selectInteractive(null);
}, {capture: true});
canvas.addEventListener('pointermove', (event) => {
  if (draggingGlasses) {
    observerAzimuth = glassesDragStartAzimuth
      + (event.clientX - glassesDragStartX) * .007 * glassesDragAzimuthDirection;
    observerElevationDegrees = THREE.MathUtils.clamp(
      glassesDragStartElevationDegrees
        + (event.clientY - glassesDragStartY) * .38 * glassesDragPitchDirection,
      ELEVATIONS_DEG[0],
      ELEVATIONS_DEG[PITCH_VIEWS - 1],
    );
    const nextPitch = Math.round((observerElevationDegrees - ELEVATIONS_DEG[0]) / 20);
    if (nextPitch !== selectedPitchRow) setElevationRow(nextPitch, false);
    else updateObserver();
    return;
  }
  if (draggingCupola) {
    observerAzimuth = cupolaDragStartAzimuth + (event.clientX - cupolaDragStartX) * .012;
    const nextPitch = cupolaDragStartPitch - Math.round((event.clientY - cupolaDragStartY) / 13);
    setElevationRow(nextPitch);
    updateObserver();
    return;
  }
  if (draggingCollider) {
    colliderYaw = colliderDragStartYaw + (event.clientX - colliderDragStartX) * .006;
    updateObserver();
    return;
  }
  if (pressedInteractive) return;
  const nextHovered = event.buttons === 0 ? pickInteractive(event) : null;
  if (
    selectedInteractive === 'runtime'
    && hoveredInteractive === 'runtime'
    && nextHovered !== 'runtime'
  ) {
    selectInteractive(null);
  }
  hoveredInteractive = nextHovered;
  canvas.classList.toggle('hovering-interactive', hoveredInteractive != null);
});
function stopObserverDrag(event) {
  const shouldSettleGlasses = draggingGlasses;
  draggingCollider = false;
  draggingGlasses = false;
  draggingCupola = false;
  canvas.classList.remove('rotating-collider');
  canvas.classList.remove('dragging-glasses');
  canvas.classList.remove('dragging-cupola');
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  pressedInteractive = null;
  controls.enabled = document.body.dataset.layerMode !== 'draw';
  if (shouldSettleGlasses) {
    const nearestPitch = THREE.MathUtils.clamp(
      Math.round((observerElevationDegrees - ELEVATIONS_DEG[0]) / 20),
      0,
      PITCH_VIEWS - 1,
    );
    setElevationRow(nearestPitch, false);
    observerAzimuthSnapTarget = nearestObserverAzimuthSample(observerAzimuth);
    observerElevationSnapTarget = ELEVATIONS_DEG[nearestPitch];
  }
}
canvas.addEventListener('pointerup', stopObserverDrag);
canvas.addEventListener('pointercancel', stopObserverDrag);
canvas.addEventListener('pointerleave', () => {
  if (draggingCollider || draggingGlasses || draggingCupola || pressedInteractive) return;
  if (selectedInteractive === 'runtime') selectInteractive(null);
  hoveredInteractive = null;
  canvas.classList.remove('hovering-interactive');
});

window.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    setElevationRow(selectedPitchRow + (event.key === 'ArrowUp' ? 1 : -1));
    return;
  }
  observerAzimuth += THREE.MathUtils.degToRad(event.key === 'ArrowLeft' ? -3.333333 : 3.333333);
  updateObserver();
});

window.addEventListener('opals:layer-mode', (event) => {
  controls.enabled = event.detail.mode !== 'draw';
  if (event.detail.mode === 'draw') {
    draggingCollider = false;
    draggingGlasses = false;
    draggingCupola = false;
    canvas.classList.remove('rotating-collider');
    canvas.classList.remove('dragging-glasses');
    canvas.classList.remove('dragging-cupola');
  }
});

window.getOpalsDiagramSceneState = () => ({
  schema: 'opals-render-chain-scene/v1',
  projection: 'orthographic',
  step: activeStep,
  specimen: 'harlequin-standard',
  atlas: {
    yawViews: YAW_VIEWS,
    pitchViews: PITCH_VIEWS,
    yaw: selectedYaw,
    pitch: selectedPitchRow,
    sheet: Math.floor(selectedYaw / SHEET_COLUMNS),
    cell: selectedYaw % SHEET_COLUMNS,
  },
  observerAzimuthRadians: observerAzimuth,
  observerElevationDegrees: ELEVATIONS_DEG[selectedPitchRow],
  colliderYawRadians: colliderYaw,
  coordinateSystem: {
    upAxis: '+Y',
    cameraFacingAxis: '+Z',
    cupolaPosition: orientationCupola.position.toArray(),
  },
  stages: ['offline-volume', 'path-traced-bake', 'runtime-proxy', 'stereo-output'],
  camera: {
    position: camera.position.toArray(),
    target: controls.target.toArray(),
    zoom: camera.zoom,
  },
});

window.captureOpalsDiagramScene = () => {
  controls.update();
  atlas.quaternion.copy(camera.quaternion);
  updateAtlasStructuralLayers();
  renderer.render(scene, camera);
  return {
    dataUrl: canvas.toDataURL('image/png'),
    pixelWidth: canvas.width,
    pixelHeight: canvas.height,
  };
};

const labels = [
  ['#label-specs', specsAnchor, new THREE.Vector3(-.35, .65, 0), 'stereo'],
  ['#label-runtime-proxy', runtimeProxy, new THREE.Vector3(0, .72, 0), 'runtime'],
  ['#label-atlas', atlas, new THREE.Vector3(0, .52, 0), 'bake'],
  ['#label-path-camera', pathCamera, new THREE.Vector3(0, -.25, 0), 'bake'],
  ['#label-image-plane', sampledPlane, new THREE.Vector3(0, .73, 0), 'bake'],
  ['#label-source-opal', sourceAtlasProxy, new THREE.Vector3(.18, .78, 0), 'source'],
  ['#label-light', light, new THREE.Vector3(.05, .25, 0), 'source'],
].map(([selector, object, offset, step]) => ({
  element: document.querySelector(selector), object, offset, step,
}));

function setLabelsVisible(visible) {
  document.body.classList.toggle('labels-visible', visible);
  labelsToggle.setAttribute('aria-pressed', String(visible));
  labelsToggleState.textContent = visible ? 'On' : 'Off';
}

labelsToggle.addEventListener('click', () => {
  setLabelsVisible(!document.body.classList.contains('labels-visible'));
});

setLabelsVisible(false);

function updateLabels() {
  const bounds = stage.getBoundingClientRect();
  engineFloorLabels.forEach(({element, position}) => {
    const projected = position.clone().project(camera);
    const visible = projected.z >= -1 && projected.z <= 1;
    element.classList.toggle('visible', visible);
    if (!visible) return;
    element.style.left = `${(projected.x * .5 + .5) * bounds.width}px`;
    element.style.top = `${(-projected.y * .5 + .5) * bounds.height}px`;
  });

  labels.forEach(({element, object, offset, step}) => {
    object.updateMatrixWorld(true);
    const worldPosition = object.localToWorld(offset.clone());
    const projected = worldPosition.project(camera);
    const visible = projected.z >= -1 && projected.z <= 1;
    if (!visible) {
      element.classList.remove('visible');
      return;
    }
    element.style.left = `${(projected.x * .5 + .5) * bounds.width}px`;
    element.style.top = `${(-projected.y * .5 + .5) * bounds.height}px`;
    element.style.opacity = activeStep === 'full' || activeStep === step ? '1' : '.28';
    element.classList.add('visible');
  });

  // Project the globe's screen-facing poles so the WebGL globe, its backing
  // plate, and the HTML sliders behave as one responsive instrument.
  const cupolaCenter = orientationCupola.getWorldPosition(new THREE.Vector3());
  const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const cupolaTopEdge = cupolaCenter.clone().addScaledVector(cameraUp, CUPOLA_RADIUS * 1.08);
  const cupolaBottomEdge = cupolaCenter.clone().addScaledVector(cameraUp, -CUPOLA_RADIUS * 1.08);
  const projectedCenter = cupolaCenter.project(camera);
  const projectedTopEdge = cupolaTopEdge.project(camera);
  const projectedBottomEdge = cupolaBottomEdge.project(camera);
  const centerX = (projectedCenter.x * .5 + .5) * bounds.width;
  const globeTop = (-projectedTopEdge.y * .5 + .5) * bounds.height;
  const globeBottom = (-projectedBottomEdge.y * .5 + .5) * bounds.height;
  const controlsTop = globeBottom + 10;
  const isCompactViewport = matchMedia('(max-width: 650px)').matches;
  if (isCompactViewport) {
    // Mobile owns the controls as a compact, bottom-anchored HTML overlay.
    // Leaving the desktop-projected `top` inline would stretch its grid
    // between top and bottom and pull the two sliders apart.
    viewControls.style.removeProperty('left');
    viewControls.style.removeProperty('top');
    if (orientationPanelBackdrop) {
      orientationPanelBackdrop.style.removeProperty('left');
      orientationPanelBackdrop.style.removeProperty('top');
      orientationPanelBackdrop.style.removeProperty('height');
    }
    return;
  }
  viewControls.style.left = `${centerX}px`;
  viewControls.style.top = `${controlsTop}px`;
  if (orientationPanelBackdrop) {
    orientationPanelBackdrop.style.left = `${centerX}px`;
    orientationPanelBackdrop.style.top = `${globeTop - 12}px`;
    orientationPanelBackdrop.style.height = `${controlsTop + viewControls.offsetHeight + 12 - globeTop}px`;
  }
}

function resize() {
  const {width, height} = stage.getBoundingClientRect();
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const aspect = safeWidth / safeHeight;
  // Portrait layouts expand the frame for horizontal context, then cap it so
  // the scene retains a useful on-screen scale.
  const baseViewHeight = 8.2;
  const baseViewWidth = baseViewHeight * 16 / 9;
  const viewHeight = Math.min(
    Math.max(baseViewHeight, baseViewWidth / aspect),
    17,
  );
  camera.left = -viewHeight * aspect * .5;
  camera.right = viewHeight * aspect * .5;
  camera.top = viewHeight * .5;
  camera.bottom = -viewHeight * .5;
  camera.updateProjectionMatrix();
  renderer.setSize(safeWidth, safeHeight, false);
}

function renderPathCameraFeed() {
  pathCaptureCamera.position.copy(pathCamera.position);
  pathCaptureCamera.lookAt(sourceOpal.position);
  const hiddenObjects = [staticConstruction, stageGroups.bake, stageGroups.runtime, stageGroups.stereo, sourceAtlasProxy];
  const previousVisibility = hiddenObjects.map((object) => object.visible);
  hiddenObjects.forEach((object) => { object.visible = false; });
  const previousSourceVisibility = sourceOpal.visible;
  sourceOpal.visible = true;
  const previousTarget = renderer.getRenderTarget();
  const previousColor = renderer.getClearColor(new THREE.Color());
  const previousAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(pathCameraRenderTarget);
  renderer.setClearColor(0xf7f8fc, 1);
  renderer.clear();
  renderer.render(scene, pathCaptureCamera);
  renderer.setRenderTarget(previousTarget);
  renderer.setClearColor(previousColor, previousAlpha);
  hiddenObjects.forEach((object, index) => { object.visible = previousVisibility[index]; });
  sourceOpal.visible = previousSourceVisibility;
}

new ResizeObserver(resize).observe(stage);
resize();
setStep('full');
updateObserver();
refreshAtlasSample();
loadSpecs();
loadPathCamera();

const pageParams = new URLSearchParams(location.search);

if (pageParams.get('clean') === '1') {
  document.body.classList.add('clean-mode');
  requestAnimationFrame(resize);
}

if (pageParams.get('embed') === '1') {
  document.body.classList.add('embed-mode');
  requestAnimationFrame(resize);
}

let previousRenderTime = performance.now();

function render(now) {
  const deltaSeconds = Math.min(Math.max((now - previousRenderTime) / 1000, 0), .05);
  previousRenderTime = now;
  controls.update();
  updateCupolaAngleAnimation(deltaSeconds);
  updateGroundViewCue(deltaSeconds);
  // The atlas and its structural cards remain screen-facing while their
  // spacing is derived from a fixed world-space separation vector.
  atlas.quaternion.copy(camera.quaternion);
  updateAtlasStructuralLayers();
  updateSourceAtlasProxy();
  updateAtlasPermutation(now);
  updateAtlasFocus();
  updateAtlasAddressBadgeMotion();
  updateInteractiveAppearance(deltaSeconds);
  renderPathCameraFeed();
  scene.traverse((object) => {
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (material.userData.targetOpacity == null) return;
      material.opacity = THREE.MathUtils.lerp(
        material.opacity,
        material.userData.targetOpacity,
        .14,
      );
      material.visible = material.opacity > .003;
    });
  });
  updateObserverSnap(deltaSeconds);
  updateObserver();
  updateObserverOrbitHints(deltaSeconds);
  updateLabels();
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

requestAnimationFrame(render);
