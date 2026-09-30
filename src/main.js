import "./styles.css";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

const CLOVA_URL = "https://clovanote.naver.com/";
const PROMPT_URL = "https://www.prpt.ai/prompt/list";
const CHATGPT_URL = "https://chatgpt.com/";
const LARGE_FILE_BYTES = 800 * 1024 * 1024;

const DEFAULT_PROMPT = `아래에 첨부한 파일은 대학 강의 대본입니다.

다음 기준으로 학습 자료를 만들어 주세요.
1. 강의의 핵심 개념을 빠짐없이 정리하기
2. 개념 사이의 관계를 쉬운 말로 설명하기
3. 시험에 나올 가능성이 높은 내용을 표시하기
4. 마지막에 복습용 질문 5개 만들기

대본에 없는 내용은 사실처럼 단정하지 말고, 추가 설명은 별도로 구분해 주세요.`;

const steps = [
  ["강의 영상 선택", "MP4를 불러와요"],
  ["MP3로 바꾸기", "브라우저에서 변환"],
  ["클로바노트 올리기", "직접 업로드"],
  ["대본 내려받기", "TXT로 저장"],
  ["프롬프트 고르기", "내 공부 방식에 맞게"],
  ["GPT로 공부하기", "대본과 함께 입력"],
];

const state = {
  step: 0,
  completed: new Set(),
  video: null,
  transcript: null,
  audioUrl: null,
  audioName: null,
  ffmpeg: null,
  converting: false,
};

const app = document.querySelector("#app");

