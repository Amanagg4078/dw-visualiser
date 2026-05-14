// Aggregator for the DataWeave-style standard library. Each category file
// exports a `BUILTINS` object (name → native built-in) and a `HOF_NAMES`
// array (the subset that takes a lambda and is eligible for `$`/`$$`/`$$$`
// implicit-param sugar). This file merges them.

import { BUILTINS as ARR_BUILTINS, HOF_NAMES as ARR_HOFS } from "./arrays.js";
import { BUILTINS as OBJ_BUILTINS, HOF_NAMES as OBJ_HOFS } from "./objects.js";
import { BUILTINS as STR_BUILTINS } from "./strings.js";
import { BUILTINS as NUM_BUILTINS } from "./numbers.js";
import { BUILTINS as TYPE_BUILTINS } from "./types.js";

export const BUILTINS = {
  ...ARR_BUILTINS,
  ...OBJ_BUILTINS,
  ...STR_BUILTINS,
  ...NUM_BUILTINS,
  ...TYPE_BUILTINS,
};

export const HOF_NAMES = [...ARR_HOFS, ...OBJ_HOFS];
