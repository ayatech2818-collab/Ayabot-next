import * as THREE from 'three';

/*
 * The eyes are two glowing ovals painted into the visor's texture (Head_Eyes_0), so they
 * can't be scaled as objects. Instead the visor shader squashes the texture vertically
 * around each eye's centre line: at openness 1 nothing changes, near 0 each eye collapses
 * into a thin glowing line, like a lid closing.
 *
 * Sampling uses the original UV gradients (textureGrad) so the squash doesn't push the GPU
 * onto tiny blurred mip levels, and the squash fades out smoothly around each eye; both
 * guard against glowing bars or box lines appearing on the visor mid-blink.
 *
 * Measured from the 1024px texture (glTF UVs, v grows downwards): eye centres at
 * u = 0.285 / 0.715, v = 0.481; each oval is about 0.19 wide and 0.23 tall.
 */

const blinkChunk = /* glsl */ `
  uniform float uEyeOpen;

  vec2 ayaBlinkUv( vec2 uv ) {
    float dy = uv.y - 0.481;
    // How strongly this texel belongs to an eye: 1 over the ovals, fading smoothly to 0 in the
    // black margin around them. A hard on/off region leaves seams that some GPUs light up as
    // thin neon box lines, so the squash must blend back to the untouched texture.
    float column = abs( abs( uv.x - 0.5 ) - 0.215 );
    float weight = ( 1.0 - smoothstep( 0.105, 0.14, column ) ) * ( 1.0 - smoothstep( 0.13, 0.2, abs( dy ) ) );
    float open = mix( 1.0, max( uEyeOpen, 0.02 ), weight );
    uv.y = clamp( 0.481 + dy / open, 0.0, 1.0 );
    return uv;
  }
`;

export type EyeBlink = {
  /** 1 = fully open, 0 = closed. */
  setOpenness: (value: number) => void;
};

export function installEyeBlink(material: THREE.Material): EyeBlink | null {
  if (!(material instanceof THREE.MeshStandardMaterial)) return null;

  const uniform = { value: 1 };

  material.onBeforeCompile = shader => {
    shader.uniforms.uEyeOpen = uniform;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${blinkChunk}`)
      .replace(
        '#include <map_fragment>',
        THREE.ShaderChunk.map_fragment.replace(
          'texture2D( map, vMapUv )',
          'textureGrad( map, ayaBlinkUv( vMapUv ), dFdx( vMapUv ), dFdy( vMapUv ) )',
        ),
      )
      .replace(
        '#include <emissivemap_fragment>',
        THREE.ShaderChunk.emissivemap_fragment.replace(
          'texture2D( emissiveMap, vEmissiveMapUv )',
          'textureGrad( emissiveMap, ayaBlinkUv( vEmissiveMapUv ), dFdx( vEmissiveMapUv ), dFdy( vEmissiveMapUv ) )',
        ),
      );
  };
  material.customProgramCacheKey = () => 'aya-eye-blink';
  material.needsUpdate = true;

  return {
    setOpenness: value => {
      uniform.value = THREE.MathUtils.clamp(value, 0, 1);
    },
  };
}
