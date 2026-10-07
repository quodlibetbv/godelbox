# Synthetic counter project

`counter-project.json` is a constructed, credential-free fixture of the earlier starter. It lets the original counter/note acceptance tests continue exercising the real import, runtime, storage, editing, and restore paths after the default seed changes to the p5.js universe. IDs and content are synthetic; this is not a user export.

The fixture preserves the exact Vue 3.5.43 global production bundle, MIT license, and version/hash provenance previously shipped in the seed. New universe tests start from empty browser storage instead.