app.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar" aria-label="진행 단계">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">✦</div>
        <div><strong>강의 영상<br />대본화 가이드</strong><span>영상에서 대본, 학습까지</span></div>
      </div>
      <ol class="step-list">
        ${steps.map(([title, subtitle], index) => `
          <li>
            <button class="step-button" data-step="${index}" type="button">
              <span class="step-number">${index + 1}</span>
              <span class="step-copy"><strong>${title}</strong><small>${subtitle}</small></span>
            </button>
          </li>`).join("")}
      </ol>
      <div class="sidebar-bottom">
        <button id="reset-button" class="button button-sidebar" type="button">↺ 처음으로 돌아가기</button>
        <p>◆ 영상은 서버에 업로드되지 않아요</p>
      </div>
    </aside>

    <main class="workspace">
      <header class="workspace-header">
        <div>
          <p class="eyebrow">━ 한 단계씩, 내 속도로</p>
          <button id="mobile-steps-button" class="mobile-steps-button" type="button" aria-expanded="false">전체 단계 보기</button>
        </div>
        <div class="journey" aria-label="전체 진행률">
          <div><span>오늘의 여정</span><strong id="progress-count">0 / 6</strong></div>
          <div class="progress-track"><span id="progress-bar"></span></div>
        </div>
      </header>

      <section class="page active" data-page="0">
        <span class="kicker">✦ 1번째 걸음</span>
        <h1>먼저 강의 영상을<br />선택해 주세요</h1>
        <p class="lead">학교 LMS에서 공식 다운로드 기능으로 저장한 MP4 파일을 불러옵니다.</p>
        <div id="video-drop" class="drop-zone" tabindex="0" role="button" aria-label="MP4 파일 선택">
          <span class="drop-icon">＋</span>
          <strong>MP4 파일을 여기로 끌어오세요</strong>
          <span>또는 아래 버튼을 눌러 강의 파일을 선택하세요.</span>
        </div>
        <input id="video-input" type="file" accept="video/mp4,.mp4" hidden />
        <div class="button-row spaced">
          <button id="choose-video" class="button button-primary" type="button">MP4 파일 선택하기</button>
        </div>
        <div id="video-info" class="file-info" aria-live="polite">아직 선택된 파일이 없습니다.</div>
        <div id="large-file-note" class="notice warning hidden">
          <span>!</span><p>파일이 커서 웹 변환이 느리거나 중단될 수 있습니다. 이런 경우 Windows 앱 사용을 권장합니다.</p>
        </div>
        <div class="button-row end">
          <button id="step1-next" class="button button-secondary" type="button" disabled>이 파일로 시작하기 →</button>
        </div>
      </section>

      <section class="page" data-page="1">
        <span class="kicker">✦ 2번째 걸음</span>
        <h1>강의 영상을<br />MP3로 바꿔요</h1>
        <p class="lead">음성 인식에 알맞게 용량을 줄입니다. 변환은 이 브라우저 안에서만 진행됩니다.</p>
        <div class="media-card">
          <div class="file-badge">♫</div>
          <div class="grow"><strong id="convert-file-name">MP4 파일을 먼저 선택해 주세요.</strong><p id="convert-status">변환 준비 상태를 확인합니다.</p></div>
        </div>
        <div class="conversion-progress" aria-label="변환 진행률"><span id="conversion-bar"></span></div>
        <p id="conversion-percent" class="conversion-copy" aria-live="polite">대기 중</p>
        <div class="notice privacy"><span>✓</span><p>선택한 영상과 변환된 음성은 외부 서버로 전송되지 않습니다.</p></div>
        <div class="button-row spaced">
          <button class="button button-ghost" data-go="0" type="button">← 파일 다시 고르기</button>
          <button id="convert-button" class="button button-primary" type="button" disabled>MP3로 변환하기</button>
        </div>
        <div class="button-row end">
          <a id="download-audio" class="button button-secondary hidden" download>완성된 MP3 내려받기</a>
          <button id="step2-next" class="button button-primary hidden" type="button">클로바노트 단계로 →</button>
        </div>
      </section>

      <section class="page" data-page="2">
        <span class="kicker">✦ 3번째 걸음</span>
        <h1>클로바노트에<br />음성 파일을 올려주세요</h1>
        <p class="lead">완성된 MP3를 내려받은 뒤 클로바노트에서 직접 업로드합니다.</p>
        <div class="media-card"><div class="file-badge">♫</div><div><strong id="audio-card-title">MP3 파일</strong><p id="audio-card-copy">변환이 끝나면 여기에 표시됩니다.</p></div></div>
        <div class="notice"><span>1</span><p>‘완성된 MP3 내려받기’를 누른 뒤, 클로바노트에서 ‘새 노트 만들기’를 선택하세요.</p></div>
        <div class="button-row spaced">
          <a id="download-audio-step3" class="button button-secondary disabled-link" aria-disabled="true">MP3 다시 내려받기</a>
          <a class="button button-primary" href="${CLOVA_URL}" target="_blank" rel="noopener">클로바노트 열기 ↗</a>
        </div>
        <label class="complete-check"><input id="clova-check" type="checkbox" /> <span>클로바노트 업로드를 마쳤어요</span></label>
      </section>

      <section class="page" data-page="3">
        <span class="kicker">✦ 4번째 걸음</span>
        <h1>완성된 대본을<br />TXT로 내려받으세요</h1>
        <p class="lead">음성 인식이 끝나면 클로바노트의 다운로드 메뉴에서 TXT로 저장합니다.</p>
        <div class="notice"><span>1</span><p>클로바노트에서 대본을 확인한 뒤 파일 형식을 TXT로 선택해 내려받으세요.</p></div>
        <input id="transcript-input" type="file" accept="text/plain,.txt" hidden />
        <div class="button-row spaced">
          <a class="button button-secondary" href="${CLOVA_URL}" target="_blank" rel="noopener">클로바노트 다시 열기 ↗</a>
          <button id="choose-transcript" class="button button-primary" type="button">다운로드한 TXT 선택하기</button>
        </div>
        <div id="transcript-info" class="file-info" aria-live="polite">아직 선택된 대본이 없습니다.</div>
        <div class="button-row end"><button id="step4-next" class="button button-secondary" type="button" disabled>프롬프트 고르러 가기 →</button></div>
      </section>

      <section class="page" data-page="4">
        <span class="kicker">✦ 5번째 걸음</span>
        <h1>나에게 맞는<br />공부 프롬프트를 골라요</h1>
        <p class="lead">기본 문장을 그대로 쓰거나 내 공부 방식에 맞게 고쳐 쓰세요.</p>
        <div class="button-row spaced">
          <a class="button button-secondary" href="${PROMPT_URL}" target="_blank" rel="noopener">PRPT에서 찾아보기 ↗</a>
          <button id="prompt-reset" class="button button-ghost" type="button">기본 문장으로 되돌리기</button>
        </div>
        <textarea id="prompt-editor" aria-label="학습 프롬프트"></textarea>
        <div class="button-row end"><button id="step5-next" class="button button-primary" type="button">GPT로 공부할 준비하기 →</button></div>
      </section>

      <section class="page" data-page="5">
        <span class="kicker">✦ 6번째 걸음</span>
        <h1>이제 GPT에서<br />강의를 공부해 볼까요?</h1>
        <p class="lead">TXT 대본을 첨부하고 복사한 프롬프트를 붙여 넣으면 준비가 끝납니다.</p>
        <div class="media-card"><div class="file-badge">TXT</div><div><strong id="final-file-title">강의 대본</strong><p id="final-file-copy">TXT 파일을 선택하면 여기에 표시됩니다.</p></div></div>
        <div class="notice"><span>1</span><p>프롬프트를 복사한 뒤 ChatGPT를 열고, TXT 파일과 프롬프트를 함께 입력하세요.</p></div>
        <div class="button-row spaced">
          <button id="copy-prompt" class="button button-secondary" type="button">프롬프트 복사</button>
          <a class="button button-primary" href="${CHATGPT_URL}" target="_blank" rel="noopener">ChatGPT 열기 ↗</a>
        </div>
        <button id="finish-button" class="button button-finish" type="button">오늘의 준비를 모두 마쳤어요 ✓</button>
        <p id="finish-message" class="finish-message" aria-live="polite"></p>
      </section>

      <footer class="workspace-footer">
        <p>웹 변환이 어렵다면 대용량 영상에 더 안정적인 Windows 앱을 이용하세요.</p>
        <button id="app-info-button" class="text-button" type="button">Windows 앱 안내</button>
      </footer>
    </main>
  </div>

  <dialog id="app-dialog">
    <button class="dialog-close" type="button" aria-label="닫기">×</button>
    <span class="dialog-icon">↯</span>
    <h2>긴 강의는 Windows 앱이 더 안정적이에요</h2>
    <p>웹 버전은 브라우저 메모리를 사용합니다. 용량이 큰 영상이나 변환이 중단되는 영상은 Windows 앱에서 처리해 주세요.</p>
    <p class="dialog-note">앱 다운로드 주소는 GitHub 배포 저장소를 만든 뒤 이 버튼에 연결할 예정입니다.</p>
  </dialog>

  <dialog id="download-dialog" aria-labelledby="download-dialog-title">
    <span class="dialog-icon">♫</span>
    <h2 id="download-dialog-title">MP3를 내려받을까요?</h2>
    <p id="download-dialog-file"></p>
    <div class="button-row end download-dialog-actions">
      <button id="cancel-download" class="button button-ghost" type="button">아니오</button>
      <button id="confirm-download" class="button button-primary" type="button">예, 내려받기</button>
    </div>
  </dialog>

  <div id="toast" class="toast" role="status" aria-live="polite"></div>
