import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, ".tools", "i18n-tests");
const program = ts.createProgram(["i18n", "format", "api"].map(name => join(root, "frontend", "lib", `${name}.ts`)), {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.CommonJS,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  rootDir: join(root, "frontend"),
  outDir: output,
  resolveJsonModule: true,
  esModuleInterop: true,
  skipLibCheck: true,
  noEmitOnError: true,
});
const diagnostics = ts.getPreEmitDiagnostics(program);
assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: value => value, getCurrentDirectory: () => root, getNewLine: () => "\n",
}));
assert.equal(program.emit().emitSkipped, false);
const require = createRequire(import.meta.url);
const { translate, getLocale } = require(join(output, "lib", "i18n.js"));
const { formatDate, relativeTime, roleLabel, weekdayName } = require(join(output, "lib", "format.js"));
const { ApiError, errorMessage } = require(join(output, "lib", "api.js"));
const en = JSON.parse(readFileSync(join(root, "frontend/locales/en.json"), "utf8"));
const vi = JSON.parse(readFileSync(join(root, "frontend/locales/vi.json"), "utf8"));

test("switching both directions translates UI and preserves unknown user content", () => {
  for (const [language, expected] of [["en", "Home"], ["vi", "Trang chủ"], ["en", "Home"]]) {
    assert.equal(translate("Trang chủ", undefined, language), expected);
    assert.equal(translate("My custom course: C++ & AI", undefined, language), "My custom course: C++ & AI");
  }
  assert.equal(translate("Start attempt", undefined, "vi"), "Bắt đầu làm bài");
  assert.equal(translate("Start attempt", undefined, "en"), "Start attempt");
});

test("interpolation preserves names, punctuation and zero values", () => {
  assert.equal(translate("Đã thu hồi phiên của {0}.", {0: "Nguyễn An {admin}"}, "en"), "Revoked the session for Nguyễn An {admin}.");
  assert.equal(translate("{0} thẻ", {0: 0}, "en"), "0 tags");
  assert.equal(translate("Question {0} of {1}", {0: 1, 1: 5}, "vi"), "Câu hỏi 1 trên 5");
});

test("existing state messages can be translated after a language change", () => {
  const message = "Đã thu hồi phiên của Nguyễn An.";
  assert.equal(translate(message, undefined, "en"), "Revoked the session for Nguyễn An.");
  assert.equal(translate(message, undefined, "vi"), message);
  assert.equal(translate("Đã tạo/đặt lại 12 tài khoản. Các dòng khác được bỏ qua.", undefined, "en"), "Created or reset 12 accounts. Other rows were skipped.");
});

test("API errors translate with their HTTP status and error code intact", () => {
  assert.equal(translate(errorMessage(new ApiError("invalid_credentials", 401, null)), undefined, "en"), "Incorrect login ID or password.");
  assert.equal(translate(errorMessage(new ApiError("unknown_error", 403, null)), undefined, "en"), "Request failed (HTTP 403, code: unknown_error). Please check your input and try again.");
  assert.equal(translate(errorMessage(new ApiError("", 422, null)), undefined, "en"), "Request failed (HTTP 422). Please check your input and try again.");
  assert.match(translate(errorMessage(new ApiError("failure", 503, null)), undefined, "en"), /^Server error \(HTTP 503\)/);
});

test("dates, relative time, weekdays and roles follow the selected language", () => {
  assert.equal(getLocale("en"), "en-US");
  assert.equal(getLocale("vi"), "vi-VN");
  assert.notEqual(formatDate("2026-11-10T12:00:00Z", "en-US"), formatDate("2026-11-10T12:00:00Z", "vi-VN"));
  assert.equal(formatDate("invalid", "en-US"), "—");
  assert.equal(roleLabel("teacher", "en"), "Instructor");
  assert.equal(roleLabel("teacher", "vi"), "Giảng viên");
  assert.equal(weekdayName(0, "en"), "Monday");
  assert.equal(weekdayName(0, "vi"), "Thứ hai");
  assert.match(relativeTime(new Date(Date.now() - 5 * 60000).toISOString(), "en-US"), /5 minutes ago/);
});

test("catalog translations retain every interpolation placeholder", () => {
  const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const dictionary of [en, vi]) for (const [key, value] of Object.entries(dictionary)) {
    assert.ok(value.length > 0, `Empty translation: ${key}`);
    assert.deepEqual(placeholders(value), placeholders(key), `Mismatched placeholders: ${key}`);
  }
});

test("every literal translation key used by the UI has a catalog entry", () => {
  function checkDirectory(directory) {
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      if (["node_modules", ".next", ".next-dev", "locales"].includes(entry.name)) continue;
      const file = join(directory, entry.name);
      if (entry.isDirectory()) { checkDirectory(file); continue; }
      if (!file.endsWith(".tsx")) continue;
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(source) === "tr" && ts.isStringLiteral(node.arguments[0])) {
          const key = node.arguments[0].text;
          assert.ok(Object.hasOwn(en, key) || Object.hasOwn(vi, key), `Missing translation in ${resolve(file)}: ${key}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  checkDirectory(join(root, "frontend"));
});
