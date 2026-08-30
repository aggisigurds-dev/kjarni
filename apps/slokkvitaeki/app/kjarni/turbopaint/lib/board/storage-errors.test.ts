import assert from "node:assert/strict";
import { test } from "node:test";
import { isDuplicateStorageError } from "./storage-errors";

test("live duplicate POST body is not a failed upload", () => {
  // Captured from production: HTTP 400, JSON statusCode 409.
  const live = {
    statusCode: "409",
    error: "Duplicate",
    message: "The resource already exists",
    code: "KeyAlreadyExists",
  };
  assert.equal(isDuplicateStorageError(live), true);
});

test("plain 409 and exist-in-message still count as already uploaded", () => {
  assert.equal(isDuplicateStorageError({ status: 409, message: "conflict" }), true);
  assert.equal(isDuplicateStorageError({ message: "already exists" }), true);
  assert.equal(isDuplicateStorageError(null), false);
  assert.equal(isDuplicateStorageError({ message: "Bucket not found", statusCode: "404" }), false);
});
