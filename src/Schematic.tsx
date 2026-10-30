import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { Part, Project } from "./model";
import { pinPosition } from "./model";
export function Symbol({ p }: { p: Part }) {
  const base = { fill: "none", stroke: "currentColor", strokeWidth: 2 };
  return (
    <g {...base}>
      {p.kind === "resistor" ? (
        <>
          <path d="M-55 0H-30 M30 0H55" />
          <rect x="-30" y="-12" width="60" height="24" />
        </>
      ) : p.kind === "capacitor" ? (
        <path d="M-55 0H-7 M7 0H55 M-7 -22V22 M7 -22V22" />
      ) : p.kind === "diode" ? (
        <>
          <path d="M-55 0H-20 M20 0H55 M20 -20V20" />
          <path d="M-20 -20L20 0L-20 20Z" />
        </>
      ) : (
        <rect
          x="-38"
          y={-Math.max(24, Math.ceil(p.pins / 2) * 11)}
          width="76"
          height={Math.max(48, Math.ceil(p.pins / 2) * 22)}
        />
      )}
    </g>
  );
}
export function Schematic({
  project,
  selected,
  select,
  connect,
}: {
  project: Project;
  selected: string;
  select: (id: string) => void;
  connect: (id: string, pin: number) => void;
}) {
  const w = Math.max(900, ...project.parts.map((p) => p.x + 140)),
    h = Math.max(540, ...project.parts.map((p) => p.y + 120));
  return (
    <TransformWrapper minScale={0.3} maxScale={5} initialScale={0.8}>
      <TransformComponent wrapperClass="schematic-viewport">
        <svg
          id="schematic-svg"
          xmlns="http://www.w3.org/2000/svg"
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          style={{ background: "#141c20", color: "#d6e4df" }}
        >
          <defs>
            <pattern
              id="grid"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r=".8" fill="#30413e" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          {project.wires.map((edge) => {
            const a = project.parts.find((p) => p.id === edge.a),
              b = project.parts.find((p) => p.id === edge.b);
            if (!a || !b) return null;
            const start = pinPosition(a, edge.ap),
              end = pinPosition(b, edge.bp);
            return (
              <path
                key={edge.id}
                d={`M${start.x} ${start.y}H${(start.x + end.x) / 2}V${end.y}H${end.x}`}
                fill="none"
                stroke={edge.reviewed ? "#7be1b9" : "#e9b667"}
                strokeWidth="2"
                strokeDasharray={edge.reviewed ? undefined : "6 4"}
              />
            );
          })}
          {project.parts.map((p) => (
            <g
              key={p.id}
              style={{ color: selected === p.id ? "#91f2c8" : "#d6e4df" }}
            >
              <g
                transform={`translate(${p.x},${p.y})`}
                onClick={() => select(p.id)}
                role="button"
                tabIndex={0}
                aria-label={`Select ${p.label}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") select(p.id);
                }}
              >
                <rect
                  x="-48"
                  y="-40"
                  width="96"
                  height="80"
                  rx="10"
                  fill={selected === p.id ? "#23473e" : "#141c20"}
                />
                <Symbol p={p} />
                <text
                  textAnchor="middle"
                  y="-52"
                  fill="currentColor"
                  fontSize="15"
                  fontFamily="sans-serif"
                >
                  {p.label}
                </text>
                <text
                  textAnchor="middle"
                  y="58"
                  fill="currentColor"
                  fontSize="12"
                  fontFamily="sans-serif"
                >
                  {p.value || p.kind}
                </text>
              </g>
              {Array.from({ length: p.pins }, (_, i) => {
                const pt = pinPosition(p, i + 1);
                return (
                  <g
                    key={i}
                    onClick={() => connect(p.id, i + 1)}
                    role="button"
                    tabIndex={0}
                    aria-label={`${p.label} pin ${i + 1}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") connect(p.id, i + 1);
                    }}
                  >
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="11"
                      fill="#141c20"
                      stroke="#7be1b9"
                    />
                    <text
                      x={pt.x}
                      y={pt.y + 4}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#b7d4c8"
                    >
                      {i + 1}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </TransformComponent>
    </TransformWrapper>
  );
}
