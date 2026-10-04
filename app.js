const { FFmpeg } = FFmpegWASM;

const fetchFile = async (f) => new Uint8Array(await f.arrayBuffer());
async function toBlobURL(url, type) {
  const buf = await (await fetch(url)).arrayBuffer();
  return URL.createObjectURL(new Blob([buf], { type }));
}

const FORMATS = {
  mp3: {
    mime: "audio/mpeg",
    codec: ["-c:a", "libmp3lame", "-b:a", "320k"],
    cover: true,
  },
  m4a: {
    mime: "audio/mp4",
    codec: ["-c:a", "aac", "-b:a", "256k"],
    cover: true,
  },
  flac: { mime: "audio/flac", codec: ["-c:a", "flac"], cover: false },
  ogg: {
    mime: "audio/ogg",
    codec: ["-c:a", "libvorbis", "-q:a", "6"],
    cover: false,
  },
  wav: { mime: "audio/wav", codec: ["-c:a", "pcm_s16le"], cover: false },
};

const $ = (id) => document.getElementById(id);
const form = $("form");
let file = null;
let cover = null; // { blob, url }
let ffmpeg = null;

function readTags(f) {
  return new Promise((resolve, reject) => {
    jsmediatags.read(f, { onSuccess: (r) => resolve(r.tags), onError: reject });
  });
}

function setCover(c) {
  cover = c;
  $("cover-img").hidden = !c;
  $("cover-none").hidden = !!c;
  if (c) $("cover-img").src = c.url;
}

async function openFile(f) {
  $("error").textContent = "";
  let t = {};
  try {
    t = await readTags(f);
  } catch {
    // no readable tags: start with an empty form
  }
  file = f;
  $("drop-text").textContent = f.name;
  $("editor").hidden = false;
  form.title.value = t.title ?? "";
  form.artist.value = t.artist ?? "";
  form.album.value = t.album ?? "";
  form.albumArtist.value = t.TPE2?.data ?? t.aART?.data ?? "";
  form.year.value = t.year ?? "";
  form.genre.value = t.genre ?? "";
  form.track.value = (t.track ?? "").toString().split("/")[0];
  form.format.value = f.name.toLowerCase().endsWith(".mp3") ? "mp3" : "m4a";
  if (t.picture) {
    const blob = new Blob([new Uint8Array(t.picture.data)], {
      type: t.picture.format,
    });
    setCover({ blob, url: URL.createObjectURL(blob) });
  } else {
    setCover(null);
  }
}

function metadataArgs() {
  const map = {
    title: form.title.value,
    artist: form.artist.value,
    album: form.album.value,
    album_artist: form.albumArtist.value,
    date: form.year.value,
    genre: form.genre.value,
    track: form.track.value,
  };
  return Object.entries(map).flatMap(([k, v]) =>
    v ? ["-metadata", `${k}=${v}`] : [],
  );
}

async function loadFFmpeg() {
  if (ffmpeg) return ffmpeg;
  const ff = new FFmpeg();
  await ff.load({
    coreURL: await toBlobURL("vendor/core/ffmpeg-core.js", "text/javascript"),
    wasmURL: await toBlobURL(
      "vendor/core/ffmpeg-core.wasm",
      "application/wasm",
    ),
  });
  ffmpeg = ff;
  return ff;
}

async function exportAudio(format) {
  const ff = await loadFFmpeg();
  const spec = FORMATS[format];
  const input = "input" + (file.name.match(/\.[^.]+$/)?.[0] ?? "");
  const output = `output.${format}`;
  await ff.writeFile(input, await fetchFile(file));

  const args = ["-i", input];
  const withCover = cover && spec.cover;
  if (withCover) {
    await ff.writeFile("cover.jpg", await fetchFile(cover.blob));
    args.push(
      "-i",
      "cover.jpg",
      "-map",
      "0:a",
      "-map",
      "1:v",
      "-c:v",
      "mjpeg",
      "-disposition:v",
      "attached_pic",
    );
  } else {
    args.push("-map", "0:a", "-vn");
  }
  args.push(...spec.codec, "-map_metadata", "-1", ...metadataArgs());
  if (format === "mp3") args.push("-id3v2_version", "3");
  args.push(output);

  const code = await ff.exec(args);
  if (code !== 0) throw new Error("ffmpeg failed (exit " + code + ")");
  const data = await ff.readFile(output);
  await ff.deleteFile(input).catch(() => {});
  await ff.deleteFile(output).catch(() => {});
  if (withCover) await ff.deleteFile("cover.jpg").catch(() => {});
  return new Blob([data], { type: spec.mime });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("download");
  btn.disabled = true;
  btn.textContent = "Processing…";
  $("error").textContent = "";
  try {
    const format = form.format.value;
    const blob = await exportAudio(format);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const base = form.title.value || file.name.replace(/\.[^.]+$/, "");
    a.download = `${form.artist.value ? form.artist.value + " - " : ""}${base}.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    $("error").textContent = err.message || "Export failed.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Download";
  }
});

$("file").addEventListener(
  "change",
  (e) => e.target.files[0] && openFile(e.target.files[0]),
);
$("drop").addEventListener("dragover", (e) => e.preventDefault());
$("drop").addEventListener("drop", (e) => {
  e.preventDefault();
  if (e.dataTransfer.files[0]) openFile(e.dataTransfer.files[0]);
});
$("cover-file").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) setCover({ blob: f, url: URL.createObjectURL(f) });
});
$("cover-remove").addEventListener("click", () => setCover(null));
