-- PostgreSQL truncates identifiers at 63 bytes. The two original explicit index names exceeded that
-- limit, while Prisma's schema engine uses its own 63-byte-safe generated names. Normalize the
-- existing indexes so migrate diff reports no drift on both existing and freshly migrated databases.
ALTER INDEX "FragmentChangeExplanation_stableId_fromVersionId_toVersionId_ke"
RENAME TO "FragmentChangeExplanation_stableId_fromVersionId_toVersionI_key";

ALTER INDEX "ChangeFeedback_stableId_fromVersionId_toVersionId_kind_clientHa"
RENAME TO "ChangeFeedback_stableId_fromVersionId_toVersionId_kind_clie_key";
