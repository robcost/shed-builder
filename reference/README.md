# Reference — original prototype

`shed-configurator-v2.jsx` is the original single-file React + Three.js prototype
that this app was built from. It is kept here as the **golden reference**: the
engine in [`lib/shed/`](../lib/shed) was ported from it verbatim (types added,
deprecated Three.js APIs updated, logic unchanged), so this file is the source of
truth for parity if the geometry, validation or scene output ever needs checking.

It is not imported or built by the app — it's history and documentation only.
