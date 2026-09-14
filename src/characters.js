/**
 * P1 multi-character registry (MULTI-CHAR-P1.md).
 * Students pick a character; paint/photo writes [characterId,'whole'].
 */
export const CHAR_REGISTRY = [
  {
    id: 'wukong-v2',
    labelZh: '孫悟空',
    assetVersion: 'wukong-profile-v2',
    templateUrl: './characters/wukong-v2/template.png',
    lineArtUrl: './print/wukong-profile-line-a4.svg',
    printUrl: './print/wukong-profile-line-a4.svg',
    rodPreset: 'humanoid',
    kind: 'biped',
    rigMode: 'articulated',
    width: 640,
    height: 960,
  },
  {
    id: 'tangseng-v1',
    labelZh: '唐僧',
    assetVersion: 'tangseng-profile-v1',
    templateUrl: './characters/tangseng-v1/template.png',
    lineArtUrl: './print/tangseng-v1-profile-line-a4.svg',
    printUrl: './print/tangseng-v1-profile-line-a4.svg',
    rodPreset: 'humanoid',
    kind: 'biped',
    rigMode: 'whole', // P1a: whole silhouette + body rod; P1b articulated
    width: 640,
    height: 960,
  },
  {
    id: 'bajie-v1',
    labelZh: '豬八戒',
    assetVersion: 'bajie-profile-v1',
    templateUrl: './characters/bajie-v1/template.png',
    lineArtUrl: './print/bajie-v1-profile-line-a4.svg',
    printUrl: './print/bajie-v1-profile-line-a4.svg',
    rodPreset: 'humanoid',
    kind: 'biped',
    rigMode: 'whole',
    width: 640,
    height: 960,
  },
  {
    id: 'sha-v1',
    labelZh: '沙僧',
    assetVersion: 'sha-profile-v1',
    templateUrl: './characters/sha-v1/template.png',
    lineArtUrl: './print/sha-v1-profile-line-a4.svg',
    printUrl: './print/sha-v1-profile-line-a4.svg',
    rodPreset: 'humanoid',
    kind: 'biped',
    rigMode: 'whole',
    width: 640,
    height: 960,
  },
  {
    id: 'baima-v1',
    labelZh: '白馬',
    assetVersion: 'baima-profile-v1',
    templateUrl: './characters/baima-v1/template.png',
    lineArtUrl: './print/baima-v1-profile-line-a4.svg',
    printUrl: './print/baima-v1-profile-line-a4.svg',
    rodPreset: 'horse',
    kind: 'horse',
    rigMode: 'whole', // P1a body rod; P1b head/neck
    width: 640,
    height: 960,
  },
];

const BY_ID = new Map(CHAR_REGISTRY.map((c) => [c.id, c]));
const BY_ASSET = new Map(CHAR_REGISTRY.map((c) => [c.assetVersion, c]));

export function getCharacter(id) {
  return BY_ID.get(id) || null;
}

export function getCharacterByAssetVersion(assetVersion) {
  return BY_ASSET.get(assetVersion) || null;
}

export function isProfileAssetVersion(assetVersion) {
  return BY_ASSET.has(assetVersion);
}

export function listCharacters() {
  return CHAR_REGISTRY.slice();
}

export function defaultCharacter() {
  return CHAR_REGISTRY[0];
}
