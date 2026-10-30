import { useEffect, useRef, useState } from "react";
import {
  Camera as CameraIcon,
  Layers,
  Microchip,
  Upload,
  ScanLine,
  Plus,
  Save,
  FolderOpen,
  Download,
  ArrowUpRight,
  Check,
  Undo2,
  Crop,
  Focus,
  Trash2,
  ChevronRight,
  Zap,
} from "lucide-react";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import {
  fresh,
  makePart,
  uid,
  validateProject,
  type Project,
  type Box,
  type Part,
  type Kind,
} from "./model";
import { normalize, crop, pixels } from "./image";
import { detectParts, recognize, traceWires } from "./vision";
import { saveProject, listProjects, exportFile } from "./storage";
import { colors, hex, decodeBands, detectBands, type Color } from "./resistors";
import { Schematic } from "./Schematic";
const repo =
  import.meta.env.VITE_GITHUB_REPOSITORY || "vikramaharshith/CircuitVision";
const kinds: Kind[] = [
  "unknown",
  "resistor",
  "capacitor",
  "diode",
  "transistor",
  "ic",
  "connector",
];
export default function App() {
  const [project, setProject] = useState<Project>(fresh),
    [view, setView] = useState<"Camera" | "Schematic" | "Components">("Camera"),
    [selected, setSelected] = useState(""),
    [photoId, setPhotoId] = useState(""),
    [busy, setBusy] = useState(""),
    [message, setMessage] = useState(""),
    [saved, setSaved] = useState(false),
    [library, setLibrary] = useState<Project[] | null>(null),
    [mode, setMode] = useState<"inspect" | "crop" | "add">("inspect"),
    [corner, setCorner] = useState<{ x: number; y: number } | null>(null),
    [threshold, setThreshold] = useState(115),
    [light, setLight] = useState(false),
    [pin, setPin] = useState<{ id: string; n: number } | null>(null),
    [bands, setBands] = useState<Color[]>(["brown", "black", "red", "gold"]),
    [vertical, setVertical] = useState(false),
    [ocr, setOcr] = useState(""),
    [offlineReady, setOfflineReady] = useState(Capacitor.isNativePlatform());
  const history = useRef<Project[]>([]),
    file = useRef<HTMLInputElement>(null),
    importInput = useRef<HTMLInputElement>(null),
    closeInput = useRef<HTMLInputElement>(null),
    closeCameraInput = useRef<HTMLInputElement>(null),
    cameraInput = useRef<HTMLInputElement>(null);
  const photo =
      project.photos.find((p) => p.id === photoId) || project.photos[0],
    part = project.parts.find((p) => p.id === selected);
  const mutate = (next: Project) => {
    history.current = [...history.current.slice(-19), project];
    setProject(next);
    setSaved(false);
  };
  const edit = (patch: Partial<Part>) => {
    if (!part) return;
    mutate({
      ...project,
      parts: project.parts.map((p) =>
        p.id === part.id ? { ...p, ...patch } : p,
      ),
    });
  };
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy("Working locally…");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }
  async function addImage(src: string, name?: string, close = false) {
    const p = await normalize(src, name);
    if (close && part) edit({ closeup: p.data });
    else {
      mutate({ ...project, photos: [...project.photos, p] });
      setPhotoId(p.id);
      setView("Camera");
    }
    setMode("inspect");
  }
  async function readFile(f?: File, close = false) {
    if (!f) return;
    if (f.size > 30 * 1024 * 1024)
      throw new Error("Choose an image smaller than 30 MB.");
    const u = URL.createObjectURL(f);
    try {
      await addImage(u, f.name, close);
    } finally {
      URL.revokeObjectURL(u);
    }
  }
  async function capture(close = false) {
    if (!Capacitor.isNativePlatform()) {
      (close ? closeCameraInput : cameraInput).current?.click();
      return;
    }
    await run(async () => {
      await saveProject(project);
      localStorage.setItem("camera-project-id", project.id);
      localStorage.setItem("camera-component-id", close && part ? part.id : "");
      const p = await Camera.getPhoto({
        quality: 90,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        correctOrientation: true,
        width: 1600,
        height: 1600,
      });
      if (p.webPath)
        await addImage(
          p.webPath,
          close ? "Component close-up" : "Camera photo",
          close,
        );
    });
  }
  useEffect(() => {
    const listener = NativeApp.addListener("appRestoredResult", (r) => {
      if (r.pluginId === "Camera" && r.success && r.data?.webPath)
        normalize(r.data.webPath, "Recovered camera photo")
          .then(async (p) => {
            const savedProjects = await listProjects();
            const previous = savedProjects.find(item => item.id === localStorage.getItem("camera-project-id")) || fresh();
            const componentId = localStorage.getItem("camera-component-id");
            const recovered = componentId && previous.parts.some(item => item.id === componentId)
              ? {...previous, parts: previous.parts.map(item => item.id === componentId ? {...item, closeup:p.data} : item)}
              : {...previous, photos:[...previous.photos,p]};
            await saveProject(recovered);
            setProject(recovered);
            setPhotoId(p.id);
            setSaved(true);
            setMessage("Camera result recovered and saved.");
          })
          .catch((e) => setMessage(String(e)));
    });
    return () => {
      void listener.then((l) => l.remove());
    };
  }, []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform() && "serviceWorker" in navigator && import.meta.env.PROD) {
      void navigator.serviceWorker.ready.then(() => setOfflineReady(true));
    }
  }, []);
  function choose(id: string) {
    setSelected(id);
    const p = project.parts.find((p) => p.id === id);
    if (p) setPhotoId(p.imageId);
  }
  async function analyze() {
    if (!photo) return;
    await run(async () => {
      setBusy("Finding component outlines with OpenCV…");
      const candidates = await detectParts(
        photo.data,
        photo.id,
        project.parts.length,
      );
      const parts = candidates.filter(candidate => !project.parts.some(existing => {
        if(existing.imageId !== candidate.imageId) return false;
        const a=existing.box,b=candidate.box;
        const intersection=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
        return intersection/Math.min(a.w*a.h,b.w*b.h)>.65;
      }));
      mutate({ ...project, parts: [...project.parts, ...parts] });
      setMessage(
        `${parts.length} candidate regions found. Review their type, boundaries and pins before tracing connections.`,
      );
    });
  }
  async function readMarking() {
    if (!photo && !part?.closeup) return;
    await run(async () => {
      const src =
        part?.closeup ||
        (await crop(
          photo!.data,
          part?.box || { x: 0, y: 0, w: photo!.width, h: photo!.height },
        ));
      const data = await recognize(src, setBusy);
      setOcr(data.text.trim());
      if (part) edit({ marking: data.text.trim() });
      setMessage(
        `OCR confidence ${Math.round(data.confidence)}%. Verify the marking before using a pinout.`,
      );
    });
  }
  async function inspectBands() {
    if (!part || !photo) return;
    await run(async () => {
      const im = await pixels(
        part.closeup || (await crop(photo.data, part.box)),
      );
      const found = detectBands(im.data, im.width, im.height, vertical);
      if (found.length === 4 || found.length === 5) setBands(found);
      setMessage(
        found.length
          ? `Detected colors: ${found.join(", ")}. Check direction and correct metallic/tolerance bands below.`
          : "No reliable bands found. Crop tightly around an evenly lit resistor or enter colors manually.",
      );
    });
  }
  function selectRegion(e: React.MouseEvent<SVGSVGElement>) {
    if (mode === "inspect" || !photo) return;
    const r = e.currentTarget.getBoundingClientRect(),
      p = {
        x: ((e.clientX - r.left) / r.width) * photo.width,
        y: ((e.clientY - r.top) / r.height) * photo.height,
      };
    if (!corner) {
      setCorner(p);
      return;
    }
    const b = {
      x: Math.round(Math.min(corner.x, p.x)),
      y: Math.round(Math.min(corner.y, p.y)),
      w: Math.round(Math.abs(corner.x - p.x)),
      h: Math.round(Math.abs(corner.y - p.y)),
    };
    setCorner(null);
    if (b.w < 8 || b.h < 8) {
      setMessage("Choose a region at least 8 pixels wide and high.");
      return;
    }
    if (mode === "add") {
      const c = {
        ...makePart(b, photo.id, project.parts.length),
        source: "manual" as const,
      };
      mutate({ ...project, parts: [...project.parts, c] });
      setSelected(c.id);
      setMode("inspect");
    } else
      void run(async () => {
        const data = await crop(photo.data, b);
        await addImage(data, `${photo.name} — crop`);
      });
  }
  function connect(id: string, n: number) {
    if (!pin) {
      setPin({ id, n });
      setMessage("Choose the second pin to connect.");
      return;
    }
    if (pin.id === id && pin.n === n) {
      setPin(null);
      return;
    }
    if (
      !project.wires.some(
        (w) =>
          (w.a === pin.id && w.ap === pin.n && w.b === id && w.bp === n) ||
          (w.b === pin.id && w.bp === pin.n && w.a === id && w.ap === n),
      )
    )
      mutate({
        ...project,
        wires: [
          ...project.wires,
          { id: uid(), a: pin.id, ap: pin.n, b: id, bp: n, reviewed: true },
        ],
      });
    setPin(null);
    setMessage("Connection added.");
  }
  async function trace() {
    if (!photo) return;
    await run(async () => {
      setBusy("Tracing visible connections…");
      const inferred = await traceWires(
        photo.data,
        project.parts.filter((p) => p.imageId === photo.id),
        threshold,
        light,
      );
      const newWires = inferred.filter(
        (n) =>
          !project.wires.some(
            (w) =>
              (w.a === n.a && w.ap === n.ap && w.b === n.b && w.bp === n.bp) ||
              (w.b === n.a && w.bp === n.ap && w.a === n.b && w.ap === n.bp),
          ),
      );
      mutate({ ...project, wires: [...project.wires, ...newWires] });
      setView("Schematic");
      setMessage(
        `${newWires.length} candidate connections added in amber. Verify against the board; crossings and hidden traces need manual correction.`,
      );
    });
  }
  function removePart() {
    if (!part) return;
    mutate({
      ...project,
      parts: project.parts.filter((p) => p.id !== part.id),
      wires: project.wires.filter((w) => w.a !== part.id && w.b !== part.id),
    });
    setSelected("");
  }
  const changeMode = (m: typeof mode) => {
    setMode(mode === m ? "inspect" : m);
    setCorner(null);
  };
  const exportProject = () =>
    run(() =>
      exportFile(
        "CircuitVision-project.json",
        JSON.stringify(project, null, 2),
        "application/json",
      ),
    );
  const exportSvg = () =>
    run(async () => {
      const svg = document.getElementById("schematic-svg");
      if (!svg) throw new Error("Open the Schematic view first.");
      await exportFile(
        "CircuitVision-schematic.svg",
        new XMLSerializer().serializeToString(svg),
        "image/svg+xml",
      );
    });
  return (
    <div className="app">
      <header>
        <a className="brand" href="#">
          <span className="brand-icon">
            <ScanLine size={24} />
          </span>
          <span>
            Circuit<span className="accent">Vision</span>
            <small>FROM BOARD TO BLUEPRINT</small>
          </span>
        </a>
        <span className="local">
          <i /> {offlineReady ? "Offline ready" : "Local processing"}
        </span>
        <button
          className="icon"
          aria-label="Open projects"
          onClick={() => run(async () => setLibrary(await listProjects()))}
        >
          <FolderOpen size={20} />
        </button>
      </header>
      <div className="download-bar">
        <span>One circuit. Every screen.</span>
        <a
          href={`https://github.com/${repo}/releases/latest/download/CircuitVision.apk`}
        >
          <Download size={14} /> DOWNLOAD ANDROID APP
        </a>
        <a href="#workspace" onClick={() => setView("Camera")}>
          OPEN WEB APP <ArrowUpRight size={14} />
        </a>
      </div>
      <main id="workspace">
        <div className="project-line" inert={!!busy}>
          <div>
            <span className="eyebrow">YOUR CIRCUIT WORKSPACE</span>
            <input
              aria-label="Project name"
              value={project.name}
              maxLength={80}
              onChange={(e) => mutate({ ...project, name: e.target.value })}
            />
          </div>
          <div className="project-actions">
            <button
              className="icon"
              aria-label="Undo"
              disabled={!history.current.length || !!busy}
              onClick={() => {
                const p = history.current.pop();
                if (p) {
                  setProject(p);
                  setSaved(false);
                  setPin(null);
                }
              }}
            >
              <Undo2 size={18} />
            </button>
            <button
              onClick={() =>
                run(async () => {
                  await saveProject(project);
                  setSaved(true);
                  setMessage("Project saved on this device.");
                })
              }
            >
              <Save size={16} />
              {saved ? "Saved" : "Save project"}
            </button>
          </div>
        </div>
        <nav aria-label="Main views" inert={!!busy}>
          {(["Camera", "Schematic", "Components"] as const).map((v, i) => {
            const Icon = [CameraIcon, Layers, Microchip][i];
            return (
              <button
                key={v}
                className={view === v ? "active" : ""}
                onClick={() => {
                  setView(v);
                  setPin(null);
                }}
              >
                <Icon size={19} />
                {v}
                <span>
                  {i === 1
                    ? project.wires.length
                    : i === 2
                      ? project.parts.length
                      : "01"}
                </span>
              </button>
            );
          })}
        </nav>
        <div className="workspace" inert={!!busy}>
          <section className="primary">
            <div className="section-head">
              <div>
                <h2>
                  {view === "Camera"
                    ? "Look closer. Discover more."
                    : view === "Schematic"
                      ? "Every connection, in view."
                      : "Get to know your components."}
                </h2>
                <p>
                  {view === "Camera"
                    ? "Capture your board. Identify components. Follow the connections."
                    : view === "Schematic"
                      ? "Tap a component to inspect it. Tap two pins to connect them."
                      : "Review local detections and complete the details."}
                </p>
              </div>
              <span className="step">
                {view === "Camera" ? "01" : view === "Schematic" ? "02" : "03"}
              </span>
            </div>
            {view === "Camera" ? (
              <>
                <div className="photo-stage">
                  {photo ? (
                    <TransformWrapper
                      key={`${photo.id}-${mode}`}
                      minScale={0.5}
                      maxScale={8}
                      disabled={mode !== "inspect"}
                    >
                      <TransformComponent wrapperClass="photo-wrapper">
                        <svg
                          className="photo-svg"
                          viewBox={`0 0 ${photo.width} ${photo.height}`}
                          width={photo.width}
                          height={photo.height}
                          onClick={selectRegion}
                          role="img"
                          aria-label="Circuit photograph with component regions"
                        >
                          <image
                            href={photo.data}
                            width={photo.width}
                            height={photo.height}
                          />
                          {project.parts
                            .filter((p) => p.imageId === photo.id)
                            .map((p) => (
                              <g
                                key={p.id}
                                onClick={(e) => {
                                  if (mode === "inspect") {
                                    e.stopPropagation();
                                    choose(p.id);
                                  }
                                }}
                              >
                                <rect
                                  x={p.box.x}
                                  y={p.box.y}
                                  width={p.box.w}
                                  height={p.box.h}
                                  fill={
                                    p.id === selected
                                      ? "#82efb933"
                                      : "transparent"
                                  }
                                  stroke={
                                    p.id === selected
                                      ? "#a1ffcd"
                                      : p.reviewed
                                        ? "#67e5ad"
                                        : "#f6bc6e"
                                  }
                                  strokeWidth={Math.max(2, photo.width / 450)}
                                />
                                <text
                                  x={p.box.x}
                                  y={Math.max(16, p.box.y - 5)}
                                  fontSize={Math.max(16, photo.width / 65)}
                                  fill="#b6ffd6"
                                  stroke="#101416"
                                  strokeWidth=".5"
                                >
                                  {p.label}
                                </text>
                              </g>
                            ))}
                          {corner && (
                            <circle
                              cx={corner.x}
                              cy={corner.y}
                              r="8"
                              fill="#a1ffcd"
                            />
                          )}
                        </svg>
                      </TransformComponent>
                    </TransformWrapper>
                  ) : (
                    <div className="empty-camera">
                      <div className="scan-corners">
                        <ScanLine size={54} strokeWidth={1} />
                      </div>
                      <span className="eyebrow">
                        A NEW PERSPECTIVE ON YOUR CIRCUIT
                      </span>
                      <h3>Start with a photograph</h3>
                      <p>
                        A clear, well-lit image is the first step.
                        <br />
                        Everything is processed on your device.
                      </p>
                      <button
                        className="primary-button"
                        onClick={() => capture()}
                      >
                        <CameraIcon size={18} /> Capture circuit
                      </button>
                      <button
                        className="text-button"
                        onClick={() => file.current?.click()}
                      >
                        <Upload size={16} /> or upload a photograph
                      </button>
                    </div>
                  )}
                  <div className="stage-caption">
                    <span>
                      <i />{" "}
                      {mode !== "inspect"
                        ? corner
                          ? "Tap the opposite corner"
                          : "Tap the first corner of your region"
                        : photo
                          ? "Pinch to zoom · Tap a region to inspect"
                          : "LOCAL PROCESSING · NO CLOUD"}
                    </span>
                    <Focus size={17} />
                  </div>
                </div>
                {photo && (
                  <>
                    <div className="toolbar">
                      <button onClick={() => capture()}>
                        <CameraIcon size={16} /> Capture
                      </button>
                      <button onClick={() => file.current?.click()}>
                        <Upload size={16} /> Upload
                      </button>
                      <button
                        className={mode === "crop" ? "selected" : ""}
                        onClick={() => changeMode("crop")}
                      >
                        <Crop size={16} /> Crop
                      </button>
                      <button
                        className={mode === "add" ? "selected" : ""}
                        onClick={() => changeMode("add")}
                      >
                        <Plus size={16} /> Mark component
                      </button>
                    </div>
                    <div className="photos">
                      {project.photos.map((p) => (
                        <button
                          className={photo.id === p.id ? "selected" : ""}
                          key={p.id}
                          onClick={() => {
                            setPhotoId(p.id);
                            setMode("inspect");
                            setSelected("");
                          }}
                        >
                          <img src={p.data} alt={p.name} />
                        </button>
                      ))}
                    </div>
                    <div className="action-row">
                      <button
                        className="primary-button"
                        disabled={!!busy}
                        onClick={analyze}
                      >
                        <ScanLine size={17} /> Detect component regions
                      </button>
                      <button disabled={!!busy} onClick={readMarking}>
                        Read markings
                      </button>
                    </div>
                    <details>
                      <summary>
                        Visible wire tracing <ChevronRight size={14} />
                      </summary>
                      <p>
                        Uses foreground connectivity between the ends of two-pin
                        component regions. Tight regions and a contrasting
                        background work best. Hidden traces and multi-pin parts
                        require manual connections.
                      </p>
                      <label>
                        Trace brightness threshold: {threshold}
                        <input
                          type="range"
                          min="20"
                          max="240"
                          value={threshold}
                          onChange={(e) => setThreshold(+e.target.value)}
                        />
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={light}
                          onChange={(e) => setLight(e.target.checked)}
                        />{" "}
                        Trace light wires on a dark background
                      </label>
                      <button
                        disabled={
                          !!busy ||
                          !project.parts.some((p) => p.imageId === photo.id)
                        }
                        onClick={trace}
                      >
                        Generate schematic connections
                      </button>
                    </details>
                  </>
                )}
              </>
            ) : view === "Schematic" ? (
              <>
                <div className="schematic-stage">
                  {project.parts.length ? (
                    <Schematic
                      project={project}
                      selected={selected}
                      select={choose}
                      connect={connect}
                    />
                  ) : (
                    <div className="empty-small">
                      <Layers size={42} />
                      <h3>Your schematic starts here</h3>
                      <p>
                        Add component regions in Camera to generate editable
                        symbols.
                      </p>
                      <button onClick={() => setView("Camera")}>
                        Go to Camera
                      </button>
                    </div>
                  )}
                </div>
                <div className="toolbar">
                  <button onClick={exportSvg} disabled={!project.parts.length}>
                    <Download size={16} /> Export SVG
                  </button>
                  <button onClick={exportProject}>Export project</button>
                  {pin && (
                    <button onClick={() => setPin(null)}>
                      Cancel connection
                    </button>
                  )}
                </div>
                <p className="hint">
                  Solid mint: reviewed connection · Dashed amber: inferred,
                  needs review. Symbols are placed automatically; edit X/Y to
                  rearrange.
                </p>
                <div className="wire-list">
                  {project.wires.map((w) => (
                    <div key={w.id}>
                      <span>
                        {project.parts.find((p) => p.id === w.a)?.label}:{w.ap}{" "}
                        ↔ {project.parts.find((p) => p.id === w.b)?.label}:
                        {w.bp}
                      </span>
                      <button
                        disabled={w.reviewed}
                        onClick={() =>
                          mutate({
                            ...project,
                            wires: project.wires.map((x) =>
                              x.id === w.id ? { ...x, reviewed: true } : x,
                            ),
                          })
                        }
                      >
                        {w.reviewed ? "Verified" : "Verify"}
                      </button>
                      <button
                        className="icon"
                        aria-label="Delete connection"
                        onClick={() =>
                          mutate({
                            ...project,
                            wires: project.wires.filter((x) => x.id !== w.id),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="component-grid">
                {!project.parts.length ? (
                  <div className="empty-small">
                    <Microchip size={42} />
                    <h3>No components yet</h3>
                    <p>
                      Capture a board and detect or mark its component regions.
                    </p>
                    <button onClick={() => setView("Camera")}>
                      Go to Camera
                    </button>
                  </div>
                ) : (
                  project.parts.map((p) => (
                    <button
                      className={`component-card ${p.id === selected ? "selected" : ""}`}
                      key={p.id}
                      onClick={() => choose(p.id)}
                    >
                      <span className="part-symbol">
                        <Microchip size={25} />
                      </span>
                      <strong>
                        {p.label}
                        <small>{p.value || "Value not identified"}</small>
                      </strong>
                      <span className="badge">
                        {p.reviewed ? "Reviewed" : "Review"}
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  ))
                )}
              </div>
            )}
          </section>
          <aside>
            <div className="aside-head">
              <h3>{part ? "Component inspector" : "Your local lab"}</h3>
              <span className="badge">{part ? part.label : "PRIVATE"}</span>
            </div>
            {part ? (
              <div className="inspector">
                <label>
                  Reference
                  <input
                    value={part.label}
                    onChange={(e) => edit({ label: e.target.value })}
                  />
                </label>
                <label>
                  Component type
                  <select
                    value={part.kind}
                    onChange={(e) => edit({ kind: e.target.value as Kind })}
                  >
                    {kinds.map((k) => (
                      <option key={k}>{k}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Value
                  <input
                    value={part.value}
                    placeholder="e.g. 10 kΩ"
                    onChange={(e) => edit({ value: e.target.value })}
                  />
                </label>
                <label>
                  Marking / part number
                  <input
                    value={part.marking}
                    placeholder="e.g. NE555P"
                    onChange={(e) => edit({ marking: e.target.value })}
                  />
                </label>
                <label>
                  Number of pins
                  <input
                    type="number"
                    min="2"
                    max="40"
                    value={part.pins}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isInteger(n) && n >= 2 && n <= 40)
                        mutate({
                          ...project,
                          parts: project.parts.map((p) =>
                            p.id === part.id ? { ...p, pins: n } : p,
                          ),
                          wires: project.wires.filter(
                            (w) =>
                              (w.a !== part.id || w.ap <= n) &&
                              (w.b !== part.id || w.bp <= n),
                          ),
                        });
                    }}
                  />
                </label>
                <div className="two-col">
                  {(["x", "y"] as const).map((axis) => (
                    <label key={axis}>
                      Schematic {axis.toUpperCase()}
                      <input
                        type="number"
                        min="70"
                        max="4000"
                        value={part[axis]}
                        onChange={(e) => {
                          const n = +e.target.value;
                          if (n >= 70 && n <= 4000) edit({ [axis]: n });
                        }}
                      />
                    </label>
                  ))}
                </div>
                <div className="toolbar">
                  <button
                    onClick={() => {
                      setView("Camera");
                      setPhotoId(part.imageId);
                    }}
                  >
                    Locate in photo
                  </button>
                  <button onClick={() => setView("Schematic")}>
                    Locate in schematic
                  </button>
                </div>
                <button onClick={() => capture(true)}>
                  <CameraIcon size={16} /> Capture close-up
                </button>
                <button onClick={() => closeInput.current?.click()}>
                  <Upload size={16} /> Upload close-up
                </button>
                {part.closeup && (
                  <img
                    className="closeup"
                    src={part.closeup}
                    alt="Component close-up"
                  />
                )}
                <button disabled={!!busy} onClick={readMarking}>
                  Read component marking
                </button>
                {part.kind === "resistor" && (
                  <details open>
                    <summary>Resistor color bands</summary>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={vertical}
                        onChange={(e) => setVertical(e.target.checked)}
                      />{" "}
                      Bands run top to bottom
                    </label>
                    <button disabled={!!busy} onClick={inspectBands}>
                      Detect bands from pixels
                    </button>
                    <div className="band-preview">
                      {bands.map((b, i) => (
                        <span
                          key={i}
                          style={{ background: hex[colors.indexOf(b)] }}
                        />
                      ))}
                    </div>
                    <div className="band-controls">
                      {bands.map((b, i) => (
                        <select
                          aria-label={`Band ${i + 1}`}
                          key={i}
                          value={b}
                          onChange={(e) =>
                            setBands(
                              bands.map((c, j) =>
                                j === i ? (e.target.value as Color) : c,
                              ),
                            )
                          }
                        >
                          {colors.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      ))}
                    </div>
                    <div className="toolbar">
                      <button onClick={() => setBands([...bands].reverse())}>
                        Reverse
                      </button>
                      <button
                        onClick={() =>
                          setBands(
                            bands.length === 4
                              ? ["brown", "black", "black", "red", "gold"]
                              : ["brown", "black", "red", "gold"],
                          )
                        }
                      >
                        {bands.length === 4 ? "5 bands" : "4 bands"}
                      </button>
                    </div>
                    <strong>
                      {decodeBands(bands) || "Check band combination"}
                    </strong>
                    <button
                      disabled={!decodeBands(bands)}
                      onClick={() => edit({ value: decodeBands(bands) })}
                    >
                      Apply resistance
                    </button>
                  </details>
                )}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={part.reviewed}
                    onChange={(e) => edit({ reviewed: e.target.checked })}
                  />{" "}
                  Identification reviewed
                </label>
                {part.marking.trim() && (
                  <a
                    className="reference"
                    href={`https://www.google.com/search?q=${encodeURIComponent(part.marking.trim() + " manufacturer datasheet pinout")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Find datasheet / pinout <ArrowUpRight size={16} />
                  </a>
                )}
                <p className="hint">
                  Reference search needs internet. Match the manufacturer and
                  exact package before assigning pins.
                </p>
                <button className="danger" onClick={removePart}>
                  <Trash2 size={16} /> Remove component
                </button>
              </div>
            ) : (
              <>
                <div className="lab-graphic">
                  <Microchip size={56} strokeWidth={1} />
                  <span>ON-DEVICE INTELLIGENCE</span>
                </div>
                <div className="lab-item">
                  <ScanLine />
                  <div>
                    <strong>See the details</strong>
                    <p>
                      Local OpenCV region detection and Tesseract marking
                      recognition.
                    </p>
                  </div>
                </div>
                <div className="lab-item">
                  <Layers />
                  <div>
                    <strong>Build the picture</strong>
                    <p>
                      Editable symbols and connections linked to your original
                      photograph.
                    </p>
                  </div>
                </div>
                <div className="lab-item">
                  <Zap />
                  <div>
                    <strong>Keep it yours</strong>
                    <p>
                      No account, cloud AI, or paid API needed to work on a
                      circuit.
                    </p>
                  </div>
                </div>
                <div className="note">
                  Photography reveals visible features, not hidden electrical
                  connectivity. Review every inferred component and connection.
                </div>
                <div className="stats">
                  <div>
                    <strong>{project.photos.length}</strong>photos
                  </div>
                  <div>
                    <strong>{project.parts.length}</strong>components
                  </div>
                  <div>
                    <strong>{project.wires.length}</strong>connections
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>
        {(busy || message) && (
          <div className={`status ${busy ? "processing" : ""}`} role="status">
            {busy ? <span className="spinner" /> : <Check size={17} />}
            <span>{busy || message}</span>
            {!busy && (
              <button
                aria-label="Dismiss status"
                onClick={() => setMessage("")}
              >
                ×
              </button>
            )}
          </div>
        )}
        {ocr && (
          <details className="ocr-output">
            <summary>Recognized text</summary>
            <pre>{ocr}</pre>
          </details>
        )}
        <footer>
          <span>
            CIRCUITVISION <i> / </i> Made for the workbench.
          </span>
          <button onClick={exportProject}>Export project</button>
          <button onClick={() => importInput.current?.click()}>
            Import project
          </button>
        </footer>
      </main>
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void run(() => readFile(e.target.files?.[0]));
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          void run(() => readFile(e.target.files?.[0]));
          e.target.value = "";
        }}
      />
      <input
        ref={closeInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void run(() => readFile(e.target.files?.[0], true));
          e.target.value = "";
        }}
      />
      <input ref={closeCameraInput} type="file" accept="image/*" capture="environment" hidden onChange={e=>{void run(()=>readFile(e.target.files?.[0],true));e.target.value="";}} />
      <input
        ref={importInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f)
            void run(async () => {
              if (f.size > 100 * 1024 * 1024)
                throw new Error("Project is too large.");
              const p = validateProject(JSON.parse(await f.text()));
              mutate(p);
              setPhotoId(p.photos[0]?.id || "");
              setSelected("");
              setPin(null);
              setMessage("Project imported. Save to keep it on this device.");
            });
          e.target.value = "";
        }}
      />
      {library && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Saved projects"
          >
            <div className="aside-head">
              <h2>Your projects</h2>
              <button onClick={() => setLibrary(null)}>Close</button>
            </div>
            <p>Save your current changes before switching projects.</p>
            {library.map((p) => (
              <button
                className="project-row"
                key={p.id}
                onClick={() => {
                  mutate(p);
                  setPhotoId(p.photos[0]?.id || "");
                  setSelected("");
                  setLibrary(null);
                  setSaved(true);
                }}
              >
                <FolderOpen size={20} />
                <span>
                  {p.name}
                  <small>
                    {p.parts.length} components ·{" "}
                    {new Date(p.updated).toLocaleDateString()}
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
            <button
              onClick={() => {
                mutate(fresh());
                setPhotoId("");
                setSelected("");
                setLibrary(null);
              }}
            >
              <Plus size={16} /> New project
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
