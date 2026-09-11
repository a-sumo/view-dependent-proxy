import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const CAMERA_MODEL_URL = new URL('../assets/models/camera 3d model.glb', import.meta.url).href;

export async function createDiagramCamera({height = .55, screenTexture, toonOutlined = false} = {}) {
  const gltf = await new GLTFLoader().loadAsync(CAMERA_MODEL_URL);
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = height / Math.max(size.y, .0001);

  model.scale.setScalar(scale);
  model.position.copy(center).multiplyScalar(-scale);
  let outlineModel = null;
  let cameraFillMaterial = null;
  if (toonOutlined) {
    outlineModel = model.clone(true);
    cameraFillMaterial = new THREE.MeshToonMaterial({
      color: 0xeef3ff,
      transparent: true,
      opacity: 1,
      side: THREE.FrontSide,
    });
    const cameraOutlineMaterial = new THREE.ShaderMaterial({
      uniforms: {thickness: {value: .008}},
      transparent: true,
      opacity: 1,
      side: THREE.BackSide,
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
    cameraFillMaterial.userData.baseOpacity = 1;
    cameraOutlineMaterial.userData.baseOpacity = 1;
    outlineModel.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = false;
      object.renderOrder = 59;
      object.material = cameraOutlineMaterial;
    });
  }
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.renderOrder = 60;
    if (cameraFillMaterial) {
      object.material = cameraFillMaterial;
      return;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      material.transparent = true;
      material.depthWrite = true;
      material.userData.baseOpacity = material.opacity ?? 1;
    });
  });

  if (!screenTexture) throw new Error('A WebGL render-target texture is required.');
  screenTexture.colorSpace = THREE.SRGBColorSpace;
  screenTexture.minFilter = THREE.NearestFilter;
  screenTexture.magFilter = THREE.NearestFilter;
  screenTexture.generateMipmaps = false;

  const assembly = new THREE.Group();
  assembly.name = 'DiagramCameraGLB';
  // Native +Z is the lens direction. Rotate it onto scene +X.
  assembly.rotation.y = Math.PI / 2;
  if (outlineModel) assembly.add(outlineModel);
  assembly.add(model);

  const screenWidth = size.x * scale * .58;
  const screenHeight = screenWidth * 9 / 16;
  const rearZ = (bounds.min.z - center.z) * scale;
  const screenY = (.29 - center.y) * scale;
  const bezel = new THREE.Mesh(
    new THREE.PlaneGeometry(screenWidth * 1.08, screenHeight * 1.13),
    new THREE.MeshBasicMaterial({
      color: 0x0d1b3d,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    }),
  );
  bezel.position.set(0, screenY, rearZ - .0025);
  bezel.renderOrder = 61;
  assembly.add(bezel);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(screenWidth, screenHeight),
    new THREE.MeshBasicMaterial({
      map: screenTexture,
      toneMapped: false,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    }),
  );
  screen.position.set(0, screenY, rearZ - .004);
  screen.renderOrder = 62;
  assembly.add(screen);

  return {group: assembly, screen};
}