`;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function safeBaseName(name) {
  return name.replace(/\.mp4$/i, "").replace(/[\\/:*?"<>|]/g, "_") || "lecture";
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function setFileInfo(element, name, size) {
  element.replaceChildren();
  const title = document.createElement("strong");
  const meta = document.createElement("span");
  title.textContent = `✓ ${name}`;
  meta.textContent = formatBytes(size);
  element.append(title, meta);
}

function setStep(index) {
  if (index > 0 && !state.video) {
    showToast("먼저 MP4 파일을 선택해 주세요.");
    index = 0;
  }
  state.step = Math.max(0, Math.min(5, index));
  $$(".page").forEach((page, i) => page.classList.toggle("active", i === state.step));
  $$(".step-button").forEach((button, i) => {
    button.classList.toggle("active", i === state.step);
    button.classList.toggle("done", state.completed.has(i));
    button.querySelector(".step-number").textContent = state.completed.has(i) ? "✓" : String(i + 1);
  });
  const count = state.completed.size;
  $("#progress-count").textContent = `${count} / 6`;
  $("#progress-bar").style.width = `${(count / 6) * 100}%`;
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.body.classList.remove("show-mobile-steps");
  $("#mobile-steps-button").setAttribute("aria-expanded", "false");
}

function completeAndGo(completed, target) {
  state.completed.add(completed);
  setStep(target);
}

function navigateTo(index) {
  const furthest = Math.min(5, Math.max(0, ...state.completed) + 1);
  if (index > furthest) {
    showToast("앞 단계를 먼저 마쳐 주세요.");
    return;
  }
  setStep(index);
}

function selectVideo(file) {
  if (!file) return;
  if (!/\.mp4$/i.test(file.name) && file.type !== "video/mp4") {
    showToast("MP4 파일만 선택할 수 있습니다.");
    return;
  }
  state.video = file;
  state.completed.delete(1);
  state.completed.delete(2);
  state.audioName = null;
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  state.audioUrl = null;
  setFileInfo($("#video-info"), file.name, file.size);
  $("#convert-file-name").textContent = file.name;
  $("#convert-status").textContent = `완성 파일: ${safeBaseName(file.name)}.mp3`;
  $("#step1-next").disabled = false;
  $("#convert-button").disabled = false;
  $("#large-file-note").classList.toggle("hidden", file.size < LARGE_FILE_BYTES);
  $("#conversion-bar").style.width = "0%";
  $("#conversion-percent").textContent = "대기 중";
  $("#download-audio").classList.add("hidden");
  $("#step2-next").classList.add("hidden");
  const step3Download = $("#download-audio-step3");
  step3Download.classList.add("disabled-link");
  step3Download.setAttribute("aria-disabled", "true");
  step3Download.removeAttribute("href");
  setStep(state.step);
}

async function loadFFmpeg() {
  if (state.ffmpeg) return state.ffmpeg;
  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => {
    const percent = Math.max(0, Math.min(99, Math.round(progress * 100)));
    $("#conversion-bar").style.width = `${percent}%`;
    $("#conversion-percent").textContent = `변환 중 · ${percent}%`;
  });
  const pageBase = new URL(import.meta.env.BASE_URL, window.location.href);
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("FFmpeg load timeout")), 90000);
  });
  await Promise.race([
    ffmpeg.load({
      coreURL: new URL("ffmpeg/ffmpeg-core.js", pageBase).href,
      wasmURL: new URL("ffmpeg/ffmpeg-core.wasm", pageBase).href,
    }),
    timeout,
  ]);
  state.ffmpeg = ffmpeg;
  return ffmpeg;
}

async function convertVideo() {
  if (!state.video || state.converting) return;
  state.converting = true;
  const button = $("#convert-button");
  button.disabled = true;
  button.textContent = "변환 준비 중…";
  $("#conversion-percent").textContent = "변환 도구를 불러오는 중…";
  const inputName = `input-${Date.now()}.mp4`;
  const outputName = `output-${Date.now()}.mp3`;
  try {
    const ffmpeg = await loadFFmpeg();
    button.textContent = "변환 중…";
    await ffmpeg.writeFile(inputName, await fetchFile(state.video));
    await ffmpeg.exec(["-i", inputName, "-vn", "-ac", "1", "-ar", "44100", "-b:a", "64k", outputName]);
    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data.buffer], { type: "audio/mpeg" });
    if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
    state.audioUrl = URL.createObjectURL(blob);
    state.audioName = `${safeBaseName(state.video.name)}.mp3`;
    [$("#download-audio"), $("#download-audio-step3")].forEach((link) => {
      link.href = state.audioUrl;
      link.download = state.audioName;
      link.classList.remove("hidden", "disabled-link");
      link.removeAttribute("aria-disabled");
    });
    $("#conversion-bar").style.width = "100%";
    $("#conversion-percent").textContent = `변환 완료 · ${formatBytes(blob.size)}`;
    $("#step2-next").classList.remove("hidden");
    $("#audio-card-title").textContent = state.audioName;
    $("#audio-card-copy").textContent = `${formatBytes(blob.size)} · 내려받아 클로바노트에 올려주세요.`;
    state.completed.add(1);
    setStep(1);
    showToast("MP3 변환이 완료되었습니다.");
  } catch (error) {
    console.error(error);
    const timedOut = error instanceof Error && error.message.includes("timeout");
    $("#conversion-percent").textContent = timedOut
      ? "변환 도구를 불러오지 못했습니다. 페이지를 새로고침해 다시 시도해 주세요."
      : "변환하지 못했습니다.";
    showToast(timedOut
      ? "변환 도구 준비 시간이 너무 오래 걸렸습니다."
      : "브라우저 메모리가 부족하거나 지원하지 않는 영상입니다. Windows 앱을 이용해 주세요.");
  } finally {
    if (state.ffmpeg) {
      try { await state.ffmpeg.deleteFile(inputName); } catch {}
      try { await state.ffmpeg.deleteFile(outputName); } catch {}
    }
    state.converting = false;
    button.disabled = !state.video;
    button.textContent = "MP3로 변환하기";
  }
}

function selectTranscript(file) {
  if (!file) return;
  if (!/\.txt$/i.test(file.name) && file.type !== "text/plain") {
    showToast("TXT 파일만 선택할 수 있습니다.");
    return;
  }
  state.transcript = file;
  setFileInfo($("#transcript-info"), file.name, file.size);
  $("#final-file-title").textContent = file.name;
  $("#final-file-copy").textContent = `${formatBytes(file.size)} · ChatGPT에 첨부해 주세요.`;
  $("#step4-next").disabled = false;
}

function resetAll() {
  if (state.converting) {
    const confirmed = confirm("변환을 중단하고 처음으로 돌아갈까요?");
    if (!confirmed) return;
    state.ffmpeg?.terminate();
    state.ffmpeg = null;
    state.converting = false;
  } else if ((state.video || state.transcript || state.completed.size) && !confirm("선택한 파일과 진행 표시를 초기화할까요?\n이미 내려받은 파일은 삭제되지 않습니다.")) {
    return;
  }
  if (state.audioUrl) URL.revokeObjectURL(state.audioUrl);
  Object.assign(state, { step: 0, video: null, transcript: null, audioUrl: null, audioName: null });
  state.completed.clear();
  $("#video-input").value = "";
  $("#transcript-input").value = "";
  $("#video-info").textContent = "아직 선택된 파일이 없습니다.";
  $("#transcript-info").textContent = "아직 선택된 대본이 없습니다.";
  $("#convert-file-name").textContent = "MP4 파일을 먼저 선택해 주세요.";
  $("#convert-status").textContent = "변환 준비 상태를 확인합니다.";
  $("#conversion-bar").style.width = "0%";
  $("#conversion-percent").textContent = "대기 중";
  $("#audio-card-title").textContent = "MP3 파일";
  $("#audio-card-copy").textContent = "변환이 끝나면 여기에 표시됩니다.";
  $("#final-file-title").textContent = "강의 대본";
  $("#final-file-copy").textContent = "TXT 파일을 선택하면 여기에 표시됩니다.";
  $("#prompt-editor").value = DEFAULT_PROMPT;
  $("#finish-message").textContent = "";
  $("#clova-check").checked = false;
  $("#step1-next").disabled = true;
  $("#step4-next").disabled = true;
  $("#convert-button").disabled = true;
  $("#download-audio").classList.add("hidden");
  $("#step2-next").classList.add("hidden");
  $("#download-audio-step3").classList.add("disabled-link");
  $("#large-file-note").classList.add("hidden");
  setStep(0);
}

function bindDropZone(zone, input, handler) {
  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); input.click(); }
  });
  ["dragenter", "dragover"].forEach((name) => zone.addEventListener(name, (event) => {
    event.preventDefault(); zone.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach((name) => zone.addEventListener(name, (event) => {
    event.preventDefault(); zone.classList.remove("dragging");
  }));
  zone.addEventListener("drop", (event) => handler(event.dataTransfer.files[0]));
}

$("#prompt-editor").value = DEFAULT_PROMPT;
bindDropZone($("#video-drop"), $("#video-input"), selectVideo);
$("#choose-video").addEventListener("click", () => $("#video-input").click());
$("#video-input").addEventListener("change", (event) => selectVideo(event.target.files[0]));
$("#step1-next").addEventListener("click", () => completeAndGo(0, 1));
$("#convert-button").addEventListener("click", convertVideo);
const downloadDialog = $("#download-dialog");
[$("#download-audio"), $("#download-audio-step3")].forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    if (!state.audioUrl || link.classList.contains("disabled-link")) return;
    $("#download-dialog-file").textContent = state.audioName;
    downloadDialog.showModal();
  });
});
$("#cancel-download").addEventListener("click", () => downloadDialog.close());
$("#confirm-download").addEventListener("click", () => {
  downloadDialog.close();
  if (!state.audioUrl) return;
  const link = document.createElement("a");
  link.href = state.audioUrl;
  link.download = state.audioName;
  document.body.appendChild(link);
  link.click();
  link.remove();
});
$("#step2-next").addEventListener("click", () => setStep(2));
$("#clova-check").addEventListener("change", (event) => {
  if (event.target.checked) completeAndGo(2, 3);
  else { state.completed.delete(2); setStep(state.step); }
});
$("#choose-transcript").addEventListener("click", () => $("#transcript-input").click());
$("#transcript-input").addEventListener("change", (event) => selectTranscript(event.target.files[0]));
$("#step4-next").addEventListener("click", () => completeAndGo(3, 4));
$("#prompt-reset").addEventListener("click", () => { $("#prompt-editor").value = DEFAULT_PROMPT; showToast("기본 문장으로 되돌렸습니다."); });
$("#step5-next").addEventListener("click", () => completeAndGo(4, 5));
$("#copy-prompt").addEventListener("click", async () => {
  const text = $("#prompt-editor").value.trim();
  if (!text) { setStep(4); showToast("먼저 프롬프트를 작성해 주세요."); return; }
  try {
    await navigator.clipboard.writeText(text);
    showToast("프롬프트를 복사했습니다.");
  } catch {
    $("#prompt-editor").focus();
    $("#prompt-editor").select();
    showToast("자동 복사가 제한되어 문장을 선택했습니다. Ctrl+C를 눌러주세요.");
  }
});
$("#finish-button").addEventListener("click", () => {
  if (!state.transcript) { setStep(3); showToast("먼저 TXT 대본을 선택해 주세요."); return; }
  state.completed.add(5);
  setStep(5);
  $("#finish-message").textContent = "오늘의 강의 자료 준비가 끝났어요. 이제 대본을 바탕으로 천천히 공부해 보세요.";
});
$("#reset-button").addEventListener("click", resetAll);
$$('[data-go]').forEach((button) => button.addEventListener("click", () => setStep(Number(button.dataset.go))));
$$('.step-button').forEach((button) => button.addEventListener("click", () => navigateTo(Number(button.dataset.step))));
$("#mobile-steps-button").addEventListener("click", (event) => {
  const showing = document.body.classList.toggle("show-mobile-steps");
  event.currentTarget.setAttribute("aria-expanded", String(showing));
});
const dialog = $("#app-dialog");
$("#app-info-button").addEventListener("click", () => dialog.showModal());
$(".dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

window.addEventListener("beforeunload", () => { if (state.audioUrl) URL.revokeObjectURL(state.audioUrl); });
setStep(0);
