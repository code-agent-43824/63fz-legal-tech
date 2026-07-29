import assert from "node:assert/strict";
import test from "node:test";
import { extractLawReferences, formatLawReferenceLabel } from "../src/lib/law-references";

// The strings below are real fragments of the imported 63-FZ text taken from the public reader.
const WITH_SPELLED_DATE_AND_TITLE =
  'в порядке, установленном Федеральным законом от 27 июля 2006 года N 149-ФЗ "Об информации, ' +
  'информационных технологиях и о защите информации". При этом в случае, если физическое лицо';
const WITH_DOTTED_DATE_NO_TITLE =
  "начиная с тридцати дней со дня официального опубликования Федерального закона от 04.08.2023 " +
  "N 457-ФЗ (пункт 5 статьи 4 Федерального закона от 04.08.2023 N 457-ФЗ).";
const WITH_PREPOSITIONAL_CASE =
  'субъектов национальной платежной системы, указанных в Федеральном законе от 27 июня 2011 года ' +
  'N 161-ФЗ "О национальной платежной системе" (за исключением организаций почтовой связи)';

test("extracts a reference with a spelled date and the official title", () => {
  const [reference, ...rest] = extractLawReferences(WITH_SPELLED_DATE_AND_TITLE);

  assert.equal(rest.length, 0);
  assert.equal(reference.number, "149-ФЗ");
  assert.equal(reference.date, "2006-07-27");
  assert.equal(reference.dateLabel, "27 июля 2006 года");
  assert.equal(reference.title, "Об информации, информационных технологиях и о защите информации");
  assert.equal(reference.id, "law-149-фз");
});

test("extracts a reference with a dotted date and no title, deduplicated by number", () => {
  const references = extractLawReferences(WITH_DOTTED_DATE_NO_TITLE);

  assert.equal(references.length, 1, "the same law twice in one fragment is one reference");
  assert.equal(references[0].number, "457-ФЗ");
  assert.equal(references[0].date, "2023-08-04");
  assert.equal(references[0].title, null);
});

test("handles the prepositional case used in the official text", () => {
  const [reference] = extractLawReferences(WITH_PREPOSITIONAL_CASE);

  assert.equal(reference.number, "161-ФЗ");
  assert.equal(reference.title, "О национальной платежной системе");
});

test("never reports the law itself as an external reference", () => {
  const text =
    "в соответствии с настоящим Федеральным законом и Федеральным законом от 06.04.2011 N 63-ФЗ";

  assert.deepEqual(extractLawReferences(text), []);
});

test("ignores prose that is not a numbered federal-law reference", () => {
  const text =
    "Настоящий Федеральный закон регулирует отношения в области использования электронных подписей.";

  assert.deepEqual(extractLawReferences(text), []);
});

test("prefers the occurrence that states the official title", () => {
  const text =
    "Федерального закона от 27.07.2006 N 149-ФЗ. Далее: Федеральным законом от 27 июля 2006 года " +
    'N 149-ФЗ "Об информации, информационных технологиях и о защите информации".';
  const [reference] = extractLawReferences(text);

  assert.equal(reference.title, "Об информации, информационных технологиях и о защите информации");
});

test("returns several references sorted by law number", () => {
  const text =
    'Федеральным законом от 10 июля 2002 года N 86-ФЗ "О Центральном банке Российской Федерации ' +
    '(Банке России)" и Федеральным законом от 27 июля 2006 года N 149-ФЗ "Об информации, ' +
    'информационных технологиях и о защите информации" и Федеральным законом от 4 мая 2011 года ' +
    'N 99-ФЗ "О лицензировании отдельных видов деятельности"';

  assert.deepEqual(
    extractLawReferences(text).map((reference) => reference.number),
    ["86-ФЗ", "99-ФЗ", "149-ФЗ"],
  );
});

test("formats a label with the title when the official text provides one", () => {
  const [withTitle] = extractLawReferences(WITH_SPELLED_DATE_AND_TITLE);
  const [withoutTitle] = extractLawReferences(WITH_DOTTED_DATE_NO_TITLE);

  assert.equal(
    formatLawReferenceLabel(withTitle),
    "149-ФЗ «Об информации, информационных технологиях и о защите информации»",
  );
  assert.equal(formatLawReferenceLabel(withoutTitle), "457-ФЗ от 04.08.2023");
});

test("empty and reference-free input is safe", () => {
  assert.deepEqual(extractLawReferences(""), []);
  assert.deepEqual(extractLawReferences("   "), []);
});
