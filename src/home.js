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

function syncPipelineLinks(ch) {
  const label = ch?.labelZh || '影偶';
  const id = ch?.id || selectedId;
  const color = document.getElementById('goColor');
  const print = document.getElementById('goPrint');
  const hint = document.getElementById('colorHint');
  const startHint = document.getElementById('startHint');
  const q = `?char=${encodeURIComponent(id)}&v=jointfix1`;
  if (color) color.href = `./color.html${q}`;
  if (print) print.href = `./print.html${q}`;
  if (hint) hint.textContent = `畫／影相入${label}`;
  if (startHint) startHint.textContent = `① 進入畫${label}`;
  const cont = document.getElementById('continue');
  if (cont && !cont.hidden) {
    cont.href = `./color.html${q}`;
    document.getElementById('continueHint').textContent = `繼續畫${label}`;
  }
  if (startBtn) startBtn.href = `./color.html${q}`;
}

async function rememberCharacter(ch) {
  await updateProject({characterId: ch.id, assetVersion: ch.assetVersion});
}

/** Always enter color for selected character — do not leave user stuck on disabled start. */
async function enterColor(ch, {forceArchive = false} = {}) {
  const character = ch || getCharacter(selectedId) || defaultCharacter();
  selectedId = character.id;
  syncPipelineLinks(character);
  status.textContent = `開緊${character.labelZh}填色…`;
  if (forceArchive) {
    await archiveAndStart(character.id);
  }
  await rememberCharacter(character);
  location.href = `./color.html?char=${encodeURIComponent(character.id)}`;
}

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
    btn.onclick = async () => {
      selectedId = ch.id;
      for (const el of grid.querySelectorAll('.char-card')) {
        const on = el.dataset.characterId === selectedId;
        el.classList.toggle('is-selected', on);
        el.setAttribute('aria-selected', on ? 'true' : 'false');
      }
      syncPipelineLinks(ch);
      try {
        await rememberCharacter(ch);
        status.textContent = `已揀${ch.labelZh}・撳下面「① 開始填色」或卡片「填色／影相」`;
      } catch (e) {
        status.textContent = '未能記住角色：' + e.message;
      }
    };
    grid.append(btn);
  }
}

const startBtn = document.getElementById('start');
if (startBtn) startBtn.removeAttribute('disabled');
startBtn?.addEventListener('click', run(async (ev) => {
  ev.preventDefault();

  const ch = getCharacter(selectedId) || defaultCharacter();
  // If switching to a different character while an old project exists, offer archive once.
  const project = await readProject();
  if (existing && project?.characterId && project.characterId !== ch.id) {
    dialog.dataset.nextCharacterId = ch.id;
    dialog.showModal();
    return;
  }
  await enterColor(ch);
}));

document.getElementById('cancelNew').onclick = () => dialog.close();
document.getElementById('archiveStart').onclick = run(async () => {
  const nextId = dialog.dataset.nextCharacterId || selectedId;
  const ch = getCharacter(nextId) || defaultCharacter();
  dialog.close();
  await enterColor(ch, {forceArchive: true});
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

// Pipeline card: ensure click always has fresh ?char=
document.getElementById('goColor')?.addEventListener('click', (ev) => {
  const ch = getCharacter(selectedId) || defaultCharacter();
  syncPipelineLinks(ch);
  // let the browser follow updated href
});

async function init() {
  try {
    renderCharGrid();
    syncPipelineLinks(getCharacter(selectedId) || defaultCharacter());
    if (startBtn) startBtn.removeAttribute("disabled");
    let project = await readProject();
    let loaded = {hasColored: false};
    try {
      loaded = await loadRig();
    } catch (e) {
      console.warn('home loadRig', e);
    }
    if (!project && loaded.hasColored)
      project = await updateProject({
        assetVersion: 'wukong-legacy-v1',
        characterId: 'wukong',
        coloredPartIds: loaded.coloredPartIds,
      });
    existing = !!project || loaded.hasColored;
    document.getElementById('continue').hidden = !existing;
    if (project?.assetVersion === 'wukong-legacy-v1') {
      document.getElementById('continue').href = './legacy-color.html';
      document.getElementById('continueHint').textContent = '舊版分件悟空';
    } else if (project?.characterId) {
      const ch = getCharacter(project.characterId);
      if (ch) {
        selectedId = ch.id;
        renderCharGrid();
        syncPipelineLinks(ch);
        document.getElementById('continueHint').textContent = `繼續畫${ch.labelZh}`;
        document.getElementById('continue').href = `./color.html?char=${encodeURIComponent(ch.id)}`;
      }
    }
    const archives = await getArchives();
    if (archives.length) {
      const b = document.getElementById('restore');
      b.hidden = false;
      b.onclick = run(async () => {
        await restoreArchive(archives[0]);
        const proj = await readProject();
        const cid = proj?.characterId || selectedId;
        location.href = `./color.html?char=${encodeURIComponent(cid)}`;
      });
    }
    status.textContent = '揀角色，再撳「① 開始填色」或上面「填色／影相」。';
  } catch (e) {
    if (startBtn) startBtn.removeAttribute("disabled");
    status.textContent = '未能讀取作品（仍可入場）：' + e.message;
  }
}
init();
