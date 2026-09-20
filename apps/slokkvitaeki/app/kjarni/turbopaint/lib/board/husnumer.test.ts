import assert from "node:assert/strict";
import { test } from "node:test";
import { lesaHusnumer, lesaNumerMerkimida, siaHusnumer } from "../../../../api/turbopaint/husnumer";

const L = (...labels: string[]) => labels.map((label) => ({ label }));
const nofn = (r: { label: string }[]) => r.map((x) => x.label.split(" (")[0]);

test("reads the house number that follows a street name", () => {
  assert.deepEqual(lesaHusnumer("Fiskislóð 41"), { nr: 41, stafur: "" });
  assert.deepEqual(lesaHusnumer("Ármúli 13a"), { nr: 13, stafur: "a" });
  assert.deepEqual(lesaHusnumer("Skútuvogur 4, 104 Reykjavík"), { nr: 4, stafur: "" });
  assert.equal(lesaHusnumer("Fiskislóð"), null);
  assert.equal(lesaHusnumer("101"), null);
});

test("reads single numbers, letters and ranges from a result label", () => {
  assert.deepEqual(lesaNumerMerkimida("Fiskislóð 41 (101) - L 209698"), { fra: 41, fraStafur: "", til: 41, tilStafur: "" });
  assert.deepEqual(lesaNumerMerkimida("Skútuvogur 4A (104) - L 105167"), { fra: 4, fraStafur: "a", til: 4, tilStafur: "a" });
  assert.deepEqual(lesaNumerMerkimida("Laugavegur 4-6 (101)"), { fra: 4, fraStafur: "", til: 6, tilStafur: "" });
  assert.deepEqual(lesaNumerMerkimida("Hverfisgata 59-59A (101)"), { fra: 59, fraStafur: "", til: 59, tilStafur: "a" });
  assert.equal(lesaNumerMerkimida("Ármúli (426)"), null);
  assert.equal(lesaNumerMerkimida("Laugavegur leikvöllur (105)"), null);
});

test("a typed number shows only that number — real result sets from Landeignaskrá", () => {
  assert.deepEqual(nofn(siaHusnumer(L("Skútuvogur 4A (104)", "Skútuvogur 4 (104)"), "Skútuvogur 4")), ["Skútuvogur 4"]);
  assert.deepEqual(nofn(siaHusnumer(L("Ármúli 13A (108)", "Ármúli 13 (108)", "Ármúli (426)", "Ármúli (551)"), "Ármúli 13")), ["Ármúli 13"]);
  assert.deepEqual(nofn(siaHusnumer(L("Hverfisgata 82 (101)", "Hverfisgata 59-59A (101)"), "Hverfisgata 82")), ["Hverfisgata 82"]);
  assert.deepEqual(nofn(siaHusnumer(L("Laugavegur 4 (101)", "Laugavegur 4-6 (101)", "Laugavegur leikvöllur (105)"), "Laugavegur 4")), ["Laugavegur 4"]);
});

test("the letter is respected when typed", () => {
  const r = L("Skútuvogur 4A (104)", "Skútuvogur 4 (104)");
  assert.deepEqual(nofn(siaHusnumer(r, "Skútuvogur 4a")), ["Skútuvogur 4A"]);
  assert.deepEqual(nofn(siaHusnumer(r, "Skútuvogur 4b")), []);
});

test("without an exact hit: lettered variants and ranges covering the number, otherwise nothing", () => {
  assert.deepEqual(nofn(siaHusnumer(L("Ármúli 13A (108)", "Ármúli 13B (108)", "Ármúli 15 (108)"), "Ármúli 13")), ["Ármúli 13A", "Ármúli 13B"]);
  assert.deepEqual(nofn(siaHusnumer(L("Laugavegur 4-6 (101)", "Laugavegur 8 (101)"), "Laugavegur 5")), ["Laugavegur 4-6"]);
  assert.deepEqual(nofn(siaHusnumer(L("Hverfisgata 59-59A (101)"), "Hverfisgata 59")), ["Hverfisgata 59-59A"]);
  assert.deepEqual(siaHusnumer(L("Fiskislóð 41 (101)", "Fiskislóð 43 (101)"), "Fiskislóð 4"), []);
});

test("no number typed: the list is left alone", () => {
  const r = L("Fiskislóð 41 (101)", "Fiskislóð 43 (101)");
  assert.equal(siaHusnumer(r, "Fiskislóð").length, 2);
});
