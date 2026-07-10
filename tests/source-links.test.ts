import assert from "node:assert/strict";
import test from "node:test";

import { makeSafeSourceLink, parseSafeSourceLinks } from "../src/lib/source-links";

test("builds a safe source link only for https URLs", () => {
  assert.deepEqual(makeSafeSourceLink("https://publication.pravo.gov.ru/document/1", "Официально"), {
    href: "https://publication.pravo.gov.ru/document/1",
    label: "Официально",
  });
  assert.equal(makeSafeSourceLink("http://example.com"), null);
  assert.equal(makeSafeSourceLink("not a url"), null);
});

test("parses unique safe source links from editor text", () => {
  assert.deepEqual(
    parseSafeSourceLinks(
      "457-ФЗ: https://publication.pravo.gov.ru/document/0001202308040064, duplicate https://publication.pravo.gov.ru/document/0001202308040064 and unsafe http://example.com",
    ),
    [
      {
        href: "https://publication.pravo.gov.ru/document/0001202308040064",
        label: "publication.pravo.gov.ru",
      },
    ],
  );
});
