import {
  readProject,
  updateProject,
  archiveAndStart,
  getArchives,
  restoreArchive,
} from './projectStorage.js';
import {loadRig} from './loadRig.js';
import {createManualPose} from './dragPose.js';
import {renderArtwork, downloadCanvas} from './exportArtwork.js';
import {listCharacters, getCharacter, defaultCharacter} from './characters.js';

const status = document.getElementById('homeStatus');
const dialog = document.getElementById('newDialog');
const run = (fn) => async () => {
  try {
    await fn();
  } catch (e) {
    status.textContent = '未能完成：' + e.message;
  }
};

let existing = false;
let selectedId = defaultCharacter().id;

function renderCharGrid() {
  const grid = document.getElementById('charGrid');
  grid.replaceChildren();
  for (const ch of listCharacters()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'char-card' + (ch.id === selectedId ? ' is-selected' : '');
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', ch.id === selectedId ? 'true' : 'false');
    btn.dataset.characterId = ch.id;
    btn.innerHTML = `<img src="${ch.templateUrl}" alt="" width="72" height="108" loading="lazy"><strong>${ch.labelZh}</strong>`;
    btn.onclick = () => {
      selectedId = ch.id;
      for (const el of grid.querySelectorAll('.char-card')) {
        const on = el.dataset.characterId === selectedId;
        el.classList.toggle('is-selected', on);
        el.setAttribute('aria-selected', on ? 'true' : 'false');
      }
      document.getElementById('startHint').textContent = `畫${ch.labelZh}，再編排三格故事`;
    };
    grid.append(btn);
  }
}

document.getElementById('start').disabled = true;
document.getElementById('start').onclick = run(async () => {
  const ch = getCharacter(selectedId) || defaultCharacter();
  if (existing) {
    dialog.dataset.nextCharacterId = ch.id;
    dialog.showModal();
  } else {
    await updateProject({
      characterId: ch.id,
      assetVersion: ch.assetVersion,
      coloredPartIds: [],
      poses: [null, null, null],
    });
    location.href = './color.html';
  }
});
document.getElementById('cancelNew').onclick = () => dialog.close();
document.getElementById('archiveStart').onclick = run(async () => {
  const nextId = dialog.dataset.nextCharacterId || selectedId;
  await archiveAndStart(nextId);
  const ch = getCharacter(nextId) || defaultCharacter();
  await updateProject({
    characterId: ch.id,
    assetVersion: ch.assetVersion,
    coloredPartIds: [],
    poses: [null, null, null],
  });
  location.href = './color.html';
});
document.getElementById('oldDownload').onclick = run(async () => {
  const {rig, images} = await loadRig();
  await downloadCanvas(
    renderArtwork(
      rig,
      images,
      createManualPose(rig, {cx: 450, cy: rig.profile ? 310 : 375, scale: rig.profile ? 0.6 : 0.8}),
    ),
    '舊影偶.png',
  );
});

async function init() {
  try {
    renderCharGrid();
    let project = await readProject();
    const loaded = await loadRig();
    if (!project && loaded.hasColored)
      project = await updateProject({
        assetVersion: 'wukong-legacy-v1',
        characterId: 'wukong',
        coloredPartIds: loaded.coloredPartIds,
      });
    existing = !!project || loaded.hasColored;
    document.getElementById('start').disabled = false;
    document.getElementById('continue').hidden = !existing;
    if (project?.assetVersion === 'wukong-legacy-v1') {
      document.getElementById('continue').href = './legacy-color.html';
      document.getElementById('continueHint').textContent = '舊版分件悟空';
    } else if (project?.characterId) {
      const ch = getCharacter(project.characterId);
      if (ch) {
        selectedId = ch.id;
        renderCharGrid();
        document.getElementById('continueHint').textContent = `繼續畫${ch.labelZh}`;
        document.getElementById('startHint').textContent = `畫${ch.labelZh}，再編排三格故事`;
      }
    }
    const archives = await getArchives();
    if (archives.length) {
      const b = document.getElementById('restore');
      b.hidden = false;
      b.onclick = run(async () => {
        await restoreArchive(archives[0]);
        location.href = './color.html';
      });
    }
  } catch (e) {
    status.textContent = '未能讀取作品：' + e.message;
  }
}
init();
