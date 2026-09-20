import assert from "node:assert/strict";
import test from "node:test";
import {
  chalkboardStoragePaths,
  extensionForChalkboardFile,
  parseIncomingChalkboardPath,
} from "../lib/chalkboard-upload-paths.ts";

const assetGroupId = "123e4567-e89b-42d3-a456-426614174000";

test("normal PNG uploads generate a path accepted by secure validation", () => {
  const extension = extensionForChalkboardFile("20260919_tpg_whiteboard.png");
  const paths = chalkboardStoragePaths("20260919_tpg-whiteboard", assetGroupId);
  const incomingPath = `${paths.incoming}.${extension}`;

  assert.equal(extension, "png");
  assert.equal(incomingPath, `library/20260919_tpg-whiteboard/${assetGroupId}/v1/incoming.png`);
  assert.deepEqual(parseIncomingChalkboardPath(incomingPath), {
    storageSlug: "20260919_tpg-whiteboard",
    assetGroupId,
    extension: "png",
  });
});

test("secure validation rejects obsolete, malformed, and traversal paths", () => {
  assert.equal(parseIncomingChalkboardPath(`library/20260919/tpg-whiteboard/${assetGroupId}/v1/incoming.png`), null);
  assert.equal(parseIncomingChalkboardPath(`library/20260919_tpg-whiteboard/not-a-uuid/v1/incoming.png`), null);
  assert.equal(parseIncomingChalkboardPath(`library/../${assetGroupId}/v1/incoming.png`), null);
  assert.equal(parseIncomingChalkboardPath(`library/20260919_tpg-whiteboard/${assetGroupId}/v1/incoming.exe`), null);
});
