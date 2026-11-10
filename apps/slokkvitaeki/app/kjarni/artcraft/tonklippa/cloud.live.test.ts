/** Aðgangsreglur skýjageymslunnar prófaðar á raunverulegri Supabase (býr til
 *  og eyðir prufuskrám í tveimur nýjum skúffum). Keyrt handvirkt:
 *    TONKLIPPA_CLOUD_CHECK=1 node --import tsx --test app/kjarni/artcraft/tonklippa/cloud.live.test.ts
 *  Án umhverfisbreytunnar er prófinu sleppt, svo venjuleg prófun snertir ekki netið. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { cloudDelete, cloudGetBlob, cloudGetJson, cloudList, cloudPutBlob, cloudPutJson, lockerFolder, newLockerKey } from "./cloud.ts";
import { SUPABASE_KEY, SUPABASE_URL } from "../../../lib/supabase.ts";

test("a locker only opens with its own key", { skip: !process.env.TONKLIPPA_CLOUD_CHECK }, async () => {
  const A = newLockerKey(), B = newLockerKey();
  const fa = await lockerFolder(A);
  const ok = (name: string, cond: boolean, extra = "") => assert.ok(cond, `${name} ${extra}`);
  const raw = (key: string | null, path: string, init: RequestInit = {}) =>
    fetch(`${SUPABASE_URL}/storage/v1/${path}`, { ...init, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, ...(key ? { "x-tk-key": key } : {}), ...(init.headers as object) } });
  const json = { "Content-Type": "application/json" };
  await cloudPutJson(A, "p/abc12345.json", { id: "abc12345", name: "Prófun", n: 1 });
  await cloudPutJson(A, "p/abc12345.json", { id: "abc12345", name: "Prófun", n: 2 });
  ok("owner reads back the upserted JSON", (await cloudGetJson<{ n: number }>(A, "p/abc12345.json"))?.n === 2);
  await cloudPutBlob(A, "t/abc12345/t1", new Blob([new Uint8Array(5000)], { type: "audio/mpeg" }));
  ok("owner reads the track blob", (await cloudGetBlob(A, "t/abc12345/t1"))?.size === 5000);
  ok("owner lists projects", (await cloudList(A, "p")).map((e) => e.name).join() === "abc12345.json");
  ok("owner lists tracks", (await cloudList(A, "t/abc12345")).map((e) => e.name).join() === "t1");
  let r = await raw(B, `object/authenticated/tonklippa/${fa}/p/abc12345.json`);
  ok("other key cannot read", r.status >= 400, String(r.status));
  r = await raw(null, `object/authenticated/tonklippa/${fa}/p/abc12345.json`);
  ok("no key cannot read", r.status >= 400, String(r.status));
  r = await raw(B, "object/list/tonklippa", { method: "POST", headers: json, body: JSON.stringify({ prefix: `${fa}/p`, limit: 100 }) });
  ok("other key lists nothing in the folder", r.ok && (await r.json()).length === 0);
  r = await raw(B, "object/list/tonklippa", { method: "POST", headers: json, body: JSON.stringify({ prefix: "", limit: 100 }) });
  ok("other key cannot enumerate lockers", r.ok && (await r.json()).length === 0);
  r = await raw(null, "object/list/tonklippa", { method: "POST", headers: json, body: JSON.stringify({ prefix: "", limit: 100 }) });
  ok("no key cannot enumerate lockers", r.ok && (await r.json()).length === 0);
  r = await raw(B, `object/tonklippa/${fa}/p/evil0001.json`, { method: "POST", headers: json, body: "{}" });
  ok("other key cannot write into the folder", r.status >= 400, String(r.status));
  r = await raw(B, `object/tonklippa/${fa}/p/abc12345.json`, { method: "POST", headers: { ...json, "x-upsert": "true" }, body: "{}" });
  ok("other key cannot overwrite", r.status >= 400, String(r.status));
  r = await raw(null, `object/tonklippa/${fa}/p/evil0002.json`, { method: "POST", headers: json, body: "{}" });
  ok("no key cannot write", r.status >= 400, String(r.status));
  r = await raw(A, `object/tonklippa/${fa}/annad/skra.json`, { method: "POST", headers: json, body: "{}" });
  ok("owner cannot write outside the p/ and t/ layout", r.status >= 400, String(r.status));
  r = await raw(A, `object/tonklippa/${fa}/t/abc12345/t2`, { method: "POST", headers: { "Content-Type": "text/html" }, body: "<b>x</b>" });
  ok("disallowed file type is refused", r.status >= 400, String(r.status));
  r = await raw(B, "object/tonklippa", { method: "DELETE", headers: json, body: JSON.stringify({ prefixes: [`${fa}/p/abc12345.json`] }) });
  ok("other key deletes nothing", (await cloudGetJson(A, "p/abc12345.json")) !== null, String(r.status));
  await cloudDelete(A, ["p/abc12345.json", "t/abc12345/t1"]);
  ok("owner deletes", (await cloudGetJson(A, "p/abc12345.json")) === null && (await cloudList(A, "t/abc12345")).length === 0);
  ok("missing object reads as null", (await cloudGetBlob(A, "t/none/none")) === null);
});
