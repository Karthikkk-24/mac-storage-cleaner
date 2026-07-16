import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAllowlistedRoots,
  isPathSafeToDelete,
  type SafetyContext,
} from "./guard.js";

const ctx: SafetyContext = {
  home: "/Users/testuser",
  tmpdir: "/var/folders/xx/tmpdir",
  uid: 501,
};

describe("isPathSafeToDelete", () => {
  it("rejects empty and relative paths", () => {
    expect(isPathSafeToDelete("", ctx).safe).toBe(false);
    expect(isPathSafeToDelete("Library/Caches/foo", ctx).safe).toBe(false);
  });

  it("rejects System and other absolute deny prefixes", () => {
    expect(isPathSafeToDelete("/System/Library/CoreServices", ctx).safe).toBe(
      false,
    );
    expect(isPathSafeToDelete("/usr/bin/ls", ctx).safe).toBe(false);
    expect(isPathSafeToDelete("/Library/Preferences", ctx).safe).toBe(false);
    expect(isPathSafeToDelete("/Applications/Safari.app", ctx).safe).toBe(
      false,
    );
  });

  it("rejects user Documents / Desktop / Downloads", () => {
    expect(
      isPathSafeToDelete("/Users/testuser/Documents/report.pdf", ctx).safe,
    ).toBe(false);
    expect(
      isPathSafeToDelete("/Users/testuser/Desktop/notes.txt", ctx).safe,
    ).toBe(false);
    expect(
      isPathSafeToDelete("/Users/testuser/Downloads/installer.dmg", ctx).safe,
    ).toBe(false);
  });

  it("rejects secret/config dirs", () => {
    expect(isPathSafeToDelete("/Users/testuser/.ssh/id_rsa", ctx).safe).toBe(
      false,
    );
    expect(isPathSafeToDelete("/Users/testuser/.aws/credentials", ctx).safe).toBe(
      false,
    );
    expect(
      isPathSafeToDelete("/Users/testuser/.config/something", ctx).safe,
    ).toBe(false);
  });

  it("rejects path traversal after normalize", () => {
    const sneaky = path.normalize(
      "/Users/testuser/Library/Caches/../../../etc/passwd",
    );
    // After normalize this becomes /etc/passwd — not under allowlist
    expect(isPathSafeToDelete(sneaky, ctx).safe).toBe(false);
  });

  it("rejects null bytes", () => {
    expect(
      isPathSafeToDelete("/Users/testuser/Library/Caches/foo\0bar", ctx).safe,
    ).toBe(false);
  });

  it("allows paths under Library/Caches", () => {
    const r = isPathSafeToDelete(
      "/Users/testuser/Library/Caches/com.example.app/cache.db",
      ctx,
    );
    expect(r.safe).toBe(true);
  });

  it("allows Xcode DerivedData", () => {
    const r = isPathSafeToDelete(
      "/Users/testuser/Library/Developer/Xcode/DerivedData/MyApp-abc",
      ctx,
    );
    expect(r.safe).toBe(true);
  });

  it("allows npm cache", () => {
    const r = isPathSafeToDelete(
      "/Users/testuser/.npm/_cacache/content-v2/sha512/ab",
      ctx,
    );
    expect(r.safe).toBe(true);
  });

  it("allows Trash", () => {
    const r = isPathSafeToDelete("/Users/testuser/.Trash/old-file.txt", ctx);
    expect(r.safe).toBe(true);
  });

  it("allows tmpdir and /tmp", () => {
    expect(
      isPathSafeToDelete("/var/folders/xx/tmpdir/some-temp", ctx).safe,
    ).toBe(true);
    expect(isPathSafeToDelete("/tmp/user-temp-file", ctx).safe).toBe(true);
  });

  it("rejects paths under home but outside allowlist", () => {
    expect(isPathSafeToDelete("/Users/testuser/code/project", ctx).safe).toBe(
      false,
    );
    expect(
      isPathSafeToDelete("/Users/testuser/Library/Preferences/foo.plist", ctx)
        .safe,
    ).toBe(false);
  });

  it("rejects home directory itself", () => {
    expect(isPathSafeToDelete("/Users/testuser", ctx).safe).toBe(false);
  });

  it("getAllowlistedRoots includes expected entries", () => {
    const roots = getAllowlistedRoots(ctx);
    expect(roots).toContain(
      path.join(ctx.home, "Library", "Caches"),
    );
    expect(roots).toContain(path.join(ctx.home, ".Trash"));
    expect(roots).toContain(ctx.tmpdir);
  });

  it("works with real homedir context shape", () => {
    const real: SafetyContext = {
      home: os.homedir(),
      tmpdir: os.tmpdir(),
      uid: typeof process.getuid === "function" ? process.getuid() : -1,
    };
    const caches = path.join(real.home, "Library", "Caches", "test-item");
    expect(isPathSafeToDelete(caches, real).safe).toBe(true);
    expect(
      isPathSafeToDelete(path.join(real.home, "Documents", "x"), real).safe,
    ).toBe(false);
  });
});
