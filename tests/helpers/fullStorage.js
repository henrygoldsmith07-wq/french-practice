// Test helper: the full storage surface (light facade + heavy research
// half) merged under one `storage` object for node tests.
//
// storage.js deliberately ships only the light CRUD half of the research
// domain — the measurement stack (placement/progression/corpus/comprehension
// validation, intelligibility, evidenceStudy, studyProtocol) lives in
// researchStoreHeavy.js, which browser code imports dynamically so it never
// rides the boot graph. Node tests have no boot graph, so they get BOTH
// halves merged: heavy wins on overlapping names, everything else comes
// from the facade.
//
// IMPORTANT: pass the SAME cache-busting query to both imports (the `?q`
// argument) so both halves share one storageCore module instance and one
// localStorage fixture — a mismatched query would silently fork state.

export async function importFullStorage(q) {
  const [light, heavy] = await Promise.all([
    import(`../../src/lib/storage.js?${q}`),
    import(`../../src/lib/stores/researchStoreHeavy.js?${q}`),
  ]);
  return { ...light, ...heavy };
}
