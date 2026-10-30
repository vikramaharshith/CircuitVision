import { openDB } from "idb";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Project, validateProject } from "./model";
const db = openDB("circuitvision", 1, {
  upgrade(db) {
    db.createObjectStore("projects", { keyPath: "id" });
  },
});
export async function saveProject(p: Project) {
  const value = { ...p, updated: new Date().toISOString() };
  if (Capacitor.isNativePlatform())
    await Filesystem.writeFile({
      path: `projects/${p.id}.json`,
      directory: Directory.Data,
      data: JSON.stringify(value),
      encoding: Encoding.UTF8,
      recursive: true,
    });
  else await (await db).put("projects", value);
}
export async function listProjects(): Promise<Project[]> {
  if (!Capacitor.isNativePlatform())
    return (await (await db).getAll("projects")).sort((a, b) =>
      b.updated.localeCompare(a.updated),
    );
  let names;
  try {
    names = await Filesystem.readdir({
      path: "projects",
      directory: Directory.Data,
    });
  } catch {
    return [];
  }
  const projects: Project[] = [];
  for (const f of names.files) {
    if (!f.name.endsWith(".json")) continue;
    const r = await Filesystem.readFile({
      path: `projects/${f.name}`,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    projects.push(validateProject(JSON.parse(r.data as string)));
  }
  return projects.sort((a, b) => b.updated.localeCompare(a.updated));
}
export async function exportFile(name: string, data: string, mime: string) {
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: `exports/${name}`,
      directory: Directory.Cache,
      data,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    await Share.share({ title: name, files: [file.uri] });
  } else {
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
