type Level = "info" | "warn" | "error";

const icons: Record<Level, string> = { info: "·", warn: "!", error: "x" };

function write(level: Level, msg: string) {
  const t = new Date().toLocaleTimeString("en-IN", { hour12: false });
  const line = `${t} ${icons[level]} ${msg}`;
  if (level === "error") console.error(line);
  else console.log(line);
}

export const log = {
  info: (m: string) => write("info", m),
  warn: (m: string) => write("warn", m),
  error: (m: string) => write("error", m),
};
