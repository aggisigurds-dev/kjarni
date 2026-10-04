import assert from "node:assert/strict";
import { test } from "node:test";
import { finnaLinu } from "./pdf-linur";
import type { Strik } from "./pdf-veggir";

test("finnaLinu: smellt á skálínu → öll strikalínan (bútar með bilum), ekki aðrar línur", () => {
  const ska: Strik[] = [];
  for (let i = 0; i < 10; i++) ska.push([i * 20, i * 20, i * 20 + 12, i * 20 + 12]); // strikuð 45° lína
  const flokkar: Record<string, Strik[]> = {
    "0.24": [...ska, [0, 100, 200, 100] /* lárétt lína sem skálínan sker */, [300, 300, 400, 400] /* samsíða en langt frá */],
    "0.48": [[0, 0, 0, 200]],
  };
  const r = finnaLinu(flokkar, [86, 87], 3);
  assert.ok(r);
  assert.equal(r.flokkur, "0.24");
  assert.equal(r.strik.length, 10, "allir tíu bútarnir");
  assert.ok(!r.strik.some((s) => s[1] === 100 && s[3] === 100), "lárétta línan fylgir ekki");
  assert.ok(!r.strik.some((s) => s[0] === 300), "fjarlæg samsíða lína fylgir ekki");
});

test("finnaLinu: ekkert innan vikmarka → null", () => {
  assert.equal(finnaLinu({ "0.24": [[0, 0, 100, 0]] }, [50, 20], 3), null);
});

test("finnaLinu: samsíða lína rétt hjá (tvöfaldur veggur) fylgir ekki", () => {
  const r = finnaLinu({ "0.48": [[0, 0, 100, 0], [0, 4, 100, 4]] }, [50, 0.5], 2);
  assert.ok(r);
  assert.equal(r.strik.length, 1);
});
