import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDirectory = path.join(root, "tests");
const files = (await readdir(testDirectory))
  .filter((file) => file.endsWith(".test.ts"))
  .sort()
  .map((file) => path.join("tests", file));

if (files.length === 0) throw new Error(`未找到测试文件: ${testDirectory}`);

const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
